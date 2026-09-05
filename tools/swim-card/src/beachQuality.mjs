// Per-beach water-quality "flag" status, driven by the Environment Agency's
// Bathing Water Quality open data (environment.data.gov.uk) — the same
// source the reference mockup's footer credits alongside Southern Water.
//
// ⚠️ UNVERIFIED INTEGRATION. This sandboxed session has outbound access
// blocked to environment.data.gov.uk (and to southernwater.co.uk and
// streamwaterdata.co.uk, where the water companies' own live storm-overflow
// telemetry is hosted), so the request shape below could not be tested
// against the real service — it's built from training knowledge of how
// environment.data.gov.uk's other Linked Data APIs (e.g. flood-monitoring)
// query by lat/long/dist, not from confirmed bathing-water API docs. Run
// this for real and fix whatever's wrong: the query URL, the field names
// read out of the response, or the classification -> flag mapping.
//
// Nothing here ever reports "clear" on a guess: any request failure, an
// unrecognised response shape, or no bathing water found near a beach's
// coordinates all resolve to 'unknown', never 'clear' — a wrong "unknown"
// costs a beach an icon; a wrong "clear" is a false safety claim.

const EA_BATHING_WATER_BASE = 'https://environment.data.gov.uk/doc/bathing-water.json';
const SEARCH_RADIUS_KM = 2;
const FETCH_TIMEOUT_MS = 8000;

// Approximate real-world coordinates along the Bexhill-to-Fairlight
// coastline, in the same left-to-right order the mockup shows them.
export const BEACH_SITES = [
  { name: 'Bexhill', latitude: 50.8375, longitude: 0.47 },
  { name: 'Glyne Gap', latitude: 50.845, longitude: 0.525 },
  { name: 'Bulverhythe', latitude: 50.848, longitude: 0.545 },
  { name: 'St Leonards', latitude: 50.852, longitude: 0.565 },
  { name: 'Pelham', latitude: 50.855, longitude: 0.59 },
  { name: 'Rock-a-Nore', latitude: 50.856, longitude: 0.605 },
  { name: 'Fairlight', latitude: 50.865, longitude: 0.635 },
];

// Classifications the EA uses for bathing water compliance, worst to best.
// A live short-term pollution risk advisory (however that surfaces in the
// real response) should also map to 'flagged' once confirmed.
const FLAGGED_CLASSIFICATIONS = new Set(['poor', 'poor water quality']);
const CLEAR_CLASSIFICATIONS = new Set(['excellent', 'good', 'sufficient']);

async function fetchNearestClassification(site) {
  const url = new URL(EA_BATHING_WATER_BASE);
  url.searchParams.set('lat', String(site.latitude));
  url.searchParams.set('long', String(site.longitude));
  url.searchParams.set('dist', String(SEARCH_RADIUS_KM));
  url.searchParams.set('_view', 'default');
  url.searchParams.set('_pageSize', '1');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    const item = body?.items?.[0] ?? body?.result?.items?.[0] ?? null;
    const classification = item?.currentClassification?.classification?.label ?? item?.classification ?? null;
    return typeof classification === 'string' ? classification.toLowerCase() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function classificationToStatus(classification) {
  if (classification === null) return 'unknown';
  if (FLAGGED_CLASSIFICATIONS.has(classification)) return 'flagged';
  if (CLEAR_CLASSIFICATIONS.has(classification)) return 'clear';
  return 'unknown';
}

// Fetches a flag ('clear' | 'flagged' | 'unknown') for each site, in
// parallel, independently — one site's failure never affects another's,
// same "fetched independently" convention WaveAPIClient.ts uses for its
// wave/wind calls.
export async function fetchBeachFlags(sites = BEACH_SITES) {
  const results = await Promise.all(
    sites.map(async (site) => ({
      name: site.name,
      status: classificationToStatus(await fetchNearestClassification(site)),
    })),
  );
  return results;
}
