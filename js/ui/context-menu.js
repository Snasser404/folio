/* Right-click context menu for canvas objects + copy/paste/duplicate. */
import { bus } from "../core/state.js";
import { iconSvg } from "./icon.js";
const fabric = window.fabric;

let clipboard = null;

export function initContextMenu(ctx) {
  const root = document.getElementById("flyoutRoot");

  bus.on("page:contextmenu", ({ pageId, target, e }) => {
    if (e && e.preventDefault) e.preventDefault();
    if (target && target.id) ctx.select(pageId, [target.id]);
    show(ctx, pageId, target, e);
  });

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    const page = ctx.getActivePage();
    if (!page) return;
    const editing = page.canvas.getActiveObject() && page.canvas.getActiveObject().isEditing;
    if (editing) return;
    const k = e.key.toLowerCase();
    if (k === "c") { copy(ctx, page); }
    else if (k === "x") { copy(ctx, page); del(ctx, page); }
    else if (k === "v") { e.preventDefault(); paste(ctx, page); }
  });

  function show(ctx, pageId, target, e) {
    root.innerHTML = "";
    const fly = document.createElement("div");
    fly.className = "flyout context-menu";
    const add = (label, icon, fn, disabled) => {
      const b = document.createElement("button");
      b.className = "flyout-item"; b.disabled = !!disabled;
      if (disabled) b.style.opacity = ".45";
      b.innerHTML = `${icon ? iconSvg(icon) : "<span style='width:16px'></span>"}<span>${label}</span>`;
      b.addEventListener("click", () => { root.innerHTML = ""; if (!disabled) fn(); });
      fly.appendChild(b);
    };
    const sep = () => { const s = document.createElement("div"); s.className = "flyout-sep"; fly.appendChild(s); };
    const page = { pageId, canvas: ctx.getCanvas(pageId) };

    if (target) {
      add("Copy", "duplicate", () => copy(ctx, page));
      add("Duplicate", "duplicate", () => { copy(ctx, page); paste(ctx, page); });
      sep();
      add("Bring to front", null, () => { ctx.getSelected(pageId).forEach((o) => o.bringToFront()); page.canvas.requestRenderAll(); ctx.commitFor(pageId, "Reorder"); });
      add("Send to back", null, () => { ctx.getSelected(pageId).forEach((o) => o.sendToBack()); page.canvas.requestRenderAll(); ctx.commitFor(pageId, "Reorder"); });
      sep();
      add("Delete", "trash", () => del(ctx, page));
    } else {
      add("Paste", null, () => paste(ctx, page), !clipboard);
      add("Select all", null, () => {
        const c = page.canvas; c.discardActiveObject();
        const objs = c.getObjects().filter((o) => o.selectable !== false);
        if (objs.length) { c.setActiveObject(new fabric.ActiveSelection(objs, { canvas: c })); c.requestRenderAll(); }
      });
    }

    root.appendChild(fly);
    const x = Math.min(e.clientX, window.innerWidth - fly.offsetWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - fly.offsetHeight - 8);
    fly.style.left = x + "px"; fly.style.top = y + "px";
    const onDoc = (ev) => { if (!ev.target.closest(".context-menu")) { root.innerHTML = ""; document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); } };
    const onEsc = (ev) => { if (ev.key === "Escape") { root.innerHTML = ""; document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); } };
    setTimeout(() => { document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onEsc); }, 0);
  }
}

function copy(ctx, page) {
  const objs = ctx.getSelected(page.pageId);
  if (!objs.length) return;
  clipboard = objs.map((o) => o.toObject(["id", "toolId", "meta"]));
  ctx.util.toast(`Copied ${objs.length} object${objs.length > 1 ? "s" : ""}`, "info", 1200);
}

function paste(ctx, page) {
  if (!clipboard || !clipboard.length) return;
  fabric.util.enlivenObjects(clipboard, (objs) => {
    ctx.beginBatch();
    const ids = [];
    objs.forEach((o) => {
      o.set({ left: (o.left || 0) + 20, top: (o.top || 0) + 20 });
      o.id = undefined;
      const id = ctx.addObject(page.pageId, o, { select: false });
      ids.push(id);
    });
    ctx.endBatch("Paste");
    ctx.commitFor(page.pageId, "Paste");
    ctx.select(page.pageId, ids);
  }, "fabric");
}

function del(ctx, page) {
  const objs = ctx.getSelected(page.pageId);
  if (!objs.length) return;
  objs.slice().forEach((o) => page.canvas.remove(o));
  page.canvas.discardActiveObject(); page.canvas.requestRenderAll();
  ctx.commitFor(page.pageId, "Delete");
}
