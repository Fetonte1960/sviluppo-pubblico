import { getTechnicians, getSpecializations, saveTechnician } from "./api.js?v=1.1.6";

const byId = name => document.getElementById(name);
let initialized = false;
let selectedId = "";
let technicians = [];
let skills = [];

function message(text, failure = false) {
  const node = byId("company-status");
  node.textContent = text;
  node.classList.toggle("error-text", failure);
}
function option(select, value, text) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = text;
  select.append(item);
}
function valuesFromForm() {
  const form = byId("company-form");
  const field = name => form.elements.namedItem(name);
  const checked = [...form.querySelectorAll('input[name="specializzazioni"]:checked')]
    .map(x => x.value);
  return {
    ragioneSociale: field("ragioneSociale").value.trim(),
    referente: field("referente").value.trim() || null,
    partitaIva: field("partitaIva").value.trim() || null,
    telefono: field("telefono").value.trim() || null,
    email: field("email").value.trim() || null,
    indirizzo: field("indirizzo").value.trim() || null,
    comune: field("comune").value.trim() || null,
    provincia: field("provincia").value.trim().toUpperCase() || null,
    provinceServite: [...new Set(field("provinceServite").value.toUpperCase()
      .split(/[;,\s]+/).map(x => x.trim()).filter(Boolean))],
    reperibilita24h: field("reperibilita24h").checked,
    note: field("note").value.trim() || null,
    specializzazioni: checked,
    convenzioneStato: field("convenzioneStato").value,
    attivo: field("attivo").checked
  };
}
function setForm(data = null) {
  const form = byId("company-form");
  form.reset();
  const field = name => form.elements.namedItem(name);
  selectedId = data?.id || "";
  byId("company-form-title").textContent = data ? "Modifica azienda / tecnico" : "Nuova azienda / tecnico";
  for (const name of ["ragioneSociale","referente","partitaIva","telefono","email","indirizzo","comune","provincia","note"]) {
    field(name).value = data?.[name] ?? "";
  }
  field("provinceServite").value = (data?.provinceServite ?? []).join(", ");
  field("reperibilita24h").checked = !!data?.reperibilita24h;
  field("attivo").checked = data ? !!data.attivo : true;
  field("convenzioneStato").value = data?.convenzioneStato || "da_verificare";
  const assigned = new Set(data?.specializzazioni ?? []);
  form.querySelectorAll('input[name="specializzazioni"]').forEach(x => x.checked = assigned.has(x.value));
  form.hidden = false;
  byId("company-cancel").hidden = false;
  byId("company-save").textContent = data ? "Salva modifiche su Neon" : "Registra su Neon";
  byId("company-form-note").textContent = data
    ? "La modifica dell'elenco delle competenze aggiorna le specializzazioni associate a questa azienda."
    : "Le nuove aziende iniziano con convenzione da verificare. Nessuna richiesta viene inviata automaticamente.";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeForm() {
  byId("company-form").hidden = true;
  selectedId = "";
}
function cell(row, text) {
  const node = document.createElement("td");
  node.textContent = text || "—";
  row.append(node);
  return node;
}
function render() {
  const body = byId("company-rows");
  body.replaceChildren();
  byId("company-count").textContent = technicians.length === 1
    ? "1 azienda" : `${technicians.length} aziende / tecnici`;
  if (!technicians.length) {
    const row = document.createElement("tr"), c = document.createElement("td");
    c.colSpan = 6;
    c.textContent = "Nessuna azienda trovata. Usa «Nuova azienda» per inserirne una.";
    c.className = "company-empty";
    row.append(c);body.append(row);
    return;
  }
  for (const item of technicians) {
    const row = document.createElement("tr");
    cell(row, item.ragioneSociale);
    cell(row, [item.referente,item.telefono,item.email].filter(Boolean).join(" · "));
    cell(row, [item.comune,item.provincia].filter(Boolean).join(" · "));
    cell(row, (item.specializzazioni || []).map(id =>
      skills.find(x => x.codice === id)?.descrizione || id).join(", "));
    cell(row, !item.attivo ? "Disattiva" :
      item.convenzioneStato === "attiva" ? "Convenzionata" :
      item.convenzioneStato === "sospesa" ? "Sospesa" : "Da verificare");
    const last = document.createElement("td");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary-action";
    edit.textContent = "Modifica";
    edit.addEventListener("click", () => setForm(item));
    last.append(edit);row.append(last);
    body.append(row);
  }
}
async function load() {
  message("Caricamento aziende…");
  const controls = byId("company-filters");
  const q = controls.elements.namedItem("q").value.trim();
  const competenza = controls.elements.namedItem("competenza").value;
  const provincia = controls.elements.namedItem("provincia").value.trim().toUpperCase();
  try {
    technicians = await getTechnicians({ q, competenza, provincia });
    if (!Array.isArray(technicians)) throw new Error("Risposta anagrafica non valida");
    render();
    message(`Anagrafica centrale aggiornata: ${technicians.length} risultati.`);
  } catch (err) {
    technicians = [];render();
    message(err.status === 401 ? "Sessione scaduta. Ricarica il gestionale e accedi di nuovo." :
      `Impossibile leggere le aziende: ${err.body?.error || err.message}`, true);
  }
}
export function initializeCompanyManager() {
  if (initialized) return;
  initialized = true;
  const filter = byId("company-filters"), form = byId("company-form");
  filter.addEventListener("submit", event => {event.preventDefault();load();});
  byId("company-refresh").addEventListener("click", load);
  byId("company-new").addEventListener("click", () => setForm());
  byId("company-cancel").addEventListener("click", closeForm);
  byId("company-clear-filters").addEventListener("click", () => {filter.reset();load();});
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = valuesFromForm();
    if (!data.ragioneSociale || data.ragioneSociale.length < 2) {message("Inserisci la ragione sociale.", true);return;}
    if (!data.specializzazioni.length) {message("Seleziona almeno una specializzazione.", true);return;}
    if (data.provincia && !/^[A-Z]{2}$/.test(data.provincia)) {message("Provincia: usa due lettere (es. MI).", true);return;}
    if (data.provinceServite.some(x => !/^[A-Z]{2}$/.test(x))) {message("Province servite: usa sigle di due lettere separate da virgole.", true);return;}
    const save = byId("company-save");
    save.disabled = true;
    message("Salvataggio su Neon…");
    try {
      const wasEdit = !!selectedId;
      await saveTechnician(selectedId, data);
      closeForm();
      await load();
      message(wasEdit ? "Azienda aggiornata su Neon." : "Azienda registrata su Neon (convenzione da verificare).");
    } catch (err) {
      message(`Salvataggio non riuscito: ${err.body?.error || err.message}`, true);
    } finally {save.disabled = false;}
  });
  window.addEventListener("fastpharma:companies-open", load);
  getSpecializations().then(list => {
    skills = Array.isArray(list) ? list : [];
    const picker = byId("company-filter-skill");
    const listNode = byId("company-skills");
    for (const skill of skills) {
      option(picker,skill.codice,skill.descrizione);
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";input.name = "specializzazioni";input.value = skill.codice;
      label.append(input,document.createTextNode(" "+skill.descrizione));
      listNode.append(label);
    }
  }).catch(err => message("Specializzazioni non disponibili: "+err.message,true));
}
