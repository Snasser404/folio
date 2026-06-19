/* PageHost: one continuous-scroll page = stacked raster canvas (pdf.js) +
 * text layer (selection/search) + Fabric overlay (editing).
 *
 * Lifecycle: created (spacer/skeleton) -> rastered -> mounted (live Fabric).
 * Annotations source of truth = model.annotations (Fabric JSON). A mounted
 * host's live canvas is synced back to the model on demote/serialize. */
import { state, setFormValue } from "./state.js";
import { getPage, renderTextLayer } from "./pdf-engine.js";

const fabric = window.fabric;

/** Fabric backstore scale: 1 PDF point = BASE overlay units. Overlay coords
 *  are therefore (pt * BASE); divide by BASE to get PDF points. */
export const BASE = 2;

/* ---- one-time Fabric configuration ---- */
const _toObject = fabric.Object.prototype.toObject;
fabric.Object.prototype.toObject = function (extra) {
  return _toObject.call(this, ["id", "toolId", "meta"].concat(extra || []));
};
Object.assign(fabric.Object.prototype, {
  transparentCorners: false, cornerStyle: "circle", cornerSize: 10,
  cornerColor: "#4f46e5", cornerStrokeColor: "#ffffff",
  borderColor: "#4f46e5", borderScaleFactor: 1.5, padding: 2, objectCaching: false,
});
fabric.Object.prototype.controls.mtr && (fabric.Object.prototype.controls.mtr.offsetY = -28);

export function configureHandles(canvas) {
  canvas.set({
    selectionColor: "rgba(79,70,229,0.12)",
    selectionBorderColor: "#4f46e5",
    selectionLineWidth: 1,
  });
}

/* ---- host hooks (wired by app to the tool-manager) ---- */
let hooks = { onMount: null, onDemote: null };
export function setHostHooks(h) { hooks = { ...hooks, ...h }; }

/* ---- geometry helpers ---- */
export const effRot = (m) => ((m.intrinsicRotate || 0) + (m.rotation || 0)) % 360;
export function effDims(m) {
  const r = effRot(m);
  return (r === 90 || r === 270) ? { w: m.size.h, h: m.size.w } : { w: m.size.w, h: m.size.h };
}
export function displayDims(m, zoom) {
  const e = effDims(m);
  return { w: Math.round(e.w * zoom), h: Math.round(e.h * zoom) };
}

/* ---- create the DOM scaffold (no rendering yet) ---- */
export function createPageHost(model) {
  const el = document.createElement("div");
  el.className = "page-host";
  el.dataset.pageId = model.id;

  const rasterCanvas = document.createElement("canvas");
  rasterCanvas.className = "raster-layer";

  const textLayerEl = document.createElement("div");
  textLayerEl.className = "text-layer";

  const formLayerEl = document.createElement("div");
  formLayerEl.className = "form-layer";

  const fabricEl = document.createElement("canvas");
  fabricEl.className = "fabric-layer";

  const skeleton = document.createElement("div");
  skeleton.className = "page-skeleton";

  const caption = document.createElement("div");
  caption.className = "page-caption";

  el.append(rasterCanvas, textLayerEl, formLayerEl, fabricEl, skeleton, caption);

  const host = {
    model, el, rasterCanvas, textLayerEl, formLayerEl, fabricEl, skeleton, caption,
    fabric: null, staticEl: null,
    rastered: false, mounted: false, textLayerBuilt: false, formLayerBuilt: false,
    renderToken: 0, _renderTask: null, rasterScale: 0,
  };
  resize(host, state.view.zoom);
  return host;
}

export function resize(host, zoom) {
  const disp = displayDims(host.model, zoom);
  host.el.style.width = disp.w + "px";
  host.el.style.height = disp.h + "px";
  if (host.rastered) {
    host.rasterCanvas.style.width = disp.w + "px";
    host.rasterCanvas.style.height = disp.h + "px";
  }
  if (host.staticEl) { host.staticEl.style.width = disp.w + "px"; host.staticEl.style.height = disp.h + "px"; }
  applyTextLayerTransform(host, zoom);
  if (host.fabric) host.fabric.setDimensions({ width: disp.w + "px", height: disp.h + "px" }, { cssOnly: true });
}

function applyTextLayerTransform(host, zoom) {
  const t = `scale(${zoom / BASE})`;
  host.textLayerEl.style.transformOrigin = "0 0";
  host.textLayerEl.style.transform = t;
  host.formLayerEl.style.transformOrigin = "0 0";
  host.formLayerEl.style.transform = t;
}

/* ---- rasterize the pdf page + build text layer ---- */
export async function rasterize(host, pdfDoc, zoom) {
  const m = host.model;
  const token = ++host.renderToken;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = zoom * dpr;
  host.rasterScale = scale;
  host.rasterZoom = zoom;
  const rc = host.rasterCanvas;
  const disp = displayDims(m, zoom);

  try {
    if (m.srcIndex != null && pdfDoc) {
      const page = await getPage(pdfDoc, m.srcIndex);
      if (token !== host.renderToken) return;
      const viewport = page.getViewport({ scale, rotation: effRot(m) });
      rc.width = Math.round(viewport.width);
      rc.height = Math.round(viewport.height);
      const ctx = rc.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, rc.width, rc.height);
      if (host._renderTask) { try { host._renderTask.cancel(); } catch {} }
      const task = page.render({ canvasContext: ctx, viewport });
      host._renderTask = task;
      await task.promise;
      if (token !== host.renderToken) return;
      // Don't await these — pdf.js text-layer rendering uses rAF and can stall in a
      // backgrounded tab; the raster/mount must not depend on it.
      if (!host.textLayerBuilt) {
        if (m.ocr && m.ocr.words && m.ocr.words.length) buildOcrTextLayer(host);
        else buildTextLayer(host, page, token);
      }
      if (state.doc.hasForm && !host.formLayerBuilt) buildFormLayer(host, page, token);
    } else {
      const e = effDims(m);
      rc.width = Math.round(e.w * scale); rc.height = Math.round(e.h * scale);
      const ctx = rc.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, rc.width, rc.height);
    }
  } catch (err) {
    if (err && err.name === "RenderingCancelledException") return;
    console.error("[page-host] rasterize failed", err);
    return;
  }

  rc.style.width = disp.w + "px"; rc.style.height = disp.h + "px";
  host.rastered = true;
  host.skeleton.hidden = true;
  applyTextLayerTransform(host, zoom);
  if (!host.mounted) renderStaticPreview(host);
}

async function buildTextLayer(host, pdfPage, token) {
  const tl = host.textLayerEl;
  tl.innerHTML = "";
  const viewport = pdfPage.getViewport({ scale: BASE, rotation: effRot(host.model) });
  tl.style.width = viewport.width + "px";
  tl.style.height = viewport.height + "px";
  tl.style.setProperty("--scale-factor", BASE);
  try {
    const tc = await pdfPage.getTextContent();
    if (token != null && token !== host.renderToken) return;
    const textDivs = await renderTextLayer(tc, tl, viewport);
    if (token != null && token !== host.renderToken) { tl.innerHTML = ""; return; }
    host.textLayerBuilt = true;
    // Tag each span so the Edit-text tool can reproduce the EXACT typeface.
    // PDF.js only writes the generic category (serif/sans/mono) to the span's
    // CSS font-family, but it ALSO registers the embedded font in document.fonts
    // under its `loadedName` (== item.fontName, e.g. "g_d0_f1"). We stash that
    // real name (+ weight/style) so the editable box can use the genuine glyphs.
    try {
      const styles = tc.styles || {};
      for (let i = 0; i < tc.items.length && i < textDivs.length; i++) {
        const it = tc.items[i], sp = textDivs[i];
        if (!sp || !it.fontName) continue;
        const st = styles[it.fontName];
        if (st && st.fontFamily) sp.dataset.pfontfam = st.fontFamily;     // generic category
        sp.dataset.ploaded = it.fontName;                                 // real FontFace family
        try {
          if (pdfPage.commonObjs.has(it.fontName)) {
            const fo = pdfPage.commonObjs.get(it.fontName);
            if (fo) {
              if (fo.loadedName) sp.dataset.ploaded = fo.loadedName;
              const nm = fo.name || fo.loadedName; if (nm) sp.dataset.pname = nm;
              if (fo.bold) sp.dataset.pbold = "1";
              if (fo.italic) sp.dataset.pitalic = "1";
            }
          }
        } catch {}
      }
    } catch {}
  } catch (e) { /* image-only page: no text layer */ }
}

export function hasTextLayer(host) {
  return host.textLayerBuilt && host.textLayerEl.childElementCount > 0;
}

/* Build a selectable text layer from OCR words (for image/scanned pages). */
function buildOcrTextLayer(host) {
  const m = host.model;
  const tl = host.textLayerEl;
  tl.innerHTML = "";
  const e = effDims(m);
  tl.style.width = e.w * BASE + "px";
  tl.style.height = e.h * BASE + "px";
  const ph = m.size.h;
  m.ocr.words.forEach((w) => {
    const sp = document.createElement("span");
    sp.textContent = w.str;
    sp.style.left = w.x * BASE + "px";
    sp.style.top = (ph - (w.y + w.h)) * BASE + "px";
    sp.style.fontSize = Math.max(6, w.h * BASE) + "px";
    tl.appendChild(sp);
  });
  host.textLayerBuilt = true;
}

/* ---- interactive AcroForm field layer ---- */
async function buildFormLayer(host, pdfPage, token) {
  const fl = host.formLayerEl;
  fl.innerHTML = "";
  const viewport = pdfPage.getViewport({ scale: BASE, rotation: effRot(host.model) });
  fl.style.width = viewport.width + "px";
  fl.style.height = viewport.height + "px";
  let annots;
  try { annots = await pdfPage.getAnnotations({ intent: "display" }); }
  catch { return; }
  if (token != null && token !== host.renderToken) return;
  for (const a of annots) {
    if (a.subtype !== "Widget" || !a.fieldName) continue;
    const el = makeFieldEl(a);
    if (!el) continue;
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
    const left = Math.min(x1, x2), top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    el.style.left = left + "px"; el.style.top = top + "px";
    el.style.width = w + "px"; el.style.height = h + "px";
    if (el.tagName !== "INPUT" || el.type === "text") el.style.fontSize = Math.max(8, Math.min(h * 0.62, 28)) + "px";
    fl.appendChild(el);
  }
  host.formLayerBuilt = true;
}

function makeFieldEl(a) {
  const name = a.fieldName;
  const stored = state.doc.formValues || {};
  const has = name in stored;
  if (a.fieldType === "Tx") {
    const el = a.multiLine ? document.createElement("textarea") : document.createElement("input");
    if (!a.multiLine) el.type = "text";
    el.className = "ff";
    el.value = has ? stored[name] : (a.fieldValue || "");
    el.readOnly = !!a.readOnly;
    el.maxLength = a.maxLen > 0 ? a.maxLen : 524288;
    el.addEventListener("input", () => setFormValue(name, el.value));
    return el;
  }
  if (a.fieldType === "Btn") {
    if (a.radioButton) {
      const el = document.createElement("input");
      el.type = "radio"; el.className = "ff ff-check"; el.name = name;
      const ev = a.buttonValue || a.exportValue || "On";
      el.value = ev;
      el.checked = has ? stored[name] === ev : a.fieldValue === ev;
      el.addEventListener("change", () => { if (el.checked) setFormValue(name, ev); });
      return el;
    }
    if (a.checkBox) {
      const el = document.createElement("input");
      el.type = "checkbox"; el.className = "ff ff-check";
      const on = has ? !!stored[name] : (a.fieldValue && a.fieldValue !== "Off");
      el.checked = !!on;
      el.addEventListener("change", () => setFormValue(name, el.checked));
      return el;
    }
    return null; // push buttons: skip
  }
  if (a.fieldType === "Ch") {
    const el = document.createElement("select");
    el.className = "ff";
    (a.options || []).forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.exportValue != null ? o.exportValue : o.displayValue;
      opt.textContent = o.displayValue != null ? o.displayValue : o.exportValue;
      el.appendChild(opt);
    });
    const cur = has ? stored[name] : (Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue);
    if (cur != null) el.value = cur;
    el.addEventListener("change", () => setFormValue(name, el.value));
    return el;
  }
  return null;
}

export function hasFormLayer(host) { return host.formLayerBuilt && host.formLayerEl.childElementCount > 0; }

/* ---- mount a live Fabric canvas ---- */
export function mountFabric(host) {
  if (host.mounted) return host.fabric;
  const m = host.model;
  const e = effDims(m);
  const W0 = Math.round(e.w * BASE), H0 = Math.round(e.h * BASE);

  const fc = new fabric.Canvas(host.fabricEl, {
    enableRetinaScaling: false,
    preserveObjectStacking: true,
    backgroundColor: "transparent",
    selection: false,
    fireRightClick: true,
    stopContextMenu: true,
  });
  fc.setDimensions({ width: W0, height: H0 });
  const disp = displayDims(m, state.view.zoom);
  fc.setDimensions({ width: disp.w + "px", height: disp.h + "px" }, { cssOnly: true });
  configureHandles(fc);
  host.fabric = fc;
  host.mounted = true;
  host.pageId = m.id;

  fc._suspendHistory = true;
  fc.loadFromJSON(m.annotations || { objects: [] }, () => {
    if (host.fabric !== fc || !host.mounted) return; // demoted before load finished
    fc.renderAll();
    fc._suspendHistory = false;
    if (host.staticEl) host.staticEl.hidden = true;
    if (hooks.onMount) hooks.onMount(host);
  });
  return fc;
}

/** Serialize the live canvas back into the model (without demoting). */
export function syncToModel(host) {
  if (host.mounted && host.fabric) host.model.annotations = host.fabric.toJSON();
}

export function demoteToStatic(host) {
  if (!host.mounted) return;
  const fc = host.fabric;
  host.model.annotations = fc.toJSON();
  if (hooks.onDemote) hooks.onDemote(host);
  fc.dispose();
  host.fabric = null;
  host.mounted = false;
  // fabric.dispose leaves a wrapper; rebuild a clean fabric canvas element
  const old = host.el.querySelector(".canvas-container");
  if (old) old.remove();
  const fresh = document.createElement("canvas");
  fresh.className = "fabric-layer";
  host.fabricEl = fresh;
  host.el.insertBefore(fresh, host.skeleton);
  renderStaticPreview(host);
}

export function unmount(host, pdfDoc) {
  if (host.mounted) demoteToStatic(host);
  host.renderToken++;
  const rc = host.rasterCanvas;
  rc.width = 0; rc.height = 0;
  host.rastered = false;
  host.skeleton.hidden = false;
}

export function destroy(host) {
  if (host.mounted && host.fabric) { try { host.fabric.dispose(); } catch {} }
  host.el.remove();
}

function renderStaticPreview(host) {
  const m = host.model;
  const ann = m.annotations;
  if (!ann || !ann.objects || ann.objects.length === 0) {
    if (host.staticEl) host.staticEl.hidden = true;
    return;
  }
  const e = effDims(m);
  const W0 = Math.round(e.w * BASE), H0 = Math.round(e.h * BASE);
  const tmp = document.createElement("canvas");
  const sc = new fabric.StaticCanvas(tmp, { width: W0, height: H0, enableRetinaScaling: false });
  sc.loadFromJSON(ann, () => {
    sc.renderAll();
    let url;
    try { url = tmp.toDataURL("image/png"); } catch { sc.dispose(); return; }
    sc.dispose();
    if (!host.staticEl) {
      host.staticEl = document.createElement("img");
      host.staticEl.className = "static-overlay";
      host.el.appendChild(host.staticEl);
    }
    host.staticEl.src = url;
    host.staticEl.hidden = false;
    const disp = displayDims(m, state.view.zoom);
    host.staticEl.style.width = disp.w + "px";
    host.staticEl.style.height = disp.h + "px";
  });
}

/** Build a hi-res thumbnail dataURL (raster + flat annotations). */
export async function buildThumb(model, pdfDoc, width = 200) {
  const m = model;
  const e = effDims(m);
  const scale = width / e.w;
  const tmp = document.createElement("canvas");
  tmp.width = Math.round(e.w * scale); tmp.height = Math.round(e.h * scale);
  const ctx = tmp.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tmp.width, tmp.height);
  if (m.srcIndex != null && pdfDoc) {
    const page = await getPage(pdfDoc, m.srcIndex);
    const viewport = page.getViewport({ scale, rotation: effRot(m) });
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
  if (m.annotations && m.annotations.objects && m.annotations.objects.length) {
    await new Promise((res) => {
      const sc = new fabric.StaticCanvas(document.createElement("canvas"),
        { width: Math.round(e.w * BASE), height: Math.round(e.h * BASE), enableRetinaScaling: false });
      sc.loadFromJSON(m.annotations, () => {
        sc.renderAll();
        ctx.drawImage(sc.toCanvasElement(1), 0, 0, tmp.width, tmp.height);
        sc.dispose(); res();
      });
    });
  }
  return tmp.toDataURL("image/png");
}

/** Convert a screen (client) point to overlay (Fabric backstore) coords. */
export function screenToOverlay(host, clientX, clientY) {
  const rect = host.fabricEl.getBoundingClientRect
    ? (host.el.querySelector(".canvas-container") || host.fabricEl).getBoundingClientRect()
    : host.el.getBoundingClientRect();
  const e = effDims(host.model);
  const W0 = e.w * BASE, H0 = e.h * BASE;
  return {
    x: (clientX - rect.left) * (W0 / rect.width),
    y: (clientY - rect.top) * (H0 / rect.height),
  };
}
