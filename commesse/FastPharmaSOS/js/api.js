const API_BASE = document.documentElement.dataset.apiBase?.replace(/\/$/, "") ?? "";

async function request(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export const getHealth = () => request("/health");
export const getAiHealth = () => request("/health/ai");
export const getCommesse = () => request("/api/fastpharmasos/v1/commesse");
export const askAssistant = message => request(
  "/api/fastpharmasos/v1/chat",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, commessaId: null })
  },
  90000
);
