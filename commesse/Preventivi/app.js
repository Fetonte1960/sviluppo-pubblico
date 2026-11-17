"use strict";
// Demo only. GitHub Pages hosts this static frontend; the authorized API URL is configured explicitly.
// No Neon credentials, company identity tokens or internal secrets in the frontend.
const APP_VERSION="1.9.2";
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Public API origin is not a secret. Quote calculations and internal costs remain on Render.
const defaultApiBase = "https://preventivi-demo-api.onrender.com";
// Ignora configurazioni legacy di API arbitrarie su Pages: non inviare bearer fuori dominio TEST.
let apiBase = location.hostname==="fetonte1960.github.io"
 ? defaultApiBase : (localStorage.getItem("preventivi-demo-api") || defaultApiBase);
// In ambiente Pages i bearer possono raggiungere soltanto il backend TEST autorizzato.
function checkApiOrigin(){
 if(location.hostname==="fetonte1960.github.io" && apiBase!==defaultApiBase)
   throw Error("Per sicurezza FastPharma Access consente solo il backend Preventivi TEST.");
}
const accessClientId="fastpharma-preventivi";
const accessTransactionKey="fastpharma.preventivi.pkce.v1";
const accessRedirect=location.origin+location.pathname;
let accessToken="",accessMeta=null,localDemo=false;
function accessFeedback(message,error=false){
 const label=$("accessStatus");label.textContent=message;
 label.style.color=error?"#a12727":"#36596a";
}
function showAccess(enabled){
 $("accessGate").hidden=!enabled;
 document.querySelector("main").hidden=enabled;
 document.querySelector("header.compact-header").hidden=enabled;
}
const urlSafe=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""))
 .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function loadAccessMetadata(){
 if(accessMeta)return accessMeta;
 checkApiOrigin();
 for(let attempt=0;attempt<3;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,3000));
  try{
   const res=await fetch(apiBase+"/api/meta",{cache:"no-store",signal:AbortSignal.timeout(25000)});
   if(!res.ok)throw Error("HTTP "+res.status);
   const info=await res.json();
   if(info.authentication==="demo-local" && location.hostname!=="fetonte1960.github.io"){
    localDemo=true;accessMeta=info;return info;
   }
   if(info.authentication!=="openid-connect"||info.oidcClientId!==accessClientId||
      typeof info.oidcAuthorization!=="string"||!info.oidcAuthorization.startsWith("https://")||
      typeof info.oidcToken!=="string"||!info.oidcToken.startsWith("https://")||
      new URL(info.oidcAuthorization).origin!==new URL(info.oidcToken).origin)
     throw Error("Il servizio Preventivi non è configurato per FastPharma Access.");
   accessMeta=info;
   $("storageDescription").textContent=info.storage==="postgres"
     ? "Archivio aziendale PostgreSQL Neon: preventivi e progetti sono persistenti e riapribili dopo un riavvio."
     : "Modalità DEMO: i dati sintetici in RAM possono scomparire dopo il riavvio del servizio.";
   return info;
  }catch(e){if(attempt===2)throw e;}
 }
 throw Error("Provider FastPharma Access non disponibile.");
}
async function beginAccessLogin(){
 const button=$("accessLogin");button.disabled=true;
 accessFeedback("Collegamento al servizio di autenticazione FastPharma…");
 try{
  const info=await loadAccessMetadata();
  if(localDemo){showAccess(false);await connect();return;}
  const verifier=urlSafe(crypto.getRandomValues(new Uint8Array(32)));
  const state=urlSafe(crypto.getRandomValues(new Uint8Array(32)));
  const nonce=urlSafe(crypto.getRandomValues(new Uint8Array(32)));
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
  sessionStorage.setItem(accessTransactionKey,JSON.stringify({
   verifier,state,redirect:accessRedirect,at:Date.now(),
   picker:selectForCommesse?commesseNonce:null
  }));
  const uri=new URL(info.oidcAuthorization);
  for(const [key,value] of Object.entries({
   client_id:accessClientId,redirect_uri:accessRedirect,
   response_type:"code",response_mode:"query",scope:"openid profile preventivi",
   state,nonce,code_challenge:urlSafe(new Uint8Array(hash)),code_challenge_method:"S256"
  }))uri.searchParams.set(key,value);
  location.assign(uri.href);
 }catch(e){
  accessFeedback("Autenticazione non avviata: "+e.message,true);button.disabled=false;
 }
}
async function completeAccessLogin(){
 const params=new URLSearchParams(location.search);
 const code=params.get("code"),error=params.get("error");
 if(!code&&!error)return false;
 const raw=sessionStorage.getItem(accessTransactionKey);
 sessionStorage.removeItem(accessTransactionKey);
 let t;try{t=JSON.parse(raw||"null");}catch{t=null;}
 const returned=t?.picker && t.picker===commesseNonce
   ? "?picker=commesse&nonce="+commesseNonce : "";
 history.replaceState(null,"",location.pathname+returned+location.hash);
 if(error)throw Error("FastPharma Access: "+error);
 if(!t||t.state!==params.get("state")||t.redirect!==accessRedirect||
    typeof t.verifier!=="string"||!Number.isFinite(t.at)||
    Date.now()-t.at>10*60*1000)
   throw Error("Risposta FastPharma Access non corrispondente o scaduta.");
 const info=await loadAccessMetadata();
 const body=new URLSearchParams({
  grant_type:"authorization_code",client_id:accessClientId,
  code,redirect_uri:accessRedirect,code_verifier:t.verifier
 });
 const res=await fetch(info.oidcToken,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body,credentials:"omit",cache:"no-store"
 });
 const result=await res.json().catch(()=>({}));
 if(!res.ok||typeof result.access_token!=="string")
   throw Error("Token FastPharma Access non ricevuto ("+(result.error||res.status)+").");
 accessToken=result.access_token;
 await request("/api/auth/check");
 showAccess(false);
 accessFeedback("Sessione FastPharma Access attiva.");
 await connect();
 return true;
}
async function startAccess(){
 showAccess(true);
 $("accessLogin").onclick=()=>{void beginAccessLogin();};
 try{
  if(await completeAccessLogin())return;
  await beginAccessLogin();
 }catch(e){
  accessToken="";
  showAccess(true);
  accessFeedback("Accesso non riuscito: "+e.message,true);
  $("accessLogin").disabled=false;
 }
}
// Public demo sessions are independent; this ID is not an authentication credential.
let demoSession = localStorage.getItem("preventivi-demo-session");
if(!demoSession || !/^[0-9a-f-]{36}$/i.test(demoSession)){
  demoSession=crypto.randomUUID();
  localStorage.setItem("preventivi-demo-session",demoSession);
}
let companyId = "", quote = null, catalog = [], prices = [], batches = [], allQuotes = [], dossier = [];

/* Selettore opzionale per Gestione Commesse: restituisce solo snapshot COMMERCIALE.
   Nessuna chiave, costo interno o credenziale viene trasferito. */
const importParams=new URLSearchParams(location.search);
const commesseReturnKey="fastpharma.preventivi.commesse-picker.v1";
const requestedNonce=importParams.get("nonce")||"";
const fromCommesse=importParams.get("picker")==="commesse" &&
 /^[a-f0-9]{32}$/.test(requestedNonce) &&
 /^https:\/\/fetonte1960\.github\.io\/sviluppo-pubblico\/commesse\/Fastpharma-Commesse\//.test(document.referrer) &&
 Boolean(window.opener);
if(fromCommesse)sessionStorage.setItem(commesseReturnKey,JSON.stringify({
 nonce:requestedNonce,at:Date.now()
}));
let rememberedPicker;
try{rememberedPicker=JSON.parse(sessionStorage.getItem(commesseReturnKey)||"null");}
catch{rememberedPicker=null;}
const resumingPicker=(importParams.has("code")||importParams.has("error")) &&
 rememberedPicker && /^[a-f0-9]{32}$/.test(rememberedPicker.nonce||"") &&
 Date.now()-rememberedPicker.at<10*60*1000 && Boolean(window.opener);
const commesseNonce=fromCommesse?requestedNonce:
 resumingPicker?rememberedPicker.nonce:"";
const selectForCommesse=Boolean(fromCommesse||resumingPicker);
async function chooseForCommesse(id){
 if(!selectForCommesse||!window.opener||window.opener.closed)return;
 const q=await request('/api/quotes/'+encodeURIComponent(id)+'?companyId='+encodeURIComponent(companyId));
 const t=await request('/api/quotes/'+encodeURIComponent(id)+'/totals?companyId='+encodeURIComponent(companyId));
 const recipient=(q.draft?.recipient?.name||'').trim();
 const subject=String(q.draft?.subject||q.subject||'').trim();
 const taxable=Number(t.taxable??t.totalExcludingVat??0);
 if(!recipient||!subject||!Number.isFinite(taxable)||taxable<0)
   throw Error('Dati commerciali incompleti: verificare il preventivo e il destinatario.');
 const snapshot={id:String(q.id),reference:String(q.reference||''),subject,
  recipientName:recipient,taxable,source:'Preventivi-DEMO',partial:!!t.partial};
 window.opener.postMessage({type:'fastpharma-commesse.quote-selected',
   nonce:commesseNonce,...snapshot},location.origin);
 status('Preventivo inviato a Gestione Commesse; puoi chiudere questa finestra.');
 window.close();
}

let companies = [], creatingIssuer = false, issuerFormBaseline = "";
let recipients = [], recipientId = "", creatingRecipient = false, recipientFormBaseline = "";
let chapterTemplates = [], templateId = "", creatingTemplate = false, templateBaseline = "";
let chapterAttachBusy = false;
let pendingCrmImport = null, crmCandidates = [];
let dossierProject = "farmacia-demo", lastImageUrl = null;
let toolMode="line",selectedLineId=null,lineEditBaseline="",lastChapterFilter="all";
let pendingChapterFocus=null;
let bimCadProjects=[],bimCadTypes=[],bimCadWindow=null,bimCadOpen=null;
const BIM_CAD_EDITOR_URL="https://www.termodel.it/termodel-ui-demo/index.html";
const BIM_CAD_EDITOR_ORIGIN=new URL(BIM_CAD_EDITOR_URL).origin;
const fmt = n => n == null ? "DA DEFINIRE" : Number(n).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const value = n => n == null ? "" : n;
const number = s => s === "" || s == null ? null : Number(s);
function status(s, fail=false){ $("status").textContent=s; $("status").style.color=fail?"#b91c1c":"#176c57"; }
async function request(url, opts={}){
  checkApiOrigin();
  if(!localDemo&&!accessToken)
    throw Error("Accedi a FastPharma Access prima di utilizzare Preventivi.");
  const headers={"Content-Type":"application/json","X-Preventivi-Demo-Session":demoSession,...(opts.headers||{})};
  if(accessToken)headers.Authorization="Bearer "+accessToken;
  const method=String(opts.method||"GET").toUpperCase();
  const readOnly=method==="GET";
  const attempts=readOnly?4:1;
  const transient=new Set([408,425,429,502,503,504]);
  for(let attempt=1;attempt<=attempts;attempt++){
    status(readOnly&&attempt>1?
      "Risveglio di Render: tentativo "+attempt+" di "+attempts+"…":
      "Richiesta API in corso (possibile cold start Render)...");
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),35000);
    try{
      const response=await fetch(apiBase+url,{
        ...opts,cache:"no-store",signal:ctrl.signal,headers
      });
      if(response.status===401&&!localDemo){
        accessToken="";showAccess(true);$("accessLogin").disabled=false;
        accessFeedback("Sessione Preventivi scaduta. Accedi nuovamente.",true);
        throw Error("Sessione Preventivi scaduta.");
      }
      if(readOnly&&transient.has(response.status)&&attempt<attempts){
        await new Promise(done=>setTimeout(done,1000*attempt));
        continue;
      }
      if(!response.ok){
        let message=await response.text();
        try{message=JSON.parse(message).detail||message}catch{}
        throw Error(response.status+" "+message);
      }
      status("API collegata · "+(accessMeta?.storage==="postgres"?
        "archivio PostgreSQL Neon":"modalità DEMO RAM"));
      return ["application/pdf","image/png"].some(t=>response.headers.get("content-type")?.includes(t))
        ? await response.blob():await response.json();
    }catch(error){
      if(readOnly&&attempt<attempts&&
          (error?.name==="AbortError"||error?.name==="TypeError")){
        await new Promise(done=>setTimeout(done,1000*attempt));
        continue;
      }
      throw error;
    }finally{clearTimeout(timeout)}
  }
  throw Error("Servizio Render non disponibile dopo più tentativi.");
}
const json=(method,body)=>({method,body:JSON.stringify(body)});
async function guard(fn){try{await fn()}catch(e){status(e.message,true);alert("Operazione non completata: "+e.message)}}
async function connect(){
  apiBase=$("apiBase").value.trim().replace(/\/$/,"");
  const parsed=new URL(apiBase);
  if(parsed.protocol!=="https:" && !["localhost","127.0.0.1"].includes(parsed.hostname))
    throw Error("Il servizio API deve utilizzare HTTPS.");
  checkApiOrigin();
  localStorage.setItem("preventivi-demo-api",apiBase);
  if(!apiBase && location.hostname.toLowerCase().endsWith(".github.io"))
    throw Error("Inserire l'indirizzo API demo autorizzata: GitHub Pages ospita solo il frontend statico.");
  await loadCompanies(companyId);
  quote=null;
  await refresh();
  showStep("general");
}

// Secure browser bridge: the CRM popup owns its credential; Preventivi never reads it.
const CRM_PAGE="https://fetonte1960.github.io/sviluppo-pubblico/commesse/Contatti-fastpharma/";
let organizationPopup=null,organizationNonce="";
function newOrganizationNonce(){
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
function accessPickerOrigin(){
 return accessMeta?.oidcIssuer?new URL(accessMeta.oidcIssuer).origin:"";
}
function loadFromContacts(){
 const origin=accessPickerOrigin();
 if(!accessToken || !origin){
  status("Accedi a FastPharma Access prima di selezionare il destinatario.",true);
  return;
 }
 organizationNonce=newOrganizationNonce();
 const url=new URL("/organization-picker",origin);
 url.searchParams.set("client","preventivi");
 url.searchParams.set("nonce",organizationNonce);
 organizationPopup=window.open(url.href,"fastpharma-preventivi-organizations",
  "width=1100,height=760,resizable=yes,scrollbars=yes");
 if(!organizationPopup){
  organizationNonce="";
  status("Il browser ha bloccato il selettore. Abilita i popup per Preventivi.",true);
 }else{
  organizationPopup.focus();
  $("crmLinkStatus").textContent="Seleziona un'Organizzazione in FastPharma Access; non è necessario aprire il CRM.";
 }
}
window.addEventListener("message",event=>{
 const origin=accessPickerOrigin();
 if(!origin || event.origin!==origin || event.source!==organizationPopup ||
    !organizationNonce)return;
 const data=event.data;
 if(data?.nonce!==organizationNonce)return;
 if(data.type==="fastpharma.organization-picker.ready"){
  organizationPopup.postMessage({
   type:"fastpharma.organization-picker.ack",nonce:organizationNonce
  },origin);
  return;
 }
 if(data.type!=="fastpharma.organization-selected"||
    !crmUuid.test(data.id||"")||typeof data.name!=="string"||
    !data.name.trim()||data.name.length>250)return;
 selectedCrmOrganization={id:data.id,name:data.name.trim()};
 crmOrganizations.set(data.id,selectedCrmOrganization);
 renderCrmOrganizations();
 $("crmLinkStatus").textContent="Destinatario collegato da FastPharma Access: "+
   selectedCrmOrganization.name+". ID Organizzazione associato al nuovo preventivo.";
 organizationNonce="";
 organizationPopup=null;
});
let crmPopup=null,crmNonce="",crmOrganizations=new Map();
let selectedCrmOrganization=null,pendingCrmNote=null;
const crmUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function renderCrmOrganizations(){
  const select=$("crmOrganization");
  const entries=[...crmOrganizations.values()].sort((a,b)=>a.name.localeCompare(b.name,"it"));
  select.innerHTML='<option value="">— Seleziona Organizzazione —</option>'+
    entries.map(o=>'<option value="'+escapeHtml(o.id)+'">'+escapeHtml(o.name)+'</option>').join("");
  select.value=selectedCrmOrganization?.id||"";
  $("crmLinkStatus").textContent=entries.length
    ? "Destinatario selezionato con FastPharma Access. L'UUID viene collegato al preventivo."
    : "Usa «Carica da Contatti» per cercare un'Organizzazione con FastPharma Access.";
}
// Il CRM completo rimane accessibile per le attività/note storiche.
function openContactsLegacy(){
  if(crmPopup&&!crmPopup.closed){crmPopup.focus();return;}
  crmNonce=crypto.randomUUID().replace(/-/g,"");
  crmPopup=window.open(CRM_PAGE+"?picker=preventivi&nonce="+crmNonce,
    "fastpharma-contatti-preventivi","width=1180,height=760,scrollbars=yes,resizable=yes");
  if(!crmPopup){
    status("Il browser ha bloccato Contatti. Consenti i popup di GitHub Pages.",true);
    return;
  }
  $("crmLinkStatus").textContent="Accedi a Contatti nella finestra aperta. Se un'Organizzazione non esiste, creala lì.";
}
function onCrmMessage(event){
  if(event.origin!==location.origin||event.source!==crmPopup)return;
  const data=event.data;
  if(!data||typeof data!=="object"||data.nonce!==crmNonce)return;
  if(data.type==="fastpharma-preventivi.organizations"){
    if(!Array.isArray(data.organizations)||data.organizations.length>500)return;
    crmOrganizations=new Map(data.organizations.filter(o=>crmUuid.test(o.id)&&
      typeof o.name==="string"&&o.name.length>0&&o.name.length<=300)
      .map(o=>[o.id,{id:o.id,name:o.name}]));
    // Il CRM legacy non elimina la scelta del nuovo selettore Access.
    if(selectedCrmOrganization&&!crmOrganizations.has(selectedCrmOrganization.id))
      crmOrganizations.set(selectedCrmOrganization.id,selectedCrmOrganization);
    renderCrmOrganizations();
  }
  if(data.type==="fastpharma-preventivi.organization-selected"){
    const org=data.organization;
    if(!org||!crmUuid.test(org.id)||typeof org.name!=="string"||
       !org.name.trim()||org.name.length>300)return;
    selectedCrmOrganization=org;
    crmOrganizations.set(org.id,{id:org.id,name:org.name});
    renderCrmOrganizations();
    $("crmLinkStatus").textContent="Destinatario collegato: "+org.name+
      " (Organizzazione Contatti). La finestra CRM resta aperta per registrare la nota quando crei il preventivo.";
  }
  if(data.type==="fastpharma-preventivi.note-result"&&pendingCrmNote&&
     data.quoteId===pendingCrmNote.id){
    const task=pendingCrmNote;pendingCrmNote=null;
    if(data.ok){task.resolve(true);$("crmLinkStatus").textContent=
      "Nota «Iniziato un nuovo preventivo» registrata in Contatti. Categoria da completare.";}
    else {task.reject(Error(data.error||"Nota non registrata da Contatti"));}
  }
}
window.addEventListener("message",onCrmMessage);
function requestCrmSelection(id){
  selectedCrmOrganization=null;
  if(!crmPopup||crmPopup.closed){status("Riapri Contatti per scegliere l'Organizzazione.",true);return;}
  crmPopup.postMessage({type:"fastpharma-preventivi.select-organization",
    nonce:crmNonce,id},location.origin);
  $("crmLinkStatus").textContent="Verifica del destinatario nel CRM in corso…";
}
async function recordCrmNote(created){
  if(!crmPopup||crmPopup.closed)throw Error(
    "Contatti è stato chiuso: la nota non è stata registrata. Il preventivo è stato creato.");
  if(pendingCrmNote)throw Error("Registrazione nota già in corso");
  const note=new Promise((resolve,reject)=>{pendingCrmNote={id:created.id,resolve,reject};});
  crmPopup.postMessage({type:"fastpharma-preventivi.note-request",nonce:crmNonce,
    organizationId:selectedCrmOrganization.id,quoteId:created.id,
    reference:created.reference,subject:created.draft.subject},location.origin);
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error(
    "Contatti non ha confermato la nota. Non ripetere automaticamente la creazione del preventivo.")),50000));
  try {await Promise.race([note,timeout]);}
  finally {pendingCrmNote=null;}
}
function syncQuoteTabs(){
  const hasQuote=Boolean(quote);
  for(const id of ["tabChapters","tabBimCad","tabQuote","tabPrices"]){
    const tab=$(id);
    tab.disabled=!hasQuote;
    tab.setAttribute("aria-disabled",String(!hasQuote));
  }
  $("closeQuote").disabled=!hasQuote;
  // Quote-specific actions are unavailable until a quotation is opened.
  for(const id of ["save","revision","previewPrices","pdf","printSaveSetup","goQuote",
                   "issuerApplyToQuote"]){
    $(id).disabled=!hasQuote;
    $(id).setAttribute("aria-disabled",String(!hasQuote));
  }
  $("issuerApplyToQuote").disabled=!hasQuote||
    !issuerSelected()?.details?.print;
  document.querySelectorAll(
    "#commercialDetails input,#commercialDetails select,#commercialDetails textarea,"+
    "#printSetupDetails input,#printSetupDetails select,#printSetupDetails textarea"
  ).forEach(field=>{field.disabled=!hasQuote;});
  if(!hasQuote && $("issuerPanel").hidden)showStep("general",true);
}
function updateHeaderQuote(){
  syncQuoteTabs();
  $("appVersion").textContent="V"+APP_VERSION;
  $("infoVersion").textContent="V"+APP_VERSION;
  $("currentQuoteHeader").textContent=quote
    ? "Preventivo in elaborazione: "+quote.reference+" — "+quote.draft.subject
    : "Preventivo in elaborazione: nessuno";
}

const issuerFields = ["issuerName","issuerAddress","issuerTaxId","issuerContact",
  "issuerPrintAddress","issuerPrintContact"];
let issuerLogoData={logoJpegBase64:null,logoWidthPx:null,logoHeightPx:null};
function updateIssuerLogoPreview(){
  const base64=issuerLogoData.logoJpegBase64;
  const preview=$("issuerLogoPreview");
  preview.hidden=!base64;
  preview.removeAttribute("src");
  if(base64)preview.src="data:image/jpeg;base64,"+base64;
  $("issuerLogoStatus").textContent=base64?
    "Logo JPEG: "+issuerLogoData.logoWidthPx+" × "+
    issuerLogoData.logoHeightPx+" px":"Nessun logo associato.";
  $("issuerLogoClear").disabled=!base64;
}
function readIssuer(){
  return {name:$("issuerName").value.trim(),address:$("issuerAddress").value.trim(),
    taxId:$("issuerTaxId").value.trim(),contact:$("issuerContact").value.trim(),
    print:{
      footerAddress:$("issuerPrintAddress").value.trim(),
      footerContact:$("issuerPrintContact").value.trim(),
      ...issuerLogoData
    }};
}
function issuerIsDirty(){
  return JSON.stringify(readIssuer()) !== issuerFormBaseline;
}
function issuerSelected(){return companies.find(c=>c.id===companyId)}
function displayIssuer(){
  const current=issuerSelected();
  $("chosenIssuer").textContent=current?.details.name||"Nessun emittente";
  $("company").value=companyId;
  $("selectedIssuerName").textContent=current?.details.name||"Seleziona";
  $("issuerCards").innerHTML=companies.map(c=>
    '<button type="button" class="issuer-card '+(c.id===companyId?'active':'')+
    '" data-issuer="'+escapeHtml(c.id)+'"><b>'+escapeHtml(c.details.name)+'</b>'+
    '<span>'+escapeHtml(c.details.address)+'</span></button>').join("");
}
function renderIssuerForm(){
  creatingIssuer=false;
  const d=issuerSelected()?.details||{name:"",address:"",taxId:"",contact:""};
  $("issuerName").value=d.name||"";
  $("issuerAddress").value=d.address||"";
  $("issuerTaxId").value=d.taxId||"";
  $("issuerContact").value=d.contact||"";
  $("issuerPrintAddress").value=d.print?.footerAddress||"";
  $("issuerPrintContact").value=d.print?.footerContact||"";
  issuerLogoData={
    logoJpegBase64:d.print?.logoJpegBase64||null,
    logoWidthPx:d.print?.logoWidthPx||null,
    logoHeightPx:d.print?.logoHeightPx||null
  };
  $("issuerLogoFile").value="";
  updateIssuerLogoPreview();
  issuerFormBaseline=JSON.stringify(readIssuer());
  $("issuerMode").textContent="Dati dell'emittente selezionato";
  $("issuerSave").textContent="Salva modifiche emittente";
  $("issuerNotice").textContent="I preventivi precedenti conservano i dati dell'emittente fotografati alla creazione.";
  displayIssuer();
}
async function loadCompanies(preferred=companyId){
  companies=await request("/api/demo/companies");
  $("company").innerHTML=companies.map(c=>
    '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.details.name)+'</option>').join("");
  companyId=companies.some(c=>c.id===preferred)?preferred:(companies[0]?.id||"");
  renderIssuerForm();
}
function beginNewIssuer(){
  creatingIssuer=true;
  for(const field of issuerFields)$(field).value="";
  issuerLogoData={logoJpegBase64:null,logoWidthPx:null,logoHeightPx:null};
  $("issuerLogoFile").value="";
  updateIssuerLogoPreview();
  issuerFormBaseline=JSON.stringify(readIssuer());
  $("issuerMode").textContent="Nuovo emittente";
  $("issuerSave").textContent="Crea emittente";
  $("issuerNotice").textContent="Al salvataggio verrà creato un emittente distinto con archivio preventivi e prezziario propri.";
  $("issuerName").focus();
}
async function saveIssuer(){
  const details=readIssuer();
  if(!details.name||!details.address)
    throw Error("Ragione sociale e indirizzo dell'emittente sono obbligatori");
  const created=creatingIssuer;
  const quoteToReopen=!created&&quote?.companyId===companyId?quote.id:null;
  const company=await request(created?"/api/demo/companies":
    "/api/demo/companies/"+companyId,json(created?"POST":"PUT",details));
  quote=null;
  await loadCompanies(company.id);
  await refresh();
  if(quoteToReopen)await openQuote(quoteToReopen);
  status(created?"Emittente creato.":"Emittente aggiornato su Neon. "+
    "Per il preventivo aperto usa «Aggiorna intestazione dal profilo emittente».");
}

const recipientFields=["recipientName","recipientAddress","recipientTaxId","recipientContact"];
function readRecipient(){
  return {name:$("recipientName").value.trim(),address:$("recipientAddress").value.trim(),
    taxId:$("recipientTaxId").value.trim(),contact:$("recipientContact").value.trim()};
}
function recipientIsDirty(){return JSON.stringify(readRecipient())!==recipientFormBaseline}
function selectedRecipient(){return recipients.find(r=>r.id===recipientId)}
function renderRecipientOptions(){
  const options='<option value="">— Seleziona destinatario —</option>'+
    recipients.map(r=>'<option value="'+escapeHtml(r.id)+'">'+
    escapeHtml(r.details.name)+'</option>').join("");
  $("recipientSelect").innerHTML=options;
  $("recipientSelect").value=recipientId||"";
  $("newRecipientSummary").textContent=selectedRecipient()
    ? selectedRecipient().details.name+" — "+selectedRecipient().details.address
    : "Per creare un preventivo, registra e seleziona un destinatario.";
}
function clearCrmPending(){
  pendingCrmImport=null;
  $("crmImportNotice").hidden=true;
  $("crmConfirmRow").hidden=true;
  $("crmImportConfirm").checked=false;
}
function renderRecipientForm(){
  clearCrmPending();
  const d=selectedRecipient()?.details||{name:"",address:"",taxId:"",contact:""};
  creatingRecipient=!selectedRecipient();
  $("recipientName").value=d.name||"";
  $("recipientAddress").value=d.address||"";
  $("recipientTaxId").value=d.taxId||"";
  $("recipientContact").value=d.contact||"";
  recipientFormBaseline=JSON.stringify(readRecipient());
  $("recipientMode").textContent=creatingRecipient?"Nuovo destinatario":"Dati del destinatario selezionato";
  $("recipientSave").textContent=creatingRecipient?"Crea destinatario":"Salva modifiche destinatario";
  renderRecipientOptions();
}
function beginNewRecipient(){
  clearCrmPending();
  recipientId="";
  creatingRecipient=true;
  for(const id of recipientFields)$(id).value="";
  recipientFormBaseline=JSON.stringify(readRecipient());
  $("recipientMode").textContent="Nuovo destinatario";
  $("recipientSave").textContent="Crea destinatario";
  renderRecipientOptions();
  $("recipientName").focus();
}
async function chooseRecipient(nextId){
  if(recipientIsDirty()&&!confirm("Il destinatario ha modifiche non salvate. Scartarle?")){
    $("recipientSelect").value=recipientId||"";return;
  }
  recipientId=recipients.some(r=>r.id===nextId)?nextId:"";
  renderRecipientForm();
}

async function openCrmImport(){
  if(issuerIsDirty()||creatingIssuer)
    throw Error("Salva prima l'anagrafica emittente");
  if(recipientIsDirty()&&!confirm("Scartare le modifiche non salvate al destinatario?"))return;
  $("contattiImportPanel").hidden=false;
  await loadCrmCandidates();
}
async function loadCrmCandidates(){
  const kind=$("crmImportKind").value, query=$("crmImportSearch").value.trim();
  if(query.length>120)throw Error("Ricerca troppo lunga");
  crmCandidates=await request("/api/recipients/contatti-candidates?companyId="+companyId+
    "&kind="+encodeURIComponent(kind)+"&query="+encodeURIComponent(query));
  $("crmImportResults").innerHTML=crmCandidates.map(c=>
    '<button type="button" class="crm-import-result" data-crm-id="'+escapeHtml(c.sourceId)+'">'+
    escapeHtml(c.name)+
    '<span>'+escapeHtml(c.sourceKind==="organization"?"Organizzazione":"Contatto")+
    ' · '+escapeHtml(c.city||"Indirizzo non disponibile")+
    ' · DEMO</span></button>').join("")||
    '<p class="hint">Nessun record dimostrativo corrisponde alla ricerca.</p>';
}
function chooseCrmCandidate(id){
  const item=crmCandidates.find(c=>c.sourceId===id);
  if(!item)throw Error("Selezione CRM non valida");
  if(recipientIsDirty()&&!confirm("Scartare le modifiche non salvate al destinatario?"))return;
  beginNewRecipient();
  pendingCrmImport={sourceId:item.sourceId,sourceKind:item.sourceKind};
  $("recipientName").value=item.name;
  // CRM has a city for organizations, no street, and no tax ID. Never guess these values.
  $("recipientAddress").value="";
  $("recipientTaxId").value="";
  $("recipientContact").value=[item.email,item.phone].filter(Boolean).join(" · ").slice(0,180);
  $("crmImportNotice").textContent="Origine: Contatti FastPharma — "+
    (item.sourceKind==="organization"?"Organizzazione":"Contatto")+
    " DEMO. "+(item.city?"Città indicata nel CRM: "+item.city+". ":"")+
    "Inserisci l'indirizzo completo e verifica i dati fiscali prima di salvare.";
  $("crmImportNotice").hidden=false;
  $("crmConfirmRow").hidden=false;
  $("crmImportConfirm").checked=false;
  $("recipientMode").textContent="Destinatario importato da Contatti (da completare)";
  $("recipientSave").textContent="Conferma e importa destinatario";
  $("recipientName").focus();
}

async function saveRecipient(){
  if(creatingIssuer||issuerIsDirty())
    throw Error("Salva prima l'anagrafica emittente.");
  const details=readRecipient();
  if(!details.name||!details.address)throw Error("Nome e indirizzo del destinatario sono obbligatori");
  const isNew=creatingRecipient||!recipientId;
  let item, alreadyImported=false;
  if(pendingCrmImport){
    if(!$("crmImportConfirm").checked)
      throw Error("Conferma la verifica della scheda importata prima di salvare");
    const result=await request("/api/recipients/import-from-contatti",
      json("POST",{companyId,sourceKind:pendingCrmImport.sourceKind,
        sourceId:pendingCrmImport.sourceId,details,confirmed:true}));
    item=result.recipient;
    alreadyImported=result.alreadyImported;
  }else{
    item=await request(isNew?"/api/recipients":"/api/recipients/"+recipientId,
      json(isNew?"POST":"PUT",{companyId,details}));
  }
  const fromCrm=Boolean(pendingCrmImport);
  recipientId=item.id;
  creatingRecipient=false;
  clearCrmPending();
  await refresh();
  status(fromCrm?(alreadyImported?"Scheda Contatti già importata: nessun duplicato creato.":
    "Destinatario DEMO importato da Contatti."):
    (isNew?"Destinatario creato nella demo.":"Destinatario aggiornato."));
}
function renderGeneralQuote(){
  const exists=Boolean(quote);
  $("openedQuote").textContent=exists
    ? quote.reference+" — "+quote.status
    : "Nessun preventivo aperto. Creane uno oppure selezionalo dall'archivio.";
  const r=quote?.draft?.recipient;
  $("openedRecipient").textContent=r
    ? "Destinatario registrato in questa bozza: "+r.name+
        (r.address?" — "+r.address:"")
    : "";
  $("generalSubject").disabled=!exists;
  $("generalSave").disabled=!exists;
  $("generalSubject").value=exists?quote.draft.subject:"";
  $("applyRecipient").disabled=!exists||!recipientId;
  $("applyRecipient").checked=false;
  updateHeaderQuote();
  document.querySelectorAll("#quoteList [data-open]").forEach(button=>{
    button.setAttribute("aria-current",String(exists&&button.dataset.open===quote.id));
  });
  document.querySelectorAll("#quoteList [data-quote-row]").forEach(row=>{
    row.setAttribute("aria-selected",String(exists&&row.dataset.quoteRow===quote.id));
  });
}
async function saveGeneral(){
  if(!quote)throw Error("Seleziona prima un preventivo dall'archivio");
  if(issuerIsDirty()||recipientIsDirty())
    throw Error("Salva prima le modifiche alle anagrafiche");
  const subject=$("generalSubject").value.trim();
  if(!subject)throw Error("Oggetto del preventivo obbligatorio");
  const apply=$("applyRecipient").checked;
  if(apply&&!recipientId)throw Error("Seleziona un destinatario prima di applicarlo");
  await request("/api/quotes/"+quote.id+"/general",json("PUT",{
    companyId,recipientId:apply?recipientId:null,subject
  }));
  const id=quote.id;
  await refresh();
  await openQuote(id);
  status("Dati generali della bozza salvati.");
}

async function chooseIssuer(next){
  if(!companies.some(c=>c.id===next))return;
  if(next===companyId && !creatingIssuer && !issuerIsDirty())return;
  if((issuerIsDirty()||recipientIsDirty()) &&
    !confirm("Ci sono modifiche anagrafiche non salvate. Vuoi scartarle?")){
      $("company").value=companyId;return;
    }
  if(quote && next!==companyId && !confirm(
    "Cambiare emittente? Eventuali modifiche non salvate al preventivo aperto verranno perse.")){
    $("company").value=companyId;return;
  }
  const changed=next!==companyId;
  if(bimCadWindow&&!bimCadWindow.closed)bimCadWindow.close();
  bimCadWindow=null;bimCadOpen=null;
  companyId=next;quote=null;
  selectedCrmOrganization=null;
  templateId="";chapterTemplates=[];
  recipientId="";recipients=[];
  clearCrmPending();
  $("contattiImportPanel").hidden=true;
  renderIssuerForm();
  if(changed)await refresh();
}

const templateFields=["templateTitle","templateDescription","templateOrder"];
function readTemplate(){
  return {title:$("templateTitle").value.trim(),
    description:$("templateDescription").value.trim(),
    order:Number($("templateOrder").value)};
}
function templateDirty(){return JSON.stringify(readTemplate())!==templateBaseline}
function selectedTemplate(){return chapterTemplates.find(t=>t.id===templateId)}
function renderTemplateForm(){
  const item=selectedTemplate();
  creatingTemplate=!item;
  $("templateTitle").value=item?.title||"";
  $("templateDescription").value=item?.description||"";
  $("templateOrder").value=item?.order??50;
  $("templateMode").textContent=item?"Modifica capitolo dell'archivio":"Nuovo capitolo";
  $("templateSave").textContent=item?"Salva modifiche":"Crea capitolo";
  $("templateStatus").disabled=!item;
  $("templateStatus").textContent=item?.active?"Disattiva capitolo":"Riattiva capitolo";
  templateBaseline=JSON.stringify(readTemplate());
  renderTemplateList();
}
function renderTemplateList(){
  const showInactive=$("templateShowInactive").checked;
  const shown=chapterTemplates.filter(t=>showInactive||t.active);
  $("templateList").innerHTML=shown.map(t=>
    '<button type="button" class="chapter-template '+(t.active?'':'inactive')+
    '" data-template-id="'+escapeHtml(t.id)+'" aria-pressed="'+(t.id===templateId)+'" '+
    'title="Un clic seleziona; doppio clic aggiunge al preventivo">'+
    '<strong>'+escapeHtml(t.title)+'</strong><span>'+
    escapeHtml(t.description||"Capitolo di preventivo")+
    (t.active?"":" · DISATTIVATO")+'</span></button>').join("")||
    '<p class="chapter-preview-empty">Nessun capitolo disponibile. Crea un nuovo capitolo.</p>';
}
async function refreshChapterTemplates(){
  chapterTemplates=await request("/api/chapter-templates?companyId="+companyId+"&includeInactive=true");
  if(!chapterTemplates.some(t=>t.id===templateId)){
    templateId=chapterTemplates.find(t=>t.active)?.id||chapterTemplates[0]?.id||"";
  }
  renderTemplateForm();
}
function newTemplate(){
  templateId="";
  creatingTemplate=true;
  renderTemplateForm();
  $("templateTitle").focus();
}
function chooseTemplate(id){
  if(!chapterTemplates.some(t=>t.id===id))return false;
  if(id===templateId)return true;
  if(templateDirty()&&!confirm("Modifiche al capitolo non salvate. Scartarle?"))return false;
  templateId=id;
  renderTemplateForm();
  return true;
}
async function saveTemplate(){
  if(issuerIsDirty()||creatingIssuer)throw Error("Salva prima l'emittente");
  const payload={companyId,...readTemplate()};
  if(!payload.title)throw Error("Inserisci il titolo del capitolo");
  if(!Number.isInteger(payload.order)||payload.order<0||payload.order>10000)
    throw Error("L'ordine deve essere un numero intero da 0 a 10000");
  const created=creatingTemplate||!templateId;
  const result=await request(created?"/api/chapter-templates":
    "/api/chapter-templates/"+templateId,json(created?"POST":"PUT",payload));
  templateId=result.id;
  await refreshChapterTemplates();
  renderQuoteChapterSummary();
  status(created?"Capitolo creato nell'archivio demo.":"Capitolo dell'archivio aggiornato.");
}
async function toggleTemplateStatus(){
  const item=selectedTemplate();
  if(!item)throw Error("Seleziona un capitolo");
  const next=!item.active;
  if(!next&&!confirm("Disattivare questo capitolo nell'archivio? I preventivi esistenti non saranno modificati."))return;
  await request("/api/chapter-templates/"+item.id+"/status",
    json("PUT",{companyId,active:next}));
  await refreshChapterTemplates();
  status(next?"Capitolo riattivato.":"Capitolo disattivato nell'archivio.");
}
function renderQuoteChapterSummary(){
  $("chapterCurrentQuote").textContent=quote
    ? quote.reference+" — "+quote.draft.subject:"Nessuna bozza aperta";
  const host=$("quoteChapterSummary");
  if(!quote||!quote.draft.chapters.length){
    host.innerHTML='<p class="chapter-preview-empty">Apri o crea un preventivo con capitoli.</p>';
    return;
  }
  host.innerHTML='<div class="chapter-totals-scroll"><table class="chapter-totals-table">'+
    '<thead><tr><th>Capitolo</th><th>Gruppi</th><th>Voci</th>'+
    '<th>Totale autonomo (€)</th><th>Fonte</th><th>Operazione</th>'+
    '</tr></thead><tbody>'+
    [...quote.draft.chapters].sort((a,b)=>a.order-b.order).map(c=>
      '<tr data-chapter-total="'+escapeHtml(c.id)+'">'+
      '<td><strong>'+escapeHtml(c.title)+'</strong></td>'+
      '<td>'+(c.groups||[]).length+'</td><td>'+c.lines.length+'</td>'+
      '<td><input data-total-amount type="number" min="0" step=".01" '+
        'value="'+(c.documentedSubtotal==null?'':escapeHtml(c.documentedSubtotal))+
        '" placeholder="Non indicato"></td>'+
      '<td><input data-total-source maxlength="240" value="'+
        escapeHtml(c.documentedSubtotalSource||"")+'" placeholder="Contratto, pagina…"></td>'+
      '<td><button type="button" data-save-chapter-total="'+escapeHtml(c.id)+
        '">Salva totale</button></td></tr>').join('')+
    '</tbody></table></div>'+
    '<p class="hint">Ogni capitolo contiene Gruppi e/o Voci autonome. '+
    'Il totale autonomo del capitolo prevale sul computo dei gruppi senza duplicarlo.</p>';
}

async function addTemplateToQuote(id){
  if(chapterAttachBusy)return;
  const item=chapterTemplates.find(t=>t.id===id);
  if(!item)throw Error("Capitolo non trovato");
  if(!item.active)throw Error("Capitolo disattivato: riattivalo prima di inserirlo");
  if(!quote){
    status("Crea o apri un preventivo da Generale prima di inserire capitoli.",true);
    return;
  }
  if(templateDirty())throw Error("Salva le modifiche al capitolo prima di inserirlo");
  chapterAttachBusy=true;
  try{
    // Preserve any edits to an already opened body before inserting a new chapter.
    await save();
    const idQuote=quote.id;
    const result=await request("/api/quotes/"+idQuote+"/chapters/from-catalog",
      json("POST",{companyId,templateId:id}));
    pendingChapterFocus=result.chapter.id;
    await openQuote(idQuote);
    renderQuoteChapterSummary();
    status(result.added?"Capitolo «"+item.title+"» aggiunto al preventivo.":
      "Capitolo «"+item.title+"» già presente: nessun duplicato.");
  }finally{
    chapterAttachBusy=false;
  }
}


function bimCadQuoteContext(){
  if(!quote)throw Error("Apri prima un preventivo da Generale");
  return {companyId,quoteId:quote.id};
}
function bimCadFeedback(text,isError=false){
  $("bimCadFeedback").textContent=text;
  $("bimCadFeedback").style.color=isError?"#aa3030":"#236858";
}
async function refreshBimCad(){
  if(!quote){
    bimCadProjects=[];
    $("bimCadQuoteLabel").textContent="Apri prima un preventivo da Generale.";
    $("bimCadGrid").innerHTML='<tr><td colspan="5">Nessun preventivo aperto</td></tr>';
    return;
  }
  const query="?companyId="+encodeURIComponent(companyId)+
    "&quoteId="+encodeURIComponent(quote.id);
  const [list,types]=await Promise.all([
    request("/api/bim-cad/projects"+query),
    request("/api/bim-cad/types"+query)
  ]);
  bimCadProjects=list;bimCadTypes=types;
  $("bimCadQuoteLabel").textContent=quote.reference+" · "+quote.draft.subject+
    " · riferimento: "+quote.id;
  const select=$("bimCadNewKind");
  select.innerHTML=types.filter(t=>t.enabled).map(t=>
    '<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.label)+'</option>').join("");
  $("bimCadNew").disabled=!types.some(t=>t.enabled);
  $("bimCadGrid").innerHTML=list.map(project=>
    '<tr data-bimcad-id="'+escapeHtml(project.id)+'">'+
    '<td><strong>'+escapeHtml(project.name)+'</strong></td>'+
    '<td>'+escapeHtml(project.kind)+'</td>'+
    '<td>R'+project.revision+(project.revision===0?' · mai salvato':'')+'</td>'+
    '<td>'+escapeHtml(project.revision?
      new Date(project.updatedAt).toLocaleString("it-IT"):"—")+'</td>'+
    '<td><button type="button" data-bimcad-open="'+escapeHtml(project.id)+
    '">Apri</button> <button type="button" class="button-danger" '+
    'data-bimcad-delete="'+escapeHtml(project.id)+'">Elimina</button></td></tr>'
  ).join("")||'<tr><td colspan="5">Nessun progetto associato. Creane uno dalla riga superiore.</td></tr>';
}
async function createBimCad(){
  const ids=bimCadQuoteContext();
  const name=$("bimCadNewName").value.trim();
  const kind=$("bimCadNewKind").value;
  if(!name)throw Error("Inserisci un nome per il nuovo progetto");
  const project=await request("/api/bim-cad/projects",json("POST",{...ids,name,kind}));
  $("bimCadNewName").value="";
  await refreshBimCad();
  bimCadFeedback("Progetto «"+project.name+"» creato. Premi Apri per iniziare il disegno.");
}
async function deleteBimCad(id){
  const row=bimCadProjects.find(p=>p.id===id);
  if(!row)throw Error("Progetto non appartenente al preventivo aperto");
  if(!confirm("Eliminare il progetto «"+row.name+"» da questo preventivo? "+
    "L'eliminazione è logica; le eventuali revisioni esistenti non saranno modificate."))return;
  const ids=bimCadQuoteContext();
  await request("/api/bim-cad/projects/"+encodeURIComponent(id)+"?"+
    "companyId="+encodeURIComponent(ids.companyId)+
    "&quoteId="+encodeURIComponent(ids.quoteId),{method:"DELETE"});
  if(bimCadOpen?.id===id){
    if(bimCadWindow&&!bimCadWindow.closed)bimCadWindow.close();
    bimCadWindow=null;bimCadOpen=null;
  }
  await refreshBimCad();
  bimCadFeedback("Progetto BIM-CAD eliminato dall'elenco.");
}
function openBimCad(id){
  const row=bimCadProjects.find(p=>p.id===id);
  if(!row)throw Error("Progetto non associato al preventivo aperto");
  if(row.kind!=="BIM-CAD-Architettonico")
    throw Error("Non è ancora disponibile un editor per il tipo "+row.kind);
  // One bound editor per Preventivi window: another project must not leave an
  // orphaned editor whose Save cannot receive a confirmation.
  if(bimCadWindow&&!bimCadWindow.closed){
    if(bimCadOpen?.id===id&&bimCadOpen.quoteId===quote.id&&
       bimCadOpen.companyId===companyId){
      bimCadWindow.focus();
      bimCadFeedback("Il progetto è già aperto. Usa la finestra BIM-CAD esistente.");
      return;
    }
    if(!confirm("È già aperto un altro progetto BIM-CAD. Chiuderlo e passare a questo? Salva prima le modifiche."))return;
    bimCadWindow.close();
    bimCadWindow=null;
    bimCadOpen=null;
  }
  // Parameters identify the context only, never grant database write rights.
  const nonce=crypto.randomUUID().replace(/-/g,"");
  const uri=BIM_CAD_EDITOR_URL+"?bimCad=preventivi&bimCadProjectId="+
    encodeURIComponent(row.id)+"&bimCadQuoteId="+encodeURIComponent(quote.id)+
    "&bimCadNonce="+nonce;
  const popup=window.open(uri,"preventivi-bimcad-"+row.id,
    "width=1450,height=900,resizable=yes,scrollbars=yes");
  if(!popup)throw Error("Consenti l'apertura delle finestre popup per BIM-CAD");
  bimCadWindow=popup;
  bimCadOpen={id:row.id,quoteId:quote.id,companyId,nonce};
  bimCadFeedback("BIM-CAD-Architettonico aperto. Il comando Salva dell'editor invierà il progetto alla bozza "+quote.reference+".");
}
async function onBimCadMessage(event){
  const link=bimCadOpen;
  if(!link||!bimCadWindow||event.source!==bimCadWindow||
      event.origin!==BIM_CAD_EDITOR_ORIGIN)return;
  const message=event.data;
  if(!message||message.namespace!=="preventivi-bimcad-v1"||
     message.nonce!==link.nonce||message.projectId!==link.id||
     message.quoteId!==link.quoteId)return;
  if(!quote||quote.id!==link.quoteId||companyId!==link.companyId)return;
  const respond=(payload)=>bimCadWindow&&!bimCadWindow.closed&&
    bimCadWindow.postMessage({namespace:"preventivi-bimcad-v1",
      nonce:link.nonce,projectId:link.id,quoteId:link.quoteId,...payload},
      BIM_CAD_EDITOR_ORIGIN);
  const requestPath="/api/bim-cad/projects/"+encodeURIComponent(link.id);
  try{
    if(message.type==="ready"){
      const project=await request(requestPath+"?companyId="+link.companyId+
        "&quoteId="+link.quoteId);
      respond({type:"load",revision:project.revision,projectText:project.projectText||""});
    }else if(message.type==="save"){
      if(typeof message.projectText!=="string"||
         !Number.isInteger(message.expectedRevision)){
        respond({type:"save-result",ok:false,error:"Contenuto non valido"});return;
      }
      const result=await request(requestPath+"/content",json("PUT",{
        companyId:link.companyId,quoteId:link.quoteId,
        expectedRevision:message.expectedRevision,projectText:message.projectText
      }));
      respond({type:"save-result",ok:true,revision:result.revision});
      await refreshBimCad();
      bimCadFeedback("Disegno BIM-CAD salvato in "+quote.reference+" · revisione R"+result.revision);
    }
  }catch(e){
    respond({type:message.type==="ready"?"load-error":"save-result",
      ok:false,error:e.message});
    bimCadFeedback("Salvataggio BIM-CAD non riuscito: "+e.message,true);
  }
}
window.addEventListener("message",event=>{void onBimCadMessage(event)});

function showStep(which,force=false){
  if(which!=="general"&&!quote){
    status("Crea o apri un preventivo da Generale prima di utilizzare questa scheda.",true);
    return false;
  }
  if(!force&&which!=="general"){
    if(creatingIssuer){
      status("Completa o annulla la creazione dell'emittente.",true);
      return false;
    }
    if(!companyId){status("Seleziona prima un emittente.",true);return false}
    if(issuerIsDirty()||recipientIsDirty()){
      status("Salva le anagrafiche prima di proseguire.",true);
      return false;
    }
    if(quote&&($("generalSubject").value.trim()!==quote.draft.subject||
       $("applyRecipient").checked)){
      status("Salva i dati generali prima di proseguire.",true);
      return false;
    }
  }
  if(!force&&which!=="chapters" && templateDirty() &&
     !$("chapterPanel").hidden){
    status("Salva o annulla le modifiche al capitolo prima di cambiare scheda.",true);
    return false;
  }
  const general=which==="general",chapters=which==="chapters",
    body=which==="quote",prices=which==="prices",bim=which==="bimCad";
  $("issuerPanel").hidden=!general;
  $("chapterPanel").hidden=!chapters;
  $("bimCadPanel").hidden=!bim;
  $("quotePanel").hidden=!body;
  $("pricesPanel").hidden=!prices;
  for(const [id,selected] of [["tabIssuer",general],
                              ["tabChapters",chapters],["tabBimCad",bim],["tabQuote",body],
                              ["tabPrices",prices]]){
    $(id).classList.toggle("active",selected);
    $(id).setAttribute("aria-selected",String(selected));
  }
  displayIssuer();
  if(chapters)renderQuoteChapterSummary();
  if(bim)guard(refreshBimCad);
  return true;
}

async function refresh(){
  if(!companyId){
    catalog=[];prices=[];batches=[];allQuotes=[];recipients=[];chapterTemplates=[];
    $("quoteList").innerHTML='<tr><td colspan="7" class="empty">Archivio vuoto. Apri Gestione emittente e crea il primo emittente.</td></tr>';
    $("demoInfo").textContent="Nessun emittente. "+
      (accessMeta?.storage==="postgres"?"Archivio PostgreSQL Neon attivo.":"Archivio DEMO RAM.");
    renderGeneralQuote();renderQuoteChapterSummary();
    return;
  }
  [catalog,prices,batches,allQuotes,recipients,chapterTemplates]=await Promise.all([
    request("/api/catalog?companyId="+companyId),
    request("/api/prices/"+companyId),
    request("/api/batches?companyId="+companyId),
    request("/api/quotes/overview"),
    request("/api/recipients?companyId="+companyId),
    request("/api/chapter-templates?companyId="+companyId+"&includeInactive=true")
  ]);
  if(!chapterTemplates.some(t=>t.id===templateId))
    templateId=chapterTemplates.find(t=>t.active)?.id||chapterTemplates[0]?.id||"";
  renderTemplateForm();
  if(!recipients.some(r=>r.id===recipientId))recipientId=recipients[0]?.id||"";
  renderRecipientForm();
  $("quoteList").innerHTML=allQuotes.map(q=>
    '<tr data-quote-row="'+escapeHtml(q.id)+'" aria-selected="'+(quote?.id===q.id)+'">'+
    '<td><b>'+escapeHtml(q.reference)+'</b></td>'+
    '<td>'+escapeHtml(q.issuerName||companies.find(c=>c.id===companyId)?.details.name||"—")+'</td>'+
    '<td>'+escapeHtml(q.recipientName||"—")+
    (q.recipientOrganizationId?' <span class="muted">CRM</span>':' <span class="muted">MANUALE</span>')+'</td>'+
    '<td>'+escapeHtml(q.subject)+'</td><td>'+escapeHtml(q.status)+'</td>'+
    '<td>'+escapeHtml(q.revisions)+'</td>'+
    '<td><button type="button" data-open="'+escapeHtml(q.id)+'">Apri</button>'+
    '<button type="button" class="button-danger" data-delete-quote="'+escapeHtml(q.id)+'">Cancella</button>'+
    (selectForCommesse?'<button type="button" data-pick-commesse="'+escapeHtml(q.id)+'">Usa in Commesse</button>':'')+
    '</td></tr>').join("")||
    '<tr><td colspan="7" class="empty">Nessun preventivo disponibile per questo emittente.</td></tr>';
  $("batch").innerHTML=batches.map(b=>'<option value="'+escapeHtml(b.batchId)+'">'+escapeHtml(b.sourceProjectId+" / "+b.sourceRevision)+"</option>").join("");
  $("demoInfo").textContent=allQuotes.length+" preventivi complessivi · "+
    "Emittente attivo: "+(companies.find(c=>c.id===companyId)?.details.name||"—")+
    (accessMeta?.storage==="postgres"?" · PostgreSQL Neon":" · DEMO RAM");
  dossierProject = batches[0]?.sourceProjectId || "farmacia-demo";
  await loadDossier();
  renderCatalog();renderPrices();renderFinancialSettings();
  renderQuote();renderGeneralQuote();renderQuoteChapterSummary();
}
function renderCatalog(){
  const s=$("searchCatalog").value.toLowerCase();
  $("catalog").innerHTML=catalog.filter(x=>(x.code+" "+x.title).toLowerCase().includes(s)).map(w=>
    '<div class="cardline"><b>'+escapeHtml(w.code)+'</b> '+escapeHtml(w.title)+
    '<div class="hint">'+escapeHtml(w.category+" · "+w.unit+" · "+w.scope)+'</div>'+
    '<button data-add="'+w.id+'">Aggiungi riga</button></div>').join("");
}
function renderPrices(){
  const host=$("priceList");
  const search=$("priceSearch").value.trim().toLocaleLowerCase("it");
  const categoryControl=$("priceCategory");
  const previousCategory=categoryControl.value;
  const categories=[...new Set(catalog.map(w=>w.category||"").filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"it"));
  categoryControl.innerHTML='<option value="">Tutte le categorie</option>'+
    categories.map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join("");
  categoryControl.value=categories.includes(previousCategory)?previousCategory:"";
  const matches=catalog.filter(w=>{
    if(categoryControl.value&&w.category!==categoryControl.value)return false;
    return !search||[w.code,w.title,w.description,w.category,w.subcategory]
      .some(x=>String(x||"").toLocaleLowerCase("it").includes(search));
  }).sort((a,b)=>
    String(a.category||"").localeCompare(String(b.category||""),"it")||
    String(a.subcategory||"").localeCompare(String(b.subcategory||""),"it")||
    String(a.code||"").localeCompare(String(b.code||""),"it"));
  $("priceCount").textContent=matches.length+" di "+catalog.length+" voci";
  if(!matches.length){
    host.innerHTML='<p class="empty">Nessuna voce del prezziario corrisponde ai filtri.</p>';
    return;
  }
  const priceByWork=new Map(prices.map(p=>[p.workItemId,p]));
  host.innerHTML='<table class="prices-table"><thead><tr>'+
    '<th>Codice</th><th>Descrizione</th><th>Categoria</th>'+
    '<th>Sottocategoria</th><th>U.M.</th><th>Prezzo vendita (€)</th>'+
    '<th>Azioni</th></tr></thead><tbody>'+
    matches.map(w=>{
      const p=priceByWork.get(w.id)||{};
      const privateItem=w.scope===1||String(w.scope).toLowerCase()==="private";
      const readonly=privateItem?'':' readonly title="Voce condivisa: classificazione non modificabile dall’emittente"';
      const currentPrice=p.manualSalePrice==null?'':String(p.manualSalePrice);
      return '<tr data-price="'+escapeHtml(w.id)+'">'+
        '<td class="price-code">'+escapeHtml(w.code)+'</td>'+
        '<td class="price-description" title="'+escapeHtml(w.description||w.title)+'">'+
          escapeHtml(w.title)+'</td>'+
        '<td><input data-field="category" aria-label="Categoria '+escapeHtml(w.code)+
          '" maxlength="100" value="'+escapeHtml(w.category||"")+'"'+readonly+'></td>'+
        '<td><input data-field="subcategory" aria-label="Sottocategoria '+escapeHtml(w.code)+
          '" maxlength="120" value="'+escapeHtml(w.subcategory||"")+'"'+readonly+'></td>'+
        '<td>'+escapeHtml(w.unit||"—")+'</td>'+
        '<td><input data-field="manualSalePrice" type="number" step=".0001" min="0" '+
          'aria-label="Prezzo '+escapeHtml(w.code)+'" placeholder="—" value="'+
          escapeHtml(currentPrice)+'"></td>'+
        '<td><button type="button" data-saveprice="'+escapeHtml(w.id)+
          '">Salva</button></td></tr>';
    }).join('')+'</tbody></table>';
}

function showSelectedChapter(){
  const id=$("chapterFilter").value;
  return quote?.draft.chapters.some(c=>c.id===id)?id:null;
}
function lineById(id){
  if(!quote)return null;
  for(const c of quote.draft.chapters)
    for(const l of c.lines)if(l.id===id)return l;
  return null;
}
function lineEditValues(){
  return {
    quantity:$("editLineQuantity").value,price:$("editLinePrice").value,
    locked:$("editLineLocked").checked,
    chapterId:$("editLineChapter").value,groupId:$("editLineGroup").value
  };
}
function lineEditDirty(){
  return toolMode==="editLine" && selectedLineId &&
    JSON.stringify(lineEditValues())!==lineEditBaseline;
}
function showTool(mode){
  const mapping={chapter:"toolChapter",group:"toolGroup",materials:"toolMaterials",section:"toolSection",
    line:"toolLine",image:"toolImage",editLine:"toolEditLine"};
  if(!mapping[mode])return false;
  if(mode!==toolMode&&lineEditDirty()&&!confirm(
     "La voce contiene modifiche non salvate. Scartarle?"))return false;
  toolMode=mode;
  for(const [key,id] of Object.entries(mapping))$(id).hidden=key!==mode;
  document.querySelectorAll("[data-tool]").forEach(button=>
    button.setAttribute("aria-pressed",String(button.dataset.tool===mode)));
  $("toolStatus").textContent=mode==="editLine"?
    "Modifica la voce selezionata e premi Salva voce.":
    "Operazione: "+({chapter:"Capitolo",group:"Gruppo",materials:"Distinta materiali",
     section:"Sezione esterna",line:"Voce",image:"Immagine"})[mode]+
    ". Prima scegli il capitolo nel filtro quando necessario.";
  if(mode==="group")renderGroupEditor();
  if(mode==="section")renderSectionList();
  if(mode==="image")renderExternalBlocks();
  return true;
}
function renderChapterFilter(){
  const previous=$("chapterFilter").value||"all";
  const chapters=quote?.draft.chapters||[];
  $("chapterFilter").innerHTML='<option value="all">Tutti</option>'+
    chapters.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.title)+'</option>').join("");
  $("chapterFilter").value=chapters.some(c=>c.id===previous)?previous:"all";
  if(pendingChapterFocus&&chapters.some(c=>c.id===pendingChapterFocus))
    $("chapterFilter").value=pendingChapterFocus;
  pendingChapterFocus=null;
  lastChapterFilter=$("chapterFilter").value;
  $("chapterToInsert").innerHTML=chapterTemplates.filter(x=>x.active).map(c=>
    '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.title)+'</option>').join("");
  const current=$("chapterFilter").value;
  $("sectionChapter").innerHTML='<option value="">Sezione generale</option>'+
    chapters.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.title)+'</option>').join("");
  if(current!=="all")$("sectionChapter").value=current;
  $("newLineGroup").innerHTML=groupOptions(chapters.find(c=>c.id===current));
  renderGroupEditor();
}
function groupOptions(chapter,selected=null){
  return '<option value="">Voce autonoma del capitolo</option>'+
    (chapter?.groups||[]).slice().sort((a,b)=>a.order-b.order)
      .map(g=>'<option value="'+escapeHtml(g.id)+'"'+
        (g.id===selected?' selected':'')+'>'+escapeHtml(g.title)+'</option>').join('');
}
function currentGroupChapter(){
  const id=$("chapterFilter").value;
  return quote?.draft.chapters.find(c=>c.id===id)||null;
}
function clearGroupForm(){
  $("editingGroupId").value="";
  $("groupTitle").value="";$("groupQuantity").value="";
  $("groupUnitPrice").value="";$("groupSource").value="";
  $("groupNotes").value="";$("groupOrder").value="10";
  $("groupSave").textContent="Salva gruppo";
}
function loadGroupForm(group){
  $("editingGroupId").value=group.id;
  $("groupTitle").value=group.title;
  $("groupOrder").value=group.order;
  $("groupQuantity").value=group.quantity??"";
  $("groupUnitPrice").value=group.unitSalePrice??"";
  $("groupSource").value=group.unitPriceSource||"";
  $("groupNotes").value=group.notes||"";
  $("groupSave").textContent="Aggiorna gruppo";
}
function renderGroupEditor(){
  const chapter=currentGroupChapter(),host=$("groupList");
  $("groupSave").disabled=!chapter;
  if(!chapter){
    host.innerHTML='<p class="hint">Seleziona un Capitolo nel filtro per gestire i gruppi.</p>';
    return;
  }
  const groups=(chapter.groups||[]).slice().sort((a,b)=>a.order-b.order);
  host.innerHTML=groups.length?groups.map(g=>{
    const count=chapter.lines.filter(l=>l.groupId===g.id).length;
    return '<div class="group-row"><b>'+escapeHtml(g.title)+'</b>'+
      '<span class="hint">'+count+' voci · Quantità: '+
        escapeHtml(g.quantity??"non indicata")+
        (g.unitSalePrice!=null?' · Prezzo: '+fmt(g.unitSalePrice):' · Prezzo non indicato')+
      '</span><button type="button" data-group-edit="'+escapeHtml(g.id)+'">Modifica</button>'+
      '<button type="button" data-group-delete="'+escapeHtml(g.id)+
      '" class="button-danger"'+(count?' disabled title="Sposta prima le voci"':'')+
      '>Elimina</button></div>';
  }).join(""):'<p class="hint">Nessun gruppo. Le voci appartengono direttamente al capitolo.</p>';
}

function renderFinancialSettings(){
  const d=quote?.draft;
  $("conditions").value=d?.conditions||"";
  const print=d?.printSettings||{};
  $("printProfile").value=print.template||"Standard";
  $("printFirstPage").value=print.firstPageNumber??1;
  $("printCoverTitle").value=print.coverTitle||"";
  $("printCoverRecipient").value=print.coverRecipient||"";
  $("printCoverAddress").value=print.coverAddress||"";
  $("printPaymentTerms").value=print.paymentTerms||"";
  $("printBankReference").value=print.bankReference||"";
  $("printCover").checked=print.cover!==false;
  $("printShowCodes").checked=!!print.showCodes;
  $("printShowQty").checked=!!print.showLineQuantities;
  $("printSections").checked=!!print.includeSections;
  $("printConditions").checked=!!print.includeConditions;
  $("printPoascoPhotos").checked=!!print.usePoascoExampleImages;
  $("vat").value=value(d?.options?.vatRate);
  $("financialFields").innerHTML=[["general","Spese generali"],
    ["contingency","Imprevisti"],["discount","Sconto"]].map(([key,label])=>{
    const adjustment=d?.options?.[key];
    return '<label>'+label+'<select data-adjust="'+key+'">'+
      '<option value="">Non applicato</option>'+
      '<option value="Amount" '+(adjustment?.kind===0?'selected':'')+'>Importo €</option>'+
      '<option value="Percentage" '+(adjustment?.kind===1?'selected':'')+'>Percentuale %</option>'+
      '</select><input data-adjustvalue="'+key+'" type="number" step=".01" min="0" '+
      'placeholder="Valore" value="'+value(adjustment?.value)+'"></label>';
  }).join("");
  $("revisions").innerHTML=(quote?.revisions||[]).map(r=>
    '<div class="rev">Revisione '+r.number+' — '+escapeHtml(r.reason)+
    ' <button type="button" data-historic="'+r.number+'">PDF storico</button></div>').join("")||
    '<p class="hint">Nessuna revisione archiviata.</p>';
  for(const id of ["save","revision","previewPrices","pdf"]){
    $(id).disabled=!quote;
  }
}
function renderSectionList(){
  const host=$("sectionList");
  if(!quote){host.innerHTML='<p class="hint">Apri prima una bozza.</p>';return}
  host.innerHTML='<h4>Sezioni esterne inserite</h4>'+
    [...(quote.draft.sections||[])].sort((a,b)=>a.order-b.order).map(section=>
    '<div class="cardline"><b>'+escapeHtml(section.title)+'</b>'+
    '<div class="hint">'+escapeHtml(section.text.slice(0,90))+'</div>'+
    '<button type="button" data-delete-section="'+escapeHtml(section.id)+'">Rimuovi sezione</button></div>').join("") ;
}
function renderBodyGrid(){
  const host=$("editor");
  if(!quote){
    host.innerHTML='<p class="empty">Apri o crea un preventivo dalla scheda Generale.</p>';
    $("bodyDocumentLabel").textContent="Nessun preventivo aperto";
    $("totals").textContent="";
    return;
  }
  const d=quote.draft,filter=$("chapterFilter").value||"all";
  $("bodyDocumentLabel").textContent=quote.reference+" · "+d.recipient.name;
  const sections=d.sections||[],blocks=d.blocks||[],rows=[];
  function addDocumentRows(chapterId){
    for(const section of sections.filter(x=>(x.chapterId||null)===(chapterId||null))
        .sort((a,b)=>a.order-b.order))
      rows.push('<tr class="document-row"><td colspan="5"><b>Sezione esterna: '+
        escapeHtml(section.title)+'</b><div class="hint">'+
        escapeHtml(section.text.slice(0,220))+'</div></td>'+
        '<td><button type="button" data-show-section>Sezioni</button></td></tr>');
    for(const block of blocks.filter(x=>chapterId?x.chapterId===chapterId:!x.chapterId))
      rows.push('<tr class="document-row"><td colspan="5"><b>Immagine: '+
        escapeHtml(block.title||"Allegato")+'</b><div class="hint">'+
        escapeHtml(block.caption||"")+'</div></td>'+
        '<td><button type="button" data-show-image>Immagini</button></td></tr>');
  }
  function lineRow(line,group=null){
    const multiplier=group?.quantity??1;
    const effectiveQty=line.quantity==null?null:Number(line.quantity)*Number(multiplier);
    const value=(effectiveQty!=null&&line.saleUnitPrice!=null)
      ?fmt(effectiveQty*Number(line.saleUnitPrice)):"Da definire";
    rows.push('<tr class="body-line-row '+(group?'group-child ':'')+
      (selectedLineId===line.id?'selected':'')+
      '" data-select-line="'+escapeHtml(line.id)+'" tabindex="0" role="button" '+
      'aria-label="Modifica voce '+escapeHtml(line.code)+'"><td><b>'+
      escapeHtml(line.code)+'</b> — '+escapeHtml(line.description)+
      (line.verify?' <span class="badge">DA VERIFICARE</span>':'')+'</td>'+
      '<td class="align-right">'+escapeHtml(effectiveQty??"—")+'</td>'+
      '<td>'+escapeHtml(line.unit)+'</td>'+
      '<td class="align-right">'+(line.saleUnitPrice==null?"—":fmt(line.saleUnitPrice))+'</td>'+
      '<td class="align-right"><b>'+value+'</b></td>'+
      '<td><button type="button" data-edit-line="'+escapeHtml(line.id)+'">Modifica</button></td></tr>');
  }
  if(filter==="all")addDocumentRows(null);
  for(const chapter of [...d.chapters].sort((a,b)=>a.order-b.order)){
    if(filter!=="all"&&filter!==chapter.id)continue;
    const direct=chapter.lines.filter(l=>!l.groupId);
    const groups=(chapter.groups||[]).slice().sort((a,b)=>a.order-b.order);
    const cTotal=chapter.documentedSubtotal;
    const capLabel=cTotal!=null?
      'Totale autonomo · '+fmt(cTotal):
      'Capitolo con '+groups.length+' gruppi e '+direct.length+' voci autonome';
    rows.push('<tr class="body-chapter-row"><td colspan="4"><b>CAPITOLO: '+
      escapeHtml(chapter.title)+'</b> <span class="muted">('+
      groups.length+' gruppi, '+chapter.lines.length+' voci)</span></td>'+
      '<td class="align-right">'+capLabel+'</td>'+
      '<td>'+(chapter.lines.length===0&&groups.length===0&&cTotal==null?
        '<button type="button" data-remove-chapter="'+escapeHtml(chapter.id)+
        '" title="Rimuovi solo se vuoto">Rimuovi</button>':'')+'</td></tr>');
    addDocumentRows(chapter.id);
    direct.forEach(l=>lineRow(l));
    for(const group of groups){
      const members=chapter.lines.filter(l=>l.groupId===group.id);
      const priced=members.filter(l=>l.quantity!=null&&l.saleUnitPrice!=null);
      const analytic=priced.reduce((n,l)=>n+Number(l.quantity)*Number(l.saleUnitPrice)*
        Number(group.quantity??1),0);
      const complete=members.length>0&&priced.length===members.length;
      const ownPrice=group.unitSalePrice!=null&&group.quantity!=null;
      const ownTotal=ownPrice?Number(group.unitSalePrice)*Number(group.quantity):null;
      const description=ownPrice
        ? 'Prezzo gruppo · '+fmt(group.unitSalePrice)+' × '+group.quantity+
          ' = '+fmt(ownTotal)
        :complete?'Computo gruppo · '+fmt(analytic):'Prezzi gruppo non completi';
      rows.push('<tr class="body-group-row"><td colspan="4"><b>GRUPPO: '+
        escapeHtml(group.title)+'</b> <span class="muted">('+
        members.length+' voci · Quantità: '+escapeHtml(group.quantity??"non dichiarata")+
        ')</span></td><td class="align-right">'+description+'</td>'+
        '<td><button type="button" data-group-select="'+escapeHtml(group.id)+
        '" data-group-chapter="'+escapeHtml(chapter.id)+'">Modifica</button></td></tr>');
      members.forEach(l=>lineRow(l,group));
    }
  }
  host.innerHTML='<div class="body-grid-scroll"><table class="body-quote-table">'+
    '<thead><tr><th>Codice / Descrizione</th><th>Quantità effettiva</th>'+
    '<th>U.M.</th><th>Prezzo unitario</th><th>Importo analitico</th>'+
    '<th>Azioni</th></tr></thead><tbody>'+
    (rows.join("")||'<tr><td colspan="6" class="empty">Nessuna voce inserita.</td></tr>')+
    '</tbody></table></div>';
  refreshTotals();
}

function renderQuote(){
  renderChapterFilter();
  renderBodyGrid();
  renderSectionList();
  renderExternalBlocks();
  renderGroupEditor();
}
function selectLine(id){
  const line=lineById(id);
  if(!line)return;
  if(lineEditDirty()&&!confirm("Scartare le modifiche alla voce selezionata?"))return;
  selectedLineId=id;
  if(!showTool("editLine"))return;
  $("editingLineTitle").textContent=line.code+" — "+line.description+" ("+line.unit+")";
  const chapter=quote.draft.chapters.find(c=>c.lines.some(l=>l.id===id));
  $("editLineChapter").innerHTML=quote.draft.chapters.map(c=>
    '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.title)+'</option>').join('');
  $("editLineChapter").value=chapter.id;
  $("editLineGroup").innerHTML=groupOptions(chapter,line.groupId||null);
  $("editLineQuantity").value=value(line.quantity);
  $("editLinePrice").value=value(line.saleUnitPrice);
  $("editLineLocked").checked=!!line.lockedPrice;
  lineEditBaseline=JSON.stringify(lineEditValues());
  // Reflect selection without losing the contents of the editor.
  document.querySelectorAll("[data-select-line]").forEach(row=>
    row.classList.toggle("selected",row.dataset.selectLine===id));
}
async function refreshTotals(){
  if(!quote)return;
  try{
    const t=await request("/api/quotes/"+quote.id+"/totals?companyId="+companyId);
    $("totals").innerHTML='<p class="sum">Lavorazioni: '+fmt(t.workBase)+
      ' | Imponibile: '+fmt(t.taxable)+' | '+(t.vatConfigured?'Totale IVA inclusa: '+fmt(t.totalIncludingVat):
        'IVA NON CONFIGURATA · Totale IVA esclusa: '+fmt(t.totalExcludingVat))+
      (t.partial?' <span class="badge">TOTALE PARZIALE</span>':'')+'</p>';
  }catch(e){status(e.message,true)}
}
function collect(){
  if(!quote)throw Error("Nessuna bozza aperta");
  const d=quote.draft;
  d.conditions=$("conditions").value;
  d.printSettings={
    template:$("printProfile").value,
    cover:$("printCover").checked,
    coverTitle:$("printCoverTitle").value.trim()||null,
    coverRecipient:$("printCoverRecipient").value.trim()||null,
    coverAddress:$("printCoverAddress").value.trim()||null,
    showCodes:$("printShowCodes").checked,
    showLineQuantities:$("printShowQty").checked,
    includeSections:$("printSections").checked,
    includeConditions:$("printConditions").checked,
    usePoascoExampleImages:$("printPoascoPhotos").checked,
    paymentTerms:$("printPaymentTerms").value.trim()||null,
    bankReference:$("printBankReference").value.trim()||null,
    firstPageNumber:Number($("printFirstPage").value)
  };
  if(!Number.isInteger(d.printSettings.firstPageNumber)||
     d.printSettings.firstPageNumber<1||d.printSettings.firstPageNumber>9999)
    throw Error("Il numero iniziale delle pagine deve essere compreso tra 1 e 9999.");
  d.options.vatRate=number($("vat").value);
  if(d.options.vatRate!=null && (d.options.vatRate<0||d.options.vatRate>100))
    throw Error("L'IVA deve essere compresa tra 0 e 100");
  for(const key of ["general","contingency","discount"]){
    const kind=document.querySelector('[data-adjust="'+key+'"]').value;
    const val=document.querySelector('[data-adjustvalue="'+key+'"]').value;
    d.options[key]=kind===""?null:{kind:kind==="Amount"?0:1,value:number(val)};
    if(kind!==""&&(val===""||Number(val)<0))throw Error("Valore non valido per "+key);
  }
  if(toolMode==="editLine"&&selectedLineId){
    const l=lineById(selectedLineId);
    if(l){
      const quantity=number($("editLineQuantity").value);
      const salePrice=number($("editLinePrice").value);
      if((quantity!=null&&(!Number.isFinite(quantity)||quantity<0))||
        (salePrice!=null&&(!Number.isFinite(salePrice)||salePrice<0)))
          throw Error("Quantità e prezzo devono essere numeri non negativi");
      const changed=salePrice!==l.saleUnitPrice;
      const selectedGroup=$("editLineGroup").value||null;
      const chapter=d.chapters.find(c=>c.lines.some(x=>x.id===l.id));
      const destination=d.chapters.find(c=>c.id===$("editLineChapter").value);
      if(!destination)throw Error("Capitolo destinazione non valido.");
      if(selectedGroup&&!(destination.groups||[]).some(g=>g.id===selectedGroup))
        throw Error("Il gruppo non appartiene al capitolo scelto.");
      // Changing Chapter uses the dedicated authorized relocation endpoint
      // AFTER this draft has been saved in the original chapter.
      if(destination.id===chapter?.id)l.groupId=selectedGroup;
      l.quantity=quantity;
      l.saleUnitPrice=salePrice;
      l.lockedPrice=$("editLineLocked").checked||changed;
      lineEditBaseline=JSON.stringify(lineEditValues());
    }
  }
  return d;
}
async function save(){await request("/api/quotes/"+quote.id+"/draft?companyId="+companyId,json("PUT",collect())); await openQuote(quote.id)}
function clearOpenedQuote(){
  if(bimCadWindow&&!bimCadWindow.closed)bimCadWindow.close();
  bimCadWindow=null;bimCadOpen=null;bimCadProjects=[];bimCadTypes=[];
  quote=null;selectedLineId=null;pendingChapterFocus=null;
  if(toolMode==="editLine"){toolMode="line";showTool("line");}
  renderQuote();renderGeneralQuote();renderQuoteChapterSummary();
  void refreshBimCad();
  showStep("general",true);
}
function closeCurrentQuote(){
  if(!quote)return;
  if(!confirm("Chiudere il preventivo "+quote.reference+
      "? Le modifiche non salvate e gli eventuali disegni BIM-CAD ancora aperti andranno persi."))return;
  clearOpenedQuote();
  status("Preventivo chiuso. Selezionane uno dalla scheda Generale.");
}
async function deleteQuoteFromArchive(id){
  const choice=allQuotes.find(item=>item.id===id);
  if(!choice)throw Error("Preventivo non presente nell'archivio aggiornato.");
  const message="Cancellare definitivamente il preventivo "+choice.reference+
    " — "+choice.subject+"?\nEmittente: "+choice.issuerName+"\n"+
    "Saranno rimossi anche tutte le revisioni, gli allegati e i progetti BIM-CAD associati. "+
    "Questa operazione non può essere annullata.";
  if(!confirm(message))return;
  await request("/api/quotes/"+encodeURIComponent(choice.id)+
    "?companyId="+encodeURIComponent(choice.companyId),{method:"DELETE"});
  if(quote?.id===choice.id)clearOpenedQuote();
  await refresh();
  status("Preventivo "+choice.reference+" cancellato dall'archivio DEMO.");
}
async function openQuote(id){
  const previousId=quote?.id;
  quote=await request("/api/quotes/"+id+"?companyId="+companyId);
  if(previousId!==id){
    if(bimCadOpen&&bimCadOpen.quoteId!==id){
      if(bimCadWindow&&!bimCadWindow.closed)bimCadWindow.close();
      bimCadWindow=null;bimCadOpen=null;
    }
    selectedLineId=null;
    if(toolMode==="editLine")toolMode="line";
    $("chapterFilter").value="all";
  }
  renderFinancialSettings();renderQuote();renderGeneralQuote();renderQuoteChapterSummary();
}
async function downloadPdf(revision){
  if(!quote)return;
  const postfix=revision?"&revision="+revision:"";
  const pdf=await request("/api/quotes/"+quote.id+"/pdf?companyId="+companyId+postfix);
  const url=URL.createObjectURL(pdf);const a=document.createElement("a");
  a.href=url;a.download=quote.reference+(revision?"-r"+revision:"")+
    (accessMeta?.storage==="postgres"?"":"-DEMO")+".pdf";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function pricePreview(){
  await save();
  const plan=await request("/api/quotes/"+quote.id+"/price-preview?companyId="+companyId);
  if(!plan.preview.changes.length){alert("Nessuna differenza. Prezzi manuali bloccati invariati.");return}
  const description=plan.preview.changes.map(c=>c.description+": "+fmt(c.before)+" → "+fmt(c.after)).join("\n");
  if(!confirm("Confermi una NUOVA REVISIONE con questi aggiornamenti?\n\n"+description+
    "\n\nTotale prima: "+fmt(plan.preview.previousTotal)+"\nTotale dopo: "+fmt(plan.preview.proposedTotal)))return;
  await request("/api/quotes/"+quote.id+"/apply-prices",json("POST",{
    companyId,confirmationToken:plan.confirmationToken}));await openQuote(quote.id);
}

async function loadDossier(){
  dossier=await request("/api/dossier?companyId="+companyId+"&projectId="+encodeURIComponent(dossierProject));
  $("externalAsset").innerHTML=dossier.map(a=>
    '<option value="'+a.artifactId+'|'+a.version+'">'+escapeHtml(a.title+
      " · "+a.sourceRevision+" (v"+a.version+")")+'</option>').join("");
  $("externalProject").value=dossierProject;
  renderExternalBlocks();
}
function externalOptions(){
  if(!quote)return;
  const chapters=quote.draft.chapters;
  const previous=$("externalChapter").value || showSelectedChapter();
  $("externalChapter").innerHTML=chapters.map(c=>
    '<option value="'+c.id+'">'+escapeHtml(c.title)+'</option>').join("");
  if(chapters.some(c=>c.id===previous))$("externalChapter").value=previous;
  chooseExternalLines();
}
function chooseExternalLines(){
  if(!quote)return;
  const chapter=quote.draft.chapters.find(c=>c.id===$("externalChapter").value);
  $("externalLine").innerHTML=(chapter?.lines||[]).map(l=>
    '<option value="'+l.id+'">'+escapeHtml(l.code+" · "+l.description)+'</option>').join("");
}
function renderExternalBlocks(){
  const host=$("externalList");
  if(!quote){host.innerHTML='<p class="hint">Apri un preventivo.</p>';return}
  externalOptions();
  const places=["Documento","Copertina","Capitolo","Voce","Allegato finale"];
  host.innerHTML=[...(quote.draft.blocks||[])].sort((a,b)=>a.order-b.order).map(b=>
    '<div class="cardline"><b>'+escapeHtml(places[b.placement]||"Elemento")+" · "+escapeHtml(b.title)+
    '</b><div class="hint">'+escapeHtml(b.caption)+" · "+escapeHtml(b.projectId||"")+
    " v"+b.artifactVersion+'</div><button data-delete-external="'+b.id+'">Rimuovi</button></div>'
  ).join("")||'<p class="hint">Nessun elemento esterno inserito.</p>';
}
async function addExternal(){
  if(!quote)throw Error("Apri prima un preventivo");
  if(!dossier.length)throw Error("Nessun elemento nel dossier demo per il progetto");
  const [artifactId,version]=$("externalAsset").value.split("|");
  const placement=Number($("externalPlace").value);
  const chapterId=[2,3].includes(placement)?$("externalChapter").value:null;
  const lineId=placement===3?$("externalLine").value:null;
  if(placement===3&&!lineId)throw Error("Selezionare una voce");
  if([2,3].includes(placement)&&!chapterId)throw Error("Selezionare un capitolo");
  const caption=$("externalCaption").value.trim(),order=Number($("externalOrder").value);
  await save(); // do not lose pending edits in the document
  await request("/api/quotes/"+quote.id+"/external",json("POST",{
    companyId,projectId:dossierProject,artifactId,version:Number(version),
    placement,chapterId,lineId,caption,order
  }));
  await openQuote(quote.id);
}
async function previewExternal(){
  if(!dossier.length)throw Error("Il dossier demo non contiene immagini");
  const [artifactId,version]=$("externalAsset").value.split("|");
  const data=await request("/api/dossier/"+artifactId+"/image?companyId="+companyId+
    "&projectId="+encodeURIComponent(dossierProject)+"&version="+version);
  if(lastImageUrl)URL.revokeObjectURL(lastImageUrl);
  lastImageUrl=URL.createObjectURL(data);
  $("externalImage").src=lastImageUrl;
  $("externalImage").hidden=false;
}
$("externalChapter").onchange=chooseExternalLines;
$("externalProject").onchange=()=>guard(async()=>{dossierProject=$("externalProject").value.trim();await loadDossier()});
$("externalPreview").onclick=()=>guard(previewExternal);
$("externalAdd").onclick=()=>guard(addExternal);
$("externalList").onclick=e=>guard(async()=>{
  const b=e.target.closest("[data-delete-external]");
  if(!b||!quote)return;
  if(!confirm("Rimuovere l'elemento esterno dalla bozza? Le revisioni storiche restano invariate."))return;
  await request("/api/quotes/"+quote.id+"/external/"+b.dataset.deleteExternal+
    "?companyId="+companyId,{method:"DELETE"});
  await openQuote(quote.id);
});

$("appVersion").textContent="V"+APP_VERSION;
$("infoVersion").textContent="V"+APP_VERSION;
$("infoButton").onclick=()=>$("infoDialog").showModal();
$("closeInfo").onclick=()=>$("infoDialog").close();
$("manageIssuer").onclick=()=>$("issuerDialog").showModal();
$("closeIssuer").onclick=()=>$("issuerDialog").close();
$("openContacts").onclick=openContactsLegacy;
$("loadFromContacts").onclick=loadFromContacts;
$("exitButton").onclick=()=>{
 if(!confirm("Terminare la sessione Preventivi? Le modifiche non salvate non saranno conservate."))return;
 localStorage.removeItem("preventivi-demo-session");
 demoSession=crypto.randomUUID(); // Old in-memory session is abandoned, never deleted in CRM.
 quote=null;updateHeaderQuote();
 if(crmPopup&&!crmPopup.closed)crmPopup.close();
 if(organizationPopup&&!organizationPopup.closed)organizationPopup.close();
 accessToken="";
 sessionStorage.removeItem(accessTransactionKey);
 showAccess(true);
 $("accessLogin").disabled=false;
 accessFeedback("Sessione Preventivi terminata. FastPharma Access rimane autenticato.");
};
$("reenter").onclick=()=>location.reload();
$("apiBase").value=apiBase;
$("connect").onclick=()=>guard(connect);
$("resetDemo").onclick=()=>guard(async()=>{
  if(!confirm("Ripristinare gli ARCHIVI DEMO ORIGINALI? Le modifiche effettuate ai dati sintetici andranno perse."))return;
  await request("/api/demo/reset",json("POST",{}));await connect();
});
$("company").onchange=()=>guard(()=>chooseIssuer($("company").value));
$("issuerCards").onclick=e=>{const b=e.target.closest("[data-issuer]");if(b)guard(()=>chooseIssuer(b.dataset.issuer))};
$("issuerNew").onclick=beginNewIssuer;
$("issuerCancel").onclick=renderIssuerForm;
$("issuerForm").onsubmit=e=>{e.preventDefault();guard(saveIssuer)};
$("issuerLogoFile").onchange=()=>guard(async()=>{
  const file=$("issuerLogoFile").files?.[0];
  if(!file)return;
  if(file.type!=="image/jpeg" || file.size>180000 || file.size<60)
    throw Error("Seleziona un logo JPEG valido, massimo 180 KB.");
  const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error("Impossibile leggere il logo."));
    reader.onload=()=>resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const image=new Image();
  await new Promise((resolve,reject)=>{
    image.onload=resolve;
    image.onerror=()=>reject(Error("Immagine JPEG non valida."));
    image.src=data;
  });
  if(image.naturalWidth>3000||image.naturalHeight>3000 ||
     !image.naturalWidth||!image.naturalHeight)
    throw Error("Dimensioni logo non valide (massimo 3000 px).");
  issuerLogoData={
    logoJpegBase64:String(data).split(",")[1],
    logoWidthPx:image.naturalWidth,
    logoHeightPx:image.naturalHeight
  };
  updateIssuerLogoPreview();
});
$("issuerLogoClear").onclick=()=>{
  issuerLogoData={logoJpegBase64:null,logoWidthPx:null,logoHeightPx:null};
  $("issuerLogoFile").value="";
  updateIssuerLogoPreview();
};
$("issuerApplyToQuote").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Seleziona un preventivo.");
  if(creatingIssuer||issuerIsDirty())
    throw Error("Salva prima le modifiche all'anagrafica emittente.");
  const id=quote.id;
  await save();
  await request("/api/quotes/"+id+"/issuer-print-from-master?companyId="+companyId,
    {method:"PUT"});
  await openQuote(id);
  status("Logo e piè di pagina acquisiti dall'emittente nel preventivo aperto. "+
    "Le revisioni storiche non sono state modificate.");
});
$("recipientSelect").onchange=()=>guard(()=>chooseRecipient($("recipientSelect").value));
$("recipientImport").onclick=()=>guard(openCrmImport);
$("crmImportKind").onchange=()=>guard(loadCrmCandidates);
$("crmImportSearchButton").onclick=()=>guard(loadCrmCandidates);
$("crmImportResults").onclick=e=>{
  const button=e.target.closest("[data-crm-id]");
  if(button)guard(()=>chooseCrmCandidate(button.dataset.crmId));
};
$("recipientNew").onclick=()=>guard(async()=>{
  if(recipientIsDirty()&&!confirm("Scartare le modifiche non salvate al destinatario?"))return;
  beginNewRecipient();
});
$("recipientCancel").onclick=renderRecipientForm;
$("recipientForm").onsubmit=e=>{e.preventDefault();guard(saveRecipient)};
$("generalSave").onclick=()=>guard(saveGeneral);
$("quoteChapterSummary").onclick=e=>{
  const button=e.target.closest("[data-save-chapter-total]");
  if(!button||!quote)return;
  guard(async()=>{
    const chapterId=button.dataset.saveChapterTotal;
    const row=button.closest("[data-chapter-total]");
    const raw=row.querySelector("[data-total-amount]").value.trim();
    const source=row.querySelector("[data-total-source]").value.trim();
    const amount=raw===""?null:Number(raw);
    if(amount!==null&&(!Number.isFinite(amount)||amount<0))
      throw Error("Il totale autonomo deve essere un importo positivo o nullo.");
    if(amount!==null&&!source)throw Error("Indica la fonte dell'importo autonomo.");
    const id=quote.id;
    if(quote)await save();
    await request("/api/quotes/"+id+"/chapters/"+chapterId+"/total",
      json("PUT",{companyId,amount,source:amount===null?null:source}));
    await openQuote(id);
    status(amount===null?"Totale autonomo rimosso.":"Totale autonomo del capitolo salvato su Neon.");
  });
};
$("templateList").onclick=e=>{
  const button=e.target.closest("[data-template-id]");
  if(button)chooseTemplate(button.dataset.templateId);
};
$("templateList").ondblclick=e=>{
  const button=e.target.closest("[data-template-id]");
  if(button)guard(()=>addTemplateToQuote(button.dataset.templateId));
};
$("templateForm").onsubmit=e=>{e.preventDefault();guard(saveTemplate)};
$("templateNew").onclick=()=>guard(async()=>{
  if(templateDirty()&&!confirm("Scartare le modifiche non salvate?"))return;
  newTemplate();
});
$("templateStatus").onclick=()=>guard(toggleTemplateStatus);
$("templateShowInactive").onchange=renderTemplateList;
$("tabIssuer").onclick=()=>showStep("general");
$("tabChapters").onclick=()=>showStep("chapters");
$("tabBimCad").onclick=()=>showStep("bimCad");
$("bimCadNext").onclick=()=>showStep("quote");
$("tabQuote").onclick=()=>showStep("quote");
$("tabPrices").onclick=()=>showStep("prices");
$("goQuote").onclick=()=>showStep("chapters");
$("goBody").onclick=()=>showStep("bimCad");
$("backGeneralFromChapters").onclick=()=>showStep("general");
$("backIssuer").onclick=()=>showStep("bimCad");
$("bimCadRefresh").onclick=()=>guard(refreshBimCad);
$("bimCadCreateForm").onsubmit=e=>{e.preventDefault();guard(createBimCad)};
$("bimCadGrid").onclick=e=>{
 const open=e.target.closest("[data-bimcad-open]");
 if(open){guard(()=>openBimCad(open.dataset.bimcadOpen));return;}
 const remove=e.target.closest("[data-bimcad-delete]");
 if(remove)guard(()=>deleteBimCad(remove.dataset.bimcadDelete));
};
$("reload").onclick=()=>guard(refresh);
$("closeQuote").onclick=closeCurrentQuote;
$("newQuote").onclick=()=>guard(async()=>{
  if(creatingIssuer||issuerIsDirty())
    throw Error("Salva o annulla le modifiche dell'emittente.");
  if(!companyId)throw Error("Seleziona un emittente in Gestione emittenti.");
  if(!selectedCrmOrganization||$("crmOrganization").value!==selectedCrmOrganization.id)
    throw Error("Seleziona un'Organizzazione tramite «Carica da Contatti».");
  const subject=$("newSubject").value.trim();
  if(!subject)throw Error("Inserire l'oggetto del nuovo preventivo.");
  $("newQuote").disabled=true;
  try{
    const created=await request("/api/quotes/from-organization",json("POST",{
      companyId,organization:selectedCrmOrganization,subject
    }));
    quote=created;await refresh();await openQuote(created.id);
    $("newSubject").value="";
    showStep("chapters");
    // Il nuovo selettore SSO non può creare note CRM: non trasferiamo cookie
    // né credenziali. Se il CRM legacy è già aperto, manteniamo il flusso
    // storico; altrimenti segnaliamo che la nota va registrata manualmente.
    if(crmPopup && !crmPopup.closed){
      try {
        await recordCrmNote(created);
        status("Preventivo "+created.reference+" creato; nota registrata in Contatti.");
      }catch(noteError){
        status("Preventivo creato, ma "+noteError.message,true);
        $("crmLinkStatus").textContent="Preventivo creato; nota CRM non confermata. Verifica lo storico Attività in Contatti.";
      }
    }else{
      status("Preventivo "+created.reference+" creato. Nessuna nota CRM automatica.");
      $("crmLinkStatus").textContent="Preventivo collegato all'Organizzazione. Per annotare l'attività apri Contatti.";
    }
  }finally{$("newQuote").disabled=false;}
});
$("quoteList").onclick=e=>{
 const removing=e.target.closest("[data-delete-quote]");
 if(removing){guard(()=>deleteQuoteFromArchive(removing.dataset.deleteQuote));return;}
 const selected=e.target.closest("[data-pick-commesse]");
 if(selected){guard(()=>chooseForCommesse(selected.dataset.pickCommesse));return;}
 const b=e.target.closest("[data-open]");if(b)guard(async()=>{
  if(issuerIsDirty()||recipientIsDirty())
    throw Error("Salva le anagrafiche prima di aprire un preventivo");
  const choice=allQuotes.find(x=>x.id===b.dataset.open);
  if(!choice)throw Error("Preventivo non trovato");
  if(choice.companyId!==companyId){
    await chooseIssuer(choice.companyId);
    if(companyId!==choice.companyId)return; // issuer switch cancelled
  }
  await openQuote(b.dataset.open);
  showStep("quote");
})};
$("searchCatalog").oninput=renderCatalog;
$("catalog").onclick=e=>guard(async()=>{
  const btn=e.target.closest("[data-add]");if(!btn||!quote)return;
  const chapterId=showSelectedChapter();
  if(!chapterId)throw Error("Seleziona un capitolo nel filtro a sinistra (non «Tutti»).");
  await save();
  await request("/api/quotes/"+quote.id+"/lines",json("POST",{
    companyId,chapterId,workId:btn.dataset.add,quantity:1,
    groupId:$("newLineGroup").value||null}));
  await openQuote(quote.id);
});
$("addWork").onclick=()=>guard(async()=>{
  await request("/api/catalog",json("POST",{companyId,code:$("newCode").value,title:$("newTitle").value,
    unit:$("newUnit").value,category:$("newCategory").value,
    subcategory:$("newSubcategory").value,description:""}));
  await refresh();
});
$("priceSearch").oninput=renderPrices;
$("priceCategory").onchange=renderPrices;
$("priceList").onclick=e=>guard(async()=>{
  const b=e.target.closest("[data-saveprice]");if(!b)return;
  const row=b.closest("[data-price]");
  const work=catalog.find(w=>w.id===b.dataset.saveprice);
  if(!work)throw Error("Voce non trovata nel catalogo.");
  const isPrivate=work.scope===1||String(work.scope).toLowerCase()==="private";
  const saleValue=row.querySelector('[data-field="manualSalePrice"]').value.trim();
  const payload={manualSalePrice:saleValue===""?null:number(saleValue)};
  if(isPrivate){
    payload.category=row.querySelector('[data-field="category"]').value.trim();
    payload.subcategory=row.querySelector('[data-field="subcategory"]').value.trim();
    if(!payload.category)throw Error("La categoria è obbligatoria.");
  }
  if(quote)await save();
  await request("/api/prices/"+companyId+"/"+b.dataset.saveprice,json("PUT",payload));
  await refresh();
  status("Voce "+work.code+" aggiornata nel prezziario dell'emittente.");
});
$("editor").onclick=e=>guard(async()=>{
  const groupButton=e.target.closest("[data-group-select]");
  if(groupButton){
    $("chapterFilter").value=groupButton.dataset.groupChapter;
    renderChapterFilter();renderBodyGrid();
    const chapter=currentGroupChapter();
    const group=(chapter?.groups||[]).find(g=>g.id===groupButton.dataset.groupSelect);
    if(group){showTool("group");loadGroupForm(group);}
    return;
  }
  const row=e.target.closest("[data-select-line]");
  if(row){selectLine(row.dataset.selectLine);return;}
  if(e.target.closest("[data-show-section]")){showTool("section");return}
  if(e.target.closest("[data-show-image]")){showTool("image");return}
  const chapterButton=e.target.closest("[data-remove-chapter]");
  if(chapterButton){
    const chapter=quote.draft.chapters.find(c=>c.id===chapterButton.dataset.removeChapter);
    if(!chapter||chapter.lines.length||(chapter.groups||[]).length)
      throw Error("Puoi rimuovere solo capitoli senza gruppi e voci.");
    if(!confirm("Rimuovere il capitolo vuoto «"+chapter.title+"» dal preventivo? L'archivio non cambia."))return;
    collect();
    quote.draft.chapters=quote.draft.chapters.filter(c=>c.id!==chapter.id);
    await save();
    renderQuoteChapterSummary();
    return;
  }
});
$("editor").onkeydown=e=>{
  if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-select-line]")){
    e.preventDefault();selectLine(e.target.dataset.selectLine);
  }
};
$("chapterFilter").onchange=()=>{
  if(lineEditDirty()&&!confirm("Scartare le modifiche non salvate alla voce?")){
    $("chapterFilter").value=lastChapterFilter;return;
  }
  lastChapterFilter=$("chapterFilter").value;
  selectedLineId=null;clearGroupForm();renderChapterFilter();
  if(toolMode==="editLine")showTool("line");
  renderBodyGrid();externalOptions();
};
$("insertChosenChapter").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Crea o apri un preventivo prima di inserire capitoli");
  const id=$("chapterToInsert").value;
  if(!id)throw Error("Non ci sono capitoli attivi nell'archivio");
  await addTemplateToQuote(id);
});
document.querySelectorAll("[data-tool]").forEach(button=>
  button.onclick=()=>showTool(button.dataset.tool));
$("groupNew").onclick=()=>{clearGroupForm();renderGroupEditor();};
$("groupList").onclick=e=>guard(async()=>{
  const chapter=currentGroupChapter();
  if(!chapter)return;
  const edit=e.target.closest("[data-group-edit]");
  if(edit){
    const group=(chapter.groups||[]).find(g=>g.id===edit.dataset.groupEdit);
    if(group)loadGroupForm(group);
    return;
  }
  const remove=e.target.closest("[data-group-delete]");
  if(!remove)return;
  const group=(chapter.groups||[]).find(g=>g.id===remove.dataset.groupDelete);
  if(!group)return;
  if(chapter.lines.some(l=>l.groupId===group.id))
    throw Error("Prima sposta tutte le voci direttamente nel capitolo o in un altro gruppo.");
  if(!confirm("Eliminare il gruppo vuoto «"+group.title+"»?"))return;
  await save();
  await request("/api/quotes/"+quote.id+"/chapters/"+chapter.id+"/groups/"+group.id+
      "?companyId="+companyId,{method:"DELETE"});
  clearGroupForm();await openQuote(quote.id);
  status("Gruppo vuoto eliminato; le voci del capitolo non sono state modificate.");
});
$("groupSave").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Apri un preventivo.");
  const chapter=currentGroupChapter();
  if(!chapter)throw Error("Seleziona un Capitolo nel filtro a sinistra.");
  const id=$("editingGroupId").value;
  const title=$("groupTitle").value.trim();
  const order=Number($("groupOrder").value);
  const qtyText=$("groupQuantity").value.trim();
  const priceText=$("groupUnitPrice").value.trim();
  const quantity=qtyText?Number(qtyText):null;
  const unitSalePrice=priceText?Number(priceText):null;
  const source=$("groupSource").value.trim(),notes=$("groupNotes").value.trim();
  if(!title||title.length>140||!Number.isInteger(order)||order<0||order>10000)
    throw Error("Titolo del gruppo obbligatorio e ordine 0–10000.");
  if(quantity!==null&&(!Number.isFinite(quantity)||quantity<=0))
    throw Error("La quantità del gruppo deve essere positiva.");
  if(unitSalePrice!==null&&(!Number.isFinite(unitSalePrice)||unitSalePrice<0))
    throw Error("Il prezzo del gruppo deve essere non negativo.");
  if(unitSalePrice!==null&&(quantity===null||!source))
    throw Error("Il prezzo autonomo richiede quantità e fonte.");
  const payload={companyId,title,order,quantity,unitSalePrice,source,notes};
  const quoteId=quote.id,chapterId=chapter.id;
  await save();
  const endpoint="/api/quotes/"+quoteId+"/chapters/"+chapterId+"/groups"+
    (id?"/"+id:"");
  const result=await request(endpoint,json(id?"PUT":"POST",payload));
  await openQuote(quoteId);
  $("chapterFilter").value=chapterId;
  renderChapterFilter();renderBodyGrid();
  showTool("group");loadGroupForm(result);
  status(id?"Gruppo aggiornato su Neon.":"Nuovo gruppo creato su Neon.");
});
$("editLineChapter").onchange=()=>{
  const destination=quote?.draft.chapters.find(c=>c.id===$("editLineChapter").value);
  $("editLineGroup").innerHTML=groupOptions(destination);
};
$("editLineSave").onclick=()=>guard(async()=>{
  if(!quote||!selectedLineId)throw Error("Seleziona una voce del preventivo");
  const lineId=selectedLineId,quoteId=quote.id;
  const source=quote.draft.chapters.find(c=>c.lines.some(l=>l.id===lineId));
  const chapterId=$("editLineChapter").value;
  const groupId=$("editLineGroup").value||null;
  await save();
  if(source.id!==chapterId){
    await request("/api/quotes/"+quoteId+"/lines/"+lineId+"/location",
      json("PUT",{companyId,chapterId,groupId}));
    await openQuote(quoteId);
    $("chapterFilter").value=chapterId;
    renderChapterFilter();renderBodyGrid();
  }
  selectLine(lineId);
  status("Capitolo, gruppo e dati della voce salvati su Neon.");
});
$("editLineDelete").onclick=()=>guard(async()=>{
  const id=selectedLineId;
  if(!quote||!id)throw Error("Seleziona una voce");
  const line=lineById(id);
  if(!confirm("Rimuovere la voce «"+line.code+"» dal preventivo?"))return;
  selectedLineId=null;toolMode="line";
  for(const chapter of quote.draft.chapters)
    chapter.lines=chapter.lines.filter(l=>l.id!==id);
  await save();
  showTool("line");
  status("Voce rimossa dalla bozza. Le revisioni archiviate restano invariate.");
});
$("sectionAdd").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Apri prima un preventivo");
  const title=$("sectionTitle").value.trim(),text=$("sectionText").value.trim();
  if(!title||!text)throw Error("Compila titolo e testo della sezione esterna");
  const chapterId=$("sectionChapter").value||null;
  const order=Number($("sectionOrder").value);
  if(!Number.isInteger(order)||order<0||order>10000)
    throw Error("Ordine della sezione non valido");
  await save();
  await request("/api/quotes/"+quote.id+"/sections",json("POST",{
    companyId,title,text,chapterId,order}));
  $("sectionTitle").value="";$("sectionText").value="";
  await openQuote(quote.id);
  showTool("section");
  status("Sezione esterna aggiunta al documento e al PDF.");
});
$("sectionList").onclick=e=>guard(async()=>{
  const button=e.target.closest("[data-delete-section]");
  if(!button||!quote)return;
  if(!confirm("Rimuovere la sezione esterna dalla bozza? Le revisioni storiche restano invariate."))return;
  await request("/api/quotes/"+quote.id+"/sections/"+button.dataset.deleteSection+
    "?companyId="+companyId,{method:"DELETE"});
  await openQuote(quote.id);
  showTool("section");
});
$("save").onclick=()=>guard(save);
$("revision").onclick=()=>guard(async()=>{await save();await request("/api/quotes/"+quote.id+
  "/revisions",json("POST",{companyId,reason:"Revisione manuale"}));await openQuote(quote.id)});
$("previewPrices").onclick=()=>guard(pricePreview);
$("printSaveSetup").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Seleziona un preventivo da configurare.");
  await save();
  status("Impostazioni di stampa salvate sul preventivo.");
});
$("pdf").onclick=()=>guard(async()=>{await save();await downloadPdf()});
$("revisions").onclick=e=>{const b=e.target.closest("[data-historic]");if(b)guard(()=>downloadPdf(Number(b.dataset.historic)))};
showTool("line");
$("import").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Apri una bozza");
  const chapterId=showSelectedChapter();
  if(!chapterId)throw Error("Seleziona un capitolo nel filtro a sinistra (non «Tutti»).");
  await save();
  const result=await request("/api/quotes/"+quote.id+"/imports/"+encodeURIComponent($("batch").value),
    json("POST",{companyId,chapterId}));await openQuote(quote.id);
  alert("Importazione: "+result.added+" inserite, "+result.skipped+" già presenti, "+
    result.unresolved+" da verificare");
});
const onGitHubPages=location.hostname.toLowerCase().endsWith(".github.io");
$("resetDemo").hidden=onGitHubPages; // Reset is available only for private localhost testing.
void startAccess();
