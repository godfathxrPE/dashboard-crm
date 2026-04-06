'use client';

import { Search, LogOut, Sun, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useDrawerStore } from '@/lib/stores/drawer-store';
import { usePathname } from 'next/navigation';
import { useThemeStore, THEMES, type Theme } from '@/lib/stores/theme-store';
import { useUiStore } from '@/lib/stores/ui-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { cn } from '@/lib/utils/cn';
import { useState, useRef, useEffect } from 'react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Дашборд',
  '/tasks': 'Задачи',
  '/projects': 'Проекты',
  '/contacts': 'Контакты',
  '/companies': 'Компании',
  '/calls': 'Звонки',
  '/meetings': 'Встречи',
  '/calendar': 'Календарь',
  '/analytics': 'Аналитика',
  '/settings': 'Настройки',
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [route, title] of Object.entries(PAGE_TITLES)) {
    if (route !== '/' && pathname.startsWith(route + '/')) return title;
  }
  return 'Дашборд';
}

const THEME_SWATCHES: Record<Theme, string> = {
  't-scandi': '#000000',
  't-claude': '#b5622a',
  't-frost': '#5b8aff',
  't-paper': '#8b3a1a',
  't-sand': '#c05828',
  't-aurora': '#a060ff',
  't-tidal': '#48b890',
  't-quartz': '#0D9488',
  't-keyswitch': '#6366f1',
  't-nvg8': '#FF6633',
  't-washi': '#C23B3B',
  't-fuji': '#2B5078',
};

function DrawerToggle() {
  const { isOpen, toggle } = useDrawerStore();
  return (
    <button
      onClick={toggle}
      className="p-2 text-text-dim hover:text-text-main transition-colors"
      title={isOpen ? 'Скрыть панель' : 'Показать панель'}
    >
      {isOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
    </button>
  );
}

export function ScandiContentHeader() {
  const pathname = usePathname();
  const { toggleCommandPalette } = useUiStore();
  const { theme, setTheme } = useThemeStore();
  const { signOut } = useAuth();
  const [themeOpen, setThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const title = getPageTitle(pathname);

  return (
    <div className="mb-6 flex items-center justify-between relative z-[100]">
      {pathname !== '/' && <h1 className="text-[22px] font-medium text-text-main">{title}</h1>}
      <div className="flex items-center gap-2">
        {/* Search */}
        <button
          onClick={toggleCommandPalette}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-mute hover:text-text-dim transition-colors"
          style={{ border: '0.5px solid var(--border)', borderRadius: '6px' }}
        >
          <Search size={14} />
          <span className="hidden sm:inline">Поиск</span>
          <kbd className="px-1 py-0.5 text-[10px] font-mono text-text-mute" style={{ border: '0.5px solid var(--border)' }}>
            ⌘K
          </kbd>
        </button>

        {/* Theme */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setThemeOpen(!themeOpen)}
            className="p-2 text-text-dim hover:text-text-main transition-colors"
          >
            <Sun size={14} />
          </button>
          {themeOpen && (
            <div className="absolute right-0 top-full z-[9999] mt-1 w-40 border bg-surface p-1" style={{ borderWidth: '0.5px' }}>
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTheme(t); setThemeOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                    t === theme ? 'font-medium text-text-main' : 'text-text-dim hover:text-text-main',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5"
                    style={{ background: THEME_SWATCHES[t], borderRadius: '50%' }}
                  />
                  {t.replace('t-', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drawer toggle */}
        <DrawerToggle />

        {/* Sign out */}
        <button
          onClick={signOut}
          className="flex h-7 w-7 items-center justify-center text-[10px] font-medium text-text-dim hover:text-text-main transition-colors"
          style={{ border: '0.5px solid var(--border)', borderRadius: '50%' }}
          aria-label="Выйти"
        >
          <LogOut size={12} />
        </button>
      </div>
    </div>
  );
}
