// Converts a WGS84 (GPS) latitude/longitude into an OSGB36 British National
// Grid easting/northing — the coordinate system the Environment Agency's
// Bathing Water Quality API filters by (min-/max-samplingPoint.easting and
// .northing), not lat/long/dist. See WaterQualityClient.ts for why this
// exists.
//
// The two-step Helmert-then-Redfearn-Transverse-Mercator algorithm and every
// constant below (the WGS84/Airy1830 ellipsoid parameters, the OSGB36
// Helmert transform parameters, and the National Grid true-origin/false-
// origin/scale-factor constants) are the standard ones published by
// Ordnance Survey and cross-checked against three independent sources: the
// OS's own "guide to coordinate systems in Great Britain", the
// OrdnanceSurvey/os-transform proj4 string
// (+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489), and Chris
// Veness's widely-used geodesy library (github.com/chrisveness/geodesy).
// The Transverse Mercator step is verified against that library's own
// worked example (see osGridRef.test.ts) — the Helmert step isn't
// independently verified from here (no WGS84-in/OSGB36-out ground truth was
// available to fetch), but WGS84 and OSGB36 already agree to within ~100m
// across Great Britain, which the bounding-box margin below comfortably
// absorbs.

interface Ellipsoid {
  a: number;
  b: number;
  f: number;
}

const WGS84: Ellipsoid = { a: 6378137, b: 6356752.314245, f: 1 / 298.257223563 };
const AIRY_1830: Ellipsoid = { a: 6377563.396, b: 6356256.909, f: 1 / 299.3249646 };

// WGS84 -> OSGB36, in metres/arcseconds/ppm (published by Ordnance Survey).
const HELMERT_WGS84_TO_OSGB36 = {
  tx: -446.448,
  ty: 125.157,
  tz: -542.06,
  rx: -0.1502,
  ry: -0.247,
  rz: -0.8421,
  s: 20.4894,
};

// OS National Grid true-origin / projection constants (Airy 1830 ellipsoid).
const GRID_PHI0 = toRadians(49); // true origin latitude
const GRID_LAMBDA0 = toRadians(-2); // true origin longitude (2°W)
const GRID_N0 = -100000; // true origin northing
const GRID_E0 = 400000; // true origin easting
const GRID_F0 = 0.9996012717; // central meridian scale factor

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toArcsecRadians(arcseconds: number): number {
  return toRadians(arcseconds / 3600);
}

interface Cartesian {
  x: number;
  y: number;
  z: number;
}

// Geodetic lat/lon (on the given ellipsoid) -> ECEF cartesian. Height above
// the ellipsoid is assumed to be 0 — we only ever have surface-level
// lat/long for a beach/pier, never an elevation, and the error that
// introduces is well under the bounding-box margin this feeds into.
function toCartesian(latitude: number, longitude: number, ellipsoid: Ellipsoid): Cartesian {
  const phi = toRadians(latitude);
  const lambda = toRadians(longitude);
  const { a, f } = ellipsoid;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  const eSq = 2 * f - f * f;
  const nu = a / Math.sqrt(1 - eSq * sinPhi * sinPhi);

  return {
    x: nu * cosPhi * cosLambda,
    y: nu * cosPhi * sinLambda,
    z: nu * (1 - eSq) * sinPhi,
  };
}

// ECEF cartesian -> geodetic lat/lon (on the given ellipsoid), by Bowring's method.
function toGeodetic(cartesian: Cartesian, ellipsoid: Ellipsoid): { latitude: number; longitude: number } {
  const { x, y, z } = cartesian;
  const { a, b, f } = ellipsoid;

  const e2 = 2 * f - f * f;
  const epsilon2 = e2 / (1 - e2);
  const p = Math.sqrt(x * x + y * y);
  const r = Math.sqrt(p * p + z * z);

  const tanBeta = ((b * z) / (a * p)) * (1 + (epsilon2 * b) / r);
  const sinBeta = tanBeta / Math.sqrt(1 + tanBeta * tanBeta);
  const cosBeta = sinBeta / tanBeta;

  const phi = Number.isNaN(cosBeta)
    ? 0
    : Math.atan2(z + epsilon2 * b * sinBeta * sinBeta * sinBeta, p - e2 * a * cosBeta * cosBeta * cosBeta);
  const lambda = Math.atan2(y, x);

  return { latitude: (phi * 180) / Math.PI, longitude: (lambda * 180) / Math.PI };
}

// 7-parameter Helmert datum transform (small-angle rotation form).
function applyHelmertTransform(cartesian: Cartesian): Cartesian {
  const { x, y, z } = cartesian;
  const { tx, ty, tz, rx, ry, rz, s } = HELMERT_WGS84_TO_OSGB36;

  const scale = s / 1e6 + 1;
  const rxRad = toArcsecRadians(rx);
  const ryRad = toArcsecRadians(ry);
  const rzRad = toArcsecRadians(rz);

  return {
    x: tx + x * scale - y * rzRad + z * ryRad,
    y: ty + x * rzRad + y * scale - z * rxRad,
    z: tz - x * ryRad + y * rxRad + z * scale,
  };
}

export interface OsGridReference {
  easting: number;
  northing: number;
}

// Transverse Mercator projection of an OSGB36 lat/lon onto the National
// Grid (the Redfearn series, as published by Ordnance Survey).
function osgb36ToGridRef(latitude: number, longitude: number): OsGridReference {
  const phi = toRadians(latitude);
  const lambda = toRadians(longitude);
  const { a, b } = AIRY_1830;

  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n * n * n;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const tan2Phi = tanPhi * tanPhi;
  const tan4Phi = tan2Phi * tan2Phi;
  const cos3Phi = cosPhi * cosPhi * cosPhi;
  const cos5Phi = cos3Phi * cosPhi * cosPhi;

  const nu = (a * GRID_F0) / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = (a * GRID_F0 * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;

  const ma = (1 + n + 1.25 * n2 + 1.25 * n3) * (phi - GRID_PHI0);
  const mb = (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(phi - GRID_PHI0) * Math.cos(phi + GRID_PHI0);
  const mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (phi - GRID_PHI0)) * Math.cos(2 * (phi + GRID_PHI0));
  const md = (35 / 24) * n3 * Math.sin(3 * (phi - GRID_PHI0)) * Math.cos(3 * (phi + GRID_PHI0));
  const m = b * GRID_F0 * (ma - mb + mc - md);

  const i = m + GRID_N0;
  const ii = (nu / 2) * sinPhi * cosPhi;
  const iii = (nu / 24) * sinPhi * cos3Phi * (5 - tan2Phi + 9 * eta2);
  const iiiA = (nu / 720) * sinPhi * cos5Phi * (61 - 58 * tan2Phi + tan4Phi);
  const iv = nu * cosPhi;
  const v = (nu / 6) * cos3Phi * (nu / rho - tan2Phi);
  const vi = (nu / 120) * cos5Phi * (5 - 18 * tan2Phi + tan4Phi + 14 * eta2 - 58 * tan2Phi * eta2);

  const deltaLambda = lambda - GRID_LAMBDA0;
  const deltaLambda2 = deltaLambda * deltaLambda;
  const deltaLambda3 = deltaLambda2 * deltaLambda;
  const deltaLambda4 = deltaLambda2 * deltaLambda2;
  const deltaLambda5 = deltaLambda4 * deltaLambda;
  const deltaLambda6 = deltaLambda4 * deltaLambda2;

  const northing = i + ii * deltaLambda2 + iii * deltaLambda4 + iiiA * deltaLambda6;
  const easting = GRID_E0 + iv * deltaLambda + v * deltaLambda3 + vi * deltaLambda5;

  return { easting, northing };
}

// WGS84 (GPS) latitude/longitude -> OSGB36 British National Grid easting/northing.
export function wgs84ToOsGridRef(latitude: number, longitude: number): OsGridReference {
  const wgs84Cartesian = toCartesian(latitude, longitude, WGS84);
  const osgb36Cartesian = applyHelmertTransform(wgs84Cartesian);
  const osgb36 = toGeodetic(osgb36Cartesian, AIRY_1830);
  return osgb36ToGridRef(osgb36.latitude, osgb36.longitude);
}

// Exported for testing the Transverse Mercator step in isolation, against
// Ordnance Survey's own published worked example (an OSGB36-native lat/lon,
// not WGS84 — see osGridRef.test.ts).
export const _internal = { osgb36ToGridRef };
