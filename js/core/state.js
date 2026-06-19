/* Central application state + the only write API (mutators).
 * Each mutator emits exactly one bus event. */
import { createBus } from "./bus.js";
import { newPageId } from "./ids.js";

export const bus = createBus();

export const state = {
  doc: { originalBytes: null, fileName: "", pdfDoc: null, loaded: false },
  pages: [],
  selection: { pageId: null, objectIds: [] },
  view: {
    activeTool: "select",
    toolOptions: {},
    zoom: 1,
    fitMode: "width",      // 'width' | 'page' | 'actual' | 'custom'
    focusedPageId: null,
    theme: "light",
  },
  ui: {
    busy: false, busyText: "",
    activePanel: "thumbnails",
    leftOpen: true, rightOpen: true,
    dirty: false,
    search: { query: "", matches: [], activeMatch: -1 },
  },
};

/* ---- page model factory ---- */
export function makePageModel(props) {
  return Object.assign({
    id: newPageId(),
    srcIndex: null,            // index in its source pdf; null = blank/inserted
    srcDoc: 0,                 // which loaded source (0 = primary, 1.. = appended)
    rotation: 0,               // user rotation 0|90|180|270
    intrinsicRotate: 0,        // source page.rotate
    size: { w: 612, h: 792 },  // UNROTATED PDF points
    annotations: { version: "5.3.0", objects: [] },
    redactions: [],            // [{x,y,w,h}] PDF points, unrotated, y-up
    thumb: null,
    notes: [],                 // sticky-note metadata {objId, author, text, replies, status}
  }, props);
}

/* ---- lookups ---- */
export const getPage = (id) => state.pages.find((p) => p.id === id);
export const pageIndex = (id) => state.pages.findIndex((p) => p.id === id);
export const newId = newPageId;

/** The PDF.js document a page model was sourced from. */
export function getSourceDoc(model) {
  const s = state.doc.sources && state.doc.sources[model.srcDoc || 0];
  return s ? s.pdfDoc : state.doc.pdfDoc;
}
export function setHasForm(b) { state.doc.hasForm = b; bus.emit("form:detected", b); }
export function setFormValue(name, value) {
  if (!state.doc.formValues) state.doc.formValues = {};
  state.doc.formValues[name] = value;
  markDirty();
}

export function appendSource(bytes, pdfDoc) {
  if (!state.doc.sources) state.doc.sources = [{ bytes: state.doc.originalBytes, pdfDoc: state.doc.pdfDoc }];
  state.doc.sources.push({ bytes, pdfDoc });
  return state.doc.sources.length - 1;
}

/* ---- document ---- */
export function openDoc({ originalBytes, fileName, pdfDoc, pages }) {
  state.doc = { originalBytes, fileName, pdfDoc, loaded: true, sources: [{ bytes: originalBytes, pdfDoc }], hasForm: false, formValues: {} };
  state.pages = pages;
  state.selection = { pageId: null, objectIds: [] };
  state.ui.dirty = false;
  bus.emit("doc:opened", state.doc);
  bus.emit("pages:changed", state.pages);
}
export function closeDoc() {
  state.doc = { originalBytes: null, fileName: "", pdfDoc: null, loaded: false };
  state.pages = [];
  bus.emit("doc:closed", null);
}

/* ---- view ---- */
export function setTool(id, options) {
  state.view.activeTool = id;
  if (options) state.view.toolOptions = options;
  bus.emit("tool:changed", { id, options: state.view.toolOptions });
}
export function setToolOptions(opts) {
  state.view.toolOptions = opts;
  bus.emit("tool:options", opts);
}
export function setZoom(z) {
  state.view.zoom = Math.min(8, Math.max(0.1, z));
  bus.emit("view:zoom", state.view.zoom);
}
export function setFitMode(m) { state.view.fitMode = m; }
export function setTheme(t) {
  state.view.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("pe-theme", t); } catch {}
  bus.emit("theme:changed", t);
}
export function setFocusedPage(id) {
  if (state.view.focusedPageId === id) return;
  state.view.focusedPageId = id;
  bus.emit("page:focused", id);
}

/* ---- selection ---- */
export function setSelection(pgId, ids) {
  state.selection = { pageId: pgId, objectIds: ids || [] };
  bus.emit("selection:changed", state.selection);
}
export function clearSelection() { setSelection(null, []); }

/* ---- ui ---- */
export function setBusy(on, txt) {
  state.ui.busy = on; state.ui.busyText = txt || "";
  bus.emit("ui:busy", { on, txt: state.ui.busyText });
}
export function setDirty(d) { state.ui.dirty = d; bus.emit("doc:dirty", d); }
export const markDirty = () => setDirty(true);
export function setActivePanel(p) { state.ui.activePanel = p; bus.emit("panel:changed", p); }

/* ---- page mutators ---- */
export function setPages(pages) { state.pages = pages; bus.emit("pages:changed", pages); }
export function updatePage(id, patch) {
  const p = getPage(id);
  if (!p) return;
  Object.assign(p, patch);
  bus.emit("page:updated", { id, patch });
}
export function reorderPages(orderedIds) {
  const map = new Map(state.pages.map((p) => [p.id, p]));
  state.pages = orderedIds.map((id) => map.get(id)).filter(Boolean);
  bus.emit("pages:reordered", orderedIds);
  bus.emit("pages:changed", state.pages);
  markDirty();
}
export function insertPageAt(index, model) {
  state.pages.splice(index, 0, model);
  bus.emit("pages:changed", state.pages);
  markDirty();
}
export function removePage(id) {
  const i = pageIndex(id);
  if (i >= 0) { state.pages.splice(i, 1); bus.emit("pages:changed", state.pages); markDirty(); }
}
