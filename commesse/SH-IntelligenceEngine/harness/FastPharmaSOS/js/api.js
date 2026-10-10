const SH_BASE = document.documentElement.dataset.shBase?.replace(/\/$/, "") ?? "";

function clientError(kind, message, cause = null) {
  const error = new Error(message);
  error.kind = kind;
  if (cause) error.cause = cause;
  return error;
}

async function request(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(`${SH_BASE}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.headers ?? {})
        },
        signal: controller.signal
      });
    } catch (cause) {
      if (cause?.name === "AbortError") {
        throw clientError("timeout", "SH-IntelligenceEngine non ha risposto entro il tempo massimo.", cause);
      }
      throw clientError("network", "Il browser non riesce a raggiungere SH-IntelligenceEngine.", cause);
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
      throw error;
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export const getHealth = () => request("/health", {}, 15000);

export const interpretHarness = (question, order, topN) =>
  request(
    "/api/v1/harness/interpreta",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programmazioneId: "FastPharmaSOS",
        domanda: question,
        ordine: order,
        topN
      })
    },
    60000
  );

export const confirmCandidate = (question, candidateId, failureId) =>
  request(
    "/api/v1/harness/conferma",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programmazioneId: "FastPharmaSOS",
        domandaOriginale: question,
        candidateId,
        fallimentoId: failureId || null
      })
    },
    60000
  );
