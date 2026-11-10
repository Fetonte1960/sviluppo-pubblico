"use strict";

// Front V0.1.0 — incrementare la versione a ogni pubblicazione.
const FRONT_VERSION = "0.8.0";
const EXPECTED_SERVER_VERSION = "1.7.0";
const DEFAULT_SERVER_URL = "https://mcp-postgree.onrender.com";
const TOOL_NAME = "CommandToMCPPostgree";
const PAGE_INSTRUCTIONS = "https://github.com/Fetonte1960/sviluppo-pubblico/blob/main/commesse/MCP-postgree/ISTRUZIONI.md";
const DEFAULT_TIMEOUT_MS = 125_000;
const state = {baseUrl: "", wakeController: null, activeToken: "", tokenHash: "", sequence: 0,
  enterpriseToken: "", applicationTokens: Object.create(null), demoCatalog: Object.create(null),
  lastSessionPrompt: "", lastSessionExpiresAt: 0};
const $ = id => document.getElementById(id);

function setStatus(text, kind = "idle") {
  $("connectionStatus").textContent = text;
  $("connectionStatus").dataset.state = kind;
  $("wakeActivity").dataset.state = kind;
}
function feedback(id, message) { $(id).textContent = message; }
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Operazione interrotta", "AbortError")); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Operazione interrotta", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, {once: true});
  });
}
function normalizeBase(value) {
  const url = new URL((value || "").trim());
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:")))
    throw new Error("Inserisci soltanto l'origine HTTPS del backend, ad esempio https://nome.onrender.com (senza /mcp).");
  return url.origin;
}
function formatError(error) {
  if (error?.name === "AbortError") return "Operazione interrotta.";
  if (error?.name === "TypeError") return "Connessione non disponibile. Controlla URL, rete, HTTPS e autorizzazioni CORS.";
  return String(error?.message || error || "Errore sconosciuto");
}
function renderPrompt() {
  const endpoint = state.baseUrl ? state.baseUrl + "/mcp" : "[ENDPOINT MCP NON CONFIGURATO]";
  const version = $("serverVersionDetail").textContent || "non verificata";
  const prompt = [
    "Sei l'assistente AI di collaudo del server MCP-postgree.",
    "Prima di operare leggi queste istruzioni pubbliche: " + PAGE_INSTRUCTIONS,
    "Scopo: testare il connettore PostgreSQL aziendale in maniera controllata, senza SQL libero.",
    "Contratto MCP invariabile: " + TOOL_NAME + "(comando: string).",
    "Endpoint previsto: " + endpoint,
    "Versione frontend test: " + FRONT_VERSION + "; versione server rilevata: " + version + ".",
    "Connessione ChatGPT: selezionare OAuth e usare l'endpoint " + endpoint + ".",
    "Per autenticarsi, incollare il token del gestionale SOLO nel modulo HTTPS di mcp-postgree.onrender.com.",
    "Il server usa OAuth 2.1 con PKCE S256 e non trasmette mai il token originario a ChatGPT.",
    "Verifica prima se tra gli strumenti di questa chat compare " + TOOL_NAME + ".",
    "Se esiste, invocalo con comando esattamente 'Init' e mostra il menu ricevuto.",
    "Poi attendi la mia scelta; non effettuare scritture in automatico.",
    "Se lo strumento non è presente, spiegami che occorre prima collegare il server MCP a ChatGPT; non fingere di avervi accesso.",
    "Non chiedermi mai di incollare token, hash, password o connection string nella chat.",
    "Non inventare l'esito di test o connessioni: usa solo risultati reali degli strumenti."
  ].join("\n");
  $("bootstrapPrompt").value = prompt;
  return prompt;
}
async function copyText(value, successText, id) {
  try {
    await navigator.clipboard.writeText(value);
    feedback(id, successText);
  } catch {
    feedback(id, "Copia automatica non consentita dal browser. Seleziona e copia manualmente il testo.");
  }
}
function setServerVersion(data) {
  const version = typeof data?.version === "string" && data.version.trim() ? "V" + data.version : "non dichiarata";
  const commit = typeof data?.commit === "string" && data.commit.trim() ? data.commit : "—";
  $("serverVersion").textContent = version;
  $("serverVersionDetail").textContent = version;
  $("serverCommit").textContent = commit;
  $("oauthStatus").textContent = data?.oauthEnabled === true ? "Attivo" : "Non attivo";
  $("oauthPersistence").textContent = data?.oauthRefreshPersistence === "postgresql" ?
    "PostgreSQL · attivo" : data?.oauthRefreshPersistence === "volatile" ?
    "Volatile · non persistente" : "Non dichiarato";
  renderPrompt();
}
function resetServerUi(base) {
  $("mcpEndpoint").textContent = base ? base + "/mcp" : "—";
  $("serverVersion").textContent = "V" + EXPECTED_SERVER_VERSION + " attesa";
  $("serverVersionDetail").textContent = "V" + EXPECTED_SERVER_VERSION + " (non verificata)";
  $("serverCommit").textContent = "—";
  $("oauthStatus").textContent = "da verificare";
  $("oauthPersistence").textContent = "da verificare";
  setStatus(base ? "Da verificare" : "Non configurato");
  $("wakeProgress").value = 0;
  renderPrompt();
}
function saveBaseIfValid() {
  const value = $("serverUrl").value.trim();
  if (!value) throw new Error("Inserisci l'indirizzo HTTPS del backend MCP-postgree.");
  const base = normalizeBase(value);
  if (state.baseUrl !== base) {
    state.baseUrl = base;
    resetServerUi(base);
  }
  localStorage.setItem("mcp-postgree-test-url", base); // Solo URL pubblico, mai token.
  return base;
}
async function fetchHealth(base, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14_000);
  const abortByParent = () => controller.abort();
  signal.addEventListener("abort", abortByParent, {once: true});
  try {
    const response = await fetch(base + "/health?_=" + Date.now(), {
      method: "GET", mode: "cors", cache: "no-store", signal: controller.signal
    });
    if (!response.ok) throw new Error("HTTP " + response.status + " dalla route /health.");
    const data = await response.json();
    if (data?.ok !== true || data?.service !== "MCP-postgree")
      throw new Error("Il server risponde, ma non dichiara di essere MCP-postgree.");
    return data;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abortByParent);
  }
}
async function wakeServer() {
  let base;
  try { base = saveBaseIfValid(); }
  catch (error) { feedback("wakeFeedback", formatError(error)); setStatus("URL non valido", "error"); return false; }
  state.wakeController?.abort();
  const controller = new AbortController();
  state.wakeController = controller;
  const seq = ++state.sequence;
  $("wakeBtn").disabled = true;
  $("cancelWakeBtn").hidden = false;
  const started = Date.now();
  let attempts = 0;
  setStatus("Risveglio...", "pending");
  feedback("wakeFeedback", "Contatto " + base + " ...");
  try {
    while (Date.now() - started < DEFAULT_TIMEOUT_MS && !controller.signal.aborted) {
      attempts++;
      $("wakeProgress").value = Math.min(98, Math.round((Date.now() - started) / DEFAULT_TIMEOUT_MS * 100));
      feedback("wakeFeedback", "Attesa server Render Free · tentativo " + attempts +
        " · " + Math.round((Date.now() - started) / 1000) + " s");
      try {
        const data = await fetchHealth(base, controller.signal);
        if (seq !== state.sequence) return false;
        $("wakeProgress").value = 100;
        setStatus("Online", "online");
        setServerVersion(data);
        feedback("wakeFeedback", "Server raggiungibile. Versione letta da /health.");
        return true;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (Date.now() - started >= DEFAULT_TIMEOUT_MS) throw error;
      }
      await sleep(4_000, controller.signal);
    }
    throw new Error("Tempo massimo di risveglio raggiunto. Riprova oppure verifica il servizio su Render.");
  } catch (error) {
    if (seq === state.sequence) {
      setStatus(controller.signal.aborted ? "Interrotto" : "Non disponibile", "error");
      feedback("wakeFeedback", formatError(error) +
        (controller.signal.aborted ? "" : " Il server potrebbe essere sospeso, non distribuito o irraggiungibile."));
    }
    return false;
  } finally {
    if (seq === state.sequence) {
      state.wakeController = null;
      $("wakeBtn").disabled = false;
      $("cancelWakeBtn").hidden = true;
    }
  }
}
function validateClientInfo() {
  const id = $("clientId").value.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,63}$/.test(id))
    throw new Error("Identificativo: 3–64 caratteri, iniziare con una lettera, usare lettere, cifre, _ o -.");
  const schemas = $("schemaNames").value.split(",").map(x => x.trim()).filter(Boolean);
  if (schemas.length < 1 || schemas.length > 8 || new Set(schemas).size !== schemas.length ||
      schemas.some(n => !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(n)))
    throw new Error("Indica da 1 a 8 schemi distinti con nomi PostgreSQL validi.");
  return {id, schemas, role: $("accessRole").value};
}
function hex(bytes) { return [...bytes].map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase(); }
async function generateToken() {
  try {
    const info = validateClientInfo();
    if (!globalThis.crypto?.getRandomValues || !crypto.subtle)
      throw new Error("Il browser richiede una connessione HTTPS per generare il token in sicurezza.");
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const fingerprint = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
    state.activeToken = token;
    state.tokenHash = fingerprint;
    $("tokenResults").hidden = false;
    $("tokenValue").value = token;
    $("tokenValue").type = "password";
    $("toggleTokenBtn").textContent = "Mostra";
    $("hashValue").value = fingerprint;
    // Bozza volutamente NON operativa: le allowlist tabelle/colonne devono essere definite
    // esplicitamente dall'amministratore dopo verifica, mai autoattribuite dal browser.
    const policy = {
      id: info.id, profile: info.id, connectionName: "Postgres", role: info.role,
      tokenSha256: fingerprint, maxRows: 50,
      schemas: info.schemas.map(name => ({name, tables: []}))
    };
    $("policyDraft").value = JSON.stringify(policy, null, 2);
    feedback("tokenStatus", "Token generato. Attivazione dimostrativa in corso...");
    if (state.baseUrl === DEFAULT_SERVER_URL) {
      await registerDemoToken();
    } else {
      feedback("tokenStatus", "Token generato. L'attivazione automatica è disponibile soltanto sul server demo ufficiale.");
    }
    // Non compilare automaticamente il campo di test: serve l'esplicita conferma di provisioning.
  } catch (error) {
    feedback("tokenStatus", formatError(error));
  }
}
async function registerDemoToken() {
  if (!state.activeToken || !state.tokenHash) {
    feedback("tokenStatus", "Prima genera un token.");
    return;
  }
  let base;
  try {
    base = saveBaseIfValid();
    if (base !== DEFAULT_SERVER_URL)
      throw new Error("L'attivazione pubblica è disponibile solo sul server demo ufficiale.");
    $("registerDemoBtn").disabled = true;
    feedback("tokenStatus", "Connessione al laboratorio demo...");
    if ($("connectionStatus").dataset.state !== "online") {
      const ready = await wakeServer();
      if (!ready) throw new Error("Il server demo non è ancora raggiungibile.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(base + "/demo/register", {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          tokenSha256: state.tokenHash,
          clientId: $("clientId").value.trim()
        })
      });
    } finally { clearTimeout(timer); }
    const result = await response.json();
    if (!response.ok || result?.ok !== true)
      throw new Error(result?.error || "Registrazione demo non riuscita (HTTP " + response.status + ").");
    // L'attivazione e' sempre limitata dal server a READ_ONLY sui soli due schemi di prova.
    $("testToken").value = state.activeToken;
    feedback("tokenStatus", "Token attivo READ_ONLY: laboratorio_a e laboratorio_b (60 minuti).");
    feedback("mcpFeedback", "Token demo attivo. Premi «Testa connessione MCP / Init» oppure usa il connettore ChatGPT.");
    await testMcp();
  } catch (error) {
    feedback("tokenStatus", "Token generato ma non attivato: " + formatError(error));
  } finally {
    $("registerDemoBtn").disabled = false;
  }
}
function clearGeneratedToken() {
  state.activeToken = "";
  state.tokenHash = "";
  $("tokenValue").value = "";
  $("hashValue").value = "";
  $("policyDraft").value = "";
  $("tokenResults").hidden = true;
  feedback("tokenStatus", "Token eliminato dalla pagina");
}
function rpcData(body, contentType) {
  if (contentType.includes("text/event-stream")) {
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const datum = line.slice(5).trim();
      if (datum && datum !== "[DONE]") {
        const parsed = JSON.parse(datum);
        if (parsed?.result || parsed?.error) return parsed;
      }
    }
    throw new Error("Risposta SSE senza JSON-RPC valido.");
  }
  return JSON.parse(body);
}
async function rpc(base, token, method, id, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(base + "/mcp", {
      method: "POST", mode: "cors", cache: "no-store", signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({jsonrpc: "2.0", id, method, params})
    });
    const body = await response.text();
    if (!response.ok) throw new Error("MCP HTTP " + response.status + (response.status === 401 ? ": token non registrato o non valido." : "."));
    const data = rpcData(body, response.headers.get("content-type") || "");
    if (data.error) throw new Error("MCP RPC " + (data.error.code ?? "") + ": " + (data.error.message ?? "errore"));
    return data.result;
  } finally { clearTimeout(timer); }
}
async function testMcp() {
  const token = $("testToken").value.trim();
  let base;
  try {
    base = saveBaseIfValid();
    if (!/^[0-9a-fA-F]{64}$/.test(token) && (token.length < 32 || token.length > 512))
      throw new Error("Inserisci un token abilitato, di almeno 32 caratteri.");
  } catch (error) {
    feedback("mcpFeedback", formatError(error));
    return;
  }
  const button = $("testMcpBtn");
  button.disabled = true;
  feedback("mcpFeedback", "Verifica MCP in corso...");
  $("mcpOutput").textContent = "Connessione a " + base + "/mcp ...";
  try {
    const init = await rpc(base, token, "initialize", 101, {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {name: "MCP-postgree-FrontTest", version: FRONT_VERSION}
    });
    const tools = await rpc(base, token, "tools/list", 102, {});
    const names = (tools?.tools || []).map(x => x.name);
    if (names.length !== 1 || names[0] !== TOOL_NAME)
      throw new Error("Contratto MCP non valido: atteso unicamente " + TOOL_NAME + "; ricevuti " + names.join(", "));
    const call = await rpc(base, token, "tools/call", 103, {
      name: TOOL_NAME, arguments: {comando: "Init"}
    });
    if (call?.isError) throw new Error("Il comando Init ha restituito un errore.");
    const text = (call?.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    $("mcpOutput").textContent = JSON.stringify({
      connected: true,
      protocol: init?.protocolVersion || "non comunicato",
      server: init?.serverInfo || {},
      tools: names,
      init: parsed
    }, null, 2);
    feedback("mcpFeedback", "Connessione autenticata: tool unico e comando Init verificati.");
  } catch (error) {
    $("mcpOutput").textContent = "Test non riuscito: " + formatError(error);
    feedback("mcpFeedback", formatError(error));
  } finally {
    button.disabled = false;
    // NON persistiamo token, non lo includiamo mai nei messaggi di errore.
  }
}
function openChatGpt() {
  const prompt = renderPrompt();
  // Questo link potrebbe precaricare, ma non inviare automaticamente il messaggio.
  const url = "https://chatgpt.com/?q=" + encodeURIComponent(prompt);
  const windowRef = window.open(url, "_blank", "noopener,noreferrer");
  feedback("gptFeedback", "ChatGPT aperto con il prompt precompilato, se supportato. Se il testo non appare, usa «Copia istruzione» e incollalo nella chat. Il token non è incluso.");
  // Popup blockers may block the new window; fallback is copy prompt.
  void windowRef;
}

async function shaHex(token) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return hex(new Uint8Array(bytes));
}
function demoSecret() {
  if (!globalThis.crypto?.getRandomValues || !crypto.subtle)
    throw new Error("Richiesta connessione HTTPS con Web Crypto disponibile.");
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
async function createDemoCredential(base, clientId, secret, appInfo = null, companyBearer = "") {
  const headers = {"Content-Type": "application/json"};
  if (companyBearer) headers.Authorization = "Bearer " + companyBearer;
  const response = await fetch(base + "/demo/register", {
    method: "POST", mode: "cors", cache: "no-store", headers,
    body: JSON.stringify({tokenSha256: await shaHex(secret), clientId, ...(appInfo || {})})
  });
  const doc = await response.json();
  if (!response.ok || doc?.ok !== true)
    throw new Error("Registrazione demo " + clientId + ": " + (doc?.error || "HTTP " + response.status));
  return doc;
}
async function demoBackend() {
  const base = saveBaseIfValid();
  if (base !== DEFAULT_SERVER_URL)
    throw new Error("Questa simulazione usa solo il server dimostrativo MCP-postgree.");
  if ($("connectionStatus").dataset.state !== "online" && !(await wakeServer()))
    throw new Error("Impossibile raggiungere il server demo. Verifica il pannello Server Render Free.");
  return base;
}

async function prepareCompanyCredential() {
  const button = $("prepareCompanyBtn");
  button.disabled = true;
  feedback("companyFeedback", "Registrazione identità aziendale dimostrativa...");
  try {
    const base = await demoBackend();
    if (!state.enterpriseToken) {
      const secret = demoSecret();
      const registered = await createDemoCredential(base, "mcp-session-company", secret);
      if (registered.role !== "CONNECT_ONLY" || !Array.isArray(registered.schemas) ||
          registered.schemas.length !== 0)
        throw new Error("La registrazione non ha attribuito il ruolo aziendale CONNECT_ONLY.");
      state.enterpriseToken = secret;
    }
    $("enterpriseToken").value = state.enterpriseToken;
    $("companyResults").hidden = false;
    feedback("companyFeedback", "Token 1 aziendale DEMO pronto. Usalo soltanto nel modulo OAuth del connettore. Se era già collegato con questa identità, puoi saltare l'autorizzazione.");
  } catch (error) {
    feedback("companyFeedback", formatError(error));
  } finally {
    button.disabled = false;
  }
}

function resetSessionTicket() {
  state.lastSessionPrompt = "";
  state.lastSessionExpiresAt = 0;
  $("sessionBootstrap").value = "";
  $("sessionExpiration").textContent = "Ticket non generato.";
  $("sessionResults").hidden = true;
  $("sessionPlaceholder").hidden = false;
}

function ticketStillValid() {
  if (!state.lastSessionPrompt || !state.lastSessionExpiresAt) {
    feedback("sessionFeedback", "Prima genera il bootstrap della commessa.");
    return false;
  }
  if (Date.now() + 2000 >= state.lastSessionExpiresAt) {
    resetSessionTicket();
    feedback("sessionFeedback", "Ticket scaduto: premi «Genera ticket e bootstrap» per crearne uno nuovo.");
    return false;
  }
  return true;
}

async function registerNewApplication() {
  const button = $("registerAppBtn");
  button.disabled = true;
  feedback("appRegisterFeedback", "Registrazione gestionale dimostrativo in corso...");
  try {
    const base = await demoBackend();
    if (!state.enterpriseToken)
      throw new Error("Prepara prima il token aziendale DEMO con il pulsante dedicato.");
    const id = $("newAppId").value.trim().toUpperCase();
    const name = $("newAppName").value.trim();
    const dataset = $("newAppDataset").value;
    if (!/^[A-Z][A-Z0-9_]{2,29}$/.test(id))
      throw new Error("Identificativo: da 3 a 30 caratteri, solo lettere maiuscole, cifre o _. Deve iniziare con una lettera.");
    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{2,79}$/u.test(name))
      throw new Error("Nome gestionale non valido (da 3 a 80 caratteri).");
    if (!["laboratorio_a","laboratorio_b"].includes(dataset))
      throw new Error("Dataset non autorizzato.");
    if (state.demoCatalog[id])
      throw new Error("Identificativo già registrato in questa azienda demo. Selezionalo dall'elenco.");
    const token = demoSecret();
    const reply = await createDemoCredential(base, "mcp-sim-" + id.toLowerCase().replaceAll("_","-"),
      token, {applicationId:id,applicationName:name,dataset}, state.enterpriseToken);
    if (reply.role !== "READ_ONLY" || reply.applicationId !== id ||
        !Array.isArray(reply.schemas) || reply.schemas.length !== 1 ||
        reply.schemas[0] !== dataset)
      throw new Error("La policy generata dal server non corrisponde alla richiesta.");
    state.applicationTokens[id] = token;
    state.demoCatalog[id] = {id, name, dataset};
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name + " · " + id + " (" + dataset + ")";
    $("sessionApp").append(option);
    $("sessionApp").value = id;
    resetSessionTicket();
    feedback("appRegisterFeedback", "Gestionale " + name + " registrato a runtime. Nessuna ricompilazione del server.");
  } catch (error) {
    feedback("appRegisterFeedback", formatError(error));
  } finally {
    button.disabled = false;
  }
}

async function createSessionBootstrap() {
  const button = $("createSessionBtn");
  button.disabled = true;
  resetSessionTicket();
  feedback("sessionFeedback", "Preparazione della sessione del gestionale selezionato...");
  try {
    const base = await demoBackend();
    const id = $("sessionApp").value;
    const app = state.demoCatalog[id];
    const commessa = $("sessionWorkOrder").value.trim();
    if (!app || !state.applicationTokens[id])
      throw new Error("Prima registra e seleziona un gestionale di prova.");
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(commessa))
      throw new Error("Codice commessa: da 1 a 64 caratteri (lettere, cifre, _, -, .).");
    const response = await fetch(base + "/api/mcp-postgree/v1/session-bootstrap", {
      method: "POST", mode: "cors", cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.applicationTokens[id]
      },
      body: JSON.stringify({commessa})
    });
    const reply = await response.json();
    if (!response.ok || reply?.ok !== true || typeof reply.ticket !== "string" ||
        !reply.ticket.startsWith("mcp_ticket_") || !reply.bootstrap)
      throw new Error("Bootstrap rifiutato: " + (reply?.error || "HTTP " + response.status));
    const expires = Date.parse(reply.expiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now())
      throw new Error("Ticket restituito senza scadenza valida.");
    state.lastSessionPrompt = [
      "Sei l'assistente AI del gestionale simulato " + app.name + " (" + id + ").",
      "CONNETTORE MCP: " + DEFAULT_SERVER_URL + "/mcp",
      "CONTRATTO IMMUTATO: CommandToMCPPostgree(comando: string).",
      "Il connettore deve gia' essere collegato via OAuth aziendale CONNECT_ONLY: non richiedere nuovamente il token 1.",
      "Questa e' una simulazione READ_ONLY: nessun archivio reale, soltanto " + app.dataset + ".",
      "Commessa di prova selezionata: " + commessa + ".",
      "Verifica la presenza dello strumento e invocalo con il comando:",
      JSON.stringify({azione:"session.attach",ticket:reply.ticket}),
      "Il ticket e' monouso. Verifica ok=true e leggi entrambe le Root ritornate dal server.",
      "Per ogni altro comando JSON inserisci il campo session con il token session appena ottenuto.",
      "Esegui Init con il campo session, mostra solo gli schemi autorizzati e attendi le istruzioni.",
      "Se non puoi invocare lo strumento o una verifica fallisce, non inventare il risultato.",
      "Non modificare dati né cambiare gestionale o commessa all'interno della sessione."
    ].join("\n");
    state.lastSessionExpiresAt = expires;
    $("sessionBootstrap").value = state.lastSessionPrompt;
    $("sessionExpiration").textContent = "Ticket monouso valido fino alle " +
      new Date(expires).toLocaleTimeString("it-IT", {hour:"2-digit", minute:"2-digit", second:"2-digit"}) +
      " · " + app.name + " · commessa " + commessa + ".";
    $("sessionResults").hidden = false;
    $("sessionPlaceholder").hidden = true;
    feedback("sessionFeedback", "Bootstrap pronto per " + app.name + " / commessa " + commessa +
      ". Copia in ChatGPT o Claude con OAuth aziendale già collegato.");
  } catch (error) {
    feedback("sessionFeedback", formatError(error));
  } finally {
    button.disabled = false;
  }
}

async function copySessionPrompt() {
  if (!ticketStillValid()) return;
  await copyText(state.lastSessionPrompt,
    "Bootstrap copiato: incollalo nella chat con connettore aziendale già collegato.", "sessionFeedback");
}

function openSessionChat(platform) {
  if (!ticketStillValid()) return;
  // Never put a one-time ticket in an URL/query parameter, referrer or history.
  const destination = platform === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/";
  window.open(destination, "_blank", "noopener,noreferrer");
  void navigator.clipboard.writeText(state.lastSessionPrompt).then(
    () => feedback("sessionFeedback", "Chat aperta e bootstrap copiato. Incolla il testo nella chat; non reinserire il token OAuth."),
    () => feedback("sessionFeedback", "Chat aperta. Premi «Copia bootstrap», poi incollalo nella chat.")
  );
}

function clearSessionDemo() {
  state.enterpriseToken = "";
  state.applicationTokens = Object.create(null);
  state.demoCatalog = Object.create(null);
  $("sessionApp").replaceChildren(new Option("— Prima registra un applicativo —", ""));
  $("enterpriseToken").value = "";
  $("companyResults").hidden = true;
  resetSessionTicket();
  feedback("companyFeedback", "Credenziale di prova eliminata dalla pagina (non revocata lato server).");
  feedback("sessionFeedback", "Bootstrap cancellato dalla pagina. Le sessioni già agganciate scadono sul server.");
}

function installHandlers() {
  $("frontVersion").textContent = "V" + FRONT_VERSION;
  $("wakeBtn").addEventListener("click", wakeServer);
  $("cancelWakeBtn").addEventListener("click", () => state.wakeController?.abort());
  $("generateTokenBtn").addEventListener("click", generateToken);
  $("registerDemoBtn").addEventListener("click", registerDemoToken);
  $("clearTokenBtn").addEventListener("click", clearGeneratedToken);
  $("toggleTokenBtn").addEventListener("click", () => {
    const show = $("tokenValue").type === "password";
    $("tokenValue").type = show ? "text" : "password";
    $("toggleTokenBtn").textContent = show ? "Nascondi" : "Mostra";
  });
  $("copyTokenBtn").addEventListener("click", () =>
    copyText(state.activeToken, "Token copiato: conservalo nel vault del gestionale.", "tokenStatus"));
  $("copyHashBtn").addEventListener("click", () =>
    copyText(state.tokenHash, "Impronta SHA-256 copiata.", "tokenStatus"));
  $("copyPolicyBtn").addEventListener("click", () =>
    copyText($("policyDraft").value, "Bozza copiata: completare allowlist e registrare nel secret store.", "tokenStatus"));
  $("testMcpBtn").addEventListener("click", testMcp);
  $("clearTestTokenBtn").addEventListener("click", () => { $("testToken").value = ""; feedback("mcpFeedback", "Token rimosso."); });
  $("openGptBtn").addEventListener("click", openChatGpt);
  $("prepareCompanyBtn").addEventListener("click", prepareCompanyCredential);
  $("registerAppBtn").addEventListener("click", registerNewApplication);
  $("createSessionBtn").addEventListener("click", createSessionBootstrap);
  $("sessionApp").addEventListener("change", resetSessionTicket);
  $("sessionWorkOrder").addEventListener("input", resetSessionTicket);
  $("copyEnterpriseTokenBtn").addEventListener("click", () =>
    copyText(state.enterpriseToken, "Token aziendale DEMO copiato. Usalo solo nella pagina OAuth protetta.", "companyFeedback"));
  $("copySessionBootstrapBtn").addEventListener("click", copySessionPrompt);
  $("openSessionGptBtn").addEventListener("click", () => openSessionChat("gpt"));
  $("openSessionClaudeBtn").addEventListener("click", () => openSessionChat("claude"));
  $("clearSessionBtn").addEventListener("click", clearSessionDemo);
  $("copyEndpointBtn").addEventListener("click", () =>
    copyText(DEFAULT_SERVER_URL + "/mcp", "URL MCP copiato. In ChatGPT scegli OAuth.", "gptFeedback"));
  $("copyPromptBtn").addEventListener("click", () =>
    copyText(renderPrompt(), "Istruzione copiata. Incollala nella chat GPT.", "gptFeedback"));
  $("serverUrl").addEventListener("change", () => {
    try { saveBaseIfValid(); } catch { resetServerUi(""); }
  });
  const previous = localStorage.getItem("mcp-postgree-test-url");
  if (previous) {
    try {
      state.baseUrl = normalizeBase(previous);
      $("serverUrl").value = state.baseUrl;
      resetServerUi(state.baseUrl);
      // Risveglio automatico senza scaricare segreti e senza bisogno di token.
      void wakeServer();
    } catch { localStorage.removeItem("mcp-postgree-test-url"); }
  } else {
    state.baseUrl = DEFAULT_SERVER_URL;
    $("serverUrl").value = DEFAULT_SERVER_URL;
    resetServerUi(DEFAULT_SERVER_URL);
    void wakeServer();
  }
}
installHandlers();
