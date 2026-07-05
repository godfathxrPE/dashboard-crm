'use client';

import { useMemo } from 'react';
import { useCalls } from './use-calls';
import { useMeetings } from './use-meetings';
import { localDateKey } from '@/lib/utils/date-helpers';
import { RECONNECT_THRESHOLD_DAYS } from '@/lib/constants/reconnect';

export interface LastTouch {
  /** ISO дата последнего состоявшегося касания */
  date: string;
  kind: 'call' | 'meeting';
}

/**
 * Дней с указанной даты (>= 0). Считается по календарным дням.
 */
export function daysSince(dateIso: string): number {
  const then = new Date(new Date(dateIso).toDateString());
  const today = new Date(new Date().toDateString());
  return Math.max(0, Math.floor((today.getTime() - then.getTime()) / 86400000));
}

export type TouchLevel = 'ok' | 'cooling' | 'cold';

/**
 * Уровень «тишины» по числу дней с касания (null = касаний не было).
 *  - cold  (red):    старше 2× порога;
 *  - cooling (yellow): старше порога ИЛИ касаний не было;
 *  - ok:    свежее порога.
 */
export function touchLevel(days: number | null): TouchLevel {
  if (days === null) return 'cooling';
  if (days > RECONNECT_THRESHOLD_DAYS * 2) return 'cold';
  if (days > RECONNECT_THRESHOLD_DAYS) return 'cooling';
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
