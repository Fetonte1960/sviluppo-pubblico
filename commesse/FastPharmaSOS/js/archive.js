import {
  getCommessa,
  getCommessaDocumenti,
  getCommessaInterazioni,
  getCommesse
} from "./api.js";

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
    description.textContent = item.summaryAi || item.descrizione || "Nessuna descrizione.";

    const location = document.createElement("code");
    location.textContent = item.riferimentoLocalizzazione || "localizzazione non disponibile";

    card.append(title, meta, description, location);
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
  let selectedItem = null;
  let originalItem = null;
  let newDraftMode = false;
  let editMode = false;
  const localEdits = new Map();

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
    status.textContent = "Caricamento…";
    try {
      currentItems = await getCommesse(query);
      fillSelect(currentItems);
      if (!query) updateDashboardMetrics(currentItems);
      status.textContent = `${currentItems.length} farmacie trovate`;
    } catch (error) {
      fillSelect([]);
      status.textContent = "Archivio non raggiungibile";
      console.error(error);
    }
  };

  const loadSelected = async id => {
    if (!id) {
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

  $("pharmacy-name")?.addEventListener("input", event => {
    if (!newDraftMode) return;
    emitSelection({
      id: null,
      codice: $("pharmacy-code")?.value || "",
      cliente: event.target.value,
      localizzazioneIntervento: $("pharmacy-location")?.value || ""
    });
  });

  loadItems("");
}
