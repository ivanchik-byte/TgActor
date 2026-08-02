import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'deep-indigo' | 'dark-crimson' | 'dark-charcoal' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('tgcast-theme');
    return (saved as Theme) || 'dark-crimson';
  });

  useEffect(() => {
    localStorage.setItem('tgcast-theme', theme);
    const root = window.document.body;
    root.classList.remove('deep-indigo', 'dark-crimson', 'dark-charcoal', 'light');
    if (theme !== 'deep-indigo') {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
