/* Owns the EditorContext, routes pointer/keyboard intent to the active tool,
 * and configures each live Fabric canvas for the active tool. */
import { state, bus, setTool, setSelection } from "./state.js";
import * as scheduler from "./render-scheduler.js";
import { setHostHooks } from "./page-host.js";
import { createContext } from "./editor-context.js";
import { getTool } from "../tools/registry.js";

const fabric = window.fabric;
let ctx = null;
let current = null;

const api = { activate, notifyOptionsChanged, getActiveTool: () => current };

export function getCtx() { return ctx; }
export function getActiveTool() { return current; }

export function initToolManager({ util }) {
  ctx = createContext({ tm: api, util });
  setHostHooks({ onMount: onHostMount, onDemote: onHostDemote });
  return ctx;
}

function defaultOptions(tool) {
  const o = {};
  (tool.options || []).forEach((s) => (o[s.key] = s.default));
  return o;
}

export function activate(id, options) {
  const tool = getTool(id);
  if (!tool) { console.warn("[tools] unknown tool", id); return; }
  if (current && current.deactivate) { try { current.deactivate(ctx); } catch (e) { console.error(e); } }
  if (current && current.usesTextLayer) toggleMarkup(false);

  current = tool;
  const opts = options || defaultOptions(tool);
  setTool(id, opts);

  for (const host of scheduler.getHosts().values()) if (host.mounted) applyToolToCanvas(host);
  if (tool.usesTextLayer) toggleMarkup(true);
  for (const host of scheduler.getHosts().values()) host.el.classList.toggle("forms-active", id === "select");
  if (tool.activate) { try { tool.activate(ctx); } catch (e) { console.error(e); } }
  if (tool.isInstant) setTimeout(() => activate("select"), 0);
}

function toggleMarkup(on) {
  for (const host of scheduler.getHosts().values()) host.el.classList.toggle("markup-active", on);
}

function applyToolToCanvas(host) {
  const canvas = host.fabric;
  const tool = current;
  if (!canvas || !tool) return;
  const opts = ctx.getOptions();
  canvas.isDrawingMode = !!tool.drawing;
  canvas.selection = !!tool.usesSelection;
  canvas.skipTargetFind = !tool.usesSelection;
  canvas.forEachObject((o) => { o.selectable = !!tool.usesSelection; o.evented = !!tool.usesSelection; });
  if (tool.drawing && tool.brush) canvas.freeDrawingBrush = tool.brush(opts, canvas, fabric);
  canvas.defaultCursor = tool.cursor || "default";
  canvas.hoverCursor = tool.usesSelection ? "move" : (tool.cursor || "default");
  canvas.requestRenderAll();
}

export function notifyOptionsChanged(opts) {
  for (const host of scheduler.getHosts().values()) if (host.mounted) applyToolToCanvas(host);
  if (current && current.onOptionsChanged) { try { current.onOptionsChanged(opts, ctx); } catch (e) { console.error(e); } }
}

function onHostMount(host) {
  wireCanvas(host);
  ctx.noteBaseline(host.model.id);
  if (current) {
    applyToolToCanvas(host);
    if (current.usesTextLayer) host.el.classList.add("markup-active");
    host.el.classList.toggle("forms-active", current.id === "select");
  }
}
function onHostDemote() { /* model already synced in page-host.demoteToStatic */ }

function wireCanvas(host) {
  const canvas = host.fabric;
  const pageRef = () => ({ pageId: host.model.id, canvas, model: host.model });
  const mkPtr = (opt) => {
    const p = canvas.getPointer(opt.e);
    const e = opt.e;
    return { x: p.x, y: p.y, e, shift: !!e.shiftKey, alt: !!e.altKey, ctrl: !!(e.ctrlKey || e.metaKey) };
  };
  const routable = () => current && !current.usesSelection && !current.drawing;

  canvas.on("mouse:down", (opt) => {
    if (opt.e && opt.button === 3) { bus.emit("page:contextmenu", { pageId: host.model.id, target: opt.target, e: opt.e }); return; }
    if (routable() && current.onPointerDown) { ctx._touch(host.model.id); current.onPointerDown(pageRef(), mkPtr(opt), ctx); }
  });
  canvas.on("mouse:move", (opt) => { if (routable() && current.onPointerMove) current.onPointerMove(pageRef(), mkPtr(opt), ctx); });
  canvas.on("mouse:up", (opt) => { if (routable() && current.onPointerUp) current.onPointerUp(pageRef(), mkPtr(opt), ctx); });

  canvas.on("path:created", (opt) => {
    if (!current || !current.drawing) return;
    const path = opt.path;
    if (!path.toolId) path.toolId = current.id;
    if (!path.id) path.id = "ob_" + Math.random().toString(36).slice(2, 9);
    ctx._touch(host.model.id);
    if (current.onPathCreated) current.onPathCreated(pageRef(), path, ctx);
    else ctx.commitFor(host.model.id, "Draw");
  });

  const onSel = () => ctx._syncSelection(canvas, host.model.id);
  canvas.on("selection:created", onSel);
  canvas.on("selection:updated", onSel);
  canvas.on("selection:cleared", () => { if (state.selection.pageId === host.model.id) setSelection(host.model.id, []); });

  canvas.on("object:modified", () => ctx.commitFor(host.model.id, "Modify"));
  canvas.on("text:editing:exited", (e) => {
    const o = e && e.target;
    if (o && (o.type === "i-text" || o.type === "textbox") && !(o.text || "").trim()) {
      canvas.remove(o); // discard empty text boxes (Acrobat behavior)
    }
    ctx.commitFor(host.model.id, "Text");
  });

  canvas.on("mouse:dblclick", (opt) => {
    const o = opt.target;
    if (o && o.meta && o.meta.kind === "note") editNote(host, o);
  });
}

async function editNote(host, obj) {
  const text = await (ctx.util.prompt
    ? ctx.util.prompt({ title: "Edit note", label: "Comment", multiline: true, value: obj.meta.text || "" })
    : Promise.resolve(window.prompt("Note text:", obj.meta.text || "")));
  if (text == null) return;
  obj.meta = { ...obj.meta, text };
  host.fabric.requestRenderAll();
  ctx.commitFor(host.model.id, "Edit note");
  bus.emit("comments:changed", { pageId: host.model.id });
}
