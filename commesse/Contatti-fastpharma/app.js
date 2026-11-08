"use strict";
const api = String(window.CONTATTI_CONFIG?.apiBase || "").replace(/\/$/, "");
const localMode = window.CONTATTI_CONFIG?.local === true;
const desktopMode = window.CONTATTI_CONFIG?.desktop === true && Boolean(window.CONTATTI_DESKTOP?.key);
const hasApi = localMode || Boolean(api);
const importPanel = document.querySelector("#importPanel");
const importNeon = document.querySelector("#importNeon");
const importFile = document.querySelector("#importFile");
const importUploaded = document.querySelector("#importUploaded");
const importKeyInput = document.querySelector("#importKey");
const importStatus = document.querySelector("#importStatus");
const importPreview = document.querySelector("#importPreview");
const importComparison = document.querySelector("#importComparison");
const importConsent = document.querySelector("#importConsent");
const importConfirm = document.querySelector("#importConfirm");
let pendingImportToken = "";
const rows = document.querySelector("#rows");
const status = document.querySelector("#apiStatus");
const listTitle = document.querySelector("#listTitle");
const message = document.querySelector("#message");
const count = document.querySelector("#count");
const form = document.querySelector("#contactForm");
const connectionInfo = document.querySelector("#connectionInfo");
const backupButton = document.querySelector("#backupContatti");
const backupMessage = document.querySelector("#backupMessage");
let key = "";
let records = [];
let authenticated = false;
const synthetic = [
 { firstName:"Anna",lastName:"Esempio",company:"Farmacia Dimostrativa",email:"anna@example.invalid",phone:"",notes:"Dato inventato" },
 { firstName:"Marco",lastName:"Prova",company:"Azienda Demo",email:"marco@example.invalid",phone:"",notes:"Dato inventato" }
];
function cell(tr, value, strong=false) {
 const td = document.createElement("td");
 if (strong) { const b=document.createElement("strong"); b.textContent=value||"—"; td.append(b); }
 else td.textContent=value||"—";
 tr.append(td);
}
function render() {
 const q = document.querySelector("#search").value.trim().toLowerCase();
 const filtered = records.filter(x => [x.firstName,x.lastName,x.company,x.email,x.phone].join(" ").toLowerCase().includes(q));
 rows.replaceChildren();
 for (const contact of filtered) {
  const tr=document.createElement("tr");
  cell(tr, [contact.firstName,contact.lastName].filter(Boolean).join(" "),true);
  cell(tr,contact.company);cell(tr,contact.email);cell(tr,contact.phone);rows.append(tr);
 }
 if(!filtered.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="Nessun contatto da mostrare";tr.append(td);rows.append(tr);}
 count.textContent=filtered.length+" contatti";
}
function mode(connected, notice) {
 authenticated=connected;backupButton.disabled=!connected;
 importPanel.hidden=!(localMode && connected);
 importNeon.disabled=!connected;importFile.disabled=!connected;importUploaded.disabled=!connected;
 if(!connected){pendingImportToken="";importPreview.hidden=true;importConsent.checked=false;importKeyInput.value="";}
 listTitle.textContent=connected?"Archivio PostgreSQL di collaudo":"Contatti dimostrativi";
 status.textContent=connected?"Archivio collegato":"Modalità dimostrativa";
 status.classList.toggle("connected",connected);
 form.querySelectorAll("input,textarea,button").forEach(el=>el.disabled=!connected);
 connectionInfo.textContent=notice;
}
async function showDemo() {
 if(desktopMode) {
  key = window.CONTATTI_DESKTOP.key;
  records = [];
  mode(false,"Connessione automatica all'archivio PostgreSQL locale…");
  render();
  try {
   await refresh();
   mode(true,"Archivio PostgreSQL Windows collegato, accesso desktop automatico.");
   message.textContent="Archivio locale connesso.";
  } catch(e) {
   message.textContent="Avvio PostgreSQL o migrazioni in corso; nuovo tentativo automatico…";
   setTimeout(showDemo,3000);
  }
  return;
 }
 key="";records=synthetic;mode(false,hasApi?"La API è configurata. Inserisci la chiave per aprire l'archivio di prova.":"Frontend pubblicato; backend non ancora configurato. Sono visibili esclusivamente due esempi inventati.");
 render();
 if(!hasApi)return;
 try {
  const resp=await fetch(api+"/health",{signal:AbortSignal.timeout(12000)});
  const info=await resp.json();
  message.textContent="API: "+(info.status||"sconosciuta")+" · DB: "+(info.database||"sconosciuto");
 } catch {message.textContent="Backend non raggiungibile; rimane disponibile la dimostrazione statica.";}
}
async function callApi(path,opts={}) {
 if(!hasApi)throw new Error("Indirizzo API non ancora configurato");
 const headers={"X-Demo-Key":key,...(opts.headers||{})};
 const r=await fetch(api+path,{...opts,headers,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error("Richiesta non riuscita (HTTP "+r.status+")");
 return await r.json();
}
async function refresh() {records=await callApi("/api/contacts");render();}
document.querySelector("#connectForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const candidate=document.querySelector("#key").value.trim();
 if(!candidate){message.textContent="Inserisci la chiave di collaudo.";return;}
 key=candidate;
 try {
  await refresh();
  mode(true,"Archivio Neon o PostgreSQL locale collegato. Usa soltanto dati inventati.");
  document.querySelector("#key").value="";
  message.textContent="Connessione verificata. La chiave resta solo in memoria fino alla chiusura della pagina.";
 } catch(e){await showDemo();message.textContent="Accesso non riuscito: "+e.message;}
});
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!authenticated)return;
 const entry=Object.fromEntries(new FormData(form).entries());
 try {await callApi("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(entry)});form.reset();await refresh();message.textContent="Contatto di prova salvato nel database.";}
 catch(e){message.textContent=e.message;}
});
// The same in-memory V0 key already used for CRUD also authorizes export.
// No token, backup content or credentials are stored in localStorage or the URL.
backupButton.addEventListener("click", async () => {
 if(!authenticated || !key || !hasApi)return;
 backupButton.disabled=true;
 backupMessage.textContent="Preparazione archivio PostgreSQL in corso…";
 try {
  const response=await fetch(api+"/api/admin/backup/contatti",{
   method:"POST",headers:{"X-Demo-Key":key},cache:"no-store",signal:AbortSignal.timeout(100000)
  });
  if(!response.ok)throw new Error("Esportazione non riuscita (HTTP "+response.status+")");
  const backup=await response.blob();
  if(!backup.size)throw new Error("Il server ha restituito un file vuoto");
  const name="fastpharma_contatti_"+new Date().toISOString().replace(/[-:]/g,"").slice(0,15).replace("T","_")+".backup";
  const objectUrl=URL.createObjectURL(backup);
  const a=document.createElement("a");a.href=objectUrl;a.download=name;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
  backupMessage.textContent="Download avviato: conserva il file .backup in una cartella protetta. Nessun ripristino eseguito.";
 }catch(error){
  backupMessage.textContent=error.name==="TimeoutError"?"L'esportazione ha superato il tempo massimo.":error.message;
 }finally{backupButton.disabled=!authenticated;}
});
// Solo frontend LOCALE: due fasi obbligatorie di importazione.
// La chiave amministrativa del PC non e' quella cloud e non viene salvata nel browser.
function importHeaders(extra={}) {
 const admin=desktopMode ? window.CONTATTI_DESKTOP.importKey : importKeyInput.value.trim();
 if(!admin)throw new Error("Inserisci la chiave amministrativa locale.");
 return {"X-Demo-Key":key,"X-Import-Key":admin,...extra};
}
async function importRequest(path,options={}) {
 const response=await fetch(api+path,{
  ...options,
  headers:importHeaders(options.headers || {}),
  cache:"no-store",
  signal:AbortSignal.timeout(185000)
 });
 if(!response.ok){
  if(response.status===401)throw new Error("Chiave amministrativa locale non valida.");
  if(response.status===409)throw new Error("Importazione già in corso o anteprima scaduta.");
  throw new Error("Operazione non riuscita (HTTP "+response.status+").");
 }
 return await response.json();
}
function importBusy(busy) {
 importNeon.disabled=busy || !authenticated;
 importUploaded.disabled=busy || !authenticated;
 importFile.disabled=busy || !authenticated;
 importConfirm.disabled=busy || !importConsent.checked || !pendingImportToken;
}
function displayImportPreview(result) {
 pendingImportToken=result.token;
 importConsent.checked=false;
 importPreview.hidden=false;
 importComparison.textContent=
  "Contatti attuali sul PC: "+result.currentCount+
  " · Contatti nel backup: "+result.incomingCount+
  " · Migrazioni nel backup: "+result.incomingMigrations+
  ". Dopo la conferma i dati locali saranno SOSTITUITI.";
 importConfirm.disabled=true;
 importStatus.textContent="Archivio verificato su database di prova isolato. Nessuna modifica ai contatti locali.";
}
if(desktopMode) {
 document.querySelector("#connectForm").style.display="none";
 importKeyInput.closest("label").style.display="none";
 importNeon.style.display="none"; // Non distribuire mai la chiave TEST cloud nell'installer.
}
if(localMode) {
 importNeon.addEventListener("click",async()=>{
  if(!authenticated)return;
  pendingImportToken="";importPreview.hidden=true;importBusy(true);
  importStatus.textContent="Scaricamento protetto da Neon e verifica del backup in corso…";
  try{
   const result=await importRequest("/api/admin/import/contatti/prepare-cloud",{method:"POST"});
   displayImportPreview(result);
  }catch(e){importStatus.textContent=e.message;}
  finally{importBusy(false);}
 });
 importUploaded.addEventListener("click",async()=>{
  if(!authenticated)return;
  const file=importFile.files?.[0];
  if(!file){importStatus.textContent="Seleziona un archivio .backup.";return;}
  pendingImportToken="";importPreview.hidden=true;importBusy(true);
  importStatus.textContent="Verifica del file su database di prova in corso…";
  try{
   const result=await importRequest("/api/admin/import/contatti/prepare-file",{
    method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file
   });
   displayImportPreview(result);
  }catch(e){importStatus.textContent=e.message;}
  finally{importBusy(false);}
 });
 importConsent.addEventListener("change",()=>{importConfirm.disabled=!importConsent.checked || !pendingImportToken;});
 importConfirm.addEventListener("click",async()=>{
  if(!authenticated || !pendingImportToken || !importConsent.checked)return;
  importBusy(true);importStatus.textContent="Backup locale preventivo e sostituzione in corso. Non chiudere la pagina…";
  try{
   const result=await importRequest("/api/admin/import/contatti/confirm",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token:pendingImportToken,confirmed:true})
   });
   importStatus.textContent="Importazione completata: "+result.importedContacts+
     " contatti. Backup locale conservato in "+result.backup+".";
   pendingImportToken="";importPreview.hidden=true;importConsent.checked=false;
   await refresh();
  }catch(e){importStatus.textContent=e.message;}
  finally{importBusy(false);}
 });
}
document.querySelector("#search").addEventListener("input",render);
showDemo();
