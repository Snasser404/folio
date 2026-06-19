/* Menu-bar dropdowns (File / Edit / View / Document / Help). */
import { bus, state } from "../core/state.js";
import { iconSvg } from "./icon.js";

export function initMenus(ctx) {
  const defs = {
    file: [
      { label: "Open…", icon: "open", sc: "Ctrl+O", act: () => bus.emit("action:open") },
      { label: "Download PDF", icon: "save", sc: "Ctrl+S", act: () => bus.emit("action:save") },
      { label: "Download flattened", icon: "save", act: () => bus.emit("action:flatten") },
      { label: "Print…", icon: "save", sc: "Ctrl+P", act: () => bus.emit("action:print") },
      { sep: true },
      { label: "Append PDF…", icon: "merge", act: () => bus.emit("action:merge") },
      { label: "Export pages as images", icon: "image", act: () => bus.emit("action:export-images") },
      { sep: true },
      { label: "Export annotations…", icon: "export", act: () => bus.emit("action:export-annotations") },
      { label: "Import annotations…", icon: "import", act: () => bus.emit("action:import-annotations") },
      { sep: true },
      { label: "Close document", icon: "close", act: () => bus.emit("action:close") },
    ],
    edit: [
      { label: "Undo", icon: "undo", sc: "Ctrl+Z", act: () => bus.emit("action:undo") },
      { label: "Redo", icon: "redo", sc: "Ctrl+Y", act: () => bus.emit("action:redo") },
      { sep: true },
      { label: "Delete selection", icon: "trash", sc: "Del", act: () => bus.emit("action:delete") },
    ],
    view: [
      { label: "Fit width", icon: "fit-width", act: () => bus.emit("action:fit") },
      { label: "Fit page", act: () => bus.emit("action:fit-page") },
      { label: "Actual size", act: () => bus.emit("action:actual") },
      { sep: true },
      { label: "Zoom in", icon: "zoom-in", act: () => bus.emit("action:zoom-in") },
      { label: "Zoom out", icon: "zoom-out", act: () => bus.emit("action:zoom-out") },
      { sep: true },
      { label: "Toggle pages panel", icon: "pages", act: () => toggle("left") },
      { label: "Toggle properties panel", act: () => toggle("right") },
    ],
    document: [
      { label: "Add blank page", icon: "plus", act: () => bus.emit("action:add-blank") },
      { label: "Rotate current page", icon: "rotate", act: () => bus.emit("action:rotate-current") },
      { label: "Delete current page", icon: "trash", act: () => bus.emit("action:delete-current") },
      { sep: true },
      { label: "OCR — make searchable", icon: "search", act: () => bus.emit("action:ocr") },
      { label: "Compare with…", icon: "import", act: () => bus.emit("action:compare") },
      { label: "Remove metadata & download", icon: "redact", act: () => bus.emit("action:sanitize") },
      { sep: true },
      { label: "Document properties…", act: () => bus.emit("action:properties") },
    ],
    help: [
      { label: "Keyboard shortcuts", icon: "help", act: () => bus.emit("action:shortcuts") },
      { label: "About PDF Studio", act: () => bus.emit("action:about") },
    ],
  };

  let open = null;
  const root = document.getElementById("flyoutRoot");

  function close() { root.innerHTML = ""; open = null; document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); }
  function onDoc(e) { if (!e.target.closest(".flyout") && !e.target.closest(".menu-item")) close(); }
  function onKey(e) { if (e.key === "Escape") close(); }

  function show(menu, btn) {
    close();
    open = menu;
    const fly = document.createElement("div");
    fly.className = "flyout";
    defs[menu].forEach((it) => {
      if (it.sep) { const s = document.createElement("div"); s.className = "flyout-sep"; fly.appendChild(s); return; }
      const b = document.createElement("button");
      b.className = "flyout-item";
      b.innerHTML = `${it.icon ? iconSvg(it.icon) : "<span style='width:16px'></span>"}<span>${it.label}</span>${it.sc ? `<span class="sc">${it.sc}</span>` : ""}`;
      b.addEventListener("click", () => { close(); it.act(); });
      fly.appendChild(b);
    });
    const r = btn.getBoundingClientRect();
    root.appendChild(fly);
    const fw = fly.offsetWidth, fh = fly.offsetHeight;
    fly.style.left = Math.min(r.left, window.innerWidth - fw - 8) + "px";
    fly.style.top = Math.min(r.bottom + 4, window.innerHeight - fh - 8) + "px";
    setTimeout(() => { document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey); }, 0);
  }

  document.querySelectorAll(".menu-item[data-menu]").forEach((btn) => {
    btn.addEventListener("click", () => { open === btn.dataset.menu ? close() : show(btn.dataset.menu, btn); });
    btn.addEventListener("mouseenter", () => { if (open && open !== btn.dataset.menu) show(btn.dataset.menu, btn); });
  });

  function toggle(side) {
    const el = document.getElementById(side);
    el.classList.toggle("collapsed");
  }
}
