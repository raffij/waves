export interface Fonts {
  /** Headline-style titles. */
  display?: string;
  /** Labels and small text. */
  mono?: string;
  /** Big numeric values. */
  monoBold?: string;
}

// One typography for the whole app, used by every theme — themes vary only
// by color (see theme.ts), not by font. Originally the poster theme's own
// look; kept as the app's typography everywhere since it reads more
// clearly than the system font it replaced.
export const appFonts: Fonts = {
  display: 'Anton_400Regular',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
};
