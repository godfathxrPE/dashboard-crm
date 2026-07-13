import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// AUDIT C: scandi/paper/sand удалены. Дефолт — aura. Порядок = порядок cycleTheme.
const THEMES = ['t-aura', 't-washi', 't-fuji', 't-frost', 't-aurora', 't-tidal'] as const;
export type Theme = (typeof THEMES)[number];

// Устаревшие темы (AUDIT C4-6): persisted-значение → миграция на дефолт.
const LEGACY_THEMES = ['t-scandi', 't-paper', 't-sand'];
const DEFAULT_THEME: Theme = 't-aura';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const current = get().theme;
        const idx = THEMES.indexOf(current);
        const next = THEMES[(idx + 1) % THEMES.length];
        set({ theme: next });
      },
    }),
    {
      name: 'dashboard-theme',
      // Миграция persisted: устаревшая ИЛИ неизвестная тема → дефолт aura.
      merge: (persisted, current) => {
        const p = persisted as Partial<ThemeState> | undefined;
        const t = p?.theme;
        const valid = t && (THEMES as readonly string[]).includes(t) && !LEGACY_THEMES.includes(t);
        return { ...current, ...p, theme: valid ? (t as Theme) : DEFAULT_THEME };
      },
    },
  ),
);

export { THEMES, DEFAULT_THEME, LEGACY_THEMES };
