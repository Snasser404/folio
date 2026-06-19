/* Right inspector: contextual object properties, or document properties. */
import { bus, state, getPage } from "../core/state.js";
import { iconSvg } from "../ui/icon.js";

export function initPropertiesPanel(ctx) {
  const root = document.getElementById("inspector");
  bus.on("selection:changed", render);
  bus.on("doc:opened", render);
  bus.on("doc:dirty", () => { if (!state.selection.objectIds.length) render(); });
  render();

  function render() {
    const sel = state.selection;
    const canvas = sel.pageId ? ctx.getCanvas(sel.pageId) : null;
    const objs = canvas ? canvas.getActiveObjects() : [];
    root.innerHTML = "";
    if (objs.length) renderObject(objs, sel.pageId, canvas);
    else renderDoc();
  }

  function renderDoc() {
    if (!state.doc.loaded) { root.innerHTML = '<div class="empty-note">No document open.</div>'; return; }
    const p = getPage(state.view.focusedPageId) || state.pages[0];
    const sec = el(`<div class="panel-header">Document</div>`);
    root.append(sec);
    root.append(kv("File", state.doc.fileName || "Untitled.pdf"));
    root.append(kv("Pages", String(state.pages.length)));
    if (p) root.append(kv("Page size", `${Math.round(p.size.w)} × ${Math.round(p.size.h)} pt`));
    const hint = el('<div class="panel-section muted" style="font-size:12px">Select an object to edit its properties.</div>');
    root.append(hint);
  }

  function renderObject(objs, pageId, canvas) {
    const multi = objs.length > 1;
    const o = objs[0];
    root.append(el(`<div class="panel-header">${multi ? objs.length + " objects" : prettyType(o)}</div>`));

    // Opacity
    const opacity = secRow("Opacity");
    const range = input("range", o.opacity ?? 1, { min: 0.1, max: 1, step: 0.05 });
    range.addEventListener("input", () => { objs.forEach((x) => x.set("opacity", parseFloat(range.value))); canvas.requestRenderAll(); });
    range.addEventListener("change", () => ctx.commitFor(pageId, "Opacity"));
    opacity.appendChild(range);
    root.append(wrapSection(opacity));

    // Color (stroke/fill or text fill)
    if (hasColor(o)) {
      const isText = o.type === "i-text" || o.type === "textbox" || o.type === "text";
      const colorRow = secRow(isText ? "Text color" : "Color");
      const cur = (isText ? o.fill : (o.stroke || o.fill)) || "#000000";
      const ci = input("color", normColor(cur));
      ci.addEventListener("input", () => {
        objs.forEach((x) => { if (isText) x.set("fill", ci.value); else x.set(x.stroke ? "stroke" : "fill", ci.value); });
        canvas.requestRenderAll();
      });
      ci.addEventListener("change", () => ctx.commitFor(pageId, "Color"));
      colorRow.appendChild(ci);
      root.append(wrapSection(colorRow));
    }

    // Position / size (read-only-ish display)
    const b = o.getBoundingRect ? o.getBoundingRect() : { left: o.left, top: o.top, width: o.width, height: o.height };
    root.append(kv("X / Y", `${Math.round(b.left / ctx.OVERLAY_SCALE)} / ${Math.round(b.top / ctx.OVERLAY_SCALE)} pt`));
    root.append(kv("W / H", `${Math.round(b.width / ctx.OVERLAY_SCALE)} × ${Math.round(b.height / ctx.OVERLAY_SCALE)} pt`));

    // Z-order + actions
    const actions = el(`<div class="panel-section" style="display:flex;flex-wrap:wrap;gap:6px"></div>`);
    actions.append(
      mkBtn("To front", () => { objs.forEach((x) => x.bringToFront()); canvas.requestRenderAll(); ctx.commitFor(pageId, "Reorder"); }),
      mkBtn("To back", () => { objs.forEach((x) => x.sendToBack()); canvas.requestRenderAll(); ctx.commitFor(pageId, "Reorder"); }),
      mkBtn("Duplicate", () => duplicate(objs, pageId, canvas)),
      mkBtn("Delete", () => { objs.forEach((x) => canvas.remove(x)); canvas.discardActiveObject(); canvas.requestRenderAll(); ctx.commitFor(pageId, "Delete"); }, "danger"),
    );
    root.append(actions);
  }

  function duplicate(objs, pageId, canvas) {
    ctx.beginBatch();
    objs.forEach((x) => x.clone((c) => { c.set({ left: x.left + 16, top: x.top + 16 }); c.id = undefined; ctx.addObject(pageId, c, { select: false }); }));
    ctx.endBatch("Duplicate");
    ctx.commitFor(pageId, "Duplicate");
  }
}

/* ---- tiny DOM helpers ---- */
function el(html) { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild || d; }
function kv(k, v) {
  const d = document.createElement("div"); d.className = "panel-section";
  d.innerHTML = `<div class="row"><label>${k}</label><span class="tnum">${v}</span></div>`;
  return d;
}
function secRow(label) {
  const d = document.createElement("div"); d.className = "row"; d.style.alignItems = "center";
  d.innerHTML = `<label>${label}</label>`;
  return d;
}
function wrapSection(row) { const s = document.createElement("div"); s.className = "panel-section"; s.appendChild(row); return s; }
function input(type, value, attrs = {}) {
  const i = document.createElement("input"); i.type = type; i.value = value;
  if (type === "range") i.style.width = "120px";
  if (type === "color") { i.className = ""; i.style.cssText = "width:32px;height:26px;border:1px solid var(--border);border-radius:6px;background:none;cursor:pointer"; }
  Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k, v));
  return i;
}
function mkBtn(label, onClick, cls = "ghost") {
  const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.style.flex = "1 0 44%";
  b.addEventListener("click", onClick); return b;
}
function prettyType(o) {
  const map = { "i-text": "Text", textbox: "Text", rect: "Rectangle", ellipse: "Ellipse", line: "Line", group: "Group", image: "Image", path: "Drawing", triangle: "Shape" };
  if (o.toolId === "note") return "Sticky note";
  if (o.toolId === "stamp") return "Stamp";
  if (o.toolId === "signature") return "Signature";
  if (o.toolId === "text-markup") return "Text markup";
  return map[o.type] || "Object";
}
function hasColor(o) { return o.type !== "image" && o.type !== "group"; }
function normColor(c) { if (!c || c === "transparent" || String(c).startsWith("rgba(0,0,0,0")) return "#000000"; if (String(c).startsWith("rgb")) return rgbToHex(c); return c; }
function rgbToHex(rgb) {
  const m = rgb.match(/\d+/g); if (!m) return "#000000";
  return "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");
}
