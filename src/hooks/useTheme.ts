import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'supertech-theme';

function readTheme(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'light' ? '#f3f6fb' : '#070b14');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  return { theme, toggle };
}
