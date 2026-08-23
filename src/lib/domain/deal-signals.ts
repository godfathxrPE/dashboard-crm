import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import type { StageTimeGauge } from '@/lib/domain/stage-norm';
import { diffDaysKey, localDateKey } from '@/lib/utils/date-helpers';
import type { DealStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-HEALTH-V2-1: здоровье сделки как набор ИМЕНОВАННЫХ сигналов.
//
// Заменяет `calculateDealHealth` (0–8), у которого было два дефекта, а не
// «бедность»: фактор `lastContact` читал несуществующую колонку
// `projects.last_contact_date` (потолок здоровья 6 из 8 при пороге «зелёная» 6),
// а фактор дедлайна был инвертирован — близкий срок РЕЗАЛ балл, а отсутствие
// дедлайна давало максимум. Здесь вместо одного непрозрачного числа — сигналы
// с вердиктом, причиной и действием (паттерн Monday Deal Insights).
//
// ⚠️ Ортогонально `getDealHealth` («есть ли следующий шаг») — тот НЕ заменяется
// и НЕ дублируется: сигнал `next_step` его ЗОВЁТ. Третьей формулы в проекте
// быть не должно.
//
// ⚠️ Ортогонально `deal-completeness.ts` («что не заполнено»). Сигналов
// «нет бюджета / нет контакта» здесь нет намеренно: их несёт бейдж полноты
// рядом — правило «Два источника одного факта — вес и подпись, не слияние».
//
// Чистая логика: без React, без Supabase, `now` — параметр с дефолтом (без него
// функция недетерминирована и не тестируется — грабля `getNextActionOverdueDays`).
// ═══════════════════════════════════════════════════════

export type SignalState = 'ok' | 'warn' | 'bad' | 'na';
export type DealVerdict = 'new' | 'ok' | 'attention' | 'rotting';

export type SignalKey =
  | 'next_step' | 'stage_dwell' | 'deadline' | 'silence' | 'single_threaded';

export interface DealSignal {
  key: SignalKey;
  /** Короткая формулировка ПРОБЛЕМЫ, если state !== 'ok' («Шаг просрочен на 3 дн.»). */
  label: string;
  state: SignalState;
  /** Что это значит и что сделать — одна строка, попадает под label в раскрытии. */
  detail: string;
  /** Подпись кнопки действия; null — действия нет (state 'ok'/'na'). */
  cta: string | null;
}

export interface DealSignalContext {
  /** Датчик стадии из stageTimeGauge — тот же, что рисует заливку кокпита. */
  gauge: StageTimeGauge | null;
  /** phase_group текущей стадии — гасит single_threaded на ранних стадиях. */
  phaseGroup: string | null;
  /** Число стейкхолдеров сделки (включая основной контакт). */
  stakeholderCount: number | null;
  /** ISO последней записи activity_log по сделке; null — активности не было. */
  lastActivityAt: string | null;
}

export interface DealSignalThresholds {
  /** Дней «льготы» новой сделке: пустые поля ещё не повод для тревоги. */
  graceDays: number;
  /** Дней тишины до сигнала 'bad'; половина порога — 'warn'. */
  silenceDays: number;
  /** Дней до дедлайна, начиная с которых — 'warn' (просрочка — всегда 'bad'). */
  deadlineWarnDays: number;
}

/**
 * Дефолты сверены с живой БД 23.08 (10 открытых сделок `type='client'`), чтобы
 * ни один сигнал не был мёртвым и ни один не горел «у всех»:
 *   graceDays 5        → 2 из 10 в льготе (больше — grace станет фоном);
 *   silenceDays 10     → 6 из 10 (средняя тишина 8 дн.; при 14 — ноль срабатываний);
 *   deadlineWarnDays 7 → часть из 8 сделок с дедлайном ближе 30 дн.
 * Мёртвый сигнал не отличим от исправного, пока в него не ткнёшь.
 */
export const DEFAULT_SIGNAL_THRESHOLDS: DealSignalThresholds = {
  graceDays: 5,
  silenceDays: 10,
  deadlineWarnDays: 7,
};

export interface DealSignalsResult {
  verdict: DealVerdict;
  /** Все применимые сигналы, отсортированы: bad → warn → ok; 'na' отфильтрованы. */
  signals: DealSignal[];
  /** Первый bad, иначе первый warn, иначе null — «топ-причина» для свёрнутого вида. */
  top: DealSignal | null;
}

/**
 * Вердикт: глиф обязателен — статус кодируется ФОРМОЙ и цветом, не только цветом
 * (при дейтеранопии красный↔жёлтый неразличимы). Тот же приём, что в снятом
 * `HealthDot` и в живом `DeliveryHealthDot`.
 */
export const VERDICT_CONFIG: Record<DealVerdict, { label: string; glyph: string }> = {
  new:       { label: 'Новая',            glyph: '○' },
  ok:        { label: 'В порядке',        glyph: '●' },
  attention: { label: 'Требует внимания', glyph: '◐' },
  rotting:   { label: 'Киснет',           glyph: '▲' },
};

/**
 * Фазы, на которых сделку уже нельзя вести через одного человека. На
 * `attraction` один контакт — норма (по живой БД 8 из 10 открытых сделок имеют
 * ≤1 стейкхолдера, и сигнал «на всех» — это не сигнал; с гейтом загорится у 4).
 * Паттерн «mute сигналов per status», Monday.
 */
const MULTI_THREAD_PHASES = new Set(['working', 'approval', 'closing']);

interface ProjectForSignals {
  status?: DealStatus | null;
  next_step?: string | null;
  next_action_date?: string | null;
  deadline?: string | null;
  created_at?: string | null;
}

function plural(days: number): string {
  return `${days} дн.`;
}

/** Сигнал «следующий шаг» — переиспользует `getDealHealth`, а не повторяет его. */
function nextStepSignal(project: ProjectForSignals, now: Date): DealSignal {
  const health = getDealHealth(project);
  if (health === 'overdue-action') {
    const days = project.next_action_date
      ? getNextActionOverdueDays(project.next_action_date, now)
      : 0;
    return {
      key: 'next_step',
      label: `Шаг просрочен на ${plural(days)}`,
      state: 'bad',
      detail: 'Дата следующего шага в прошлом — сделка стоит на месте.',
      cta: 'К шагу',
    };
  }
  if (health === 'no-action') {
    // ⚠️ `getDealHealth` отдаёт 'no-action' и на пустом `next_step`, и на пустой
    // `next_action_date` — состояние одно, а ПРИЧИНЫ разные, и подпись обязана их
    // различать. Найдено на смоке: у сделки «М Д М» шаг был написан словами, дата
    // не стояла, а панель утверждала «шаг не назначен» — сигнал, который врёт про
    // повод, чинить не идут.
    // ⚠️ «Шаг есть, даты нет» — 'warn', а НЕ 'bad': по той же оси `DealHealthDot`
    // рисует no-action жёлтой обводкой, а просрочку — красной заливкой, и с 'bad'
    // список показывал сделку жёлтой, а карточка — «Киснет». Смысловая граница та
    // же: шаг написан ⇒ продавец знает, ЧТО делать, — это неполнота записи, а не
    // остановка работы. Пустой шаг остаётся 'bad'.
    const hasStep = Boolean(project.next_step?.trim());
    return {
      key: 'next_step',
      label: hasStep ? 'У следующего шага нет даты' : 'Следующий шаг не назначен',
      state: hasStep ? 'warn' : 'bad',
      detail: hasStep
        ? 'Шаг без даты не всплывёт ни в очереди дня, ни в напоминаниях.'
        : 'У активной сделки всегда должен быть шаг с датой — иначе о ней забудут.',
      cta: hasStep ? 'Поставить дату' : 'Назначить шаг',
    };
  }
  return {
    key: 'next_step',
    label: 'Следующий шаг назначен',
    state: 'ok',
    detail: 'Дата шага в будущем.',
    cta: null,
  };
}

function stageDwellSignal(ctx: DealSignalContext): DealSignal {
  const gauge = ctx.gauge;
  if (!gauge || gauge.days == null || gauge.norm == null) {
    return { key: 'stage_dwell', label: '', state: 'na', detail: '', cta: null };
  }
  if (gauge.state === 'over') {
    return {
      key: 'stage_dwell',
      label: `В стадии ${plural(gauge.days)} при норме ${gauge.norm}`,
      state: 'bad',
      // Кнопки нет намеренно: двигать стадию — решение, а не «починка сигнала».
      detail: 'Норма стадии израсходована — либо двигать по воронке, либо пересмотреть оценку.',
      cta: null,
    };
  }
  if (gauge.state === 'warn') {
    return {
      key: 'stage_dwell',
      label: `В стадии ${gauge.days} дн. из ${gauge.norm} по норме`,
      state: 'warn',
      detail: 'Норма стадии на исходе.',
      cta: null,
    };
  }
  return {
    key: 'stage_dwell',
    label: `В стадии ${gauge.days} дн. из ${gauge.norm} по норме`,
    state: 'ok',
    detail: 'Стадия в пределах нормы.',
    cta: null,
  };
}

function deadlineSignal(
  project: ProjectForSignals,
  thresholds: DealSignalThresholds,
  now: Date,
): DealSignal {
  // Дедлайна нет ⇒ 'na', а НЕ «хорошо» и не «плохо»: пустое поле — это полнота
  // (её несёт бейдж рядом), а не динамика сделки. Прежняя формула выдавала за
  // отсутствие дедлайна максимум балла — ровно инверсия смысла.
  if (!project.deadline) {
    return { key: 'deadline', label: '', state: 'na', detail: '', cta: null };
  }
  // Дни считаются КЛЮЧАМИ ДНЯ (нормализация на UTC-полдне): разница мс между
  // локальной полуночью и UTC-полуночью цели съедала сутки в MSK (S-TAILS-1).
  // `slice(0, 10)` — страховка формата: колонка `date`, но ключ обязан быть
  // голым YYYY-MM-DD, иначе `Date.parse('…T00:00:00ZT12:00:00Z')` даёт NaN.
  const daysLeft = diffDaysKey(localDateKey(now), project.deadline.slice(0, 10));
  if (Number.isNaN(daysLeft)) {
    return { key: 'deadline', label: '', state: 'na', detail: '', cta: null };
  }

  if (daysLeft < 0) {
    return {
      key: 'deadline',
      label: `Дедлайн просрочен на ${plural(-daysLeft)}`,
      state: 'bad',
      detail: 'Срок прошёл — перенести дату или закрыть сделку.',
      cta: 'К дедлайну',
    };
  }
  if (daysLeft <= thresholds.deadlineWarnDays) {
    return {
      key: 'deadline',
      label: `До дедлайна ${plural(daysLeft)}`,
      state: 'warn',
      detail: 'Срок близко — проверить, что всё для закрытия готово.',
      cta: 'К дедлайну',
    };
  }
  return {
    key: 'deadline',
    label: `До дедлайна ${plural(daysLeft)}`,
    state: 'ok',
    detail: 'Срок не горит.',
    cta: null,
  };
}

function silenceSignal(
  project: ProjectForSignals,
  ctx: DealSignalContext,
  thresholds: DealSignalThresholds,
  now: Date,
): DealSignal {
  // Тишина считается от created_at, когда журнал пуст: иначе сделка без единой
  // записи (таких 2 из 10 в живой БД) молчала бы вечно и сигнал был бы мёртв.
  const since = ctx.lastActivityAt ?? project.created_at ?? null;
  if (!since) {
    return { key: 'silence', label: '', state: 'na', detail: '', cta: null };
  }
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) {
    return { key: 'silence', label: '', state: 'na', detail: '', cta: null };
  }
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86400000));

  if (days > thresholds.silenceDays) {
    return {
      key: 'silence',
      label: `Тишина ${plural(days)}`,
      state: 'bad',
      detail: `По сделке нет активности дольше порога (${thresholds.silenceDays} дн.).`,
      cta: 'К активности',
    };
  }
  if (days > thresholds.silenceDays / 2) {
    return {
      key: 'silence',
      label: `Последняя активность ${plural(days)} назад`,
      state: 'warn',
      detail: 'Пора напомнить о себе, пока сделка не остыла.',
      cta: 'К активности',
    };
  }
  return {
    key: 'silence',
    label: days === 0 ? 'Активность сегодня' : `Последняя активность ${plural(days)} назад`,
    state: 'ok',
    detail: 'По сделке идёт работа.',
    cta: null,
  };
}

function singleThreadedSignal(ctx: DealSignalContext): DealSignal {
  // null — «не загрузились», а не «ноль»: сигнал не должен загораться на
  // спиннере (тот же принцип, что у гейта кокпита — пустой ответ и «ещё не
  // спросили» неразличимы, поэтому не рендерим).
  if (ctx.stakeholderCount == null) {
    return { key: 'single_threaded', label: '', state: 'na', detail: '', cta: null };
  }
  if (ctx.stakeholderCount > 1) {
    return {
      key: 'single_threaded',
      label: `Со стороны клиента ${ctx.stakeholderCount} участника`,
      state: 'ok',
      detail: 'Сделка не держится на одном человеке.',
      cta: null,
    };
  }
  if (!ctx.phaseGroup || !MULTI_THREAD_PHASES.has(ctx.phaseGroup)) {
    return { key: 'single_threaded', label: '', state: 'na', detail: '', cta: null };
  }
  return {
    key: 'single_threaded',
    label: 'Вся работа на одном человеке',
    state: 'warn',
    detail: 'На этой стадии один контакт — риск: уйдёт он, уйдёт и сделка.',
    cta: 'К участникам',
  };
}

const STATE_ORDER: Record<Exclude<SignalState, 'na'>, number> = { bad: 0, warn: 1, ok: 2 };

/**
 * Сигналы сделки и вердикт по ним.
 *
 * @param project    поля сделки (status/next_step/next_action_date/deadline/created_at)
 * @param ctx        контекст, который карточка добирает хуками — домен ничего не запрашивает сам
 * @param thresholds пороги организации (`useDealSignalThresholds()`)
 * @param now        точка отсчёта; параметр с дефолтом — иначе не тестируется
 */
export function getDealSignals(
  project: ProjectForSignals,
  ctx: DealSignalContext,
  thresholds: DealSignalThresholds = DEFAULT_SIGNAL_THRESHOLDS,
  now: Date = new Date(),
): DealSignalsResult {
  // Терминальная сделка: «тишина 40 дней» у выигранной — шум. Тот же принцип,
  // что у `isDeliveryTerminal` и у скрытого счётчика дней стадии в кокпите.
  if (project.status && project.status !== 'open') {
    return { verdict: 'ok', signals: [], top: null };
  }

  const all: DealSignal[] = [
    nextStepSignal(project, now),
    stageDwellSignal(ctx),
    deadlineSignal(project, thresholds, now),
    silenceSignal(project, ctx, thresholds, now),
    singleThreadedSignal(ctx),
  ];

  const signals = all
    .filter((s) => s.state !== 'na')
    .sort((a, b) => STATE_ORDER[a.state as Exclude<SignalState, 'na'>]
      - STATE_ORDER[b.state as Exclude<SignalState, 'na'>]);

  const firstBad = signals.find((s) => s.state === 'bad') ?? null;
  const firstWarn = signals.find((s) => s.state === 'warn') ?? null;
  const top = firstBad ?? firstWarn;

  // Порядок ветвлений важен: 'bad' ПОБЕЖДАЕТ grace-период. Новая сделка с
  // просроченным шагом — уже проблема, а не «ещё осваиваемся»; grace гасит
  // только жёлтую тревогу от пустоты.
  let verdict: DealVerdict;
  if (firstBad) verdict = 'rotting';
  else if (isWithinGrace(project, thresholds, now)) verdict = 'new';
  else if (firstWarn) verdict = 'attention';
  else verdict = 'ok';

  return { verdict, signals, top };
}

function isWithinGrace(
  project: ProjectForSignals,
  thresholds: DealSignalThresholds,
  now: Date,
): boolean {
  if (!project.created_at) return false;
  const t = new Date(project.created_at).getTime();
  if (Number.isNaN(t)) return false;
  const age = Math.floor((now.getTime() - t) / 86400000);
  return age < thresholds.graceDays;
}
