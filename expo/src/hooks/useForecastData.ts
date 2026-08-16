import { useCallback, useEffect, useState } from 'react';
import type { TideResponse } from '../models/TideModels';
import { TideAPIClient } from '../services/TideAPIClient';
import type { WaveData, WindData } from '../services/WaveAPIClient';
import { WaveAPIClient } from '../services/WaveAPIClient';

const STATION_ID = 'hastings_pier-hgp-gbr-cco';

export interface ForecastData {
  data: TideResponse | null;
  waveData: WaveData | null;
  windData: WindData | null;
  fetchedAt: Date | null;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

// Fetches and coordinates tide + wave/wind together, keyed off the
// TideCheck API key. Loads once as soon as a key is available, and again
// whenever `load(true)` is called (pull-to-refresh, the footer's Force
// refresh link).
export function useForecastData(apiKey: string | null | undefined): ForecastData {
  const [data, setData] = useState<TideResponse | null>(null);
  const [waveData, setWaveData] = useState<WaveData | null>(null);
  const [windData, setWindData] = useState<WindData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!apiKey) return;
      setLoading(true);
      setError(null);

      const tideClient = new TideAPIClient(STATION_ID, apiKey);
      const tideResult = force ? await tideClient.forceRefresh() : await tideClient.loadTideData();
      if (tideResult) {
        setData(tideResult.data);
        setFetchedAt(tideResult.fetchedAt);
      } else {
        setError('Could not load tide data. Check your connection or API key.');
      }

      const waveClient = new WaveAPIClient();
      const waveResult = force ? await waveClient.forceRefresh() : await waveClient.loadWaveData();
      if (waveResult) {
        setWaveData(waveResult.data);
        setWindData(waveResult.wind);
      }

      setLoading(false);
    },
    [apiKey],
  );

  useEffect(() => {
    if (apiKey) {
      load();
    } else {
      // Key was cleared (reset) — drop stale data rather than let it
      // linger until a new key triggers a fresh load.
      setData(null);
      setFetchedAt(null);
    }
  }, [apiKey, load]);

  return { data, waveData, windData, fetchedAt, loading, error, load };
}
