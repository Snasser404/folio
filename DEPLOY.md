# Deploying PDF Studio

The app is a **static site** (no build step, no server). Just publish the project folder.
Everything runs in the visitor's browser; there's no backend and no data leaves their device.

## Fastest: Netlify Drop (≈2 minutes, free)
1. Go to <https://app.netlify.com/drop>
2. Drag the **entire `EditPDF` folder** onto the page.
3. You get a live URL like `https://your-name.netlify.app`. Done.
4. (Optional) In Site settings → Domain, add your own custom domain.

> The included `netlify.toml` sets sensible caching/security headers automatically.

## Cloudflare Pages (free, fast CDN)
1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Pages → Connect to Git → pick the repo.
3. Build command: *(leave empty)* · Output directory: `/` · Deploy.

## Vercel
1. Push to GitHub, import the repo at <https://vercel.com/new>.
2. Framework preset: **Other** · Build command: empty · Output dir: `.` · Deploy.

## GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo → Settings → Pages → Source: **Deploy from a branch** → `main` / root.
3. Your site appears at `https://<user>.github.io/<repo>/` (the `.nojekyll` file is already included).

## Notes
- `serve.py`, `start.bat`, and `.claude/` are **local-dev helpers** — harmless to deploy, or delete before publishing.
- All asset paths are relative, so it works at a domain root **or** a sub-path.
- OCR lazy-loads Tesseract.js from a CDN on first use (needs internet); everything else works offline.
- Use **HTTPS** (all the hosts above do this automatically) — required for clipboard, workers, etc.

## ⚠️ Before charging money for it — read this
This is a **100% client-side** app: the full source ships to every visitor's browser, so anyone
can view/copy it. That's great for privacy, but it means you **cannot truly gate access with
client-side code alone** (any "license check" in the JS can be bypassed, and the files can be
copied). To sell it robustly you need one of:
- **Sell it as a product** (one-time purchase / download) via Gumroad, Lemon Squeezy, etc.
- **Hosted SaaS with real accounts** — add a small backend (auth + Stripe + license check). The
  PDF editing stays 100% client-side; only login/billing is server-side.
- **Freemium** — free core, paid "Pro" features unlocked via that backend.
See the chat for help choosing and building the right one.
