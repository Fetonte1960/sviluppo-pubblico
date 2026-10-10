import {
  confirmCandidate,
  executeQuery,
  getEngineTestHealth,
  getHealth,
  getTestAppHealth,
  interpret
} from "./api.js";

const $ = id => document.getElementById(id);
const apiStatus = $("api-status");
const engineDbStatus = $("engine-db-status");
const appDbStatus = $("app-db-status");
const messages = $("chat-messages");
const form = $("chat-form");
const input = $("chat-input");
const sendButton = $("send-button");
const orderMode = $("order-mode");
const topNInput = $("top-n");
const quickButtons = [...document.querySelectorAll("[data-prompt]")];

const allowedQueries = new Set([
  "COUNT_PHARMACIES",
  "LIST_PHARMACIES",
  "LIST_PHARMACIES_BY_CITY",
  "COUNT_PHARMACIES_BY_CITY",
  "COUNT_OPEN_CASES"
]);

function setStatus(element, text, state = "ok") {
  element.textContent = text;
  element.className = `status-pill ${state}`;
}

function addMessage(role, text, meta = "") {
  const item = document.createElement("div");
  item.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "TU" : role === "diagnostic" ? "FLUSSO" : "HARNESS";

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
  orderMode.disabled = busy;
  topNInput.disabled = busy;
  quickButtons.forEach(button => { button.disabled = busy; });
  sendButton.textContent = busy ? "Attendi…" : "Invia";
}

function validateCommand(response) {
  const command = response?.comando;
  if (!command || command.tipo !== "QUERY" || !allowedQueries.has(command.queryId)) {
    return { valid: false, reason: "comando non ammesso dal client di test" };
  }
  return { valid: true, reason: `QUERY ${command.queryId} ammessa` };
}

function formatResult(response) {
  const result = response?.risultato;
  if (!result) return "Nessun risultato.";

  if (typeof result.count === "number" && !Array.isArray(result.items)) {
    const city = result.city ? ` per ${result.city}` : "";
    return `Risultato database${city}: ${result.count}`;
  }

  if (Array.isArray(result.items)) {
    if (!result.items.length) {
      return result.city ? `Nessuna farmacia trovata a ${result.city}.` : "Nessuna farmacia trovata.";
    }

    const header = result.city
      ? `${result.count} farmacia/e trovata/e a ${result.city}:`
      : `${result.count} farmacia/e trovata/e:`;

    return [
      header,
      ...result.items.map(item =>
        `• ${item.nome} [${item.codice}] — ${item.citta} (${item.provincia})`)
    ].join("\n");
  }

  return JSON.stringify(result, null, 2);
}

async function showSuccess(response) {
  const validation = validateCommand(response);
  if (!validation.valid) {
    addMessage("diagnostic", "Il client di test ha rifiutato il comando.", validation.reason);
    return;
  }

  addMessage(
    "assistant",
    "Interpretazione accettata. Ora la QUERY passa all'applicazione di test.",
    [response.sorgente, response.regolaId, validation.reason].filter(Boolean).join(" · ")
  );

  addMessage(
    "diagnostic",
    JSON.stringify(response.comando, null, 2),
    Array.isArray(response.percorso) ? response.percorso.join(" → ") : ""
  );

  const pending = addMessage("assistant", "Esecuzione sul database applicativo di test…", response.comando.queryId);

  try {
    const dbResponse = await executeQuery(response.comando);
    pending.remove();

    if (dbResponse?.esito !== "SUCCESS") {
      throw new Error(dbResponse?.risposta ?? "Risposta applicativa non valida");
    }

    setStatus(appDbStatus, "App DB QUERY OK", "ok");
    addMessage(
      "assistant",
      formatResult(dbResponse),
      `${dbResponse.sorgente} · ${dbResponse.queryId}`
    );
  } catch (error) {
    pending.remove();
    setStatus(appDbStatus, "Errore App DB", "error");
    addMessage(
      "diagnostic",
      error?.body?.risposta ?? error?.message ?? "Errore applicazione di test",
      error?.status ? `HTTP ${error.status}` : "TestApp"
    );
  }
}

function showCandidates(originalQuestion, response) {
  const candidates = Array.isArray(response?.candidati) ? response.candidati : [];
  if (!candidates.length) return;

  const item = document.createElement("div");
  item.className = "message diagnostic candidate-box";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = "SIMILITUDINE";

  const intro = document.createElement("div");
  intro.textContent = "Nessun match certo. Conferma un candidato:";
  item.append(label, intro);

  const list = document.createElement("div");
  list.className = "candidate-list";

  candidates.forEach((candidate, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "candidate-button";
    const percent = Math.round((candidate.similarita ?? 0) * 100);
    row.textContent = `${index + 1}. ${candidate.formaCanonica} · ${percent}%`;

    row.addEventListener("click", async () => {
      setBusy(true);
      try {
        const confirmed = await confirmCandidate(
          originalQuestion,
          candidate.id,
          response.fallimentoId
        );

        if (confirmed?.esito === "SUCCESS") {
          item.remove();
          await showSuccess(confirmed);
        } else {
          addMessage("diagnostic", confirmed?.risposta ?? "Conferma non accettata.", candidate.id);
        }
      } catch (error) {
        addMessage("diagnostic", error?.message ?? "Errore durante la conferma.");
      } finally {
        setBusy(false);
        input.focus();
      }
    });

    list.append(row);
  });

  item.append(list);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
}

async function refreshStatus() {
  try {
    const health = await getHealth();
    setStatus(apiStatus, `SH online · ${health.version ?? "?"}`, "ok");
  } catch {
    setStatus(apiStatus, "SH offline", "error");
  }

  try {
    const health = await getEngineTestHealth();
    setStatus(
      engineDbStatus,
      health?.status === "ok" ? "Engine DB online" : "Engine DB non pronto",
      health?.status === "ok" ? "ok" : "warn"
    );
  } catch {
    setStatus(engineDbStatus, "Engine DB offline", "error");
  }

  try {
    const health = await getTestAppHealth();
    setStatus(
      appDbStatus,
      health?.status === "ok" ? `App DB online · ${health.farmacie} farmacie` : "App DB non pronto",
      health?.status === "ok" ? "ok" : "warn"
    );
  } catch {
    setStatus(appDbStatus, "App DB offline", "error");
  }
}

async function sendMessage(message) {
  const clean = message.trim();
  if (!clean) return;

  addMessage("user", clean);
  input.value = "";
  setBusy(true);

  const order = orderMode.value;
  const topN = Math.max(1, Math.min(10, Number.parseInt(topNInput.value, 10) || 3));
  const pending = addMessage("assistant", "Interpretazione in corso…", `${order} · Top-${topN} · AI OFF`);

  try {
    const response = await interpret(clean, order, topN);
    pending.remove();

    if (response?.esito === "SUCCESS") {
      await showSuccess(response);
      return;
    }

    if (response?.esito === "FAULT") {
      addMessage(
        "assistant",
        response.risposta ?? "Richiesta non interpretata.",
        [
          response.fallimentoId ? `failure ${response.fallimentoId}` : null,
          Array.isArray(response.percorso) ? response.percorso.join(" → ") : null
        ].filter(Boolean).join(" · ")
      );
      showCandidates(clean, response);
      return;
    }

    throw new Error("Risposta SH non riconosciuta.");
  } catch (error) {
    pending.remove();
    addMessage(
      "diagnostic",
      error?.body?.risposta ?? error?.message ?? "Errore durante il collaudo.",
      error?.status ? `HTTP ${error.status}` : ""
    );
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
