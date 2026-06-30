/* Stripe webhook → keeps each user's `plan` in Firestore in sync with their subscription.
 * Configure this URL in Stripe (Developers → Webhooks) and set STRIPE_WEBHOOK_SECRET.
 * Events: checkout.session.completed, customer.subscription.{created,updated,deleted} */
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

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, event.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${e.message}` };
  }

  // The user's Firebase uid rides on the Stripe event (client_reference_id on checkout,
  // metadata.firebase_uid on the subscription) — so no lookup/query is needed.
  const setPlan = async (uid, plan, extra) => {
    if (!uid) return;
    await db.collection("profiles").doc(uid).set({ plan, updatedAt: Date.now(), ...(extra || {}) }, { merge: true });
  };

  try {
    const o = evt.data.object;
    switch (evt.type) {
      case "checkout.session.completed":
        if (o.mode === "subscription") await setPlan(o.client_reference_id, "pro", { stripeCustomerId: o.customer });
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await setPlan(o.metadata && o.metadata.firebase_uid,
          ["active", "trialing"].includes(o.status) ? "pro" : "free", { stripeCustomerId: o.customer });
        break;
      case "customer.subscription.deleted":
        await setPlan(o.metadata && o.metadata.firebase_uid, "free");
        break;
    }
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
  return { statusCode: 200, body: "ok" };
};
