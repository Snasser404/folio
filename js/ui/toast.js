/* Toasts, busy overlay, and modal/prompt/confirm dialogs. */
import { bus } from "../core/state.js";

export function initOverlays() {
  bus.on("ui:busy", ({ on, txt }) => {
    const el = document.getElementById("busy");
    document.getElementById("busyText").textContent = txt || "Working…";
    el.hidden = !on;
  });
}

export function toast(msg, kind = "info", ms = 2800) {
  const root = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .2s"; setTimeout(() => el.remove(), 220); }, ms);
}

export function modal({ title, bodyEl, actions = [], width }) {
  const root = document.getElementById("modalRoot");
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  const box = document.createElement("div");
  box.className = "modal";
  if (width) box.style.maxWidth = width + "px";
  const head = document.createElement("div");
  head.className = "modal-head";
  head.innerHTML = `<span>${title}</span>`;
  const x = document.createElement("button");
  x.className = "icon-btn";
  x.innerHTML = `<svg viewBox="0 0 24 24"><use href="#ic-close"/></svg>`;
  head.appendChild(x);
  const body = document.createElement("div");
  body.className = "modal-body";
  if (typeof bodyEl === "string") body.innerHTML = bodyEl; else if (bodyEl) body.appendChild(bodyEl);
  const foot = document.createElement("div");
  foot.className = "modal-foot";

  const close = (val) => { scrim.remove(); resolveFn && resolveFn(val); };
  x.addEventListener("click", () => close(undefined));
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(undefined); });

  actions.forEach((a) => {
    const b = document.createElement("button");
    b.className = "btn " + (a.kind || "");
    b.textContent = a.label;
    b.addEventListener("click", () => { if (a.onClick) a.onClick(close); else close(a.value); });
    foot.appendChild(b);
  });

  box.append(head, body, foot);
  scrim.appendChild(box);
  root.appendChild(scrim);

  let resolveFn;
  const promise = new Promise((res) => (resolveFn = res));
  return { close, promise, body, scrim };
}

export function promptDialog({ title, label, value = "", multiline = false, placeholder = "" }) {
  const wrap = document.createElement("div");
  const id = "pf_" + Math.random().toString(36).slice(2, 6);
  wrap.innerHTML = `<div class="form-row"><label>${label || ""}</label>${
    multiline ? `<textarea id="${id}" rows="4" placeholder="${placeholder}"></textarea>`
              : `<input type="text" id="${id}" placeholder="${placeholder}">`}</div>`;
  const field = wrap.querySelector("#" + id);
  field.value = value;
  const m = modal({
    title, bodyEl: wrap, actions: [
      { label: "Cancel", kind: "ghost", value: null },
      { label: "OK", kind: "primary", onClick: (close) => close(field.value) },
    ],
  });
  setTimeout(() => field.focus(), 30);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter" && !multiline) { e.preventDefault(); m.close(field.value); } });
  return m.promise;
}

export function confirmDialog({ title, message, okLabel = "OK", danger = false }) {
  const m = modal({
    title, bodyEl: `<p>${message}</p>`, actions: [
      { label: "Cancel", kind: "ghost", value: false },
      { label: okLabel, kind: danger ? "danger" : "primary", value: true },
    ],
  });
  return m.promise;
}

/* Link target dialog. Resolves {kind:'uri',url} | {kind:'page',page} | null. */
export function linkDialog(pageCount) {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="form-row"><label style="display:flex;gap:8px;align-items:center"><input type="radio" name="lk" value="uri" checked> Web link (URL)</label></div>
      <div class="form-row"><input type="url" class="lk-url" placeholder="https://example.com"></div>
      <div class="form-row"><label style="display:flex;gap:8px;align-items:center"><input type="radio" name="lk" value="page"> Go to page</label></div>
      <div class="form-row"><input type="number" class="lk-page" min="1" max="${pageCount || 1}" value="1" disabled></div>`;
    const url = body.querySelector(".lk-url"), pageN = body.querySelector(".lk-page");
    body.querySelectorAll('input[name="lk"]').forEach((r) => r.addEventListener("change", () => {
      const uri = body.querySelector('input[value="uri"]').checked;
      url.disabled = !uri; pageN.disabled = uri; (uri ? url : pageN).focus();
    }));
    modal({
      title: "Add link", bodyEl: body, width: 440, actions: [
        { label: "Cancel", kind: "ghost", onClick: (c) => { c(); resolve(null); } },
        { label: "Add link", kind: "primary", onClick: (c) => {
          if (body.querySelector('input[value="uri"]').checked) {
            const u = url.value.trim(); if (!u) { url.focus(); return; }
            c(); resolve({ kind: "uri", url: /^[a-z]+:\/\//i.test(u) ? u : "https://" + u });
          } else { c(); resolve({ kind: "page", page: parseInt(pageN.value, 10) || 1 }); }
        } },
      ],
    });
    setTimeout(() => url.focus(), 30);
  });
}

/* Non-blocking signature pad — Draw or Type. Returns a PNG dataURL or null. */
export function signatureDialog() {
  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="seg" style="width:100%;margin-bottom:12px">
        <button data-t="draw" class="active" style="flex:1">Draw</button>
        <button data-t="type" style="flex:1">Type</button>
      </div>
      <div data-pane="draw">
        <canvas class="sigpad" width="900" height="300"
          style="width:100%;height:170px;border:1px dashed var(--border);border-radius:8px;background:#fff;cursor:crosshair;touch-action:none"></canvas>
      </div>
      <div data-pane="type" hidden>
        <input class="sigtype" type="text" placeholder="Type your name"
          style="width:100%;padding:14px 12px;font-size:34px;font-family:'Brush Script MT','Segoe Script',cursive;color:#0a2540;border:1px solid var(--border);border-radius:8px;background:#fff">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--text-muted)">Color
          <input type="color" class="sigcolor" value="#0a2540" style="width:30px;height:24px;border:none;background:none;cursor:pointer"></label>
        <button class="btn ghost sigclear">Clear</button>
      </div>`;

    const pad = body.querySelector(".sigpad");
    const pctx = pad.getContext("2d");
    let drawing = false, hasInk = false, color = "#0a2540", mode = "draw";
    pctx.lineWidth = 4; pctx.lineCap = "round"; pctx.lineJoin = "round"; pctx.strokeStyle = color;
    const pos = (e) => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * (pad.width / r.width), y: (e.clientY - r.top) * (pad.height / r.height) }; };
    pad.addEventListener("pointerdown", (e) => { drawing = true; hasInk = true; const p = pos(e); pctx.beginPath(); pctx.moveTo(p.x, p.y); try { pad.setPointerCapture(e.pointerId); } catch {} });
    pad.addEventListener("pointermove", (e) => { if (!drawing) return; const p = pos(e); pctx.lineTo(p.x, p.y); pctx.stroke(); });
    window.addEventListener("pointerup", () => { drawing = false; });
    body.querySelector(".sigcolor").addEventListener("input", (e) => { color = e.target.value; pctx.strokeStyle = color; const ti = body.querySelector(".sigtype"); if (ti) ti.style.color = color; });
    body.querySelector(".sigclear").addEventListener("click", (e) => { e.preventDefault(); pctx.clearRect(0, 0, pad.width, pad.height); hasInk = false; const ti = body.querySelector(".sigtype"); if (ti) ti.value = ""; });
    body.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.t;
      body.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("active", x === b));
      body.querySelector('[data-pane="draw"]').hidden = mode !== "draw";
      body.querySelector('[data-pane="type"]').hidden = mode !== "type";
    }));

    const result = () => {
      if (mode === "type") {
        const name = body.querySelector(".sigtype").value.trim();
        return name ? renderTypedSig(name, color) : null;
      }
      return hasInk ? trimCanvas(pad).toDataURL("image/png") : null;
    };
    modal({
      title: "Add signature", bodyEl: body, width: 540, actions: [
        { label: "Cancel", kind: "ghost", onClick: (c) => { c(); resolve(null); } },
        { label: "Insert", kind: "primary", onClick: (c) => { const url = result(); if (!url) return; c(); resolve(url); } },
      ],
    });
  });
}

function renderTypedSig(name, color) {
  const c = document.createElement("canvas");
  const font = "italic 600 90px 'Brush Script MT','Segoe Script',cursive";
  let x = c.getContext("2d"); x.font = font;
  c.width = Math.ceil(x.measureText(name).width) + 60; c.height = 150;
  x = c.getContext("2d"); x.font = font; x.fillStyle = color; x.textBaseline = "middle";
  x.fillText(name, 30, 80);
  return c.toDataURL("image/png");
}

function trimCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let top = h, left = w, right = 0, bottom = 0, found = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 10) { found = true; if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
  }
  if (!found) return canvas;
  const pad = 12;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad); right = Math.min(w, right + pad); bottom = Math.min(h, bottom + pad);
  const out = document.createElement("canvas");
  out.width = right - left; out.height = bottom - top;
  out.getContext("2d").drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
