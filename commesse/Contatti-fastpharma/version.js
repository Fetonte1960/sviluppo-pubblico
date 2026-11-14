"use strict";
// Unica dichiarazione applicativa della versione visibile, sempre incrementata a ogni incarico.
window.FASTPHARMA_VERSION = Object.freeze({major:1,minor:0,patch:20,label:"V1.0.20",channel:"Gestione"});
document.addEventListener("DOMContentLoaded", () => {
  const label = window.FASTPHARMA_VERSION.label;
  for (const id of ["appVersion", "releaseVersion"]) {
    const element = document.getElementById(id);
    if (element) element.textContent = label;
  }
});
window.addEventListener("load", () => {
  if (window.__FASTPHARMA_CRM_READY__) return;
  const feedback = document.getElementById("loginFeedback");
  if (feedback) {
    feedback.textContent = "Interfaccia non inizializzata: aggiorna la pagina con Ctrl+F5. Se il problema rimane, segnala la versione.";
    feedback.classList.add("error");
  }
});
