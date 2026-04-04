import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const THEMES = ['t-scandi', 't-claude', 't-frost', 't-paper', 't-sand', 't-aurora', 't-tidal', 't-quartz', 't-keyswitch', 't-nvg8', 't-washi', 't-fuji'] as const;
export type Theme = (typeof THEMES)[number];

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 't-scandi',
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const current = get().theme;
        const idx = THEMES.indexOf(current);
        const next = THEMES[(idx + 1) % THEMES.length];
        set({ theme: next });
      },
    }),
    { name: 'dashboard-theme' },
  ),
);

export { THEMES };
