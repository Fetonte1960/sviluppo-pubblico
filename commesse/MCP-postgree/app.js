"use strict";

// Front V0.1.0 — incrementare la versione a ogni pubblicazione.
const FRONT_VERSION = "0.1.0";
const EXPECTED_SERVER_VERSION = "1.1.0";
const TOOL_NAME = "CommandToMCPPostgree";
const PAGE_INSTRUCTIONS = "https://github.com/Fetonte1960/sviluppo-pubblico/blob/main/commesse/MCP-postgree/ISTRUZIONI.md";
const DEFAULT_TIMEOUT_MS = 125_000;
const state = {baseUrl: "", wakeController: null, activeToken: "", tokenHash: "", sequence: 0};
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
  renderPrompt();
}
function resetServerUi(base) {
  $("mcpEndpoint").textContent = base ? base + "/mcp" : "—";
  $("serverVersion").textContent = "V" + EXPECTED_SERVER_VERSION + " attesa";
  $("serverVersionDetail").textContent = "V" + EXPECTED_SERVER_VERSION + " (non verificata)";
  $("serverCommit").textContent = "—";
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
    feedback("tokenStatus", "Generato in questo browser · registrazione server necessaria");
    // Non compilare automaticamente il campo di test: serve l'esplicita conferma di provisioning.
  } catch (error) {
    feedback("tokenStatus", formatError(error));
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
function installHandlers() {
  $("frontVersion").textContent = "V" + FRONT_VERSION;
  $("wakeBtn").addEventListener("click", wakeServer);
  $("cancelWakeBtn").addEventListener("click", () => state.wakeController?.abort());
  $("generateTokenBtn").addEventListener("click", generateToken);
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
  } else { renderPrompt(); }
}
installHandlers();
