// src/lib/domain/step-actions.ts — S-TODAY-V3-ACT-1
//
// Какие кнопки хода у сделки (спринт ACT-1, задача 4). Строки таблицы проверяются
// сверху вниз, первая подошедшая побеждает. Одна функция на карточку хода, блок
// «Сейчас» панели и клавиши D/U/T: иначе мышь и клавиатура однажды сделают разное.

import type { TodayDealClass } from './today-deals';
import type { StepMode } from './step-flow';

export interface StepActions {
  primary: { label: string; mode: StepMode };
  /** «Перенести» — только там, где есть что переносить. */
  canMove: boolean;
  /** Ссылка «Закрыть сделку — в карточке»: закрытие — переход стадии, он в карточке. */
  closeLink: boolean;
}

export function stepActionsFor(cls: Pick<TodayDealClass, 'noStep' | 'assignedToday' | 'group'>): StepActions {
  // 1. Шага нет — переносить нечего, в любой группе и любом слоте.
  if (cls.noStep) return { primary: { label: 'Назначить шаг', mode: 'update' }, canMove: false, closeLink: false };
  // 2–3. Назначено на сегодня, свежий срыв или шаг по плану — шаг сделан или перенесён.
  if (cls.assignedToday || cls.group === 'fresh' || cls.group === 'plan') {
    return { primary: { label: 'Сделано', mode: 'done' }, canMove: true, closeLink: false };
  }
  // 4. После срока работа шла или шаг впереди под риском — текст шага устарел.
  if (cls.group === 'stale' || cls.group === 'risk') {
    return { primary: { label: 'Обновить шаг', mode: 'update' }, canMove: false, closeLink: false };
  }
  // 5. Тишина дольше порога.
  return { primary: { label: 'Вернуть в работу', mode: 'revive' }, canMove: false, closeLink: true };
}
