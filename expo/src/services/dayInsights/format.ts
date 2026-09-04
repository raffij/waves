import { TideClock } from '../TideClock';

// Small text/number helpers shared across the day-insights clauses.

export const HOUR_MS = 3_600_000;

const HHMM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

export function hhmm(date: Date): string {
  return TideClock.format(date, HHMM);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function hourLabel(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}
