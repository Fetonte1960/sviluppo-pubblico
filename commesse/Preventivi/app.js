"use strict";
// Demo only. GitHub Pages hosts this static frontend; the authorized API URL is configured explicitly.
// No Neon credentials, company identity tokens or internal secrets in the frontend.
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Public API origin is not a secret. Quote calculations and internal costs remain on Render.
const defaultApiBase = "https://preventivi-demo-api.onrender.com";
let apiBase = localStorage.getItem("preventivi-demo-api") || defaultApiBase;
let companyId = "", quote = null, catalog = [], prices = [], batches = [], allQuotes = [];
const fmt = n => n == null ? "DA DEFINIRE" : Number(n).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const value = n => n == null ? "" : n;
const number = s => s === "" || s == null ? null : Number(s);
function status(s, fail=false){ $("status").textContent=s; $("status").style.color=fail?"#b91c1c":"#176c57"; }
async function request(url, opts={}){
  status("Richiesta API in corso (possibile cold start Render)...");
  const ctrl=new AbortController(); const timeout=setTimeout(()=>ctrl.abort(),90000);
  try{
    const response=await fetch(apiBase + url,{...opts,signal:ctrl.signal,headers:{"Content-Type":"application/json",...(opts.headers||{})}});
    if(!response.ok){let t=await response.text();try{t=JSON.parse(t).detail||t}catch{} throw Error(response.status+" "+t);}
    status("API collegata · modalità DEMO");
    return response.headers.get("content-type")?.includes("application/pdf") ? await response.blob() : await response.json();
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
  const companies=await request("/api/demo/companies");
  $("company").innerHTML=companies.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.details.name)+'</option>').join("");
  companyId=$("company").value;quote=null; await refresh();
  if(allQuotes.length) await openQuote(allQuotes[0].id);
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
  if(!quote){$("editor").innerHTML='<div class="empty">Seleziona o crea un preventivo.</div>';$("revisions").innerHTML="";return}
  const d=quote.draft;
  let html='<p><b>'+escapeHtml(quote.reference)+'</b> · '+escapeHtml(quote.status)+' · <span class="badge">DEMO</span></p>'+
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
$("apiBase").value=apiBase;
$("connect").onclick=()=>guard(connect);
$("resetDemo").onclick=()=>guard(async()=>{
  if(!confirm("Ripristinare gli ARCHIVI DEMO ORIGINALI? Le modifiche effettuate ai dati sintetici andranno perse."))return;
  await request("/api/demo/reset",json("POST",{}));await connect();
});
$("company").onchange=()=>guard(async()=>{companyId=$("company").value;quote=null;await refresh();
  if(allQuotes.length)await openQuote(allQuotes[0].id)});
$("reload").onclick=()=>guard(refresh);
$("newQuote").onclick=()=>guard(async()=>{
  const name=prompt("Destinatario DEMO (solo dati sintetici):","Cliente sintetico");
  if(!name)return;
  const title=prompt("Oggetto lavori:","Ristrutturazione farmacia DEMO");
  if(!title)return;
  quote=await request("/api/quotes",json("POST",{companyId,recipient:{name,address:"Indirizzo DEMO"},
    subject:title}));await refresh();await openQuote(quote.id)
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
if(apiBase || !onGitHubPages) guard(connect);
else status("Frontend pubblico caricato · API demo non configurata.");
