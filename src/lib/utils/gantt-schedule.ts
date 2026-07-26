import { shiftDateKeyByBuckets, diffDaysKey } from './date-helpers';

/**
 * S-SCHEDULE-1B — расчёт авто-каскада сдвига зависимых задач (чистая графовая
 * математика, ноль React/Supabase). Фундамент S-GANTT-CPM: сюда же переедут
 * прямой/обратный проход и total float, а крит-путь в GanttTimeline начнёт
 * читать float вместо своего inline-DP.
 *
 * КОНТРАКТ v1 (правила зафиксированы — не менять без нового спринта):
 *  1. S-GANTT-DEPTYPES: все четыре типа (FS/SS/FF/SF) участвуют и в топопорядке, и в
 *     расчёте — концы ребра берутся из depPredSide/depSuccSide. Неизвестный тип
 *     (мусор мимо CHECK 048) молча пропускается.
 *  2. Только вперёд. Есть запас (ограничиваемый конец succ > earliest) — НЕ подтягиваем назад
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
 *  8. ОДНОПРОХОДНОСТЬ. Топопорядок обходится один раз, а сдвиг поддерева применяется
 *     задним числом. Если сводная едет по своей зависимости и тянет ребёнка, узел,
 *     зависящий от этого ребёнка и уже пройденный по топопорядку, останется с новым
 *     нарушением — перепроверять его некому. Репро: сводная S с ребёнком C,
 *     рёбра A→S и C→B. В v1 не решаем; корректный расчёт даёт прямой проход computeCpm.
 *
 * Семантика earliest ИДЕНТИЧНА soft-warn из 1a (GanttTimeline.violation):
 *   earliest = shiftDateKeyByBuckets(pred[predSide], 'day', lag_days), нарушение при
 *   succ[succSide] < earliest. При lag=0 ограничиваемый конец последователя в тот же
 *   день, что якорный конец предшественника, — легален. Иначе предупреждение и каскад
 *   разойдутся.
 */

// ─────────────────────────────────────────────────────────────────────────────
// S-GANTT-DEPTYPES — типы связей. ЕДИНСТВЕННАЯ таблица истины о том, какие концы
// ребра связаны: её читают ВСЕ потребители — soft-warn и геометрия стрелки в
// GanttTimeline, computeCascade и оба прохода computeCpm. Разъезд этих мест даёт
// взаимно противоречивые стрелки и тосты, поэтому «левый/правый край» нигде не
// вычисляется по месту.
//
//   FS: succ.start ≥ pred.end   + lag      SS: succ.start ≥ pred.start + lag
//   FF: succ.end   ≥ pred.end   + lag      SF: succ.end   ≥ pred.start + lag
// ─────────────────────────────────────────────────────────────────────────────

/** Порядок = порядок опций в селекте поповера ребра. */
export const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;

const KNOWN_DEP_TYPES: ReadonlySet<string> = new Set(DEP_TYPES);

/** Конец ПРЕДШЕСТВЕННИКА, от которого отсчитывается lag. */
export const depPredSide = (depType: string): 'start' | 'end' =>
  depType === 'SS' || depType === 'SF' ? 'start' : 'end';

/** Конец ПОСЛЕДОВАТЕЛЯ, который ограничен связью. */
export const depSuccSide = (depType: string): 'start' | 'end' =>
  depType === 'FF' || depType === 'SF' ? 'end' : 'start';

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

  // Рёбра всех четырёх типов с обоими концами в графе. Неизвестный тип (правило 1) и
  // висячие концы (правило 6) — пропуск. incoming: successor→рёбра (для earliest);
  // outgoing: predecessor→successors (для Kahn).
  const incoming = new Map<string, ScheduleEdge[]>();
  const outgoing = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const e of edges) {
    if (!KNOWN_DEP_TYPES.has(e.dep_type)) continue;
    if (!byId.has(e.predecessor_id) || !byId.has(e.successor_id)) continue;
    (incoming.get(e.successor_id) ?? incoming.set(e.successor_id, []).get(e.successor_id)!).push(e);
    (outgoing.get(e.predecessor_id) ?? outgoing.set(e.predecessor_id, []).get(e.predecessor_id)!).push(e.successor_id);
    indeg.set(e.successor_id, (indeg.get(e.successor_id) ?? 0) + 1);
  }

  // Kahn-топосорт по рёбрам всех типов. Узлы в цикле никогда не достигнут indeg 0 и в
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

  // S-GANTT-DEPTYPES: считаем не общий earliest-старт, а максимальный Δ по рёбрам.
  // Разные типы ограничивают РАЗНЫЕ концы узла (FF/SF — финиш), поэтому сравнивать
  // «даты earliest» между собой нельзя — сопоставимы только требуемые сдвиги. Правило 3
  // (длительность сохраняется) делает перевод однозначным: сдвиг финиша на Δ = сдвиг
  // старта на Δ, и максимум по всем входящим рёбрам удовлетворяет их все разом.
  for (const id of topo) {
    if (anchors.has(id)) continue;                          // якорь неподвижен, но уже в work
    const inc = incoming.get(id);
    if (!inc?.length) continue;
    const cur = work.get(id)!;
    let delta = 0;
    for (const e of inc) {
      const pred = work.get(e.predecessor_id);
      if (!pred) continue;
      const from = depPredSide(e.dep_type) === 'start' ? pred.start : pred.end;
      const earliest = shiftDateKeyByBuckets(from, 'day', e.lag_days);
      const own = depSuccSide(e.dep_type) === 'end' ? cur.end : cur.start;
      if (own >= earliest) continue;                        // запас есть → назад не тянем (правило 2)
      const need = diffDaysKey(own, earliest);
      if (need > delta) delta = need;
    }
    if (delta > 0) shiftNode(id, delta, 'dependency');      // нарушение → сдвигаем вперёд
  }

  return [...result.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// S-GANTT-CPM — полный CPM (ES/EF/LS/LF + total float) поверх того же графа.
// Заменяет longest-path DP в GanttTimeline: критическая работа = нулевой запас
// (как MS Project Total Slack / Primavera Total Float), а не «самая длинная цепь».
// Это ловит две параллельные критические цепочки, которые longest-path ронял.
// ─────────────────────────────────────────────────────────────────────────────

const shiftDay = (key: string, n: number): string => shiftDateKeyByBuckets(key, 'day', n);

/**
 * Длительность в календарных днях включительно — та же нормализация, что бары Ганта
 * (UTC-полдень; diffDaysKey использует ту же арифметику). Милстоун (start === end) = 1.
 * Math.max(1, …) — защита от end < start (не должно случаться, но не роняем расчёт).
 * Перенесено из локального durDays в GanttTimeline (дубль удалён).
 */
export function durationDays(start: string, end: string): number {
  return Math.max(1, diffDaysKey(start, end) + 1);
}

export interface CpmNode {
  es: string;               // earliest start (YYYY-MM-DD)
  ef: string;               // earliest finish
  ls: string;               // latest start
  lf: string;               // latest finish
  totalFloat: number;       // календарные дни; = LS − ES = LF − EF (в этой модели всегда ≥ 0)
  critical: boolean;        // totalFloat <= 0
}

/**
 * Прямой/обратный проход CPM с ограничением «не раньше собственной даты»
 * (аналог Start No Earlier Than в MS Project) — даты у нас пользовательские, Гант их
 * не пересчитывает без спроса, поэтому own_start работает нижней границей ES.
 *
 * S-GANTT-DEPTYPES: тип ребра выбирает, КАКОЙ конец предшественника даёт границу и
 * КАКОЙ конец последователя ограничен (depPredSide/depSuccSide). Ограничение на финиш
 * (FF/SF) в проходе по ES выражается вычитанием длительности — и симметрично обратно.
 * Обозначим A(p,e) = ES(p) при predSide='start', иначе EF(p); B(s,e) = LS(s) при
 * succSide='start', иначе LF(s).
 *
 * Прямой:  bound = shiftDay(A(p,e), lag); если succSide='end' — это граница на EF, и в
 *          старт она переводится как shiftDay(bound, −(dur(i) − 1))
 *          ES(i) = max(own_start(i), max по предшественникам этих переведённых границ)
 *          EF(i) = shiftDay(ES(i), dur(i) − 1)
 *          projectFinish PF = max EF по всем узлам топопорядка
 * Обратный: cand = shiftDay(B(s,e), −lag); если predSide='start' — это граница на LS, и
 *          в финиш она переводится как shiftDay(cand, dur(i) − 1)
 *          LF(i) = у стоков PF, иначе min по последователям этих переведённых границ
 *          LS(i) = shiftDay(LF(i), −(dur(i) − 1))
 *          TF(i) = diffDaysKey(ES(i), LS(i)) = LF(i) − EF(i)
 *
 * TF ≥ 0 сохраняется для ВСЕХ четырёх типов (индукция назад по топопорядку: у стока
 * LF = PF ≥ EF; для каждого типа прямой проход гарантирует, что переведённая граница
 * от последователя не меньше EF(i), поскольку LS(s) ≥ ES(s) и LF(s) ≥ EF(s)).
 *
 * ВАЖНО (расхождение с ранним текстом спринта S-GANTT-CPM): в этой модели TF ≥ 0
 * для ВСЕХ узлов — доказуемо (TF = LF − EF; у стоков LF = PF = max EF ≥ EF, дальше
 * индукция назад по топопорядку). FS-нарушение из 1a (пользователь поставил старт
 * последователя раньше earliest) НЕ даёт отрицательный float: ES такого узла просто
 * подтягивается к earliest (own_start < ES), и узел становится критическим (TF = 0),
 * а не «−N». Признак нарушения для тултипа считается отдельно как (ES − own_start) > 0,
 * см. GanttTimeline — это тот же конфликт, что 1a рисует красной стрелкой.
 *
 * Семантика earliest ИДЕНТИЧНА soft-warn 1a и каскаду 1B: shiftDay(pred[predSide], lag),
 * lag=0 ⇒ ограничиваемый конец последователя в день якорного конца предшественника
 * легален. Три места, где считается связь (warn/каскад/CPM), обязаны давать один earliest.
 *
 * Правила графа (те же, что computeCascade): все четыре типа, неизвестный — пропуск;
 * висячие концы пропускаются; узлы вне топопорядка (цикл-мусор) в byId с critical:false,
 * totalFloat:0 (компонент не должен получить undefined). Пустой граф → projectFinish:null.
 *
 * Долг (v1): если одно ребро повешено и на сводную, и на её ребёнка, длительность
 * учитывается дважды и float занижается — как и в каскаде, в v1 не решаем.
 */
export function computeCpm(
  nodes: ScheduleNode[],
  edges: ScheduleEdge[],
): { byId: Map<string, CpmNode>; projectFinish: string | null } {
  const byId = new Map<string, ScheduleNode>(nodes.map((n) => [n.id, n]));

  // Рёбра всех четырёх типов с обоими концами в графе (тот же фильтр, что computeCascade).
  const incoming = new Map<string, ScheduleEdge[]>();
  const outgoing = new Map<string, ScheduleEdge[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const e of edges) {
    if (!KNOWN_DEP_TYPES.has(e.dep_type)) continue;
    if (!byId.has(e.predecessor_id) || !byId.has(e.successor_id)) continue;
    (incoming.get(e.successor_id) ?? incoming.set(e.successor_id, []).get(e.successor_id)!).push(e);
    (outgoing.get(e.predecessor_id) ?? outgoing.set(e.predecessor_id, []).get(e.predecessor_id)!).push(e);
    indeg.set(e.successor_id, (indeg.get(e.successor_id) ?? 0) + 1);
  }

  // Kahn-топосорт (тот же, что computeCascade). Узлы в цикле indeg 0 не достигнут.
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const e of outgoing.get(id) ?? []) {
      const d = (indeg.get(e.successor_id) ?? 0) - 1;
      indeg.set(e.successor_id, d);
      if (d === 0) queue.push(e.successor_id);
    }
  }

  // Прямой проход: ES (нижняя граница = own_start), EF, projectFinish.
  const es = new Map<string, string>();
  const ef = new Map<string, string>();
  let projectFinish: string | null = null;
  for (const id of topo) {
    const own = byId.get(id)!;
    const dur = durationDays(own.start, own.end);
    let start = own.start;
    for (const e of incoming.get(id) ?? []) {
      const predEs = es.get(e.predecessor_id);
      const predEf = ef.get(e.predecessor_id);
      if (!predEs || !predEf) continue;                     // предшественник в цикле → пропуск
      const from = depPredSide(e.dep_type) === 'start' ? predEs : predEf;
      const bound = shiftDay(from, e.lag_days);             // earliest от этого предшественника
      // FF/SF ограничивают ФИНИШ — переводим границу в старт вычитанием длительности
      const cand = depSuccSide(e.dep_type) === 'end' ? shiftDay(bound, -(dur - 1)) : bound;
      if (cand > start) start = cand;                       // ключи YYYY-MM-DD сравнимы хронологически
    }
    const finish = shiftDay(start, dur - 1);
    es.set(id, start);
    ef.set(id, finish);
    if (projectFinish === null || finish > projectFinish) projectFinish = finish;
  }

  // Обратный проход: LF (у стоков = PF), LS, total float, critical.
  const result = new Map<string, CpmNode>();
  const ls = new Map<string, string>();
  const lf = new Map<string, string>();                     // нужен последователям типа FF/SF
  for (let k = topo.length - 1; k >= 0; k -= 1) {
    const id = topo[k];
    const own = byId.get(id)!;
    const dur = durationDays(own.start, own.end);
    let finish: string | null = null;
    for (const e of outgoing.get(id) ?? []) {
      const succLs = ls.get(e.successor_id);
      const succLf = lf.get(e.successor_id);
      if (!succLs || !succLf) continue;                     // последователь в цикле → пропуск
      const to = depSuccSide(e.dep_type) === 'end' ? succLf : succLs;
      const bound = shiftDay(to, -e.lag_days);
      // SS/SF ограничивают СТАРТ предшественника — переводим границу в финиш
      const cand = depPredSide(e.dep_type) === 'start' ? shiftDay(bound, dur - 1) : bound;
      if (finish === null || cand < finish) finish = cand;
    }
    if (finish === null) finish = projectFinish ?? own.end; // сток → горизонт проекта
    // S-GANTT-DEPTYPES: LF не может уйти за горизонт проекта. Для SS/SF связь держит
    // СТАРТ предшественника, и перевод границы в финиш (+dur−1) способен занести LF
    // дальше PF — тогда у задачи, задающей горизонт, появился бы фиктивный запас и
    // критический путь исчез бы вовсе. Для FS/FF кап — no-op (их LF ≤ PF по индукции),
    // поэтому поведение до спринта не меняется. TF ≥ 0 сохраняется: PF ≥ EF(i).
    //
    // ЦЕНА КАПА (осознанный размен v1, не баг — НЕ снимать не разобравшись): кап
    // ЗАНИЖАЕТ запас. У предшественника с одними лишь SS/SF-последователями связь не
    // держит финиш вовсе, поэтому его настоящий LF законно больше PF; после капа
    // LF = PF, TF схлопывается к нулю и задача выглядит критической, реально имея
    // запас по финишу. Ошибка КОНСЕРВАТИВНАЯ — перебор в критическом пути, а не
    // пропуск критической работы, — и для v1 это дешевле исчезающего крит-пути.
    // Правильное лечение (следующий спринт, не «снять кап»): считать PF по горизонту
    // проекта отдельно от сетевых границ либо вводить отдельный free float.
    else if (projectFinish !== null && finish > projectFinish) finish = projectFinish;
    const lateStart = shiftDay(finish, -(dur - 1));
    ls.set(id, lateStart);
    lf.set(id, finish);
    const earlyStart = es.get(id)!;
    const totalFloat = diffDaysKey(earlyStart, lateStart);  // LS − ES (= LF − EF)
    result.set(id, {
      es: earlyStart,
      ef: ef.get(id)!,
      ls: lateStart,
      lf: finish,
      totalFloat,
      critical: totalFloat <= 0,
    });
  }

  // Узлы вне топопорядка (цикл-мусор) — присутствуют, но не критические (правило 7).
  for (const n of nodes) {
    if (result.has(n.id)) continue;
    result.set(n.id, { es: n.start, ef: n.end, ls: n.start, lf: n.end, totalFloat: 0, critical: false });
  }

  return { byId: result, projectFinish };
}

// ─────────────────────────────────────────────────────────────────────────────
// S-GANTT-BASELINE-1 — горизонт оси Ганта. Чистая функция (тестируемо вне React):
// min/max по спанам задач, расширенные спанами выбранного слепка. Слепок расширяет
// ось, иначе перенесённый далеко от плана призрак не влезает в бакеты и падал бы в
// первую колонку. Берём план ТОЛЬКО для переданных (видимых) задач — иначе фильтр
// «мои задачи» перестал бы сужать ось (слепок держит весь проект).
// ─────────────────────────────────────────────────────────────────────────────

export interface HorizonItem {
  id: string;
  start: string;              // YYYY-MM-DD
  end: string;
}

export function computeHorizon(
  tasks: HorizonItem[],
  planByTask: Map<string, { start: string; end: string }> | null,
): { min: string; max: string } | null {
  if (tasks.length === 0) return null;              // ось из задач не построить — ветку решает вызывающий
  let min = tasks[0].start;
  let max = tasks[0].end;
  for (const t of tasks) {
    if (t.start < min) min = t.start;
    if (t.end > max) max = t.end;
  }
  if (planByTask) {
    for (const t of tasks) {
      const plan = planByTask.get(t.id);
      if (!plan) continue;                          // задача без плана — только собственный спан
      if (plan.start < min) min = plan.start;
      if (plan.end > max) max = plan.end;
    }
  }
  return { min, max };
}
