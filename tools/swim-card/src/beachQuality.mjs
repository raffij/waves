import { wgs84ToOsGridRef } from './osGridRef.mjs';

// Per-beach water-quality "flag" status, driven by the Environment Agency's
// Bathing Water Quality open data (environment.data.gov.uk/bwq, branded
// "Swimfo") — the same source the reference mockup's footer credits
// alongside Southern Water.
//
// The geographic filter is min-/max-samplingPoint.easting/.northing —
// OSGB36 British National Grid coordinates, not WGS84 lat/long.
// osGridRef.mjs converts each beach's lat/long to easting/northing and
// queries a ~2km bounding box around it.
//
// Response shape confirmed 2026-09-06 against a real body (see
// expo/src/services/__fixtures__/bathing-water-morecambe-south.json). The
// single list request embeds the annual rBWD rating at
// `result.items[].latestComplianceAssessment.complianceClassification.name._value`
// ("Excellent" | "Good" | "Sufficient" | "Poor") and today's short-term
// pollution advisory at
// `result.items[].latestRiskPrediction.riskLevel.name._value` ("normal" |
// "increased"). Human-readable strings are wrapped as
// `{ _value, _datatype: "langString", _lang }`, sometimes inside a
// one-element array; readLangString() unwraps both.
//
// Nothing here ever reports "clear" on an unrecognised value: any request
// failure, an unexpected response shape, or no bathing water found near a
// beach's coordinates all resolve to 'unknown', never 'clear' — a wrong
// "unknown" costs a beach an icon; a wrong "clear" is a false safety claim.

const EA_BATHING_WATER_BASE = 'https://environment.data.gov.uk/doc/bathing-water.json';
// Matches the original (wrong) `dist=2` guess's intent: a ~2km-radius
// search around each beach, expressed as a bounding-box half-width in
// metres since the real API takes an easting/northing box, not a radius.
const SEARCH_RADIUS_METRES = 2000;
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

// Annual rBWD classifications the EA uses for bathing water compliance.
const FLAGGED_CLASSIFICATIONS = new Set(['poor', 'poor water quality']);
const CLEAR_CLASSIFICATIONS = new Set(['excellent', 'good', 'sufficient']);

// EA short-term-pollution (STP) risk levels (def/bwq-stp/*) that mean
// "don't swim today", whatever the annual rating says. "normal" is the
// all-clear.
const FLAGGED_RISK_LEVELS = new Set(['increased']);

// The EA's Linked-Data API wraps human-readable strings as
// { _value, _datatype: 'langString', _lang }, occasionally inside a
// one-element array, and just once in a while as a bare string.
function readLangString(field) {
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return readLangString(field[0]);
  if (field && typeof field === 'object' && typeof field._value === 'string') return field._value;
  return null;
}

async function fetchNearestStatus(site) {
  const { easting, northing } = wgs84ToOsGridRef(site.latitude, site.longitude);

  const url = new URL(EA_BATHING_WATER_BASE);
  url.searchParams.set('min-samplingPoint.easting', String(Math.round(easting - SEARCH_RADIUS_METRES)));
  url.searchParams.set('max-samplingPoint.easting', String(Math.round(easting + SEARCH_RADIUS_METRES)));
  url.searchParams.set('min-samplingPoint.northing', String(Math.round(northing - SEARCH_RADIUS_METRES)));
  url.searchParams.set('max-samplingPoint.northing', String(Math.round(northing + SEARCH_RADIUS_METRES)));
  url.searchParams.set('_view', 'default');
  url.searchParams.set('_pageSize', '1');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { classification: null, riskLevel: null };
    const body = await response.json();
    const item = body?.result?.items?.[0] ?? body?.items?.[0] ?? null;
    const classification =
      readLangString(item?.latestComplianceAssessment?.complianceClassification?.name)?.toLowerCase() ?? null;
    const riskLevel = readLangString(item?.latestRiskPrediction?.riskLevel?.name)?.toLowerCase() ?? null;
    return { classification, riskLevel };
  } catch {
    return { classification: null, riskLevel: null };
  } finally {
    clearTimeout(timeout);
  }
}

function toStatus({ classification, riskLevel }) {
  // A live STP advisory flags the beach regardless of the annual rating,
  // but an unrecognised risk level never clears it.
  if (riskLevel !== null && FLAGGED_RISK_LEVELS.has(riskLevel)) return 'flagged';
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
      status: toStatus(await fetchNearestStatus(site)),
    })),
  );
  return results;
}
