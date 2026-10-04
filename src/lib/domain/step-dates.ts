// src/lib/domain/step-dates.ts — S-TODAY-V3-ACT-1
//
// Быстрые даты формы хода (спека, п. 2 «Выходные»): три ближайших рабочих дня после
// сегодня и первый понедельник строго после третьего — «через неделю», не попадая
// в выходные. «Сегодня» — `localDateKey(now)`, как у `getDealHealth`: дата шага —
// колонка `date`.
//
// Арифметика — на ключах дня (`shiftDateKeyByBuckets`, UTC-полдень): без часов и DST.

import { localDateKey, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';

export interface QuickDate { key: string; label: string }

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function weekday(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

function nextDay(key: string): string {
  return shiftDateKeyByBuckets(key, 'day', 1);
}

function isWorkday(key: string): boolean {
  const d = weekday(key);
  return d !== 0 && d !== 6;
}

/** Четыре быстрые даты формы хода; суббота и воскресенье пропускаются. */
export function quickStepDates(now: Date): QuickDate[] {
  const keys: string[] = [];
  let cur = localDateKey(now);
  while (keys.length < 3) {
    cur = nextDay(cur);
    if (isWorkday(cur)) keys.push(cur);
  }
  // Понедельник СТРОГО после третьей даты: если третья сама понедельник — следующий.
  cur = nextDay(keys[2]);
  while (weekday(cur) !== 1) cur = nextDay(cur);
  keys.push(cur);

  // Месяц — у первой подписи и там, где он сменился относительно предыдущей даты.
  return keys.map((key, i) => {
    const month = Number(key.slice(5, 7)) - 1;
    const showMonth = i === 0 || key.slice(5, 7) !== keys[i - 1].slice(5, 7);
    const day = Number(key.slice(8, 10));
    return { key, label: `${WEEKDAYS[weekday(key)]} ${day}${showMonth ? ` ${MONTHS[month]}` : ''}` };
  });
}
