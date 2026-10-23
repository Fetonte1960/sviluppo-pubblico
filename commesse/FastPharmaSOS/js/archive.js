import {
  getCommessa,
  getCommessaDocumenti,
  getCommessaInterazioni,
  getCommesse,
  savePharmacyDocument,
  deletePharmacyDocument
} from "./api.js?v=1.1.5";

const $ = id => document.getElementById(id);

function setValue(id, value) {
  const element = $(id);
  if (element) element.value = value ?? "";
}

function setReadonly(readonly) {
  const code = $("pharmacy-code");
  if (code) code.readOnly = true;

  [
    "pharmacy-name",
    "pharmacy-location",
    "pharmacy-state",
    "pharmacy-owner",
    "pharmacy-description"
  ].forEach(id => {
    const element = $(id);
    if (element) element.readOnly = readonly;
  });
}

function clearList(container, message) {
  container.replaceChildren();
  const placeholder = document.createElement("div");
  placeholder.className = "module-placeholder";
  placeholder.textContent = message;
  container.append(placeholder);
}

function renderDocuments(container, items) {
  container.replaceChildren();

  if (!Array.isArray(items) || !items.length) {
    clearList(container, "Nessun documento registrato per questa farmacia.");
    return;
  }

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "archive-record";

    const title = document.createElement("strong");
    title.textContent = item.titolo || "Documento";

    const meta = document.createElement("span");
    meta.textContent = [
      item.tipoDocumento,
      item.dataDocumento ? new Date(item.dataDocumento).toLocaleDateString("it-IT") : null,
      item.versione ? `v. ${item.versione}` : null
    ].filter(Boolean).join(" · ");

    const description = document.createElement("p");
    description.textContent = item.tipoDocumento === "immagine" ? "Immagine allegata" : (item.summaryAi || item.descrizione || "Nessuna descrizione.");

    const location = document.createElement("code");
    location.textContent = item.riferimentoLocalizzazione || "localizzazione non disponibile";

    card.append(title, meta, description, location);
    if (item.tipoDocumento === "immagine" && /^data:image\/(png|jpeg|webp);base64,/.test(item.descrizione || "")) {
      const img = document.createElement("img"); img.src = item.descrizione; img.alt = item.titolo || "Immagine documento"; img.loading = "lazy"; img.style.cssText = "max-width:100%;max-height:240px;object-fit:contain"; card.append(img);
    }
    container.append(card);
  });
}

function renderInteractions(container, items) {
  container.replaceChildren();

  if (!Array.isArray(items) || !items.length) {
    clearList(container, "Nessuna interazione registrata per questa farmacia.");
    return;
  }

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "archive-record";

    const title = document.createElement("strong");
    title.textContent = item.sintesi || item.oggetto || "Interazione";

    const meta = document.createElement("span");
    meta.textContent = [
      item.dataOra ? new Date(item.dataOra).toLocaleString("it-IT") : null,
      item.autore,
      item.tipo,
      item.canale
    ].filter(Boolean).join(" · ");

    const detail = document.createElement("p");
    detail.textContent = item.dettaglio || "";

    card.append(title, meta);
    if (detail.textContent) card.append(detail);
    container.append(card);
  });
}

function emitSelection(item) {
  window.dispatchEvent(new CustomEvent("fastpharma:pharmacy-selected", {
    detail: item ? {
      id: item.id,
      codice: item.codice,
      nome: item.cliente || item.titolo || "",
      localizzazione: item.localizzazioneIntervento || ""
    } : null
  }));
}

export function initializeArchiveWorkspace() {
  const select = $("pharmacy-select");
  const search = $("pharmacy-search");
  const searchButton = $("pharmacy-search-button");
  const newButton = $("new-pharmacy");
  const status = $("pharmacy-workspace-status");
  const documents = $("pharmacy-documents");
  const interactions = $("pharmacy-interactions");
  const editButton = $("edit-pharmacy");
  const cancelEditButton = $("cancel-pharmacy-edit");
  const saveDraft = $("save-pharmacy-draft");
  const modeNote = $("pharmacy-mode-note");
  const tabs = [...document.querySelectorAll("[data-archive-tab]")];
  const panels = [...document.querySelectorAll("[data-archive-panel]")];

  if (!select || !search || !searchButton || !newButton || !status) return;

  let currentItems = [];
  let catalogItems = [];
  let fetchSequence = 0;
  const catalog = $("pharmacy-catalog");
  const detailView = $("pharmacy-detail");
  const city = $("pharmacy-filter-city");
  const state = $("pharmacy-filter-state");
  const sort = $("pharmacy-sort");
  const rows = $("pharmacy-catalog-rows");
  const showDetail = visible => { catalog.hidden = visible; detailView.hidden = !visible; };
  const comparison = (a,b) => String(a || "").localeCompare(String(b || ""), "it", {numeric:true,sensitivity:"base"});
  const updateChoices = (control, values) => {
    const before = control.value;
    control.length = 1;
    [...new Set(values.filter(Boolean))].sort(comparison).forEach(value => control.add(new Option(value,value)));
    control.value = [...control.options].some(option => option.value === before) ? before : "";
  };
  const renderCatalog = () => {
    const filtered = catalogItems.filter(item =>
      (!city.value || item.localizzazioneIntervento === city.value) &&
      (!state.value || item.stato === state.value));
    const field = {
      name: item => item.cliente || item.titolo,
      city: item => item.localizzazioneIntervento,
      code: item => item.codice,
      state: item => item.stato
    }[sort.value] || (item => item.cliente || item.titolo);
    filtered.sort((a,b) => comparison(field(a),field(b)) || comparison(a.codice,b.codice));
    rows.replaceChildren();
    $("pharmacy-catalog-count").textContent = filtered.length + " su " + catalogItems.length + " farmacie";
    if (!filtered.length) {
      const cell = rows.insertRow().insertCell();
      cell.colSpan = 5;
      cell.textContent = "Nessuna farmacia trovata.";
    }
    filtered.forEach(item => {
      const tr = rows.insertRow();
      [item.codice,item.cliente || item.titolo,item.localizzazioneIntervento,item.stato].forEach(value => {
        tr.insertCell().textContent = value || "—";
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-action";
      button.textContent = "Apri";
      button.addEventListener("click", () => {
        if (![...select.options].some(option => option.value === String(item.id))) fillSelect(catalogItems);
        select.value = String(item.id);
        loadSelected(item.id);
      });
      tr.insertCell().append(button);
    });
  };
  [city,state,sort].forEach(control => control.addEventListener("change",renderCatalog));
  $("pharmacy-reset-filters").addEventListener("click", () => {
    city.value = ""; state.value = ""; sort.value = "name";
    search.value = ""; loadItems("");
  });
  $("pharmacy-back-list").addEventListener("click", () => { select.value = ""; loadSelected(""); });

  let selectedItem = null;
  let originalItem = null;
  let newDraftMode = false;
  let editMode = false;
  const localEdits = new Map();
  const demoPharmacies = new Map();
  const confirmNew = $("confirm-new-pharmacy");
  const combinedItems = items => [...items, ...demoPharmacies.values()];
  const notifyDemoList = () => window.dispatchEvent(new CustomEvent("fastpharma:demo-pharmacies", {detail:[...demoPharmacies.values()]}));

  const showTab = name => {
    tabs.forEach(button => button.classList.toggle("is-active", button.dataset.archiveTab === name));
    panels.forEach(panel => panel.classList.toggle("is-active", panel.dataset.archivePanel === name));
  };

  tabs.forEach(button => {
    button.addEventListener("click", () => showTab(button.dataset.archiveTab));
  });

  const fillSelect = items => {
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = items.length ? "Seleziona una farmacia…" : "Nessuna farmacia trovata";
    select.append(empty);

    items.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = [item.codice, item.cliente || item.titolo, item.localizzazioneIntervento]
        .filter(Boolean)
        .join(" · ");
      select.append(option);
    });
  };

  const updateEditControls = () => {
    editButton.disabled = !selectedItem || newDraftMode || editMode;
    confirmNew.hidden = !newDraftMode;
    editButton.hidden = newDraftMode || editMode;
    cancelEditButton.hidden = !editMode;
    saveDraft.hidden = !editMode;
  };

  const readForm = () => ({
    ...selectedItem,
    cliente: $("pharmacy-name")?.value ?? "",
    localizzazioneIntervento: $("pharmacy-location")?.value ?? "",
    stato: $("pharmacy-state")?.value ?? "",
    responsabile: $("pharmacy-owner")?.value ?? "",
    descrizione: $("pharmacy-description")?.value ?? ""
  });

  const populateForm = item => {
    setValue("pharmacy-code", item?.codice);
    setValue("pharmacy-name", item?.cliente || item?.titolo);
    setValue("pharmacy-location", item?.localizzazioneIntervento);
    setValue("pharmacy-state", item?.stato);
    setValue("pharmacy-owner", item?.responsabile);
    setValue("pharmacy-description", item?.descrizione);
  };

  const updateDashboardMetrics = items => {
    const total = document.getElementById("metric-pharmacies");
    const open = document.getElementById("metric-open");
    const locations = document.getElementById("metric-locations");

    if (total) total.textContent = String(items.length);
    if (open) {
      open.textContent = String(items.filter(item =>
        String(item.stato || "").toLowerCase() === "aperta"
      ).length);
    }
    if (locations) {
      locations.textContent = String(new Set(
        items
          .map(item => String(item.localizzazioneIntervento || "").trim().toLowerCase())
          .filter(Boolean)
      ).size);
    }
  };

  const loadItems = async query => {
    const sequence = ++fetchSequence;
    status.textContent = "Collegamento all’archivio… Se il server è in pausa, il risveglio può richiedere circa un minuto.";
    try {
      const result = await getCommesse(query);
      if (sequence !== fetchSequence) return;
      currentItems = result;
      catalogItems = combinedItems(result);
      updateChoices(city,catalogItems.map(item => item.localizzazioneIntervento));
      updateChoices(state,catalogItems.map(item => item.stato));
      renderCatalog();
      fillSelect(catalogItems);
      if (!query) updateDashboardMetrics(currentItems);
      status.textContent = `${currentItems.length} farmacie trovate`;
    } catch (error) {
      if (sequence !== fetchSequence) return;
      catalogItems = [];
      renderCatalog();
      fillSelect([]);
      status.textContent = "Archivio momentaneamente non raggiungibile. Riprova con Cerca o Aggiorna.";
      console.error(error);
    }
  };

  const loadSelected = async id => {
    if (!id) {
      showDetail(false);
      selectedItem = null;
      originalItem = null;
      newDraftMode = false;
      editMode = false;
      populateForm(null);
      setReadonly(true);
      updateEditControls();
      modeNote.textContent = "Seleziona una farmacia esistente oppure crea una nuova bozza locale.";
      clearList(documents, "Seleziona una farmacia per leggere i documenti già presenti.");
      clearList(interactions, "Seleziona una farmacia per leggere la cronologia disponibile.");
      emitSelection(null);
      return;
    }

    newDraftMode = false;
    editMode = false;
    setReadonly(true);
    if (demoPharmacies.has(String(id))) {
      selectedItem = localEdits.get(String(id)) ?? demoPharmacies.get(String(id));
      originalItem = JSON.parse(JSON.stringify(selectedItem));
      populateForm(selectedItem);
      updateEditControls();
      clearList(documents, "Farmacia demo locale: nessun documento.");
      clearList(interactions, "Farmacia demo locale: nessuna cronologia.");
      emitSelection(selectedItem);
      showDetail(true);
      showTab("anagrafica");
      status.textContent = selectedItem.codice + " · DEMO locale";
      modeNote.textContent = "Bozza locale, non presente in Neon.";
      return;
    }
    modeNote.textContent = "Dati letti da Neon tramite API FastPharmaSOS.";

    try {
      status.textContent = "Apertura farmacia…";
      const [detail, docs, timeline] = await Promise.all([
        getCommessa(id),
        getCommessaDocumenti(id),
        getCommessaInterazioni(id)
      ]);

      selectedItem = localEdits.get(detail.id) ?? detail;
      originalItem = JSON.parse(JSON.stringify(selectedItem));
      populateForm(selectedItem);
      updateEditControls();
      renderDocuments(documents, docs);
      renderInteractions(interactions, timeline);
      emitSelection(detail);
      showDetail(true);
      showTab("anagrafica");
      status.textContent = [detail.codice, detail.cliente || detail.titolo].filter(Boolean).join(" · ");
    } catch (error) {
      status.textContent = "Errore durante l'apertura della farmacia";
      console.error(error);
    }
  };

  editButton.addEventListener("click", () => {
    if (!selectedItem) return;
    originalItem = JSON.parse(JSON.stringify(selectedItem));
    editMode = true;
    setReadonly(false);
    $("pharmacy-code").readOnly = true;
    updateEditControls();
    modeNote.textContent = "Modifica demo attiva: le variazioni restano solo in questa sessione.";
    $("pharmacy-name")?.focus();
  });

  cancelEditButton.addEventListener("click", () => {
    if (!originalItem) return;
    selectedItem = JSON.parse(JSON.stringify(originalItem));
    populateForm(selectedItem);
    editMode = false;
    setReadonly(true);
    updateEditControls();
    modeNote.textContent = "Modifiche annullate.";
  });

  saveDraft.addEventListener("click", () => {
    if (!editMode || !selectedItem?.id) return;
    selectedItem = readForm();
    localEdits.set(selectedItem.id, JSON.parse(JSON.stringify(selectedItem)));
    originalItem = JSON.parse(JSON.stringify(selectedItem));
    editMode = false;
    setReadonly(true);
    updateEditControls();
    modeNote.textContent = "Modifica demo applicata nella sessione del browser.";
    status.textContent = [selectedItem.codice, selectedItem.cliente || selectedItem.titolo, "modifica locale"].filter(Boolean).join(" · ");
    emitSelection(selectedItem);
  });

  searchButton.addEventListener("click", () => loadItems(search.value.trim()));

  search.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadItems(search.value.trim());
    }
  });

  select.addEventListener("change", () => loadSelected(select.value));

  window.addEventListener("fastpharma:refresh-archive", () => {
    search.value = "";
    loadItems("");
  });

  newButton.addEventListener("click", () => {
    newDraftMode = true;
    showDetail(true);
    editMode = false;
    selectedItem = null;
    originalItem = null;
    select.value = "";
    populateForm({
      codice: "",
      cliente: "",
      localizzazioneIntervento: "",
      stato: "BOZZA",
      responsabile: "",
      descrizione: ""
    });
    setReadonly(false);
    updateEditControls();
    modeNote.textContent = "Nuova farmacia: bozza locale non ancora salvata nel database.";
    status.textContent = "Bozza locale";
    clearList(documents, "I documenti saranno collegabili dopo la creazione della farmacia nel database.");
    clearList(interactions, "La cronologia inizierà dopo la creazione della farmacia nel database.");
    emitSelection({
      id: null,
      codice: "",
      cliente: "",
      localizzazioneIntervento: ""
    });
    showTab("anagrafica");
    $("pharmacy-name")?.focus();
  });

  confirmNew.addEventListener("click", () => {
    if (!newDraftMode) return;
    const name = $("pharmacy-name").value.trim();
    const location = $("pharmacy-location").value.trim();
    if (!name || !location) {
      modeNote.textContent = "Inserisci farmacia/cliente e località prima di confermare.";
      return;
    }
    const id = "demo-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
    const code = "LOCAL-" + String(demoPharmacies.size + 1).padStart(3, "0");
    const draft = {...readForm(), id, codice:code, cliente:name, localizzazioneIntervento:location, stato:"BOZZA DEMO"};
    demoPharmacies.set(id, draft);
    newDraftMode = false;
    selectedItem = draft;
    originalItem = JSON.parse(JSON.stringify(draft));
    populateForm(draft);
    setReadonly(true);
    updateEditControls();
    catalogItems = combinedItems(currentItems);
    fillSelect(catalogItems);
    select.value = id;
    updateChoices(city,catalogItems.map(item => item.localizzazioneIntervento));
    updateChoices(state,catalogItems.map(item => item.stato));
    renderCatalog();
    notifyDemoList();
    emitSelection(draft);
    modeNote.textContent = "Bozza demo confermata nella sessione: puoi aggiungere immagini. Nessuna scrittura Neon.";
    status.textContent = code + " · " + name + " · locale";
    showTab("immagini");
  });

  $("pharmacy-name")?.addEventListener("input", event => {
    if (!newDraftMode) return;
    emitSelection({
      id: null,
      codice: $("pharmacy-code")?.value || "",
      cliente: event.target.value,
      localizzazioneIntervento: $("pharmacy-location")?.value || ""
    });
  });

  showDetail(false);
  loadItems("");
}

export function initializeDocumentEditor() {
  const $id = id => document.getElementById(id);
  const form = $id("document-form");
  const selection = $id("document-select");
  if (!form || !selection) return;
  const kind = $id("document-kind"), title = $id("document-title");
  const content = $id("document-content"), file = $id("document-file");
  const location = $id("document-location");
  const status = $id("document-editor-status");
  let pharmacyId = null, documentId = null, docs = [], existingImage = null;
  const editButton = $id("document-edit"), deleteButton = $id("document-delete"), clearButton = $id("document-clear");
  const reset = () => {
    documentId = null; existingImage = null; form.reset(); form.hidden = true;
    editButton.disabled = true; deleteButton.disabled = true; if (clearButton) clearButton.disabled = true;
  };
  const refresh = async () => {
    if (!pharmacyId) { docs = []; selection.replaceChildren(new Option("Seleziona una farmacia...",""));reset();return; }
    try {
      docs = await getCommessaDocumenti(pharmacyId);
      selection.replaceChildren(new Option("Seleziona un documento...",""));
      docs.forEach(d => selection.add(new Option(d.titolo || "Documento", d.id)));
      reset();
      renderDocuments($id("pharmacy-documents"), docs);
    } catch (_) { status.textContent = "Impossibile aggiornare i documenti della farmacia."; }
  };
  const edit = () => {
    const d = docs.find(d => String(d.id) === selection.value);
    if (!d) return;
    documentId = d.id;
    kind.value = d.tipoDocumento === "immagine" ? "image" : d.tipoDocumento === "modello topologico per AI" ? "topology" : "text";
    title.value = d.titolo || "";
    location.value = d.riferimentoLocalizzazione || "";
    content.value = kind.value !== "image" ? (d.descrizione || "") : "";
    existingImage = kind.value === "image" ? d.descrizione : null;
    kind.dispatchEvent(new Event("change"));
    form.hidden = false;
    status.textContent = "Modifica documento; salva per confermare.";
  };
  selection.addEventListener("change", () => {
    editButton.disabled = !selection.value;
    deleteButton.disabled = !selection.value;
    if (clearButton) clearButton.disabled = !selection.value;
  });
  kind.addEventListener("change", () => {
    $id("document-text-field").hidden = kind.value === "image";
    $id("document-file-field").hidden = kind.value !== "image";
  });
  $id("document-new").addEventListener("click", () => {
    if (!pharmacyId) { status.textContent = "Seleziona prima una farmacia salvata su Neon."; return; }
    form.reset(); documentId = null; existingImage = null; form.hidden = false;
    kind.dispatchEvent(new Event("change")); status.textContent = "Nuovo documento.";
  });
  editButton.addEventListener("click", edit);
  $id("document-cancel").addEventListener("click", reset);
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!pharmacyId) return;
    let value = content.value, fileName = null;
    if (kind.value === "image") {
      const selected = file.files?.[0];
      if (selected) {
        if (!["image/png","image/jpeg","image/webp"].includes(selected.type) || selected.size > 3000000) {
          status.textContent = "Usa PNG, JPEG o WebP fino a 3 MB."; return;
        }
        value = await new Promise((resolve,reject) => {
          const reader = new FileReader(); reader.onload=()=>resolve(reader.result);
          reader.onerror=()=>reject(new Error("Lettura immagine fallita")); reader.readAsDataURL(selected);
        });
        fileName = selected.name;
      } else if (existingImage) value = existingImage;
      else { status.textContent = "Seleziona un'immagine.";return; }
    }
    if (value.length > 5000000 || (kind.value === "image" && !value)) { status.textContent = "Contenuto non valido o superiore a 5 milioni di caratteri.";return; }
    status.textContent = "Salvataggio in corso...";
    try {
      await savePharmacyDocument(pharmacyId,documentId,{kind:kind.value,title:title.value,content:value,location:location.value,fileName});
      status.textContent = "Documento salvato su Neon.";
      await refresh();
    } catch (error) { status.textContent = error.status === 401 ? "Sessione scaduta: ricarica la pagina ed effettua nuovamente l'accesso." : "Salvataggio non riuscito: "+error.message; }
  });
  if (clearButton) clearButton.addEventListener("click", async () => {
    const d = docs.find(x => String(x.id) === selection.value);
    if (!d || !pharmacyId) return;
    if (d.tipoDocumento === "immagine") {
      status.textContent = "Svuota è disponibile per i documenti testuali, non per le immagini.";
      return;
    }
    if (!confirm("Svuotare il contenuto di «" + d.titolo + "» su Neon? Il titolo e la voce resteranno disponibili, ma il contenuto attuale verrà cancellato. Questa azione non è annullabile.")) return;
    clearButton.disabled = true;
    status.textContent = "Svuotamento e salvataggio su Neon in corso...";
    try {
      await savePharmacyDocument(pharmacyId, d.id, {
        kind: d.tipoDocumento === "modello topologico per AI" ? "topology" : "text", title: d.titolo, content: "", location: d.riferimentoLocalizzazione || "", fileName: null
      });
      await refresh();
      selection.value = String(d.id);
      editButton.disabled = false;
      deleteButton.disabled = false;
      clearButton.disabled = false;
      edit();
      content.value = "";
      status.textContent = "Documento svuotato su Neon. La voce è conservata e pronta per essere compilata.";
    } catch (error) {
      clearButton.disabled = false;
      status.textContent = error.status === 401
        ? "Sessione scaduta: effettua nuovamente l'accesso."
        : "Svuotamento non riuscito: " + error.message;
    }
  });
  deleteButton.addEventListener("click", async () => {
    const d = docs.find(x=>String(x.id)===selection.value);
    if (!d || !pharmacyId || !confirm("Eliminare definitivamente il documento «"+d.titolo+"»?")) return;
    try { await deletePharmacyDocument(pharmacyId,d.id);status.textContent="Documento eliminato.";await refresh(); }
    catch(error) {status.textContent=error.status===401?"Sessione scaduta: ricarica la pagina ed effettua nuovamente l'accesso.":"Eliminazione non riuscita."; }
  });
  window.addEventListener("fastpharma:pharmacy-selected", ev => {
    pharmacyId=ev.detail?.id && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(ev.detail.id) ? ev.detail.id : null;
    refresh();
  });
}
