/* Bootstrap: build the editor context, mount UI + panels, wire global actions. */
import {
  state, bus, openDoc, closeDoc, makePageModel, setFocusedPage, setActivePanel,
  insertPageAt, removePage, updatePage, getPage, pageIndex, setBusy, setDirty, appendSource, getSourceDoc, setHasForm,
} from "./core/state.js";
import * as scheduler from "./core/render-scheduler.js";
import { initToolManager, activate } from "./core/tool-manager.js";
import * as history from "./core/history.js";
import { exportPdf, pageToPng } from "./core/export-engine.js";
import { loadPdf, getMetadata } from "./core/pdf-engine.js";
import { hexToRgba, download } from "./core/util.js";
import { saveRecent, listRecent, getRecentBytes, clearRecent } from "./core/recent.js";
import { ocrPage } from "./core/ocr.js";
import { comparePdfs } from "./core/compare.js";
import { clearCache as clearSearchCache } from "./core/search.js";

import { initOverlays, toast, confirmDialog, promptDialog, modal, signatureDialog } from "./ui/toast.js";
import { initTheme } from "./ui/theme.js";
import { initToolbar } from "./ui/toolbar.js";
import { initContextbar } from "./ui/contextual-toolbar.js";
import { initZoom } from "./ui/zoom-control.js";
import { initStatusbar } from "./ui/statusbar.js";
import { initShortcuts } from "./ui/shortcuts.js";
import { initDnd } from "./ui/dnd.js";
import { initMenus } from "./ui/menus.js";
import { initContextMenu } from "./ui/context-menu.js";
import { initTooltips } from "./ui/tooltip.js";
import { initPanelResize } from "./ui/panel-resize.js";
import { initGate } from "./saas/gate.js";

import { initThumbnails } from "./panels/thumbnails.js";
import { initSearchPanel } from "./panels/search-panel.js";
import { initOutlinePanel } from "./panels/outline-panel.js";
import { initCommentsPanel } from "./panels/comments-panel.js";
import { initPropertiesPanel } from "./panels/properties-panel.js";

let ctx = null;

function boot() {
  initOverlays();
  initTooltips();
  initTheme();
  const util = {
    color: hexToRgba,
    busy: (on, txt) => setBusy(on, txt),
    toast,
    prompt: promptDialog,
    confirm: confirmDialog,
    signatureDialog,
  };
  ctx = initToolManager({ util });

  scheduler.initScheduler({ pageList: document.getElementById("pageList"), viewport: document.getElementById("viewport") });

  initToolbar(ctx);
  initContextbar(ctx);
  initZoom();
  initStatusbar();
  initShortcuts(ctx);
  initDnd();
  initMenus(ctx);
  initContextMenu(ctx);

  initThumbnails(ctx);
  initSearchPanel(ctx);
  initOutlinePanel(ctx);
  initCommentsPanel(ctx);
  initPropertiesPanel(ctx);

  initTabs();
  initPanelResize();
  initRecents();
  wireActions();
  activate("select");
  refreshRecents();

  // Debug handle (harmless; useful for diagnostics)
  window.__PE = { state, bus, scheduler, history, exportPdf, openFile, ctx };

  initGate(); // paywall (no-op in open mode)
}

function initTabs() {
  const tabs = [...document.querySelectorAll(".tab[data-tab]")];
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
    t.classList.add("active"); t.setAttribute("aria-selected", "true");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === t.dataset.tab));
    setActivePanel(t.dataset.tab);
  }));
}

function wireActions() {
  const fileInput = document.getElementById("fileInput");
  const mergeInput = document.getElementById("mergeInput");

  bus.on("action:open", () => fileInput.click());
  document.getElementById("openBtn2").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; });
  bus.on("action:open-file", (file) => openFile(file));

  bus.on("action:merge", () => mergeInput.click());
  mergeInput.addEventListener("change", (e) => { if (e.target.files[0]) appendPdf(e.target.files[0]); e.target.value = ""; });

  const annInput = document.getElementById("annInput");
  bus.on("action:export-annotations", exportAnnotations);
  bus.on("action:import-annotations", () => annInput.click());
  annInput.addEventListener("change", (e) => { if (e.target.files[0]) importAnnotations(e.target.files[0]); e.target.value = ""; });
  bus.on("action:extract-pages", extractPages);

  const compareInput = document.getElementById("compareInput");
  bus.on("action:compare", () => compareInput.click());
  compareInput.addEventListener("change", (e) => { if (e.target.files[0]) compareWith(e.target.files[0]); e.target.value = ""; });
  bus.on("action:ocr", ocrDocument);
  bus.on("action:sanitize", downloadSanitized);

  bus.on("action:save", save);
  bus.on("action:print", printDocument);
  bus.on("action:flatten", downloadFlattened);
  bus.on("action:undo", () => history.undo());
  bus.on("action:redo", () => history.redo());
  bus.on("action:delete", deleteSelected);
  bus.on("action:export-images", exportImages);
  bus.on("action:close", closeDocument);
  bus.on("action:add-blank", addBlank);
  bus.on("action:rotate-current", rotateCurrent);
  bus.on("action:delete-current", deleteCurrent);
  bus.on("action:properties", showProperties);
  bus.on("action:shortcuts", showShortcuts);
  bus.on("action:about", showAbout);

  document.getElementById("helpBtn").addEventListener("click", () => bus.emit("action:shortcuts"));
  document.getElementById("toggleLeft").addEventListener("click", () => document.getElementById("left").classList.toggle("collapsed"));
  document.getElementById("toggleRight").addEventListener("click", () => document.getElementById("right").classList.toggle("collapsed"));
}

/* ---- OCR (make scanned/image pages searchable) ---- */
async function ocrDocument() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Preparing OCR…");
  try {
    const targets = [];
    for (const m of state.pages) {
      if (m.srcIndex == null || m.ocr) continue;
      if ((m.intrinsicRotate + m.rotation) % 360 !== 0) continue; // unrotated only
      let nativeLen = 0;
      try { const p = await getSourceDoc(m).getPage(m.srcIndex + 1); const tc = await p.getTextContent(); nativeLen = tc.items.map((i) => i.str).join("").trim().length; } catch {}
      if (nativeLen < 5) targets.push(m);
    }
    if (!targets.length) { toast("No image pages found to OCR (all pages already have text).", "info"); return; }
    let done = 0;
    for (const m of targets) {
      m.ocr = await ocrPage(m, getSourceDoc(m), (p) => setBusy(true, `OCR page ${done + 1} of ${targets.length} — ${Math.round(p * 100)}%`));
      done++;
    }
    clearSearchCache();
    targets.forEach((m) => scheduler.invalidate(m.id));
    setDirty(true);
    toast(`OCR complete — ${done} page${done > 1 ? "s" : ""} are now searchable.`, "success");
  } catch (e) { console.error(e); toast("OCR failed: " + (e.message || e), "error"); }
  finally { setBusy(false); }
}

/* ---- Compare two PDFs (text diff) ---- */
async function compareWith(file) {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Comparing…");
  try {
    const other = new Uint8Array(await file.arrayBuffer());
    const res = await comparePdfs(state.doc.originalBytes, other);
    showCompareModal(res, file.name);
  } catch (e) { console.error(e); toast("Compare failed: " + e.message, "error"); }
  finally { setBusy(false); }
}
function showCompareModal(res, otherName) {
  const body = document.createElement("div");
  let html = `<p class="muted" style="margin-top:0">Comparing <b>${esc(state.doc.fileName)}</b> ↔ <b>${esc(otherName)}</b> · <span style="color:var(--success)">+${res.added} added</span>, <span style="color:var(--danger)">−${res.removed} removed</span></p>`;
  res.pages.forEach((pg) => {
    const changed = pg.added || pg.removed || pg.onlyA || pg.onlyB;
    const tag = pg.onlyB ? " (only in compared file)" : pg.onlyA ? " (only in original)" : "";
    html += `<div style="margin:10px 0;border-top:1px solid var(--border);padding-top:8px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Page ${pg.page}${tag}${changed ? "" : " — no changes"}</div>`;
    if (changed) html += `<div style="font-size:13px;line-height:1.6">` + pg.segs.map((s) =>
      s.type === "same" ? `${esc(s.text)} ` :
      s.type === "add" ? `<span style="background:var(--success-soft);color:var(--success)">${esc(s.text)} </span>` :
      `<span style="background:var(--danger-soft);color:var(--danger);text-decoration:line-through">${esc(s.text)} </span>`).join("") + `</div>`;
    html += `</div>`;
  });
  body.innerHTML = html;
  modal({ title: "Compare PDFs", bodyEl: body, width: 660, actions: [{ label: "Close", kind: "primary", value: true }] });
}

/* ---- Remove metadata (Protect) ---- */
async function downloadSanitized() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Removing metadata…");
  try {
    const bytes = await exportPdf({ sanitize: true });
    download(bytes, (state.doc.fileName || "document").replace(/\.pdf$/i, "") + "-clean.pdf");
    toast("Downloaded with metadata removed", "success");
  } catch (e) { console.error(e); toast("Failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

/* ---- recent files ---- */
function initRecents() {
  const card = document.querySelector("#emptyState .empty-card");
  if (!card || document.getElementById("recentBox")) return;
  const box = document.createElement("div");
  box.id = "recentBox"; box.className = "recent-box"; box.hidden = true;
  card.appendChild(box);
}
async function refreshRecents() {
  const box = document.getElementById("recentBox");
  if (!box) return;
  const items = await listRecent();
  if (!items.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<div class="recent-head">Recent files <button id="recentClear" class="linkbtn">Clear</button></div>`;
  const list = document.createElement("div");
  list.className = "recent-list";
  items.forEach((it) => {
    const b = document.createElement("button");
    b.className = "recent-item";
    b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><use href="#ic-open"/></svg><span class="rn">${esc(it.name)}</span><span class="rd">${fmtDate(it.date)}</span>`;
    b.addEventListener("click", async () => {
      const bytes = await getRecentBytes(it.id);
      if (bytes) openDocFromBytes(it.name, bytes, { remember: false });
      else toast("Could not load that file", "error");
    });
    list.appendChild(b);
  });
  box.appendChild(list);
  document.getElementById("recentClear").addEventListener("click", async () => { await clearRecent(); refreshRecents(); });
}
function fmtDate(ts) { const d = new Date(ts); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---- open / append ---- */
async function openFile(file) {
  if (!file) return;
  if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { toast("Please choose a PDF file", "error"); return; }
  await openDocFromBytes(file.name, await file.arrayBuffer(), { remember: true });
}

async function openDocFromBytes(name, buf, { remember = true } = {}) {
  setBusy(true, "Loading PDF…");
  try {
    const original = new Uint8Array(buf.slice(0));
    const pdfDoc = await loadPdf(new Uint8Array(buf.slice(0)));
    const pages = [];
    for (let i = 0; i < pdfDoc.numPages; i++) {
      const pg = await pdfDoc.getPage(i + 1);
      const vp = pg.getViewport({ scale: 1, rotation: 0 });
      pages.push(makePageModel({ srcIndex: i, srcDoc: 0, intrinsicRotate: pg.rotate || 0, size: { w: vp.width, h: vp.height } }));
    }
    let hasForm = false;
    try { const fo = await pdfDoc.getFieldObjects(); hasForm = !!(fo && Object.keys(fo).length); } catch {}
    history.clear();
    openDoc({ originalBytes: original, fileName: name, pdfDoc, pages });
    setHasForm(hasForm);
    document.getElementById("emptyState").hidden = true;
    scheduler.build();
    setFocusedPage(pages[0].id);
    activate("select");
    if (hasForm) toast("Fillable form detected — use the Select tool to fill fields, then Download.", "info", 4000);
    if (remember) saveRecent({ name, bytes: original }).then(refreshRecents);
  } catch (e) {
    console.error(e);
    toast("Could not open PDF: " + (e.message || e), "error");
  } finally { setBusy(false); }
}

async function appendPdf(file) {
  if (!state.doc.loaded) return openFile(file);
  setBusy(true, "Appending pages…");
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0));
    const pdfDoc = await loadPdf(new Uint8Array(buf.slice(0)));
    const srcDoc = appendSource(bytes, pdfDoc);
    let n = 0;
    for (let i = 0; i < pdfDoc.numPages; i++) {
      const pg = await pdfDoc.getPage(i + 1);
      const vp = pg.getViewport({ scale: 1, rotation: 0 });
      state.pages.push(makePageModel({ srcIndex: i, srcDoc, intrinsicRotate: pg.rotate || 0, size: { w: vp.width, h: vp.height } }));
      n++;
    }
    bus.emit("pages:changed", state.pages);
    setDirty(true);
    toast(`Appended ${n} page${n > 1 ? "s" : ""}`, "success");
  } catch (e) { console.error(e); toast("Append failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

/* ---- save / export ---- */
async function save() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Generating PDF…");
  try {
    const bytes = await exportPdf({ onProgress: (d, t) => setBusy(true, `Generating… ${d}/${t}`) });
    download(bytes, (state.doc.fileName || "document").replace(/\.pdf$/i, "") + "-edited.pdf");
    setDirty(false);
    toast("Downloaded edited PDF", "success");
  } catch (e) { console.error(e); toast("Export failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

async function extractPages(ids) {
  if (!ids || !ids.length) return;
  setBusy(true, "Extracting pages…");
  try {
    const bytes = await exportPdf({ pageIds: ids });
    download(bytes, (state.doc.fileName || "document").replace(/\.pdf$/i, "") + "-extract.pdf");
    toast(`Extracted ${ids.length} page${ids.length > 1 ? "s" : ""}`, "success");
  } catch (e) { console.error(e); toast("Extract failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

function exportAnnotations() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  scheduler.syncAll();
  const data = {
    app: "PDF Studio", version: 1, fileName: state.doc.fileName, pageCount: state.pages.length,
    pages: state.pages.map((p) => ({ annotations: p.annotations, redactions: p.redactions })),
    formValues: state.doc.formValues || {},
  };
  download(JSON.stringify(data), (state.doc.fileName || "document").replace(/\.pdf$/i, "") + ".annotations.json", "application/json");
  toast("Annotations exported", "success");
}

async function importAnnotations(file) {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.pages)) throw new Error("Not a valid annotations file");
    const n = Math.min(data.pages.length, state.pages.length);
    for (let i = 0; i < n; i++) {
      const pg = state.pages[i], src = data.pages[i];
      if (src.annotations) pg.annotations = src.annotations;
      if (src.redactions) pg.redactions = src.redactions;
      pg.thumb = null;
    }
    if (data.formValues) state.doc.formValues = { ...state.doc.formValues, ...data.formValues };
    history.clear();
    scheduler.reloadFromModel();   // model is authoritative — don't sync live canvases first
    bus.emit("pages:changed", state.pages);
    setDirty(true);
    toast(`Imported annotations for ${n} page${n > 1 ? "s" : ""}`, "success");
  } catch (e) { console.error(e); toast("Import failed: " + e.message, "error"); }
}

async function downloadFlattened() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Flattening…");
  try {
    const bytes = await exportPdf({ flattenAll: true, onProgress: (d, t) => setBusy(true, `Flattening… ${d}/${t}`) });
    download(bytes, (state.doc.fileName || "document").replace(/\.pdf$/i, "") + "-flat.pdf");
    setDirty(false);
    toast("Downloaded flattened PDF", "success");
  } catch (e) { console.error(e); toast("Flatten failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

async function printDocument() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Preparing to print…");
  try {
    const bytes = await exportPdf();
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const old = document.getElementById("printFrame");
    if (old) old.remove();
    const frame = document.createElement("iframe");
    frame.id = "printFrame";
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.src = url;
    frame.onload = () => setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch { window.open(url, "_blank"); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 400);
    document.body.appendChild(frame);
  } catch (e) { console.error(e); toast("Print failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

async function exportImages() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  setBusy(true, "Rendering images…");
  try {
    let i = 0;
    for (const model of state.pages) {
      i++;
      if (model.srcIndex == null) continue;
      const flat = await pageToPng(model, getSourceDoc(model), 2);
      download(flat.bytes, `page-${i}.png`, "image/png");
      await new Promise((r) => setTimeout(r, 250));
    }
    toast("Exported page images", "success");
  } catch (e) { console.error(e); toast("Image export failed: " + e.message, "error"); }
  finally { setBusy(false); }
}

/* ---- page ops ---- */
function addBlank() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  const ref = getPage(state.view.focusedPageId) || state.pages[state.pages.length - 1];
  const idx = ref ? pageIndex(ref.id) + 1 : state.pages.length;
  const m = makePageModel({ srcIndex: null, size: ref ? { ...ref.size } : { w: 612, h: 792 } });
  insertPageAt(idx, m);
  history.record({ type: "structural", label: "Add page", do: () => { if (!getPage(m.id)) insertPageAt(idx, m); }, undo: () => removePage(m.id) });
  setTimeout(() => scheduler.scrollToPage(m.id, "center"), 60);
}

function rotateCurrent() {
  const id = state.view.focusedPageId;
  const p = getPage(id); if (!p) return;
  const r0 = p.rotation, r1 = (p.rotation + 90) % 360;
  const apply = (r) => { updatePage(id, { rotation: r }); scheduler.invalidate(id); };
  apply(r1);
  history.record({ type: "structural", label: "Rotate page", do: () => apply(r1), undo: () => apply(r0) });
}

async function deleteCurrent() {
  if (state.pages.length <= 1) { toast("A document needs at least one page", "error"); return; }
  const id = state.view.focusedPageId; const p = getPage(id); if (!p) return;
  if (!(await confirmDialog({ title: "Delete page", message: "Delete the current page?", okLabel: "Delete", danger: true }))) return;
  const idx = pageIndex(id);
  removePage(id);
  history.record({ type: "structural", label: "Delete page", do: () => removePage(id), undo: () => insertPageAt(idx, p) });
}

function deleteSelected() {
  const page = ctx.getActivePage();
  if (!page) return;
  const objs = ctx.getSelected(page.pageId);
  if (!objs.length) return;
  objs.slice().forEach((o) => page.canvas.remove(o));
  page.canvas.discardActiveObject(); page.canvas.requestRenderAll();
  ctx.commitFor(page.pageId, "Delete");
}

async function closeDocument() {
  if (!state.doc.loaded) return;
  if (state.ui.dirty && !(await confirmDialog({ title: "Close document", message: "You have unsaved changes. Close without downloading?", okLabel: "Close", danger: true }))) return;
  closeDoc();
  document.getElementById("pageList").innerHTML = "";
  document.getElementById("emptyState").hidden = false;
  document.getElementById("docName").textContent = "";
  history.clear();
  refreshRecents();
}

/* ---- dialogs ---- */
async function showProperties() {
  if (!state.doc.loaded) { toast("Open a PDF first", "error"); return; }
  const meta = await getMetadata(state.doc.pdfDoc);
  const info = (meta && meta.info) || {};
  const rows = [
    ["File name", state.doc.fileName || "—"],
    ["Pages", state.pages.length],
    ["Title", info.Title || "—"],
    ["Author", info.Author || "—"],
    ["Subject", info.Subject || "—"],
    ["Producer", info.Producer || "—"],
    ["PDF version", info.PDFFormatVersion || (meta && meta.pdfFormatVersion) || "—"],
  ];
  const body = document.createElement("div");
  body.innerHTML = rows.map(([k, v]) => `<div class="row" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted">${k}</span><span>${String(v)}</span></div>`).join("");
  modal({ title: "Document properties", bodyEl: body, actions: [{ label: "Close", kind: "primary", value: true }] });
}

function showShortcuts() {
  const list = [
    ["V", "Select"], ["H", "Pan"], ["T", "Text"], ["U", "Markup text"], ["P", "Pen"], ["K", "Highlighter"],
    ["R / O / L / A", "Rectangle / Ellipse / Line / Arrow"], ["N", "Sticky note"],
    ["Ctrl+Z / Ctrl+Y", "Undo / Redo"], ["Ctrl+S", "Download"], ["Ctrl+O", "Open"],
    ["Ctrl+A", "Select all on page"], ["Delete", "Remove selection"], ["Esc", "Select tool"],
  ];
  const body = document.createElement("div");
  body.innerHTML = list.map(([k, v]) => `<div class="row" style="display:flex;justify-content:space-between;padding:5px 0"><span>${v}</span><kbd style="font-family:var(--font-mono);background:var(--surface-2);padding:2px 7px;border-radius:5px;border:1px solid var(--border)">${k}</kbd></div>`).join("");
  modal({ title: "Keyboard shortcuts", bodyEl: body, actions: [{ label: "Close", kind: "primary", value: true }] });
}

function showAbout() {
  modal({
    title: "About PDF Studio",
    bodyEl: `<p><strong>PDF Studio</strong> — a private, in-browser PDF editor.</p>
      <p class="muted">Everything runs locally; your files are never uploaded. Built with PDF.js, Fabric.js and pdf-lib.</p>`,
    actions: [{ label: "Close", kind: "primary", value: true }],
  });
}

/* warn on unload if dirty */
window.addEventListener("beforeunload", (e) => {
  if (state.ui.dirty) { e.preventDefault(); e.returnValue = ""; }
});

document.addEventListener("DOMContentLoaded", boot);
