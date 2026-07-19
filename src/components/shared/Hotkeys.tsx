'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useUiStore } from '@/lib/stores/ui-store';

const GO_ROUTES: Record<string, string> = {
  d: '/',
  t: '/tasks',
  l: '/deals',
  p: '/projects',
  c: '/calls',
  m: '/meetings',
  o: '/companies',
  n: '/contacts',
  a: '/analytics',
  s: '/settings',
};

const SHORTCUTS = [
  { keys: 'J / K', label: 'Навигация по строкам' },
  { keys: 'Enter', label: 'Открыть' },
  { keys: 'Space', label: 'Предпросмотр (peek)' },
  { keys: 'D', label: 'Действие строки (Сегодня)' },
  { keys: 'Esc', label: 'Закрыть / Сбросить' },
  { keys: '⌘K', label: 'Поиск' },
  { keys: '/', label: 'Фокус на поиск' },
  null,
  { keys: 'G D', label: 'Дашборд' },
  { keys: 'G T', label: 'Задачи' },
  { keys: 'G L', label: 'Сделки' },
  { keys: 'G P', label: 'Проекты' },
  { keys: 'G C', label: 'Звонки' },
  { keys: 'G N', label: 'Контакты' },
  { keys: 'G O', label: 'Компании' },
  { keys: 'G M', label: 'Встречи' },
  { keys: 'G A', label: 'Аналитика' },
  null,
  { keys: 'N', label: 'Быстрое создание' },
  { keys: '?', label: 'Показать подсказки' },
];

export function Hotkeys() {
  const router = useRouter();
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const gPressed = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // ? → help
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }

      // / → focus search
      if (e.key === '/' && !e.shiftKey) {
        const input = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (input) { e.preventDefault(); input.focus(); }
        return;
      }

      // N → палитра в режиме «Действия» (быстрое создание). Не перехватываем G-N.
      if (key === 'n' && !gPressed.current) {
        e.preventDefault();
        openCommandPalette(true);
        return;
      }

      // G prefix
      if (key === 'g') {
        gPressed.current = true;
        clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => { gPressed.current = false; }, 500);
        return;
      }

      if (gPressed.current) {
        gPressed.current = false;
        clearTimeout(gTimer.current);
        if (GO_ROUTES[key]) {
          e.preventDefault();
          router.push(GO_ROUTES[key]);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(gTimer.current);
    };
  }, [router, openCommandPalette]);

  if (!showHelp) return null;

  return (
    <>
      <div data-modal-overlay="palette" className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowHelp(false)} />
      <div data-modal className="fixed left-1/2 top-1/2 z-[60] w-80 -translate-x-1/2 -translate-y-1/2
                      rounded-xl border border-border bg-surface p-5 elevation-3">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-main">Клавиатурные сокращения</h3>
          <button onClick={() => setShowHelp(false)} aria-label="Закрыть" className="rounded p-1 text-text-mute hover:text-text-main">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-1.5 text-sm">
          {SHORTCUTS.map((s, i) =>
            s === null ? (
              <div key={i} className="my-2 border-t border-border" />
            ) : (
              <div key={i} className="flex items-center justify-between">
                <span className="text-text-dim">{s.label}</span>
                <kbd className="rounded border border-border bg-surface2 px-1.5 py-0.5 text-xs font-mono text-text-mute">
                  {s.keys}
                </kbd>
              </div>
            ),
          )}
        </div>
      </div>
    </>
  );
}
