/* Link tool (clickable URL / go-to-page) and Crop tool (sets CropBox on export).
 * Both store a tagged Fabric object; the export engine reads them as metadata
 * (real link annotations / cropbox) and excludes them from the raster overlay. */
const fabric = window.fabric;

export const link = {
  id: "link", label: "Link", icon: "link", group: "insert",
  shortcut: "", cursor: "crosshair", usesSelection: false, options: [],
  hint: "Drag a box, then choose a web URL or page to link to",
  _draft: null, _origin: null, _pageId: null,
  activate() {}, deactivate(ctx) { if (this._draft && this._pageId) ctx.removeObject(this._pageId, this._draft.id); this._draft = this._origin = this._pageId = null; },
  onPointerDown(page, ptr, ctx) {
    this._origin = { x: ptr.x, y: ptr.y }; this._pageId = page.pageId;
    const r = new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, fill: "rgba(37,99,235,0.10)", stroke: "#2563eb", strokeWidth: 1, strokeDashArray: [5, 3] });
    r.toolId = "link";
    r.id = ctx.addObject(page.pageId, r, { select: false });
    this._draft = r;
  },
  onPointerMove(page, ptr, ctx) {
    if (!this._draft) return;
    const a = this._origin;
    this._draft.set({ left: Math.min(a.x, ptr.x), top: Math.min(a.y, ptr.y), width: Math.abs(ptr.x - a.x), height: Math.abs(ptr.y - a.y) });
    this._draft.setCoords(); page.canvas.requestRenderAll();
  },
  async onPointerUp(page, ptr, ctx) {
    const r = this._draft; this._draft = this._origin = null;
    const pid = this._pageId; this._pageId = null;
    if (!r) return;
    if (r.width < 6 || r.height < 6) { ctx.removeObject(pid, r.id); page.canvas.requestRenderAll(); return; }
    const res = ctx.util.linkDialog ? await ctx.util.linkDialog(ctx.getState().pages.length) : null;
    if (!res) { ctx.removeObject(pid, r.id); page.canvas.requestRenderAll(); return; }
    r.meta = { kind: res.kind, url: res.url, page: res.page };
    r.set({ selectable: true, evented: true });
    ctx.commitFor(pid, "Add link");
  },
  canStyle: () => false,
};

export const crop = {
  id: "crop", label: "Crop page", icon: "crop", group: "protect",
  shortcut: "", cursor: "crosshair", usesSelection: false, options: [],
  hint: "Drag the area to keep; the rest is cropped on download",
  _draft: null, _origin: null, _pageId: null, _warned: false,
  activate(ctx) { if (!this._warned) { ctx.util.toast("Draw the area to keep — the page is cropped to it on download.", "info", 3500); this._warned = true; } },
  deactivate(ctx) { if (this._draft && this._pageId) ctx.removeObject(this._pageId, this._draft.id); this._draft = this._origin = this._pageId = null; },
  onPointerDown(page, ptr, ctx) {
    // one crop region per page — drop any previous one
    ctx.getObjects(page.pageId).filter((o) => o.toolId === "crop").forEach((o) => ctx.removeObject(page.pageId, o.id));
    this._origin = { x: ptr.x, y: ptr.y }; this._pageId = page.pageId;
    const r = new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, fill: "rgba(0,0,0,0)", stroke: "#16a34a", strokeWidth: 2, strokeDashArray: [6, 4] });
    r.toolId = "crop";
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
    const pid = this._pageId; this._pageId = null;
    if (!r) return;
    if (r.width < 10 || r.height < 10) { ctx.removeObject(pid, r.id); page.canvas.requestRenderAll(); return; }
    r.set({ selectable: true, evented: true });
    ctx.commitFor(pid, "Set crop");
    ctx.util.toast("Crop set. Delete the green box to undo.", "success", 2500);
  },
  canStyle: () => false,
};
