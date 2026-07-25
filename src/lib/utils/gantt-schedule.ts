import { shiftDateKeyByBuckets, diffDaysKey } from './date-helpers';

/**
 * S-SCHEDULE-1B — расчёт авто-каскада сдвига зависимых задач (чистая графовая
 * математика, ноль React/Supabase). Фундамент S-GANTT-CPM: сюда же переедут
 * прямой/обратный проход и total float, а крит-путь в GanttTimeline начнёт
 * читать float вместо своего inline-DP.
 *
 * КОНТРАКТ v1 (правила зафиксированы — не менять без нового спринта):
 *  1. Только dep_type === 'FS'. Прочие типы (SS/FF/SF) молча пропускаются —
 *     их семантика не описана, каскад по ним считать нельзя.
 *  2. Только вперёд. Есть запас (succ.start > earliest) — НЕ подтягиваем назад
 *     (это ASAP-планирование, рвёт пользовательские буферы/фикс-даты).
 *  3. Длительность сохраняется: newStart = shift(start,+Δ), newEnd = shift(end,+Δ).
 *  4. Якоря (anchors) не двигаются, но участвуют как предшественники своими
 *     текущими датами.
 *  5. Сводные узлы двигаются поддеревом по СЫРОМУ parentTaskId (кросс-лейн):
 *     тот же Δ рекурсивно ко всем потомкам с датами. Собственные даты сводного
 *     пишутся только при hasOwnDates (иначе span вычислен из детей — писать нечего).
 *  6. Узлы без дат в графе отсутствуют — сдвигать нечего, ребро игнорируется.
 *  7. Цикл-гард: БД-валидатор 048 циклы не пускает, но модуль устойчив к мусору —
 *     счётчик итераций ≤ nodes.length*4, при превышении вернуть посчитанное + warn.
 *
 * Семантика earliest ИДЕНТИЧНА soft-warn из 1a (GanttTimeline.violation):
 *   earliest = shiftDateKeyByBuckets(pred.end, 'day', lag_days), нарушение при
 *   succ.start < earliest. При lag=0 старт последователя в тот же день, что конец
 *   предшественника, — легален. Иначе предупреждение и каскад разойдутся.
 */

export interface ScheduleNode {
  id: string;
  start: string;                 // YYYY-MM-DD — эффективный span (у сводных = обёртка детей)
  end: string;
  hasOwnDates: boolean;          // false у datesFromChildren-узлов: в БД писать нечего
  parentTaskId: string | null;   // СЫРОЙ task.parent_task_id (кросс-лейн!), не GanttTask.parentId
}

export interface ScheduleEdge {
  predecessor_id: string;
  successor_id: string;
  dep_type: string;
  lag_days: number;
}

export interface CascadeShift {
  id: string;
  deltaDays: number;             // всегда > 0 (v1 — только вперёд); кумулятивно от исходных дат
  start: string;                 // новые даты
  end: string;
  reason: 'dependency' | 'subtree'; // сдвинут связью или как потомок сводной
}

/** dependency перекрывает subtree: если узел двинут и связью, и как потомок —
 *  первопричина связь. */
function preferReason(
  prev: CascadeShift['reason'] | undefined,
  next: CascadeShift['reason'],
): CascadeShift['reason'] {
  return prev === 'dependency' || next === 'dependency' ? 'dependency' : 'subtree';
}

export function computeCascade(
  nodes: ScheduleNode[],
  edges: ScheduleEdge[],
  anchors: Set<string>,
): CascadeShift[] {
  const byId = new Map<string, ScheduleNode>(nodes.map((n) => [n.id, n]));

  // Рабочие (мутируемые) даты — предшественники ниже по топопорядку читают уже
  // сдвинутые значения. Исходные даты остаются в byId для кумулятивного Δ.
  const work = new Map<string, { start: string; end: string }>(
    nodes.map((n) => [n.id, { start: n.start, end: n.end }]),
  );

  // Дети по сырому parentTaskId (кросс-лейн) — только узлы с датами (в byId).
  const childrenByParent = new Map<string, ScheduleNode[]>();
  for (const n of nodes) {
    if (!n.parentTaskId || !byId.has(n.parentTaskId)) continue;
    (childrenByParent.get(n.parentTaskId) ?? childrenByParent.set(n.parentTaskId, []).get(n.parentTaskId)!).push(n);
  }

  // FS-рёбра с обоими концами в графе. Прочие типы (правило 1) и висячие концы
  // (правило 6) — пропуск. incoming: successor→рёбра (для earliest); outgoing:
  // predecessor→successors (для Kahn).
  const incoming = new Map<string, ScheduleEdge[]>();
  const outgoing = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const e of edges) {
    if (e.dep_type !== 'FS') continue;
    if (!byId.has(e.predecessor_id) || !byId.has(e.successor_id)) continue;
    (incoming.get(e.successor_id) ?? incoming.set(e.successor_id, []).get(e.successor_id)!).push(e);
    (outgoing.get(e.predecessor_id) ?? outgoing.set(e.predecessor_id, []).get(e.predecessor_id)!).push(e.successor_id);
    indeg.set(e.successor_id, (indeg.get(e.successor_id) ?? 0) + 1);
  }

  // Kahn-топосорт по FS-рёбрам. Узлы в цикле никогда не достигнут indeg 0 и в
  // topo не попадут (правило 7 — «остаток от цикла пропускаем»).
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const succ of outgoing.get(id) ?? []) {
      const d = (indeg.get(succ) ?? 0) - 1;
      indeg.set(succ, d);
      if (d === 0) queue.push(succ);
    }
  }

  const result = new Map<string, CascadeShift>();
  const guard = { count: 0, limit: nodes.length * 4 };

  // Применяет ДОПОЛНИТЕЛЬНЫЙ сдвиг на deltaDays к узлу и всему его поддереву
  // (правило 5). Кумулятивный Δ в CascadeShift считается от исходных дат byId.
  const shiftNode = (id: string, deltaDays: number, reason: CascadeShift['reason']): void => {
    if (guard.count++ > guard.limit) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[gantt-schedule] cascade iteration guard tripped — возможен цикл/мусор в графе');
      }
      return;
    }
    if (anchors.has(id)) return;                            // якорь не двигается (правило 4)
    const cur = work.get(id);
    const node = byId.get(id);
    if (!cur || !node) return;
    const ns = shiftDateKeyByBuckets(cur.start, 'day', deltaDays);
    const ne = shiftDateKeyByBuckets(cur.end, 'day', deltaDays);
    work.set(id, { start: ns, end: ne });
    if (node.hasOwnDates) {
      result.set(id, {
        id,
        deltaDays: diffDaysKey(node.start, ns),             // кумулятивно от исходных
        start: ns,
        end: ne,
        reason: preferReason(result.get(id)?.reason, reason),
      });
    }
    for (const child of childrenByParent.get(id) ?? []) {
      shiftNode(child.id, deltaDays, 'subtree');            // поддерево — тем же Δ
    }
  };

  for (const id of topo) {
    if (anchors.has(id)) continue;                          // якорь неподвижен, но уже в work
    const inc = incoming.get(id);
    if (!inc?.length) continue;
    let earliest: string | null = null;
    for (const e of inc) {
      const predEnd = work.get(e.predecessor_id)?.end;
      if (!predEnd) continue;
      const cand = shiftDateKeyByBuckets(predEnd, 'day', e.lag_days);
      if (earliest === null || cand > earliest) earliest = cand;
    }
    if (earliest === null) continue;
    const curStart = work.get(id)!.start;
    if (curStart < earliest) {                              // нарушение → сдвигаем вперёд (правило 2)
      const delta = diffDaysKey(curStart, earliest);
      if (delta > 0) shiftNode(id, delta, 'dependency');
    }
  }

  return [...result.values()];
}
