'use client';

import { useEffect, type ReactNode } from 'react';
import { useThemeStore, THEMES, DEFAULT_THEME } from '@/lib/stores/theme-store';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    // Guard: в localStorage может лежать удалённая тема (scandi/paper/sand) → дефолт
    if (!THEMES.includes(theme)) {
      useThemeStore.getState().setTheme(DEFAULT_THEME);
      return;
    }
    const root = document.documentElement;
    // Убираем все theme-классы, ставим текущий
    THEMES.forEach((t) => root.classList.remove(t));
    root.classList.add(theme);
  }, [theme]);

  return <>{children}</>;
}
