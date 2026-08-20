// supabase/functions/_shared/telegram-capture.ts — S-TG-3
//
// Карточка подтверждения быстрого ввода из Telegram и формат её кнопок.
//
// ⚠️ ЭТО ЕДИНСТВЕННЫЙ ИСТОЧНИК, А НЕ ЗЕРКАЛО — в отличие от
//    `src/lib/domain/telegram-message.ts`, который дублирует SQL-функцию 107/108.
//    Здесь SQL-оригинала нет и быть не может: карточку собирает бот из ответа
//    `ai-capture`, до всякой записи в БД. Поэтому файл лежит в общем модуле и
//    читается напрямую: Deno-функцией — с расширением `.ts`, тестами
//    (`tests/unit/telegram-capture.test.ts`) — без него.
//
// ⚠️ НЕ ДОБАВЛЯТЬ СЮДА ИМПОРТОВ (та же причина, что в `_shared/capture-helpers.ts`):
//    алиас `@/` не резолвит Deno, расширение `.ts` не берёт tsc.

// ═══ Экранирование ═══

/**
 * Экранирование под `parse_mode: 'HTML'` у Telegram.
 *
 * Порядок обязателен: `&` первым, иначе он съест собственные подстановки
 * (`&lt;` превратился бы в `&amp;lt;`). Три символа — ровно то, что требует
 * Telegram; кавычки в тексте (не в атрибуте) экранировать не нужно.
 *
 * ⚠️ Каноническое TS-определение проекта: `src/lib/domain/telegram-message.ts`
 *    его реэкспортирует. SQL-копия (`public.telegram_escape_html`, 107) остаётся
 *    отдельной по необходимости — из plpgsql импортировать неоткуда.
 *
 * ⚠️ Названия компаний — главный потребитель. «ООО "Ромашка & Ко"» без
 *    экранирования роняет sendMessage целиком, и карточка не приходит вообще.
 */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══ callback_data ═══
//
// ⚠️ ДВОЕТОЧИЕ — ЧАСТЬ ПРЕФИКСА, И ЭТО НЕ КОСМЕТИКА. Без него `tgcap` жадно
//    матчил бы `tgcapx`, `tgcapc` и `tgcapo`: «Отмена» выполнилась бы как
//    «Создать». С двоеточием пересечений нет — пятый символ различается
//    (`:` против `x`/`c`/`o`), и разбор однозначен. Проверено тестами
//    (`tests/unit/telegram-capture.test.ts`), не рассуждением.
//
// ⚠️ `tgdone:` из S-TG-2 в этот набор НЕ входит и разбирается своей функцией в
//    `telegram-webhook`: у него другая доменная область (задачи), и смешивать
//    разборы значит потерять ответ на вопрос «чья это кнопка».

export const CAPTURE_APPLY_PREFIX = 'tgcap:';
export const CAPTURE_CANCEL_PREFIX = 'tgcapx:';
export const CAPTURE_AS_CONTACT_PREFIX = 'tgcapc:';
export const CAPTURE_AS_COMPANY_PREFIX = 'tgcapo:';

/** Жёсткий лимит Telegram на callback_data. Префикс ≤ 7 + uuid 36 = 43 — с запасом. */
const CALLBACK_DATA_MAX_BYTES = 64;

/**
 * UUID v4-подобный, без вольностей: без фигурных скобок, без верхнего регистра,
 * без `urn:uuid:`. Строгость здесь дешевле, чем `select` по мусорному id.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CaptureAction = 'apply' | 'cancel' | 'as_contact' | 'as_company';

export interface CaptureCallback {
  action: CaptureAction;
  draftId: string;
  /** Ветка, выбранная человеком на `unclear`; `null` — решение уже в черновике. */
  kind: 'contact' | 'company' | null;
}

const PREFIX_TABLE: ReadonlyArray<{
  prefix: string;
  action: CaptureAction;
  kind: 'contact' | 'company' | null;
}> = [
  { prefix: CAPTURE_APPLY_PREFIX, action: 'apply', kind: null },
  { prefix: CAPTURE_CANCEL_PREFIX, action: 'cancel', kind: null },
  { prefix: CAPTURE_AS_CONTACT_PREFIX, action: 'as_contact', kind: 'contact' },
  { prefix: CAPTURE_AS_COMPANY_PREFIX, action: 'as_company', kind: 'company' },
];

/**
 * Разбор `callback_data` кнопок быстрого ввода. `null` на всём, что не легло в
 * форму ТОЧНО.
 *
 * ⚠️ Это одна из двух точек, куда в бота приходит строка, выбранная не нами:
 *    нажать кнопку может кто угодно, у кого сохранилось старое сообщение.
 *    Здесь проверяется только ФОРМА (длина, префикс, uuid) — права проверяет
 *    RPC `tg_apply_capture` по явному актору.
 */
export function parseCaptureCallbackData(data: string | null | undefined): CaptureCallback | null {
  if (typeof data !== 'string') return null;
  if (new TextEncoder().encode(data).length > CALLBACK_DATA_MAX_BYTES) return null;

  for (const entry of PREFIX_TABLE) {
    if (!data.startsWith(entry.prefix)) continue;
    const id = data.slice(entry.prefix.length);
    if (!UUID_RE.test(id)) return null;
    return { action: entry.action, draftId: id, kind: entry.kind };
  }
  return null;
}

// ═══ Карточка ═══

export interface CaptureCardContact {
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CaptureCardCompany {
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  legal_address?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
}

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

export interface CaptureCard {
  text: string;
  reply_markup: TelegramInlineKeyboard;
}

export interface CaptureCardInput {
  draftId: string;
  /** `unclear` — ветку выбирает человек кнопкой, гадать за него нельзя. */
  kind: 'contact' | 'company' | 'unclear';
  contact?: CaptureCardContact | null;
  company?: CaptureCardCompany | null;
  /**
   * Найденный дубль: меняет и текст, и набор кнопок.
   *
   * ⚠️ `matchedBy` — не украшение отчёта, а признак, от которого зависит НАБОР
   *    КНОПОК (S-TG-3-INN-DUP). Структурное зеркало `CaptureDuplicate` из
   *    `capture-helpers.ts`; импортировать его сюда нельзя (правило файла — без
   *    импортов), поэтому форма повторена, а не подключена.
   */
  duplicate?: {
    kind: 'contact' | 'company';
    id: string;
    label: string;
    matchedBy?: 'inn' | 'name' | 'email' | 'phone' | null;
  } | null;
  /** Базовый URL приложения; невалидный/пустой ⇒ url-кнопки не будет. */
  appUrl?: string | null;
}

/**
 * Базовый URL признаётся годным, только если он похож на базовый URL. Регэксп
 * намеренно уже, чем «валидный URL»: Telegram отвергает sendMessage ЦЕЛИКОМ, если
 * `url` кнопки ему не нравится, — то есть кривой адрес в настройках org стоил бы
 * не битой ссылки, а неприходящей карточки. Зеркало условия из 107/108.
 */
const APP_URL_RE = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/;

/**
 * Сущность, на которую бот умеет дать ссылку. `task` добавлена S-TG-TASK-1.
 *
 * ⚠️ У ЗАДАЧИ НЕТ СОБСТВЕННОЙ СТРАНИЦЫ. В приложении есть только `/tasks` (доска
 *    и списки); маршрута `/tasks/<id>` не существует, и собирать его «по аналогии»
 *    значит выдать ссылку на 404. Поэтому у задачи id в путь не подставляется.
 */
export type EntityLinkKind = 'contact' | 'company' | 'task';

/** Ссылка на карточку сущности или null. Пути — зеркало `openExisting` в QuickCapture. */
export function entityUrl(
  appUrl: string | null | undefined,
  kind: EntityLinkKind,
  id: string,
): string | null {
  const base = (appUrl ?? '').trim();
  if (!base || !APP_URL_RE.test(base)) return null;
  const root = base.replace(/\/+$/, '');
  if (kind === 'task') return `${root}/tasks`;
  return root + (kind === 'contact' ? '/contacts/' : '/companies/') + id;
}

/** Непустая строка после trim или null. */
function clean(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
}

/** Собранная из непустых кусков строка через разделитель или null. */
function joinParts(parts: Array<string | null>, sep: string): string | null {
  const kept = parts.filter((p): p is string => p !== null && p !== '');
  return kept.length ? kept.join(sep) : null;
}

/** Человекочитаемое имя разбора — оно же подпись в сообщении об успехе. */
export function captureLabel(
  kind: 'contact' | 'company',
  contact: CaptureCardContact | null | undefined,
  company: CaptureCardCompany | null | undefined,
): string {
  if (kind === 'contact') {
    // `filter(Boolean)`, а не шаблонная строка: фамилии может не быть, и
    // `${null}` напечатал бы «null» прямо в сообщение (learnings 2026-08-04).
    return [clean(contact?.first_name), clean(contact?.last_name)].filter(Boolean).join(' ');
  }
  return clean(company?.name) ?? '';
}

/** Блок строк про контакт (без заголовка). Всё уже экранировано. */
function contactLines(c: CaptureCardContact): string[] {
  const name = [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(' ');
  return [
    name || null,
    clean(c.position),
    joinParts([clean(c.email), clean(c.phone)], ' · '),
  ]
    .filter((l): l is string => l !== null)
    .map(escapeTelegramHtml);
}

/** Блок строк про компанию (без заголовка). Всё уже экранировано. */
function companyLines(co: CaptureCardCompany): string[] {
  const inn = clean(co.inn);
  return [
    clean(co.name),
    // Реквизиты — только если ИНН реально нашёлся: строка «ИНН —» бессмысленна.
    inn ? joinParts([`ИНН ${inn}`, clean(co.kpp) ? `КПП ${clean(co.kpp)}` : null], ' · ') : null,
    // Юрадрес из ЕГРЮЛ важнее фактического из текста: он проверяемый факт.
    clean(co.legal_address) ?? clean(co.address),
    joinParts([clean(co.email), clean(co.phone), clean(co.website)], ' · '),
  ]
    .filter((l): l is string => l !== null)
    .map(escapeTelegramHtml);
}

const BTN_CREATE = 'Создать';
const BTN_CANCEL = 'Отмена';
const BTN_OPEN = 'Открыть в CRM';
const BTN_CREATE_ANYWAY = 'Всё равно создать';
const BTN_AS_CONTACT = 'Контакт';
const BTN_AS_COMPANY = 'Компания';

/**
 * Карточка подтверждения: что разобрано + кнопки.
 *
 * ⚠️ НИ ОДНА ВЕТКА НЕ СОЗДАЁТ ЗАПИСЬ САМА. Инвариант тот же, что у веб-виджета:
 *    AI предлагает, человек применяет. Поэтому кнопка есть всегда, в том числе
 *    когда разбор выглядит однозначным.
 */
export function buildCaptureCard(input: CaptureCardInput): CaptureCard {
  const { draftId, kind, contact, company, duplicate, appUrl } = input;

  // ── Дубль: другой текст и другой набор кнопок ──────────────────────
  if (duplicate) {
    const url = entityUrl(appUrl, duplicate.kind, duplicate.id);
    // Кнопку «Открыть» кладём, ТОЛЬКО если ссылка собралась: Telegram отвергает
    // всё сообщение целиком, если `url` кнопки ему не нравится.
    const openRow: TelegramInlineButton[][] = url ? [[{ text: BTN_OPEN, url }]] : [];
    const cancelRow: TelegramInlineButton[] = [
      { text: BTN_CANCEL, callback_data: CAPTURE_CANCEL_PREFIX + draftId },
    ];

    // ⚠️ СОВПАДЕНИЕ ПО ИНН — «ВСЁ РАВНО СОЗДАТЬ» НЕ ПОКАЗЫВАЕМ (S-TG-3-INN-DUP).
    //    Вставка упрётся в `uq_companies_org_inn (org_id, inn)`, то есть кнопка не
    //    может сработать никогда; честный ответ от RPC (111) её не оправдывает —
    //    кнопка, которая гарантированно не выполнится, это дефект интерфейса.
    //    По НАЗВАНИЮ кнопка остаётся: два юрлица с похожими названиями и разными
    //    ИНН — обычное дело, и там «всё равно создать» отрабатывает.
    const innMatch = duplicate.matchedBy === 'inn';

    // На `unclear` «Всё равно создать» неоднозначно — ветку всё ещё нужно
    // выбрать, поэтому вместо неё те же две кнопки выбора.
    const buttons: TelegramInlineButton[][] =
      kind === 'unclear'
        ? [
            ...openRow,
            [
              { text: BTN_AS_CONTACT, callback_data: CAPTURE_AS_CONTACT_PREFIX + draftId },
              { text: BTN_AS_COMPANY, callback_data: CAPTURE_AS_COMPANY_PREFIX + draftId },
            ],
            cancelRow,
          ]
        : [
            [
              ...(url ? [{ text: BTN_OPEN, url }] : []),
              ...(innMatch
                ? []
                : [{ text: BTN_CREATE_ANYWAY, callback_data: CAPTURE_APPLY_PREFIX + draftId }]),
            ],
            cancelRow,
          ];

    return {
      text:
        `<b>Похоже, это уже есть</b>\n${escapeTelegramHtml(duplicate.label)}` +
        // Без объяснения пропавшая кнопка читается как сбой бота, а не как ответ.
        (innMatch ? '\n\nСовпадает ИНН — это та же организация.' : '') +
        (url ? '' : '\n\nСсылку на запись собрать не удалось — откройте CRM вручную.'),
      // Ряд может оказаться пустым (совпадение по ИНН + ссылка не собралась) —
      // пустые ряды Telegram не любит, и смысла в них нет.
      reply_markup: { inline_keyboard: buttons.filter((row) => row.length > 0) },
    };
  }

  // ── Непонятный текст: спрашиваем, а не угадываем ───────────────────
  if (kind === 'unclear') {
    const blocks: string[] = [];
    if (contact) {
      const l = contactLines(contact);
      if (l.length) blocks.push(`<b>Как контакт</b>\n${l.join('\n')}`);
    }
    if (company) {
      const l = companyLines(company);
      if (l.length) blocks.push(`<b>Как компанию</b>\n${l.join('\n')}`);
    }
    const body = blocks.length ? blocks.join('\n\n') : 'Разобрать не удалось — уточните текст.';
    return {
      text: `${body}\n\nЧто создать из этого текста?`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: BTN_AS_CONTACT, callback_data: CAPTURE_AS_CONTACT_PREFIX + draftId },
            { text: BTN_AS_COMPANY, callback_data: CAPTURE_AS_COMPANY_PREFIX + draftId },
          ],
          [{ text: BTN_CANCEL, callback_data: CAPTURE_CANCEL_PREFIX + draftId }],
        ],
      },
    };
  }

  // ── Однозначный разбор ─────────────────────────────────────────────
  const head = kind === 'contact' ? 'Контакт' : 'Компания';
  const lines = kind === 'contact' ? contactLines(contact ?? {}) : companyLines(company ?? {});
  const body = lines.length ? lines.join('\n') : 'Полей не нашлось — проверьте текст.';

  return {
    text: `<b>${head}</b>\n${body}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: BTN_CREATE, callback_data: CAPTURE_APPLY_PREFIX + draftId },
          { text: BTN_CANCEL, callback_data: CAPTURE_CANCEL_PREFIX + draftId },
        ],
      ],
    },
  };
}

// ═══ Карточка задачи (S-TG-TASK-1) ═══

/**
 * Время срока, когда его не назвали.
 *
 * ⚠️ НЕ ПОЛНОЧЬ. «До пятницы» с дедлайном 00:00 просрочивается в четверг вечером —
 *    то есть задача рождается просроченной ровно в том случае, который человек
 *    считал нормальным.
 */
export const TASK_DEFAULT_HOUR = 18;

export type DeadlineReason = 'ok' | 'empty' | 'past' | 'invalid';

export interface TaskDeadline {
  /** ISO UTC для колонки `timestamptz` или null. */
  iso: string | null;
  reason: DeadlineReason;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Срок задачи из даты и времени, названных моделью.
 *
 * ⚠️ СМЕЩЕНИЕ — ЛИТЕРАЛЬНЫМ СУФФИКСОМ `+03:00`, а не арифметикой над UTC. Ровно
 *    так это делает `mskEndOfDayIso` в `src/lib/utils/date-helpers.ts`, и по той же
 *    причине: «минус три часа» руками — это off-by-one на границах суток, из-за
 *    которого в проекте вообще появился `mskDateKey`.
 *
 * ⚠️ ДАТА В ПРОШЛОМ ⇒ СРОКА НЕТ. Модель, ошибившаяся с годом или неделей, не должна
 *    молча создавать просроченную задачу: пустой срок с объяснением в карточке
 *    человек заметит, просрочку на день назад — нет.
 *
 * `now` — параметр, а не `new Date()` внутри: домен обязан быть проверяемым.
 */
export function buildTaskDeadline(
  dateKey: string | null | undefined,
  time: string | null | undefined,
  now: Date,
): TaskDeadline {
  const d = (dateKey ?? '').trim();
  if (d === '') return { iso: null, reason: 'empty' };
  if (!DATE_RE.test(d)) return { iso: null, reason: 'invalid' };

  const t = (time ?? '').trim();
  const hhmm = TIME_RE.test(t) ? t : `${String(TASK_DEFAULT_HOUR).padStart(2, '0')}:00`;

  const at = new Date(`${d}T${hhmm}:00+03:00`);
  if (isNaN(at.getTime())) return { iso: null, reason: 'invalid' };
  // ⚠️ ФОРМАТ ПРОШЁЛ — ЭТО ЕЩЁ НЕ ДАТА. На «2026-02-31» строгий разбор ISO обязан
  //    дать NaN, но движок молча уезжает на нестрогий парсер и выдаёт 3 марта.
  //    Тест ловил это как `past` — то есть правдоподобным исходом, который скрыл
  //    бы промах модели в календаре. Сверяем календарный день ПО МСК (та же ось,
  //    что `mskDateKey`), а не по UTC: на 18:00 они ещё совпадают, на 23:30 —
  //    уже нет.
  const mskKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(at);
  if (mskKey !== d) return { iso: null, reason: 'invalid' };
  if (at.getTime() < now.getTime()) return { iso: null, reason: 'past' };
  return { iso: at.toISOString(), reason: 'ok' };
}

/**
 * Срок словами: «пятница, 22 августа, 18:00».
 *
 * ⚠️ С ДНЁМ НЕДЕЛИ, И ЭТО НЕ УКРАШЕНИЕ. «22.08» глазами не проверить, «пятница,
 *    22 августа» — можно, и именно на дне недели ловится ошибка модели в неделе.
 */
export function formatTaskDeadline(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${at('weekday')}, ${at('day')} ${at('month')}, ${at('hour')}:${at('minute')}`;
}

/** Что случилось с упоминанием. Структурное зеркало `ResolveReason`. */
export type TaskLinkReason = 'ok' | 'empty' | 'not_found' | 'ambiguous' | 'error';

export interface TaskCardLink {
  reason: TaskLinkReason;
  /** Имя найденной записи — показывается вместо подсказки при `ok`. */
  label?: string | null;
  /** Дословная подсказка модели — показывается в кавычках при отказе. */
  hint?: string | null;
}

export interface TaskCardInput {
  draftId: string;
  text: string;
  deadline: TaskDeadline;
  /** Подсказка срока — нужна, чтобы объяснить отказ («срок в прошлом»). */
  deadlineHint?: string | null;
  priority?: 'normal' | 'important' | 'critical';
  assignee?: TaskCardLink | null;
  project?: TaskCardLink | null;
  company?: TaskCardLink | null;
}

const LINK_LABEL: Record<'assignee' | 'project' | 'company', string> = {
  assignee: 'Исполнитель',
  project: 'Сделка',
  company: 'Компания',
};

/** Что делать человеку, если привязка не состоялась. */
const LINK_FIX: Record<'assignee' | 'project' | 'company', string> = {
  assignee: 'назначьте в CRM',
  project: 'привяжите в CRM',
  company: 'привяжите в CRM',
};

/**
 * Строка привязки.
 *
 * ⚠️ НЕ РАЗРЕШЁННОЕ ПОКАЗЫВАЕТСЯ, А НЕ ПРОПУСКАЕТСЯ. Молчаливый пропуск даёт не
 *    поломку, а тихую деградацию: человек жмёт «Создать», считая, что исполнитель
 *    проставлен, и узнаёт обратное через неделю. `empty` — другое дело: там
 *    упоминания не было вовсе, и строке неоткуда взяться.
 */
function linkLine(kind: 'assignee' | 'project' | 'company', link: TaskCardLink | null | undefined): string | null {
  if (!link || link.reason === 'empty') return null;
  const head = LINK_LABEL[kind];
  if (link.reason === 'ok') {
    const label = clean(link.label);
    return label ? `${head}: ${escapeTelegramHtml(label)}` : null;
  }
  const hint = escapeTelegramHtml(clean(link.hint) ?? '');
  // ⚠️ `error` НЕ СКЛЕИВАЕТСЯ С `not_found`. «Не нашёл» — утверждение о справочнике,
  //    и человек, услышав его, начинает править своё сообщение. Если справочник не
  //    прочитался, он ни при чём, и текст обязан это говорить.
  const why =
    link.reason === 'ambiguous'
      ? `несколько совпадений, ${LINK_FIX[kind]}`
      : link.reason === 'error'
        ? `не удалось проверить справочник, ${LINK_FIX[kind]}`
        : `не нашёл, ${LINK_FIX[kind]}`;
  return `${head}: «${hint}» — ${why}`;
}

const PRIORITY_WORD: Record<'important' | 'critical', string> = {
  important: 'важно',
  critical: 'срочно',
};

/**
 * Карточка подтверждения задачи.
 *
 * ⚠️ ВСЕ РЕЗОЛВЫ ВИДНЫ ДО НАЖАТИЯ «СОЗДАТЬ». `trg_notify_task_assigned`
 *    срабатывает AFTER INSERT — ошибочное назначение немедленно уведомляет не того
 *    человека, и отката у этого нет.
 *
 * ⚠️ НОВЫХ ПРЕФИКСОВ callback_data НЕ ВВОДИТСЯ. Черновик несёт `kind='task'`, а
 *    `tg_apply_capture` берёт ветку из строки БД — работают те же `tgcap:` и
 *    `tgcapx:`. Пятый префикс — это пятый шанс на пересечение при разборе.
 */
export function buildTaskCard(input: TaskCardInput): CaptureCard {
  const { draftId, text, deadline, deadlineHint, priority, assignee, project, company } = input;

  const deadlineLine =
    deadline.reason === 'ok' && deadline.iso
      ? `Срок: ${escapeTelegramHtml(formatTaskDeadline(deadline.iso))}`
      : deadline.reason === 'past'
        ? `Срок: «${escapeTelegramHtml(clean(deadlineHint) ?? '')}» — срок в прошлом, не проставлен`
        : deadline.reason === 'invalid'
          ? 'Срок: не разобрал дату, не проставлен'
          : null;

  const lines = [
    deadlineLine,
    priority === 'important' || priority === 'critical' ? `Приоритет: ${PRIORITY_WORD[priority]}` : null,
    linkLine('assignee', assignee),
    linkLine('project', project),
    linkLine('company', company),
  ].filter((l): l is string => l !== null);

  const body = escapeTelegramHtml(clean(text) ?? 'Текст задачи не разобран');

  return {
    text: `<b>Задача</b>\n${body}` + (lines.length ? `\n\n${lines.join('\n')}` : ''),
    reply_markup: {
      inline_keyboard: [
        [
          { text: BTN_CREATE, callback_data: CAPTURE_APPLY_PREFIX + draftId },
          { text: BTN_CANCEL, callback_data: CAPTURE_CANCEL_PREFIX + draftId },
        ],
      ],
    },
  };
}

/** Исход применения черновика, который видит человек. Зеркало `status` из RPC. */
export type AppliedOutcome = 'created' | 'duplicate_inn';

/**
 * Сообщение после применения — им ЗАМЕЩАЕТСЯ карточка.
 *
 * ⚠️ БЕЗ `parse_mode` на стороне вызова (см. `editMessageText` в telegram-webhook):
 *    Telegram отдаёт `message.text` уже разрисованным, и вернуть его с HTML нельзя.
 *    Поэтому здесь НЕ экранируем и не размечаем — текст уходит как есть.
 *
 * ⚠️ ИСХОД `duplicate_inn` — ПАРАМЕТР ЭТОГО СБОРЩИКА, А НЕ ВТОРОЙ СБОРЩИК
 *    (S-TG-3-INN-DUP). Разница между «создана» и «уже заведена» — одно слово в
 *    одной строке; отдельная функция ради него развела бы форматы сообщений,
 *    которые обязаны выглядеть одинаково (это одно и то же место в диалоге).
 */
export function buildAppliedText(
  kind: EntityLinkKind,
  label: string,
  outcome: AppliedOutcome = 'created',
): string {
  const what =
    outcome === 'duplicate_inn'
      ? 'Компания с этим ИНН уже заведена'
      : kind === 'contact'
        ? 'Контакт создан'
        : kind === 'task'
          ? 'Задача создана'
          : 'Компания создана';
  const mark = outcome === 'duplicate_inn' ? '•' : '✓';
  return label ? `${mark} ${what}: ${label}` : `${mark} ${what}`;
}

/** Клавиатура сообщения об успехе: одна ссылка, если она собралась. */
export function buildAppliedKeyboard(
  appUrl: string | null | undefined,
  kind: EntityLinkKind,
  id: string,
): TelegramInlineKeyboard {
  const url = entityUrl(appUrl, kind, id);
  return { inline_keyboard: url ? [[{ text: BTN_OPEN, url }]] : [] };
}
