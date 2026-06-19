/* Text markup on REAL PDF text: highlight / underline / strikethrough.
 * Works by letting the browser select the pdf.js text layer, then converting the
 * selection's client rects into Fabric overlay objects on the right page. */
const fabric = window.fabric;

export const textMarkup = {
  id: "text-markup", label: "Markup text", icon: "markup", group: "markup", shortcut: "u",
  cursor: "text", usesSelection: false, usesTextLayer: true,
  options: [
    { key: "style", type: "select", label: "Style", default: "highlight",
      choices: [
        { value: "highlight", label: "Highlight" },
        { value: "underline", label: "Underline" },
        { value: "strikethrough", label: "Strikethrough" },
      ] },
    { key: "color", type: "color", label: "Color", default: "#ffd400" },
  ],
  activate(ctx) {
    this._ctx = ctx;
    this._handler = () => this._onMouseUp();
    document.addEventListener("mouseup", this._handler);
  },
  deactivate() {
    if (this._handler) document.removeEventListener("mouseup", this._handler);
    this._handler = null;
  },
  _onMouseUp() {
    const ctx = this._ctx;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const hostEl = node && node.closest(".page-host");
    if (!hostEl) return;
    const pageId = hostEl.dataset.pageId;
    const canvas = ctx.getCanvas(pageId);
    if (!canvas) { sel.removeAllRanges(); return; }

    const o = ctx.getOptions();
    const rects = mergeLines([...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1));
    if (!rects.length) { sel.removeAllRanges(); return; }

    const objs = [];
    for (const r of rects) {
      const tl = ctx.screenToOverlay(pageId, r.left, r.top);
      const br = ctx.screenToOverlay(pageId, r.right, r.bottom);
      const w = br.x - tl.x, h = br.y - tl.y;
      objs.push(makeMark(o.style, o.color, tl.x, tl.y, w, h));
    }
    const group = objs.length === 1 ? objs[0] : new fabric.Group(objs);
    group.toolId = "text-markup";
    group.meta = { style: o.style };
    ctx.addObject(pageId, group, { select: false });
    ctx.commitFor(pageId, "Markup text");
    sel.removeAllRanges();
  },
  canStyle: (obj) => obj.toolId === "text-markup",
};

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function makeMark(style, color, x, y, w, h) {
  if (style === "highlight") {
    return new fabric.Rect({
      left: x, top: y, width: w, height: h, fill: hexToRgba(color, 0.4),
      stroke: "", globalCompositeOperation: "multiply", selectable: false,
    });
  }
  const thickness = Math.max(2, h * 0.08);
  const yy = style === "underline" ? y + h - thickness : y + h / 2 - thickness / 2;
  return new fabric.Rect({ left: x, top: yy, width: w, height: thickness, fill: color, stroke: "" });
}

/* Merge client rects that share a text line into one rect. */
function mergeLines(rects) {
  if (!rects.length) return [];
  const sorted = rects.slice().sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.top - last.top) < r.height * 0.6) {
      const left = Math.min(last.left, r.left), right = Math.max(last.right, r.right);
      last.left = left; last.right = right;
      last.top = Math.min(last.top, r.top); last.bottom = Math.max(last.bottom, r.bottom);
    } else {
      lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height });
    }
  }
  return lines.map((l) => ({ left: l.left, top: l.top, right: l.right, bottom: l.bottom, width: l.right - l.left, height: l.bottom - l.top }));
}
