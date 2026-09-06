# waves-api

A Cloudflare Worker at **`waves-api.giraffi.dev`** that proxies a small,
allowlisted slice of the Environment Agency's
[Bathing Water Quality API](https://environment.data.gov.uk/bwq/doc/api-bwq-reference-v0.4.html),
adding the CORS headers `environment.data.gov.uk` doesn't send.

Without it, the Expo **web** build can't read that API at all — the browser
blocks the cross-origin response (see
[`docs/decisions/2026-09-05-skip-water-quality-fetch-on-web-cors.md`](../../docs/decisions/2026-09-05-skip-water-quality-fetch-on-web-cors.md),
superseded by
[`2026-09-06-cloudflare-worker-ea-proxy.md`](../../docs/decisions/2026-09-06-cloudflare-worker-ea-proxy.md)).
Native iOS/Android aren't subject to CORS but route through here too, so the
app has one request path and one shared cache.

## What it does

```
GET https://waves-api.giraffi.dev/ea/<allowlisted EA path>?<query>
  → https://environment.data.gov.uk/<same path>?<same query>
```

- **GET only.** `OPTIONS` gets a CORS preflight response; anything else is `405`.
- **Allowlisted paths only** (`src/index.ts` → `ALLOWED_EA_PATH_PREFIXES`):
  bathing-water classification, a single site's profile, and the daily
  short-term pollution risk forecast. Any other path is `403` — this is not
  an open proxy.
- **Pinned CORS.** `Access-Control-Allow-Origin` is echoed only for known
  origins (the Pages site + localhost dev). Native requests send no `Origin`
  and don't need it.
- **6h edge cache** (`caches.default`), keyed on the upstream URL, matching
  `WaterQualityClient`'s own cache window and keeping EA request volume low.
- `/` and `/health` return `ok`.

## Develop

```bash
npm install
npm run dev        # wrangler dev — local Worker at http://localhost:8787
npm run typecheck
```

Try it: `curl 'http://localhost:8787/ea/doc/bathing-water.json?_pageSize=1'`

## Deploy

CI deploys on pushes to `main` that touch `workers/**`
([`.github/workflows/deploy-worker.yml`](../../.github/workflows/deploy-worker.yml)),
using repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Manual:

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run deploy
```

The API token needs the **Edit Cloudflare Workers** template scope, plus
DNS edit on the `giraffi.dev` zone for the `custom_domain` route.
