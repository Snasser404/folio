/* Public runtime config (safe to expose — anon key + price id are public by design).
 * Loaded as a classic script before the app module.
 *
 * Paywall is OFF by default ("open mode") so the editor deploys and works immediately.
 * To turn on accounts + billing: set saas.enabled = true and fill the values below,
 * then deploy the Netlify Functions + Supabase schema (see SETUP-SAAS.md). */
window.PE_CONFIG = {
  saas: {
    enabled: false,                 // <-- flip to true once Supabase + Stripe are configured
    supabaseUrl: "",                // e.g. "https://xxxx.supabase.co"
    supabaseAnonKey: "",            // Supabase project anon/public key
    priceId: "",                    // Stripe recurring Price ID, e.g. "price_123"
    planName: "Pro",
    priceLabel: "$9 / month",       // display only
    checkoutFn: "/.netlify/functions/create-checkout-session",
    portalFn: "/.netlify/functions/create-portal-session",
    // What free (signed-out / non-subscribed) users may do before the paywall blocks them:
    freeTrial: false,               // if true, allow use without an account (paywall hidden)
  },
  brand: { name: "Folio", tagline: "Edit any PDF, right in your browser." },
};
