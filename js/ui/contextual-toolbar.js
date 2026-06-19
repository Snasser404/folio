/* Contextual sub-toolbar — auto-rendered from the active tool's options schema. */
import { bus, state } from "../core/state.js";
import { getTool } from "../tools/registry.js";

// Range of characters highlighted inside an editing IText, snapshotted the moment a
// toolbar control is pressed — before it steals focus and collapses the selection.
let grabbedRange = null;

export function initContextbar(ctx) {
  const bar = document.getElementById("contextbar");

  // Capture phase: fires before the control receives focus / the canvas text editor blurs.
  bar.addEventListener("pointerdown", () => {
    const sel = state.selection;
    const objs = sel && sel.pageId ? ctx.getSelected(sel.pageId) : [];
    const o = objs && objs.length === 1 ? objs[0] : null;
    grabbedRange = (o && isTextObj(o) && o.selectionStart != null && o.selectionEnd != null && o.selectionEnd > o.selectionStart)
      ? { obj: o, start: o.selectionStart, end: o.selectionEnd }
      : null;
  }, true);

  function render(toolId) {
    const tool = getTool(toolId);
    bar.innerHTML = "";
    if (!tool) { bar.classList.add("empty"); return; }
    bar.classList.remove("empty");

    const label = document.createElement("span");
    label.className = "ctx-label";
    label.textContent = tool.label;
    bar.appendChild(label);

    if (tool.hint) {
      const hint = document.createElement("span");
      hint.className = "ctx-hint";
      hint.textContent = tool.hint;
      bar.appendChild(hint);
    }

    const opts = ctx.getOptions();
    (tool.options || []).forEach((spec) => bar.appendChild(makeControl(spec, opts, ctx)));
  }

  // When something is selected (in Select mode), show controls to edit it —
  // so text formatting stays available without re-picking the Text tool.
  function renderActive() {
    const sel = state.selection;
    const tool = getTool(state.view.activeTool);
    if (tool && tool.usesSelection && sel.objectIds && sel.objectIds.length && ctx.getSelected(sel.pageId).length) {
      renderSelection(bar, sel.pageId, ctx);
    } else {
      render(state.view.activeTool);
    }
  }

  bus.on("tool:changed", renderActive);
  bus.on("selection:changed", renderActive);
  renderActive();
}

const FONTS = ["Helvetica", "Arial", "Times New Roman", "Georgia", "Courier New", "Verdana"];
const hasStroke = (o) => o.stroke && o.stroke !== "" && o.type !== "image";
const isTextObj = (o) => o.type === "i-text" || o.type === "textbox" || o.type === "text";

function renderSelection(bar, pageId, ctx) {
  const objs = ctx.getSelected(pageId);
  bar.innerHTML = ""; bar.classList.remove("empty");
  const o0 = objs[0];
  const title = document.createElement("span");
  title.className = "ctx-label";
  title.textContent = objs.length > 1 ? `${objs.length} selected` : prettyType(o0);
  bar.appendChild(title);

  const apply = (fn, label) => { objs.forEach(fn); const c = ctx.getCanvas(pageId); if (c) c.requestRenderAll(); ctx.commitFor(pageId, label); };

  // Apply a text style to ONLY the highlighted character range when one exists,
  // otherwise to the whole object(s). Lets you resize/recolor a single word.
  const applyText = (style, label) => {
    const r = (objs.length === 1 && grabbedRange && grabbedRange.obj === o0 && grabbedRange.end > grabbedRange.start) ? grabbedRange : null;
    if (r && typeof o0.setSelectionStyles === "function") {
      o0.setSelectionStyles(style, r.start, r.end);
      o0.selectionStart = r.start; o0.selectionEnd = r.end;   // keep the highlight if still editing
      o0.set("dirty", true); if (o0.initDimensions) o0.initDimensions();
    } else {
      objs.forEach((o) => { o.set(style); o.set("dirty", true); if (o.initDimensions) o.initDimensions(); });
    }
    const c = ctx.getCanvas(pageId); if (c) c.requestRenderAll();
    ctx.commitFor(pageId, label);
  };

  if (objs.every(isTextObj)) {
    // For edit-text objects, show what the ORIGINAL text was (font / type / size)
    // and a one-click way to restore it — so a mismatched replacement is recoverable.
    const det = (objs.length === 1 && o0.toolId === "edit-text" && o0.detected) ? o0.detected : null;
    if (det) {
      bar.appendChild(detectedChip(det));
      bar.appendChild(mkbtn("Reset", () => apply((o) => {
        const d = o.detected; if (!d) return;
        o.set({ fontFamily: d.family, fontSize: d.sizePt * ctx.OVERLAY_SCALE, fontWeight: d.weight, fontStyle: d.style });
      }, "Reset to original font"), "ghost", "Restore the original detected font, size, weight & style"));
    }
    const fontChoices = FONTS.map((f) => ({ value: f, label: f }));
    if (det && det.family && !fontChoices.some((c) => c.value === det.family)) {
      fontChoices.unshift({ value: det.family, label: "Original — " + (prettyFontName(det.psName) || catLabel(det.category)) });
    }
    bar.appendChild(sel("Font", fontChoices, o0.fontFamily || "Helvetica", (v) => applyText({ fontFamily: v }, "Font")));
    bar.appendChild(num("Size", Math.round((o0.fontSize || 16) / ctx.OVERLAY_SCALE), 6, 400, (v) => applyText({ fontSize: v * ctx.OVERLAY_SCALE }, "Size")));
    bar.appendChild(color("Color", o0.fill, (v) => applyText({ fill: v }, "Color")));
    bar.appendChild(toggle("B", o0.fontWeight === "bold", (on) => applyText({ fontWeight: on ? "bold" : "normal" }, "Bold")));
    bar.appendChild(toggle("I", o0.fontStyle === "italic", (on) => applyText({ fontStyle: on ? "italic" : "normal" }, "Italic")));
  } else {
    if (hasStroke(o0)) bar.appendChild(color("Color", o0.stroke, (v) => apply((o) => { if (hasStroke(o)) o.set("stroke", v); }, "Color")));
    bar.appendChild(num("Weight", Math.round(o0.strokeWidth || 1), 1, 80, (v) => apply((o) => o.set("strokeWidth", v), "Weight")));
    bar.appendChild(slider("Opacity", o0.opacity == null ? 1 : o0.opacity, (v) => apply((o) => o.set("opacity", v), "Opacity")));
  }

  const front = mkbtn("Front", () => apply((o) => o.bringToFront(), "Reorder"));
  const back = mkbtn("Back", () => apply((o) => o.sendToBack(), "Reorder"));
  const del = mkbtn("Delete", () => { const c = ctx.getCanvas(pageId); objs.forEach((o) => c.remove(o)); c.discardActiveObject(); c.requestRenderAll(); ctx.commitFor(pageId, "Delete"); }, "danger");
  bar.append(front, back, del);
}

/* compact control builders for the selection bar */
function lbl(t) { const s = document.createElement("span"); s.className = "lbl"; s.textContent = t; return s; }
function wrap() { const w = document.createElement("label"); w.className = "ctl"; return w; }
function sel(label, choices, val, on) { const w = wrap(); w.append(lbl(label)); const s = document.createElement("select"); s.className = "field"; choices.forEach((c) => { const o = document.createElement("option"); o.value = c.value; o.textContent = c.label; if (c.value === val) o.selected = true; s.append(o); }); s.addEventListener("change", () => on(s.value)); w.append(s); return w; }
function num(label, val, min, max, on) { const w = wrap(); w.append(lbl(label)); const b = document.createElement("span"); b.className = "numlabel"; const i = document.createElement("input"); i.type = "number"; i.min = min; i.max = max; i.value = val; i.addEventListener("change", () => on(parseFloat(i.value) || min)); b.append(i); w.append(b); return w; }
function color(label, val, on) { const w = wrap(); w.append(lbl(label)); const f = document.createElement("span"); f.className = "color-field"; const sw = document.createElement("i"); const i = document.createElement("input"); i.type = "color"; const hex = normColor(val); i.value = hex; sw.style.background = hex; i.addEventListener("input", () => { sw.style.background = i.value; on(i.value); }); f.append(sw, i); w.append(f); return w; }
function slider(label, val, on) { const w = wrap(); w.append(lbl(label)); const r = document.createElement("input"); r.type = "range"; r.min = 0.1; r.max = 1; r.step = 0.05; r.value = val; const out = document.createElement("span"); out.className = "tnum"; out.textContent = Math.round(val * 100) + "%"; r.addEventListener("input", () => { out.textContent = Math.round(r.value * 100) + "%"; on(parseFloat(r.value)); }); w.append(r, out); return w; }
function toggle(label, on0, on) { const b = document.createElement("button"); b.className = "btn ghost"; b.style.cssText = "height:28px;min-width:30px;font-weight:700"; b.textContent = label; let st = on0; const paint = () => { b.style.background = st ? "var(--accent-soft)" : ""; b.style.color = st ? "var(--accent)" : ""; }; paint(); b.addEventListener("mousedown", (e) => e.preventDefault()); b.addEventListener("click", (e) => { e.preventDefault(); st = !st; paint(); on(st); }); return b; }
function mkbtn(label, onClick, cls = "ghost", title) { const b = document.createElement("button"); b.className = "btn " + cls; b.style.cssText = "height:28px;padding:0 10px"; b.textContent = label; if (title) b.title = title; b.addEventListener("click", onClick); return b; }

/* "Detected original" readout for edit-text objects: font name · type · size */
function catLabel(cat) { return cat === "serif" ? "Serif" : cat === "mono" ? "Monospace" : "Sans-serif"; }
function prettyFontName(ps) {
  if (!ps) return "";
  let n = String(ps).replace(/^[A-Z]{6}\+/, "");        // drop subset prefix "ABCDEF+"
  n = n.replace(/[-_ ]?(PSMT|MT|PS)$/i, "");             // drop trailing PostScript markers
  n = n.replace(/[-_]+/g, " ");                          // separators -> spaces
  n = n.replace(/([a-z0-9])([A-Z])/g, "$1 $2");         // TimesNewRoman -> Times New Roman
  return n.replace(/\s+/g, " ").trim();
}
function detectedChip(det) {
  const s = document.createElement("span");
  s.className = "ctx-detected";
  const name = prettyFontName(det.psName);
  const display = name || catLabel(det.category);
  const meta = (name ? catLabel(det.category) + " · " : "") + det.sizePt + " pt";
  const key = document.createElement("span"); key.className = "cd-key"; key.textContent = "Original";
  const nm = document.createElement("b"); nm.className = "cd-name"; nm.textContent = display;
  const mt = document.createElement("span"); mt.className = "cd-meta"; mt.textContent = meta;
  s.append(key, nm, mt);
  s.title = (det.psName ? "Detected font: " + det.psName + "\n" : "") + "Click Reset to restore this exactly.";
  return s;
}
function prettyType(o) {
  if (o.toolId === "note") return "Sticky note"; if (o.toolId === "stamp") return "Stamp";
  if (o.toolId === "signature") return "Signature"; if (o.toolId === "text-markup") return "Markup";
  if (o.toolId === "measure") return "Measurement"; if (o.toolId === "link") return "Link";
  const m = { "i-text": "Text", textbox: "Text", rect: "Rectangle", ellipse: "Ellipse", line: "Line", group: "Group", image: "Image", path: "Drawing", triangle: "Shape" };
  return m[o.type] || "Object";
}
function normColor(c) { if (!c || c === "transparent" || String(c).startsWith("rgba(0,0,0,0")) return "#000000"; if (String(c).startsWith("rgb")) { const m = c.match(/\d+/g); return m ? "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("") : "#000000"; } return c; }

function makeControl(spec, opts, ctx) {
  const wrap = document.createElement("label");
  wrap.className = "ctl";
  const val = opts[spec.key] !== undefined ? opts[spec.key] : spec.default;
  const set = (v) => ctx.setOptions({ [spec.key]: v });

  if (spec.type === "color") {
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = spec.label;
    const field = document.createElement("span"); field.className = "color-field";
    const swatch = document.createElement("i");
    const input = document.createElement("input"); input.type = "color";
    const isTransparent = val === "transparent";
    input.value = isTransparent ? "#ffffff" : val;
    swatch.style.background = isTransparent ? "transparent" : val;
    input.addEventListener("input", () => { swatch.style.background = input.value; set(input.value); });
    field.append(swatch, input);
    wrap.append(lbl, field);
    if (spec.allowTransparent !== false && (spec.key === "fill")) {
      const none = document.createElement("button"); none.className = "btn ghost"; none.textContent = "None";
      none.style.height = "26px"; none.style.padding = "0 8px";
      none.addEventListener("click", (e) => { e.preventDefault(); swatch.style.background = "transparent"; set("transparent"); });
      wrap.append(none);
    }
  } else if (spec.type === "number") {
    const box = document.createElement("span"); box.className = "numlabel";
    const lbl = document.createElement("span"); lbl.textContent = spec.label; lbl.className = "lbl"; lbl.style.marginRight = "2px";
    const input = document.createElement("input"); input.type = "number";
    input.min = spec.min ?? 0; input.max = spec.max ?? 999; input.step = spec.step ?? 1; input.value = val;
    input.addEventListener("change", () => set(parseFloat(input.value)));
    wrap.append(lbl, box); box.appendChild(input);
  } else if (spec.type === "slider") {
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = spec.label;
    const input = document.createElement("input"); input.type = "range";
    input.min = spec.min ?? 0; input.max = spec.max ?? 1; input.step = spec.step ?? 0.05; input.value = val;
    const out = document.createElement("span"); out.className = "tnum"; out.style.minWidth = "30px";
    out.textContent = fmt(val, spec);
    input.addEventListener("input", () => { out.textContent = fmt(parseFloat(input.value), spec); set(parseFloat(input.value)); });
    wrap.append(lbl, input, out);
  } else if (spec.type === "select") {
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = spec.label;
    const sel = document.createElement("select"); sel.className = "field";
    (spec.choices || []).forEach((c) => { const o = document.createElement("option"); o.value = c.value; o.textContent = c.label; if (c.value === val) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", () => set(sel.value));
    wrap.append(lbl, sel);
  } else if (spec.type === "toggle") {
    wrap.className = "ctl";
    const btn = document.createElement("button");
    btn.className = "btn ghost" + (val ? " active-toggle" : "");
    btn.textContent = spec.label;
    btn.style.height = "28px";
    if (val) { btn.style.background = "var(--accent-soft)"; btn.style.color = "var(--accent)"; }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const nv = !(state.view.toolOptions[spec.key]);
      btn.style.background = nv ? "var(--accent-soft)" : "";
      btn.style.color = nv ? "var(--accent)" : "";
      set(nv);
    });
    wrap.append(btn);
  }
  return wrap;
}

function fmt(v, spec) {
  if (spec.max <= 1) return Math.round(v * 100) + "%";
  return String(v);
}
