/* Global keyboard shortcuts. */
import { bus } from "../core/state.js";
import { TOOLS } from "../tools/registry.js";

const toolKeys = {};
TOOLS.forEach((t) => { if (t.shortcut && t.shortcut.length === 1) toolKeys[t.shortcut] = t.id; });

export function initShortcuts(ctx) {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
    const page = ctx.getActivePage();
    const editing = page && page.canvas.getActiveObject() && page.canvas.getActiveObject().isEditing;
    if (typing || editing) {
      if (e.key === "Escape" && editing) page.canvas.getActiveObject().exitEditing();
      return;
    }

    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); bus.emit(e.shiftKey ? "action:redo" : "action:undo"); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); bus.emit("action:redo"); return; }
    if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); bus.emit("action:save"); return; }
    if (meta && e.key.toLowerCase() === "p") { e.preventDefault(); bus.emit("action:print"); return; }
    if (meta && e.key.toLowerCase() === "o") { e.preventDefault(); bus.emit("action:open"); return; }
    if (meta && (e.key === "=" || e.key === "+")) { e.preventDefault(); bus.emit("action:zoom-in"); return; }
    if (meta && e.key === "-") { e.preventDefault(); bus.emit("action:zoom-out"); return; }
    if (meta && e.key.toLowerCase() === "a") {
      if (page) { e.preventDefault(); const c = page.canvas; c.discardActiveObject();
        const objs = c.getObjects().filter((o) => o.selectable !== false);
        if (objs.length) { c.setActiveObject(new window.fabric.ActiveSelection(objs, { canvas: c })); c.requestRenderAll(); } }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") { deleteSelected(ctx); return; }
    if (e.key === "Escape") { ctx.setActiveTool("select"); return; }

    if (!meta && toolKeys[e.key]) { bus.emit("shortcut:tool", toolKeys[e.key]); ctx.setActiveTool(toolKeys[e.key]); }
  });
}

function deleteSelected(ctx) {
  const page = ctx.getActivePage();
  if (!page) return;
  const objs = ctx.getSelected(page.pageId);
  if (!objs.length) return;
  objs.slice().forEach((o) => page.canvas.remove(o));
  page.canvas.discardActiveObject();
  page.canvas.requestRenderAll();
  ctx.commitFor(page.pageId, "Delete");
}
