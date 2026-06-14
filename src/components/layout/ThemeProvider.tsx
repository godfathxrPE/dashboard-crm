'use client';

import { useEffect, type ReactNode } from 'react';
import { useThemeStore, THEMES } from '@/lib/stores/theme-store';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    // Guard: в localStorage может лежать удалённая тема
    if (!THEMES.includes(theme)) {
      useThemeStore.getState().setTheme('t-scandi');
      return;
    }
    const root = document.documentElement;
    // Убираем все theme-классы, ставим текущий
    THEMES.forEach((t) => root.classList.remove(t));
    root.classList.add(theme);
  }, [theme]);

  return <>{children}</>;
}
