import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A real environment.data.gov.uk bathing-water.json list response (the
// Morecambe South sampling point), captured 2026-09-06. This is the body
// WaterQualityClient's parsing is written against — see its header comment
// and docs/decisions/2026-09-06-bathing-water-status-from-single-list-response.md.
const MORECAMBE_SOUTH = JSON.parse(
  readFileSync(new URL('./__fixtures__/bathing-water-morecambe-south.json', import.meta.url), 'utf8'),
);

// Deep clone so a test can mutate one field without touching the shared fixture.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const jsonResponse = (body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

// AsyncStorage has no Node implementation — stub it so the client can be
// exercised under Vitest. Every method resolves to a miss / no-op, which
// forces loadWaterQuality() straight through to the network path.
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  },
}));

const { WaterQualityClient } = await import('./WaterQualityClient');

describe('WaterQualityClient coordinate guard', () => {
  beforeEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not hit the network when latitude/longitude are blank', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await new WaterQualityClient('somewhere', '', '').loadWaterQuality();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result?.status).toBe('unknown');
  });

  it('does not hit the network when a coordinate is non-numeric (NaN)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await new WaterQualityClient('somewhere', '50.86', 'n/a').loadWaterQuality();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result?.status).toBe('unknown');
  });

  it('does not hit the network for a location outside Great Britain', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Nice, France — a real place, valid numbers, just not one the EA
    // bathing-water API can answer for.
    const result = await new WaterQualityClient('nice', '43.70', '7.27').loadWaterQuality();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result?.status).toBe('unknown');
  });

  it('builds a request with finite easting/northing for a GB location', async () => {
    const fetchSpy = vi.fn((_url: string): Promise<Response> =>
      Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await new WaterQualityClient('hastings', '50.86', '0.60').loadWaterQuality();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('waves-api.giraffi.dev/ea/doc/bathing-water.json');
    expect(calledUrl).not.toMatch(/NaN/);
    const params = new URL(calledUrl).searchParams;
    for (const key of [
      'min-samplingPoint.easting',
      'max-samplingPoint.easting',
      'min-samplingPoint.northing',
      'max-samplingPoint.northing',
    ]) {
      expect(Number.isFinite(Number(params.get(key)))).toBe(true);
    }
  });
});

describe('WaterQualityClient response parsing', () => {
  beforeEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const load = () => new WaterQualityClient('morecambe', '54.0728', '-2.8764').loadWaterQuality();

  it("reads name and annual rating out of the real 'Good' list response", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(MORECAMBE_SOUTH)),
    );

    const result = await load();

    expect(result?.siteName).toBe('Morecambe South');
    expect(result?.classification).toBe('good');
    expect(result?.status).toBe('clear');
  });

  it("maps an annual 'Poor' rating to flagged", async () => {
    const body = clone(MORECAMBE_SOUTH);
    body.result.items[0].latestComplianceAssessment.complianceClassification.name._value = 'Poor';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(body)),
    );

    const result = await load();

    expect(result?.classification).toBe('poor');
    expect(result?.status).toBe('flagged');
  });

  it("flags a live 'increased' short-term-pollution risk even when the annual rating is Good", async () => {
    const body = clone(MORECAMBE_SOUTH);
    body.result.items[0].latestRiskPrediction.riskLevel.name._value = 'increased';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(body)),
    );

    const result = await load();

    expect(result?.classification).toBe('good');
    expect(result?.status).toBe('flagged');
  });

  it("leaves status 'clear' when the risk level is the 'normal' all-clear", async () => {
    // The fixture already carries riskLevel "normal" — assert it doesn't flag.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(MORECAMBE_SOUTH)),
    );

    expect((await load())?.status).toBe('clear');
  });

  it('unwraps a langString value delivered as a one-element array', async () => {
    const body = clone(MORECAMBE_SOUTH);
    body.result.items[0].name = [{ _value: 'Morecambe South', _datatype: 'langString', _lang: 'en' }];
    body.result.items[0].latestComplianceAssessment.complianceClassification.name = [
      { _value: 'Sufficient', _datatype: 'langString', _lang: 'en' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(body)),
    );

    const result = await load();

    expect(result?.siteName).toBe('Morecambe South');
    expect(result?.classification).toBe('sufficient');
    expect(result?.status).toBe('clear');
  });

  it("degrades to 'unknown' when no bathing water is near the coordinates", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ result: { items: [] } })),
    );

    const result = await load();

    expect(result?.status).toBe('unknown');
    expect(result?.siteName).toBeNull();
    expect(result?.classification).toBeNull();
  });

  it("degrades to 'unknown' on an unrecognised classification rather than guessing 'clear'", async () => {
    const body = clone(MORECAMBE_SOUTH);
    body.result.items[0].latestComplianceAssessment.complianceClassification.name._value = 'Not yet classified';
    delete body.result.items[0].latestRiskPrediction;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(body)),
    );

    expect((await load())?.status).toBe('unknown');
  });
});
