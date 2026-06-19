/* Sticky note, signature, stamp. */
import { readFileAsDataUrl } from "../core/util.js";
const fabric = window.fabric;

function pickImage() {
  return new Promise((resolve) => {
    const input = document.getElementById("imageInput");
    if (!input) return resolve(null);
    const handler = async () => {
      input.removeEventListener("change", handler);
      const f = input.files[0]; input.value = "";
      resolve(f ? await readFileAsDataUrl(f) : null);
    };
    input.addEventListener("change", handler);
    input.click();
  });
}
const loadCustomStamp = () => { try { return localStorage.getItem("pe-custom-stamp"); } catch { return null; } };

/* ---- Sticky note ---- */
export const note = {
  id: "note", label: "Sticky note", icon: "comment", group: "insert", shortcut: "n",
  cursor: "copy", usesSelection: false, hint: "Click to drop a note; double-click a note to edit it",
  options: [{ key: "color", type: "color", label: "Color", default: "#ffd400" }],
  activate() {}, deactivate() {},
  async onPointerDown(page, ptr, ctx) {
    const o = ctx.getOptions();
    const text = await (ctx.util.prompt
      ? ctx.util.prompt({ title: "Sticky note", label: "Comment", multiline: true })
      : Promise.resolve(window.prompt("Note text:")));
    if (text == null) return;
    const pin = makeNotePin(ptr.x, ptr.y, o.color);
    pin.meta = { kind: "note", text: text || "", author: "You", created: Date.now(), replies: [], status: "open" };
    ctx.addObject(page.pageId, pin, { select: false });
    ctx.commitFor(page.pageId, "Add note");
    ctx.bus.emit("comments:changed", { pageId: page.pageId });
  },
  canStyle: (obj) => obj.meta && obj.meta.kind === "note",
};

function makeNotePin(x, y, color) {
  const s = 28 * 2; // overlay units
  const body = new fabric.Rect({ left: 0, top: 0, width: s, height: s * 0.82, rx: 6, ry: 6, fill: color, stroke: "rgba(0,0,0,.25)", strokeWidth: 1 });
  const fold = new fabric.Triangle({ left: s * 0.62, top: s * 0.62, width: s * 0.38, height: s * 0.38, fill: "rgba(0,0,0,.18)", angle: 180 });
  const l1 = new fabric.Rect({ left: s * 0.16, top: s * 0.22, width: s * 0.68, height: 3, fill: "rgba(0,0,0,.45)" });
  const l2 = new fabric.Rect({ left: s * 0.16, top: s * 0.38, width: s * 0.5, height: 3, fill: "rgba(0,0,0,.45)" });
  const g = new fabric.Group([body, fold, l1, l2], { left: x, top: y });
  g.toolId = "note";
  return g;
}

/* ---- Signature: type a name -> render to image, reusable from localStorage ---- */
export const signature = {
  id: "signature", label: "Signature", icon: "sign", group: "insert", shortcut: "",
  cursor: "default", usesSelection: false, isInstant: true, options: [],
  activate(ctx) {
    const saved = loadSavedSignature();
    const placeUrl = (url) => {
      fabric.Image.fromURL(url, (img) => {
        const page = ctx.getActivePage();
        if (!page) { ctx.util.toast("Scroll to a page first", "error"); return; }
        const canvas = page.canvas;
        const targetW = canvas.width * 0.28;
        const scale = targetW / img.width;
        img.set({ left: canvas.width * 0.1, top: canvas.height * 0.78, scaleX: scale, scaleY: scale });
        img.toolId = "signature";
        ctx.setActiveTool("select");
        ctx.addObject(page.pageId, img, { select: true });
        ctx.commitFor(page.pageId, "Add signature");
      });
    };
    if (ctx.util.signatureDialog) {
      ctx.util.signatureDialog(saved).then((url) => { if (url) { saveSignature(url); placeUrl(url); } });
    } else {
      const name = window.prompt("Type your signature:", "");
      if (!name) return;
      const url = renderTypedSignature(name);
      saveSignature(url); placeUrl(url);
    }
  },
  deactivate() {},
};

export function renderTypedSignature(name, color = "#0a2540") {
  const c = document.createElement("canvas");
  const font = "italic 600 64px 'Brush Script MT','Segoe Script',cursive";
  const ctx = c.getContext("2d");
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(name).width) + 40;
  c.width = w; c.height = 110;
  const x = c.getContext("2d");
  x.font = font; x.fillStyle = color; x.textBaseline = "middle";
  x.fillText(name, 20, 58);
  return c.toDataURL("image/png");
}
function saveSignature(url) { try { localStorage.setItem("pe-signature", url); } catch {} }
function loadSavedSignature() { try { return localStorage.getItem("pe-signature"); } catch { return null; } }

/* ---- Stamp ---- */
const STAMPS = {
  APPROVED: "#16a34a", DRAFT: "#6b7280", CONFIDENTIAL: "#dc2626",
  REVIEWED: "#2563eb", "FINAL": "#7c3aed", "NOT APPROVED": "#dc2626",
};
export const stamp = {
  id: "stamp", label: "Stamp", icon: "stamp", group: "insert", shortcut: "",
  cursor: "copy", usesSelection: false,
  options: [
    { key: "text", type: "select", label: "Stamp", default: "APPROVED",
      choices: [...Object.keys(STAMPS).map((k) => ({ value: k, label: k })), { value: "__custom__", label: "Custom image…" }] },
    { key: "dated", type: "toggle", label: "Date", default: false },
  ],
  _customUrl: null,
  activate() { this._customUrl = loadCustomStamp(); },
  deactivate() {},
  async onOptionsChanged(opts, ctx) {
    if (opts.text === "__custom__") {
      const url = await pickImage();
      if (url) { this._customUrl = url; try { localStorage.setItem("pe-custom-stamp", url); } catch {} ctx.util.toast("Custom stamp ready — click the page to place it.", "success"); }
    }
  },
  onPointerDown(page, ptr, ctx) {
    const o = ctx.getOptions();
    if (o.text === "__custom__") {
      const url = this._customUrl || loadCustomStamp();
      if (!url) { pickImage().then((u) => { if (u) { this._customUrl = u; try { localStorage.setItem("pe-custom-stamp", u); } catch {} } }); return; }
      fabric.Image.fromURL(url, (img) => {
        const s = (page.canvas.width * 0.25) / img.width;
        img.set({ left: ptr.x, top: ptr.y, originX: "center", originY: "center", scaleX: s, scaleY: s });
        img.toolId = "stamp";
        ctx.addObject(page.pageId, img, { select: false });
        ctx.commitFor(page.pageId, "Add stamp");
      });
      return;
    }
    const g = makeStamp(o.text, STAMPS[o.text] || "#dc2626", o.dated);
    g.set({ left: ptr.x, top: ptr.y, angle: -8, originX: "center", originY: "center" });
    ctx.addObject(page.pageId, g, { select: false });
    ctx.commitFor(page.pageId, "Add stamp");
  },
  canStyle: (obj) => obj.toolId === "stamp",
};

function makeStamp(label, color, dated) {
  const padX = 24, padY = 12;
  const tmp = new fabric.Text(label, { fontSize: 48, fontWeight: "bold", fontFamily: "Arial", fill: color });
  const w = tmp.width + padX * 2, h = tmp.height + padY * 2 + (dated ? 30 : 0);
  const box = new fabric.Rect({ left: 0, top: 0, width: w, height: h, rx: 8, ry: 8, fill: "rgba(255,255,255,0.0)", stroke: color, strokeWidth: 4 });
  tmp.set({ left: padX, top: padY });
  const parts = [box, tmp];
  if (dated) {
    const d = new fabric.Text(new Date().toLocaleDateString(), { left: padX, top: padY + tmp.height + 4, fontSize: 22, fontFamily: "Arial", fill: color });
    parts.push(d);
  }
  const g = new fabric.Group(parts, { opacity: 0.92 });
  g.toolId = "stamp";
  return g;
}
