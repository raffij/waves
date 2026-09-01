import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { appFonts, type Fonts } from '../fonts';
import { type Colors, darkColors, glassColors, posterColors } from '../theme';

export type ThemeName = 'dark' | 'poster' | 'glass';

const THEME_CYCLE: ThemeName[] = ['dark', 'poster', 'glass'];

const STORAGE_KEY = 'wave-hastings-theme';

const colorsByTheme: Record<ThemeName, Colors> = {
  dark: darkColors,
  poster: posterColors,
  glass: glassColors,
};

interface ThemeContextValue {
  themeName: ThemeName;
  colors: Colors;
  fonts: Fonts;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('glass');

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

  // On web, the browser (and, once "Added to Home Screen", iOS's own
  // chrome) tints its UI from <meta name="theme-color">. It's static in
  // index.html/app.json, baked in at the dark theme's navy — so switching
  // to poster/glass left that chrome mismatched against the page behind
  // it, breaking the immersive/full-screen feel. Keep it in lockstep with
  // whatever's actually on screen.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  }, [colors.background]);

  return (
    <ThemeContext.Provider value={{ themeName, colors, fonts: appFonts, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
