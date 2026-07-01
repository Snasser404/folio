/* Creates a Stripe Checkout Session (subscription, with free trial) for the signed-in
 * Firebase user. Card is collected up front; Stripe auto-charges when the trial ends.
 * Env: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, TRIAL_DAYS,
 *      FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, SITE_URL */
const Stripe = require("stripe");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;   // whole service-account JSON in one var (robust)
  admin.initializeApp({
    credential: raw
      ? admin.credential.cert(JSON.parse(raw))
      : admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
        }),
  });
}
const db = admin.firestore();
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    let user;
    try { user = await admin.auth().verifyIdToken(token); } catch { return json(401, { error: "Please sign in first." }); }
    const uid = user.uid, email = user.email;

    // Only allow the prices we configured (never trust an arbitrary client-supplied price).
    const allowed = [process.env.STRIPE_PRICE_MONTHLY, process.env.STRIPE_PRICE_ANNUAL, process.env.STRIPE_PRICE_ID].filter(Boolean);
    const requested = (JSON.parse(event.body || "{}").priceId) || "";
    const priceId = allowed.includes(requested) ? requested : allowed[0];
    if (!priceId) return json(400, { error: "No price configured." });

    // get-or-create the Stripe customer, stored on the user's profile doc
    const ref = db.collection("profiles").doc(uid);
    const snap = await ref.get();
    let customerId = snap.exists && snap.data().stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { firebase_uid: uid } });
      customerId = customer.id;
      await ref.set({ email, stripeCustomerId: customerId, plan: (snap.exists && snap.data().plan) || "free", updatedAt: Date.now() }, { merge: true });
    }

    const trialDays = parseInt(process.env.TRIAL_DAYS || "7", 10);
    const subData = { metadata: { firebase_uid: uid } };
    if (trialDays > 0) subData.trial_period_days = trialDays;

    const site = process.env.SITE_URL || `https://${event.headers.host || ""}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}/?checkout=success`,
      cancel_url: `${site}/?checkout=cancel`,
      client_reference_id: uid,
      subscription_data: subData,
      payment_method_collection: "always",   // collect the card up front, even with a trial
      allow_promotion_codes: true,
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
