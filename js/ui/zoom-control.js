/* Zoom actions: in/out/fit-width/fit-page/actual + initial fit on open. */
import { state, setZoom, setFitMode, bus, getPage } from "../core/state.js";
import { effDims } from "../core/page-host.js";

export function initZoom() {
  bus.on("action:zoom-in", () => { setFitMode("custom"); setZoom(state.view.zoom * 1.15); });
  bus.on("action:zoom-out", () => { setFitMode("custom"); setZoom(state.view.zoom / 1.15); });
  bus.on("action:fit", () => fitWidth());
  bus.on("action:fit-page", () => fitPage());
  bus.on("action:actual", () => { setFitMode("actual"); setZoom(1); });
  bus.on("doc:opened", () => setTimeout(fitWidth, 60));
  window.addEventListener("resize", () => {
    if (state.view.fitMode === "width") fitWidth();
    else if (state.view.fitMode === "page") fitPage();
  });
}

function refPage() { return getPage(state.view.focusedPageId) || state.pages[0]; }

function fitWidth() {
  const page = refPage(); if (!page) return;
  const vp = document.getElementById("viewport");
  const avail = vp.clientWidth - 64;
  setFitMode("width");
  setZoom(avail / effDims(page).w);
}

function fitPage() {
  const page = refPage(); if (!page) return;
  const vp = document.getElementById("viewport");
  const e = effDims(page);
  const z = Math.min((vp.clientWidth - 64) / e.w, (vp.clientHeight - 64) / e.h);
  setFitMode("page");
  setZoom(z);
}
