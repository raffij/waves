import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Location } from '../models/Location';
import type { TideResponse } from '../models/TideModels';
import { PrecipitationSeries } from '../services/PrecipitationSeries';
import { TideAPIClient } from '../services/TideAPIClient';
import { TideForecast } from '../services/TideForecast';
import { TideSeries } from '../services/TideSeries';
import type { WaveDataResult } from '../services/WaveAPIClient';
import { WaveAPIClient } from '../services/WaveAPIClient';
import { WaveSeries } from '../services/WaveSeries';
import { WindSeries } from '../services/WindSeries';

interface TideResult {
  data: TideResponse;
  fetchedAt: Date;
}

interface TideView {
  series: TideSeries;
  forecast: TideForecast;
  fetchedAt: Date;
}

interface WaveView {
  waveSeries: WaveSeries | null;
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
}

export interface ForecastData {
  series: TideSeries | null;
  forecast: TideForecast | null;
  waveSeries: WaveSeries | null;
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  fetchedAt: Date | null;
  isFetching: boolean;
  error: Error | null;
  refresh: (force?: boolean) => Promise<void>;
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

// Module-level (rather than closures created per render) so their identity
// is stable — that's what lets TanStack Query skip rebuilding these view
// models on a render that didn't change the underlying fetch result (e.g.
// toggling theme, or picking a different forecast day).
function selectTide(result: TideResult): TideView {
  return {
    series: new TideSeries(result.data.timeSeries),
    forecast: new TideForecast(result.data.extremes),
    fetchedAt: result.fetchedAt,
  };
}

function selectWave(result: WaveDataResult | null): WaveView {
  if (!result) return { waveSeries: null, windSeries: null, precipitationSeries: null };
  return {
    waveSeries: new WaveSeries(result.data),
    windSeries: result.wind ? new WindSeries(result.wind) : null,
    precipitationSeries: result.precipitation ? new PrecipitationSeries(result.precipitation) : null,
  };
}

// Fetches and coordinates tide + wave/wind together, keyed off the
// TideCheck API key and the selected location. TanStack Query loads each
// automatically once a key is available and refetches on its own whenever
// the location (or key) changes — `refresh(true)` is only needed to force a
// cache-bypassing refresh (pull-to-refresh, the footer's Force refresh
// link).
export function useForecastData(apiKey: string | null | undefined, location: Location): ForecastData {
  const queryClient = useQueryClient();

  const forecastData = useQueries({
    queries: [
      {
        queryKey: tideQueryKey(location, apiKey),
        queryFn: tideQueryFn(location, apiKey as string, false),
        enabled: !!apiKey,
        select: selectTide,
      },
      {
        queryKey: waveQueryKey(location, apiKey),
        queryFn: waveQueryFn(location, false),
        enabled: !!apiKey,
        select: selectWave,
      },
    ],
    combine: ([tide, wave]) => ({
      series: tide.data?.series ?? null,
      forecast: tide.data?.forecast ?? null,
      fetchedAt: tide.data?.fetchedAt ?? null,
      waveSeries: wave.data?.waveSeries ?? null,
      windSeries: wave.data?.windSeries ?? null,
      precipitationSeries: wave.data?.precipitationSeries ?? null,
      isFetching: tide.isFetching || wave.isFetching,
      error: tide.error ?? null,
    }),
  });

  const refresh = useCallback(
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
      // shouldn't stop the wave fetchQuery call, or reject refresh()'s own promise.
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

  return { ...forecastData, refresh };
}
