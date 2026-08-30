import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Location } from '../models/Location';
import type { TideResponse } from '../models/TideModels';
import { TideAPIClient } from '../services/TideAPIClient';
import type { PrecipitationData, WaveData, WaveDataResult, WindData } from '../services/WaveAPIClient';
import { WaveAPIClient } from '../services/WaveAPIClient';

interface TideResult {
  data: TideResponse;
  fetchedAt: Date;
}

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

function tideQueryKey(location: Location, apiKey: string | null | undefined) {
  return ['tide', location.stationId, apiKey] as const;
}

function waveQueryKey(location: Location, apiKey: string | null | undefined) {
  return ['wave', location.id, apiKey] as const;
}

// `force` picks between each client's cache-first load and its
// cache-bypassing forceRefresh — both go through the same TanStack Query
// cache entry either way, just via loadTideData()/loadWaveData() (normal
// load, gated by `enabled`) or forceRefresh() (pull-to-refresh, the
// footer's Force refresh link).
function tideQueryFn(location: Location, apiKey: string, force: boolean) {
  return async (): Promise<TideResult> => {
    const client = new TideAPIClient(location.stationId, apiKey);
    const result = force ? await client.forceRefresh() : await client.loadTideData();
    if (!result) throw new Error('Could not load tide data. Check your connection or API key.');
    return result;
  };
}

function waveQueryFn(location: Location, force: boolean) {
  return async (): Promise<WaveDataResult | null> => {
    const client = new WaveAPIClient(location.id, location.latitude, location.longitude);
    return force ? await client.forceRefresh() : await client.loadWaveData();
  };
}

// Fetches and coordinates tide + wave/wind together, keyed off the
// TideCheck API key and the selected location. TanStack Query loads each
// automatically once a key is available and refetches on its own whenever
// the location (or key) changes — `load(true)` is only needed to force a
// cache-bypassing refresh (pull-to-refresh, the footer's Force refresh
// link).
export function useForecastData(apiKey: string | null | undefined, location: Location): ForecastData {
  const queryClient = useQueryClient();

  const [tideQuery, waveQuery] = useQueries({
    queries: [
      {
        queryKey: tideQueryKey(location, apiKey),
        queryFn: tideQueryFn(location, apiKey as string, false),
        enabled: !!apiKey,
      },
      {
        queryKey: waveQueryKey(location, apiKey),
        queryFn: waveQueryFn(location, false),
        enabled: !!apiKey,
      },
    ],
  });

  const load = useCallback(
    async (force = false) => {
      if (!apiKey) return;

      if (!force) {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: tideQueryKey(location, apiKey) }),
          queryClient.refetchQueries({ queryKey: waveQueryKey(location, apiKey) }),
        ]);
        return;
      }

      // fetchQuery (unlike refetchQueries) takes a queryFn override, which is
      // how the cache-bypassing forceRefresh() call gets used instead of the
      // registered cache-first queryFn above. allSettled: a failed tide fetch
      // shouldn't stop the wave fetchQuery call, or reject load()'s own promise.
      await Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: tideQueryKey(location, apiKey),
          queryFn: tideQueryFn(location, apiKey, true),
        }),
        queryClient.fetchQuery({ queryKey: waveQueryKey(location, apiKey), queryFn: waveQueryFn(location, true) }),
      ]);
    },
    [apiKey, location, queryClient],
  );

  return {
    data: tideQuery.data?.data ?? null,
    waveData: waveQuery.data?.data ?? null,
    windData: waveQuery.data?.wind ?? null,
    precipitationData: waveQuery.data?.precipitation ?? null,
    fetchedAt: tideQuery.data?.fetchedAt ?? null,
    loading: tideQuery.isFetching || waveQuery.isFetching,
    error: tideQuery.error instanceof Error ? tideQuery.error.message : null,
    load,
  };
}
