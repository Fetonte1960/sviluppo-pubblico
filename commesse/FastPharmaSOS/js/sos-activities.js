import { getMonitoring, saveMonitoring, getFeedback, saveFeedbackReview } from "./api.js?v=1.1.10";

const el = id => document.getElementById(id);
const store = {
  monitoraggio: { rows: [], selectedId: null, loading: false },
  suggerimenti: { rows: [], selectedId: null, loading: false }
};
let mounted = false;
const date = value => value ? new Date(value).toLocaleString("it-IT") : "—";
const shorten = (s, n = 110) => s?.length > n ? s.slice(0,n-1) + "…" : s || "—";
function line(parent, title, value) {
  const p = document.createElement("p");
  const strong = document.createElement("strong"); strong.textContent = title + ": ";
  p.append(strong, document.createTextNode(value == null ? "—" : String(value)));
  parent.append(p);
}
function label(state, type) {
  const choices = type === "monitoraggio"
    ? { da_esaminare:"Da esaminare", in_esame:"In esame", in_attesa:"In attesa", completata:"Completata" }
    : { nuovo:"Nuovo", in_esame:"In esame", accolto:"Accolto", archiviato:"Archiviato" };
  return choices[state] || state || "—";
}
function errorText(e) { return e?.status === 401 ? "Accesso scaduto: effettua nuovamente l'accesso al gestionale."
  : (e?.body?.error || e?.message || "Errore di comunicazione con il backend."); }

const shortDate = value => value ? new Date(value).toLocaleString("it-IT", {
  day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"
}) : "—";

function markSelection(kind,id) {
  const list = el(kind === "monitoraggio" ? "monitor-list" : "feedback-list");
  for(const row of list.querySelectorAll("tr[data-id]")){
    row.classList.toggle("is-selected",row.dataset.id===id);
    const button=row.querySelector("button[data-id]");
    if(button) button.setAttribute("aria-expanded",String(row.dataset.id===id));
  }
}
function showDetail(kind,id,fromClick=false) {
  const isFeedback=kind==="suggerimenti",model=store[kind];
  model.selectedId=id;
  const item=model.rows.find(row=>row.id===id);
  const panel=el(isFeedback?"feedback-detail-panel":"monitor-detail-panel");
  const form=el(isFeedback?"feedback-editor":"monitor-editor");
  panel.hidden=!item;form.hidden=!item;
  markSelection(kind,item?.id??null);
  if(!item)return;
  const body=el(isFeedback?"feedback-detail":"monitor-detail");
  body.replaceChildren();
  if(isFeedback){
    line(body,"Valutazione",item.id);
    line(body,"Farmacia",(item.codiceFarmacia||"")+" · "+(item.farmacia||""));
    line(body,"Pratica collegata",item.interventoId||"Nessuna");
    line(body,"Soddisfatto",item.soddisfatto===null?"Non espresso":item.soddisfatto?"Sì":"No");
    line(body,"Suggerimento del cliente",item.suggerimentoUtente);
    line(body,"Osservazioni AI",item.osservazioniAi);
    line(body,"Efficacia istruzioni",item.efficaciaIstruzioni);
    line(body,"Versione istruzioni",item.versioneIstruzioni);
    line(body,"Esito chat",item.esitoConversazione);
    line(body,"Data",date(item.createdAt));
    form.elements.namedItem("stato").value=item.statoGestione||"nuovo";
    form.elements.namedItem("noteInterne").value=item.noteInterne||"";
  }else{
    line(body,"Pratica",item.id);
    line(body,"Farmacia",(item.codiceFarmacia||"")+" · "+(item.farmacia||""));
    line(body,"Oggetto",item.oggetto);
    line(body,"Specializzazione",item.specializzazione);
    line(body,"Locale",item.locale);
    line(body,"Urgenza",item.urgenza);
    line(body,"Stato SOS (sola lettura)",item.statoIntervento);
    line(body,"Rischio persone",item.rischioPersone?"Segnalato":"Non segnalato");
    line(body,"Tecnico",item.tecnicoId||"Non assegnato");
    line(body,"Apertura",date(item.createdAt));
    form.elements.namedItem("stato").value=item.statoMonitoraggio||"da_esaminare";
    form.elements.namedItem("noteInterne").value=item.noteInterne||"";
    const events=el("monitor-events");events.replaceChildren();
    const ev=item.eventi||[];
    el("monitor-event-count").textContent="("+ev.length+")";
    if(ev.length){
      const table=document.createElement("table");table.className="activity-data-table activity-audit-table";
      const head=document.createElement("thead"),hrow=document.createElement("tr");
      for(const title of ["Data","Evento","Attore"]){
        const th=document.createElement("th");th.scope="col";th.textContent=title;hrow.append(th);
      }
      head.append(hrow);table.append(head);
      const bodyEvents=document.createElement("tbody");
      for(const entry of ev){
        const tr=document.createElement("tr");
        for(const value of [shortDate(entry.data),entry.tipo||"—",entry.attore||"—"]){
          const td=document.createElement("td");td.textContent=value;tr.append(td);
        }
        bodyEvents.append(tr);
      }
      table.append(bodyEvents);events.append(table);
    }else events.textContent="Nessun evento.";
    el("monitor-scheda").textContent=JSON.stringify(item.scheda??{},null,2);
    // I dettagli tecnici rimangono richiusi, salvo apertura esplicita.
    el("monitor-events-disclosure").open=false;
    el("monitor-scheda-disclosure").open=false;
  }
  el(isFeedback?"feedback-save-status":"monitor-save-status").textContent="";
  if(fromClick)panel.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function selectMonitor(id,fromClick=false){showDetail("monitoraggio",id,fromClick);}

function selectFeedback(id,fromClick=false){showDetail("suggerimenti",id,fromClick);}
function drawList(kind) {
  const feedback=kind==="suggerimenti",state=store[kind];
  const node=el(feedback?"feedback-list":"monitor-list");node.replaceChildren();
  if(!state.rows.length){
    const p=document.createElement("p");p.className="activity-empty";
    p.textContent=feedback?"Nessun suggerimento per i filtri selezionati.":"Nessuna richiesta per i filtri selezionati.";
    node.append(p);return;
  }
  // Una riga per record, con tabella a tutta larghezza; nessuna card ripetuta.
  const columns=feedback?[
    ["Data",row=>shortDate(row.createdAt),"activity-date"],
    ["Farmacia",row=>row.farmacia||"—","activity-farmacia"],
    ["Giudizio",row=>row.soddisfatto===null?"Non espresso":row.soddisfatto?"Soddisfatto":"Non soddisfatto",""],
    ["Suggerimento / analisi",row=>shorten(row.suggerimentoUtente||row.osservazioniAi,110),"activity-subject"],
    ["Esito chat",row=>row.esitoConversazione||"—",""],
    ["Gestione",row=>label(row.statoGestione,kind),"activity-state"]
  ]:[
    ["Data",row=>shortDate(row.createdAt),"activity-date"],
    ["Pratica",row=>row.id.slice(0,8),"activity-code"],
    ["Farmacia",row=>row.farmacia||"—","activity-farmacia"],
    ["Richiesta",row=>row.oggetto||"—","activity-subject"],
    ["Tecnico",row=>row.specializzazione||"—",""],
    ["Urgenza",row=>row.urgenza||"—",""],
    ["SOS",row=>row.statoIntervento||"—",""],
    ["Gestione",row=>label(row.statoMonitoraggio,kind),"activity-state"],
    ["Eventi",row=>String((row.eventi||[]).length),"activity-event-count"]
  ];
  const table=document.createElement("table");table.className="activity-data-table";
  const thead=document.createElement("thead"),header=document.createElement("tr");
  for(const [title] of columns){const th=document.createElement("th");th.scope="col";th.textContent=title;header.append(th);}
  const actionTitle=document.createElement("th");actionTitle.scope="col";actionTitle.textContent="";actionTitle.setAttribute("aria-label","Azioni");header.append(actionTitle);
  thead.append(header);table.append(thead);
  const tbody=document.createElement("tbody");
  for(const row of state.rows){
    const tr=document.createElement("tr");tr.dataset.id=row.id;
    if(row.id===state.selectedId)tr.classList.add("is-selected");
    for(const [,get,className] of columns){
      const td=document.createElement("td");if(className)td.className=className;
      const value=get(row);td.textContent=value==null?"—":String(value);
      td.title=String(value==null?"—":value);
      if(className==="activity-code")td.title=row.id;
      tr.append(td);
    }
    const td=document.createElement("td"),button=document.createElement("button");
    button.type="button";button.className="activity-open";button.dataset.id=row.id;
    button.textContent="Dettagli";button.setAttribute("aria-expanded",String(state.selectedId===row.id));
    button.setAttribute("aria-label","Apri dettagli: "+(feedback?row.farmacia||row.id:row.oggetto||row.id));
    button.addEventListener("click",()=>{
      if(state.selectedId===row.id)showDetail(kind,null);
      else showDetail(kind,row.id,true);
    });
    td.append(button);tr.append(td);tbody.append(tr);
  }
  table.append(tbody);node.append(table);
}
function showMetrics(kind) {
  const rows = store[kind].rows;
  if(kind === "monitoraggio") {
    el("monitor-total").textContent = String(rows.length);
    el("monitor-pending").textContent = String(rows.filter(x=>x.statoMonitoraggio==="da_esaminare").length);
    el("monitor-active").textContent = String(rows.filter(x=>["in_esame","in_attesa"].includes(x.statoMonitoraggio)).length);
    el("monitor-done").textContent = String(rows.filter(x=>x.statoMonitoraggio==="completata").length);
  }else {
    el("feedback-total").textContent = String(rows.length);
    el("feedback-positive").textContent = String(rows.filter(x=>x.soddisfatto===true).length);
    el("feedback-negative").textContent = String(rows.filter(x=>x.soddisfatto===false).length);
    el("feedback-new").textContent = String(rows.filter(x=>x.statoGestione==="nuovo").length);
  }
}
async function load(kind) {
  const feedback = kind==="suggerimenti", state = store[kind];
  if(state.loading) return;
  state.loading=true;
  const form=el(feedback?"feedback-filters":"monitor-filters");
  const status=el(feedback?"feedback-status":"monitor-status");
  status.textContent="Caricamento dal backend…";
  try{
    const filters={q:form.elements.namedItem("q").value,stato:form.elements.namedItem("stato").value};
    const rows=await (feedback?getFeedback(filters):getMonitoring(filters));
    if(!Array.isArray(rows)) throw new Error("Risposta del server non valida");
    state.rows=rows;
    drawList(kind);showMetrics(kind);
    status.textContent=rows.length+" record visualizzati (massimo 250 per ricerca).";
    if(state.selectedId && rows.some(r=>r.id===state.selectedId))
      showDetail(kind,state.selectedId);
    else showDetail(kind,null);
  }catch(e){status.textContent="Errore: "+errorText(e);}
  finally{state.loading=false;}
}
async function save(kind) {
  const feedback=kind==="suggerimenti",state=store[kind];
  if(!state.selectedId)return;
  const form=el(feedback?"feedback-editor":"monitor-editor"),status=el(feedback?"feedback-save-status":"monitor-save-status");
  const button=form.querySelector('button[type="submit"]');
  const payload={stato:form.elements.namedItem("stato").value,noteInterne:form.elements.namedItem("noteInterne").value};
  button.disabled=true;status.textContent="Salvataggio…";
  try{
    const result=await (feedback?saveFeedbackReview(state.selectedId,payload):saveMonitoring(state.selectedId,payload));
    if(result?.saved!==true)throw new Error("Conferma di salvataggio mancante");
    await load(kind);
    status.textContent="Modifica salvata sul server.";
  }catch(e){status.textContent="Non salvato: "+errorText(e);}
  finally{button.disabled=false;}
}
export function initializeSosActivityForms(){
  if(mounted)return;mounted=true;
  for(const kind of ["monitoraggio","suggerimenti"]){
    const feedback=kind==="suggerimenti";
    el(feedback?"feedback-refresh":"monitor-refresh").addEventListener("click",()=>load(kind));
    el(feedback?"feedback-filters":"monitor-filters").addEventListener("submit",ev=>{ev.preventDefault();load(kind);});
    el(feedback?"feedback-editor":"monitor-editor").addEventListener("submit",ev=>{ev.preventDefault();save(kind);});
  }
  el("monitor-close").addEventListener("click",()=>selectMonitor(null));
  el("feedback-close").addEventListener("click",()=>selectFeedback(null));
  window.addEventListener("fastpharma:activities-open",ev=> {
    if(["monitoraggio","suggerimenti"].includes(ev.detail?.view))load(ev.detail.view);
  });
}
