// src/lib/domain/step-flow.ts — S-TODAY-V3-ACT-1
//
// Порядок записи хода. «Сделано» пишет до трёх строк в две таблицы, и порядок не
// произволен: счётчик «перенесён N раз» (`countStepMoves`, `field-moves.ts`) идёт по
// аудиту полей от новых строк к старым и обрывается на строке, где дата шага была
// снята (`to === null`) или назначена с нуля (`from === null`).
//
// ⚠️ Новый шаг ОДНИМ `UPDATE` поверх старого записал бы в аудит `старая → новая`:
// для счётчика это ещё один перенос того же шага, и шесть переносов старого шага
// повисли бы на новом. Поэтому старый шаг сначала снимается (`{ null, null }`),
// затем назначается новый — два `UPDATE`, как `markStepDone` в карточке сделки.
//
// План отдельно от исполнения: `use-step-flow.ts` только идёт по списку.

export type StepMode = 'done' | 'update' | 'revive' | 'move';

export interface StepPrev {
  next_step: string | null;
  next_action_date: string | null;
}

export type StepWrite =
  | { kind: 'note'; body: string }
  | { kind: 'project'; next_step: string | null; next_action_date: string | null };

export interface StepInput {
  /** Итог — заметка в ленту; пустая строка — заметки нет. */
  note: string;
  /** Текст следующего шага. В режиме `move` не используется. */
  nextStep: string;
  /** День следующего шага, 'YYYY-MM-DD'. */
  dateKey: string;
}

function noteWrite(note: string): StepWrite[] {
  const body = note.trim();
  return body ? [{ kind: 'note', body }] : [];
}

/** У сделки был шаг или его дата — тогда новый шаг назначается только после снятия. */
function hadStep(prev: StepPrev): boolean {
  return !!prev.next_step?.trim() || !!prev.next_action_date;
}

const CLEAR: StepWrite = { kind: 'project', next_step: null, next_action_date: null };

/** План записи хода; исполняется строго по порядку. */
export function planStepWrites(mode: StepMode, prev: StepPrev, input: StepInput): StepWrite[] {
  if (mode === 'move') {
    // Перенос — это и есть сдвиг даты того же шага: одна запись, текст прежний.
    return [{ kind: 'project', next_step: prev.next_step, next_action_date: input.dateKey }];
  }
  const next: StepWrite = { kind: 'project', next_step: input.nextStep.trim(), next_action_date: input.dateKey };
  return [...noteWrite(input.note), ...(hadStep(prev) ? [CLEAR] : []), next];
}

/** «Оставить без шага»: заметка, если есть, и снятие шага. */
export function planLeaveWithoutStep(prev: StepPrev, note: string): StepWrite[] {
  return [...noteWrite(note), ...(hadStep(prev) ? [CLEAR] : [])];
}

/**
 * «Вернуть»: одна запись прежних значений.
 *
 * ⚠️ Аудит полей не откатывается — это известная цена. После «Сделано» и «Вернуть»
 * счётчик переносов прежнего шага обнуляется (в аудите осталась строка с `null`);
 * после «Перенести» и «Вернуть» сам перенос остаётся в счётчике (возврат — сдвиг
 * назад, он не считается, но и не вычитается).
 */
export function planRestore(prev: StepPrev): StepWrite[] {
  return [{ kind: 'project', next_step: prev.next_step, next_action_date: prev.next_action_date }];
}

/** Проверка ввода формы; `null` — ошибок нет. */
export function validateStepInput(mode: StepMode, input: StepInput): 'no_step' | 'no_date' | null {
  if (mode !== 'move' && !input.nextStep.trim()) return 'no_step';
  if (!input.dateKey) return 'no_date';
  return null;
}
