// src/lib/domain/day-moves.ts — S-TODAY-V3-ACT-1
//
// Набор ходов дня (спека, п. 2 «Ходы дня»): фиксируется при первом открытии экрана
// за день и не пересобирается на каждом рендере. Сделанный ход остаётся карточкой с
// отметкой, лимит защищает день: когда тройка сделана, следующий ход берётся только
// кнопкой «Взять ещё ход», а не всплывает сам.
//
// Хранение — `localStorage` (`use-day-moves.ts`); здесь только правила, без хранилища.

import type { Move, MoveSlot } from './today-deals';

export interface DayMovesState {
  /** День, на который собран набор: 'YYYY-MM-DD'. */
  day: string;
  picked: string[];
  done: string[];
  /** Слот хода на момент взятия — для строки «почему здесь». */
  slots: Record<string, MoveSlot>;
}

const SLOTS: readonly MoveSlot[] = ['assigned', 'fresh', 'biggest', 'fill'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isSlot(v: unknown): v is MoveSlot {
  return typeof v === 'string' && (SLOTS as readonly string[]).includes(v);
}

/** Сохранённый набор; битый JSON, не объект, нет полей, поля не массивы строк → `null`. */
export function parseDayMoves(raw: string | null): DayMovesState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const day: unknown = Reflect.get(data, 'day');
  const picked: unknown = Reflect.get(data, 'picked');
  const done: unknown = Reflect.get(data, 'done');
  const slotsRaw: unknown = Reflect.get(data, 'slots');
  if (typeof day !== 'string' || !isStringArray(picked) || !isStringArray(done)) return null;

  // Слоты — подсказка для «почему здесь», а не инвариант: битая запись слота не
  // роняет набор, она просто пропадает.
  const slots: Record<string, MoveSlot> = {};
  if (typeof slotsRaw === 'object' && slotsRaw !== null && !Array.isArray(slotsRaw)) {
    for (const [id, slot] of Object.entries(slotsRaw)) if (isSlot(slot)) slots[id] = slot;
  }
  return { day, picked, done, slots };
}

function slotsFor(picked: readonly string[], prev: Record<string, MoveSlot>, computed: readonly Move[]): Record<string, MoveSlot> {
  const fromComputed = new Map(computed.map((m) => [m.id, m.slot] as const));
  const out: Record<string, MoveSlot> = {};
  for (const id of picked) {
    const slot = prev[id] ?? fromComputed.get(id);
    if (slot) out[id] = slot;
  }
  return out;
}

/**
 * Набор дня с учётом сохранённого. Правила — спринт ACT-1, задача 2.2:
 * новый день → набор из `computed`; тот же день → прежний набор минус ушедшие
 * сделки, плюс новые назначенные в начало, плюс добор до лимита, если набор пуст
 * или в нём есть несделанные ходы.
 */
export function reconcileDayMoves(
  saved: DayMovesState | null,
  today: string,
  computed: readonly Move[],
  existingIds: ReadonlySet<string>,
  limit: number,
): DayMovesState {
  if (!saved || saved.day !== today) {
    const picked = computed.map((m) => m.id);
    return { day: today, picked, done: [], slots: slotsFor(picked, {}, computed) };
  }

  // Ушедшие (закрыты, отложены) убираются. Сделанный ход остаётся, даже если его
  // сделки больше нет в `computed`: сделанное — факт дня.
  let picked = saved.picked.filter((id) => existingIds.has(id));
  const inPicked = new Set(picked);

  const newAssigned = computed.filter((m) => m.slot === 'assigned' && !inPicked.has(m.id)).map((m) => m.id);
  picked = [...newAssigned, ...picked];
  for (const id of newAssigned) inPicked.add(id);

  const done = saved.done.filter((id) => inPicked.has(id));
  const doneSet = new Set(done);
  const allDone = picked.length > 0 && picked.every((id) => doneSet.has(id));
  if (picked.length < limit && !allDone) {
    for (const m of computed) {
      if (picked.length >= limit) break;
      if (inPicked.has(m.id)) continue;
      picked.push(m.id);
      inPicked.add(m.id);
    }
  }

  return { day: today, picked, done, slots: slotsFor(picked, saved.slots, computed) };
}

export function markMoveDone(state: DayMovesState, id: string): DayMovesState {
  if (state.done.includes(id)) return state;
  return { ...state, done: [...state.done, id] };
}

export function unmarkMoveDone(state: DayMovesState, id: string): DayMovesState {
  if (!state.done.includes(id)) return state;
  return { ...state, done: state.done.filter((x) => x !== id) };
}

/** «Взять ещё ход»: первый из `computed`, которого нет в наборе. */
export function takeOneMore(state: DayMovesState, computed: readonly Move[]): DayMovesState {
  const next = computed.find((m) => !state.picked.includes(m.id));
  if (!next) return state;
  return {
    ...state,
    picked: [...state.picked, next.id],
    slots: { ...state.slots, [next.id]: next.slot },
  };
}
