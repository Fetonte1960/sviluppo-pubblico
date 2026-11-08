"use strict";
// Pagina Salvataggio/Ripristino. Nessun contatto e nessun segreto persistito.
(() => {
  const cfg = window.CONTATTI_CONFIG || {};
  const base = String(cfg.apiBase || "").replace(/\/$/, "");
  const desktop = cfg.desktop === true && !!window.CONTATTI_DESKTOP?.key;
  const local = cfg.local === true || desktop;
  const $ = selector => document.querySelector(selector);
  const archiveOrigin = window.location.origin;
  let sessionKey = "";
  let adminKeyFromDesktop = desktop ? String(window.CONTATTI_DESKTOP.importKey || "") : "";
  let authorized = false;
  let busy = false;
  let pendingToken = "";

  const loginBox = $("#accessBox");
  const backupButton = $("#backupButton");
  const fileInput = $("#restoreFile");
  const prepareFile = $("#prepareFile");
  const prepareCloud = $("#prepareCloud");
  const confirmRestore = $("#confirmRestore");
  const consent = $("#restoreConsent");
  const restorePreview = $("#restorePreview");

  $("#restoreLocal").hidden = !local;
  $("#restoreCloudUnavailable").hidden = local;
  $("#adminKeyLabel").hidden = !local || desktop;
  const standalone = window.parent === window;
  document.body.classList.toggle("standalone", standalone);

  function report(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }
  function updateControls() {
    backupButton.disabled = !authorized || busy;
    fileInput.disabled = !authorized || busy;
    prepareFile.disabled = !authorized || busy || !fileInput.files?.length;
    prepareCloud.disabled = !authorized || busy;
    confirmRestore.disabled = !authorized || busy || !consent.checked || !pendingToken;
  }
  function resetPreview() {
    pendingToken = "";
    consent.checked = false;
    restorePreview.hidden = true;
    updateControls();
  }
  function currentImportKey() {
    const value = adminKeyFromDesktop || $("#adminKey").value.trim();
    if (!value) throw new Error("Per il ripristino serve la chiave amministrativa locale.");
    return value;
  }
  function archiveHeaders(extra = {}) {
    return { "X-Demo-Key": sessionKey, "X-Import-Key": currentImportKey(), ...extra };
  }
  async function verifyKey(candidate) {
    if (!candidate) {
      authorized = false;
      sessionKey = "";
      loginBox.hidden = false;
      updateControls();
      return;
    }
    sessionKey = candidate;
    try {
      const response = await fetch(base + "/api/v1/organizations", {
        headers: { "X-Demo-Key": sessionKey },
        cache: "no-store",
        signal: AbortSignal.timeout(20000)
      });
      if (response.status === 401) {
        sessionKey = "";
        authorized = false;
        loginBox.hidden = false;
        report($("#backupStatus"), "Chiave TEST non valida. Riapri l'archivio.", true);
      } else if (!response.ok) {
        authorized = false;
        loginBox.hidden = false;
        report($("#backupStatus"), "Archivio non disponibile (HTTP " + response.status + "). Riprova l'accesso.", true);
      } else {
        authorized = true;
        loginBox.hidden = true;
        $("#accessKey").value = "";
        report($("#backupStatus"), "");
        report($("#restoreStatus"), "");
      }
    } catch (e) {
      authorized = false;
      loginBox.hidden = false;
      report($("#backupStatus"), "Server non raggiungibile: " + e.message, true);
    }
    updateControls();
  }

  // La pagina CRM resta aperta nel documento padre e condivide il segreto
  // esclusivamente in memoria; verifica stretta dell'origine e finestra mittente.
  window.addEventListener("message", e => {
    if (standalone || e.origin !== archiveOrigin || e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.type !== "fastpharma-archive-session") return;
    if (desktop) {
      adminKeyFromDesktop = String(window.CONTATTI_DESKTOP?.importKey || "");
    } else if (local && typeof m.importKey === "string" && m.importKey) {
      // Ammesso solo da finestra CRM verificata sulla stessa origine.
      adminKeyFromDesktop = m.importKey;
      $("#adminKeyLabel").hidden = true;
    }
    if (typeof m.key === "string" && m.key && m.key !== sessionKey) {
      verifyKey(m.key);
    } else if (!m.key && !authorized) {
      loginBox.hidden = false;
    }
  });
  if (!standalone) {
    window.parent.postMessage({ type: "fastpharma-archive-ready" }, archiveOrigin);
  }

  $("#accessForm").addEventListener("submit", async e => {
    e.preventDefault();
    const candidate = $("#accessKey").value.trim();
    if (!candidate) {
      report($("#backupStatus"), "Inserisci la chiave TEST.", true);
      return;
    }
    $("#accessButton").disabled = true;
    try { await verifyKey(candidate); }
    finally { $("#accessButton").disabled = false; }
  });
  $("#restoreFile").addEventListener("change", () => {
    resetPreview();
    report($("#restoreStatus"), "");
  });
  $("#adminKey").addEventListener("input", () => {
    resetPreview();
    report($("#restoreStatus"), "");
  });
  consent.addEventListener("change", updateControls);

  backupButton.addEventListener("click", async () => {
    if (!authorized || busy) return;
    busy = true;
    updateControls();
    report($("#backupStatus"), "Preparazione backup in corso...");
    try {
      const response = await fetch(base + "/api/admin/backup/contatti", {
        method: "POST",
        headers: { "X-Demo-Key": sessionKey },
        cache: "no-store",
        signal: AbortSignal.timeout(100000)
      });
      if (!response.ok) throw new Error("Backup non riuscito (HTTP " + response.status + ")");
      const blob = await response.blob();
      if (!blob.size) throw new Error("Backup vuoto");
      const name = "fastpharma_contatti_" +
        new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "_") +
        ".backup";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      report($("#backupStatus"), "Download del file " + name + " avviato. Conservalo in una cartella sicura.");
    } catch (e) {
      report($("#backupStatus"), e.message, true);
    } finally {
      busy = false;
      updateControls();
    }
  });

  async function importRequest(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      headers: archiveHeaders(options.headers || {}),
      cache: "no-store",
      signal: AbortSignal.timeout(185000)
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Chiave amministrativa locale non valida.");
      if (response.status === 409) throw new Error("Un'operazione è già in corso o l'anteprima è scaduta.");
      if (response.status === 422) throw new Error("Il backup non è valido oppure il ripristino non è configurato.");
      throw new Error("Ripristino non riuscito (HTTP " + response.status + ").");
    }
    return await response.json();
  }
  function showPreview(result) {
    pendingToken = String(result.token || "");
    consent.checked = false;
    restorePreview.hidden = false;
    $("#restoreComparison").textContent =
      "Record Contatti locali: " + result.currentCount +
      " · Record nel backup: " + result.incomingCount +
      " · Migrazioni nell'archivio: " + result.incomingMigrations +
      ". Il ripristino SOSTITUIRÀ lo schema Contatti locale.";
    report($("#restoreStatus"), "Backup verificato in un database di prova. Nessun dato locale modificato.");
    updateControls();
  }
  async function prepare(fromCloud) {
    if (!local || !authorized || busy) return;
    resetPreview();
    const file = fileInput.files?.[0];
    if (!fromCloud && !file) {
      report($("#restoreStatus"), "Seleziona un file .backup prima di procedere.", true);
      return;
    }
    if (!fromCloud && file.size > 25 * 1024 * 1024) {
      report($("#restoreStatus"), "Backup superiore al limite di 25 MB.", true);
      return;
    }
    busy = true;
    updateControls();
    report($("#restoreStatus"), fromCloud ? "Recupero e verifica del backup cloud..." : "Verifica del file di backup...");
    try {
      const path = fromCloud ?
        "/api/admin/import/contatti/prepare-cloud" :
        "/api/admin/import/contatti/prepare-file";
      const options = fromCloud ? { method: "POST" } : {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      };
      showPreview(await importRequest(path, options));
    } catch (e) {
      report($("#restoreStatus"), e.message, true);
    } finally {
      busy = false;
      updateControls();
    }
  }
  prepareFile.addEventListener("click", () => prepare(false));
  prepareCloud.addEventListener("click", () => prepare(true));

  confirmRestore.addEventListener("click", async () => {
    if (!authorized || !local || !pendingToken || !consent.checked || busy) return;
    busy = true;
    updateControls();
    report($("#restoreStatus"), "Backup preventivo e ripristino locale in corso. Non chiudere il programma.");
    try {
      const result = await importRequest("/api/admin/import/contatti/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pendingToken, confirmed: true })
      });
      resetPreview();
      report($("#restoreStatus"), "Ripristino completato: " + result.importedContacts +
        " contatti. Copia di sicurezza locale: " + result.backup + ".");
      if (!standalone) {
        window.parent.postMessage({ type: "fastpharma-archive-data-changed" }, archiveOrigin);
      }
    } catch (e) {
      report($("#restoreStatus"), e.message, true);
    } finally {
      busy = false;
      updateControls();
    }
  });
  updateControls();
  if (desktop) verifyKey(window.CONTATTI_DESKTOP.key);
  else if (standalone) loginBox.hidden = false;
  // Quando la pagina è incorporata attende la chiave dalla sessione CRM: nessuna richiesta duplicata.
})();