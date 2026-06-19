# Turning on accounts + paid subscriptions

The editor ships in **open mode** (free, no login) so you can deploy immediately. When you're
ready to charge, wire up the three pieces below. The PDF editing always stays 100% in the
browser — only **login and billing** touch a server.

**Stack:** Supabase (accounts + who-is-Pro) · Stripe (subscriptions) · Netlify Functions (glue).

---

## 1. Supabase (accounts)
1. Create a project at <https://supabase.com> (free tier is fine).
2. SQL Editor → paste & run [`supabase-schema.sql`](supabase-schema.sql). This creates the
   `profiles` table (with a `plan` column), locks it down with RLS, and auto-creates a profile
   on signup.
3. Project Settings → API → copy the **Project URL** and the **anon public** key (for the
   frontend) and the **service_role** key (secret, for the server).
4. (Optional) Authentication → Providers: turn email confirmation on/off as you prefer.

## 2. Stripe (subscriptions)
1. Create a product + a **recurring price** at <https://dashboard.stripe.com> → copy the
   **Price ID** (`price_…`).
2. Developers → API keys → copy the **Secret key** (`sk_…`).
3. Developers → Webhooks → **Add endpoint**:
   - URL: `https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`).

## 3. Netlify (deploy + env vars)
1. Deploy this repo to Netlify (see [DEPLOY.md](DEPLOY.md)). Functions in `netlify/functions/`
   deploy automatically.
2. Site settings → **Environment variables** → add:
   | Key | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_…` |
   | `STRIPE_PRICE_ID` | `price_…` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
   | `SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
   | `SITE_URL` | `https://YOUR-SITE.netlify.app` |
3. Redeploy so the functions pick up the variables.

## 4. Turn the paywall on
Edit [`js/config.js`](js/config.js):
```js
saas: {
  enabled: true,
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ...",   // anon/public key
  priceId: "price_123",
  priceLabel: "$9 / month",
}
```
Commit & redeploy. New visitors now see **Sign in → Subscribe**, and the editor unlocks once
their subscription is active.

## Test it (use Stripe **test mode**)
1. Sign up with a test email → you should land on the paywall.
2. Click **Subscribe**, pay with card `4242 4242 4242 4242`, any future date/CVC.
3. After redirect, the webhook flips your `plan` to `pro` and the editor unlocks.
4. **Manage billing** (account menu, top-right) opens the Stripe portal to cancel — canceling
   flips you back to `free`.

## Notes & honest caveats
- Because the app is client-side, the gate is a **billing/UX layer, not DRM** — a determined
  developer can still read/copy the front-end code. This setup stops casual non-paying use and
  is how most "freemium web tool" businesses operate.
- Prefer **no code at all**? A membership service (Outseta, Memberstack) can gate a static site
  via a script + dashboard, handling auth + Stripe for you. Trade-off: a monthly platform fee.
- Keep `freeTrial: true` in config to let everyone use it while signed out (good for a launch /
  "free week"), then set it to `false` to enforce subscriptions.
