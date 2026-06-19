/* The EditorContext ("ctx") — the only surface tools use to affect the app. */
import {
  state, bus, getPage, setSelection, clearSelection as stClearSel, markDirty, setToolOptions,
} from "./state.js";
import { newObjId } from "./ids.js";
import * as scheduler from "./render-scheduler.js";
import * as history from "./history.js";
import { BASE, screenToOverlay, effDims } from "./page-host.js";

const findById = (canvas, id) => canvas && canvas.getObjects().find((o) => o.id === id);

export function createContext(deps) {
  const { tm, util } = deps;
  const baselines = new Map();      // pageId -> JSON string baseline for history diffs
  let lastPageId = null;

  function getCanvas(pageId) {
    const host = scheduler.getHost(pageId);
    return host && host.mounted ? host.fabric : null;
  }
  function getActivePage() {
    const host = scheduler.getFocusedHost();
    if (host && host.mounted) return { pageId: host.model.id, canvas: host.fabric, model: host.model };
    return null;
  }
  function syncSelection(canvas, pageId) {
    const ids = canvas.getActiveObjects().map((o) => o.id).filter(Boolean);
    setSelection(pageId, ids);
  }

  const ctx = {
    /* active page / canvas */
    getActivePage,
    getCanvas,
    getActivePageModel: () => getPage(state.view.focusedPageId),

    /* object create / mutate */
    addObject(pageId, obj, opts = {}) {
      const canvas = getCanvas(pageId);
      if (!canvas) return null;
      if (!obj.id) obj.id = newObjId();
      if (!obj.toolId) obj.toolId = opts.toolId || state.view.activeTool;
      canvas.add(obj);
      lastPageId = pageId;
      if (opts.select) { canvas.setActiveObject(obj); syncSelection(canvas, pageId); }
      canvas.requestRenderAll();
      markDirty();
      return obj.id;
    },
    removeObject(pageId, objId) {
      const canvas = getCanvas(pageId);
      const obj = findById(canvas, objId);
      if (obj) { canvas.remove(obj); lastPageId = pageId; canvas.requestRenderAll(); markDirty(); }
    },
    getObjects: (pageId) => { const c = getCanvas(pageId); return c ? c.getObjects() : []; },
    getSelected: (pageId) => { const c = getCanvas(pageId); return c ? c.getActiveObjects() : []; },
    setObjectProps(pageId, objId, props) {
      const canvas = getCanvas(pageId);
      const obj = findById(canvas, objId);
      if (!obj) return;
      obj.set(props); obj.setCoords();
      lastPageId = pageId; canvas.requestRenderAll(); markDirty();
    },

    /* selection */
    select(pageId, objIds) {
      const canvas = getCanvas(pageId);
      if (!canvas) return;
      const objs = (objIds || []).map((id) => findById(canvas, id)).filter(Boolean);
      canvas.discardActiveObject();
      if (objs.length === 1) canvas.setActiveObject(objs[0]);
      else if (objs.length > 1) {
        canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
      }
      canvas.requestRenderAll();
      setSelection(pageId, objIds || []);
    },
    clearSelection() {
      for (const host of scheduler.getHosts().values())
        if (host.mounted) { host.fabric.discardActiveObject(); host.fabric.requestRenderAll(); }
      stClearSel();
    },

    /* history */
    noteBaseline(pageId) {
      const canvas = getCanvas(pageId);
      if (canvas) baselines.set(pageId, JSON.stringify(canvas.toJSON()));
    },
    commit(label) {
      let pid = lastPageId;
      if (!pid || !getCanvas(pid)) pid = (getActivePage() || {}).pageId;
      ctx.commitFor(pid, label);
    },
    commitFor(pageId, label) {
      if (!pageId) return;
      const canvas = getCanvas(pageId);
      if (!canvas) return;
      const after = JSON.stringify(canvas.toJSON());
      const before = baselines.has(pageId) ? baselines.get(pageId) : after;
      const page = getPage(pageId);
      if (page) page.annotations = JSON.parse(after);
      baselines.set(pageId, after);
      if (before !== after) history.record({ type: "anno", pageId, before, after, label: label || "Edit" });
      markDirty();
    },
    beginBatch: () => history.beginBatch(),
    endBatch: (label) => history.endBatch(label),

    /* tool options */
    getOptions: () => ({ ...state.view.toolOptions }),
    setOptions(patch) {
      const merged = { ...state.view.toolOptions, ...patch };
      setToolOptions(merged);
      tm.notifyOptionsChanged(merged);
    },

    /* coordinate helpers (overlay px <-> PDF points, unrotated, y-up) */
    overlayToPdf(pageId, pt) {
      const m = getPage(pageId);
      return { x: pt.x / BASE, y: (m ? m.size.h : 0) - pt.y / BASE };
    },
    pdfToOverlay(pageId, pt) {
      const m = getPage(pageId);
      return { x: pt.x * BASE, y: ((m ? m.size.h : 0) - pt.y) * BASE };
    },
    overlayRectToPdf(pageId, r) {
      const m = getPage(pageId);
      return { x: r.left / BASE, y: (m ? m.size.h : 0) - (r.top + r.height) / BASE, w: r.width / BASE, h: r.height / BASE };
    },
    screenToOverlay(pageId, clientX, clientY) {
      const host = scheduler.getHost(pageId);
      return host ? screenToOverlay(host, clientX, clientY) : { x: 0, y: 0 };
    },
    getHostEl(pageId) {
      const host = scheduler.getHost(pageId);
      return host ? host.el : null;
    },
    /** Sample background + text colors from the rendered page raster inside an
     *  overlay-space rect. Background = most common color in the region; text =
     *  the sampled color most different from it. Works for light-on-dark too. */
    sampleRasterColors(pageId, ov) {
      const fallback = { bg: "#ffffff", fg: "#1a1a1a" };
      const host = scheduler.getHost(pageId);
      if (!host || !host.rastered) return fallback;
      const rc = host.rasterCanvas;
      const m = getPage(pageId);
      if (!rc.width || !m) return fallback;
      const e = effDims(m);
      const sx = rc.width / (e.w * BASE), sy = rc.height / (e.h * BASE);
      let img;
      try {
        const x0 = Math.max(0, Math.floor(ov.left * sx)), y0 = Math.max(0, Math.floor(ov.top * sy));
        const w = Math.min(rc.width - x0, Math.ceil(ov.width * sx)), h = Math.min(rc.height - y0, Math.ceil(ov.height * sy));
        if (w < 2 || h < 2) return fallback;
        img = rc.getContext("2d").getImageData(x0, y0, w, h);
      } catch { return fallback; }

      const d = img.data, buckets = {};
      const key = (r, g, b) => `${r >> 4}.${g >> 4}.${b >> 4}`;
      for (let i = 0; i < d.length; i += 4) {
        const k = key(d[i], d[i + 1], d[i + 2]);
        const b = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, bl: 0 });
        b.n++; b.r += d[i]; b.g += d[i + 1]; b.bl += d[i + 2];
      }
      let bgBucket = null;
      for (const k in buckets) if (!bgBucket || buckets[k].n > bgBucket.n) bgBucket = buckets[k];
      const bg = [Math.round(bgBucket.r / bgBucket.n), Math.round(bgBucket.g / bgBucket.n), Math.round(bgBucket.bl / bgBucket.n)];

      let fg = bg, best = -1;
      for (let i = 0; i < d.length; i += 4) {
        const dd = (d[i] - bg[0]) ** 2 + (d[i + 1] - bg[1]) ** 2 + (d[i + 2] - bg[2]) ** 2;
        if (dd > best) { best = dd; fg = [d[i], d[i + 1], d[i + 2]]; }
      }
      if (best < 1500) { const lum = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114; fg = lum > 140 ? [20, 20, 20] : [240, 240, 240]; }
      const hex = (a) => "#" + a.map((n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0")).join("");
      return { bg: hex(bg), fg: hex(fg) };
    },

    /* redaction */
    addRedaction(pageId, rectPdf) {
      const page = getPage(pageId);
      if (page) { page.redactions.push(rectPdf); markDirty(); }
    },

    /* state + lifecycle */
    getState: () => state,
    setActiveTool: (id, options) => tm.activate(id, options),
    scrollToPage: (id, align) => scheduler.scrollToPage(id, align),
    invalidate: (id) => scheduler.invalidate(id),
    bus,
    util,
    OVERLAY_SCALE: BASE,

    /* internals exposed to tool-manager */
    _syncSelection: syncSelection,
    _touch: (pageId) => { lastPageId = pageId; },
  };
  return ctx;
}
