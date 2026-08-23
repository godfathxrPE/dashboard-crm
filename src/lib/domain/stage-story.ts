// ═══════════════════════════════════════════════════════
// S-STAGE-STORY-1: траектория сделки по стадиям.
//
// Чистая логика: «сейчас» параметром, ноль запросов, юнит-тесты в tests/unit.
//
// ⚠️ Источник — таблица `stage_transitions` (триггер `trg_zy_log_stage_transition`,
// с 27.07), а НЕ `activity_log`: в логе за один смысл отвечают два типа событий
// (legacy `stage_change` до 14.07 и `stage_changed` после), и смешивать их в
// расчёте длительностей нельзя. Перечисление изменений полей остаётся в ленте
// Активности (087) — здесь считается то, чего в ленте нет: длительность каждого
// захода в стадию, суммарное время по стадии и число возвратов.
//
// ⚠️ Журнал НЕ пишет вход в первую стадию (строк с `from_stage_id is null` — 0),
// поэтому первый сегмент открывается `projects.created_at`, а его стадия берётся
// из `from_stage_id` первой записи. Без этого история сделки начиналась бы с
// первого перехода и теряла самый длинный отрезок.
// ═══════════════════════════════════════════════════════

/** Строка журнала переходов. Колонка времени — `changed_at`, НЕ `created_at`. */
export interface StageTransitionRow {
  id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  changed_at: string;
}

/** Отрезок жизни сделки в одной стадии. */
export interface StageSegment {
  stageId: string;
  stageName: string;
  enteredAt: string;
  /** null — сделка в этой стадии сейчас. */
  leftAt: string | null;
  days: number;
  /** Сегмент открыт `created_at` проекта, а не записью журнала. */
  fromCreation: boolean;
  /** Второй и последующий заход в ту же стадию. */
  isRevisit: boolean;
  actorId: string | null;
}

export interface StageStory {
  segments: StageSegment[]; // хронологически, сверху вниз — от старых к новым
  /** Суммарно дней по стадии за ВСЕ заходы: stageId → дни (Salesforce cumulative time). */
  totalByStage: Record<string, number>;
  /** Сколько раз сделка возвращалась в уже пройденную стадию. */
  revisits: number;
  /**
   * Возраст сделки в днях: `created_at` → «сейчас».
   *
   * ⚠️ Сегменты сплошные и последний открыт до now, поэтому сумма их `days` сходится
   * с `ageDays` — но НЕ бит в бит: каждый сегмент округляется floor'ом по отдельности,
   * и остатки суток теряются на каждой границе (у сделки с 6 сегментами наблюдалось
   * 39 против 40). Расхождение всегда в меньшую сторону и ограничено числом границ;
   * заметный разрыв означает дефект расчёта, единица — нет.
   *
   * ⚠️ Вариант «до последнего перехода» отвергнут: последний сегмент не закрывается
   * никогда, даже у выигранной сделки (переход в won-стадию тоже открывает сегмент),
   * поэтому такая величина была бы меньше суммы сегментов ровно на длину текущей
   * стадии и читалась бы как ошибка данных.
   */
  ageDays: number;
}

export interface StageStoryOptions {
  createdAt: string;
  currentStageId: string | null;
  stageName: (id: string) => string;
  now?: Date;
}

/**
 * Дни между двумя моментами.
 *
 * ⚠️ floor от разницы мс — ровно то же правило, что в `getStageAging` и
 * `stageTimeGauge`. Любое другое округление развело бы сводку истории и датчик
 * кокпита на сутки на границе, и расхождение читалось бы как дефект данных.
 */
function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 86400000));
}

/** Валидная метка времени в мс или null (битую строку не считаем нулём эпохи). */
function msOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Сегменты стадий, суммарное время и счётчик возвратов.
 *
 * Пустой журнал — не пустой результат: у 11 сделок из 17 переходов нет вовсе,
 * и для них строится один открытый сегмент от `createdAt` на текущей стадии.
 */
export function buildStageStory(
  rows: StageTransitionRow[],
  opts: StageStoryOptions,
): StageStory {
  const { createdAt, currentStageId, stageName } = opts;
  const nowMs = (opts.now ?? new Date()).getTime();
  const createdMs = msOrNull(createdAt) ?? nowMs;

  // Хук отдаёт `.order('changed_at')`, но сортировка обязана жить здесь: домен
  // не вправе рассчитывать на порядок входа (тот же приём, что в других чистых
  // модулях — правило проверяется тестом «обратный порядок даёт тот же результат»).
  const sorted = rows
    .filter((r) => msOrNull(r.changed_at) !== null)
    .slice()
    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());

  const segments: StageSegment[] = [];
  const seen = new Set<string>();
  let revisits = 0;

  /** Открыть сегмент, пометив повторный заход. Закрывает его следующий вызов. */
  function open(stageId: string, enteredAt: string, fromCreation: boolean, actorId: string | null) {
    const isRevisit = seen.has(stageId);
    if (isRevisit) revisits += 1;
    seen.add(stageId);
    segments.push({
      stageId,
      stageName: stageName(stageId),
      enteredAt,
      leftAt: null,
      days: 0,
      fromCreation,
      isRevisit,
      actorId,
    });
  }

  if (sorted.length === 0) {
    // Переходов нет: единственный сегмент — текущая стадия от создания сделки.
    // Стадии тоже нет (проект без pipeline) — истории не существует.
    if (currentStageId) open(currentStageId, createdAt, true, null);
  } else {
    // Первый сегмент — стадия, ИЗ которой сделка ушла первым переходом, открытая
    // датой создания. `from_stage_id === null` теоретически невозможен (0 строк на
    // проде), но если он всё-таки придёт — сегмент пропускается, а не рисуется
    // стадией «—» на месяц жизни сделки.
    const firstFrom = sorted[0].from_stage_id;
    if (firstFrom) open(firstFrom, createdAt, true, null);

    for (const row of sorted) {
      const last = segments[segments.length - 1];
      if (last && last.leftAt === null) last.leftAt = row.changed_at;
      open(row.to_stage_id, row.changed_at, false, row.changed_by);
    }
  }

  // Длительности: закрытый сегмент — до `leftAt`, открытый (он всегда последний) —
  // до `now`.
  for (const seg of segments) {
    const from = msOrNull(seg.enteredAt) ?? createdMs;
    const to = seg.leftAt ? (msOrNull(seg.leftAt) ?? nowMs) : nowMs;
    seg.days = daysBetween(from, to);
  }

  const totalByStage: Record<string, number> = {};
  for (const seg of segments) {
    totalByStage[seg.stageId] = (totalByStage[seg.stageId] ?? 0) + seg.days;
  }

  const ageDays = daysBetween(createdMs, nowMs);

  return { segments, totalByStage, revisits, ageDays };
}

/** Стадии, в которые сделка заходила больше одного раза — только у них показываем сумму. */
export function revisitedStageIds(story: StageStory): Set<string> {
  const counts = new Map<string, number>();
  for (const seg of story.segments) counts.set(seg.stageId, (counts.get(seg.stageId) ?? 0) + 1);
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}

/** Сколько заходов было в стадию — для подписи «12 дн. суммарно за 2 захода». */
export function visitCount(story: StageStory, stageId: string): number {
  return story.segments.filter((s) => s.stageId === stageId).length;
}
