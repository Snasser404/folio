/* Document outline / bookmarks (read + navigate). */
import { bus, state } from "../core/state.js";
import * as scheduler from "../core/render-scheduler.js";
import { getOutline } from "../core/pdf-engine.js";

export function initOutlinePanel(ctx) {
  const panel = document.getElementById("panel-outline");
  bus.on("doc:opened", load);

  async function load() {
    panel.innerHTML = '<div class="empty-note">Loading…</div>';
    const pdfDoc = state.doc.pdfDoc;
    const outline = await getOutline(pdfDoc);
    if (!outline || !outline.length) { panel.innerHTML = '<div class="empty-note">No bookmarks in this PDF.</div>'; return; }
    panel.innerHTML = "";
    const tree = document.createElement("div");
    tree.style.padding = "6px 0";
    renderItems(outline, tree, 0, pdfDoc);
    panel.appendChild(tree);
  }

  function renderItems(items, container, depth, pdfDoc) {
    items.forEach((it) => {
      const a = document.createElement("div");
      a.className = "list-item";
      a.style.paddingLeft = 10 + depth * 14 + "px";
      a.textContent = it.title;
      a.addEventListener("click", () => goTo(it.dest, pdfDoc));
      container.appendChild(a);
      if (it.items && it.items.length) renderItems(it.items, container, depth + 1, pdfDoc);
    });
  }

  async function goTo(dest, pdfDoc) {
    try {
      let d = dest;
      if (typeof dest === "string") d = await pdfDoc.getDestination(dest);
      if (!d) return;
      const idx = await pdfDoc.getPageIndex(d[0]);
      const page = state.pages.find((p) => p.srcIndex === idx);
      if (page) scheduler.scrollToPage(page.id, "start");
    } catch (e) { console.warn("[outline] navigation failed", e); }
  }
}
