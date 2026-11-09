"use strict";
// Demo only. GitHub Pages hosts this static frontend; the authorized API URL is configured explicitly.
// No Neon credentials, company identity tokens or internal secrets in the frontend.
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
let companies = [], creatingIssuer = false, issuerFormBaseline = "";
let dossierProject = "farmacia-demo", lastImageUrl = null;
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
  showStep("issuer");
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
async function chooseIssuer(next){
  if(!companies.some(c=>c.id===next))return;
  if(next===companyId && !creatingIssuer && !issuerIsDirty())return;
  if(issuerIsDirty() &&
    !confirm("L'anagrafica contiene modifiche non salvate. Vuoi scartarle?")){
      $("company").value=companyId;return;
    }
  if(quote && next!==companyId && !confirm(
    "Cambiare emittente? Eventuali modifiche non salvate al preventivo aperto verranno perse.")){
    $("company").value=companyId;return;
  }
  const changed=next!==companyId;
  companyId=next;quote=null;
  renderIssuerForm();
  if(changed)await refresh();
}
function showStep(which){
  if(which==="quote"){
    if(creatingIssuer){
      status("Completa o annulla la creazione del nuovo emittente prima di proseguire.",true);
      return false;
    }
    if(!companyId){status("Crea o seleziona un emittente prima di proseguire.",true);return false}
    if(issuerIsDirty()){
      status("Salva l'anagrafica emittente prima di passare al preventivo.",true);
      return false;
    }
  }
  const issuer=which==="issuer";
  $("issuerPanel").hidden=!issuer;
  $("quotePanel").hidden=issuer;
  $("tabIssuer").classList.toggle("active",issuer);
  $("tabQuote").classList.toggle("active",!issuer);
  $("tabIssuer").setAttribute("aria-selected",String(issuer));
  $("tabQuote").setAttribute("aria-selected",String(!issuer));
  displayIssuer();
  return true;
}

async function refresh(){
  if(!companyId)return;
  [catalog,prices,batches,allQuotes]=await Promise.all([
    request("/api/catalog?companyId="+companyId),
    request("/api/prices/"+companyId),
    request("/api/batches?companyId="+companyId),
    request("/api/quotes?companyId="+companyId)
  ]);
  $("quoteList").innerHTML=allQuotes.map(q=>
    '<button data-open="'+q.id+'">'+escapeHtml(q.reference+" — "+q.subject)+" (r"+q.revisions+")</button>").join("");
  $("batch").innerHTML=batches.map(b=>'<option value="'+escapeHtml(b.batchId)+'">'+escapeHtml(b.sourceProjectId+" / "+b.sourceRevision)+"</option>").join("");
  $("demoInfo").textContent=allQuotes.length+" preventivi di esempio · "+catalog.length+
    " voci consultabili · "+batches.length+" lotti disponibili.";
  dossierProject = batches[0]?.sourceProjectId || "farmacia-demo";
  await loadDossier();
  renderCatalog();renderPrices(); renderQuote();
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
function showSelectedChapter(){return $("activeChapter")?.value||quote?.draft.chapters[0]?.id}
function renderQuote(){
  if(!quote){$("editor").innerHTML='<div class="empty">Seleziona o crea un preventivo.</div>';$("revisions").innerHTML="";renderExternalBlocks();return}
  const d=quote.draft;
  let html='<p><b>'+escapeHtml(quote.reference)+'</b> · '+escapeHtml(quote.status)+' · <span class="badge">DEMO</span></p>'+
    '<div class="issuer-in-document"><b>Emittente del documento:</b> '+escapeHtml(d.issuer.name)+
    ' · '+escapeHtml(d.issuer.address)+(d.issuer.taxId?' · '+escapeHtml(d.issuer.taxId):'')+
    (d.issuer.contact?' · '+escapeHtml(d.issuer.contact):'')+'</div>'+
    '<div class="grid2"><label>Destinatario<input id="recipient" value="'+escapeHtml(d.recipient.name)+'"></label>'+
    '<label>Indirizzo destinatario<input id="recipientAddress" value="'+escapeHtml(d.recipient.address)+'"></label></div>'+
    '<label>Oggetto<input id="subject" value="'+escapeHtml(d.subject)+'"></label>'+
    '<label>Condizioni commerciali<textarea id="conditions">'+escapeHtml(d.conditions)+'</textarea></label>'+
    '<label>Capitolo attivo per importazione/aggiunta<select id="activeChapter">'+d.chapters.map(c=>
      '<option value="'+c.id+'">'+escapeHtml(c.title)+'</option>').join("")+'</select></label>'+
    '<button id="addChapter">Nuovo capitolo</button>';
  for(const c of [...d.chapters].sort((a,b)=>a.order-b.order)){
    html+='<section class="chapter"><h3>'+escapeHtml(c.title)+'</h3><table><thead><tr>'+
      '<th>Codice / descrizione</th><th>Quantità</th><th>UM</th><th>Prezzo vendita</th><th>Blocco</th><th></th></tr></thead><tbody>';
    for(const l of c.lines) html+='<tr data-line="'+l.id+'"><td>'+escapeHtml(l.code)+
      '<div>'+escapeHtml(l.description)+'</div>'+(l.verify?'<span class="badge">DA VERIFICARE</span>':'')+'</td>'+
      '<td><input data-field="quantity" type="number" step=".0001" min="0" value="'+value(l.quantity)+'"></td>'+
      '<td>'+escapeHtml(l.unit)+'</td>'+
      '<td><input data-field="saleUnitPrice" type="number" step=".0001" min="0" value="'+value(l.saleUnitPrice)+'"></td>'+
      '<td><input data-field="lockedPrice" type="checkbox" '+(l.lockedPrice?'checked':'')+'></td>'+
      '<td><button data-remove="'+l.id+'">×</button></td></tr>';
    html+='</tbody></table></section>';
  }
  html+='<h3>Parametri facoltativi (nessuna percentuale preimpostata)</h3><div class="grid4">';
  for(const [key,label] of [["general","Spese generali"],["contingency","Imprevisti"],["discount","Sconto"]]){
    const setting=d.options[key];
    html+='<div><label>'+label+'<select data-adjust="'+key+'"><option value="">NON APPLICATO</option>'+
      '<option value="Amount" '+(setting?.kind===0?'selected':'')+'>Importo €</option>'+
      '<option value="Percentage" '+(setting?.kind===1?'selected':'')+'>Percentuale %</option></select>'+
      '<input data-adjustvalue="'+key+'" type="number" step=".01" min="0" placeholder="Valore" value="'+value(setting?.value)+'"></label></div>';
  }
  html+='<label>IVA (vuota = non configurata)<input id="vat" type="number" step=".01" min="0" value="'+value(d.options.vatRate)+'"></label></div>'+
    '<div id="totals">Calcolo in aggiornamento…</div>';
  $("editor").innerHTML=html;
  renderExternalBlocks();
  $("revisions").innerHTML=quote.revisions.map(r=>
    '<div class="rev">Revisione '+r.number+' — '+escapeHtml(r.reason)+
    ' <button data-historic="'+r.number+'">PDF storico</button></div>').join("");
  refreshTotals();
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
  d.recipient.name=$("recipient").value.trim();d.recipient.address=$("recipientAddress").value.trim();
  d.subject=$("subject").value.trim();d.conditions=$("conditions").value;
  d.options.vatRate=number($("vat").value);
  for(const key of ["general","contingency","discount"]){
    const kind=document.querySelector('[data-adjust="'+key+'"]').value;
    const val=document.querySelector('[data-adjustvalue="'+key+'"]').value;
    d.options[key]=kind===""?null:{kind:kind==="Amount"?0:1,value:number(val)};
    if(kind!==""&&val==="")throw Error("Manca valore per "+key);
  }
  document.querySelectorAll("[data-line]").forEach(row=>{
    const line=d.chapters.flatMap(c=>c.lines).find(l=>l.id===row.dataset.line);
    line.quantity=number(row.querySelector('[data-field="quantity"]').value);
    const price=number(row.querySelector('[data-field="saleUnitPrice"]').value);
    const changed=price!==line.saleUnitPrice;
    line.saleUnitPrice=price;
    line.lockedPrice=row.querySelector('[data-field="lockedPrice"]').checked || changed;
  });
  return d;
}
async function save(){await request("/api/quotes/"+quote.id+"/draft?companyId="+companyId,json("PUT",collect())); await openQuote(quote.id)}
async function openQuote(id){quote=await request("/api/quotes/"+id+"?companyId="+companyId);renderQuote()}
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
  const previous=$("externalChapter").value || $("activeChapter")?.value;
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
$("tabIssuer").onclick=()=>showStep("issuer");
$("tabQuote").onclick=()=>showStep("quote");
$("goQuote").onclick=()=>showStep("quote");
$("backIssuer").onclick=()=>showStep("issuer");
$("reload").onclick=()=>guard(refresh);
$("newQuote").onclick=()=>guard(async()=>{
  if(!companyId)throw Error("Seleziona prima un emittente nella scheda 1");
  const name=$("newRecipient").value.trim();
  const address=$("newRecipientAddress").value.trim();
  const subject=$("newSubject").value.trim();
  if(!name||!subject)throw Error("Destinatario e oggetto sono obbligatori");
  const created=await request("/api/quotes",json("POST",{
    companyId,recipient:{name,address},subject}));
  quote=created;
  await refresh();
  await openQuote(created.id);
  $("newRecipient").value="";
  $("newRecipientAddress").value="";
  $("newSubject").value="";
});
$("quoteList").onclick=e=>{const b=e.target.closest("[data-open]");if(b)guard(()=>openQuote(b.dataset.open))};
$("searchCatalog").oninput=renderCatalog;
$("catalog").onclick=e=>guard(async()=>{
  const btn=e.target.closest("[data-add]");if(!btn||!quote)return;
  const chapterId=showSelectedChapter();
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
  const rm=e.target.closest("[data-remove]");
  if(rm){collect();for(const c of quote.draft.chapters)c.lines=c.lines.filter(l=>l.id!==rm.dataset.remove);await save()}
  if(e.target.id==="addChapter"){
    collect();let title=prompt("Nome capitolo:","Nuovo capitolo");if(!title)return;
    quote.draft.chapters.push({id:crypto.randomUUID(),title,order:quote.draft.chapters.length,lines:[]});
    await save();
  }
});
$("save").onclick=()=>guard(save);
$("revision").onclick=()=>guard(async()=>{await save();await request("/api/quotes/"+quote.id+
  "/revisions",json("POST",{companyId,reason:"Revisione manuale"}));await openQuote(quote.id)});
$("previewPrices").onclick=()=>guard(pricePreview);
$("pdf").onclick=()=>guard(async()=>{await save();await downloadPdf()});
$("revisions").onclick=e=>{const b=e.target.closest("[data-historic]");if(b)guard(()=>downloadPdf(Number(b.dataset.historic)))};
$("import").onclick=()=>guard(async()=>{
  if(!quote)throw Error("Apri una bozza");
  const chapterId=showSelectedChapter();await save();
  const result=await request("/api/quotes/"+quote.id+"/imports/"+encodeURIComponent($("batch").value),
    json("POST",{companyId,chapterId}));await openQuote(quote.id);
  alert("Importazione: "+result.added+" inserite, "+result.skipped+" già presenti, "+
    result.unresolved+" da verificare");
});
const onGitHubPages=location.hostname.toLowerCase().endsWith(".github.io");
$("resetDemo").hidden=onGitHubPages; // Reset is available only for private localhost testing.
if(apiBase || !onGitHubPages) guard(connect);
else status("Frontend pubblico caricato · API demo non configurata.");
