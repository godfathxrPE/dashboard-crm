// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B: подсчёт переносов даты по аудиту полей (087).
//
// Вынесено из queryFn хука, потому что правило подсчёта нетривиально и обязано
// быть проверяемым без сети.
// ═══════════════════════════════════════════════════════

export interface FieldMoves {
  count: number;
  /** ISO последнего переноса или null. */
  lastAt: string | null;
}

export interface AuditRow {
  created_at: string;
  payload: unknown;
}

function changesOf(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const changes = (payload as Record<string, unknown>).changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  return changes as Record<string, unknown>;
}

/**
 * Переносы `deadline` — прежнее поведение хука дословно: считается
 * ЛЮБОЕ появление ключа в changes, включая назначение с нуля. Не ужесточаем:
 * число «Переносов ×N» уже на экране во вкладке «История», и менять его молча
 * означало бы поменять цифру у пользователя без спроса.
 */
export function countDeadlineMoves(rows: AuditRow[]): FieldMoves {
  let count = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    const changes = changesOf(row.payload);
    if (!changes || !('deadline' in changes)) continue;
    count += 1;
    if (lastAt === null) lastAt = row.created_at;
  }
  return { count, lastAt };
}

/**
 * Переносы даты ТЕКУЩЕГО шага. Строгий счёт, три отличия от `deadline`:
 *
 * 1. `to > from` — только сдвиг ВПЕРЁД. Перенос шага на более раннюю дату это
 *    ускорение, а не прокрастинация, и в диагноз «перенесён N раз» не идёт.
 * 2. Счёт обрывается на `from === null`: это момент, когда дата текущего шага
 *    была назначена впервые. Всё, что раньше, относится к прошлым шагам.
 * 3. Счёт обрывается и на `to === null`: снятие даты — это «Шаг сделан»
 *    (`markStepDone` пишет `next_step: null, next_action_date: null`). Диагноз
 *    закрытого шага не должен висеть на карточке следующего.
 *
 * `rows` ожидаются по УБЫВАНИЮ `created_at` — так их отдаёт запрос хука.
 * `from`/`to` приходят из `jsonb_build_object('from', v_old ->> v_field, ...)`,
 * то есть JSON-null при пустом значении, а не отсутствующий ключ.
 */
export function countStepMoves(rows: AuditRow[]): FieldMoves {
  let count = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    const changes = changesOf(row.payload);
    if (!changes || !('next_action_date' in changes)) continue;
    const entry = changes.next_action_date;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { from, to } = entry as { from?: unknown; to?: unknown };
    const fromStr = typeof from === 'string' && from.length > 0 ? from : null;
    const toStr = typeof to === 'string' && to.length > 0 ? to : null;
    // Обе границы жизни текущего шага. Идём по убыванию, поэтому первая
    // встреченная — ближайшая к настоящему.
    if (fromStr === null || toStr === null) break;
    if (toStr <= fromStr) continue;
    count += 1;
    if (lastAt === null) lastAt = row.created_at;
  }
  return { count, lastAt };
}
