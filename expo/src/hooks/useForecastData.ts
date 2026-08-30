import { useCallback, useEffect, useState } from 'react';
import type { Location } from '../models/Location';
import type { TideResponse } from '../models/TideModels';
import { TideAPIClient } from '../services/TideAPIClient';
import type { PrecipitationData, WaveData, WindData } from '../services/WaveAPIClient';
import { WaveAPIClient } from '../services/WaveAPIClient';

export interface ForecastData {
  data: TideResponse | null;
  waveData: WaveData | null;
  windData: WindData | null;
  precipitationData: PrecipitationData | null;
  fetchedAt: Date | null;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

// Fetches and coordinates tide + wave/wind together, keyed off the
// TideCheck API key and the selected location. Loads once as soon as a key
// is available, and again whenever `load(true)` is called (pull-to-refresh,
// the footer's Force refresh link) or the location changes.
export function useForecastData(apiKey: string | null | undefined, location: Location): ForecastData {
  const [data, setData] = useState<TideResponse | null>(null);
  const [waveData, setWaveData] = useState<WaveData | null>(null);
  const [windData, setWindData] = useState<WindData | null>(null);
  const [precipitationData, setPrecipitationData] = useState<PrecipitationData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!apiKey) return;
      setLoading(true);
      setError(null);

      const tideClient = new TideAPIClient(location.stationId, apiKey);
      const tideResult = force ? await tideClient.forceRefresh() : await tideClient.loadTideData();
      if (tideResult) {
        setData(tideResult.data);
        setFetchedAt(tideResult.fetchedAt);
      } else {
        setError('Could not load tide data. Check your connection or API key.');
      }

      const waveClient = new WaveAPIClient(location.id, location.latitude, location.longitude);
      const waveResult = force ? await waveClient.forceRefresh() : await waveClient.loadWaveData();
      if (waveResult) {
        setWaveData(waveResult.data);
        setWindData(waveResult.wind);
        setPrecipitationData(waveResult.precipitation);
      }

      setLoading(false);
    },
    [apiKey, location],
  );

  useEffect(() => {
    if (apiKey) {
      // `load` changes identity whenever apiKey or location changes, so this
      // also fires on a location switch — drop the previous location's data
      // immediately so it can't be mistaken for the new one while the fresh
      // load is in flight.
      setData(null);
      setWaveData(null);
      setWindData(null);
      setPrecipitationData(null);
      setFetchedAt(null);
      load();
    } else {
      // Key was cleared (reset) — drop stale data rather than let it
      // linger until a new key triggers a fresh load.
      setData(null);
      setFetchedAt(null);
    }
  }, [apiKey, load]);

  return { data, waveData, windData, precipitationData, fetchedAt, loading, error, load };
}
