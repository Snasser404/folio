/* Shape tools: rectangle, ellipse, line, arrow. All drag-to-draw. */
const fabric = window.fabric;
const norm = (c) => (c === "transparent" ? "rgba(0,0,0,0)" : c);

/* ---- shared drag-draw factory ---- */
function dragTool({ id, label, icon, shortcut, options, make, update, finalize }) {
  return {
    id, label, icon, group: "draw", shortcut, cursor: "crosshair", usesSelection: false, options,
    _draft: null, _origin: null, _pageId: null,
    activate() {},
    deactivate(ctx) {
      if (this._draft && this._pageId) ctx.removeObject(this._pageId, this._draft.id);
      this._draft = this._origin = this._pageId = null;
    },
    onPointerDown(page, ptr, ctx) {
      const o = ctx.getOptions();
      this._origin = { x: ptr.x, y: ptr.y };
      this._pageId = page.pageId;
      const obj = make(ptr, o);
      obj.id = ctx.addObject(page.pageId, obj, { select: false });
      this._draft = obj;
    },
    onPointerMove(page, ptr, ctx) {
      if (!this._draft) return;
      update(this._draft, this._origin, ptr, ptr.shift);
      this._draft.setCoords();
      page.canvas.requestRenderAll();
    },
    onPointerUp(page, ptr, ctx) {
      const obj = this._draft; this._draft = this._origin = null;
      if (!obj) return;
      const ok = finalize(obj, ptr, ctx, page);
      if (!ok) { ctx.removeObject(page.pageId, obj.id); this._pageId = null; return; }
      obj.setCoords();
      ctx.commitFor(page.pageId, `Add ${label.toLowerCase()}`);
      this._pageId = null;
    },
    onOptionsChanged(opts, ctx) {
      const page = ctx.getActivePage(); if (!page) return;
      const sel = ctx.getSelected(page.pageId).filter((o) => o.toolId === id);
      if (!sel.length) return;
      ctx.beginBatch();
      sel.forEach((o) => restyle(o, opts));
      ctx.endBatch("Restyle");
    },
    canStyle: (obj) => obj.toolId === id,
  };
}

function restyle(o, opts) {
  const props = {};
  if (opts.stroke !== undefined) props.stroke = opts.stroke;
  if (opts.fill !== undefined) props.fill = norm(opts.fill);
  if (opts.width !== undefined) props.strokeWidth = opts.width;
  if (opts.cornerRad !== undefined && o.type === "rect") { props.rx = opts.cornerRad; props.ry = opts.cornerRad; }
  if (opts.opacity !== undefined) props.opacity = opts.opacity;
  o.set(props); o.canvas && o.canvas.requestRenderAll();
}

const strokeOpts = (extra = []) => [
  { key: "stroke", type: "color", label: "Color", default: "#e3242b" },
  { key: "width", type: "number", label: "Weight", default: 3, min: 1, max: 80, step: 1 },
  ...extra,
  { key: "opacity", type: "slider", label: "Opacity", default: 1, min: 0.1, max: 1, step: 0.05 },
];

export const rectangle = dragTool({
  id: "rectangle", label: "Rectangle", icon: "rect", shortcut: "r",
  options: [
    { key: "stroke", type: "color", label: "Border", default: "#e3242b" },
    { key: "fill", type: "color", label: "Fill", default: "transparent" },
    { key: "width", type: "number", label: "Weight", default: 3, min: 1, max: 80, step: 1 },
    { key: "cornerRad", type: "slider", label: "Radius", default: 0, min: 0, max: 60, step: 1 },
    { key: "opacity", type: "slider", label: "Opacity", default: 1, min: 0.1, max: 1, step: 0.05 },
  ],
  make: (ptr, o) => new fabric.Rect({
    left: ptr.x, top: ptr.y, width: 0, height: 0, stroke: o.stroke, fill: norm(o.fill),
    strokeWidth: o.width, rx: o.cornerRad, ry: o.cornerRad, opacity: o.opacity, strokeUniform: true,
  }),
  update: (r, a, ptr, shift) => {
    let w = ptr.x - a.x, h = ptr.y - a.y;
    if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w) * m; h = Math.sign(h) * m; }
    r.set({ left: Math.min(a.x, a.x + w), top: Math.min(a.y, a.y + h), width: Math.abs(w), height: Math.abs(h) });
  },
  finalize: (r) => r.width >= 3 && r.height >= 3,
});

export const ellipse = dragTool({
  id: "ellipse", label: "Ellipse", icon: "ellipse", shortcut: "o",
  options: strokeOpts([{ key: "fill", type: "color", label: "Fill", default: "transparent" }]),
  make: (ptr, o) => new fabric.Ellipse({
    left: ptr.x, top: ptr.y, rx: 0, ry: 0, stroke: o.stroke, fill: norm(o.fill),
    strokeWidth: o.width, opacity: o.opacity, strokeUniform: true,
  }),
  update: (el, a, ptr, shift) => {
    let w = ptr.x - a.x, h = ptr.y - a.y;
    if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w) * m; h = Math.sign(h) * m; }
    el.set({ left: Math.min(a.x, a.x + w), top: Math.min(a.y, a.y + h), rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
  },
  finalize: (el) => el.rx >= 2 && el.ry >= 2,
});

export const line = dragTool({
  id: "line", label: "Line", icon: "line", shortcut: "l",
  options: strokeOpts(),
  make: (ptr, o) => new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
    stroke: o.stroke, strokeWidth: o.width, opacity: o.opacity, strokeUniform: true, strokeLineCap: "round",
  }),
  update: (ln, a, ptr, shift) => {
    let x2 = ptr.x, y2 = ptr.y;
    if (shift) {
      const dx = x2 - a.x, dy = y2 - a.y;
      if (Math.abs(dx) > Math.abs(dy)) y2 = a.y; else x2 = a.x;
    }
    ln.set({ x2, y2 });
  },
  finalize: (ln) => Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1) >= 3,
});

/* ---- Arrow: drag a line, finalize into a Group(line + head) ---- */
export const arrow = {
  id: "arrow", label: "Arrow", icon: "arrow", group: "draw", shortcut: "a",
  cursor: "crosshair", usesSelection: false, options: strokeOpts(),
  _draft: null, _origin: null, _pageId: null,
  activate() {},
  deactivate(ctx) { if (this._draft && this._pageId) ctx.removeObject(this._pageId, this._draft.id); this._draft = this._origin = this._pageId = null; },
  onPointerDown(page, ptr, ctx) {
    const o = ctx.getOptions();
    this._origin = { x: ptr.x, y: ptr.y }; this._pageId = page.pageId; this._opts = o;
    const ln = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], { stroke: o.stroke, strokeWidth: o.width, opacity: o.opacity, strokeLineCap: "round" });
    ln.id = ctx.addObject(page.pageId, ln, { select: false });
    this._draft = ln;
  },
  onPointerMove(page, ptr, ctx) {
    if (!this._draft) return;
    let x2 = ptr.x, y2 = ptr.y;
    if (ptr.shift) { const dx = x2 - this._origin.x, dy = y2 - this._origin.y; if (Math.abs(dx) > Math.abs(dy)) y2 = this._origin.y; else x2 = this._origin.x; }
    this._draft.set({ x2, y2 }); this._draft.setCoords(); page.canvas.requestRenderAll();
  },
  onPointerUp(page, ptr, ctx) {
    const ln = this._draft; this._draft = null; const a = this._origin; this._origin = null;
    if (!ln) return;
    const x2 = ln.x2, y2 = ln.y2;
    ctx.removeObject(page.pageId, ln.id);
    if (Math.hypot(x2 - a.x, y2 - a.y) < 5) { this._pageId = null; return; }
    const o = this._opts;
    const grp = makeArrow(a.x, a.y, x2, y2, o);
    grp.id = ctx.addObject(page.pageId, grp, { select: false });
    ctx.commitFor(page.pageId, "Add arrow");
    this._pageId = null;
  },
  canStyle: (obj) => obj.toolId === "arrow",
};

function makeArrow(x1, y1, x2, y2, o) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, o.width * 3.5);
  const ln = new fabric.Line([x1, y1, x2, y2], { stroke: o.stroke, strokeWidth: o.width, strokeLineCap: "round" });
  const tri = new fabric.Triangle({
    left: x2, top: y2, originX: "center", originY: "center",
    width: head, height: head, fill: o.stroke,
    angle: (angle * 180) / Math.PI + 90,
  });
  const g = new fabric.Group([ln, tri], { opacity: o.opacity });
  g.toolId = "arrow";
  return g;
}
