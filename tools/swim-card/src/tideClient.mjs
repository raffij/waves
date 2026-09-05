// Fetches tide extremes + the time series from TideCheck, for one station,
// one call, no cache — this tool runs once and exits, so there's nothing
// to cache. Mirrors the request shape in expo/src/services/TideAPIClient.ts
// and mac-widget/wave-hastings.15m.swift, but is its own standalone
// implementation (no shared code between this repo's independent clients).

export async function fetchTideData(stationId, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://tidecheck.com/api/station/${stationId}/tides`, {
      headers: { 'X-API-Key': apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`TideCheck API returned ${response.status} ${response.statusText}`);
    }
    return await response.json(); // { extremes: Extreme[], timeSeries: SeriesPoint[] }
  } finally {
    clearTimeout(timeout);
  }
}
