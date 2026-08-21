'use client';

import { useState, useEffect } from 'react';
import { Target } from 'lucide-react';
import { localDateKey } from '@/lib/utils/date-helpers';

/**
 * Фокус дня — одно главное дело. Состояние в localStorage `focus-<dateKey>`.
 * Перенесено из ActivityDrawer (Sprint W1b) — единственный источник состояния.
 */
export function TodayFocus() {
  const [text, setText] = useState('');
  useEffect(() => {
    const key = `focus-${localDateKey()}`;
    setText(localStorage.getItem(key) ?? '');
  }, []);

  const save = (val: string) => {
    setText(val);
    const key = `focus-${localDateKey()}`;
    if (val.trim()) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  };

  return (
    <section className="sheet mb-8 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface2 px-4 py-2
                      text-xs font-medium uppercase tracking-wider text-text-dim">
        <Target size={13} />
        Фокус дня
      </div>
      <div className="p-4">
        <input
          value={text}
          onChange={(e) => save(e.target.value)}
          placeholder="Одно главное дело на сегодня…"
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-lg
                     text-text-main placeholder:text-text-mute
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </section>
  );
}
