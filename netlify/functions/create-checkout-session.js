/* Creates a Stripe Checkout Session (subscription, with free trial) for the signed-in
 * Supabase user. Card is collected up front; Stripe auto-charges when the trial ends.
 * Env: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, TRIAL_DAYS,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL */
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

    // Only allow the prices we configured (never trust an arbitrary client-supplied price).
    const allowed = [process.env.STRIPE_PRICE_MONTHLY, process.env.STRIPE_PRICE_ANNUAL, process.env.STRIPE_PRICE_ID].filter(Boolean);
    const requested = (JSON.parse(event.body || "{}").priceId) || "";
    const priceId = allowed.includes(requested) ? requested : allowed[0];
    if (!priceId) return json(400, { error: "No price configured." });

    // get-or-create the Stripe customer, stored on the user's profile
    let { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    let customerId = profile && profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_uid: user.id } });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const trialDays = parseInt(process.env.TRIAL_DAYS || "7", 10);
    const subData = { metadata: { supabase_uid: user.id } };
    if (trialDays > 0) subData.trial_period_days = trialDays;

    const site = process.env.SITE_URL || `https://${event.headers.host || ""}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${site}/?checkout=success`,
      cancel_url: `${site}/?checkout=cancel`,
      client_reference_id: user.id,
      subscription_data: subData,
      payment_method_collection: "always",   // collect the card up front, even with a trial
      allow_promotion_codes: true,
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
