export interface SeriesPoint {
  time: string;
  height: number;
}

export type ExtremeType = 'high' | 'low';

export interface Extreme {
  localTime: string;
  localDate: string;
  height: number;
  type: ExtremeType;
}

export interface TideResponse {
  extremes: Extreme[];
  timeSeries: SeriesPoint[];
}
