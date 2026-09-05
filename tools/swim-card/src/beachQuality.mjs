import { wgs84ToOsGridRef } from './osGridRef.mjs';

// Per-beach water-quality "flag" status, driven by the Environment Agency's
// Bathing Water Quality open data (environment.data.gov.uk/bwq, branded
// "Swimfo") — the same source the reference mockup's footer credits
// alongside Southern Water.
//
// ⚠️ PARTIALLY VERIFIED, still not run against the real service. This
// sandboxed session's outbound access to environment.data.gov.uk (and to
// southernwater.co.uk/streamwaterdata.co.uk, where the water companies'
// own storm-overflow telemetry is hosted) is blocked, but WebSearch (unlike
// WebFetch) isn't, and confirmed real API documentation:
// - The base endpoint and JSON format
//   (environment.data.gov.uk/doc/bathing-water.json) are correct.
// - The geographic filter is NOT lat/long/dist (that was a guess ported
//   from the flood-monitoring API's query shape, and wrong) — the real API
//   filters by min-/max-samplingPoint.easting/.northing, OSGB36 British
//   National Grid coordinates, not WGS84 lat/long. osGridRef.mjs converts
//   each beach's lat/long to easting/northing and queries a bounding box
//   around it, same 2km-radius intent as the original (wrong) `dist` guess.
// - The exact response field names for a site's current classification
//   (guessed below as `latestComplianceAssessment.complianceClassification`
//   plus the older `currentClassification.classification` guess, tried in
//   order) are still unconfirmed — search results mentioned
//   `latestComplianceAssessment...name` in passing but never showed a full
//   example response body to check the `label` vs `name` field.
//
// Run this for real and fix whatever's still wrong: the query URL, the
// field names read out of the response, or the classification -> flag
// mapping. Nothing here ever reports "clear" on a guess: any request
// failure, an unrecognised response shape, or no bathing water found near
// a beach's coordinates all resolve to 'unknown', never 'clear' — a wrong
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

// Classifications the EA uses for bathing water compliance, worst to best.
// A live short-term pollution risk advisory (however that surfaces in the
// real response) should also map to 'flagged' once confirmed.
const FLAGGED_CLASSIFICATIONS = new Set(['poor', 'poor water quality']);
const CLEAR_CLASSIFICATIONS = new Set(['excellent', 'good', 'sufficient']);

async function fetchNearestClassification(site) {
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
    if (!response.ok) return null;
    const body = await response.json();
    const item = body?.items?.[0] ?? body?.result?.items?.[0] ?? null;
    // Tried in order, most-likely-real first: none of these field names
    // have been confirmed against a real response body (see header
    // comment) — this stays a guess-chain the same way the pre-fix
    // lat/long/dist query was, just a better-informed one.
    const classification =
      item?.latestComplianceAssessment?.complianceClassification?.name ??
      item?.latestComplianceAssessment?.complianceClassification?.label ??
      item?.currentClassification?.classification?.label ??
      item?.classification ??
      null;
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
