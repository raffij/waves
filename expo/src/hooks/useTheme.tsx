import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { defaultFonts, type Fonts, posterFonts } from '../fonts';
import { type Colors, darkColors, lightColors, posterColors } from '../theme';

export type ThemeName = 'light' | 'dark' | 'poster';

const THEME_CYCLE: ThemeName[] = ['light', 'dark', 'poster'];

const STORAGE_KEY = 'wave-hastings-theme';

const colorsByTheme: Record<ThemeName, Colors> = {
  light: lightColors,
  dark: darkColors,
  poster: posterColors,
};

const fontsByTheme: Record<ThemeName, Fonts> = {
  light: defaultFonts,
  dark: defaultFonts,
  poster: posterFonts,
};

interface ThemeContextValue {
  themeName: ThemeName;
  colors: Colors;
  fonts: Fonts;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (THEME_CYCLE.includes(saved as ThemeName)) setThemeName(saved as ThemeName);
    });
  }, []);

  const toggleTheme = () => {
    setThemeName((prev) => {
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(prev) + 1) % THEME_CYCLE.length];
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  const colors = colorsByTheme[themeName];
  const fonts = fontsByTheme[themeName];

  return <ThemeContext.Provider value={{ themeName, colors, fonts, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
