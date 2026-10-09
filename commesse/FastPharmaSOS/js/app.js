import { askAssistant, getAiHealth, getCommesse, getDbHealth, getHealth } from "./api.js";

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
  label.textContent = role === "user" ? "TU" : role === "error" ? "DIAGNOSTICA" : "SOS";

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
  const [healthResult, dbResult, aiResult, commesseResult] = await Promise.allSettled([
    getHealth(),
    getDbHealth(),
    getAiHealth(),
    getCommesse()
  ]);

  setStatus(
    apiStatus,
    healthResult.status === "fulfilled" ? "Server/API online" : "Server/API offline",
    healthResult.status === "fulfilled"
  );

  setStatus(
    dbStatus,
    dbResult.status === "fulfilled" ? "Database online" : "Database non disponibile",
    dbResult.status === "fulfilled"
  );

  if (aiResult.status === "fulfilled" && aiResult.value?.status === "configured") {
    setStatus(aiStatus, `AI ${aiResult.value.model ?? "configurata"}`, true);
  } else {
    setStatus(aiStatus, "AI non configurata", false);
  }

  if (commesseResult.status === "fulfilled" && Array.isArray(commesseResult.value)) {
    const commesse = commesseResult.value;
    const preview = commesse.slice(0, 2)
      .map(item => [item.codice, item.titolo].filter(Boolean).join(" · "))
      .filter(Boolean);
    archiveSummary.textContent = `Archivio demo: ${commesse.length} commesse${preview.length ? " — " + preview.join(" / ") : ""}`;
  } else if (dbResult.status === "rejected") {
    archiveSummary.textContent = "Archivio demo non disponibile: controllare il database.";
  } else {
    archiveSummary.textContent = "Archivio demo non leggibile.";
  }
}

async function probeComponents() {
  const [server, database, ai] = await Promise.allSettled([
    getHealth(),
    getDbHealth(),
    getAiHealth()
  ]);
  return {
    server: server.status === "fulfilled",
    database: database.status === "fulfilled",
    aiConfigured: ai.status === "fulfilled" && ai.value?.status === "configured"
  };
}

async function explainFailure(error) {
  const body = error?.body && typeof error.body === "object" ? error.body : {};
  const status = body.status;
  const provider = body.provider ?? "provider AI";

  if (error?.kind === "network_error") {
    return {
      text: "Errore SERVER/API — il browser non riesce a raggiungere il server FastPharmaSOS. Possibili cause: server Render non disponibile, rete interrotta oppure blocco CORS.",
      meta: "Componente: Server/API · richiesta non arrivata al servizio"
    };
  }

  if (error?.kind === "client_timeout") {
    return {
      text: "Timeout SERVER/API — il frontend ha atteso troppo senza ricevere risposta. Il server potrebbe essere occupato, in riavvio oppure una chiamata a valle potrebbe essersi bloccata.",
      meta: "Componente: Server/API · tempo massimo del frontend superato"
    };
  }

  switch (status) {
    case "database_not_configured":
      setStatus(dbStatus, "Database non configurato", false);
      return {
        text: "Errore DATABASE — il server è raggiungibile, ma la connessione al database non è configurata. Non serve riprovare finché la configurazione non viene corretta.",
        meta: "Componente: Database · configurazione mancante"
      };

    case "database_unavailable":
      setStatus(dbStatus, "Database non disponibile", false);
      return {
        text: "Errore DATABASE — il server ha risposto, ma non è riuscito a collegarsi a Neon oppure una query è fallita. Può essere un problema temporaneo di connessione o del servizio database.",
        meta: "Componente: Database · riprova possibile"
      };

    case "ai_not_configured":
      setStatus(aiStatus, "AI non configurata", false);
      return {
        text: `Errore AI — il server è operativo, ma ${provider} non è configurato correttamente. È necessaria una correzione della configurazione prima di riprovare.`,
        meta: "Componente: AI · configurazione mancante"
      };

    case "ai_rate_limited":
      setStatus(aiStatus, "AI: troppe richieste", false);
      return {
        text: `Limite AI — ${provider} ha rifiutato temporaneamente la richiesta perché sono state effettuate troppe richieste o è stata raggiunta la quota disponibile. Il server FastPharmaSOS ha risposto correttamente. Attendi e riprova più tardi.`,
        meta: "Componente: AI · troppe richieste / quota · errore 429"
      };

    case "ai_timeout":
      setStatus(aiStatus, "AI: risposta troppo lenta", false);
      return {
        text: `Timeout AI — ${provider} ha impiegato troppo tempo a rispondere e il server ha interrotto l'attesa. La richiesta può essere riprovata.`,
        meta: "Componente: AI · provider troppo lento · timeout"
      };

    case "ai_access_denied":
      setStatus(aiStatus, "AI: accesso rifiutato", false);
      return {
        text: `Errore AI — ${provider} ha rifiutato l'accesso. Possibili cause: credenziale non valida, progetto non autorizzato o permessi insufficienti. Riprovare senza correggere la configurazione normalmente non risolve.`,
        meta: `Componente: AI · accesso negato · upstream HTTP ${body.upstreamStatus ?? "401/403"}`
      };

    case "ai_provider_unavailable":
      setStatus(aiStatus, "AI: servizio non disponibile", false);
      return {
        text: `Errore AI — il servizio ${provider} ha restituito un errore del proprio server. FastPharmaSOS è raggiungibile, ma il provider AI è temporaneamente indisponibile.`,
        meta: `Componente: AI · provider indisponibile · upstream HTTP ${body.upstreamStatus ?? "5xx"}`
      };

    case "ai_provider_error":
      setStatus(aiStatus, "AI: errore provider", false);
      return {
        text: `Errore AI — la chiamata a ${provider} non è riuscita. Il server FastPharmaSOS ha ricevuto la richiesta ma il provider AI non ha completato correttamente la risposta.`,
        meta: `Componente: AI · upstream HTTP ${body.upstreamStatus ?? "non disponibile"}`
      };

    case "ai_orchestration_error":
      return {
        text: "Errore SERVER/AI — il provider ha risposto, ma il Server Harness non è riuscito a completare il ciclo di orchestrazione dei tool. Non è un errore del browser.",
        meta: "Componente: Server Harness · orchestrazione AI"
      };

    case "server_error":
      return {
        text: "Errore SERVER — FastPharmaSOS ha incontrato un errore interno durante l'elaborazione. Il problema non è stato classificato come database o provider AI.",
        meta: "Componente: Server/API · errore interno"
      };
  }

  const probes = await probeComponents();

  if (!probes.server) {
    setStatus(apiStatus, "Server/API offline", false);
    return {
      text: "Errore SERVER/API — il controllo diagnostico non riesce a raggiungere FastPharmaSOS. Il backend Render o la rete verso il backend non sono disponibili.",
      meta: "Diagnostica automatica: server non raggiungibile"
    };
  }

  if (!probes.database) {
    setStatus(dbStatus, "Database non disponibile", false);
    return {
      text: "Errore DATABASE — il server è online, ma il controllo di connessione a Neon è fallito.",
      meta: "Diagnostica automatica: server online · database non disponibile"
    };
  }

  if (!probes.aiConfigured) {
    setStatus(aiStatus, "AI non configurata", false);
    return {
      text: "Errore AI — server e database risultano raggiungibili, ma il provider AI non risulta configurato.",
      meta: "Diagnostica automatica: server online · database online · AI non configurata"
    };
  }

  return {
    text: `Errore non classificato${error?.status ? " (HTTP " + error.status + ")" : ""} — server, database e configurazione AI risultano raggiungibili. Il problema può essere transitorio durante l'elaborazione; riprova e, se persiste, controlla i log del server.`,
    meta: "Diagnostica automatica: componenti principali raggiungibili"
  };
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
    refreshStatus();
  } catch (error) {
    pending.remove();
    const diagnostic = await explainFailure(error);
    addMessage("error", diagnostic.text, diagnostic.meta);
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
