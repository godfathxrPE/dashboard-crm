import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// AUDIT C: scandi/paper/sand удалены. Дефолт — lime (S-LIME-TOKENS-1).
// Порядок = порядок cycleTheme: t-lime стоит первой, поэтому цикл начинается с неё.
const THEMES = ['t-lime', 't-aura', 't-washi', 't-fuji', 't-frost', 't-aurora', 't-tidal', 't-minimal'] as const;
export type Theme = (typeof THEMES)[number];

// Устаревшие темы (AUDIT C4-6): persisted-значение → миграция на дефолт.
const LEGACY_THEMES = ['t-scandi', 't-paper', 't-sand'];
const DEFAULT_THEME: Theme = 't-lime';

/**
 * Сохранённое значение темы → валидная тема. Вынесено из `merge` ради теста:
 * смена `DEFAULT_THEME` меняет поведение миграции, и ломается это молча.
 * Устаревшая (LEGACY) ИЛИ неизвестная ИЛИ пустая тема → дефолт.
 */
function resolvePersistedTheme(t: unknown): Theme {
  const valid =
    typeof t === 'string' &&
    (THEMES as readonly string[]).includes(t) &&
    !LEGACY_THEMES.includes(t);
  return valid ? (t as Theme) : DEFAULT_THEME;
}

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
      // Миграция persisted: устаревшая ИЛИ неизвестная тема → дефолт lime.
      merge: (persisted, current) => {
        const p = persisted as Partial<ThemeState> | undefined;
        return { ...current, ...p, theme: resolvePersistedTheme(p?.theme) };
      },
    },
  ),
);

export { THEMES, DEFAULT_THEME, LEGACY_THEMES, resolvePersistedTheme };
