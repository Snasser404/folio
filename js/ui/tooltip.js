/* Portal tooltips: a single fixed-position element shown on hover of any
 * [data-tip] element. Lives on <body> so it's never clipped by overflow. */
let tipEl = null, timer = null, current = null;

export function initTooltips() {
  tipEl = document.createElement("div");
  tipEl.className = "tooltip-pop";
  document.body.appendChild(tipEl);
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);
  document.addEventListener("mousedown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}

function onOver(e) {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (!el || el === current) return;
  current = el;
  clearTimeout(timer);
  timer = setTimeout(() => show(el), 300);
}
function onOut(e) {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el && el === current) { current = null; clearTimeout(timer); hide(); }
}

function show(el) {
  if (!el.isConnected) return;
  const tip = el.getAttribute("data-tip");
  if (!tip) return;
  tipEl.textContent = tip;
  tipEl.style.display = "block";
  const r = el.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  const up = el.hasAttribute("data-tip-up");
  let top = up ? r.top - t.height - 8 : r.bottom + 8;
  if (!up && top + t.height > window.innerHeight - 4) top = r.top - t.height - 8; // flip up if no room
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
  tipEl.style.left = Math.round(left) + "px";
  tipEl.style.top = Math.round(Math.max(4, top)) + "px";
  tipEl.classList.add("show");
}
function hide() {
  if (!tipEl) return;
  tipEl.classList.remove("show");
  tipEl.style.display = "none";
}
