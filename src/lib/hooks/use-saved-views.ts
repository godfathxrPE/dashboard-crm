'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export interface SavedView {
  id: string;
  label: string;
  /** Маршрут страницы, например '/projects' */
  route: string;
  /** Снимок location.search, включая '?', или '' */
  query: string;
}

const STORAGE_KEY = 'saved-views';
const EMPTY: SavedView[] = [];

// Кэш обязателен: useSyncExternalStore требует стабильную ссылку от getSnapshot
let cache: SavedView[] | null = null;
const listeners = new Set<() => void>();

function readViews(): SavedView[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  // Routing-split P1: раздел сделок переехал /projects → /deals; сохранённые
  // виды сделаны до переезда — разово переключаем ключ маршрута (виды раздела
  // «Проекты» пользователи заведут уже с новым ключом).
  if (cache.some((v) => v.route === '/projects')) {
    const migrated = cache.map((v) => (v.route === '/projects' ? { ...v, route: '/deals' } : v));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch { /* private mode — миграция живёт до перезагрузки */ }
    cache = migrated;
  }
  return cache;
}

function writeViews(views: SavedView[]) {
  cache = views;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // localStorage недоступен (private mode) — виды живут до перезагрузки
  }
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      callback();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSavedViews(route?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const all = useSyncExternalStore(subscribe, readViews, () => EMPTY);

  const views = useMemo(
    () => (route ? all.filter((v) => v.route === route) : all),
    [all, route],
  );

  const saveCurrent = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const view: SavedView = {
        id: crypto.randomUUID(),
        label: trimmed,
        route: route ?? pathname,
        query: window.location.search,
      };
      writeViews([...readViews(), view]);
    },
    [route, pathname],
  );

  const remove = useCallback((id: string) => {
    writeViews(readViews().filter((v) => v.id !== id));
  }, []);

  const apply = useCallback(
    (view: SavedView) => {
      router.push(view.route + view.query);
    },
    [router],
  );

  return { views, saveCurrent, remove, apply };
}
