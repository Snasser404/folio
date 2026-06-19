/* Drag & drop a PDF anywhere to open it. */
import { bus } from "../core/state.js";

export function initDnd() {
  const overlay = document.getElementById("dropOverlay");
  let depth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; overlay.hidden = false; });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", (e) => { e.preventDefault(); if (--depth <= 0) overlay.hidden = true; });
  window.addEventListener("drop", (e) => {
    e.preventDefault(); depth = 0; overlay.hidden = true;
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) bus.emit("action:open-file", file);
  });
}
