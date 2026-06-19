/* Stripe webhook → keeps each user's `plan` in Supabase in sync with their subscription.
 * Configure this URL in Stripe (Developers → Webhooks) and set STRIPE_WEBHOOK_SECRET.
 * Events: checkout.session.completed, customer.subscription.{created,updated,deleted} */
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, event.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${e.message}` };
  }

  const setPlan = async (customerId, plan) => {
    if (!customerId) return;
    await supabase.from("profiles").update({ plan, updated_at: new Date().toISOString() }).eq("stripe_customer_id", customerId);
  };

  try {
    const o = evt.data.object;
    switch (evt.type) {
      case "checkout.session.completed":
        if (o.mode === "subscription") await setPlan(o.customer, "pro");
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await setPlan(o.customer, ["active", "trialing"].includes(o.status) ? "pro" : "free");
        break;
      case "customer.subscription.deleted":
        await setPlan(o.customer, "free");
        break;
    }
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
  return { statusCode: 200, body: "ok" };
};
