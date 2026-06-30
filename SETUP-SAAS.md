# Turning on accounts + paid subscriptions (7-day free trial → $9/mo or $90/yr)

The editor runs in **open mode** (free, no login) everywhere except your **live app host**,
where it shows: **sign up → start 7-day free trial (card up front) → auto-charges when the
trial ends**. PDF editing always stays 100% in the browser — only **login + billing** touch a
server.

**Stack:** Firebase (accounts + who-is-Pro) · Stripe (subscriptions + trial) · Netlify (hosting + functions).

> You create the accounts (they must be in *your* name so payouts reach *your* bank).
> The code is already wired — you're filling in keys, not writing code.

---

## 0. Decide your URLs
- **Demo (free, open):** your GitHub Pages site — `https://nassersaleh.ca/folio/`. Leave it; it's the "try before you buy" page.
- **App (paid, gated):** a Netlify deploy, e.g. `https://folio-app.netlify.app` or a subdomain `https://app.nassersaleh.ca`. The paywall turns on automatically here.

## 1. Firebase (accounts) — free
1. Go to <https://console.firebase.google.com> → **Add project** → name it `folio` → you can disable Google Analytics → **Create**.
2. **Add a Web app:** click the **`</>`** (web) icon → nickname `folio-web` → **Register app**. Firebase shows a `firebaseConfig = { apiKey, authDomain, projectId, appId, ... }` — **copy it** (this is *public*, goes in `js/config.js`).
3. **Enable login:** left menu **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
4. **Create the database:** **Build → Firestore Database → Create database → Production mode → pick a location → Enable.**
5. **Paste the security rules:** Firestore Database → **Rules** tab → replace everything with the contents of [`firestore.rules`](firestore.rules) → **Publish.**
6. **Server key (SECRET):** gear ⚙ → **Project settings → Service accounts → Generate new private key** → it downloads a JSON file. From that file you'll need three values for Netlify (step 3): `project_id`, `client_email`, and `private_key`. **Keep this file private — never commit it.**

## 2. Stripe (subscriptions + trial)
1. <https://dashboard.stripe.com> → **Products → Add product** → name "Folio Pro".
2. Add **two recurring prices**:
   - **$9.00 / month** → copy its Price ID (`price_…`) → `STRIPE_PRICE_MONTHLY`.
   - **$90.00 / year** → copy its Price ID (`price_…`) → `STRIPE_PRICE_ANNUAL`.
   - *(The 7-day trial is added by our code — leave the price's own trial settings empty.)*
3. **Developers → API keys** → copy the **Secret key** (`sk_…`).
4. **Developers → Webhooks → Add endpoint:**
   - URL: `https://YOUR-APP.netlify.app/.netlify/functions/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`).
5. Keep Stripe in **Test mode** while setting up; switch to **Live** (re-copy live keys + re-add the live webhook) when ready for real money. Live payouts require completing Stripe's identity/business verification.

## 3. Netlify (host the app + run the functions)
1. <https://app.netlify.com> → **Add new site → Import an existing project** → pick **Snasser404/folio**. (Build command: none; publish dir `.` — already in `netlify.toml`.)
2. **Site settings → Environment variables** → add:
   | Key | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_…` |
   | `STRIPE_PRICE_MONTHLY` | `price_…` (the $9/mo price) |
   | `STRIPE_PRICE_ANNUAL` | `price_…` (the $90/yr price) |
   | `TRIAL_DAYS` | `7` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
   | `FIREBASE_PROJECT_ID` | `project_id` from the service-account JSON |
   | `FIREBASE_CLIENT_EMAIL` | `client_email` from the JSON |
   | `FIREBASE_PRIVATE_KEY` | `private_key` from the JSON — paste it **exactly**, including the `-----BEGIN…` / `…END-----` lines and the `\n`s |
   | `SITE_URL` | your app URL, e.g. `https://folio-app.netlify.app` |
3. (Optional) add a custom domain `app.nassersaleh.ca` under **Domain settings**.
4. Trigger a deploy.

## 4. Fill the public Firebase config + turn it on
Edit [`js/config.js`](js/config.js) — these values are **public/safe to commit** (paste from the
`firebaseConfig` you copied in step 1):
```js
var APP_HOSTS = ["app.nassersaleh.ca"];   // your custom app domain (netlify.app is auto-detected)
...
firebase: {
  apiKey: "AIza...",
  authDomain: "folio-xxxx.firebaseapp.com",
  projectId: "folio-xxxx",
  appId: "1:....:web:....",
},
prices: {
  monthly: { id: "price_MONTHLY", label: "$9 / month" },
  annual:  { id: "price_ANNUAL",  label: "$90 / year" },
},
trialDays: 7,
```
Commit & push → the GitHub Pages demo stays open; the Netlify app now gates with the trial.

## 5. Test it (Stripe **test mode**, card `4242 4242 4242 4242`)
1. Open the **app URL** → **Create account** (instant — no email confirmation).
2. You land on **Start your 7-day free trial** with Monthly/Annual options.
3. Pick one → **Start free trial** → Stripe Checkout (card `4242 4242 4242 4242`, any future date/CVC).
4. Back on the app, the webhook sets your plan to Pro (trialing) → the editor unlocks.
5. Top-right account menu → **Manage billing** opens Stripe's portal (cancel/switch). Cancel during the trial → no charge; after the trial Stripe auto-charges, then renews.

## Notes & honest caveats
- The gate is a **billing/UX layer, not DRM** — the app is client-side, so a determined developer could still copy the front-end. It stops casual non-paying use; that's how most freemium web tools operate.
- **Taxes:** Stripe doesn't file taxes for you. For hands-off global sales tax/VAT, consider Stripe Tax, or a Merchant-of-Record (Lemon Squeezy/Paddle).
- The **demo** (GitHub Pages) and **app** (Netlify) are the same code; only the host differs, so the demo can't be paywalled and the app can't be bypassed by editing config (prices are validated server-side against your env allowlist).
