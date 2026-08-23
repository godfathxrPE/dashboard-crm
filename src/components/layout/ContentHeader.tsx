'use client';

import { Search, LogOut, Sun, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useDrawerStore } from '@/lib/stores/drawer-store';
import { usePathname } from 'next/navigation';
import { useThemeStore, THEMES } from '@/lib/stores/theme-store';
import { THEME_SWATCH } from '@/lib/constants/themes';
import { useUiStore } from '@/lib/stores/ui-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { cn } from '@/lib/utils/cn';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { QuickCapture } from '@/components/capture/QuickCapture';
import { useState, useRef, useEffect } from 'react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Дашборд',
  '/chat': 'Чат',
  '/tasks': 'Задачи',
  '/deals': 'Сделки',
  '/projects': 'Проекты',
  '/leads': 'Лиды',
  '/contacts': 'Контакты',
  '/companies': 'Компании',
  '/calls': 'Звонки',
  '/meetings': 'Встречи',
  '/transcripts': 'Транскрипты',
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

export function ContentHeader() {
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
    <div className="mb-6 flex items-center justify-between relative z-[35]">
      {/* z-35 — полоса заголовков (сайдбар 30 < заголовки 35 < peek 40 < оверлей/модалка
          999/1000 из globals.css). Было 100: топбар лежал поверх шапки PeekPanel, клик
          по «Открыть полностью» уходил в него, target оказывался вне panelRef и панель
          закрывалась вместо перехода — на всех пяти страницах с peek.
          Держать ВЫШЕ 30 (иначе дропдауны шапки уйдут под сайдбар) и НИЖЕ 40 (peek).
          `relative z-*` создаёт стекинг-контекст: внутренние z-[9999] дропдаунов работают
          внутри него, наружу торчит именно это число. Подробности — docs/Z-INDEX.md. */}
      {/* h1 removed — each page renders its own Watermark header */}
      <div />
      <div className="flex items-center gap-2">
        {/* Search */}
        <button
          onClick={toggleCommandPalette}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-mute hover:text-text-dim transition-colors"
          style={{ border: '0.5px solid var(--border)', borderRadius: '6px' }}
        >
          <Search size={14} />
          <span className="hidden sm:inline">Поиск</span>
          <kbd className="px-1 py-0.5 text-xs font-mono text-text-mute" style={{ border: '0.5px solid var(--border)' }}>
            ⌘K
          </kbd>
        </button>

        {/* Quick capture (S-QUICK-CAPTURE-1) */}
        <QuickCapture />

        {/* Notifications */}
        <NotificationBell />

        {/* Drawer toggle */}
        <DrawerToggle />

        {/* Theme */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setThemeOpen(!themeOpen)}
            className="p-2 text-text-dim hover:text-text-main transition-colors"
          >
            <Sun size={14} />
          </button>
          {themeOpen && (
            <div className="absolute right-0 top-full z-[9999] mt-1 w-40 rounded-lg border border-border bg-popover p-1 elevation-3" style={{ borderWidth: '0.5px' }}>
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
                    style={{ background: THEME_SWATCH[t], borderRadius: '50%' }}
                  />
                  {t.replace('t-', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="flex h-7 w-7 items-center justify-center text-xs font-medium text-text-dim hover:text-text-main transition-colors"
          style={{ border: '0.5px solid var(--border)', borderRadius: '50%' }}
          aria-label="Выйти"
        >
          <LogOut size={12} />
        </button>
      </div>
    </div>
  );
}
