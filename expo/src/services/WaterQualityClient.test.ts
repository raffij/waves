import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
