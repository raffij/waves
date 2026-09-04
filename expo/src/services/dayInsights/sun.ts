import type { CloudCoverSeries } from '../CloudCoverSeries';
import type { SunBrightnessSeries } from '../SunBrightnessSeries';
import { afternoonSlots, type DayTense, morningSlots, type Slot } from './window';

// Sun bands read off the brightest hour in the window/segment, W/m² (already
// discounted for cloud cover) — below HAZY it's overcast, below SUNNY it's
// hazy/broken cloud, at/above SUNNY it's genuinely bright. Read alongside
// cloud cover (below), since brightness alone conflates "cloudy" with
// "winter sun sits low in the sky" — a thin, bright overcast can still cross
// SUNNY, and a clear pre-dawn/post-dusk hour reads as dark rather than
// overcast.
export const SUN_BAND_HAZY_WM2 = 120;
export const SUN_BAND_SUNNY_WM2 = 350;
// Only actually reachable under a clear sky — see the CLOUD_BAND_CLEAR_PCT
// gate in sunBandFor below, which demotes a bright-but-cloudy reading before
// it ever gets here. Tuned down from an initial 600: a clear 500 W/m² sky
// already reads as genuinely intense in practice, not merely "sunny".
export const SUN_BAND_STRONG_WM2 = 450;
// Cloud cover (%) at the clearest hour in the window/segment. Whichever of
// cloud cover and brightness reads cloudier wins the final band — see
// sunBandFor.
export const CLOUD_BAND_CLEAR_PCT = 25; // below this it's clear/sunny
export const CLOUD_BAND_OVERCAST_PCT = 75; // at/above this it's overcast regardless of brightness

// `strong` sits above `sunny` — genuinely intense sun (high-summer clear
// midday, the kind that wants sunscreen), not just "brighter than hazy".
// Cloud cover has no opinion above `sunny` (a clear reading just means
// nothing is holding brightness back, not that today's specific peak is
// unusually strong) — see the `strong`→`sunny` collapse in sunBandFor below.
export type SunBand = 'overcast' | 'hazy' | 'sunny' | 'strong';
const SUN_BAND_RANK: Record<SunBand, number> = { overcast: 0, hazy: 1, sunny: 2, strong: 3 };
// The 3-tier band cloud cover can actually speak to — `strong` collapses to
// `sunny` for the comparison in sunBandFor, since cloud % alone can't tell
// "clear" from "clear and unusually intense".
const CLOUD_COMPARABLE_BAND: Record<SunBand, 'overcast' | 'hazy' | 'sunny'> = {
  overcast: 'overcast',
  hazy: 'hazy',
  sunny: 'sunny',
  strong: 'sunny',
};
// Brightness and cloud cover each vote for a band; whichever reads cloudier
// wins. That resolves both ways a single signal misleads on its own: a
// bright reading under a fully overcast sky is diffuse light through cloud,
// not real sun (brightness alone says sunny, cloud cover corrects it to
// overcast) — and a low cloud-cover reading before sunrise/after sunset is
// just dark, not sunny (cloud cover alone says sunny, brightness corrects it
// to overcast). Either signal missing, the other decides alone. Cloud cover
// only ever demotes, never promotes past `sunny` — a clear reading can't
// tell "strong" from merely "sunny", only brightness can.
export function sunBandFor(peakWm2: number | null, minCloudPct: number | null): SunBand {
  const brightBand: SunBand | null =
    peakWm2 === null
      ? null
      : peakWm2 < SUN_BAND_HAZY_WM2
        ? 'overcast'
        : peakWm2 < SUN_BAND_SUNNY_WM2
          ? 'hazy'
          : peakWm2 < SUN_BAND_STRONG_WM2
            ? 'sunny'
            : 'strong';
  const cloudBand: SunBand | null =
    minCloudPct === null
      ? null
      : minCloudPct >= CLOUD_BAND_OVERCAST_PCT
        ? 'overcast'
        : minCloudPct < CLOUD_BAND_CLEAR_PCT
          ? 'sunny'
          : 'hazy';
  if (brightBand === null) return cloudBand ?? 'overcast';
  if (cloudBand === null) return brightBand;
  return SUN_BAND_RANK[cloudBand] < SUN_BAND_RANK[CLOUD_COMPARABLE_BAND[brightBand]] ? cloudBand : brightBand;
}

export interface SunReading {
  peak: number;
  minCloudPct: number | null;
}

export function sunOver(
  slots: Slot[],
  sun: SunBrightnessSeries | null,
  cloud: CloudCoverSeries | null,
): SunReading | null {
  if (!sun) return null;
  const readings = slots
    .map((s) => ({ wm2: sun.brightnessAt(s.at), cloudPct: cloud ? cloud.coverageAt(s.at) : null }))
    .filter((r): r is { wm2: number; cloudPct: number | null } => r.wm2 !== null);
  if (readings.length === 0) return null;

  // Band each hour on its own brightness/cloud pair and report the
  // best-banded hour, rather than the window's brightest hour and its
  // clearest hour picked independently (they can be different hours) — that
  // would pair a brief clearing's brightness with an unrelated hour's clear
  // sky and overstate how sunny the window was.
  let best = readings[0];
  let bestRank = SUN_BAND_RANK[sunBandFor(best.wm2, best.cloudPct)];
  for (const r of readings.slice(1)) {
    const rank = SUN_BAND_RANK[sunBandFor(r.wm2, r.cloudPct)];
    if (rank > bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  return { peak: best.wm2, minCloudPct: best.cloudPct };
}

// How strong the sun gets, morning vs. afternoon — brightening, clouding
// over, or one band held all day. This is phrased as a complete, natural
// fragment because it now lives in the same paragraph as the headline
// conditions rather than on a second line.
export function sunTrendClause(
  slots: Slot[],
  sun: SunBrightnessSeries | null,
  cloud: CloudCoverSeries | null,
  tense: DayTense,
): string | null {
  const morning = sunOver(morningSlots(slots), sun, cloud);
  const afternoon = sunOver(afternoonSlots(slots), sun, cloud);
  if (!morning && !afternoon) return null;

  const morningReading = morning ?? afternoon ?? { peak: 0, minCloudPct: null };
  const afternoonReading = afternoon ?? morning ?? { peak: 0, minCloudPct: null };
  const morningBand = sunBandFor(morningReading.peak, morningReading.minCloudPct);
  const afternoonBand = sunBandFor(afternoonReading.peak, afternoonReading.minCloudPct);
  if (morningBand === afternoonBand) {
    if (morningBand === 'overcast') {
      return tense === 'past'
        ? 'the day stayed overcast'
        : tense === 'today'
          ? 'the rest of the day looks overcast'
          : 'the day should stay overcast';
    }
    if (morningBand === 'hazy') {
      return tense === 'past'
        ? 'hazy sunshine lingered through the day'
        : tense === 'today'
          ? 'hazy sunshine should linger through the rest of the day'
          : 'hazy sunshine is likely through the day';
    }
    if (morningBand === 'strong') {
      return tense === 'past'
        ? 'strong sunshine lasted through the day'
        : tense === 'today'
          ? 'strong sunshine should continue through the rest of the day'
          : 'strong sunshine is likely through the day';
    }
    return tense === 'past'
      ? 'sunny spells lasted through the day'
      : tense === 'today'
        ? 'sunny spells should continue through the rest of the day'
        : 'sunny spells are likely through the day';
  }

  const afternoonPhrase = tense === 'today' ? 'this afternoon' : 'by afternoon';
  if (SUN_BAND_RANK[afternoonBand] > SUN_BAND_RANK[morningBand]) {
    return tense === 'past'
      ? `sunshine broke through ${afternoonPhrase}`
      : `sunshine should break through ${afternoonPhrase}`;
  }
  return tense === 'past' ? `cloud thickened ${afternoonPhrase}` : `cloud may thicken ${afternoonPhrase}`;
}
