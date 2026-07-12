'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT 1.5 — менеджер realtime-подписок с refcount.
//
// Было: каждый вызов useRealtimeSync('tasks') создавал СВОЙ канал
// `realtime-tasks` со своим binding. При unmount одного подписчика
// removeChannel убивал канал у ВСЕХ (ушёл со страницы /tasks → realtime tasks
// мёртв до конца сессии у layout-компонентов), плюс дубли bindings.
//
// Стало: один канал на таблицу на всё приложение (module-level Map), один
// binding, рассылка изменения всем подписчикам через Set колбэков. refcount:
// removeChannel только когда последний подписчик отписался. Reconnect после
// сна ноутбука / потери сети — на CHANNEL_ERROR/TIMED_OUT с бэкоффом.
// ═══════════════════════════════════════════════════════════════════════════

interface Entry {
  channel: RealtimeChannel;
  refs: number;
  callbacks: Set<() => void>;
  retry: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  broadcastTimer?: ReturnType<typeof setTimeout>;
}

const registry = new Map<string, Entry>();

function makeChannel(table: string, entry: Entry): RealtimeChannel {
  const supabase = createClient();
  return supabase
    .channel(`realtime-${table}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        // Дебаунс рассылки: bulk-операция (reorder_tasks, импорт) меняет N строк →
        // Postgres шлёт N событий подряд. Без дебаунса это N×(число подписчиков)
        // инвалидаций → шторм рефетчей всей таблицы. Схлопываем всплеск в один
        // раунд: каждый подписчик инвалидирует свой ключ по разу, react-query
        // дедупит одинаковые ключи в один запрос (AUDIT 2.2/2.7).
        clearTimeout(entry.broadcastTimer);
        entry.broadcastTimer = setTimeout(() => {
          entry.callbacks.forEach((cb) => cb());
        }, 150);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        entry.retry = 0;
        return;
      }
      // Разрыв (сон ноутбука, потеря сети) — пересоздаём канал с бэкоффом, пока
      // есть подписчики. Проверяем, что entry всё ещё актуален в реестре.
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (registry.get(table) !== entry || entry.refs <= 0) return;
        clearTimeout(entry.retryTimer);
        const delay = Math.min(1000 * 2 ** entry.retry, 30_000); // 1s→2s→…→30s cap
        entry.retry += 1;
        entry.retryTimer = setTimeout(() => {
          if (registry.get(table) !== entry || entry.refs <= 0) return;
          supabase.removeChannel(entry.channel);
          entry.channel = makeChannel(table, entry);
        }, delay);
      }
    });
}

function subscribe(table: string, cb: () => void): () => void {
  let entry = registry.get(table);
  if (!entry) {
    entry = { channel: null as unknown as RealtimeChannel, refs: 0, callbacks: new Set(), retry: 0 };
    entry.channel = makeChannel(table, entry);
    registry.set(table, entry);
  }
  entry.refs += 1;
  entry.callbacks.add(cb);

  return () => {
    const e = registry.get(table);
    if (!e) return;
    e.callbacks.delete(cb);
    e.refs -= 1;
    if (e.refs <= 0) {
      clearTimeout(e.retryTimer);
      clearTimeout(e.broadcastTimer);
      createClient().removeChannel(e.channel);
      registry.delete(table);
    }
  };
}

/**
 * Подписка на Supabase Realtime для таблицы. При любом изменении инвалидирует
 * переданный queryKey (по умолчанию `[table]`). Канал общий на всё приложение —
 * см. менеджер выше.
 *
 *   useRealtimeSync('tasks');                 // инвалидирует ['tasks']
 *   useRealtimeSync('calls', ['calls']);      // явный ключ
 */
export function useRealtimeSync(table: string, queryKey?: readonly string[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const key = queryKey ?? [table];
    const cb = () => queryClient.invalidateQueries({ queryKey: key });
    return subscribe(table, cb);
    // queryKey у всех вызывающих — стабильная константа (QUERY_KEY / литерал);
    // сериализуем, чтобы не переподписываться на новую ссылку того же ключа.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, queryClient, JSON.stringify(queryKey)]);
}
