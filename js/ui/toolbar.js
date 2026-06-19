/* Main toolbar: file actions, tool groups, history, view controls. */
import { TOOLBAR_GROUPS, getTool } from "../tools/registry.js";
import { bus, setZoom, setFitMode } from "../core/state.js";
import { iconSvg } from "./icon.js";

export function initToolbar(ctx) {
  const tb = document.getElementById("toolbar");
  tb.innerHTML = "";

  const mkTool = (toolId) => {
    const t = getTool(toolId);
    if (!t) return null;
    const b = document.createElement("button");
    b.className = "tool";
    b.dataset.toolId = t.id;
    const tip = t.label + (t.shortcut ? `  ${t.shortcut.toUpperCase()}` : "");
    b.setAttribute("data-tip", tip);
    b.setAttribute("aria-label", t.label);
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = iconSvg(t.icon);
    b.addEventListener("click", () => ctx.setActiveTool(t.id));
    return b;
  };
  const mkBtn = (icon, tip, onClick, cls = "tool") => {
    const b = document.createElement("button");
    b.className = cls;
    b.setAttribute("data-tip", tip);
    b.setAttribute("aria-label", tip);
    b.innerHTML = iconSvg(icon);
    b.addEventListener("click", onClick);
    return b;
  };
  const sep = () => { const s = document.createElement("div"); s.className = "sep"; return s; };
  const group = (...nodes) => { const g = document.createElement("div"); g.className = "tgroup"; nodes.filter(Boolean).forEach((n) => g.appendChild(n)); return g; };

  // File
  tb.appendChild(group(
    mkBtn("open", "Open PDF  Ctrl+O", () => bus.emit("action:open")),
    mkBtn("save", "Download  Ctrl+S", () => bus.emit("action:save")),
  ));
  tb.appendChild(sep());

  // Tools by group
  TOOLBAR_GROUPS.forEach((grp, i) => {
    const nodes = grp.tools.map(mkTool);
    tb.appendChild(group(...nodes));
    if (i < TOOLBAR_GROUPS.length - 1) tb.appendChild(sep());
  });

  tb.appendChild(sep());
  // History
  const undoBtn = mkBtn("undo", "Undo  Ctrl+Z", () => bus.emit("action:undo"));
  const redoBtn = mkBtn("redo", "Redo  Ctrl+Y", () => bus.emit("action:redo"));
  undoBtn.disabled = true; redoBtn.disabled = true;
  tb.appendChild(group(undoBtn, redoBtn));

  // Spacer + view
  const spacer = document.createElement("div"); spacer.className = "tspacer"; tb.appendChild(spacer);
  const zoomDisplay = document.createElement("button");
  zoomDisplay.className = "btn ghost tnum"; zoomDisplay.id = "zoomDisplay";
  zoomDisplay.style.minWidth = "58px"; zoomDisplay.textContent = "100%";
  zoomDisplay.setAttribute("data-tip", "Zoom level");
  zoomDisplay.addEventListener("click", () => openZoomMenu(zoomDisplay));
  tb.appendChild(group(
    mkBtn("zoom-out", "Zoom out", () => bus.emit("action:zoom-out")),
    zoomDisplay,
    mkBtn("zoom-in", "Zoom in", () => bus.emit("action:zoom-in")),
    mkBtn("fit-width", "Fit width", () => bus.emit("action:fit")),
  ));
  bus.on("view:zoom", (z) => { zoomDisplay.textContent = Math.round(z * 100) + "%"; });

  // active-tool highlight
  bus.on("tool:changed", ({ id }) => {
    tb.querySelectorAll(".tool[data-tool-id]").forEach((b) => {
      const on = b.dataset.toolId === id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  });
  bus.on("history:changed", ({ canUndo, canRedo }) => {
    undoBtn.disabled = !canUndo; redoBtn.disabled = !canRedo;
  });
}

function openZoomMenu(anchor) {
  const root = document.getElementById("flyoutRoot");
  if (root.querySelector(".flyout")) { root.innerHTML = ""; return; }
  const fly = document.createElement("div");
  fly.className = "flyout";
  const items = [
    ["50%", () => setZoomPct(0.5)], ["75%", () => setZoomPct(0.75)], ["100%", () => setZoomPct(1)],
    ["125%", () => setZoomPct(1.25)], ["150%", () => setZoomPct(1.5)], ["200%", () => setZoomPct(2)],
    ["__sep__"], ["Fit width", () => bus.emit("action:fit")], ["Fit page", () => bus.emit("action:fit-page")],
  ];
  items.forEach(([label, fn]) => {
    if (label === "__sep__") { const s = document.createElement("div"); s.className = "flyout-sep"; fly.appendChild(s); return; }
    const b = document.createElement("button");
    b.className = "flyout-item"; b.innerHTML = `<span>${label}</span>`;
    b.addEventListener("click", () => { root.innerHTML = ""; fn(); });
    fly.appendChild(b);
  });
  const r = anchor.getBoundingClientRect();
  root.appendChild(fly);
  fly.style.left = Math.min(r.left, window.innerWidth - fly.offsetWidth - 8) + "px";
  fly.style.top = r.bottom + 4 + "px";
  const onDoc = (e) => { if (!e.target.closest(".flyout") && e.target !== anchor) { root.innerHTML = ""; document.removeEventListener("mousedown", onDoc); } };
  setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
}

function setZoomPct(z) { setFitMode("custom"); setZoom(z); }
