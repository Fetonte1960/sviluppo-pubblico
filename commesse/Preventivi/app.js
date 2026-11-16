"use strict";
// Demo only. GitHub Pages hosts this static frontend; the authorized API URL is configured explicitly.
// No Neon credentials, company identity tokens or internal secrets in the frontend.
const APP_VERSION="1.6.0";
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Public API origin is not a secret. Quote calculations and internal costs remain on Render.
const defaultApiBase = "https://preventivi-demo-api.onrender.com";
let apiBase = localStorage.getItem("preventivi-demo-api") || defaultApiBase;
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
const commesseNonce=importParams.get('nonce')||'';
const selectForCommesse=importParams.get('picker')==='commesse' &&
 /^[a-f0-9]{32}$/.test(commesseNonce) &&
 /^https:\/\/fetonte1960\.github\.io\/sviluppo-pubblico\/commesse\/Fastpharma-Commesse\//.test(document.referrer) &&
 Boolean(window.opener);
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
const fmt = n => n == null ? "DA DEFINIRE" : Number(n).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const value = n => n == null ? "" : n;
const number = s => s === "" || s == null ? null : Number(s);
function status(s, fail=false){ $("status").textContent=s; $("status").style.color=fail?"#b91c1c":"#176c57"; }
async function request(url, opts={}){
  status("Richiesta API in corso (possibile cold start Render)...");
  const ctrl=new AbortController(); const timeout=setTimeout(()=>ctrl.abort(),90000);
  try{
    const response=await fetch(apiBase + url,{...opts,signal:ctrl.signal,headers:{"Content-Type":"application/json","X-Preventivi-Demo-Session":demoSession,...(opts.headers||{})}});
    if(!response.ok){let t=await response.text();try{t=JSON.parse(t).detail||t}catch{} throw Error(response.status+" "+t);}
    status("API collegata · modalità DEMO");
    return ["application/pdf","image/png"].some(t=>response.headers.get("content-type")?.includes(t)) ? await response.blob() : await response.json();
  }finally{clearTimeout(timeout)}
}
const json=(method,body)=>({method,body:JSON.stringify(body)});
async function guard(fn){try{await fn()}catch(e){status(e.message,true);alert("Operazione non completata: "+e.message)}}
async function connect(){
  apiBase=$("apiBase").value.trim().replace(/\/$/,"");
  const parsed=new URL(apiBase);
  if(parsed.protocol!=="https:" && !["localhost","127.0.0.1"].includes(parsed.hostname))
    throw Error("Il servizio API deve utilizzare HTTPS.");
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
    ? "Organizzazioni del CRM lette con accesso autorizzato. Seleziona un destinatario; la finestra Contatti serve anche per annotare la nuova bozza."
    : "Apri Contatti FastPharma, accedi e seleziona un'Organizzazione. Nessuna credenziale viene trasferita.";
}
function openContactsPicker(){
  if(crmPopup&&!crmPopup.closed){crmPopup.focus();return;}
  crmNonce=crypto.randomUUID().replace(/-/g,"");
  crmOrganizations=new Map();
  selectedCrmOrganization=null;
  renderCrmOrganizations();
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
function updateHeaderQuote(){
  $("appVersion").textContent="V"+APP_VERSION;
  $("infoVersion").textContent="V"+APP_VERSION;
  $("currentQuoteHeader").textContent=quote
    ? "Preventivo in elaborazione: "+quote.reference+" — "+quote.draft.subject
    : "Preventivo in elaborazione: nessuno";
}

const issuerFields = ["issuerName","issuerAddress","issuerTaxId","issuerContact"];
function readIssuer(){
  return {name:$("issuerName").value.trim(),address:$("issuerAddress").value.trim(),
    taxId:$("issuerTaxId").value.trim(),contact:$("issuerContact").value.trim()};
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
  const company=await request(created?"/api/demo/companies":
    "/api/demo/companies/"+companyId,json(created?"POST":"PUT",details));
  quote=null;
  await loadCompanies(company.id);
  await refresh();
  status(created?"Emittente creato nella demo.":"Anagrafica emittente aggiornata.");
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
    ? quote.reference+" — "+quote.draft.subject
    : "Nessuna bozza aperta";
  const host=$("quoteChapterSummary");
  if(!quote){
    host.innerHTML='<p class="chapter-preview-empty">Apri o crea un preventivo da Generale.</p>';
    return;
  }
  host.innerHTML=quote.draft.chapters.length?
    [...quote.draft.chapters].sort((a,b)=>a.order-b.order).map(c=>
      '<div class="chapter-summary"><span><b>'+escapeHtml(c.title)+'</b> · '+
      c.lines.length+' voci</span></div>').join(""):
    '<p class="chapter-preview-empty">Preventivo ancora senza capitoli. Doppio clic su un capitolo nell’archivio per aggiungerlo.</p>';
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

function showStep(which){
  if(which!=="general"){
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
  if(which!=="chapters" && templateDirty() &&
     !$("chapterPanel").hidden){
    status("Salva o annulla le modifiche al capitolo prima di cambiare scheda.",true);
    return false;
  }
  const general=which==="general",chapters=which==="chapters",
    body=which==="quote",prices=which==="prices";
  $("issuerPanel").hidden=!general;
  $("chapterPanel").hidden=!chapters;
  $("quotePanel").hidden=!body;
  $("pricesPanel").hidden=!prices;
  for(const [id,selected] of [["tabIssuer",general],
                              ["tabChapters",chapters],["tabQuote",body],
                              ["tabPrices",prices]]){
    $(id).classList.toggle("active",selected);
    $(id).setAttribute("aria-selected",String(selected));
  }
  displayIssuer();
  if(chapters)renderQuoteChapterSummary();
  return true;
}

async function refresh(){
  if(!companyId)return;
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
    (q.recipientOrganizationId?' <span class="muted">CRM</span>':' <span class="muted">DEMO</span>')+'</td>'+
    '<td>'+escapeHtml(q.subject)+'</td><td>'+escapeHtml(q.status)+'</td>'+
    '<td>'+escapeHtml(q.revisions)+'</td>'+
    '<td><button type="button" data-open="'+escapeHtml(q.id)+'">Apri</button>'+
    (selectForCommesse?'<button type="button" data-pick-commesse="'+escapeHtml(q.id)+'">Usa in Commesse</button>':'')+
    '</td></tr>').join("")||
    '<tr><td colspan="7" class="empty">Nessun preventivo disponibile per questo emittente.</td></tr>';
  $("batch").innerHTML=batches.map(b=>'<option value="'+escapeHtml(b.batchId)+'">'+escapeHtml(b.sourceProjectId+" / "+b.sourceRevision)+"</option>").join("");
  $("demoInfo").textContent=allQuotes.length+" preventivi complessivi · "+
    "Emittente attivo: "+(companies.find(c=>c.id===companyId)?.details.name||"—");
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
  $("priceList").innerHTML=catalog.map(w=>{
    const p=prices.find(x=>x.workItemId===w.id)||{};
    return '<div class="priceitem" data-price="'+w.id+'"><b>'+escapeHtml(w.code+" — "+w.title)+'</b>'+
      '<label>Prezzo vendita DEMO<input data-field="manualSalePrice" type="number" step=".0001" min="0" value="'+value(p.manualSalePrice)+'"></label>'+
      '<button data-saveprice="'+w.id+'">Aggiorna prezziario</button></div>';
  }).join("");
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
    locked:$("editLineLocked").checked
  };
}
function lineEditDirty(){
  return toolMode==="editLine" && selectedLineId &&
    JSON.stringify(lineEditValues())!==lineEditBaseline;
}
function showTool(mode){
  const mapping={chapter:"toolChapter",materials:"toolMaterials",section:"toolSection",
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
    "Operazione: "+({chapter:"Capitolo",materials:"Distinta materiali",
     section:"Sezione esterna",line:"Voce",image:"Immagine"})[mode]+
    ". Prima scegli il capitolo nel filtro quando necessario.";
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
}
function renderFinancialSettings(){
  const d=quote?.draft;
  $("conditions").value=d?.conditions||"";
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
  const sections=d.sections||[],blocks=d.blocks||[];
  const rows=[];
  function addDocumentRows(chapterId){
    for(const section of sections.filter(s=>(s.chapterId||null)===(chapterId||null))
               .sort((a,b)=>a.order-b.order)){
      rows.push('<tr class="document-row"><td colspan="5"><b>Sezione esterna: '+
        escapeHtml(section.title)+'</b><div class="hint">'+
        escapeHtml(section.text.slice(0,220))+'</div></td>'+
        '<td><button type="button" data-show-section>Sezioni</button></td></tr>');
    }
    for(const block of blocks.filter(b=>chapterId?b.chapterId===chapterId:
        !b.chapterId)){
      rows.push('<tr class="document-row"><td colspan="5"><b>Immagine: '+
        escapeHtml(block.title||"Allegato")+'</b><div class="hint">'+
        escapeHtml(block.caption||"")+'</div></td>'+
        '<td><button type="button" data-show-image>Immagini</button></td></tr>');
    }
  }
  if(filter==="all")addDocumentRows(null);
  for(const chapter of [...d.chapters].sort((a,b)=>a.order-b.order)){
    if(filter!=="all"&&filter!==chapter.id)continue;
    const valued=chapter.lines.filter(l=>l.quantity!=null&&l.saleUnitPrice!=null)
      .reduce((sum,l)=>sum+Number(l.quantity)*Number(l.saleUnitPrice),0);
    const partial=chapter.lines.some(l=>l.quantity==null||l.saleUnitPrice==null);
    rows.push('<tr class="body-chapter-row"><td colspan="4"><b>'+
      escapeHtml(chapter.title)+'</b> <span class="muted">('+
      chapter.lines.length+' voci)</span></td>'+
      '<td class="align-right">'+(partial?'Parziale · ':'')+fmt(valued)+'</td>'+
      '<td>'+(chapter.lines.length===0?'<button type="button" data-remove-chapter="'+
        escapeHtml(chapter.id)+'" title="Rimuovi solo se vuoto">Rimuovi</button>':'')+'</td></tr>');
    addDocumentRows(chapter.id);
    for(const line of chapter.lines){
      const amount=line.quantity!=null&&line.saleUnitPrice!=null
        ?fmt(Number(line.quantity)*Number(line.saleUnitPrice)):"Da definire";
      rows.push('<tr class="body-line-row '+(selectedLineId===line.id?'selected':'')+
        '" data-select-line="'+escapeHtml(line.id)+'" tabindex="0" role="button" '+
        'aria-label="Modifica voce '+escapeHtml(line.code)+'"><td><b>'+
        escapeHtml(line.code)+'</b> — '+escapeHtml(line.description)+
        (line.verify?' <span class="badge">DA VERIFICARE</span>':'')+'</td>'+
        '<td class="align-right">'+escapeHtml(line.quantity??"—")+'</td>'+
        '<td>'+escapeHtml(line.unit)+'</td>'+
        '<td class="align-right">'+(line.saleUnitPrice==null?"—":fmt(line.saleUnitPrice))+'</td>'+
        '<td class="align-right"><b>'+amount+'</b></td>'+
        '<td><button type="button" data-edit-line="'+escapeHtml(line.id)+'">Modifica</button></td></tr>');
    }
  }
  host.innerHTML='<div class="body-grid-scroll"><table class="body-quote-table">'+
    '<thead><tr><th>Codice / Descrizione</th><th>Quantità</th>'+
    '<th>U.M.</th><th>Prezzo unitario</th><th>Importo</th><th>Azioni</th></tr></thead>'+
    '<tbody>'+(rows.join("")||'<tr><td colspan="6" class="empty">'+
     'Nessuna voce. Aggiungi un capitolo o una voce dalla toolbar.</td></tr>')+
    '</tbody></table></div>';
  refreshTotals();
}
function renderQuote(){
  renderChapterFilter();
  renderBodyGrid();
  renderSectionList();
  renderExternalBlocks();
}
function selectLine(id){
  const line=lineById(id);
  if(!line)return;
  if(lineEditDirty()&&!confirm("Scartare le modifiche alla voce selezionata?"))return;
  selectedLineId=id;
  if(!showTool("editLine"))return;
  $("editingLineTitle").textContent=line.code+" — "+line.description+" ("+line.unit+")";
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
      l.quantity=quantity;
      l.saleUnitPrice=salePrice;
      l.lockedPrice=$("editLineLocked").checked||changed;
      lineEditBaseline=JSON.stringify(lineEditValues());
    }
  }
  return d;
}
async function save(){await request("/api/quotes/"+quote.id+"/draft?companyId="+companyId,json("PUT",collect())); await openQuote(quote.id)}
async function openQuote(id){
  const previousId=quote?.id;
  quote=await request("/api/quotes/"+id+"?companyId="+companyId);
  if(previousId!==id){
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
  a.href=url;a.download=quote.reference+(revision?"-r"+revision:"")+"-DEMO.pdf";a.click();
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
$("openContacts").onclick=openContactsPicker;
$("crmOrganization").onchange=()=>{
 const id=$("crmOrganization").value;
 if(id)requestCrmSelection(id);else selectedCrmOrganization=null;
};
$("exitButton").onclick=()=>{
 if(!confirm("Terminare la sessione dimostrativa Preventivi?"))return;
 localStorage.removeItem("preventivi-demo-session");
 demoSession=crypto.randomUUID(); // Old in-memory session is abandoned, never deleted in CRM.
 quote=null;updateHeaderQuote();
 if(crmPopup&&!crmPopup.closed)crmPopup.close();
 $("exitOverlay").hidden=false;
 document.querySelector("main").hidden=true;
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
$("tabQuote").onclick=()=>showStep("quote");
$("tabPrices").onclick=()=>showStep("prices");
$("goQuote").onclick=()=>showStep("chapters");
$("goBody").onclick=()=>showStep("quote");
$("backGeneralFromChapters").onclick=()=>showStep("general");
$("backIssuer").onclick=()=>showStep("chapters");
$("reload").onclick=()=>guard(refresh);
$("newQuote").onclick=()=>guard(async()=>{
  if(creatingIssuer||issuerIsDirty())
    throw Error("Salva o annulla le modifiche dell'emittente.");
  if(!companyId)throw Error("Seleziona un emittente in Gestione emittenti.");
  if(!selectedCrmOrganization||$("crmOrganization").value!==selectedCrmOrganization.id)
    throw Error("Seleziona un'Organizzazione autenticata tramite Apri Contatti.");
  if(!crmPopup||crmPopup.closed)
    throw Error("La finestra Contatti deve restare aperta per registrare la nota.");
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
    try {
      await recordCrmNote(created);
      status("Preventivo "+created.reference+" creato; nota registrata in Contatti.");
    } catch(noteError){
      status("Preventivo creato, ma "+noteError.message,true);
      $("crmLinkStatus").textContent="ATTENZIONE: preventivo "+created.reference+
        " creato, nota CRM non confermata. Verificare lo storico Attività in Contatti.";
    }
  }finally{$("newQuote").disabled=false;}
});
$("quoteList").onclick=e=>{
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
    companyId,chapterId,workId:btn.dataset.add,quantity:1}));
  await openQuote(quote.id);
});
$("addWork").onclick=()=>guard(async()=>{
  await request("/api/catalog",json("POST",{companyId,code:$("newCode").value,title:$("newTitle").value,
    unit:$("newUnit").value,category:$("newCategory").value,description:"Voce privata DEMO"}));
  await refresh();
});
$("priceList").onclick=e=>guard(async()=>{
  const b=e.target.closest("[data-saveprice]");if(!b)return;const p=b.closest("[data-price]");
  const field=f=>number(p.querySelector('[data-field="'+f+'"]').value);
  if(quote)await save();
  await request("/api/prices/"+companyId+"/"+b.dataset.saveprice,json("PUT",{
    manualSalePrice:field("manualSalePrice")}));await refresh();
});
$("editor").onclick=e=>guard(async()=>{
  const row=e.target.closest("[data-select-line]");
  if(row){selectLine(row.dataset.selectLine);return;}
  if(e.target.closest("[data-show-section]")){showTool("section");return}
  if(e.target.closest("[data-show-image]")){showTool("image");return}
  const chapterButton=e.target.closest("[data-remove-chapter]");
  if(chapterButton){
    const chapter=quote.draft.chapters.find(c=>c.id===chapterButton.dataset.removeChapter);
    if(!chapter||chapter.lines.length)throw Error("Puoi rimuovere solo capitoli ancora vuoti");
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
  selectedLineId=null;
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
$("editLineSave").onclick=()=>guard(async()=>{
  if(!quote||!selectedLineId)throw Error("Seleziona una voce del preventivo");
  await save();
  if(selectedLineId)selectLine(selectedLineId);
  status("Modifiche della voce salvate nella bozza.");
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
if(apiBase || !onGitHubPages) guard(connect);
else status("Frontend pubblico caricato · API demo non configurata.");
