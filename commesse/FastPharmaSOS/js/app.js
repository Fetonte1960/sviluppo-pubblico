import { initializeSosActivityForms } from "./sos-activities.js?v=1.1.13";
import { initializeArchiveWorkspace, initializeDocumentEditor } from "./archive.js?v=1.1.10";
import { initializeImageManager } from "./images.js?v=1.1.10";
import { initializeCompanyManager } from "./companies.js?v=1.1.10";
import { askAssistant, confirmEngineCandidate, getAiHealth, getCommesse, getDbHealth, getHealth, loginAdmin, setAdminToken } from "./api.js?v=1.1.10";

const $ = id => document.getElementById(id);
const apiStatus = $("api-status");
const aiStatus = $("ai-status");
const dbStatus = $("db-status");
const archiveSummary = $("archive-summary");
const messages = $("chat-messages");
const form = $("chat-form");
const input = $("chat-input");
const sendButton = $("send-button");
const providerSelect = $("ai-provider");
const quickButtons = [...document.querySelectorAll("[data-prompt]")];
const mainTabs = [...document.querySelectorAll("[data-main-view]")];
const mainViews = [...document.querySelectorAll(".app-view")];

function openMainView(name) {
  mainTabs.forEach(button => {
    button.classList.toggle("active", button.dataset.mainView === name);
  });
  mainViews.forEach(view => {
    view.classList.toggle("active", view.id === `view-${name}`);
  });
  if (name === "companies") window.dispatchEvent(new Event("fastpharma:companies-open"));
  if (name === "monitoraggio" || name === "suggerimenti") window.dispatchEvent(new CustomEvent("fastpharma:activities-open", { detail: { view: name } }));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

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
  providerSelect.disabled = busy;
  quickButtons.forEach(button => { button.disabled = busy; });
  sendButton.textContent = busy ? "Attendi…" : "Invia";
}

async function refreshStatus() {
  const selectedProvider = providerSelect.value;
  const [healthResult, dbResult, aiResult, commesseResult] = await Promise.allSettled([
    getHealth(),
    getDbHealth(),
    getAiHealth(selectedProvider),
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

  const aiPayload = aiResult.status === "fulfilled"
    ? aiResult.value
    : aiResult.reason?.body;
  updateProviderOptions(aiPayload?.providers);

  if (aiPayload?.status === "configured") {
    setStatus(aiStatus, `AI ${aiPayload.provider} · ${aiPayload.model}`, true);
  } else {
    setStatus(aiStatus, `AI ${selectedProvider} non configurata`, false);
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
    getAiHealth(providerSelect.value)
  ]);
  return {
    server: server.status === "fulfilled",
    database: database.status === "fulfilled",
    aiConfigured: ai.status === "fulfilled" && ai.value?.status === "configured"
  };
}

function updateProviderOptions(providers) {
  if (!Array.isArray(providers)) return;

  const statusByProvider = new Map(
    providers.map(item => [String(item.provider).toLowerCase(), item.status])
  );

  [...providerSelect.options].forEach(option => {
    const status = statusByProvider.get(option.value.toLowerCase());
    option.disabled = status != null && status !== "configured";
    option.title = option.disabled ? "Provider non ancora configurato sul server" : "";
  });
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

    case "engine_wakeup_timeout":
      return {
        text: "Motore SH in risveglio — il servizio gratuito era inattivo e non è riuscito ad avviarsi entro il tempo di attesa. FastPharmaSOS ha già effettuato più tentativi. Attendi qualche secondo e riprova.",
        meta: "Componente: SH-IntelligenceEngine · cold start Render · nessuna AI chiamata"
      };

    case "engine_unavailable":
      return {
        text: "Motore SH non disponibile — FastPharmaSOS ha raggiunto il servizio, ma la chiamata al motore non è andata a buon fine. Nessuna richiesta è stata inoltrata all'AI.",
        meta: "Componente: SH-IntelligenceEngine · errore dopo il risveglio · riprova possibile"
      };

    case "engine_query_rejected":
      return {
        text: "Richiesta rifiutata dal validatore FastPharmaSOS — il comando proposto dal motore non è tra quelli autorizzati.",
        meta: "Componente: validazione applicativa · nessuna AI chiamata"
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

function showEngineCandidates(question, response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  if (!candidates.length) return;

  const item = document.createElement("div");
  item.className = "message assistant";
  item.style.width = "100%";
  item.style.maxWidth = "100%";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = "PROPOSTE";

  const intro = document.createElement("div");
  intro.textContent = "Forse intendevi una di queste richieste:";

  const list = document.createElement("div");
  list.className = "engine-candidates";

  candidates.forEach(candidate => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "engine-candidate";
    const percent = Math.round((candidate.similarity ?? 0) * 100);
    button.textContent = `${candidate.text} · ${percent}%`;

    button.addEventListener("click", async () => {
      setBusy(true);
      button.disabled = true;
      const pending = addMessage("assistant", "Verifico la proposta scelta…");

      try {
        const confirmed = await confirmEngineCandidate(
          question,
          candidate.id,
          response.failureId
        );
        pending.remove();

        if (confirmed?.esito === "SUCCESS") {
          item.remove();
          addMessage(
            "assistant",
            confirmed.answer ?? "Richiesta eseguita.",
            confirmed.queryId ? `Motore deterministico · ${confirmed.queryId}` : "Motore deterministico"
          );
        } else {
          addMessage(
            "assistant",
            confirmed?.answer ?? "La proposta non ha superato la verifica deterministica.",
            "Nessuna AI chiamata"
          );
        }
      } catch (error) {
        pending.remove();
        const diagnostic = await explainFailure(error);
        addMessage("error", diagnostic.text, diagnostic.meta);
      } finally {
        setBusy(false);
        input.focus();
      }
    });

    list.append(button);
  });

  item.append(label, intro, list);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
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

    if (response?.esito === "SUCCESS") {
      addMessage(
        "assistant",
        response.answer ?? "Richiesta eseguita.",
        response.queryId ? `Motore deterministico · ${response.queryId}` : "Motore deterministico"
      );
      return;
    }

    if (response?.esito === "FAULT") {
      addMessage(
        "assistant",
        response.answer ?? "Non sono riuscito a interpretare la richiesta.",
        response.failureId
          ? "Richiesta registrata · nessuna AI chiamata"
          : "Nessuna AI chiamata"
      );
      showEngineCandidates(clean, response);
      return;
    }

    throw new Error("Risposta del motore non riconosciuta.");
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

providerSelect.addEventListener("change", () => {
  refreshStatus();
});

mainTabs.forEach(button => {
  button.addEventListener("click", () => openMainView(button.dataset.mainView));
});

document.querySelectorAll("[data-open-view]").forEach(button => {
  button.addEventListener("click", () => openMainView(button.dataset.openView));
});

document.getElementById("refresh-all")?.addEventListener("click", () => {
  refreshStatus();
  window.dispatchEvent(new CustomEvent("fastpharma:refresh-archive"));
});

window.addEventListener("fastpharma:pharmacy-selected", event => {
  const metric = document.getElementById("metric-selected");
  if (!metric) return;
  metric.textContent = event.detail?.nome
    ? [event.detail.codice, event.detail.nome].filter(Boolean).join(" · ")
    : "Nessuna";
});

const loginView = $("admin-login-view");
const application = $("admin-application");
const loginForm = $("admin-login-form");
const loginButton = $("admin-login-button");
const loginStatus = $("admin-login-status");
let initialized = false;

function initializeAuthenticatedApplication() {
  if (initialized) return;
  initialized = true;
  initializeDocumentEditor();
  initializeArchiveWorkspace();
  initializeImageManager();
  initializeCompanyManager();
  initializeSosActivityForms();
  refreshStatus();
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const passwordField = $("admin-password");
  const password = passwordField.value;
  if (!password) return;
  loginButton.disabled = true;
  loginStatus.textContent = "Connessione al server Render Free (potrebbe essere in risveglio)…";
  try {
    const result = await loginAdmin(password);
    if (!result?.token) throw new Error("Token di accesso assente");
    setAdminToken(result.token);
    // Separiamo la riuscita del login dall'avvio dei moduli, così eventuali errori
    // di inizializzazione non vengono scambiati per una password errata.
    loginView.hidden = true;
    application.hidden = false;
    passwordField.value = "";
    try {
      initializeAuthenticatedApplication();
    } catch (initializationError) {
      console.error("Errore inizializzazione gestionale:", initializationError);
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = "Accesso riuscito, ma non è stato possibile avviare una sezione del gestionale. Ricarica la pagina e riprova.";
      application.prepend(message);
    }
  } catch (error) {
    setAdminToken("");
    // Non cancellare la password se l'accesso fallisce.
    loginStatus.textContent = error.status === 401
      ? "Password non valida (HTTP 401)."
      : error.status === 503
        ? "Autenticazione non configurata sul backend (HTTP 503)."
        : "Accesso non disponibile: " + error.message;
    console.error("Accesso amministrativo:", error);
  } finally {
    loginButton.disabled = false;
  }
});

// Controllo versione remoto senza cache (non ricarica né perde dati non salvati).
document.getElementById("check-version")?.addEventListener("click", async () => {
  const status = document.getElementById("version-status");
  status.textContent = "Controllo…";
  try {
    const response = await fetch(new URL("./index.html?version_check=" + Date.now(), window.location.href), {cache:"no-store"});
    if (!response.ok) throw new Error("HTTP " + response.status);
    const html = await response.text();
    const latest = new DOMParser().parseFromString(html, "text/html").documentElement.dataset.appVersion;
    const current = document.documentElement.dataset.appVersion;
    status.textContent = latest === current ? "Versione aggiornata" : "Nuova versione " + latest + ": ricarica la pagina";
  } catch (error) { status.textContent = "Impossibile controllare gli aggiornamenti"; }
});
