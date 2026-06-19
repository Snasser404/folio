/* Page organizer: thumbnails with click-to-navigate, multi-select, drag-reorder,
 * rotate, duplicate, delete, add blank, append PDF, and batch rotate/delete/extract. */
import { state, bus, getPage, pageIndex, reorderPages, removePage, insertPageAt, updatePage, setFocusedPage, makePageModel, getSourceDoc } from "../core/state.js";
import * as scheduler from "../core/render-scheduler.js";
import * as history from "../core/history.js";
import { buildThumb } from "../core/page-host.js";
import { iconSvg } from "../ui/icon.js";
import { confirmDialog } from "../ui/toast.js";

export function initThumbnails(ctx) {
  const panel = document.getElementById("panel-thumbnails");
  panel.innerHTML = "";
  const tools = document.createElement("div");
  tools.className = "panel-section";
  tools.style.cssText = "display:flex;gap:6px";
  tools.append(btn("plus", "Add blank", () => bus.emit("action:add-blank")),
               btn("merge", "Append", () => bus.emit("action:merge")));

  const batchBar = document.createElement("div");
  batchBar.className = "panel-section";
  batchBar.style.cssText = "display:none;gap:6px;align-items:center;flex-wrap:wrap;background:var(--accent-soft)";

  const strip = document.createElement("div");
  strip.id = "thumbStrip";
  panel.append(tools, batchBar, strip);

  let dragId = null;
  const selected = new Set();
  let anchorId = null;

  bus.on("pages:changed", () => { for (const id of [...selected]) if (!getPage(id)) selected.delete(id); render(); });
  bus.on("page:focused", highlight);
  bus.on("page:updated", ({ id }) => refreshThumb(id));
  bus.on("history:reloaded", ({ pageId }) => refreshThumb(pageId));

  function render() {
    strip.innerHTML = "";
    state.pages.forEach((p, i) => strip.appendChild(makeThumb(p, i)));
    thumbAll();
    highlight();
    applySelection();
  }

  async function thumbAll() {
    for (const p of state.pages) {
      if (!p.thumb) {
        p.thumb = await buildThumb(p, getSourceDoc(p), 220);
        const img = strip.querySelector(`.thumb[data-id="${p.id}"] img`);
        if (img) img.src = p.thumb;
      }
    }
  }
  async function refreshThumb(id) {
    const p = getPage(id); if (!p) return;
    p.thumb = await buildThumb(p, getSourceDoc(p), 220);
    const img = strip.querySelector(`.thumb[data-id="${id}"] img`);
    if (img) img.src = p.thumb;
  }

  function highlight() {
    const fid = state.view.focusedPageId;
    strip.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("active", t.dataset.id === fid));
  }
  function applySelection() {
    strip.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("selected", selected.has(t.dataset.id)));
    batchBar.style.display = selected.size ? "flex" : "none";
    if (selected.size) {
      batchBar.innerHTML = "";
      const count = document.createElement("span");
      count.style.cssText = "font-size:12px;font-weight:600;color:var(--accent);margin-right:auto";
      count.textContent = `${selected.size} selected`;
      batchBar.append(count,
        miniBtn("rotate", "Rotate", batchRotate),
        miniBtn("export", "Extract", batchExtract),
        miniBtn("trash", "Delete", batchDelete, "del"),
        miniBtn("close", "Clear", () => { selected.clear(); anchorId = null; applySelection(); }));
    }
  }

  function onThumbClick(id, e) {
    e.stopPropagation();
    if (e.shiftKey && anchorId) {
      const a = pageIndex(anchorId), b = pageIndex(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      selected.clear();
      for (let i = lo; i <= hi; i++) selected.add(state.pages[i].id);
    } else if (e.ctrlKey || e.metaKey) {
      selected.has(id) ? selected.delete(id) : selected.add(id);
      anchorId = id;
    } else {
      selected.clear(); selected.add(id); anchorId = id;
      setFocusedPage(id); scheduler.scrollToPage(id, "start");
    }
    applySelection();
  }

  function makeThumb(model, i) {
    const t = document.createElement("div");
    t.className = "thumb";
    t.dataset.id = model.id;
    t.draggable = true;
    const img = document.createElement("img");
    if (model.thumb) img.src = model.thumb;
    else img.style.cssText = "aspect-ratio:" + (model.size.w / model.size.h) + ";min-height:60px";
    const num = document.createElement("span");
    num.className = "tnum-badge";
    num.textContent = i + 1;
    const acts = document.createElement("div");
    acts.className = "tacts";
    acts.append(
      actBtn("rotate", "Rotate", (e) => { e.stopPropagation(); rotate(model.id); }),
      actBtn("duplicate", "Duplicate", (e) => { e.stopPropagation(); duplicate(model.id); }),
      actBtn("trash", "Delete", (e) => { e.stopPropagation(); del(model.id); }, "del"),
    );
    t.append(img, num, acts);

    t.addEventListener("click", (e) => onThumbClick(model.id, e));
    t.addEventListener("dragstart", () => { dragId = model.id; t.classList.add("dragging"); });
    t.addEventListener("dragend", () => { dragId = null; t.classList.remove("dragging"); strip.querySelectorAll(".thumb").forEach((x) => x.classList.remove("drop-before")); });
    t.addEventListener("dragover", (e) => { e.preventDefault(); t.classList.add("drop-before"); });
    t.addEventListener("dragleave", () => t.classList.remove("drop-before"));
    t.addEventListener("drop", (e) => { e.preventDefault(); t.classList.remove("drop-before"); if (dragId && dragId !== model.id) moveBefore(dragId, model.id); });
    return t;
  }

  function moveBefore(srcId, targetId) {
    const before = state.pages.map((p) => p.id);
    const order = before.filter((id) => id !== srcId);
    order.splice(order.indexOf(targetId), 0, srcId);
    reorderPages(order);
    history.record({ type: "structural", label: "Reorder pages", do: () => reorderPages(order), undo: () => reorderPages(before) });
  }

  function rotate(id) {
    const p = getPage(id); if (!p) return;
    const r0 = p.rotation, r1 = (p.rotation + 90) % 360;
    const apply = (r) => { updatePage(id, { rotation: r }); scheduler.invalidate(id); refreshThumb(id); bus.emit("page:focused", state.view.focusedPageId); };
    apply(r1);
    history.record({ type: "structural", label: "Rotate page", do: () => apply(r1), undo: () => apply(r0) });
  }

  function duplicate(id) {
    const p = getPage(id); if (!p) return;
    const idx = pageIndex(id);
    const clone = makePageModel({
      srcIndex: p.srcIndex, srcDoc: p.srcDoc, rotation: p.rotation, intrinsicRotate: p.intrinsicRotate,
      size: { ...p.size }, annotations: JSON.parse(JSON.stringify(p.annotations)),
      redactions: p.redactions.map((r) => ({ ...r })),
    });
    insertPageAt(idx + 1, clone);
    history.record({ type: "structural", label: "Duplicate page", do: () => { if (!getPage(clone.id)) insertPageAt(pageIndex(id) + 1, clone); }, undo: () => removePage(clone.id) });
  }

  async function del(id) {
    if (state.pages.length <= 1) { ctx.util.toast("A document needs at least one page", "error"); return; }
    if (!(await confirmDialog({ title: "Delete page", message: "Delete this page?", okLabel: "Delete", danger: true }))) return;
    const idx = pageIndex(id), model = getPage(id);
    removePage(id);
    history.record({ type: "structural", label: "Delete page", do: () => removePage(id), undo: () => insertPageAt(idx, model) });
  }

  /* ---- batch operations ---- */
  function selectedInOrder() {
    return state.pages.filter((p) => selected.has(p.id)).map((p) => p.id);
  }
  function batchRotate() {
    history.beginBatch();
    selectedInOrder().forEach((id) => rotate(id));
    history.endBatch("Rotate pages");
  }
  async function batchDelete() {
    const ids = selectedInOrder();
    if (ids.length >= state.pages.length) { ctx.util.toast("Can't delete every page", "error"); return; }
    if (!(await confirmDialog({ title: "Delete pages", message: `Delete ${ids.length} selected page(s)?`, okLabel: "Delete", danger: true }))) return;
    const removed = ids.map((id) => ({ idx: pageIndex(id), model: getPage(id) })).sort((a, b) => b.idx - a.idx);
    history.beginBatch();
    removed.forEach(({ idx, model }) => {
      removePage(model.id);
      history.record({ type: "structural", label: "Delete page", do: () => removePage(model.id), undo: () => insertPageAt(idx, model) });
    });
    history.endBatch("Delete pages");
    selected.clear(); anchorId = null; applySelection();
  }
  function batchExtract() {
    bus.emit("action:extract-pages", selectedInOrder());
  }

  function btn(icon, label, onClick) {
    const b = document.createElement("button");
    b.className = "btn ghost"; b.style.flex = "1";
    b.innerHTML = iconSvg(icon) + `<span>${label}</span>`;
    b.addEventListener("click", onClick);
    return b;
  }
  function miniBtn(icon, label, onClick, cls = "") {
    const b = document.createElement("button");
    b.className = "btn ghost"; b.style.cssText = "height:28px;padding:0 8px;font-size:12px";
    if (cls === "del") b.classList.add("danger");
    b.innerHTML = iconSvg(icon) + `<span>${label}</span>`;
    b.addEventListener("click", onClick);
    return b;
  }
  function actBtn(icon, tip, onClick, cls = "") {
    const b = document.createElement("button");
    b.className = cls; b.title = tip;
    b.innerHTML = iconSvg(icon);
    b.addEventListener("click", onClick);
    return b;
  }
}
