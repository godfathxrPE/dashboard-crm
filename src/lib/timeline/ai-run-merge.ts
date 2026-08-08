// ═══════════════════════════════════════════════════════
// S-AI-VIS-1: слияние двух источников ai_runs для ленты сущности.
//
// Источник 1 — прогоны по звонкам и встречам сущности (`entity_id ∈ (…)`).
// Источник 2 — прогоны САМОЙ сущности (`entity_type='company'|'project'` +
//   `entity_id` = её id). До этого спринта второго источника не было, и семь
//   готовых брифов компании были невидимы в её же ленте.
//
// Слияние — чистая функция: лимит обязан применяться ПОСЛЕ объединения, иначе
// «50 последних» каждого источника дают до 100 событий в ленте, и хронология
// врёт на границе.
// ═══════════════════════════════════════════════════════

export type AiRunTimelineRow = {
  id: string;
  preset_key: string;
  entity_type: string;
  created_at: string;
};

/**
 * Объединить источники: дедуп по id, сортировка по дате убыванию, затем лимит.
 *
 * Дедуп нужен не «на всякий случай»: прогон по сделке попадает в оба источника
 * project-хаба, если у сделки есть собственные прогоны и её id встретился в
 * первом наборе. Побеждает первое вхождение — строки идентичны, выбор не важен.
 */
export function mergeAiRunRows(
  sources: ReadonlyArray<ReadonlyArray<AiRunTimelineRow>>,
  limit: number,
): AiRunTimelineRow[] {
  const byId = new Map<string, AiRunTimelineRow>();
  for (const source of sources) {
    for (const row of source) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
