'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseDayMoves, type DayMovesState } from '@/lib/domain/day-moves';

// ═══════════════════════════════════════════════════════
// S-TODAY-V3-ACT-1: набор ходов дня в `localStorage`, ключ `today-moves-<день>`.
//
// Правила набора — в `day-moves.ts`; здесь только хранилище. Чтение — в `useEffect`
// после монтирования: на сервере `localStorage` нет, и первый рендер обязан совпасть
// с серверным (до чтения экран показывает пересчёт). Запись и чтение — в `try/catch`:
// приватное окно или запрет хранилища — экран работает на пересчёте, без ошибки.
// Ключи прошлых дней не чистятся намеренно: это сотни байт, а чистка — лишняя запись.
// ═══════════════════════════════════════════════════════

const keyOf = (day: string) => `today-moves-${day}`;

export function useDayMoves(day: string | null) {
  const [saved, setSaved] = useState<DayMovesState | null>(null);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    let parsed: DayMovesState | null = null;
    try {
      parsed = parseDayMoves(window.localStorage.getItem(keyOf(day)));
    } catch {
      parsed = null;
    }
    setSaved(parsed);
    setLoadedDay(day);
  }, [day]);

  const persist = useCallback((state: DayMovesState) => {
    setSaved(state);
    try {
      window.localStorage.setItem(keyOf(state.day), JSON.stringify(state));
    } catch {
      // Хранилище недоступно — набор живёт в памяти до перезагрузки.
    }
  }, []);

  return { saved, loaded: !!day && loadedDay === day, persist };
}
