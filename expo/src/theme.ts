export interface Colors {
  background: string;
  backgroundGradientEnd: string;
  card: string;
  cardBorder: string;
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
  card: 'rgba(3,18,43,0.04)',
  cardBorder: 'rgba(3,18,43,0.12)',
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
