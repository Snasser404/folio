/* Thin Firebase Auth + Firestore wrapper (lazy-loads the SDK from CDN on first use).
 * Same export surface as before, so js/saas/gate.js doesn't care which backend is used. */
let app = null, auth = null, db = null, ready = null;
const V = "10.12.2"; // Firebase JS SDK (compat bundles)

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

export async function initAuth(cfg) {
  if (app) return app;
  const base = `https://www.gstatic.com/firebasejs/${V}/`;
  await loadScript(base + "firebase-app-compat.js");
  await loadScript(base + "firebase-auth-compat.js");
  await loadScript(base + "firebase-firestore-compat.js");
  if (!window.firebase) throw new Error("Firebase SDK unavailable");
  app = window.firebase.initializeApp(cfg.firebase);
  auth = window.firebase.auth();
  db = window.firebase.firestore();
  // Firebase restores any saved session asynchronously — resolve once we know the state.
  ready = new Promise((resolve) => { const off = auth.onAuthStateChanged((u) => { off(); resolve(u); }); });
  return app;
}

export async function getSession() {
  if (ready) await ready;
  const u = auth && auth.currentUser;
  return u ? { user: u } : null;
}
export function onAuth(cb) { auth.onAuthStateChanged((u) => cb(u ? { user: u } : null)); }

export async function signUp(email, password) {
  try { await auth.createUserWithEmailAndPassword(email, password); return {}; }
  catch (e) { return { error: { message: friendly(e) } }; }
}
export async function signIn(email, password) {
  try { await auth.signInWithEmailAndPassword(email, password); return {}; }
  catch (e) { return { error: { message: friendly(e) } }; }
}
export async function signOut() { return auth.signOut(); }

/** Current entitlement: 'pro' | 'free' (read from the user's profiles/{uid} doc). */
export async function getPlan() {
  const u = auth && auth.currentUser;
  if (!u) return "free";
  try {
    const snap = await db.collection("profiles").doc(u.uid).get();
    return (snap.exists && snap.data().plan) || "free";
  } catch { return "free"; }
}

export async function startCheckout(cfg, priceId) {
  const token = await idToken();
  const r = await fetch(cfg.checkoutFn, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ priceId }),
  });
  const j = await r.json();
  if (j.url) location.href = j.url; else throw new Error(j.error || "Could not start checkout");
}

export async function openBillingPortal(cfg) {
  const token = await idToken();
  const r = await fetch(cfg.portalFn, { method: "POST", headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (j.url) location.href = j.url; else throw new Error(j.error || "Could not open billing");
}

async function idToken() { const u = auth && auth.currentUser; return u ? await u.getIdToken() : null; }

function friendly(e) {
  const c = (e && e.code) || "";
  if (c.includes("email-already-in-use")) return "That email is already registered — sign in instead.";
  if (c.includes("invalid-email")) return "That doesn't look like a valid email.";
  if (c.includes("weak-password")) return "Password should be at least 6 characters.";
  if (c.includes("wrong-password") || c.includes("invalid-credential")) return "Wrong email or password.";
  if (c.includes("user-not-found")) return "No account with that email — create one.";
  if (c.includes("too-many-requests")) return "Too many attempts — try again in a moment.";
  return (e && e.message) || "Something went wrong.";
}
