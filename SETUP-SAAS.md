# Turning on accounts + paid subscriptions (7-day free trial → $9/mo or $90/yr)

The editor runs in **open mode** (free, no login) everywhere except your **live app host**,
where it shows: **sign up → start 7-day free trial (card up front) → auto-charges when the
trial ends**. PDF editing always stays 100% in the browser — only **login + billing** touch a
server.

**Stack:** Supabase (accounts) · Stripe (subscriptions + trial) · Netlify (hosting + functions).

> You'll create the accounts (they must be in *your* name so payouts reach *your* bank).
> Everything is wired in the code already — you're filling in keys, not writing code.

---

## 0. Decide your URLs
- **Demo (free, open):** your current GitHub Pages site — `https://nassersaleh.ca/folio/`. Leave it as-is; it's the "try before you buy" page.
- **App (paid, gated):** a Netlify deploy, e.g. `https://folio-app.netlify.app` or a custom subdomain `https://app.nassersaleh.ca`. The paywall turns on automatically here.

## 1. Supabase (accounts) — free
1. Create a project at <https://supabase.com>.
2. **SQL Editor** → paste & run [`supabase-schema.sql`](supabase-schema.sql) (creates the `profiles` table + security rules + auto-profile-on-signup).
3. **Project Settings → API** → copy:
   - **Project URL** and **anon public** key → *public*, go in `js/config.js`.
   - **service_role** key → *secret*, goes in Netlify env vars only.
4. (Optional) **Authentication → Providers → Email**: turn "Confirm email" off for the smoothest signup, or on if you want verified emails.

## 2. Stripe (subscriptions + trial)
1. <https://dashboard.stripe.com> → **Products → Add product**: name it "Folio Pro".
2. Add **two recurring prices** to that product:
   - **$9.00 / month** → copy its Price ID (`price_…`) → this is `STRIPE_PRICE_MONTHLY`.
   - **$90.00 / year** → copy its Price ID (`price_…`) → this is `STRIPE_PRICE_ANNUAL`.
   - *(The 7-day trial is added by our code, not on the price — leave trial settings empty.)*
3. **Developers → API keys** → copy the **Secret key** (`sk_…`).
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-APP.netlify.app/.netlify/functions/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`).
5. Keep Stripe in **Test mode** while setting up; flip to **Live** (and re-copy the live keys + re-add the live webhook) when you're ready to take real money. Live payouts require completing Stripe's business/identity verification.

## 3. Netlify (host the app + run the functions)
1. <https://app.netlify.com> → **Add new site → Import an existing project** → pick the **Snasser404/folio** repo. (Build command: none; publish dir: `.` — already set in `netlify.toml`.)
2. **Site settings → Environment variables** → add:
   | Key | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_…` |
   | `STRIPE_PRICE_MONTHLY` | `price_…` (the $9/mo price) |
   | `STRIPE_PRICE_ANNUAL` | `price_…` (the $90/yr price) |
   | `TRIAL_DAYS` | `7` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
   | `SUPABASE_URL` | your Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (secret) |
   | `SITE_URL` | your app URL, e.g. `https://folio-app.netlify.app` |
3. (Optional) Add your custom domain `app.nassersaleh.ca` under **Domain settings**.
4. Trigger a deploy.

## 4. Fill the public keys + turn it on
Edit [`js/config.js`](js/config.js) — these values are **public/safe to commit**:
```js
var APP_HOSTS = ["app.nassersaleh.ca"];   // add your custom app domain (netlify.app is auto-detected)
...
supabaseUrl: "https://xxxx.supabase.co",
supabaseAnonKey: "eyJ...",                // anon/public key
prices: {
  monthly: { id: "price_MONTHLY", label: "$9 / month" },
  annual:  { id: "price_ANNUAL",  label: "$90 / year" },
},
trialDays: 7,
```
Commit & push → GitHub Pages demo stays open; the Netlify app now gates with the trial.

## 5. Test it (Stripe **test mode**, card `4242 4242 4242 4242`)
1. Open the **app URL** → you should see **Create account**.
2. Sign up → you land on **Start your 7-day free trial** with Monthly/Annual options.
3. Pick one → **Start free trial** → Stripe Checkout (card `4242 4242 4242 4242`, any future date/CVC).
4. Back on the app, the webhook sets your plan to Pro (trialing) → the editor unlocks.
5. Top-right account menu → **Manage billing** opens Stripe's portal (cancel/switch). Canceling during the trial → no charge; after the trial Stripe auto-charges, then renews monthly/yearly.

## Notes & honest caveats
- The gate is a **billing/UX layer, not DRM** — the app is client-side, so a determined developer could still copy the front-end. This stops casual non-paying use; it's how most freemium web tools operate.
- **Taxes:** Stripe doesn't file taxes for you. For hands-off global sales tax/VAT, consider Stripe Tax, or a Merchant-of-Record (Lemon Squeezy/Paddle) instead of raw Stripe.
- The **demo** (GitHub Pages) and the **app** (Netlify) are the same code; only the host differs, so the demo can't be paywalled and the app can't be bypassed by editing config (the price is validated server-side against your env allowlist).
