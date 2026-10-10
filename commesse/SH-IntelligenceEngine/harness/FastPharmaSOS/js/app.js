import { askAi, getHealth, getModels, interpret } from "./api.js";

const $ = id => document.getElementById(id);
const apiStatus = $("api-status");
const detStatus = $("det-status");
const aiStatus = $("ai-status");
const messages = $("chat-messages");
const form = $("chat-form");
const input = $("chat-input");
const sendButton = $("send-button");
const modelSelect = $("ai-model");
const forceReject = $("force-reject");
const quickButtons = [...document.querySelectorAll("[data-prompt]")];

function setStatus(element, text, state = "ok") {
  element.textContent = text;
  element.className = `status-pill ${state}`;
}

function addMessage(role, text, meta = "") {
  const item = document.createElement("div");
  item.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent =
    role === "user" ? "TU" :
    role === "diagnostic" ? "FLUSSO" :
    "HARNESS";

  const body = document.createElement("div");
  body.textContent = text;
  item.append(label, body);

  if (meta) {
    const detail = document.createElement("div");
    detail.className = "message-meta";
    detail.textContent = meta;
    item.append(detail);
  }

  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function setBusy(busy) {
  input.disabled = busy;
  sendButton.disabled = busy;
  modelSelect.disabled = busy;
  forceReject.disabled = busy;
  quickButtons.forEach(button => { button.disabled = busy; });
  sendButton.textContent = busy ? "Attendi…" : "Invia";
}

function validateCommand(response) {
  if (forceReject.checked) {
    return { valid: false, reason: "rifiuto forzato dal tester" };
  }

  const command = response?.comando;
  if (!command || command.tipo !== "COUNT" || command.entita !== "pratica") {
    return { valid: false, reason: "comando non ammesso dall'harness" };
  }

  const openFilter = Array.isArray(command.filtri) && command.filtri.some(item =>
    item?.campo === "stato" &&
    item?.operatore === "equals" &&
    item?.valore === "aperta"
  );

  if (!openFilter) {
    return { valid: false, reason: "filtro non riconosciuto dalla commessa" };
  }

  return { valid: true, reason: "comando Hello FastPharmaSOS validato" };
}

async function refreshStatus() {
  const [health, models] = await Promise.allSettled([getHealth(), getModels()]);

  setStatus(
    apiStatus,
    health.status === "fulfilled" ? "SH online" : "SH offline",
    health.status === "fulfilled" ? "ok" : "error"
  );

  if (models.status === "fulfilled" && Array.isArray(models.value)) {
    modelSelect.replaceChildren();
    models.value
      .filter(item => item.disponibile)
      .forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.nome} · ${item.provider}`;
        modelSelect.append(option);
      });

    if (modelSelect.options.length) {
      setStatus(aiStatus, `${modelSelect.options.length} modello/i AI`, "ok");
    } else {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Nessun modello";
      modelSelect.append(option);
      setStatus(aiStatus, "Nessun modello AI", "error");
    }
  } else {
    modelSelect.innerHTML = '<option value="">Catalogo non disponibile</option>';
    setStatus(aiStatus, "Catalogo AI offline", "error");
  }

  setStatus(detStatus, "Deterministico pronto", "ok");
}

async function fallbackToAi(originalQuestion, reason) {
  const model = modelSelect.value;
  if (!model) {
    addMessage("diagnostic", "Fallback AI non eseguibile: nessun modello disponibile.", reason);
    return;
  }

  setStatus(aiStatus, "AI Gateway in corso…", "warn");
  addMessage("diagnostic", "La commessa inoltra al gateway AI la domanda originale senza reinterpretazione.", reason);

  const ai = await askAi(originalQuestion, model);
  setStatus(aiStatus, "AI Gateway OK", "ok");
  addMessage(
    "assistant",
    ai?.risposta ?? "Nessuna risposta AI disponibile.",
    [ai?.sorgente, ai?.modelloAi, "domanda originale inoltrata"].filter(Boolean).join(" · ")
  );
}

async function sendMessage(message) {
  const clean = message.trim();
  if (!clean) return;

  addMessage("user", clean);
  input.value = "";
  setBusy(true);

  const pending = addMessage("assistant", "Interrogazione del livello deterministico SH…");

  try {
    const response = await interpret(clean, modelSelect.value);
    pending.remove();

    if (response?.esito === "SUCCESS") {
      setStatus(detStatus, "SUCCESS da validare", "warn");
      const validation = validateCommand(response);

      if (validation.valid) {
        setStatus(detStatus, "Comando validato", "ok");
        addMessage(
          "assistant",
          "Interpretazione accettata dalla commessa. In produzione FastPharmaSOS eseguirebbe ora il comando sul proprio dominio dati.",
          [response?.sorgente, response?.regolaId, validation.reason].filter(Boolean).join(" · ")
        );
        addMessage("diagnostic", JSON.stringify(response.comando, null, 2), "comando strutturato");
      } else {
        setStatus(detStatus, "Comando rifiutato", "error");
        await fallbackToAi(clean, `SUCCESS rifiutato: ${validation.reason}`);
      }
      return;
    }

    if (response?.esito === "FAULT") {
      setStatus(detStatus, "FAULT", "warn");
      await fallbackToAi(clean, response?.risposta ?? "STRINGA_NON_INTERPRETATA");
      return;
    }

    throw new Error("Risposta SH non riconosciuta.");
  } catch (error) {
    pending.remove();
    setStatus(apiStatus, "Errore SH", "error");
    addMessage(
      "diagnostic",
      error?.kind === "timeout"
        ? "Timeout durante la chiamata a SH-IntelligenceEngine."
        : error?.kind === "network"
          ? "Il browser non riesce a raggiungere SH-IntelligenceEngine."
          : `Errore durante il collaudo: ${error?.message ?? "errore sconosciuto"}`,
      error?.status ? `HTTP ${error.status}` : ""
    );
    console.error(error);
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

quickButtons.forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt ?? ""));
});

refreshStatus();
