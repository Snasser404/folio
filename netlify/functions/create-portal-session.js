/* Opens the Stripe Billing Portal so a subscriber can manage/cancel their plan. */
const Stripe = require("stripe");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    let user;
    try { user = await admin.auth().verifyIdToken(token); } catch { return json(401, { error: "Please sign in first." }); }

    const snap = await db.collection("profiles").doc(user.uid).get();
    const customerId = snap.exists && snap.data().stripeCustomerId;
    if (!customerId) return json(400, { error: "No billing account yet." });

    const site = process.env.SITE_URL || `https://${event.headers.host || ""}`;
    const ps = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: site });
    return json(200, { url: ps.url });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
