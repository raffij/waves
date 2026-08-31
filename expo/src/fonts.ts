export interface Fonts {
  /** Headline-style titles. */
  display?: string;
  /** Labels and small text. */
  mono?: string;
  /** Big numeric values. */
  monoBold?: string;
}

// undefined fields fall back to the system font, so light/dark are unaffected.
export const defaultFonts: Fonts = {};

export const posterFonts: Fonts = {
  display: 'Anton_400Regular',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
};
