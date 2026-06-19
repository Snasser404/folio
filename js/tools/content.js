/* Edit-content tools: add text box, insert image, white-out cover. */
import { readFileAsDataUrl } from "../core/util.js";
const fabric = window.fabric;

export const text = {
  id: "text", label: "Text", icon: "text", group: "markup", shortcut: "t",
  cursor: "text", usesSelection: false, hint: "Click anywhere to add a new text box",
  options: [
    { key: "fontFamily", type: "select", label: "Font", default: "Helvetica",
      choices: [
        { value: "Helvetica", label: "Helvetica" }, { value: "Arial", label: "Arial" },
        { value: "Times New Roman", label: "Times" }, { value: "Georgia", label: "Georgia" },
        { value: "Courier New", label: "Courier" }, { value: "Verdana", label: "Verdana" },
      ] },
    { key: "fontSize", type: "number", label: "Size", default: 16, min: 6, max: 200, step: 1 },
    { key: "color", type: "color", label: "Color", default: "#1a1d23" },
    { key: "bold", type: "toggle", label: "Bold", default: false },
    { key: "italic", type: "toggle", label: "Italic", default: false },
  ],
  activate() {}, deactivate() {},
  onPointerDown(page, ptr, ctx) {
    const canvas = ctx.getCanvas(page.pageId);
    if (!canvas) return;
    // a click while editing another text just commits it (Fabric exits on click); skip creating a new box on that same click
    if (canvas.getActiveObject() && canvas.getActiveObject().isEditing) { canvas.getActiveObject().exitEditing(); return; }
    const o = ctx.getOptions();
    const t = new fabric.IText("", {
      left: ptr.x, top: ptr.y,
      fontSize: o.fontSize * ctx.OVERLAY_SCALE,
      fill: o.color, fontFamily: o.fontFamily,
      fontWeight: o.bold ? "bold" : "normal",
      fontStyle: o.italic ? "italic" : "normal",
      cursorColor: o.color, cursorWidth: 2, editingBorderColor: "#2563eb",
      selectionColor: "rgba(37,99,235,0.25)",
    });
    t.on("editing:entered", () => { t.set("backgroundColor", "rgba(37,99,235,0.07)"); canvas.requestRenderAll(); });
    t.on("editing:exited", () => { t.set("backgroundColor", ""); canvas.requestRenderAll(); });
    ctx.addObject(page.pageId, t);            // committed on edit-exit (tool-manager), not here
    t.set({ selectable: true, evented: true });
    canvas.setActiveObject(t);
    t.enterEditing();
    // tool stays active (persistent) — next click places another text box
  },
  onOptionsChanged(opts, ctx) {
    const page = ctx.getActivePage(); if (!page) return;
    const sel = ctx.getSelected(page.pageId).filter((o) => o.type === "i-text" || o.type === "textbox");
    if (!sel.length) return;
    ctx.beginBatch();
    sel.forEach((o) => o.set({
      fontFamily: opts.fontFamily, fontSize: opts.fontSize * ctx.OVERLAY_SCALE, fill: opts.color,
      fontWeight: opts.bold ? "bold" : "normal", fontStyle: opts.italic ? "italic" : "normal",
    }));
    page.canvas.requestRenderAll();
    ctx.endBatch("Restyle text");
  },
  canStyle: (obj) => obj.type === "i-text" || obj.type === "textbox",
};

export const image = {
  id: "image", label: "Image", icon: "image", group: "insert", shortcut: "",
  cursor: "default", usesSelection: false, isInstant: true, options: [],
  activate(ctx) {
    const input = document.getElementById("imageInput");
    if (!input) return;
    const handler = async () => {
      input.removeEventListener("change", handler);
      const file = input.files[0]; input.value = "";
      if (!file) return;
      const url = await readFileAsDataUrl(file);
      fabric.Image.fromURL(url, (img) => {
        const page = ctx.getActivePage();
        if (!page) { ctx.util.toast("Scroll to a page first", "error"); return; }
        const canvas = page.canvas;
        const max = Math.min(canvas.width, canvas.height) * 0.5;
        const scale = Math.min(max / img.width, max / img.height, 1);
        img.set({ left: (canvas.width - img.width * scale) / 2, top: (canvas.height - img.height * scale) / 2, scaleX: scale, scaleY: scale });
        ctx.setActiveTool("select");
        ctx.addObject(page.pageId, img, { select: true });
        ctx.commitFor(page.pageId, "Add image");
      });
    };
    input.addEventListener("change", handler);
    input.click();
  },
  deactivate() {},
};

export const whiteout = {
  id: "whiteout", label: "White-out", icon: "whiteout", group: "protect", shortcut: "",
  cursor: "crosshair", usesSelection: false, hint: "Drag to cover content with a colored box",
  options: [{ key: "fill", type: "color", label: "Color", default: "#ffffff" }],
  _draft: null, _origin: null, _pageId: null,
  activate() {}, deactivate(ctx) { if (this._draft && this._pageId) ctx.removeObject(this._pageId, this._draft.id); this._draft = this._origin = this._pageId = null; },
  onPointerDown(page, ptr, ctx) {
    const o = ctx.getOptions();
    this._origin = { x: ptr.x, y: ptr.y }; this._pageId = page.pageId;
    const r = new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, fill: o.fill, stroke: "", strokeWidth: 0 });
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
    if (r.width < 3 || r.height < 3) { ctx.removeObject(page.pageId, r.id); this._pageId = null; return; }
    ctx.commitFor(page.pageId, "White-out"); this._pageId = null;
  },
  canStyle: (obj) => obj.toolId === "whiteout",
};
