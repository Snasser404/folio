/* Distance measurement: drag a line; a label shows the length in the chosen unit.
 * Supports a scale factor (real-world units per page inch) for scaled drawings. */
const fabric = window.fabric;

function fmt(a, b, o, ctx) {
  const lenPt = Math.hypot(b.x - a.x, b.y - a.y) / ctx.OVERLAY_SCALE; // PDF points
  const lenIn = lenPt / 72;
  const scale = o.scale || 1;
  if (o.unit === "pt") return lenPt.toFixed(1) + " pt";
  if (o.unit === "cm") return (lenIn * 2.54 * scale).toFixed(2) + " cm";
  return (lenIn * scale).toFixed(2) + " in";
}

export const measure = {
  id: "measure", label: "Measure", icon: "measure", group: "draw",
  shortcut: "m", cursor: "crosshair", usesSelection: false,
  hint: "Drag to measure a distance",
  options: [
    { key: "unit", type: "select", label: "Unit", default: "in",
      choices: [{ value: "in", label: "inches" }, { value: "cm", label: "cm" }, { value: "pt", label: "points" }] },
    { key: "scale", type: "number", label: "Scale ×", default: 1, min: 0.01, max: 100000, step: 0.1 },
    { key: "color", type: "color", label: "Color", default: "#2563eb" },
  ],
  _line: null, _label: null, _origin: null, _pageId: null, _opts: null,
  activate() {}, deactivate(ctx) {
    if (this._line && this._pageId) { const c = ctx.getCanvas(this._pageId); if (c) { c.remove(this._line); c.remove(this._label); c.requestRenderAll(); } }
    this._line = this._label = this._origin = this._pageId = null;
  },
  onPointerDown(page, ptr, ctx) {
    const o = ctx.getOptions(); this._opts = o; this._origin = { x: ptr.x, y: ptr.y }; this._pageId = page.pageId;
    this._line = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], { stroke: o.color, strokeWidth: 2, strokeLineCap: "round" });
    this._label = new fabric.Text("0", { fontSize: 13 * ctx.OVERLAY_SCALE, fill: "#fff", backgroundColor: o.color, left: ptr.x, top: ptr.y, originX: "center", originY: "center" });
    page.canvas.add(this._line, this._label);
  },
  onPointerMove(page, ptr, ctx) {
    if (!this._line) return;
    let x2 = ptr.x, y2 = ptr.y;
    if (ptr.shift) { const dx = x2 - this._origin.x, dy = y2 - this._origin.y; if (Math.abs(dx) > Math.abs(dy)) y2 = this._origin.y; else x2 = this._origin.x; }
    this._line.set({ x2, y2 });
    this._label.set({ left: (this._origin.x + x2) / 2, top: (this._origin.y + y2) / 2, text: fmt(this._origin, { x: x2, y: y2 }, this._opts, ctx) });
    page.canvas.requestRenderAll();
  },
  onPointerUp(page, ptr, ctx) {
    const ln = this._line, lb = this._label, a = this._origin, pid = this._pageId;
    this._line = this._label = this._origin = this._pageId = null;
    if (!ln) return;
    page.canvas.remove(ln); page.canvas.remove(lb);
    if (Math.hypot(ln.x2 - ln.x1, ln.y2 - ln.y1) < 5) { page.canvas.requestRenderAll(); return; }
    const g = new fabric.Group([ln, lb]);
    g.toolId = "measure";
    ctx.addObject(pid, g, { select: false });
    ctx.commitFor(pid, "Measure");
  },
  canStyle: (o) => o.toolId === "measure",
};
