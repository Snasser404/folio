/* Virtualized continuous-scroll controller: builds page hosts, and rasterizes /
 * mounts a live Fabric canvas only for pages near the viewport. */
import { state, bus, setFocusedPage, getSourceDoc } from "./state.js";
import * as PH from "./page-host.js";

let pageListEl, viewportEl, liveObs;
const hosts = new Map();
let rerasterTimer = null;
let scrollRaf = 0;
let suppressFocusUntil = 0;

export function getHost(id) { return hosts.get(id); }
export function getHosts() { return hosts; }

export function initScheduler({ pageList, viewport }) {
  pageListEl = pageList;
  viewportEl = viewport;
  liveObs = new IntersectionObserver(onIntersect, { root: viewport, rootMargin: "700px 0px" });
  viewportEl.addEventListener("scroll", onScroll, { passive: true });

  bus.on("pages:changed", rebuild);
  bus.on("view:zoom", onZoom);
}

function onIntersect(entries) {
  for (const en of entries) {
    const host = hosts.get(en.target.dataset.pageId);
    if (!host) continue;
    host._want = en.isIntersecting;
    if (en.isIntersecting) ensureLive(host);
    else unmountHost(host);
  }
}

/* Explicit visibility sweep — robust mount/unmount that doesn't depend on
 * IntersectionObserver timing (which can be flaky in some environments). */
function mountVisible() {
  if (!viewportEl) return;
  const vr = viewportEl.getBoundingClientRect();
  const top = vr.top - 700, bottom = vr.bottom + 700;
  for (const h of hosts.values()) {
    const r = h.el.getBoundingClientRect();
    const inBand = r.bottom > top && r.top < bottom;
    if (inBand) { h._want = true; ensureLive(h); }
    else if (h.mounted || h.rastered) { h._want = false; unmountHost(h); }
  }
}

async function ensureLive(host) {
  if (host._ensuring) return;         // avoid concurrent rasterize (they'd cancel each other)
  host._ensuring = true;
  try {
    const pdfDoc = getSourceDoc(host.model);
    const z = state.view.zoom;
    const stale = !host.rastered || (host.rasterZoom && Math.abs(z - host.rasterZoom) / host.rasterZoom > 0.25);
    if (stale) await PH.rasterize(host, pdfDoc, z);
    if (!host._want) return;          // scrolled away while rasterizing — don't mount
    if (!host.mounted) PH.mountFabric(host);
  } finally {
    host._ensuring = false;
  }
}

function unmountHost(host) {
  host._want = false;
  PH.unmount(host, state.doc.pdfDoc);
}

/* ---- (re)build all hosts from state.pages ---- */
export function build() { rebuild(); }

export function syncAll() { for (const h of hosts.values()) PH.syncToModel(h); }

function buildHosts() {
  if (liveObs) liveObs.disconnect();
  for (const h of hosts.values()) PH.destroy(h);
  hosts.clear();
  pageListEl.innerHTML = "";
  state.pages.forEach((model, i) => {
    const host = PH.createPageHost(model);
    host.caption.textContent = `${i + 1}`;
    pageListEl.appendChild(host.el);
    hosts.set(model.id, host);
    liveObs.observe(host.el);
  });
  mountVisible();              // sync (getBoundingClientRect forces layout)
  setTimeout(mountVisible, 60); // fallback in case layout wasn't ready
}

let rebuildScheduled = false;
function rebuild() {
  syncAll();                 // capture live edits now (before hosts are torn down)
  if (rebuildScheduled) return;
  rebuildScheduled = true;
  Promise.resolve().then(() => { rebuildScheduled = false; buildHosts(); }); // coalesce multiple triggers in one tick
}

/** Rebuild from model WITHOUT syncing live canvases first (model is authoritative). */
export function reloadFromModel() { buildHosts(); }

/* ---- invalidate a single page (after rotate / external annotation change) ---- */
export function invalidate(pageId) {
  const old = hosts.get(pageId);
  if (!old) return;
  PH.syncToModel(old);
  const idx = [...pageListEl.children].indexOf(old.el);
  liveObs.unobserve(old.el);
  PH.destroy(old);
  const model = state.pages.find((p) => p.id === pageId);
  if (!model) { hosts.delete(pageId); return; }
  const host = PH.createPageHost(model);
  host.caption.textContent = `${state.pages.indexOf(model) + 1}`;
  if (idx >= 0 && idx < pageListEl.children.length) pageListEl.insertBefore(host.el, pageListEl.children[idx]);
  else pageListEl.appendChild(host.el);
  hosts.set(pageId, host);
  liveObs.observe(host.el);
}

/* ---- zoom relayout ---- */
function onZoom(z) {
  for (const h of hosts.values()) PH.resize(h, z);
  clearTimeout(rerasterTimer);
  rerasterTimer = setTimeout(() => {
    for (const h of hosts.values()) {
      const r = h.el.getBoundingClientRect();
      const inView = r.bottom > -700 && r.top < window.innerHeight + 700;
      if (inView) ensureLive(h);
    }
  }, 200);
}

/* ---- focused-page tracking ---- */
let lastSweep = 0;
function onScroll() {
  const now = performance.now();
  if (now - lastSweep > 120) { lastSweep = now; mountVisible(); } // direct (rAF can be throttled)
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    if (performance.now() < suppressFocusUntil) return; // an explicit jump owns focus
    const mid = viewportEl.scrollTop + viewportEl.clientHeight / 2;
    let best = null, bestDist = Infinity;
    for (const h of hosts.values()) {
      const top = h.el.offsetTop, bottom = top + h.el.offsetHeight;
      const center = (top + bottom) / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) { bestDist = d; best = h; }
    }
    if (best) setFocusedPage(best.model.id);
  });
}

export function scrollToPage(id, align = "start", behavior = "smooth") {
  const host = hosts.get(id);
  if (!host) return;
  setFocusedPage(id);                              // jump owns the focus/highlight
  suppressFocusUntil = performance.now() + 500;    // don't let onScroll override it mid-animation
  host.el.scrollIntoView({ block: align, behavior });
}

export function getFocusedHost() {
  return hosts.get(state.view.focusedPageId) || [...hosts.values()][0] || null;
}
