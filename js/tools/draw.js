/* Freehand pen + highlighter (Fabric drawing mode). */
import { hexToRgba } from "../core/util.js";

export const pen = {
  id: "pen", label: "Pen", icon: "draw", group: "markup", shortcut: "p",
  cursor: "crosshair", usesSelection: false, drawing: true,
  options: [
    { key: "color", type: "color", label: "Color", default: "#e3242b" },
    { key: "width", type: "number", label: "Weight", default: 3, min: 1, max: 40, step: 1 },
    { key: "opacity", type: "slider", label: "Opacity", default: 1, min: 0.1, max: 1, step: 0.05 },
  ],
  brush(opts, canvas, fabric) {
    const b = new fabric.PencilBrush(canvas);
    b.color = hexToRgba(opts.color, opts.opacity);
    b.width = opts.width;
    return b;
  },
  activate() {}, deactivate() {},
  onPathCreated(page, path, ctx) {
    path.set({ strokeLineCap: "round", strokeLineJoin: "round" });
    ctx.commitFor(page.pageId, "Draw");
  },
};

export const highlighter = {
  id: "highlighter", label: "Highlighter", icon: "highlight", group: "markup", shortcut: "k",
  cursor: "crosshair", usesSelection: false, drawing: true,
  options: [
    { key: "color", type: "color", label: "Color", default: "#ffd400" },
    { key: "width", type: "number", label: "Weight", default: 18, min: 6, max: 60, step: 1 },
  ],
  brush(opts, canvas, fabric) {
    const b = new fabric.PencilBrush(canvas);
    b.color = hexToRgba(opts.color, 0.4);
    b.width = opts.width;
    b.strokeLineCap = "round";
    return b;
  },
  activate() {}, deactivate() {},
  onPathCreated(page, path, ctx) {
    path.set({ globalCompositeOperation: "multiply", strokeLineCap: "round", strokeLineJoin: "round" });
    page.canvas.requestRenderAll();
    ctx.commitFor(page.pageId, "Highlight");
  },
};
