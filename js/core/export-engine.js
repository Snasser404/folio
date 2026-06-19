/* Export: builds a new PDF from state. Per-page decision:
 *   A) vector-preserve  (source page, unrotated, no redaction)
 *   B) flatten+redact   (source page, unrotated, has redactions -> truly removed)
 *   C) flatten rotated  (rotated source page)
 *   D) blank/inserted   */
import { state, getSourceDoc } from "./state.js";
import * as scheduler from "./render-scheduler.js";
import * as PH from "./page-host.js";
import { getPage as getPdfPage } from "./pdf-engine.js";
import { dataUrlToBytes } from "./util.js";
import { applyForm } from "./forms.js";

const PDFLib = window.PDFLib;
const fabric = window.fabric;
const EXPORT_MULT = 1.5; // extra overlay resolution on top of PH.BASE

// link/crop objects are metadata (real annotations / cropbox on export) — not raster content
const isMeta = (o) => o.toolId === "link" || o.toolId === "crop";

function buildOverlayCanvas(model, multiplier) {
  const ann = model.annotations;
  const objects = ((ann && ann.objects) || []).filter((o) => !isMeta(o));
  if (objects.length === 0) return Promise.resolve(null);
  const e = PH.effDims(model);
  const W0 = Math.round(e.w * PH.BASE), H0 = Math.round(e.h * PH.BASE);
  return new Promise((resolve) => {
    const sc = new fabric.StaticCanvas(document.createElement("canvas"),
      { width: W0, height: H0, enableRetinaScaling: false });
    sc.loadFromJSON({ ...ann, objects }, () => {
      sc.renderAll();
      const out = sc.toCanvasElement(multiplier);
      sc.dispose();
      resolve(out);
    });
  });
}

/** Read link + crop metadata objects from a page model (overlay-space rects). */
function readExtras(model) {
  const objs = (model.annotations && model.annotations.objects) || [];
  const bbox = (o) => ({ left: o.left || 0, top: o.top || 0, w: (o.width || 0) * (o.scaleX || 1), h: (o.height || 0) * (o.scaleY || 1) });
  const links = objs.filter((o) => o.toolId === "link").map((o) => ({ rect: bbox(o), meta: o.meta || {} }));
  const cropObj = objs.find((o) => o.toolId === "crop");
  return { links, crop: cropObj ? bbox(cropObj) : null };
}

/** overlay (pt*BASE, y-down) rect -> PDF points (y-up). Unrotated pages only. */
function toPdfRect(model, r) {
  const ph = model.size.h;
  return { x: r.left / PH.BASE, y: ph - (r.top + r.h) / PH.BASE, w: r.w / PH.BASE, h: r.h / PH.BASE };
}

/** Add a clickable Link annotation (URI or go-to-page) to a pdf-lib page. */
function addLinkAnnotation(outDoc, page, rect, meta) {
  const ctx = outDoc.context;
  const { PDFName, PDFString } = PDFLib;
  const dict = ctx.obj({
    Type: "Annot", Subtype: "Link",
    Rect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
    Border: [0, 0, 0], F: 4,
  });
  if (meta.kind === "page") {
    const pages = outDoc.getPages();
    const tp = pages[Math.max(0, Math.min(pages.length - 1, (meta.page || 1) - 1))];
    if (tp) dict.set(PDFName.of("Dest"), ctx.obj([tp.ref, "XYZ", null, tp.getHeight(), null]));
  } else {
    const action = ctx.obj({ Type: "Action", S: "URI" });
    action.set(PDFName.of("URI"), PDFString.of(meta.url || ""));
    dict.set(PDFName.of("A"), action);
  }
  let annots = page.node.Annots();
  if (!annots) { annots = ctx.obj([]); page.node.set(PDFName.of("Annots"), annots); }
  annots.push(ctx.register(dict));
}

const canvasToPngBytes = (canvas) => dataUrlToBytes(canvas.toDataURL("image/png"));

/** Flatten a source page to a PNG (page render + redaction fill + overlay).
 * Redactions are stored as normalized fractions of the rotated page, so the
 * black fill lands correctly at ANY rotation (incl. intrinsic /Rotate). */
async function buildFlatPng(model, pdfDoc) {
  const scale = PH.BASE * EXPORT_MULT;
  const rot = PH.effRot(model);
  const page = await getPdfPage(pdfDoc, model.srcIndex);
  const viewport = page.getViewport({ scale, rotation: rot });
  const tmp = document.createElement("canvas");
  tmp.width = Math.round(viewport.width);
  tmp.height = Math.round(viewport.height);
  const ctx = tmp.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tmp.width, tmp.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  if (model.redactions && model.redactions.length) {
    ctx.fillStyle = "#000";
    for (const r of model.redactions) {
      if ("nx" in r) ctx.fillRect(r.nx * tmp.width, r.ny * tmp.height, r.nw * tmp.width, r.nh * tmp.height);
      else ctx.fillRect(r.x * scale, (model.size.h - (r.y + r.h)) * scale, r.w * scale, r.h * scale); // legacy
    }
  }

  const overlay = await buildOverlayCanvas(model, EXPORT_MULT);
  if (overlay) ctx.drawImage(overlay, 0, 0, tmp.width, tmp.height);

  return { bytes: await canvasToPngBytes(tmp), widthPt: viewport.width / scale, heightPt: viewport.height / scale };
}

export async function exportPdf({ onProgress, flattenAll = false, pageIds = null, sanitize = false } = {}) {
  for (const h of scheduler.getHosts().values()) PH.syncToModel(h);

  const out = await PDFLib.PDFDocument.create();
  let _helv = null;
  const getHelv = async () => _helv || (_helv = await out.embedFont(PDFLib.StandardFonts.Helvetica));
  const srcCache = new Map();
  const formValues = state.doc.formValues || {};
  const hasFormValues = Object.keys(formValues).length > 0;
  const loadSrc = async (idx) => {
    if (srcCache.has(idx)) return srcCache.get(idx);
    const s = state.doc.sources && state.doc.sources[idx];
    const lib = s && s.bytes ? await PDFLib.PDFDocument.load(s.bytes, { ignoreEncryption: true }) : null;
    if (lib && idx === 0 && hasFormValues) applyForm(lib, formValues, true); // fill + flatten form
    srcCache.set(idx, lib);
    return lib;
  };
  const pages = (pageIds && pageIds.length) ? state.pages.filter((p) => pageIds.includes(p.id)) : state.pages;
  let done = 0;

  for (const model of pages) {
    const rot = PH.effRot(model);
    const hasRed = model.redactions && model.redactions.length > 0;
    const src = model.srcIndex != null ? await loadSrc(model.srcDoc || 0) : null;
    const pdfDoc = getSourceDoc(model);

    if (model.srcIndex != null && src && rot === 0 && !hasRed && !flattenAll) {
      // A) vector-preserve
      const [copied] = await out.copyPages(src, [model.srcIndex]);
      out.addPage(copied);
      const w = copied.getWidth(), h = copied.getHeight();
      const overlay = await buildOverlayCanvas(model, EXPORT_MULT);
      if (overlay) {
        const png = await out.embedPng(await canvasToPngBytes(overlay));
        copied.drawImage(png, { x: 0, y: 0, width: w, height: h });
      }
      const extras = readExtras(model);
      for (const lk of extras.links) {
        try { addLinkAnnotation(out, copied, toPdfRect(model, lk.rect), lk.meta); } catch (e) { console.warn("[export] link failed", e); }
      }
      if (extras.crop) { const c = toPdfRect(model, extras.crop); try { copied.setCropBox(c.x, c.y, c.w, c.h); } catch (e) { console.warn("[export] crop failed", e); } }
      if (model.ocr && model.ocr.words && model.ocr.words.length) {
        const font = await getHelv();
        for (const wd of model.ocr.words) {
          try { copied.drawText(wd.str, { x: wd.x, y: wd.y, size: Math.max(4, wd.h * 0.9), font, opacity: 0 }); } catch {}
        }
      }
    } else if (model.srcIndex != null && pdfDoc && (hasRed || rot !== 0 || flattenAll)) {
      // B/C) flatten (true redaction, rotation, or full rasterization)
      const flat = await buildFlatPng(model, pdfDoc);
      const png = await out.embedPng(flat.bytes);
      const np = out.addPage([flat.widthPt, flat.heightPt]);
      np.drawImage(png, { x: 0, y: 0, width: flat.widthPt, height: flat.heightPt });
    } else {
      // D) blank / inserted
      const e = PH.effDims(model);
      const np = out.addPage([e.w, e.h]);
      np.drawRectangle({ x: 0, y: 0, width: e.w, height: e.h, color: PDFLib.rgb(1, 1, 1) });
      const overlay = await buildOverlayCanvas(model, EXPORT_MULT);
      if (overlay) {
        const png = await out.embedPng(await canvasToPngBytes(overlay));
        np.drawImage(png, { x: 0, y: 0, width: e.w, height: e.h });
      }
    }
    done++;
    if (onProgress) onProgress(done, pages.length);
  }

  if (sanitize) {
    try { out.setTitle(""); out.setAuthor(""); out.setSubject(""); out.setKeywords([]); out.setProducer(""); out.setCreator(""); } catch {}
    return out.save({ updateMetadata: false }); // don't let pdf-lib re-stamp Producer/ModDate
  }
  out.setProducer("PDF Studio");
  out.setModificationDate(new Date());
  return out.save();
}

/** Export a single page as a PNG dataURL (for "export as image"). */
export async function pageToPng(model, pdfDoc, scale = 2) {
  return buildFlatPng(model, pdfDoc);
}
