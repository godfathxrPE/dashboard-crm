'use client';

import { Menu, Search, Sun, Moon, LogOut } from 'lucide-react';
import { useThemeStore, THEMES, type Theme } from '@/lib/stores/theme-store';
import { useUiStore } from '@/lib/stores/ui-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { cn } from '@/lib/utils/cn';
import { useState, useRef, useEffect } from 'react';
import { StatusBeacon } from '@/components/shared/StatusBeacon';
import { useAlerts } from '@/lib/hooks/use-alerts';

const THEME_META: Record<Theme, { label: string; swatch: string }> = {
  't-scandi':    { label: 'Scandinavian', swatch: 'bg-[#000000]' },
  't-claude': { label: 'Claude', swatch: 'bg-[#b5622a]' },
  't-frost':  { label: 'Frost',  swatch: 'bg-[#5b8aff]' },
  't-paper':  { label: 'Paper',  swatch: 'bg-[#8b3a1a]' },
  't-sand':   { label: 'Sand',   swatch: 'bg-[#c05828]' },
  't-aurora': { label: 'Aurora', swatch: 'bg-[#a060ff]' },
  't-tidal':  { label: 'Tidal',  swatch: 'bg-[#48b890]' },
  't-quartz': { label: 'Quartz', swatch: 'bg-[#0D9488]' },
  't-keyswitch': { label: 'Keyswitch', swatch: 'bg-[#6366f1]' },
  't-nvg8':      { label: 'NVG8',      swatch: 'bg-[#FF6633]' },
  't-washi':     { label: '和紙 Washi', swatch: 'bg-[#C23B3B]' },
  't-fuji':      { label: '富士 Fuji', swatch: 'bg-[#2B5078]' },
};

export function Header() {
  const { toggleSidebar, toggleCommandPalette } = useUiStore();
  const { theme, setTheme } = useThemeStore();
  const { user, signOut } = useAuth();
  const alerts = useAlerts();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Закрытие меню по клику вне
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Определяем, тёмная ли тема
  const isDark = ['t-frost', 't-aurora', 't-tidal'].includes(theme);

  return (
    <header className="relative z-50 flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 text-text-dim hover:bg-surface2 hover:text-text-main transition-colors"
          aria-label="Переключить sidebar"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Cmd+K */}
        <button
          onClick={toggleCommandPalette}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-text-mute hover:border-accent/50 hover:text-text-dim transition-colors"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Поиск</span>
          <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Status beacon */}
        <StatusBeacon alerts={alerts} />

        {/* Theme menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="rounded-md p-2 text-text-dim hover:bg-surface2 hover:text-text-main transition-colors"
            aria-label="Сменить тему"
          >
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {themeMenuOpen && (
            <div className="absolute right-0 top-full z-[9999] mt-1 w-40 rounded-lg border border-border bg-surface p-1 elevation-3">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTheme(t); setThemeMenuOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    t === theme
                      ? 'bg-accent-l text-accent font-medium'
                      : 'text-text-dim hover:bg-surface2',
                  )}
                >
                  <span className={cn('h-3 w-3 rounded-full', THEME_META[t].swatch)} />
                  {THEME_META[t].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User / Sign Out */}
        <button
          onClick={signOut}
          className="rounded-md p-2 text-text-dim hover:bg-surface2 hover:text-text-main transition-colors"
          aria-label="Выйти"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
