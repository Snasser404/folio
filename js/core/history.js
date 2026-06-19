/* Global undo/redo timeline.
 * Entry kinds:
 *   { type:'anno', pageId, before, after, label }   // before/after = Fabric JSON strings
 *   { type:'structural', do, undo, label }          // page-list ops
 *   { type:'batch', entries, label }                // merged multi-op (one undo step) */
import { state, bus, getPage, setSelection } from "./state.js";
import * as scheduler from "./render-scheduler.js";

const past = [];
const future = [];
const CAP = 100;
let batchDepth = 0;
let batchEntries = [];

export function record(entry) {
  if (entry.type === "anno" && entry.before === entry.after) return;
  if (batchDepth > 0) { batchEntries.push(entry); return; }
  past.push(entry);
  if (past.length > CAP) past.shift();
  future.length = 0;
  emit();
}

export function beginBatch() { batchDepth++; }
export function endBatch(label) {
  batchDepth = Math.max(0, batchDepth - 1);
  if (batchDepth === 0 && batchEntries.length) {
    const entries = batchEntries; batchEntries = [];
    past.push(entries.length === 1 ? entries[0] : { type: "batch", entries, label });
    if (past.length > CAP) past.shift();
    future.length = 0;
    emit();
  }
}

export async function undo() {
  const e = past.pop();
  if (!e) return;
  future.push(e);
  await apply(e, "undo");
  emit();
}
export async function redo() {
  const e = future.pop();
  if (!e) return;
  past.push(e);
  await apply(e, "redo");
  emit();
}

async function apply(entry, dir) {
  if (entry.type === "batch") {
    const list = dir === "undo" ? [...entry.entries].reverse() : entry.entries;
    for (const e of list) await applyOne(e, dir);
  } else {
    await applyOne(entry, dir);
  }
}

async function applyOne(e, dir) {
  if (e.type === "anno") {
    await applyAnno(e.pageId, dir === "undo" ? e.before : e.after);
  } else if (e.type === "structural") {
    dir === "undo" ? e.undo() : e.do();
  }
}

async function applyAnno(pageId, json) {
  const page = getPage(pageId);
  if (!page) return;
  page.annotations = JSON.parse(json);
  setSelection(null, []);
  const host = scheduler.getHost(pageId);
  if (host && host.mounted) {
    const fc = host.fabric;
    fc._suspendHistory = true;
    fc.discardActiveObject();
    await new Promise((res) =>
      fc.loadFromJSON(page.annotations, () => { fc.renderAll(); fc._suspendHistory = false; res(); })
    );
    bus.emit("history:reloaded", { pageId });
  } else {
    scheduler.invalidate(pageId);
  }
  scheduler.scrollToPage(pageId, "center");
}

function emit() { bus.emit("history:changed", { canUndo: past.length > 0, canRedo: future.length > 0 }); }
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;
export function clear() { past.length = 0; future.length = 0; batchEntries = []; batchDepth = 0; emit(); }
