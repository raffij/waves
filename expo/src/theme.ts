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
  /** "Feels like" apparent temperature — the primary line on the temperature chart, since it's the actionable one. */
  feelsLike: string;
  /** Real (measured) air temperature — a secondary line alongside feelsLike. */
  temperature: string;
  /** Sun brightness (solar radiation) fill on the temperature chart. */
  sun: string;
  /** Cloud cover (%) line on the temperature chart. */
  cloud: string;
  /** Overlay shading the hours before sunrise / after sunset on the charts. Always darkens, never lightens. */
  night: string;
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
  feelsLike: '#ff8a65',
  temperature: '#c792ea',
  sun: '#ffd54f',
  cloud: '#9fb3c8',
  night: 'rgba(0,0,0,0.38)',
};

// Named for (and colour-matched to) the "Glass UI" VS Code theme: a crisp,
// near-white surface, not a translucent one — the "glass" in its name is
// Mirror's Edge-style stark minimalism, not blur/opacity, so unlike dark and
// poster this theme's cards are solid. What sets it apart is the signature
// hot-pink/red accent standing alone against all that white.
export const glassColors: Colors = {
  background: '#fdfdfd',
  backgroundGradientEnd: '#fff0f3',
  card: '#ffffff',
  cardBorder: '#ffd9df',
  cardElevated: '#ffffff',
  shadow: 'rgba(255,0,64,0.1)',
  primary: '#ff0040',
  secondary: '#ff5c85',
  onPrimary: '#ffffff',
  textPrimary: '#222222',
  textSecondary: 'rgba(34,34,34,0.6)',
  high: '#1f9254',
  low: '#ff0040',
  rising: '#1f9254',
  falling: '#e0672f',
  wind: '#e0a030',
  precipitation: '#3d7fd9',
  feelsLike: '#e0592f',
  temperature: '#8a4fd1',
  sun: '#f0b429',
  cloud: '#9a8f95',
  night: 'rgba(34,34,34,0.14)',
};

export const posterColors: Colors = {
  background: '#f3e8d2',
  backgroundGradientEnd: '#e8dabb',
  card: '#faf3e2',
  cardBorder: 'rgba(28,43,57,0.15)',
  cardElevated: '#fffaf0',
  shadow: 'rgba(60,40,20,0.15)',
  primary: '#1f7a6c',
  secondary: '#155e53',
  onPrimary: '#f6efdd',
  textPrimary: '#1c2b39',
  textSecondary: 'rgba(28,43,57,0.62)',
  high: '#3f7d44',
  low: '#1f7a6c',
  rising: '#3f7d44',
  falling: '#c0432c',
  wind: '#c98a1f',
  precipitation: '#4a6fa5',
  feelsLike: '#c1440e',
  temperature: '#6a4c93',
  sun: '#d9a441',
  cloud: '#7d7568',
  night: 'rgba(28,43,57,0.14)',
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
