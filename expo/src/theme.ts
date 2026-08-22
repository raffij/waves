export interface Colors {
  background: string;
  backgroundGradientEnd: string;
  card: string;
  cardBorder: string;
  /** Slightly stronger surface than `card`, for the hero card that sits above chart cards. */
  cardElevated: string;
  /** Baked-in-opacity shadow color, themed so dark mode gets a real shadow and light mode a soft one. */
  shadow: string;
  primary: string;
  secondary: string;
  /** Text color for content drawn on top of a primary-colored surface (e.g. a filled button). */
  onPrimary: string;
  textPrimary: string;
  textSecondary: string;
  high: string;
  low: string;
  rising: string;
  falling: string;
  wind: string;
  precipitation: string;
}

export const darkColors: Colors = {
  background: '#03122b',
  backgroundGradientEnd: '#0b3a63',
  card: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(255,255,255,0.12)',
  cardElevated: 'rgba(255,255,255,0.08)',
  shadow: 'rgba(0,4,15,0.45)',
  primary: '#4fd1ff',
  secondary: '#8be9fd',
  onPrimary: '#03122b',
  textPrimary: '#f5faff',
  textSecondary: 'rgba(245,250,255,0.65)',
  high: '#7ee787',
  low: '#4fd1ff',
  rising: '#7ee787',
  falling: '#ff8a80',
  wind: '#ffb86c',
  precipitation: '#7aa2ff',
};

export const lightColors: Colors = {
  background: '#f4f8fc',
  backgroundGradientEnd: '#dce8f5',
  card: '#ffffff',
  cardBorder: 'rgba(3,18,43,0.08)',
  cardElevated: '#ffffff',
  shadow: 'rgba(15,35,60,0.12)',
  primary: '#0284c7',
  secondary: '#0ea5e9',
  onPrimary: '#f4f8fc',
  textPrimary: '#0b1e33',
  textSecondary: 'rgba(11,30,51,0.6)',
  high: '#15803d',
  low: '#0284c7',
  rising: '#15803d',
  falling: '#dc2626',
  wind: '#c2650a',
  precipitation: '#3457d5',
};

// Applies alpha to a 6-digit hex color, e.g. for tinted chip/pill backgrounds
// derived from the theme's semantic colors instead of hardcoding new ones.
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = Number.parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
