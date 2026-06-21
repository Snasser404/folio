/* Paywall gate. Overlays the editor until the visitor is signed in AND subscribed.
 * Disabled by default (open mode) — see js/config.js. */
import * as auth from "./auth.js";

export async function initGate() {
  const cfg = (window.PE_CONFIG && window.PE_CONFIG.saas) || {};
  if (!cfg.enabled || !cfg.supabaseUrl) return; // open mode (demo host, or not yet configured)

  const root = buildOverlay();
  setView(root, loading());

  try {
    await auth.initAuth(cfg);
  } catch (e) {
    setView(root, message("Service unavailable", "Couldn’t reach the accounts service. Check the configuration.", true));
    return;
  }
  auth.onAuth(() => refresh(root, cfg));

  // returning from Stripe checkout — poll briefly while the webhook lands
  if (/[?&]checkout=success/.test(location.search)) {
    history.replaceState({}, "", location.pathname);
    setView(root, loading("Activating your subscription…"));
    for (let i = 0; i < 6; i++) { if ((await safePlan()) === "pro") break; await wait(1500); }
  }
  await refresh(root, cfg);
}

async function refresh(root, cfg) {
  const session = await auth.getSession();
  if (!session) { setView(root, authForm(root, cfg)); return; }
  const plan = await safePlan();
  if (plan === "pro") { hide(root); mountAccount(cfg, session); }
  else { setView(root, paywall(root, cfg, session)); show(root); }
}

async function safePlan() { try { return await auth.getPlan(); } catch { return "free"; } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- overlay shell ---- */
function buildOverlay() {
  let root = document.getElementById("gateRoot");
  if (root) return root;
  root = document.createElement("div");
  root.id = "gateRoot";
  root.innerHTML = `<div class="gate-card"></div>`;
  document.body.appendChild(root);
  return root;
}
const card = (root) => root.querySelector(".gate-card");
function setView(root, node) { const c = card(root); c.innerHTML = ""; c.appendChild(node); show(root); }
function show(root) { root.style.display = "flex"; }
function hide(root) { root.style.display = "none"; }

const brand = () => ((window.PE_CONFIG && window.PE_CONFIG.brand && window.PE_CONFIG.brand.name) || "PDF Studio");

/* ---- views ---- */
function loading(text) {
  const d = document.createElement("div");
  d.className = "gate-loading";
  d.innerHTML = `<div class="spinner"></div><p>${text || "Loading…"}</p>`;
  return d;
}
function message(title, body, isErr) {
  const d = document.createElement("div");
  d.innerHTML = `<h2 class="gate-title">${title}</h2><p class="gate-sub${isErr ? " err" : ""}">${body}</p>`;
  return d;
}

function authForm(root, cfg) {
  let mode = "signin";
  const d = document.createElement("div");
  const draw = () => {
    d.innerHTML = `
      <h2 class="gate-title">${brand()}</h2>
      <p class="gate-sub">${mode === "signin" ? "Sign in to continue" : "Create your account"}</p>
      <div class="gate-seg">
        <button data-m="signin" class="${mode === "signin" ? "on" : ""}">Sign in</button>
        <button data-m="signup" class="${mode === "signup" ? "on" : ""}">Create account</button>
      </div>
      <input class="gate-input" type="email" placeholder="Email" autocomplete="email">
      <input class="gate-input" type="password" placeholder="Password" autocomplete="current-password">
      <div class="gate-err" hidden></div>
      <button class="gate-btn primary">${mode === "signin" ? "Sign in" : "Create account"}</button>
      <p class="gate-fine">Your PDFs are processed entirely in your browser and never uploaded.</p>`;
    d.querySelectorAll(".gate-seg button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; draw(); }));
    const [email, pw] = d.querySelectorAll(".gate-input");
    const err = d.querySelector(".gate-err");
    const submit = d.querySelector(".gate-btn");
    const go = async () => {
      err.hidden = true; submit.disabled = true; submit.textContent = "Please wait…";
      const fn = mode === "signin" ? auth.signIn : auth.signUp;
      const { error } = await fn(email.value.trim(), pw.value);
      submit.disabled = false; submit.textContent = mode === "signin" ? "Sign in" : "Create account";
      if (error) { err.textContent = error.message; err.hidden = false; return; }
      if (mode === "signup") { err.className = "gate-err"; err.style.color = "var(--success)"; err.textContent = "Account created. If email confirmation is on, check your inbox, then sign in."; err.hidden = false; }
      else refresh(root, cfg);
    };
    submit.addEventListener("click", go);
    pw.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  };
  draw();
  return d;
}

function paywall(root, cfg, session) {
  const prices = cfg.prices || {};
  const days = cfg.trialDays || 7;
  let plan = prices.monthly && prices.monthly.id ? "monthly" : (prices.annual ? "annual" : "monthly");
  const d = document.createElement("div");
  const draw = () => {
    const sel = prices[plan] || {};
    const hasAnnual = prices.annual && (prices.annual.label || prices.annual.id);
    const hasMonthly = prices.monthly && (prices.monthly.label || prices.monthly.id);
    d.innerHTML = `
      <h2 class="gate-title">Start your ${days}-day free trial</h2>
      <p class="gate-sub">Full editing — edit text, annotate, sign, fill forms, OCR, redact &amp; more. Cancel anytime.</p>
      <div class="gate-plan-toggle">
        ${hasMonthly ? `<button data-p="monthly" class="${plan === "monthly" ? "on" : ""}"><span class="pl">Monthly</span><span class="pp">${(prices.monthly.label || "")}</span></button>` : ""}
        ${hasAnnual ? `<button data-p="annual" class="${plan === "annual" ? "on" : ""}"><span class="pl">Annual <i class="save">save 17%</i></span><span class="pp">${(prices.annual.label || "")}</span></button>` : ""}
      </div>
      <p class="gate-trial-note">Free for ${days} days, then <b>${sel.label || ""}</b>. We'll remind you before the trial ends — cancel anytime and you won't be charged.</p>
      <button class="gate-btn primary" id="gateSub">Start ${days}-day free trial</button>
      <div class="gate-err" hidden></div>
      <p class="gate-fine">Signed in as ${session.user.email} · <a href="#" id="gateOut">Sign out</a></p>`;
    d.querySelectorAll(".gate-plan-toggle button").forEach((b) => b.addEventListener("click", () => { plan = b.dataset.p; draw(); }));
    d.querySelector("#gateSub").addEventListener("click", async (e) => {
      const b = e.target; b.disabled = true; b.textContent = "Redirecting…";
      const id = (prices[plan] || {}).id;
      if (!id) { const el = d.querySelector(".gate-err"); el.textContent = "Pricing isn't configured yet."; el.hidden = false; b.disabled = false; b.textContent = `Start ${days}-day free trial`; return; }
      try { await auth.startCheckout(cfg, id); }
      catch (err) { const el = d.querySelector(".gate-err"); el.textContent = err.message; el.hidden = false; b.disabled = false; b.textContent = `Start ${days}-day free trial`; }
    });
    d.querySelector("#gateOut").addEventListener("click", async (e) => { e.preventDefault(); await auth.signOut(); refresh(root, cfg); });
  };
  draw();
  return d;
}

/* ---- account chip (when subscribed) ---- */
function mountAccount(cfg, session) {
  if (document.getElementById("acctBtn")) return;
  const bar = document.getElementById("menubar");
  if (!bar) return;
  const btn = document.createElement("button");
  btn.id = "acctBtn"; btn.className = "icon-btn"; btn.setAttribute("data-tip", session.user.email);
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 21a8 8 0 0116 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  const help = document.getElementById("helpBtn");
  bar.insertBefore(btn, help);
  btn.addEventListener("click", () => {
    const root = document.getElementById("flyoutRoot");
    if (root.querySelector(".flyout")) { root.innerHTML = ""; return; }
    const fly = document.createElement("div");
    fly.className = "flyout";
    fly.innerHTML = `<div style="padding:8px 10px;font-size:12px;color:var(--text-muted)">${session.user.email}</div><div class="flyout-sep"></div>`;
    const manage = mkItem("Manage billing", () => auth.openBillingPortal(cfg).catch((e) => alert(e.message)));
    const out = mkItem("Sign out", async () => { await auth.signOut(); location.reload(); });
    fly.append(manage, out);
    const r = btn.getBoundingClientRect();
    root.appendChild(fly);
    fly.style.left = Math.min(r.left, window.innerWidth - fly.offsetWidth - 8) + "px";
    fly.style.top = r.bottom + 4 + "px";
    const onDoc = (e) => { if (!e.target.closest(".flyout") && e.target !== btn) { root.innerHTML = ""; document.removeEventListener("mousedown", onDoc); } };
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
  });
}
function mkItem(label, fn) {
  const b = document.createElement("button");
  b.className = "flyout-item"; b.innerHTML = `<span>${label}</span>`;
  b.addEventListener("click", () => { document.getElementById("flyoutRoot").innerHTML = ""; fn(); });
  return b;
}
