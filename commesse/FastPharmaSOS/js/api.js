const API_BASE = document.documentElement.dataset.apiBase?.replace(/\/$/, "") ?? "";
let adminToken = "";

export function setAdminToken(token) {
  adminToken = typeof token === "string" ? token : "";
}

function clientError(kind, message, cause = null) {
  const error = new Error(message);
  error.kind = kind;
  error.component = "server";
  error.retryable = true;
  if (cause) error.cause = cause;
  return error;
}

async function requestOnce(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
          ...(options.headers ?? {})
        },
        signal: controller.signal
      });
    } catch (cause) {
      if (cause?.name === "AbortError") {
        throw clientError("client_timeout", "Il server non ha risposto entro il tempo massimo.", cause);
      }
      throw clientError("network_error", "Il frontend non riesce a raggiungere il server FastPharmaSOS.", cause);
    }

    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      error.component = body?.component ?? null;
      error.reason = body?.reason ?? null;
      error.retryable = body?.retryable ?? null;
      throw error;
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

// Render Free: i servizi in pausa possono richiedere tempo al primo accesso.
// Ritenta solo letture, in modo limitato: nessun polling permanente e nessuna scrittura ripetuta.
async function request(path, options = {}, timeoutMs = 20000) {
  if (options.method && options.method.toUpperCase() !== "GET") return requestOnce(path, options, timeoutMs);
  const delays = [5000, 10000, 15000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(path, options, Math.max(timeoutMs, 20000));
    } catch (error) {
      const transient = ["client_timeout", "network_error"].includes(error.kind) ||
        [502, 503, 504].includes(error.status);
      if (!transient || attempt >= delays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
}

export const getHealth = () => request("/health", {}, 10000);
export const loginAdmin = async password => {
  // Wake Render Free via idempotent GET before sending credentials. Never retry the POST.
  await getHealth();
  return request(
  "/api/fastpharmasos/v1/auth/login",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  },
  30000
  );
};
export const getDbHealth = () => request("/health/db", {}, 10000);
export const getAiHealth = provider => request(
  `/health/ai${provider ? `?provider=${encodeURIComponent(provider)}` : ""}`,
  {},
  10000
);
export const getCommesse = q => request(
  `/api/fastpharmasos/v1/commesse${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  {},
  15000
);
export const getCommessa = id => request(`/api/fastpharmasos/v1/commesse/${encodeURIComponent(id)}`, {}, 15000);
export const getCommessaDocumenti = id => request(`/api/fastpharmasos/v1/commesse/${encodeURIComponent(id)}/documenti`, {}, 15000);
export const getCommessaInterazioni = id => request(`/api/fastpharmasos/v1/commesse/${encodeURIComponent(id)}/interazioni?limit=100`, {}, 15000);
export const askAssistant = message => request(
  "/api/fastpharmasos/v1/assistant/engine",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  },
  120000
);

export const confirmEngineCandidate = (message, candidateId, failureId) => request(
  "/api/fastpharmasos/v1/assistant/engine/confirm",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, candidateId, failureId: failureId || null })
  },
  120000
);

export const savePharmacyDocument = (farmaciaId, documentId, body) => request(
  `/api/fastpharmasos/v1/commesse/${encodeURIComponent(farmaciaId)}/documenti${documentId ? "/"+encodeURIComponent(documentId) : ""}`,
  { method: documentId ? "PUT" : "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body) }, 60000
);
export const deletePharmacyDocument = (farmaciaId, documentId) => request(
  `/api/fastpharmasos/v1/commesse/${encodeURIComponent(farmaciaId)}/documenti/${encodeURIComponent(documentId)}`,
  { method:"DELETE" }, 30000
);

const TECNICI_API = "/api/fastpharmasos/v1";
export const getSpecializations = () => request(`${TECNICI_API}/specializzazioni`,{},15000);
export const getTechnicians = ({q = "",competenza = "",provincia = ""} = {}) => {
  const query = new URLSearchParams();
  if(q)query.set("q",q);
  if(competenza)query.set("competenza",competenza);
  if(provincia)query.set("provincia",provincia);
  return request(`${TECNICI_API}/tecnici${query.size?"?"+query.toString():""}`,{},15000);
};
export const saveTechnician = (id, payload) => request(
  `${TECNICI_API}/tecnici${id?"/"+encodeURIComponent(id):""}`,
  { method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload) }, 30000
);

export const updateTechnicianConvention = (id, stato) => request(
  `${TECNICI_API}/tecnici/${encodeURIComponent(id)}/convenzione`,
  { method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stato }) }, 30000
);
