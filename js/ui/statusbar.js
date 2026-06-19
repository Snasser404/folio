/* Status bar: doc name, saved state, page X/N, dims, zoom. */
import { state, bus, getPage, pageIndex, setFocusedPage, setZoom, setFitMode } from "../core/state.js";
import * as scheduler from "../core/render-scheduler.js";

export function initStatusbar() {
  const docName = document.getElementById("sbDocName");
  const pageInput = document.getElementById("sbPageInput");
  const pageCount = document.getElementById("sbPageCount");
  const dims = document.getElementById("sbDims");
  const zoom = document.getElementById("sbZoom");
  const savedDot = document.getElementById("savedDot");
  const topName = document.getElementById("docName");

  const slider = document.getElementById("sbZoomSlider");
  slider.addEventListener("input", () => { setFitMode("custom"); setZoom(parseInt(slider.value, 10) / 100); });
  document.getElementById("sbZoomOut").addEventListener("click", () => bus.emit("action:zoom-out"));
  document.getElementById("sbZoomIn").addEventListener("click", () => bus.emit("action:zoom-in"));

  bus.on("doc:opened", (d) => { docName.textContent = d.fileName || "Untitled.pdf"; topName.textContent = d.fileName || ""; });
  bus.on("pages:changed", (pages) => { pageCount.textContent = pages.length; refresh(); });
  bus.on("view:zoom", (z) => {
    zoom.textContent = Math.round(z * 100) + "%";
    if (document.activeElement !== slider) slider.value = Math.round(Math.max(25, Math.min(400, z * 100)));
  });
  bus.on("page:focused", refresh);
  bus.on("doc:dirty", (d) => { savedDot.classList.toggle("unsaved", !!d); savedDot.title = d ? "Unsaved changes" : "Saved"; });

  function refresh() {
    const id = state.view.focusedPageId || (state.pages[0] && state.pages[0].id);
    const p = getPage(id);
    if (!p) { pageInput.value = "–"; dims.textContent = ""; return; }
    pageInput.value = pageIndex(id) + 1;
    const r = (p.intrinsicRotate + p.rotation) % 360;
    const w = (r === 90 || r === 270) ? p.size.h : p.size.w;
    const h = (r === 90 || r === 270) ? p.size.w : p.size.h;
    dims.textContent = `${Math.round(w)} × ${Math.round(h)} pt`;
  }

  const goTo = () => {
    const n = parseInt(pageInput.value, 10);
    if (n >= 1 && n <= state.pages.length) {
      const id = state.pages[n - 1].id;
      scheduler.scrollToPage(id, "start", "auto"); // instant snap to page top
      setFocusedPage(id);                          // updates thumbnail highlight
    } else refresh();                     // invalid → restore current page number
  };
  pageInput.addEventListener("change", goTo);
  pageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); goTo(); pageInput.blur(); } });
}
