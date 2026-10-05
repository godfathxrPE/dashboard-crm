import { diffDaysKey, mskDayCaption } from '@/lib/utils/date-helpers';
import { pluralRu } from '@/lib/utils/plural';
import { formatBudget } from '@/lib/validators/project';
import { quoteValidity } from '@/lib/domain/quote-validity';
import { TODAY_GROUP_LABELS } from '@/lib/constants/today-groups';
import type { Quote } from '@/types/entities';
import type { QuoteStatus } from '@/lib/validators/quote';
import type { TouchKind } from '@/lib/domain/deal-touch';
import type { MoveSlot, PlannedEvent, RiskSignal } from '@/lib/domain/today-deals';
import type { DecideClock } from '@/lib/domain/decide-clock';
import type { TodayDealView } from '@/lib/domain/today-model';

// ═══════════════════════════════════════════════════════
// S-TODAY-V3-SCREEN-1: тексты экрана «Сегодня».
//
// Что печатать, решает модель (`today-model.ts` → `after.kind`, `slot`, `cls`);
// здесь только слова. Компоненты зовут эти функции и ничего не выбирают сами —
// иначе строка и карточка одной сделки однажды заговорят по-разному.
//
// Ключ дня 'YYYY-MM-DD' в `mskDayCaption` — UTC-полночь, то есть 03:00 МСК того же
// дня: подпись не съезжает на вчера.
// ═══════════════════════════════════════════════════════

/** «30 сен». */
export function dayText(key: string): string {
  return mskDayCaption(key);
}

/**
 * «Дедлайн сделки · 14 авг 2027» / «Дедлайн сделки был 30 сент».
 * Год печатается, когда он не текущий: дата без года читается как этот год.
 */
export function deadlineText(key: string, todayKey: string): string {
  const day = key.slice(0, 10);
  const year = day.slice(0, 4) !== todayKey.slice(0, 4) ? ` ${day.slice(0, 4)}` : '';
  return day < todayKey
    ? `Дедлайн сделки был ${dayText(day)}${year}`
    : `Дедлайн сделки · ${dayText(day)}${year}`;
}

/** «пт 9 окт» — Intl ставит запятую после дня недели, в строке она лишняя. */
export function dayWeekdayText(key: string): string {
  return mskDayCaption(key, { weekday: true }).replace(',', '');
}

export const TOUCH_KIND_WORDS: Record<TouchKind, string> = {
  note: 'заметка',
  stage: 'смена стадии',
  task: 'закрыта задача',
  call: 'звонок',
  meeting: 'встреча',
};

/** «КП истекло 18 сен · задача с 15 сен». */
export function signalsText(signals: readonly RiskSignal[]): string {
  return signals
    .map((s) => {
      if (s.key === 'quote_expired') return `КП истекло ${dayText(s.since)}`;
      if (s.key === 'task_overdue') return `задача с ${dayText(s.since)}`;
      return `звонок с ${dayText(s.since)}`;
    })
    .join(' · ');
}

/** «встреча 8 окт, 14:00» / «звонок 5 окт». */
export function plannedText(p: PlannedEvent): string {
  const word = p.kind === 'meeting' ? 'встреча' : 'звонок';
  return `${word} ${dayText(p.dateKey)}${p.time ? `, ${p.time}` : ''}`;
}

/** Вторая строка колонки срока — по `view.after.kind`. */
export function afterText(view: TodayDealView): string {
  const a = view.after;
  const touch = a.dateKey && a.touchKind ? `${dayText(a.dateKey)} — ${TOUCH_KIND_WORDS[a.touchKind]}` : '';
  switch (a.kind) {
    case 'silence_after_due':
      return 'после срока тишина';
    case 'touched_after_due':
      return `после срока: ${touch}`;
    case 'silence_since':
      return a.dateKey ? `тишина с ${dayText(a.dateKey)}` : 'тишина';
    case 'no_touches':
      return a.wholeLife ? 'касаний не было' : 'давно без касаний';
    case 'last_touch':
      return `касание ${touch}`;
    case 'signals':
      return signalsText(view.signals);
    case 'planned':
      return view.planned ? plannedText(view.planned) : '';
  }
}

/** Первая строка колонки срока: «срок 30 сен» + «3 дн.» / «шаг пт 9 окт» / «шага нет». */
export function dueText(view: TodayDealView): { label: string; days: string | null } {
  const { cls, source } = view;
  if (cls.overdueDays !== null && source.next_action_date) {
    return { label: `срок ${dayText(source.next_action_date)}`, days: `${cls.overdueDays} дн.` };
  }
  if (cls.stepAhead && source.next_action_date) {
    return { label: `шаг ${dayWeekdayText(source.next_action_date)}`, days: null };
  }
  return { label: 'шага нет', days: null };
}

const SLOT_LEADS: Record<MoveSlot, string> = {
  assigned: 'Назначено на сегодня.',
  fresh: 'Свежий срыв.',
  biggest: 'Крупнейшая сумма без шага.',
  fill: 'Добор.',
};

export interface MoveWhy {
  lead: string;
  /** Срок: текст, и отдельно «N дн.» — его красит только свежий срыв. */
  due: { text: string; days: string | null; daysTail: string } | null;
  facts: string[];
}

/**
 * «Почему здесь» карточки хода: слот жирным, дальше факты через « · ».
 * «перенесён N раз» — при N ≥ 2, как в `DealNextStep`.
 */
export function moveWhy(view: TodayDealView, slot: MoveSlot, stepMoves: number): MoveWhy {
  const { cls, source } = view;
  const facts: string[] = [];
  let due: MoveWhy['due'] = null;

  if (slot === 'assigned') {
    const time = cls.assignedToday?.time;
    if (time) facts.push(time);
  } else if (cls.overdueDays !== null && source.next_action_date) {
    due = cls.group === 'fresh'
      ? { text: `Срок был ${dayText(source.next_action_date)}, `, days: `${cls.overdueDays} дн.`, daysTail: ' назад' }
      : { text: `Срок был ${dayText(source.next_action_date)}`, days: null, daysTail: '' };
  } else if (cls.noStep) {
    due = { text: 'Шага нет', days: null, daysTail: '' };
  }

  // «после срока тишина» уже сказано словами «N дн. назад» — второй раз не повторяем.
  if (view.after.kind !== 'silence_after_due') {
    const after = afterText(view);
    if (after) facts.push(after);
  }
  if (source.stage) facts.push(source.stage.name);
  if (stepMoves >= 2) facts.push(`перенесён ${stepMoves} ${pluralRu(stepMoves, 'раз', 'раза', 'раз')}`);

  return { lead: SLOT_LEADS[slot], due, facts };
}

/** «две — в ходах наверху». */
export function inMovesText(n: number): string {
  const word = n === 1 ? 'одна' : n === 2 ? 'две' : String(n);
  return `${word} — в ходах наверху`;
}

/** Имена через `sep`; больше пяти — «и ещё N». */
export function namesText(names: readonly string[], sep = ', ', limit = 5): string {
  if (names.length <= limit) return names.join(sep);
  return `${names.slice(0, limit).join(sep)} и ещё ${names.length - limit}`;
}

/** «Стройпарк — пн 5 окт, 11:00». */
export function planItemText(view: TodayDealView): string {
  const { cls, source, planned } = view;
  const dayKey = cls.stepAhead && source.next_action_date ? source.next_action_date : planned?.dateKey ?? null;
  if (!dayKey) return source.name;
  const time = planned && planned.dateKey === dayKey ? planned.time : null;
  return `${source.name} — ${dayWeekdayText(dayKey)}${time ? `, ${time}` : ''}`;
}

/** Итог записи хода — в объёме, нужном подписи карточки. */
export interface DoneOutcome {
  outcome: 'written' | 'moved' | 'cleared';
  dateKey: string | null;
  moveCount: number;
}

/**
 * Подпись сделанного хода (макет, кадр 5). Есть итог записи в памяти экрана — по нему;
 * после перезагрузки итога нет, и подпись берётся из текущего состояния сделки:
 * «Перенесён на …» живёт только до перезагрузки.
 */
export function doneText(view: TodayDealView, result: DoneOutcome | null): string {
  if (result?.outcome === 'moved' && result.dateKey) {
    return `Перенесён на ${dayWeekdayText(result.dateKey)} · в сделке «перенесён ${result.moveCount} ${pluralRu(result.moveCount, 'раз', 'раза', 'раз')}»`;
  }
  if (result?.outcome === 'written' && result.dateKey) return `Записано в сделку · шаг ${dayWeekdayText(result.dateKey)}`;
  if (result?.outcome === 'cleared') return 'Шаг закрыт · сделка осталась без шага';
  const { cls, source } = view;
  return cls.stepAhead && source.next_action_date
    ? `Записано в сделку · шаг ${dayWeekdayText(source.next_action_date)}`
    : 'Шаг закрыт · сделка осталась без шага';
}

// ── S-TODAY-FOCUS-3: подпись под кольцом плитки хода (спека, §6) ──

/**
 * «15 окт — в «Решить судьбу»» / «с 3 окт — в «Решить судьбу»» / «назначено на сегодня,
 * 14:00» / «шаг пт 9 окт» / «встреча 9 окт, 11:00». Сделанный ход плитка подписывает
 * `doneText` — сюда он не приходит.
 */
export function clockCaption(clock: DecideClock, view: TodayDealView): string {
  if (clock.tipKey && (clock.state === 'calm' || clock.state === 'warn')) {
    return `${dayText(clock.tipKey)} — в «Решить судьбу»`;
  }
  if (clock.tipKey && clock.state === 'over') return `с ${dayText(clock.tipKey)} — в «Решить судьбу»`;
  if (clock.state !== 'none') return '';
  const { cls, source } = view;
  if (cls.assignedToday) {
    return cls.assignedToday.time ? `назначено на сегодня, ${cls.assignedToday.time}` : 'назначено на сегодня';
  }
  if (cls.stepAhead && source.next_action_date) return `шаг ${dayWeekdayText(source.next_action_date)}`;
  if (view.planned) return plannedText(view.planned);
  return '';
}

// ── S-TODAY-FOCUS-1: тексты фокуса (спека `today-focus-spec.md`, §4) ──

/** Короткий вид слота — кикер фокуса (S1) и плитка хода (S3). */
export const SLOT_KINDS: Record<MoveSlot, string> = {
  assigned: 'На сегодня',
  fresh: 'Свежий срыв',
  biggest: 'Сумма без шага',
  fill: 'Добор',
};

/**
 * Кикер шапки фокуса: «почему эта сделка здесь». Ход — номер и вид слота, строка —
 * группа. `days` — просрочка шага; шага нет — «шага нет»; шаг впереди — `null`.
 * `hot` — свежий срыв: его дни красятся.
 */
export function focusKicker(
  view: TodayDealView,
  move: { n: number; of: number } | null,
): { lead: string; days: string | null; hot: boolean } {
  const { cls } = view;
  const lead = move
    ? `Ход ${move.n} из ${move.of} · ${SLOT_KINDS[view.slot ?? 'fill']}`
    : TODAY_GROUP_LABELS[cls.group];
  const days = cls.overdueDays !== null
    ? (move ? `${cls.overdueDays} дн.` : `${cls.overdueDays} дн. после срока`)
    : cls.noStep ? 'шага нет' : null;
  return { lead, days, hot: cls.group === 'fresh' };
}

/** Источник суммы под суммой в шапке. */
export function amountSourceText(
  source: 'quote' | 'budget' | 'none',
  activeStatus: QuoteStatus | null,
): string {
  if (source === 'budget') return 'бюджет сделки';
  if (source === 'none') return 'суммы нет';
  if (activeStatus === 'draft') return 'черновик КП';
  if (activeStatus === 'sent') return 'КП отправлено';
  if (activeStatus === 'accepted') return 'КП принято';
  return 'по КП';
}

/** Сегменты через « · »; сегмент без значения пропускается вместе с разделителем. */
function joinSegments(parts: readonly (string | null)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

/** «Отправлено 7 сент» / «Отправлено» — дата без значения отпадает вместе с пробелом. */
function withDay(word: string, iso: string | null): string {
  return iso ? `${word} ${dayText(iso)}` : word;
}

/** Строка секции «КП» тела фокуса. */
export function quoteLineText(
  quote: Pick<Quote, 'status' | 'amount' | 'created_at' | 'sent_at' | 'accepted_at' | 'valid_until' | 'updated_at'> | null,
  amountSource: 'quote' | 'budget' | 'none',
  now: Date,
): { text: string; warn: boolean; action: 'open' | 'create' } {
  if (!quote) {
    return {
      text: amountSource === 'budget'
        ? 'КП не заведено · сумма — из бюджета сделки'
        : 'КП не заведено · суммы нет',
      warn: false,
      action: 'create',
    };
  }
  const amount = quote.amount != null ? formatBudget(quote.amount) : null;
  switch (quote.status) {
    case 'draft':
      return { text: joinSegments([withDay('Черновик от', quote.created_at), amount, 'не отправлено']), warn: false, action: 'open' };
    case 'sent': {
      const level = quoteValidity(quote.valid_until, now).level;
      const until = quote.valid_until
        ? withDay(level === 'expired' ? 'истекло' : 'действует до', quote.valid_until)
        : null;
      return {
        text: joinSegments([withDay('Отправлено', quote.sent_at), until]),
        warn: level === 'expired' || level === 'soon',
        action: 'open',
      };
    }
    case 'accepted':
      return { text: joinSegments([withDay('Принято', quote.accepted_at), amount]), warn: false, action: 'open' };
    case 'rejected':
      return { text: withDay('Отклонено', quote.updated_at), warn: false, action: 'open' };
    case 'expired':
      return { text: withDay('Истекло', quote.valid_until ?? quote.updated_at), warn: true, action: 'open' };
  }
}

// ── S-TODAY-FOCUS-2: плашка строки списка (спека, §5) ──

const NBSP = '\u00a0';

/**
 * Плашка справа в строке сделки: дни срыва, срок шага или «шага нет». Стадия и
 * «что было после срока» ушли в фокус — строке остаётся одно число.
 *
 * Порядок проверок — таблица спринта, первая подошедшая побеждает. `written` —
 * ход записан сегодня: плашка показывает новый шаг, а не прежнюю просрочку.
 * «дн.» — через неразрывный пробел: плашка узкая, перенос «4 / дн.» её ломает.
 */
export function rowPill(
  view: TodayDealView,
  todayKey: string,
  written: { nextDateKey: string | null } | null,
): { text: string; tone: 'hot' | 'risk' | 'plain' | 'done'; title: string | null } {
  const { cls, source, planned } = view;
  if (written) {
    return {
      text: written.nextDateKey ? `шаг ${dayWeekdayText(written.nextDateKey)}` : 'шага нет',
      tone: 'done',
      title: null,
    };
  }
  if (cls.group === 'fresh' && cls.overdueDays !== null) {
    return { text: `${cls.overdueDays}${NBSP}дн.`, tone: 'hot', title: null };
  }
  if (cls.group === 'risk') {
    const days = source.next_action_date ? diffDaysKey(todayKey, source.next_action_date.slice(0, 10)) : 0;
    return {
      text: days <= 0 ? 'сегодня' : `через ${days}${NBSP}дн.`,
      tone: 'risk',
      title: signalsText(view.signals),
    };
  }
  if (cls.overdueDays !== null) return { text: `${cls.overdueDays}${NBSP}дн.`, tone: 'plain', title: null };
  if (cls.stepAhead && source.next_action_date) {
    return { text: dayWeekdayText(source.next_action_date), tone: 'plain', title: null };
  }
  if (planned) {
    return {
      text: `${dayWeekdayText(planned.dateKey)}${planned.time ? `, ${planned.time}` : ''}`,
      tone: 'plain',
      title: null,
    };
  }
  return { text: 'шага нет', tone: 'plain', title: null };
}
