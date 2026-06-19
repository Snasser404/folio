/* Opens the Stripe Billing Portal so a subscriber can manage/cancel their plan. */
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const { data: { user } = {} } = await supabase.auth.getUser(token);
    if (!user) return json(401, { error: "Please sign in first." });

    const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!profile || !profile.stripe_customer_id) return json(400, { error: "No billing account yet." });

    const site = process.env.SITE_URL || `https://${event.headers.host || ""}`;
    const ps = await stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: site });
    return json(200, { url: ps.url });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
