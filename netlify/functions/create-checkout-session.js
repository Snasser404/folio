/* Creates a Stripe Checkout Session (subscription) for the signed-in Supabase user.
 * Env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL */
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const { data: { user } = {}, error } = await supabase.auth.getUser(token);
    if (error || !user) return json(401, { error: "Please sign in first." });

    const priceId = process.env.STRIPE_PRICE_ID || (JSON.parse(event.body || "{}").priceId);
    if (!priceId) return json(400, { error: "No price configured." });

    // get-or-create the Stripe customer, stored on the user's profile
    let { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    let customerId = profile && profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_uid: user.id } });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const site = process.env.SITE_URL || `https://${event.headers.host || ""}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}/?checkout=success`,
      cancel_url: `${site}/?checkout=cancel`,
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_uid: user.id } },
      allow_promotion_codes: true,
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
