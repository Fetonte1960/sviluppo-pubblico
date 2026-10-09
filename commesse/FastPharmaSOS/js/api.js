const API_BASE = document.documentElement.dataset.apiBase?.replace(/\/$/, "") ?? "";

function clientError(kind, message, cause = null) {
  const error = new Error(message);
  error.kind = kind;
  error.component = "server";
  error.retryable = true;
  if (cause) error.cause = cause;
  return error;
}

async function request(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
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

export const getHealth = () => request("/health", {}, 10000);
export const getDbHealth = () => request("/health/db", {}, 10000);
export const getAiHealth = () => request("/health/ai", {}, 10000);
export const getCommesse = () => request("/api/fastpharmasos/v1/commesse", {}, 15000);
export const askAssistant = message => request(
  "/api/fastpharmasos/v1/chat",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, commessaId: null })
  },
  90000
);
