// src/lib/domain/today-risks.ts — S-TODAY-FOCUS-5
//
// Строки секции «Риски» в теле фокуса экрана «Сегодня» (спека `today-focus-spec.md`,
// §12, H-03). Группа «Под риском» говорит «что-то горит», секция — что именно и что
// с этим сделать: строка на каждое просроченное КП, задачу и звонок.
//
// ⚠️ УСЛОВИЯ — РОВНО КАК В `riskSignals` (`today-deals.ts`). Секция обязана появляться
// тогда и только тогда, когда у сделки есть сигналы риска, иначе группа и фокус
// заспорят. Сверку держит тест `today-risks.test.ts` («сверка с группой»): поменял
// правило там — поменяй здесь.
//
// Задачи и звонки приходят уже из вида сделки (`TodayDealTask`/`TodayDealCall`):
// `overdue` там посчитан по тому же правилу — день срока < сегодня, задача не `done`,
// звонок `pending`. Второй раз день здесь не считается.
//
// `now` — аргумент, `Date.now()` внутри нет.

import { pickActiveQuote, type QuoteLike } from './quote-version';
import { quoteValidity } from './quote-validity';
import type { TodayDealCall, TodayDealTask } from './today-model';

export type FocusRiskRow =
  | { kind: 'quote_expired'; quoteId: string; validUntil: string; sentAt: string | null }
  | { kind: 'task_overdue'; taskId: string; text: string; deadline: string }
  | { kind: 'call_overdue'; callId: string; date: string };

const byTime = (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime();

/**
 * Строки секции «Риски» фокуса. Условия — как в `riskSignals` (`today-deals.ts`):
 * КП — активное (`pickActiveQuote`), статус `sent`, `quoteValidity(...).level === 'expired'`;
 * задача — `overdue` из вида сделки (день срока < сегодня, `lane !== 'done'`);
 * звонок — `overdue` из вида сделки (`pending`, день < сегодня).
 * Порядок: КП → задачи по сроку → звонки по дате.
 */
export function focusRiskRows(
  input: {
    quotes: readonly (QuoteLike & { valid_until: string | null; sent_at: string | null })[];
    tasks: readonly TodayDealTask[];
    calls: readonly TodayDealCall[];
  },
  now: Date,
): FocusRiskRow[] {
  const out: FocusRiskRow[] = [];

  const active = pickActiveQuote(input.quotes);
  if (
    active &&
    active.status === 'sent' &&
    active.valid_until &&
    quoteValidity(active.valid_until, now).level === 'expired'
  ) {
    out.push({ kind: 'quote_expired', quoteId: active.id, validUntil: active.valid_until, sentAt: active.sent_at });
  }

  // `overdue` без срока не бывает, но тип этого не знает — фильтр сужает его.
  const tasks = input.tasks
    .filter((t): t is TodayDealTask & { deadline: string } => t.overdue && !!t.deadline)
    .sort((a, b) => byTime(a.deadline, b.deadline));
  for (const t of tasks) out.push({ kind: 'task_overdue', taskId: t.id, text: t.text, deadline: t.deadline });

  const calls = input.calls.filter((c) => c.overdue).sort((a, b) => byTime(a.date, b.date));
  for (const c of calls) out.push({ kind: 'call_overdue', callId: c.id, date: c.date });

  return out;
}
