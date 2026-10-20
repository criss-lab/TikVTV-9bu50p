# Render deployment for TikVTVz

The live Render Static Site is [tikvtvz](https://dashboard.render.com/static/srv-dbbp07om7kps73didmng) in the approved workspace. Its source is `criss-lab/TikVTV-9bu50p`, branch `feature/pesapal-premium-integration`, build command `npm ci && npm run build`, and publish directory `dist`.

## Required Render dashboard configuration

1. In **Environment**, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the actual OnSpace project URL and public anon key. Do not set a service-role key in any `VITE_` variable. These values are embedded at build time; deploy again after changing them.
2. In **Redirects/Rewrites**, add a **Rewrite** from `/*` to `/index.html` so direct loads and refreshes of `/premium`, `/payment-callback`, and other React Router paths return the SPA shell. Render does not use Cloudflare's `public/_redirects` file.
3. Verify the deployed commit is the current branch head. If Render still shows an old SHA after a push, check the GitHub/Render repository integration and auto-deploy event history. A green GitHub Actions build does not imply Render deployed that SHA.
4. Check the root, `/premium`, and `/payment-callback` in a browser, including a hard refresh. A callback without a tracking ID should show a missing-reference message, not a 404.
5. Deploy the authenticated `pesapal-payment` backend and database/RLS described in [PESAPAL_BACKEND.md](./PESAPAL_BACKEND.md) before allowing real checkout. A static site alone cannot securely verify or grant paid entitlements.
6. Only after these checks, attach `streamora.co.ke` to Render and use Render's verified custom-domain DNS instructions in Cloudflare. Do not switch production DNS prematurely.

Cloudflare Pages preview is now an optional manual workflow, not the production host.
