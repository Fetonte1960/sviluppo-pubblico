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
const debugLog = $("debug-log");
const logState = $("log-state");
const quickButtons = [...document.querySelectorAll("[data-prompt]")];

const allowedQueries = new Set([
  "COUNT_PHARMACIES",
  "LIST_PHARMACIES",
  "LIST_PHARMACIES_BY_CITY",
  "COUNT_PHARMACIES_BY_CITY",
  "COUNT_OPEN_CASES"
]);

let logStep = 0;
let activeRequestToken = 0;

function setStatus(element, text, state = "ok") {
  element.textContent = text;
  element.className = `status-pill ${state}`;
}

function setLogState(text, state = "") {
  logState.textContent = text;
  logState.className = `log-state ${state}`.trim();
}

function resetDebugLog() {
  debugLog.replaceChildren();
  logStep = 0;
  setLogState("in corso", "active");
}

function appendDebugLog(title, message = "", type = "info", code = null) {
  logStep += 1;

  const item = document.createElement("div");
  item.className = `debug-item ${type}`;

  const head = document.createElement("div");
  head.className = "debug-item-head";

  const step = document.createElement("span");
  step.className = "debug-step";
  step.textContent = `STEP ${String(logStep).padStart(2, "0")}`;

  const time = document.createElement("span");
  time.className = "debug-time";
  time.textContent = new Date().toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  head.append(step, time);

  const titleNode = document.createElement("div");
  titleNode.className = "debug-title";
  titleNode.textContent = title;

  item.append(head, titleNode);

  if (message) {
    const body = document.createElement("div");
    body.className = "debug-body";
    body.textContent = message;
    item.append(body);
  }

  if (code !== null && code !== undefined) {
    const codeNode = document.createElement("div");
    codeNode.className = "debug-code";
    codeNode.textContent =
      typeof code === "string" ? code : JSON.stringify(code, null, 2);
    item.append(codeNode);
  }

  debugLog.append(item);
  debugLog.scrollTop = debugLog.scrollHeight;
}

function addMessage(role, text, meta = "") {
  const item = document.createElement("div");
  item.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "TU" : "HARNESS";

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
      return result.city
        ? `Nessuna farmacia trovata a ${result.city}.`
        : "Nessuna farmacia trovata.";
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

function logInterpretationResponse(response) {
  const source = response?.sorgente ?? "sorgente non indicata";
  const rule = response?.regolaId ? ` · regola ${response.regolaId}` : "";
  const failure = response?.fallimentoId ? ` · failure ${response.fallimentoId}` : "";

  appendDebugLog(
    "Risposta SH ricevuta",
    `${response?.esito ?? "?"} · ${source}${rule}${failure}`,
    response?.esito === "SUCCESS" ? "success" : "warn"
  );

  if (Array.isArray(response?.percorso) && response.percorso.length) {
    appendDebugLog(
      "Percorso del motore",
      response.percorso.join(" → "),
      "info"
    );
  }
}

async function showSuccess(response, requestToken) {
  if (requestToken !== activeRequestToken) return;

  const validation = validateCommand(response);

  appendDebugLog(
    "Validazione client",
    validation.reason,
    validation.valid ? "success" : "error",
    response?.comando ?? null
  );

  if (!validation.valid) {
    setLogState("rifiutato", "error");
    addMessage("assistant", "Il client di test ha rifiutato il comando.", validation.reason);
    return;
  }

  addMessage(
    "assistant",
    "Interpretazione accettata. Eseguo la richiesta sul database applicativo.",
    [response.sorgente, response.regolaId].filter(Boolean).join(" · ")
  );

  appendDebugLog(
    "Invio QUERY all'applicazione di test",
    `Endpoint applicativo · ${response.comando.queryId}`,
    "info",
    response.comando
  );

  const pending = addMessage(
    "assistant",
    "Esecuzione sul database applicativo di test…",
    response.comando.queryId
  );

  try {
    const dbResponse = await executeQuery(response.comando);

    if (requestToken !== activeRequestToken) return;

    pending.remove();

    if (dbResponse?.esito !== "SUCCESS") {
      throw new Error(dbResponse?.risposta ?? "Risposta applicativa non valida");
    }

    setStatus(appDbStatus, "App DB QUERY OK", "ok");

    appendDebugLog(
      "Risultato database",
      `SUCCESS · ${dbResponse.sorgente} · ${dbResponse.queryId}`,
      "success",
      dbResponse.risultato
    );

    addMessage(
      "assistant",
      formatResult(dbResponse),
      `${dbResponse.sorgente} · ${dbResponse.queryId}`
    );

    setLogState("completato", "ok");
  } catch (error) {
    if (requestToken !== activeRequestToken) return;

    pending.remove();
    setStatus(appDbStatus, "Errore App DB", "error");

    const detail =
      error?.body?.risposta ??
      error?.message ??
      "Errore applicazione di test";

    appendDebugLog(
      "Errore applicazione/database",
      detail,
      "error",
      error?.body ?? null
    );

    addMessage(
      "assistant",
      "Errore durante l'esecuzione sul database applicativo.",
      error?.status ? `HTTP ${error.status}` : "TestApp"
    );

    setLogState("errore", "error");
  }
}

function showCandidates(originalQuestion, response, requestToken) {
  const candidates = Array.isArray(response?.candidati) ? response.candidati : [];
  if (!candidates.length) return;

  appendDebugLog(
    "Top-N di similitudine",
    `${candidates.length} candidati proposti; nessuno autorizza da solo un comando.`,
    "warn",
    candidates.map(candidate => ({
      id: candidate.id,
      formaCanonica: candidate.formaCanonica,
      similarita: Math.round((candidate.similarita ?? 0) * 100) + "%"
    }))
  );

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
      if (requestToken !== activeRequestToken) {
        addMessage(
          "assistant",
          "Questo candidato appartiene a una richiesta precedente. Ripeti la richiesta per confermarlo."
        );
        return;
      }

      setBusy(true);

      appendDebugLog(
        "Conferma utente",
        `Selezionato ${candidate.id} · similarità ${percent}%`,
        "info",
        candidate.formaCanonica
      );

      try {
        appendDebugLog(
          "Verifica candidato",
          "Invio a SH per la verifica deterministica della forma canonica.",
          "info"
        );

        const confirmed = await confirmCandidate(
          originalQuestion,
          candidate.id,
          response.fallimentoId
        );

        if (requestToken !== activeRequestToken) return;

        logInterpretationResponse(confirmed);

        if (confirmed?.esito === "SUCCESS") {
          item.remove();

          appendDebugLog(
            "Candidato verificato",
            "Conferma accettata e failure marcato RISOLTO quando presente.",
            "success"
          );

          await showSuccess(confirmed, requestToken);
        } else {
          appendDebugLog(
            "Candidato rifiutato dal motore",
            confirmed?.risposta ?? "Conferma non accettata.",
            "error"
          );

          addMessage(
            "assistant",
            confirmed?.risposta ?? "Conferma non accettata.",
            candidate.id
          );

          setLogState("non risolto", "error");
        }
      } catch (error) {
        if (requestToken !== activeRequestToken) return;

        appendDebugLog(
          "Errore durante la conferma",
          error?.body?.risposta ?? error?.message ?? "Errore sconosciuto",
          "error",
          error?.body ?? null
        );

        addMessage(
          "assistant",
          "Errore durante la conferma del candidato."
        );

        setLogState("errore", "error");
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
      health?.status === "ok"
        ? `App DB online · ${health.farmacie} farmacie`
        : "App DB non pronto",
      health?.status === "ok" ? "ok" : "warn"
    );
  } catch {
    setStatus(appDbStatus, "App DB offline", "error");
  }
}

async function sendMessage(message) {
  const clean = message.trim();
  if (!clean) return;

  activeRequestToken += 1;
  const requestToken = activeRequestToken;

  const order = orderMode.value;
  const topN = Math.max(
    1,
    Math.min(10, Number.parseInt(topNInput.value, 10) || 3)
  );

  resetDebugLog();

  appendDebugLog(
    "Nuova richiesta",
    clean,
    "info"
  );

  appendDebugLog(
    "Configurazione",
    `${order} · Top-${topN} · AI OFF · programmazione DB-TEST`,
    "info"
  );

  addMessage("user", clean);
  input.value = "";
  setBusy(true);

  const pending = addMessage(
    "assistant",
    "Interpretazione in corso…",
    `${order} · Top-${topN} · AI OFF`
  );

  try {
    appendDebugLog(
      "Invio a SH-IntelligenceEngine",
      "Richiesta di interpretazione al motore V2.",
      "info",
      {
        programmazioneId: "DB-TEST",
        domanda: clean,
        ordine: order,
        topN
      }
    );

    const response = await interpret(clean, order, topN);

    if (requestToken !== activeRequestToken) return;

    pending.remove();

    logInterpretationResponse(response);

    if (response?.esito === "SUCCESS") {
      await showSuccess(response, requestToken);
      return;
    }

    if (response?.esito === "FAULT") {
      if (response.fallimentoId) {
        appendDebugLog(
          "Failure persistente",
          "La richiesta non risolta è stata registrata nel database engine dell'applicazione.",
          "warn",
          { fallimentoId: response.fallimentoId }
        );
      }

      addMessage(
        "assistant",
        response.risposta ?? "Richiesta non interpretata.",
        response.fallimentoId ? `failure ${response.fallimentoId}` : ""
      );

      showCandidates(clean, response, requestToken);
      setLogState("attesa conferma", "active");
      return;
    }

    throw new Error("Risposta SH non riconosciuta.");
  } catch (error) {
    if (requestToken !== activeRequestToken) return;

    pending.remove();

    appendDebugLog(
      "Errore durante il collaudo",
      error?.body?.risposta ?? error?.message ?? "Errore sconosciuto",
      "error",
      error?.body ?? null
    );

    addMessage(
      "assistant",
      "Errore durante il collaudo.",
      error?.status ? `HTTP ${error.status}` : ""
    );

    setLogState("errore", "error");
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
  button.addEventListener("click", () =>
    sendMessage(button.dataset.prompt ?? "")
  );
});

refreshStatus();
