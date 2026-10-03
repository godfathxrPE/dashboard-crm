// supabase/functions/ai-run/auto-dispatch.ts — S-BRIEF-IN-DEAL-1.1 (138)
//
// Чистая часть ветки диспетчера автозапуска брифа: разбор тела запроса тика и решение,
// можно ли брать строку ai_runs. Вынесено из `index.ts` ради проверки: `index.ts` из
// vitest не импортируется (`Deno.serve` на верхнем уровне).
//
// Узкая способность ключа: ветка не создаёт прогонов и не берёт из тела ни org, ни
// автора, ни сущность — только `run_id` строки, которую поставил `brief_auto_tick()`.
// Утечка ключа даёт запуск обработки уже поставленной строки, не больше.
//
// ⚠️ Модуль ЧИСТЫЙ: ни импортов, ни `Deno`.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AutoRunRow = {
  id: string;
  preset_key: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  auto_reason: string | null;
};

/** Тело запроса тика: ровно `{ run_id: uuid }`; лишние ключи игнорируются. */
export function parseAutoDispatchBody(raw: unknown): { runId: string } | { error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'Некорректное тело запроса' };
  }
  const runId = (raw as { run_id?: unknown }).run_id;
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
    return { error: 'run_id должен быть uuid' };
  }
  return { runId };
}

/** Можно ли диспетчеру брать строку. Порядок проверок = порядок кодов ответа. */
export function checkAutoRun(
  row: AutoRunRow | null,
): 'ok' | 'not_found' | 'not_auto' | 'not_pending' {
  if (!row) return 'not_found';
  if (
    row.preset_key !== 'company_brief' ||
    row.entity_type !== 'company' ||
    !row.entity_id ||
    !row.auto_reason
  ) {
    return 'not_auto';
  }
  if (row.status !== 'pending') return 'not_pending';
  return 'ok';
}
