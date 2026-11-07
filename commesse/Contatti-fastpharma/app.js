"use strict";
const api = String(window.CONTATTI_CONFIG?.apiBase || "").replace(/\/$/, "");
const rows = document.querySelector("#rows");
const status = document.querySelector("#apiStatus");
const listTitle = document.querySelector("#listTitle");
const message = document.querySelector("#message");
const count = document.querySelector("#count");
const form = document.querySelector("#contactForm");
const connectionInfo = document.querySelector("#connectionInfo");
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
 authenticated=connected;listTitle.textContent=connected?"Archivio PostgreSQL di collaudo":"Contatti dimostrativi";
 status.textContent=connected?"Archivio collegato":"Modalità dimostrativa";
 status.classList.toggle("connected",connected);
 form.querySelectorAll("input,textarea,button").forEach(el=>el.disabled=!connected);
 connectionInfo.textContent=notice;
}
async function showDemo() {
 key="";records=synthetic;mode(false,api?"La API è configurata. Inserisci la chiave per aprire l'archivio di prova.":"Frontend pubblicato; backend non ancora configurato. Sono visibili esclusivamente due esempi inventati.");
 render();
 if(!api)return;
 try {
  const resp=await fetch(api+"/health",{signal:AbortSignal.timeout(12000)});
  const info=await resp.json();
  message.textContent="API: "+(info.status||"sconosciuta")+" · DB: "+(info.database||"sconosciuto");
 } catch {message.textContent="Backend non raggiungibile; rimane disponibile la dimostrazione statica.";}
}
async function callApi(path,opts={}) {
 if(!api)throw new Error("Indirizzo API non ancora configurato");
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
document.querySelector("#search").addEventListener("input",render);
showDemo();
