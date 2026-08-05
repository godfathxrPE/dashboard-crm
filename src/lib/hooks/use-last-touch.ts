'use client';

import { useMemo } from 'react';
import { useCalls } from './use-calls';
import { useMeetings } from './use-meetings';
import { localDateKey } from '@/lib/utils/date-helpers';
import { DEFAULT_RECONNECT_DAYS } from '@/lib/constants/reconnect';

export interface LastTouch {
  /** ISO дата последнего состоявшегося касания */
  date: string;
  kind: 'call' | 'meeting';
}

/**
 * Дней с указанной даты (>= 0), по календарным дням.
 * Реализация уехала в `utils/date-helpers` (S-UI-CLARITY-1) — её зовёт и чистый
 * домен `company-touch`, которому «use client»-хуки не нужны. Реэкспорт оставлен,
 * чтобы десяток существующих импортов из этого модуля не переписывать.
 */
export { daysSince } from '@/lib/utils/date-helpers';

export type TouchLevel = 'ok' | 'cooling' | 'cold';

/**
 * Уровень «тишины» по числу дней с касания (null = касаний не было).
 *  - cold  (red):    старше 2× порога;
 *  - cooling (yellow): старше порога ИЛИ касаний не было;
 *  - ok:    свежее порога.
 *
 * R2-P0-D: порог — настройка организации. Функция чистая, поэтому берёт его параметром;
 * клиентские компоненты передают `useReconnectDays()`. Дефолт оставлен, чтобы вызов
 * без порога (пока настройка грузится) вёл себя как раньше.
 */
export function touchLevel(days: number | null, thresholdDays: number = DEFAULT_RECONNECT_DAYS): TouchLevel {
  if (days === null) return 'cooling';
  if (days > thresholdDays * 2) return 'cold';
  if (days > thresholdDays) return 'cooling';
  return 'ok';
}

/**
 * Map<contactId, LastTouch> — последнее СОСТОЯВШЕЕСЯ касание по каждому контакту.
 * Деривация из React Query-кеша (calls + meetings), без запросов и миграций.
 *
 * Касанием считаем только:
 *  - звонок со `status === 'done'` (запланированный, но не сделанный — не касание);
 *  - встречу, дата которой не в будущем (прошедшую).
 */
export function useLastTouchMap(): Map<string, LastTouch> {
  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();

  return useMemo(() => {
    const map = new Map<string, LastTouch>();
    const consider = (contactId: string | null, date: string, kind: LastTouch['kind']) => {
      if (!contactId) return;
      const prev = map.get(contactId);
      if (!prev || date > prev.date) map.set(contactId, { date, kind });
    };

    for (const c of calls) {
      if (c.status !== 'done') continue;
      consider(c.contact_id, c.date, 'call');
    }

    const todayKey = localDateKey();
    for (const m of meetings) {
      if (m.date.slice(0, 10) > todayKey) continue; // только прошедшие/сегодняшние
      consider(m.contact_id, m.date, 'meeting');
    }

    return map;
  }, [calls, meetings]);
}
