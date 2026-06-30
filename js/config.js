/* Public runtime config. Loaded as a classic script before the app module.
 *
 * IMPORTANT — what's safe here vs. secret:
 *   SAFE to put in this file (they're public by design): supabaseUrl, supabaseAnonKey,
 *   Stripe *Price* IDs. These ship to every browser; that's expected.
 *   NEVER put here (server-only Netlify env vars): STRIPE_SECRET_KEY,
 *   STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY.  See SETUP-SAAS.md.
 *
 * The paywall turns on ONLY on the live app host (so the GitHub Pages demo at
 * nassersaleh.ca/folio stays a free, open demo). Add your app domain to APP_HOSTS. */
(function () {
  var host = location.hostname;
  var APP_HOSTS = ["app.nassersaleh.ca"];     // <-- your live paid-app domain(s)
  var isAppHost = APP_HOSTS.indexOf(host) !== -1 || /\.netlify\.app$/.test(host);

  window.PE_CONFIG = {
    saas: {
      // Auto-on for the app host; everywhere else (demo, localhost) stays open.
      enabled: isAppHost,
      appHosts: APP_HOSTS,

      // Firebase web config (ALL public/safe to commit — paste from Firebase console →
      // Project settings → Your apps → SDK setup and configuration → Config).
      firebase: {
        apiKey: "",
        authDomain: "",          // e.g. "folio-xxxx.firebaseapp.com"
        projectId: "",           // e.g. "folio-xxxx"
        appId: "",
        storageBucket: "",       // optional
        messagingSenderId: "",   // optional
      },

      // Stripe recurring Price IDs (create both in Stripe → one Product, two prices).
      prices: {
        monthly: { id: "", label: "$9 / month" },
        annual:  { id: "", label: "$90 / year" },
      },
      trialDays: 7,               // free trial length (card collected up front)
      planName: "Pro",

      checkoutFn: "/.netlify/functions/create-checkout-session",
      portalFn: "/.netlify/functions/create-portal-session",
    },
    brand: { name: "Folio", tagline: "Edit any PDF, right in your browser." },
  };
})();
