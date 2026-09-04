import type { CloudCoverSeries } from '../CloudCoverSeries';
import type { DaylightSeries } from '../DaylightSeries';
import type { PrecipitationSeries } from '../PrecipitationSeries';
import type { SunBrightnessSeries } from '../SunBrightnessSeries';
import type { TemperatureSeries } from '../TemperatureSeries';
import type { WindSeries } from '../WindSeries';

export interface DayInsightsReadout {
  // The day's conditions — wind, rain, sun, feel, light — and what to wear,
  // as one flowing, wordy description rather than separate fields that repeat
  // the same signals.
  summary: string;
}

export interface DayInsightsInput {
  windSeries: WindSeries | null;
  precipitationSeries: PrecipitationSeries | null;
  daylightSeries: DaylightSeries | null;
  temperatureSeries: TemperatureSeries | null;
  sunBrightnessSeries: SunBrightnessSeries | null;
  cloudCoverSeries: CloudCoverSeries | null;
  reference: Date;
}
