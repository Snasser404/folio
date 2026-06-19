/* Drag-to-resize handles for the left and right panels (width persisted). */
export function initPanelResize() {
  setup("left");
  setup("right");
}

function setup(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const handle = document.createElement("div");
  handle.className = "panel-resizer " + panelId;
  handle.title = "Drag to resize";
  panel.appendChild(handle);

  let startX = 0, startW = 0, dragging = false;
  handle.addEventListener("mousedown", (e) => {
    dragging = true; startX = e.clientX; startW = panel.getBoundingClientRect().width;
    panel.classList.add("resizing"); handle.classList.add("dragging");
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    let w = panelId === "left" ? startW + dx : startW - dx;
    w = Math.max(180, Math.min(560, w));
    panel.style.width = w + "px";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("resizing"); handle.classList.remove("dragging");
    document.body.style.cursor = ""; document.body.style.userSelect = "";
    try { localStorage.setItem("pe-w-" + panelId, panel.style.width); } catch {}
  });

  try { const w = localStorage.getItem("pe-w-" + panelId); if (w) panel.style.width = w; } catch {}
}
