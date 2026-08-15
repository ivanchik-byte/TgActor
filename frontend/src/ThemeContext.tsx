import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

export type Theme = 'deep-indigo' | 'dark-crimson' | 'dark-charcoal' | 'light';
export type ThemeAlias = 'theme-indigo' | 'theme-crimson' | 'theme-charcoal' | 'theme-light';

export interface ThemeOption {
  id: Theme;
  label: string;
  accentColor: string;
  bgColor: string;
  description: string;
}

export const AVAILABLE_THEMES: ThemeOption[] = [
  {
    id: 'deep-indigo',
    label: 'Deep Indigo',
    accentColor: '#8b5cf6',
    bgColor: '#0f0d1a',
    description: 'Глубокий индиго — фирменная темная тема по умолчанию',
  },
  {
    id: 'dark-crimson',
    label: 'Dark Crimson',
    accentColor: '#b91c3d',
    bgColor: '#110a0c',
    description: 'Темно-бордовый акцент для выразительного контраста',
  },
  {
    id: 'dark-charcoal',
    label: 'Dark Charcoal',
    accentColor: '#60a5fa',
    bgColor: '#0a0a0a',
    description: 'Угольно-черная нейтральная тема с высокой контрастностью',
  },
  {
    id: 'light',
    label: 'Light',
    accentColor: '#b91c3d',
    bgColor: '#f5f5f4',
    description: 'Светлая чистая тема для дневной работы',
  },
];

export interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme | ThemeAlias) => void;
  availableThemes: ThemeOption[];
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'tgactor-theme';

const ALL_THEME_CLASSES = [
  'deep-indigo',
  'dark-crimson',
  'dark-charcoal',
  'light',
  'theme-indigo',
  'theme-crimson',
  'theme-charcoal',
  'theme-light',
];

const THEME_CLASS_MAP: Record<Theme, string[]> = {
  'deep-indigo': ['deep-indigo', 'theme-indigo'],
  'dark-crimson': ['dark-crimson', 'theme-crimson'],
  'dark-charcoal': ['dark-charcoal', 'theme-charcoal'],
  'light': ['light', 'theme-light'],
};

const THEME_META_COLORS: Record<Theme, string> = {
  'deep-indigo': '#0f0d1a',
  'dark-crimson': '#110a0c',
  'dark-charcoal': '#0a0a0a',
  'light': '#f5f5f4',
};

function normalizeTheme(raw: string | null): Theme {
  if (!raw) return 'deep-indigo';
  if (raw === 'deep-indigo' || raw === 'theme-indigo') return 'deep-indigo';
  if (raw === 'dark-crimson' || raw === 'theme-crimson') return 'dark-crimson';
  if (raw === 'dark-charcoal' || raw === 'theme-charcoal') return 'dark-charcoal';
  if (raw === 'light' || raw === 'theme-light') return 'light';
  return 'deep-indigo';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return normalizeTheme(saved);
    } catch {
      return 'deep-indigo';
    }
  });

  const setTheme = useCallback((newTheme: Theme | ThemeAlias) => {
    const normalized = normalizeTheme(newTheme);
    setThemeState(normalized);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const currentIndex = AVAILABLE_THEMES.findIndex((t) => t.id === current);
      const nextIndex = (currentIndex + 1) % AVAILABLE_THEMES.length;
      return AVAILABLE_THEMES[nextIndex].id;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Failed to save theme in localStorage:', e);
    }

    const root = document.documentElement;
    const body = document.body;

    // Clean up all theme-related classes
    root.classList.remove(...ALL_THEME_CLASSES);
    body.classList.remove(...ALL_THEME_CLASSES);

    // Add target classes to both documentElement and body
    const classesToAdd = THEME_CLASS_MAP[theme] || ['deep-indigo', 'theme-indigo'];
    root.classList.add(...classesToAdd);
    body.classList.add(...classesToAdd);

    // Set data-theme attribute for CSS and testing assertions
    root.setAttribute('data-theme', theme);
    body.setAttribute('data-theme', theme);

    // Update meta theme-color tag if present
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', THEME_META_COLORS[theme] || '#0f0d1a');
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      availableThemes: AVAILABLE_THEMES,
      isDark: theme !== 'light',
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
