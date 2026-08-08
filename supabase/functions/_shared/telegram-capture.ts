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
  /** Найденный дубль: меняет и текст, и набор кнопок. */
  duplicate?: { kind: 'contact' | 'company'; id: string; label: string } | null;
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

/** Ссылка на карточку сущности или null. Пути — зеркало `openExisting` в QuickCapture. */
export function entityUrl(
  appUrl: string | null | undefined,
  kind: 'contact' | 'company',
  id: string,
): string | null {
  const base = (appUrl ?? '').trim();
  if (!base || !APP_URL_RE.test(base)) return null;
  return base.replace(/\/+$/, '') + (kind === 'contact' ? '/contacts/' : '/companies/') + id;
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
              { text: BTN_CREATE_ANYWAY, callback_data: CAPTURE_APPLY_PREFIX + draftId },
            ],
            cancelRow,
          ];

    return {
      text:
        `<b>Похоже, это уже есть</b>\n${escapeTelegramHtml(duplicate.label)}` +
        (url ? '' : '\n\nСсылку на запись собрать не удалось — откройте CRM вручную.'),
      reply_markup: { inline_keyboard: buttons },
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

/**
 * Сообщение после применения — им ЗАМЕЩАЕТСЯ карточка.
 *
 * ⚠️ БЕЗ `parse_mode` на стороне вызова (см. `editMessageText` в telegram-webhook):
 *    Telegram отдаёт `message.text` уже разрисованным, и вернуть его с HTML нельзя.
 *    Поэтому здесь НЕ экранируем и не размечаем — текст уходит как есть.
 */
export function buildAppliedText(kind: 'contact' | 'company', label: string): string {
  const what = kind === 'contact' ? 'Контакт создан' : 'Компания создана';
  return label ? `✓ ${what}: ${label}` : `✓ ${what}`;
}

/** Клавиатура сообщения об успехе: одна ссылка, если она собралась. */
export function buildAppliedKeyboard(
  appUrl: string | null | undefined,
  kind: 'contact' | 'company',
  id: string,
): TelegramInlineKeyboard {
  const url = entityUrl(appUrl, kind, id);
  return { inline_keyboard: url ? [[{ text: BTN_OPEN, url }]] : [] };
}
