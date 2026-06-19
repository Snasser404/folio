/* Select + Hand(pan) tools. */

export const select = {
  id: "select", label: "Select", icon: "select", group: "select",
  shortcut: "v", cursor: "default", usesSelection: true, options: [],
  hint: "Click an item to move, resize or delete it; fill form fields",
  activate() {}, deactivate() {},
};

/* Hand tool pans the #viewport via drag. */
let vp = null, dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
function down(e) {
  if (e.button !== 0) return;
  dragging = true; sx = e.clientX; sy = e.clientY; sl = vp.scrollLeft; st = vp.scrollTop;
  vp.style.cursor = "grabbing"; e.preventDefault();
}
function move(e) {
  if (!dragging) return;
  vp.scrollLeft = sl - (e.clientX - sx);
  vp.scrollTop = st - (e.clientY - sy);
}
function up() { dragging = false; if (vp) vp.style.cursor = "grab"; }

export const hand = {
  id: "hand", label: "Pan", icon: "hand", group: "select",
  shortcut: "h", cursor: "grab", usesSelection: false, options: [],
  hint: "Drag to pan around the page",
  activate() {
    vp = document.getElementById("viewport");
    if (!vp) return;
    vp.style.cursor = "grab";
    vp.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  },
  deactivate() {
    if (!vp) return;
    vp.style.cursor = "";
    vp.removeEventListener("mousedown", down);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    dragging = false;
  },
};
