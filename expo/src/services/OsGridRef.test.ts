import { describe, expect, it } from 'vitest';
import { _internal, wgs84ToOsGridRef } from './OsGridRef';

describe('osgb36ToGridRef', () => {
  it('matches the published Ordnance Survey Transverse Mercator worked example', () => {
    // 52°39'27.2531"N 1°43'04.5177"E on OSGB36 -> easting 651409.903,
    // northing 313177.270 — the canonical worked example from OS's own
    // "guide to coordinate systems in Great Britain" (Annex C). Tests the
    // Transverse Mercator step alone (input is already OSGB36, not WGS84)
    // — see OsGridRef.ts's header comment for why the Helmert step isn't
    // independently verified here.
    const latitude = 52 + 39 / 60 + 27.2531 / 3600;
    const longitude = 1 + 43 / 60 + 4.5177 / 3600;

    const { easting, northing } = _internal.osgb36ToGridRef(latitude, longitude);

    expect(easting).toBeCloseTo(651409.903, 2);
    expect(northing).toBeCloseTo(313177.27, 2);
  });
});

describe('wgs84ToOsGridRef', () => {
  it('places Hastings Pier in the "TQ" 100km grid square, East Sussex', () => {
    // A coarse sanity/regression check, not an independently-verified
    // precision one (no live-confirmed OS grid reference for Hastings Pier
    // specifically was available to test against — see this module's
    // header comment). Hastings Pier (50.86°N 0.60°E) should land well
    // inside the "TQ" 100km grid square (easting 500,000-600,000, northing
    // 100,000-200,000) that covers this stretch of the East Sussex coast —
    // wide enough to catch a wrong sign, a degrees/radians mixup, or a
    // swapped easting/northing, not to assert metre-level accuracy.
    const { easting, northing } = wgs84ToOsGridRef(50.86, 0.6);

    expect(easting).toBeGreaterThan(500000);
    expect(easting).toBeLessThan(600000);
    expect(northing).toBeGreaterThan(100000);
    expect(northing).toBeLessThan(200000);
  });
});
