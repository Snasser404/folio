/* Redaction: drag boxes that are truly removed (content rasterized away) on export.
 * Each box adds a black overlay rect AND a redaction region (in PDF points). */
const fabric = window.fabric;

export const redact = {
  id: "redact", label: "Redact", icon: "redact", group: "protect", shortcut: "",
  cursor: "crosshair", usesSelection: false, options: [],
  hint: "Drag over content to permanently remove it on download",
  _draft: null, _origin: null, _pageId: null,
  activate(ctx) { if (!this._warned) { ctx.util.toast("Redaction permanently removes content on export.", "warning"); this._warned = true; } },
  deactivate(ctx) { if (this._draft && this._pageId) ctx.removeObject(this._pageId, this._draft.id); this._draft = this._origin = this._pageId = null; },
  onPointerDown(page, ptr, ctx) {
    this._origin = { x: ptr.x, y: ptr.y }; this._pageId = page.pageId;
    const r = new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, fill: "#000", stroke: "#dc2626", strokeWidth: 1, strokeDashArray: [4, 3] });
    r.toolId = "redact";
    r.id = ctx.addObject(page.pageId, r, { select: false });
    this._draft = r;
  },
  onPointerMove(page, ptr, ctx) {
    if (!this._draft) return;
    const a = this._origin;
    this._draft.set({ left: Math.min(a.x, ptr.x), top: Math.min(a.y, ptr.y), width: Math.abs(ptr.x - a.x), height: Math.abs(ptr.y - a.y) });
    this._draft.setCoords(); page.canvas.requestRenderAll();
  },
  onPointerUp(page, ptr, ctx) {
    const r = this._draft; this._draft = this._origin = null;
    if (!r) return;
    if (r.width < 4 || r.height < 4) { ctx.removeObject(page.pageId, r.id); this._pageId = null; return; }
    r.set({ strokeWidth: 0 });
    // store as normalized fractions of the (rotated) page canvas — rotation-agnostic
    const c = page.canvas;
    ctx.addRedaction(page.pageId, { nx: r.left / c.width, ny: r.top / c.height, nw: r.width / c.width, nh: r.height / c.height });
    ctx.commitFor(page.pageId, "Redact");
    this._pageId = null;
  },
  canStyle: () => false,
};
