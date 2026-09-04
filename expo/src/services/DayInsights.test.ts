import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CloudCoverSeries } from './CloudCoverSeries';
import { buildDayInsights, type DayInsightsInput } from './DayInsights';
import { DaylightSeries } from './DaylightSeries';
import { PrecipitationSeries } from './PrecipitationSeries';
import { SunBrightnessSeries } from './SunBrightnessSeries';
import { TemperatureSeries } from './TemperatureSeries';
import { TideClock } from './TideClock';
import { WindSeries } from './WindSeries';

// Characterisation ("golden") tests: they pin the exact sentence
// buildDayInsights produces for a spread of inputs, so a refactor that is
// meant to preserve behaviour can prove it did. The strings below are
// generated (`vitest -u`), not hand-authored — if a change here is
// deliberate, eyeball the diff and re-run with -u.

const TODAY_KEY = '2026-06-15';
const PAST_KEY = '2026-06-13';
const FUTURE_KEY = '2026-06-18';
// Frozen "now": 12:00 London (BST) on TODAY_KEY, so a `today` readout has
// half the window behind it and half still ahead.
const NOW = TideClock.parseLondonWallTime(`${TODAY_KEY}T12:00`) as Date;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

// --- fixture builders ------------------------------------------------------

// One reading per hour from 04:00 to 22:00 — a couple of hours of padding
// either side of the 06:00–20:00 window so every in-window lookup has
// neighbours to interpolate between.
const HOURS = Array.from({ length: 19 }, (_, i) => i + 4);
const times = (dayKey: string) => HOURS.map((h) => `${dayKey}T${String(h).padStart(2, '0')}:00`);

type PerHour = number | ((hour: number) => number | null);
const valueAt = (v: PerHour, hour: number): number | null => (typeof v === 'function' ? v(hour) : v);
const column = (v: PerHour) => HOURS.map((h) => valueAt(v, h));

function windSeries(dayKey: string, speed: PerHour, direction?: PerHour, gust?: PerHour): WindSeries {
  return new WindSeries({
    time: times(dayKey),
    wind_speed: column(speed),
    wind_direction: direction === undefined ? undefined : column(direction),
    wind_gusts: gust === undefined ? undefined : column(gust),
  });
}

function precipitationSeries(dayKey: string, mm: PerHour): PrecipitationSeries {
  return new PrecipitationSeries({ time: times(dayKey), precipitation: column(mm) });
}

function temperatureSeries(dayKey: string, feelsLike: PerHour, real?: PerHour): TemperatureSeries {
  return new TemperatureSeries({
    time: times(dayKey),
    temperature: column(real ?? feelsLike),
    apparent_temperature: column(feelsLike),
  });
}

function sunSeries(dayKey: string, wattsPerM2: PerHour): SunBrightnessSeries {
  return new SunBrightnessSeries({ time: times(dayKey), shortwave_radiation: column(wattsPerM2) });
}

function cloudSeries(dayKey: string, percent: PerHour): CloudCoverSeries {
  return new CloudCoverSeries({ time: times(dayKey), cloud_cover: column(percent) });
}

function daylightSeries(dayKey: string, sunriseHour: number, sunsetHour: number): DaylightSeries {
  const iso = (h: number) => `${dayKey}T${String(h).padStart(2, '0')}:00`;
  return new DaylightSeries({ time: [dayKey], sunrise: [iso(sunriseHour)], sunset: [iso(sunsetHour)] });
}

function summaryFor(dayKey: string, parts: Partial<DayInsightsInput>): string {
  const input: DayInsightsInput = {
    windSeries: null,
    precipitationSeries: null,
    daylightSeries: null,
    temperatureSeries: null,
    sunBrightnessSeries: null,
    cloudCoverSeries: null,
    reference: TideClock.parseLondonWallTime(`${dayKey}T12:00`) as Date,
    ...parts,
  };
  return buildDayInsights(input).summary;
}

// Common band-shaped hourly generators.
const calm = 8;
const breezy = 18;
const windy = 28;
const building = (h: number) => (h <= 12 ? 8 : 22);
const easing = (h: number) => (h <= 12 ? 27 : 9);
const southwest = 225;
const veering = (h: number) => (h <= 12 ? 200 : 305);
const dry = 0;
const showerySpell = (h: number) => (h >= 13 && h <= 16 ? 1.1 : 0);
const heavySpell = (h: number) => (h >= 10 && h <= 15 ? 3 : 0);
const drizzleSpell = (h: number) => (h >= 9 && h <= 13 ? 0.35 : 0);
const twoSpells = (h: number) => (h === 8 || h === 9 || h === 16 || h === 17 ? 1 : 0);
const overcast = { wm2: 60, cloud: 92 };
const hazy = { wm2: 220, cloud: 55 };
const sunny = { wm2: 420, cloud: 12 };
const strong = { wm2: 640, cloud: 6 };
const feelsCold = 6;
const feelsMild = 16;
const warming = (h: number) => (h <= 12 ? 13 : 20);
const cooling = (h: number) => (h <= 12 ? 20 : 13);

// --- wind ---------------------------------------------------------------

describe('wind', () => {
  it('calm all day, steady direction', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, calm, southwest) })).toMatchInlineSnapshot(
      `"Calm all day, from the southwest."`,
    );
  });

  it('breezy all day', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, breezy, southwest) })).toMatchInlineSnapshot(
      `"Breezy all day, from the southwest."`,
    );
  });

  it('windy all day (past)', () => {
    expect(summaryFor(PAST_KEY, { windSeries: windSeries(PAST_KEY, windy, southwest) })).toMatchInlineSnapshot(
      `"Windy all day, from the southwest."`,
    );
  });

  it('building through the day (future)', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, building, southwest) })).toMatchInlineSnapshot(
      `"Calm in the morning, with the wind expected to build to around 22mph by mid-afternoon, from the southwest."`,
    );
  });

  it('easing through the day (past)', () => {
    expect(summaryFor(PAST_KEY, { windSeries: windSeries(PAST_KEY, easing, southwest) })).toMatchInlineSnapshot(
      `"Windy in the morning, then eased through the afternoon, from the southwest."`,
    );
  });

  it('veering direction (future)', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, breezy, veering) })).toMatchInlineSnapshot(
      `"Breezy all day, expected to veer from south to northwest."`,
    );
  });

  it('gusting well above the sustained peak', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, breezy, southwest, 34) })).toMatchInlineSnapshot(
      `"Breezy all day, from the southwest, gusting to 34mph."`,
    );
  });

  it('gust within the normal spread is not named', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, breezy, southwest, 22) })).toMatchInlineSnapshot(
      `"Breezy all day, from the southwest."`,
    );
  });

  it('no direction data — speed clause only', () => {
    expect(summaryFor(FUTURE_KEY, { windSeries: windSeries(FUTURE_KEY, breezy) })).toMatchInlineSnapshot(
      `"Breezy all day."`,
    );
  });
});

// --- rain ---------------------------------------------------------------

describe('rain', () => {
  it('dry day (future)', () => {
    expect(summaryFor(FUTURE_KEY, { precipitationSeries: precipitationSeries(FUTURE_KEY, dry) })).toMatchInlineSnapshot(
      `"The day should stay dry. Wear a jumper and shorts, with sandals."`,
    );
  });

  it('single showery spell in the afternoon (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, { precipitationSeries: precipitationSeries(FUTURE_KEY, showerySpell) }),
    ).toMatchInlineSnapshot(
      `"Rain is likely through the afternoon, from 13:00 to 17:00. Wear a coat and shorts, with sandals."`,
    );
  });

  it('heavy spell across the middle of the day (past)', () => {
    expect(
      summaryFor(PAST_KEY, { precipitationSeries: precipitationSeries(PAST_KEY, heavySpell) }),
    ).toMatchInlineSnapshot(`"Heavy rain fell through the middle of the day, from 10:00 to 16:00."`);
  });

  it('drizzle spell (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, { precipitationSeries: precipitationSeries(FUTURE_KEY, drizzleSpell) }),
    ).toMatchInlineSnapshot(
      `"Drizzle is likely through the middle of the day, from 09:00 to 14:00. Wear a coat and shorts, with sandals."`,
    );
  });

  it('two separate spells (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, { precipitationSeries: precipitationSeries(FUTURE_KEY, twoSpells) }),
    ).toMatchInlineSnapshot(`"Showers are likely through the day. Wear a coat and shorts, with sandals."`);
  });

  it('rain already under way now (today)', () => {
    expect(
      summaryFor(TODAY_KEY, {
        precipitationSeries: precipitationSeries(TODAY_KEY, (h) => (h >= 10 && h <= 17 ? 1.2 : 0)),
      }),
    ).toMatchInlineSnapshot(`"Rain continues until 18:00. Wear a coat and shorts, with sandals."`);
  });

  it('earlier rain, now dry — ground still wet (today)', () => {
    expect(
      summaryFor(TODAY_KEY, {
        precipitationSeries: precipitationSeries(TODAY_KEY, (h) => (h >= 7 && h <= 9 ? 1 : 0)),
        temperatureSeries: temperatureSeries(TODAY_KEY, feelsMild),
      }),
    ).toMatchInlineSnapshot(
      `"The rest of the day should stay dry. It feels mild, around 16°C, with little change for the rest of the day. Wear a jumper and shorts, with sandals — still wet underfoot."`,
    );
  });
});

// --- sun --------------------------------------------------------------

describe('sun', () => {
  it('overcast all day (past)', () => {
    expect(
      summaryFor(PAST_KEY, {
        sunBrightnessSeries: sunSeries(PAST_KEY, overcast.wm2),
        cloudCoverSeries: cloudSeries(PAST_KEY, overcast.cloud),
      }),
    ).toMatchInlineSnapshot(`"The day stayed overcast."`);
  });

  it('hazy all day (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        sunBrightnessSeries: sunSeries(FUTURE_KEY, hazy.wm2),
        cloudCoverSeries: cloudSeries(FUTURE_KEY, hazy.cloud),
      }),
    ).toMatchInlineSnapshot(`"Hazy sunshine is likely through the day."`);
  });

  it('strong sunshine all day (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        sunBrightnessSeries: sunSeries(FUTURE_KEY, strong.wm2),
        cloudCoverSeries: cloudSeries(FUTURE_KEY, strong.cloud),
      }),
    ).toMatchInlineSnapshot(`"Strong sunshine is likely through the day."`);
  });

  it('sun breaks through by afternoon (past)', () => {
    expect(
      summaryFor(PAST_KEY, {
        sunBrightnessSeries: sunSeries(PAST_KEY, (h) => (h <= 12 ? overcast.wm2 : sunny.wm2)),
        cloudCoverSeries: cloudSeries(PAST_KEY, (h) => (h <= 12 ? overcast.cloud : sunny.cloud)),
      }),
    ).toMatchInlineSnapshot(`"Sunshine broke through by afternoon."`);
  });

  it('cloud thickens by afternoon (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        sunBrightnessSeries: sunSeries(FUTURE_KEY, (h) => (h <= 12 ? sunny.wm2 : overcast.wm2)),
        cloudCoverSeries: cloudSeries(FUTURE_KEY, (h) => (h <= 12 ? sunny.cloud : overcast.cloud)),
      }),
    ).toMatchInlineSnapshot(`"Cloud may thicken by afternoon."`);
  });
});

// --- feels-like temperature ------------------------------------------

describe('feels-like temperature', () => {
  it('cold and steady (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, { temperatureSeries: temperatureSeries(FUTURE_KEY, feelsCold) }),
    ).toMatchInlineSnapshot(
      `"It should feel cold, around 6°C, with little change through the day. Wear a jumper and trousers, with camper shoes."`,
    );
  });

  it('mild and steady (past)', () => {
    expect(summaryFor(PAST_KEY, { temperatureSeries: temperatureSeries(PAST_KEY, feelsMild) })).toMatchInlineSnapshot(
      `"It felt mild, around 16°C, with little change through the day."`,
    );
  });

  it('warming into the afternoon (future)', () => {
    expect(summaryFor(FUTURE_KEY, { temperatureSeries: temperatureSeries(FUTURE_KEY, warming) })).toMatchInlineSnapshot(
      `"It should feel mild, around 13–20°C, warming to 20°C by afternoon. Wear a jumper and shorts, with sandals."`,
    );
  });

  it('cooling into the evening (past)', () => {
    expect(summaryFor(PAST_KEY, { temperatureSeries: temperatureSeries(PAST_KEY, cooling) })).toMatchInlineSnapshot(
      `"It felt mild, around 13–20°C, and cooled to 13°C into the evening."`,
    );
  });
});

// --- light ----------------------------------------------------------

describe('light', () => {
  it('warns when sunset lands inside the window and is still ahead (today)', () => {
    expect(
      summaryFor(TODAY_KEY, {
        temperatureSeries: temperatureSeries(TODAY_KEY, feelsMild),
        daylightSeries: daylightSeries(TODAY_KEY, 5, 19),
      }),
    ).toMatchInlineSnapshot(
      `"It feels mild, around 16°C, with little change for the rest of the day. It will be dark by 19:00. Wear a jumper and shorts, with sandals."`,
    );
  });

  it('no light warning when the sun is up past the window end (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        temperatureSeries: temperatureSeries(FUTURE_KEY, feelsMild),
        daylightSeries: daylightSeries(FUTURE_KEY, 5, 21),
      }),
    ).toMatchInlineSnapshot(
      `"It should feel mild, around 16°C, with little change through the day. Wear a jumper and shorts, with sandals."`,
    );
  });
});

// --- clothing -----------------------------------------------------

describe('clothing', () => {
  it('mild dry day — one outfit (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        temperatureSeries: temperatureSeries(FUTURE_KEY, feelsMild),
        precipitationSeries: precipitationSeries(FUTURE_KEY, dry),
        windSeries: windSeries(FUTURE_KEY, calm, southwest),
      }),
    ).toMatchInlineSnapshot(
      `"Calm all day, from the southwest, with dry conditions expected. It should feel mild, around 16°C, with little change through the day. Wear a jumper and shorts, with sandals."`,
    );
  });

  it('cold wet day — dry robe and boots (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        temperatureSeries: temperatureSeries(FUTURE_KEY, feelsCold),
        precipitationSeries: precipitationSeries(FUTURE_KEY, (h) => (h >= 10 && h <= 16 ? 2 : 0)),
        windSeries: windSeries(FUTURE_KEY, breezy, southwest),
      }),
    ).toMatchInlineSnapshot(
      `"Breezy all day, from the southwest. Heavy rain is likely through the middle of the day, from 10:00 to 17:00. It should feel cold, around 6°C, with little change through the day. Wear a dry robe and trousers, with walking boots."`,
    );
  });

  it('mild wet calm day — coat and umbrella (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        temperatureSeries: temperatureSeries(FUTURE_KEY, feelsMild),
        precipitationSeries: precipitationSeries(FUTURE_KEY, (h) => (h >= 10 && h <= 16 ? 1 : 0)),
        windSeries: windSeries(FUTURE_KEY, calm, southwest),
      }),
    ).toMatchInlineSnapshot(
      `"Calm all day, from the southwest. Rain is likely through the middle of the day, from 10:00 to 17:00. It should feel mild, around 16°C, with little change through the day. Wear a coat and shorts, with sandals — carry an umbrella."`,
    );
  });

  it('warm morning, hot core — split outfit (future)', () => {
    expect(
      summaryFor(FUTURE_KEY, {
        temperatureSeries: temperatureSeries(FUTURE_KEY, (h) => (h >= 8 && h <= 17 ? 27 : 18)),
        precipitationSeries: precipitationSeries(FUTURE_KEY, dry),
      }),
    ).toMatchInlineSnapshot(
      `"The day should stay dry. It should feel hot, around 18–27°C, with little change through the day. Between 08:00 and 17:00, wear a t-shirt and shorts, with sandals. Outside those hours, wear a jumper and shorts, with sandals."`,
    );
  });
});

// --- whole readout, all signals present -------------------------

describe('full readout', () => {
  const everything = (dayKey: string): Partial<DayInsightsInput> => ({
    windSeries: windSeries(dayKey, building, veering, 30),
    precipitationSeries: precipitationSeries(dayKey, showerySpell),
    temperatureSeries: temperatureSeries(dayKey, warming),
    sunBrightnessSeries: sunSeries(dayKey, (h) => (h <= 12 ? hazy.wm2 : sunny.wm2)),
    cloudCoverSeries: cloudSeries(dayKey, (h) => (h <= 12 ? hazy.cloud : sunny.cloud)),
    daylightSeries: daylightSeries(dayKey, 5, 19),
  });

  it('past day', () => {
    expect(summaryFor(PAST_KEY, everything(PAST_KEY))).toMatchInlineSnapshot(
      `"Calm in the morning, then wind built to around 22mph by mid-afternoon, veered from south to northwest. Rain fell through the afternoon, from 13:00 to 17:00. Sunshine broke through by afternoon. It felt mild, around 13–20°C, and warmed to 20°C by afternoon."`,
    );
  });

  it('today', () => {
    expect(summaryFor(TODAY_KEY, everything(TODAY_KEY))).toMatchInlineSnapshot(
      `"Calm this morning, with wind building to around 22mph by mid-afternoon, veering from south to northwest. Rain through the afternoon, from 13:00 to 17:00. Sunshine should break through this afternoon. It feels warm, around 13–20°C, warming to 20°C this afternoon. It will be dark by 19:00. Wear a coat and shorts, with sandals."`,
    );
  });

  it('future day', () => {
    expect(summaryFor(FUTURE_KEY, everything(FUTURE_KEY))).toMatchInlineSnapshot(
      `"Calm in the morning, with the wind expected to build to around 22mph by mid-afternoon, expected to veer from south to northwest. Rain is likely through the afternoon, from 13:00 to 17:00. Sunshine should break through by afternoon. It should feel mild, around 13–20°C, warming to 20°C by afternoon. It will be dark by 19:00. Wear a coat and shorts, with sandals."`,
    );
  });

  it('no series at all — tide-only fallback', () => {
    expect(summaryFor(FUTURE_KEY, {})).toMatchInlineSnapshot(`"Tide data only — wind and rain forecast unavailable."`);
  });
});
