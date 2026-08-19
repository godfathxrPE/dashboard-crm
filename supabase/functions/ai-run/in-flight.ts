// supabase/functions/ai-run/in-flight.ts
//
// Реестр прогонов, выполняющихся в ЭТОМ воркере, и раздача пометки при его выключении.
//
// Зачем отдельный файл: `processRun` живёт в `EdgeRuntime.waitUntil`, и воркер могут
// убить по wall clock (150 с на Free) прямо посреди прогона. Исключения при этом НЕТ,
// `catch` не выполняется — строка `ai_runs` навсегда остаётся в `running`, а в интерфейсе
// висит вечный спиннер до перезагрузки страницы. Единственный хук, который даёт
// платформа, — событие `beforeunload`; вся его логика собрана здесь, потому что
// `index.ts` из vitest не импортируется (Deno.serve на верхнем уровне), а поведение
// «одна пометка на все незавершённые прогоны» проверять надо.
//
// Модуль намеренно НИЧЕГО не знает про supabase-js: клиент ходит параметром типа `C`.
// Так реестр остаётся типобезопасным и в Deno (там `C` = SupabaseClient), и в тестах.

/** Прогоны в работе: id → клиент, которым эту строку можно писать (JWT вызывающего). */
export type InFlightRuns<C> = Map<string, C>;

export function createInFlightRuns<C>(): InFlightRuns<C> {
  return new Map<string, C>();
}

/**
 * Пометить всё, что осталось в работе, и очистить реестр.
 *
 * Группировка по клиенту — не украшение: параллельные прогоны в одном воркере могут
 * принадлежать РАЗНЫМ пользователям, а пишем мы под их JWT (RLS). Один клиент — один
 * запрос со списком id; на `beforeunload` времени мало, и лишние round-trip'ы туда не
 * помещаются. Ретраев здесь нет по той же причине: не успеем.
 *
 * Реестр очищается: событие может прийти повторно, а вторая пометка уже помеченных
 * строк — лишний запрос ровно там, где запросов и так впритык.
 */
export function flushInFlightRuns<C>(
  runs: InFlightRuns<C>,
  write: (client: C, ids: string[]) => void,
): { clients: number; runs: number } {
  const byClient = new Map<C, string[]>();
  for (const [id, client] of runs) {
    const ids = byClient.get(client);
    if (ids) ids.push(id);
    else byClient.set(client, [id]);
  }
  runs.clear();

  let count = 0;
  for (const [client, ids] of byClient) {
    count += ids.length;
    write(client, ids);
  }
  return { clients: byClient.size, runs: count };
}
