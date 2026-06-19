/* Find-in-document: results list + prev/next navigation + on-page highlighting
 * (toggles classes on the pdf.js text-layer spans for each match). */
import { bus, state } from "../core/state.js";
import * as scheduler from "../core/render-scheduler.js";
import { search, clearCache } from "../core/search.js";

export function initSearchPanel(ctx) {
  const panel = document.getElementById("panel-search");
  panel.innerHTML = "";
  const head = document.createElement("div");
  head.className = "panel-section";
  const input = document.createElement("input");
  input.className = "field field-full";
  input.placeholder = "Find in document…";
  input.setAttribute("aria-label", "Find in document");
  const navRow = document.createElement("div");
  navRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:6px";
  const prev = navBtn("‹", "Previous match (Shift+Enter)");
  const next = navBtn("›", "Next match (Enter)");
  const count = document.createElement("span");
  count.style.cssText = "font-size:12px;color:var(--text-muted);margin-left:auto;font-variant-numeric:tabular-nums";
  navRow.append(prev, next, count);
  head.append(input, navRow);
  const list = document.createElement("div");
  list.style.cssText = "flex:1;overflow-y:auto";
  panel.append(head, list);

  let matches = [], active = -1, timer = null;

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? goTo(active - 1) : goTo(active + 1); } });
  prev.addEventListener("click", () => goTo(active - 1));
  next.addEventListener("click", () => goTo(active + 1));
  bus.on("doc:opened", reset);
  bus.on("panel:changed", (p) => { if (p === "search") setTimeout(() => input.focus(), 50); });

  function reset() { clearCache(); input.value = ""; list.innerHTML = ""; count.textContent = ""; matches = []; active = -1; clearHighlights(); }

  async function run() {
    const q = input.value;
    clearHighlights(); list.innerHTML = ""; matches = []; active = -1;
    if (!q) { count.textContent = ""; return; }
    count.textContent = "Searching…";
    matches = await search(q);
    renderList();
    if (matches.length) goTo(0);
    else count.textContent = "No results";
  }

  function renderList() {
    list.innerHTML = "";
    matches.slice(0, 500).forEach((m, i) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.dataset.i = i;
      const pageNo = state.pages.findIndex((p) => p.id === m.pageId) + 1;
      item.innerHTML = `<div class="li-head">Page ${pageNo}</div><div class="li-body">${
        escapeHtml(m.snippet).replace(/​([\s\S]*?)​/, "<mark>$1</mark>")}</div>`;
      item.addEventListener("click", () => goTo(i));
      list.appendChild(item);
    });
  }

  function goTo(i) {
    if (!matches.length) return;
    active = (i + matches.length) % matches.length;
    const m = matches[active];
    count.textContent = `${active + 1} of ${matches.length}`;
    list.querySelectorAll(".list-item").forEach((el) => el.classList.toggle("active", +el.dataset.i === active));
    const a = list.querySelector(".list-item.active");
    if (a) a.scrollIntoView({ block: "nearest" });
    scheduler.scrollToPage(m.pageId, "center");
    applyHighlights();
    setTimeout(applyHighlights, 250);   // text layer builds async after scroll
    setTimeout(applyHighlights, 750);
  }

  function applyHighlights() {
    clearHighlights();
    matches.forEach((m, i) => {
      if (m.spanStart == null) return;
      const host = scheduler.getHost(m.pageId);
      if (!host || !host.textLayerBuilt) return;
      const spans = host.textLayerEl.children;
      for (let s = m.spanStart; s <= m.spanEnd && s < spans.length; s++) {
        const sp = spans[s];
        if (sp && sp.tagName === "SPAN") { sp.classList.add("search-hit"); if (i === active) sp.classList.add("search-hit-active"); }
      }
    });
  }

  function clearHighlights() {
    for (const h of scheduler.getHosts().values()) {
      if (h.textLayerEl) h.textLayerEl.querySelectorAll(".search-hit").forEach((s) => s.classList.remove("search-hit", "search-hit-active"));
    }
  }

  function navBtn(txt, tip) {
    const b = document.createElement("button");
    b.className = "btn ghost";
    b.style.cssText = "height:28px;width:34px;font-size:18px;line-height:1";
    b.textContent = txt;
    b.setAttribute("data-tip", tip);
    b.setAttribute("aria-label", tip);
    return b;
  }
}

function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
