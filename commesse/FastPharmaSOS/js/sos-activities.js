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

function selectMonitor(id) {
  const model = store.monitoraggio; model.selectedId = id;
  const item = model.rows.find(row => row.id === id);
  const form = el("monitor-editor");
  el("monitor-empty").hidden = !!item;
  form.hidden = !item;
  if (!item) return;
  const body = el("monitor-detail"); body.replaceChildren();
  line(body,"Pratica", item.id);
  line(body,"Farmacia", (item.codiceFarmacia || "")+" · "+(item.farmacia || ""));
  line(body,"Oggetto", item.oggetto);
  line(body,"Specializzazione", item.specializzazione);
  line(body,"Locale", item.locale);
  line(body,"Urgenza", item.urgenza);
  line(body,"Stato operativo (sola lettura)", item.statoIntervento);
  line(body,"Rischio persone", item.rischioPersone ? "Segnalato" : "Non segnalato");
  line(body,"Tecnico", item.tecnicoId ? "ID "+item.tecnicoId : "Non assegnato");
  line(body,"Creata il", date(item.createdAt));
  form.elements.namedItem("stato").value = item.statoMonitoraggio || "da_esaminare";
  form.elements.namedItem("noteInterne").value = item.noteInterne || "";
  el("monitor-save-status").textContent = "";
  const eventList = el("monitor-events"); eventList.replaceChildren();
  for (const event of item.eventi || []) line(eventList, date(event.data), (event.tipo || "") + " · " + (event.attore || ""));
  if (!(item.eventi || []).length) eventList.textContent = "Nessun evento disponibile.";
  el("monitor-scheda").textContent = JSON.stringify(item.scheda ?? {}, null, 2);
  [...el("monitor-list").querySelectorAll("button[data-id]")].forEach(node =>
    node.setAttribute("aria-pressed",String(node.dataset.id === id)));
}
function selectFeedback(id) {
  const model = store.suggerimenti; model.selectedId = id;
  const item = model.rows.find(row => row.id === id);
  const form = el("feedback-editor");
  el("feedback-empty").hidden = !!item;
  form.hidden = !item;
  if (!item) return;
  const body = el("feedback-detail");body.replaceChildren();
  line(body,"Valutazione",item.id);
  line(body,"Farmacia",(item.codiceFarmacia || "")+" · "+(item.farmacia || ""));
  line(body,"Pratica collegata",item.interventoId || "Nessuna pratica collegata");
  line(body,"Risposta dell'utente",item.soddisfatto === null ? "Non espressa" : (item.soddisfatto ? "Soddisfatto" : "Non soddisfatto"));
  line(body,"Suggerimento del cliente",item.suggerimentoUtente);
  line(body,"Osservazioni dell'AI",item.osservazioniAi);
  line(body,"Valutazione delle istruzioni AI",label(item.efficaciaIstruzioni,"altro"));
  line(body,"Versione istruzioni",item.versioneIstruzioni);
  line(body,"Esito dichiarato della chat",item.esitoConversazione);
  line(body,"Raccolta",date(item.createdAt));
  form.elements.namedItem("stato").value = item.statoGestione || "nuovo";
  form.elements.namedItem("noteInterne").value = item.noteInterne || "";
  el("feedback-save-status").textContent = "";
  [...el("feedback-list").querySelectorAll("button[data-id]")].forEach(node =>
    node.setAttribute("aria-pressed",String(node.dataset.id === id)));
}
function drawList(kind) {
  const feedback = kind === "suggerimenti", state = store[kind];
  const node = el(feedback ? "feedback-list":"monitor-list"); node.replaceChildren();
  if (!state.rows.length) {
    const p=document.createElement("p");p.textContent=feedback?"Nessuna valutazione registrata per questo filtro.":"Nessuna richiesta registrata per questo filtro.";node.append(p);
  }
  for (const row of state.rows) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "activity-entry";
    button.dataset.id = row.id;
    button.setAttribute("aria-pressed",String(state.selectedId === row.id));
    const title = document.createElement("strong");
    title.textContent = feedback ? (row.farmacia || "Valutazione SOS") : (row.oggetto || "Richiesta intervento");
    const small = document.createElement("span");
    small.textContent = feedback
      ? [date(row.createdAt),row.soddisfatto === null?"Nessun giudizio":row.soddisfatto?"Soddisfatto":"Non soddisfatto",label(row.statoGestione,kind)].join(" · ")
      : [date(row.createdAt),row.specializzazione,row.statoIntervento,label(row.statoMonitoraggio,kind)].filter(Boolean).join(" · ");
    const excerpt = document.createElement("span");
    excerpt.textContent = shorten(feedback ? (row.suggerimentoUtente || row.osservazioniAi) : (row.farmacia || row.descrizione));
    button.append(title,small,excerpt);
    button.addEventListener("click", () => feedback ? selectFeedback(row.id) : selectMonitor(row.id));
    node.append(button);
  }
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
      feedback?selectFeedback(state.selectedId):selectMonitor(state.selectedId);
    else feedback?selectFeedback(null):selectMonitor(null);
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
    status.textContent="Modifica salvata sul server.";
    await load(kind);
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
  window.addEventListener("fastpharma:activities-open",ev=> {
    if(["monitoraggio","suggerimenti"].includes(ev.detail?.view))load(ev.detail.view);
  });
}
