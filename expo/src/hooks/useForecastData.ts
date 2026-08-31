import type { UseQueryResult } from '@tanstack/react-query';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { DEFAULT_LOCATION, type Location } from '../models/Location';
import { CloudCoverSeries } from '../services/CloudCoverSeries';
import { DaylightSeries } from '../services/DaylightSeries';
import { PrecipitationSeries } from '../services/PrecipitationSeries';
import { SunBrightnessSeries } from '../services/SunBrightnessSeries';
import { TemperatureSeries } from '../services/TemperatureSeries';
import type { TideDataResult } from '../services/TideAPIClient';
import { TideAPIClient } from '../services/TideAPIClient';
import { TideForecast } from '../services/TideForecast';
import { TideSeries } from '../services/TideSeries';
import type { WaveDataResult } from '../services/WaveAPIClient';
import { WaveAPIClient } from '../services/WaveAPIClient';
import { WaveSeries } from '../services/WaveSeries';
import { WindSeries } from '../services/WindSeries';

interface TideView {
  series: TideSeries;
  forecast: TideForecast;
  fetchedAt: Date;
}

interface WaveView {
  waveSeries: WaveSeries;
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  daylightSeries: DaylightSeries | null;
  temperatureSeries: TemperatureSeries | null;
  sunBrightnessSeries: SunBrightnessSeries | null;
  cloudCoverSeries: CloudCoverSeries | null;
}

export interface ForecastData {
  series: TideSeries | null;
  forecast: TideForecast | null;
  waveSeries: WaveSeries | null;
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  daylightSeries: DaylightSeries | null;
  temperatureSeries: TemperatureSeries | null;
  sunBrightnessSeries: SunBrightnessSeries | null;
  cloudCoverSeries: CloudCoverSeries | null;
  fetchedAt: Date | null;
  isFetching: boolean;
  error: Error | null;
  /** Force a cache-bypassing refetch of both tide and wave/wind/precipitation. */
  refresh: () => Promise<void>;
}

// Tighter than each client's own 6h AsyncStorage cache — a page load or
// location switch that lands on a cache hit older than this triggers a
// background refresh, so a session left open a while (or a location
// switched back to) doesn't sit on significantly stale data until the
// next manual refresh.
const STALE_REFRESH_MS = 60 * 60 * 1000;

function tideQueryKey(location: Location | undefined, apiKey: string | null | undefined) {
  return ['tide', location?.stationId, apiKey] as const;
}

// Wave/wind/precipitation come from Open-Meteo, which needs no API key, so
// the wave key isn't scoped to it — resetting/re-entering the TideCheck key
// shouldn't discard and re-fetch wave data too.
function waveQueryKey(location: Location | undefined) {
  return ['wave', location?.id] as const;
}

// `force` picks between each client's cache-first load and its
// cache-bypassing forceRefresh — both go through the same TanStack Query
// cache entry either way, just via loadTideData()/loadWaveData() (normal
// load, gated by `enabled`) or forceRefresh() (pull-to-refresh, the
// footer's Force refresh link). Both throw rather than returning null on
// failure, so TanStack Query keeps the last-good data on screen instead of
// overwriting it with an empty result.
function tideQueryFn(location: Location, apiKey: string, force: boolean) {
  return async (): Promise<TideDataResult> => {
    const client = new TideAPIClient(location.stationId, apiKey);
    const result = force ? await client.forceRefresh() : await client.loadTideData();
    if (!result) throw new Error('Could not load tide data. Check your connection or API key.');
    return result;
  };
}

function waveQueryFn(location: Location, force: boolean) {
  return async (): Promise<WaveDataResult> => {
    const client = new WaveAPIClient(location.id, location.latitude, location.longitude);
    const result = force ? await client.forceRefresh() : await client.loadWaveData();
    if (!result) throw new Error('Could not load wave data.');
    return result;
  };
}

// Module-level (rather than closures created per render) so their identity
// is stable — that's what lets TanStack Query skip rebuilding these view
// models on a render that didn't change the underlying fetch result (e.g.
// toggling theme, or picking a different forecast day).
function selectTide(result: TideDataResult): TideView {
  return {
    series: new TideSeries(result.data.timeSeries),
    forecast: new TideForecast(result.data.extremes),
    fetchedAt: result.fetchedAt,
  };
}

function selectWave(result: WaveDataResult): WaveView {
  return {
    waveSeries: new WaveSeries(result.data),
    windSeries: result.wind ? new WindSeries(result.wind) : null,
    precipitationSeries: result.precipitation ? new PrecipitationSeries(result.precipitation) : null,
    daylightSeries: result.daylight ? new DaylightSeries(result.daylight) : null,
    temperatureSeries: result.temperature ? new TemperatureSeries(result.temperature) : null,
    sunBrightnessSeries: result.sunBrightness ? new SunBrightnessSeries(result.sunBrightness) : null,
    cloudCoverSeries: result.cloudCover ? new CloudCoverSeries(result.cloudCover) : null,
  };
}

// Wave/wind/precipitation/temperature/sun are a nice-to-have overlay (see
// WaveAPIClient's own comment on fetching them independently of tide) — a
// wave-query error is deliberately left out of the combined `error`, so a
// wave outage never blocks the tide UI or shows a scary error for a
// non-essential chart.
function combineForecastData([tide, wave]: [UseQueryResult<TideView, Error>, UseQueryResult<WaveView, Error>]): Omit<
  ForecastData,
  'refresh'
> {
  return {
    series: tide.data?.series ?? null,
    forecast: tide.data?.forecast ?? null,
    fetchedAt: tide.data?.fetchedAt ?? null,
    waveSeries: wave.data?.waveSeries ?? null,
    windSeries: wave.data?.windSeries ?? null,
    precipitationSeries: wave.data?.precipitationSeries ?? null,
    daylightSeries: wave.data?.daylightSeries ?? null,
    temperatureSeries: wave.data?.temperatureSeries ?? null,
    sunBrightnessSeries: wave.data?.sunBrightnessSeries ?? null,
    cloudCoverSeries: wave.data?.cloudCoverSeries ?? null,
    isFetching: tide.isFetching || wave.isFetching,
    error: tide.error ?? null,
  };
}

// Fetches and coordinates tide + wave/wind together, keyed off the
// TideCheck API key and the selected location. TanStack Query loads each
// automatically once a key is available and refetches on its own whenever
// the location (or key) changes — `refresh()` is only needed to force a
// cache-bypassing refresh (pull-to-refresh, the footer's Force refresh
// link).
export function useForecastData(apiKey: string | null | undefined, location: Location | undefined): ForecastData {
  const queryClient = useQueryClient();
  const ready = !!apiKey && !!location;

  const forecastData = useQueries({
    queries: [
      {
        queryKey: tideQueryKey(location, apiKey),
        queryFn: tideQueryFn(location ?? DEFAULT_LOCATION, apiKey ?? '', false),
        enabled: ready,
        select: selectTide,
      },
      {
        queryKey: waveQueryKey(location),
        queryFn: waveQueryFn(location ?? DEFAULT_LOCATION, false),
        enabled: ready,
        select: selectWave,
      },
    ],
    combine: combineForecastData,
  });

  const refresh = useCallback(async () => {
    if (!ready) return;

    const tideKey = tideQueryKey(location, apiKey);
    const waveKey = waveQueryKey(location);

    // fetchQuery only applies a queryFn override (needed to swap in the
    // cache-bypassing forceRefresh() call below) when the query is idle —
    // if a normal fetch is already in flight, it just returns that fetch's
    // result instead. cancelQueries first guarantees the override actually
    // takes effect. allSettled: a failed tide fetch shouldn't stop the wave
    // fetchQuery call, or reject refresh()'s own promise.
    await Promise.allSettled([
      queryClient.cancelQueries({ queryKey: tideKey }).then(() =>
        queryClient.fetchQuery({
          queryKey: tideKey,
          queryFn: tideQueryFn(location, apiKey, true),
          staleTime: 0,
        }),
      ),
      queryClient.cancelQueries({ queryKey: waveKey }).then(() =>
        queryClient.fetchQuery({
          queryKey: waveKey,
          queryFn: waveQueryFn(location, true),
          staleTime: 0,
        }),
      ),
    ]);
  }, [ready, apiKey, location, queryClient]);

  // Runs whenever fetchedAt lands on a real value: the initial load for a
  // given location/key, or a location switch resolving into its own cache
  // hit. A fetch that's already fresh, or one refresh() itself just
  // completed, leaves fetchedAt unchanged (or freshly "now"), so this
  // can't loop — it only ever fires once per stale landing.
  useEffect(() => {
    const fetchedAt = forecastData.fetchedAt;
    if (!fetchedAt) return;
    if (Date.now() - fetchedAt.getTime() > STALE_REFRESH_MS) {
      refresh();
    }
  }, [forecastData.fetchedAt, refresh]);

  return { ...forecastData, refresh };
}
