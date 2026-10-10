import {
  confirmCandidate,
  executeFastPharmaQuery,
  getFastPharmaDbHealth,
  getFastPharmaHealth,
  getHealth,
  interpretHarness
} from "./api.js";

const $ = id => document.getElementById(id);
const apiStatus = $("api-status");
const detStatus = $("det-status");
const dbStatus = $("db-status");
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
  orderMode.disabled = busy;
  topNInput.disabled = busy;
  quickButtons.forEach(button => { button.disabled = busy; });
  sendButton.textContent = busy ? "Attendi…" : "Invia";
}

function validateCommand(response) {
  const command = response?.comando;

  if (!command || command.tipo !== "QUERY" || !allowedQueries.has(command.queryId)) {
    return { valid: false, reason: "comando non ammesso dall'harness" };
  }

  return { valid: true, reason: `QUERY ${command.queryId} ammessa` };
}

function formatDatabaseResult(dbResponse) {
  const result = dbResponse?.risultato;
  if (!result) return "Il database non ha restituito un risultato.";

  if (typeof result.count === "number" && !Array.isArray(result.items)) {
    const city = result.city ? ` per ${result.city}` : "";
    return `Risultato database${city}: ${result.count}`;
  }

  if (Array.isArray(result.items)) {
    if (result.items.length === 0) {
      return result.city
        ? `Nessuna farmacia trovata a ${result.city}.`
        : "Nessuna farmacia trovata.";
    }

    const header = result.city
      ? `${result.count} farmacia/e trovata/e a ${result.city}:`
      : `${result.count} farmacia/e trovata/e:`;

    const rows = result.items.map(item => {
      const place = item.localizzazione ? ` — ${item.localizzazione}` : "";
      return `• ${item.nome} [${item.codice}] — stato: ${item.stato}${place}`;
    });

    return [header, ...rows].join("\n");
  }

  return JSON.stringify(result, null, 2);
}

async function showSuccess(response) {
  const validation = validateCommand(response);

  if (!validation.valid) {
    setStatus(detStatus, "Comando rifiutato", "error");
    addMessage("diagnostic", "Il validatore harness ha rifiutato il comando.", validation.reason);
    return;
  }

  setStatus(detStatus, "SUCCESS locale", "ok");
  addMessage(
    "assistant",
    "Interpretazione locale accettata. Nessuna AI utilizzata.",
    [response.sorgente, response.regolaId, validation.reason].filter(Boolean).join(" · ")
  );
  addMessage(
    "diagnostic",
    JSON.stringify(response.comando, null, 2),
    Array.isArray(response.percorso) ? response.percorso.join(" → ") : "comando strutturato"
  );

  const pending = addMessage(
    "assistant",
    "Esecuzione read-only sul database FastPharmaSOS-Test…",
    response.comando.queryId
  );

  try {
    const dbResponse = await executeFastPharmaQuery(response.comando);
    pending.remove();

    if (dbResponse?.esito !== "SUCCESS") {
      throw new Error(dbResponse?.risposta ?? "Risposta database non valida");
    }

    setStatus(dbStatus, "Neon QUERY OK", "ok");
    addMessage(
      "assistant",
      formatDatabaseResult(dbResponse),
      `${dbResponse.sorgente} · ${dbResponse.queryId}`
    );
  } catch (error) {
    pending.remove();
    setStatus(dbStatus, "Errore database/API", "error");
    addMessage(
      "diagnostic",
      error?.body?.risposta
        ? `Esecuzione database rifiutata: ${error.body.risposta}`
        : `Errore durante l'esecuzione reale: ${error?.message ?? "errore sconosciuto"}`,
      error?.status ? `HTTP ${error.status}` : "FastPharmaSOS backend"
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
  intro.textContent = "Nessun match certo. Conferma un candidato se corrisponde a ciò che intendevi:";
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
          addMessage(
            "diagnostic",
            confirmed?.risposta ?? "Conferma non accettata.",
            candidate.id
          );
        }
      } catch (error) {
        addMessage(
          "diagnostic",
          `Errore durante la conferma: ${error?.message ?? "errore sconosciuto"}`
        );
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
    setStatus(apiStatus, `SH online · ${health.version ?? "versione?"}`, "ok");
    setStatus(detStatus, "Motore locale pronto", "ok");
  } catch {
    setStatus(apiStatus, "SH offline", "error");
    setStatus(detStatus, "Motore non disponibile", "error");
  }

  try {
    await getFastPharmaHealth();
    const dbHealth = await getFastPharmaDbHealth();
    setStatus(
      dbStatus,
      dbHealth?.status === "ok" ? "Neon online" : "Database non pronto",
      dbHealth?.status === "ok" ? "ok" : "warn"
    );
  } catch {
    setStatus(dbStatus, "FastPharma/DB offline", "error");
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
  const pending = addMessage(
    "assistant",
    "Ricerca locale in corso…",
    `${order} · Top-${topN} · AI OFF`
  );

  try {
    const response = await interpretHarness(clean, order, topN);
    pending.remove();

    if (response?.esito === "SUCCESS") {
      await showSuccess(response);
      return;
    }

    if (response?.esito === "FAULT") {
      setStatus(detStatus, "FAULT registrato", "warn");
      addMessage(
        "assistant",
        response.risposta ?? "Richiesta non interpretata.",
        [
          response.fallimentoId ? `fallimento ${response.fallimentoId}` : null,
          Array.isArray(response.percorso) ? response.percorso.join(" → ") : null
        ].filter(Boolean).join(" · ")
      );
      showCandidates(clean, response);
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
