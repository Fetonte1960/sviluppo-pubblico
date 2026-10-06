import { askAssistant, getAiHealth, getCommesse, getHealth } from "./api.js";

const $ = id => document.getElementById(id);
const apiStatus = $("api-status");
const aiStatus = $("ai-status");
const dbStatus = $("db-status");
const archiveSummary = $("archive-summary");
const messages = $("chat-messages");
const form = $("chat-form");
const input = $("chat-input");
const sendButton = $("send-button");
const quickButtons = [...document.querySelectorAll("[data-prompt]")];

function setStatus(element, text, ok) {
  element.textContent = text;
  element.className = `status-pill ${ok ? "ok" : "error"}`;
}

function addMessage(role, text, meta = "") {
  const item = document.createElement("div");
  item.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "TU" : role === "error" ? "SISTEMA" : "SOS";

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
  quickButtons.forEach(button => { button.disabled = busy; });
  sendButton.textContent = busy ? "Attendi…" : "Invia";
}

async function refreshStatus() {
  const [healthResult, aiResult, commesseResult] = await Promise.allSettled([
    getHealth(),
    getAiHealth(),
    getCommesse()
  ]);

  setStatus(apiStatus, healthResult.status === "fulfilled" ? "API online" : "API offline", healthResult.status === "fulfilled");

  if (aiResult.status === "fulfilled" && aiResult.value?.status === "configured") {
    setStatus(aiStatus, `AI ${aiResult.value.model ?? "online"}`, true);
  } else {
    setStatus(aiStatus, "AI offline", false);
  }

  if (commesseResult.status === "fulfilled" && Array.isArray(commesseResult.value)) {
    const commesse = commesseResult.value;
    setStatus(dbStatus, `Archivio ${commesse.length}`, true);
    const preview = commesse.slice(0, 2)
      .map(item => [item.codice, item.titolo].filter(Boolean).join(" · "))
      .filter(Boolean);
    archiveSummary.textContent = `Archivio demo: ${commesse.length} commesse${preview.length ? " — " + preview.join(" / ") : ""}`;
  } else {
    setStatus(dbStatus, "Archivio offline", false);
    archiveSummary.textContent = "Archivio demo non raggiungibile.";
  }
}

async function sendMessage(message) {
  const clean = message.trim();
  if (!clean) return;

  addMessage("user", clean);
  input.value = "";
  setBusy(true);

  const pending = addMessage("assistant", "Sto elaborando la richiesta…");

  try {
    const response = await askAssistant(clean);
    pending.remove();

    const meta = [
      response?.provider,
      response?.model,
      Number.isInteger(response?.toolIterations)
        ? `${response.toolIterations} consultazioni archivio`
        : null
    ].filter(Boolean).join(" · ");

    addMessage("assistant", response?.answer ?? "Nessuna risposta disponibile.", meta);
  } catch (error) {
    pending.remove();
    const suffix = error?.status ? ` (HTTP ${error.status})` : "";
    addMessage("error", `Non riesco a completare la richiesta${suffix}. Riprova tra poco.`);
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
