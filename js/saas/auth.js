/* Thin Supabase auth wrapper (lazy-loads the SDK from CDN on first use). */
let client = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

export async function initAuth(cfg) {
  if (client) return client;
  await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
  if (!window.supabase) throw new Error("Supabase SDK unavailable");
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return client;
}

export async function getSession() { const { data } = await client.auth.getSession(); return data.session; }
export function onAuth(cb) { client.auth.onAuthStateChange((_e, session) => cb(session)); }
export async function signUp(email, password) { return client.auth.signUp({ email, password }); }
export async function signIn(email, password) { return client.auth.signInWithPassword({ email, password }); }
export async function signOut() { return client.auth.signOut(); }

/** Current entitlement: 'pro' | 'free'. */
export async function getPlan() {
  const { data: { user } = {} } = await client.auth.getUser();
  if (!user) return "free";
  const { data } = await client.from("profiles").select("plan").eq("id", user.id).single();
  return (data && data.plan) || "free";
}

export async function startCheckout(cfg, priceId) {
  const token = (await getSession())?.access_token;
  const r = await fetch(cfg.checkoutFn, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ priceId }),
  });
  const j = await r.json();
  if (j.url) location.href = j.url; else throw new Error(j.error || "Could not start checkout");
}

export async function openBillingPortal(cfg) {
  const token = (await getSession())?.access_token;
  const r = await fetch(cfg.portalFn, { method: "POST", headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (j.url) location.href = j.url; else throw new Error(j.error || "Could not open billing");
}
