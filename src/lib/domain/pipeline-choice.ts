/**
 * Выбор deal-воронки направления и перенос стадии между воронками (S-PIPE-SPLIT-2).
 *
 * До 136 у направления была ровно одна deal-воронка, и интерфейс брал её по
 * `is_default` в трёх местах (две доски и форма сделки). После разделения пресейла
 * IIoT («IIoT Проект» + «IIoT Эксперимент») воронка — выбор пользователя, а default
 * — только порядок по умолчанию. Id воронок в коде не живут: всё выводится из
 * `pipelines` по `direction` + `entity_type = 'deal'`.
 *
 * Чистые функции: без React, без Supabase, без времени и рандома.
 */

import type { Direction, Pipeline, PipelineStage } from '@/types/database';

/** Deal-воронки направления: default первой, дальше по name (localeCompare 'ru'). */
export function dealPipelinesFor(pipelines: Pipeline[], direction: Direction): Pipeline[] {
  return pipelines
    .filter((p) => p.direction === direction && p.entity_type === 'deal')
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    });
}

/**
 * Активная воронка доски: id из URL, если он — deal-воронка ЭТОГО направления;
 * иначе default; иначе первая. Чужой id (другое направление, delivery, удалённая
 * воронка) молча отбрасывается — ссылка с устаревшим `?pipeline` не ломает доску.
 */
export function resolveActivePipeline(
  pipelines: Pipeline[],
  direction: Direction,
  requestedId: string | null,
): Pipeline | null {
  const candidates = dealPipelinesFor(pipelines, direction);
  if (requestedId) {
    const requested = candidates.find((p) => p.id === requestedId);
    if (requested) return requested;
  }
  // dealPipelinesFor ставит default первым — отдельный поиск не нужен.
  return candidates[0] ?? null;
}

/** Первая рабочая (не won/lost) стадия воронки по `order_index`; нет рабочих — null. */
export function firstWorkingStage(stages: PipelineStage[]): PipelineStage | null {
  let first: PipelineStage | null = null;
  for (const s of stages) {
    if (s.is_won || s.is_lost) continue;
    if (!first || s.order_index < first.order_index) first = s;
  }
  return first;
}

const normName = (name: string) => name.trim().toLocaleLowerCase('ru');

/**
 * Стадия в целевой воронке при переводе сделки.
 *
 *  - выиграна → `is_won` цели, проиграна → `is_lost` цели;
 *  - рабочая → рабочая цели с тем же именем (без учёта регистра и краевых пробелов);
 *  - совпадения нет или текущей стадии нет → первая рабочая цели;
 *  - в цели нет рабочих стадий → null (перевод не предлагается).
 *
 * Терминал без пары в цели падает в первую рабочую — переводить закрытые сделки
 * UI всё равно не даёт, ветка нужна, чтобы функция была тотальной.
 */
export function mapStageToPipeline(
  current: PipelineStage | null,
  targetStages: PipelineStage[],
): PipelineStage | null {
  const first = firstWorkingStage(targetStages);
  if (!first) return null;

  if (current?.is_won) return targetStages.find((s) => s.is_won) ?? first;
  if (current?.is_lost) return targetStages.find((s) => s.is_lost) ?? first;

  if (current) {
    const key = normName(current.name);
    const sameName = targetStages
      .filter((s) => !s.is_won && !s.is_lost && normName(s.name) === key)
      .sort((a, b) => a.order_index - b.order_index)[0];
    if (sameName) return sameName;
  }
  return first;
}
