/**
 * waves-api.giraffi.dev — a narrow, allowlisted GET proxy that adds the CORS
 * headers `environment.data.gov.uk` doesn't send, so the Expo **web** build
 * can read the Environment Agency's Bathing Water Quality API at all. Native
 * iOS/Android aren't subject to CORS but route through here too, so there's
 * one request path, one cache, and one place to adjust when the EA response
 * shape is pinned down (see expo/src/services/WaterQualityClient.ts).
 *
 * Why this exists rather than a public CORS proxy or `mode: 'no-cors'`:
 * docs/decisions/2026-09-06-cloudflare-worker-ea-proxy.md.
 *
 * Shape:
 *   GET https://waves-api.giraffi.dev/ea/<allowlisted EA path>?<query>
 *     -> https://environment.data.gov.uk/<same path>?<same query>
 *
 * Everything else (other hosts, other paths, non-GET) is refused here — this
 * is deliberately not an open proxy.
 */

const EA_ORIGIN = 'https://environment.data.gov.uk';

// EA path families this Worker will forward, matched as a prefix against the
// part after `/ea/`. Scoped to the Bathing Water Quality API only — not an
// open proxy — but kept at the family level (not deep per-endpoint paths) so
// that following an `_about` link from one response to a sibling resource
// (e.g. a site's list entry → its `latestComplianceAssessment` →
// `latestRiskPrediction`) doesn't need a Worker redeploy.
const ALLOWED_EA_PATH_PREFIXES = [
  'doc/bathing-water', // classification list + `.json`/`_view=all` variants
  'id/bathing-water', // dereferenceable site resource IDs
  'data/bathing-water-profile', // a single site's profile document
  'doc/bathing-water-quality', // compliance, samples, STP risk forecast (doc form)
  'data/bathing-water-quality', // the `data/` resources `_about` links point at
];

// Browser origins allowed to read the response. Native fetch sends no
// `Origin` and isn't gated by CORS, so it's unaffected by this list.
const ALLOWED_ORIGINS = new Set([
  'https://raffij.github.io', // GitHub Pages (the site lives under /waves)
  'http://localhost:8081', // `expo start --web`
  'http://localhost:19006', // legacy Expo web dev port, harmless to keep
]);

// Matches WaterQualityClient's own 6h AsyncStorage window, and keeps EA
// request volume low: one upstream hit per distinct query per 6h across all
// web visitors.
const EDGE_TTL_SECONDS = 6 * 60 * 60;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function isAllowedEaPath(path: string): boolean {
  // No `..` traversal, no protocol-relative or absolute URLs sneaking in.
  if (path.includes('..') || path.includes('//')) return false;
  return ALLOWED_EA_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`),
  );
}

export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('ok\n', { status: 200, headers: { ...cors, 'Content-Type': 'text/plain' } });
    }

    const eaPrefix = '/ea/';
    if (!url.pathname.startsWith(eaPrefix)) {
      return new Response('Not Found', { status: 404, headers: cors });
    }

    const eaPath = url.pathname.slice(eaPrefix.length);
    if (!isAllowedEaPath(eaPath)) {
      return new Response(`Path not allowed: ${eaPath}\n`, { status: 403, headers: cors });
    }

    const upstream = new URL(`${EA_ORIGIN}/${eaPath}`);
    upstream.search = url.search;

    // Shared edge cache keyed on the normalised upstream URL, so the query
    // string (not the caller's Origin) decides cache identity.
    const cache = caches.default;
    const cacheKey = new Request(upstream.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      headers.set('X-Proxy-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    let eaResponse: Response;
    try {
      eaResponse = await fetch(upstream.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // EA can be slow; don't hang a client forever.
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return new Response('Upstream fetch failed\n', { status: 502, headers: cors });
    }

    const body = await eaResponse.arrayBuffer();
    const baseHeaders = new Headers({
      'Content-Type': eaResponse.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': `public, max-age=${EDGE_TTL_SECONDS}`,
    });

    if (eaResponse.ok) {
      const toCache = new Response(body.slice(0), { status: eaResponse.status, headers: baseHeaders });
      ctx.waitUntil(cache.put(cacheKey, toCache));
    }

    const headers = new Headers(baseHeaders);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    headers.set('X-Proxy-Cache', 'MISS');
    return new Response(body, { status: eaResponse.status, headers });
  },
};
