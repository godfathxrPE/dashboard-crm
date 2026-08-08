// ═══════════════════════════════════════════════════════
// S-TG-1: текст уведомления, уезжающего в Telegram.
//
// ⚠️ ЭТО ЗЕРКАЛО, А НЕ РАНТАЙМ. Боевой текст собирает SQL —
//    `public.telegram_notification_text()` в `supabase/migrations/107_telegram_core.sql`,
//    и вызывается он из триггера `trg_zz_telegram_outbox` на `notifications`. Из
//    браузера этот путь не проходит вообще: `telegram_outbox` для `authenticated`
//    закрыта полностью.
//
//    ЗАЧЕМ ТОГДА КОПИЯ. Правила формата (какой заголовок у типа, что показывать при
//    пустом payload, что экранировать, куда ведёт ссылка) — единственная в спринте
//    часть, которую можно проверить тестами: SQL-функции в этом проекте тестового
//    окружения не имеют, а ошибка в экранировании ломает отправку молча, на первом же
//    названии компании с амперсандом. Здесь она ловится в `npm test`.
//
//    ЦЕНА. Два места вместо одного. Правится ТЕМ ЖЕ коммитом, что 107 — тот же
//    приём и та же дисциплина, что у зеркал промптов edge-функций (S-R3-VOICE-1) и
//    у `WEBHOOK_EVENT_BY_TRIGGER` (090). Расхождение зеркала с SQL — баг, а не
//    «два варианта».
//
// ⚠️ Заголовки/тело — зеркало `TYPE_LABEL` и `payloadTitle`, путь — зеркало
//    `entityRoute`; все три живут в `src/components/layout/NotificationBell.tsx`.
//    Человек, читающий одно и то же уведомление в колокольчике и в мессенджере,
//    должен видеть один и тот же текст, иначе это два продукта с общей таблицей.
// ═══════════════════════════════════════════════════════

import type { NotificationType } from '@/types/database';

/**
 * Фолбэк базового URL — тот же литерал, что `APP_ORIGIN` в
 * `src/lib/utils/entity-links.ts`. Импортом не связаны намеренно: зеркало обязано
 * читаться рядом с SQL, где импортировать неоткуда.
 */
export const TELEGRAM_APP_ORIGIN_FALLBACK = 'https://dashboard-crm-ten.vercel.app';

/**
 * Базовый URL признаётся годным, только если он похож на базовый URL. Регэксп
 * намеренно уже, чем «валидный URL»: он не пропускает `&`, `<`, `>` и пробел —
 * поэтому собранная ссылка не может сломать `parse_mode: 'HTML'` и не требует
 * отдельного экранирования. Зеркало условия из 107.
 */
const APP_URL_RE = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/;

const TYPE_HEAD: Record<NotificationType, string> = {
  task_assigned: 'Назначена задача',
  project_assigned: 'Назначена сделка',
  deal_won: 'Сделка выиграна',
  automation: 'Автоматизация',
  spawn_suggest: 'Пора создать внедрение',
  webhook_disabled: 'Вебхук отключён',
  task_reminder: 'Скоро дедлайн', // 108, S-TG-2
};

/** Тип вне словаря приходит только из будущей миграции — не падаем, а деградируем. */
const FALLBACK_HEAD = 'Уведомление';

/**
 * S-TG-PRIORITY (109): приписка к заголовку напоминания.
 *
 * ⚠️ ТОЛЬКО ДВА ВЕРХНИХ УРОВНЯ. У `normal` маркера нет намеренно: маркер,
 *    который есть у всех, не значит ничего — так система приоритетов и
 *    обесценивается. Всё, чего нет в словаре (отсутствующий ключ у уведомлений,
 *    созданных до 109; мусор; будущее значение enum), даёт пустую приписку.
 *
 * ⚠️ Возвращает `''`, а НЕ `undefined`/`null`: в SQL-зеркале конкатенация с NULL
 *    съела бы заголовок целиком. Здесь `+ undefined` дал бы «undefined» в тексте —
 *    разные симптомы, одна причина, поэтому и там, и тут пустая строка.
 */
function prioritySuffix(priority: string | null | undefined): string {
  // ⚠️ `switch`, а НЕ поиск по объекту-словарю. Словарь наследует прототип, и
  //    `SUFFIX['constructor']` вернул бы функцию — truthy, то есть в заголовок
  //    уехал бы «function Object() {...}». Значение приходит из enum и таких
  //    строк содержать не может, но защита от мусора, которая ломается на
  //    мусоре определённого вида, — это не защита. Заодно форма один в один
  //    совпадает с `CASE` в SQL-оригинале (109).
  switch (priority) {
    case 'important':
      return ' · важно';
    case 'critical':
      return ' · критично';
    default:
      return '';
  }
}

export interface TelegramNotificationInput {
  type: string;
  entity_type: string;
  entity_id: string;
  payload: {
    title?: string | null;
    text?: string | null;
    /**
     * 109: `tasks.priority` строкой. Тип намеренно широкий, а не
     * `'normal' | 'important' | 'critical'`: payload приходит из БД
     * нетипизированным JSON, и сузить его типом значит соврать компилятору —
     * сужение делает `PRIORITY_SUFFIX` в рантайме.
     */
    priority?: string | null;
  } | null;
  /** `organizations.settings.app_url`; null/мусор ⇒ сообщение уйдёт без ссылки. */
  appUrl?: string | null;
}

/**
 * Экранирование под `parse_mode: 'HTML'` у Telegram.
 *
 * Порядок обязателен: `&` первым, иначе он съест собственные подстановки
 * (`&lt;` превратился бы в `&amp;lt;`). Три символа — ровно то, что требует
 * Telegram; кавычки в тексте (не в атрибуте) экранировать не нужно.
 */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Пустая строка и пробелы — то же, что отсутствие значения. */
function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : escapeTelegramHtml(trimmed);
}

/** Путь в приложении. Зеркало `entityRoute` из NotificationBell. */
export function notificationPath(type: string, entityType: string, entityId: string): string {
  // task_overdue-автоматизация несёт entity_type='tasks' → доска задач (иначе ушла
  // бы в /deals/{task_id} = 404). Проверять ДО общей automation-ветки.
  if (type === 'automation' && entityType === 'tasks') return '/tasks';
  if (type === 'spawn_suggest') return `/deals/${entityId}?spawn=1`;
  // 108: явно, хотя совпадает с фолбэком. У задачи нет detail-роута — доска.
  if (type === 'task_reminder') return '/tasks';
  // У endpoint'а нет своего роута: ведём в Настройки, где секция «Вебхуки».
  if (type === 'webhook_disabled') return '/settings';
  if (type === 'project_assigned' || type === 'deal_won' || type === 'automation') {
    return `/deals/${entityId}`;
  }
  return '/tasks';
}

/**
 * Готовый текст сообщения: заголовок жирным, суть, ссылка.
 *
 * Ссылки может не быть — и это штатный исход, а не ошибка: ссылка в никуда хуже её
 * отсутствия.
 */
export function buildTelegramNotificationText(input: TelegramNotificationInput): string {
  const title = clean(input.payload?.title);
  const text = clean(input.payload?.text);

  // Заголовок — литерал из закрытого набора, экранировать нечего. 109: у
  // напоминания к нему добавляется приоритет — тоже литерал, из enum, не от
  // человека, поэтому экранированию не подлежит.
  const head =
    (TYPE_HEAD[input.type as NotificationType] ?? FALLBACK_HEAD) +
    (input.type === 'task_reminder' ? prioritySuffix(input.payload?.priority) : '');

  let body: string;
  if (input.type === 'deal_won') {
    body = title
      ? `Сделка «${title}» выиграна — создайте внедрение`
      : 'Сделка выиграна — создайте внедрение';
  } else if (input.type === 'automation') {
    body = text ?? title ?? head;
  } else if (input.type === 'spawn_suggest') {
    body = text ?? (title ? `Сделка «${title}» — пора создать внедрение` : head);
  } else if (input.type === 'task_reminder') {
    // 108: срок и название проекта собраны в payload.text планировщиком
    // (enqueue_task_reminders); title — голый текст задачи, он же фолбэк.
    body = text ?? title ?? head;
  } else {
    body = title ?? head;
  }

  const appUrl = input.appUrl ?? null;
  const link =
    appUrl && APP_URL_RE.test(appUrl)
      ? appUrl.replace(/\/+$/, '') + notificationPath(input.type, input.entity_type, input.entity_id)
      : null;

  return `<b>${head}</b>\n${body}${link ? `\n${link}` : ''}`;
}

// ═══════════════════════════════════════════════════════
// S-TG-2 (108): кнопка «Выполнено» — формат callback_data
//
// ⚠️ ЗДЕСЬ ЗЕРКАЛО ТОЛЬКО У СБОРКИ. `buildTaskKeyboard` дублирует
//    `public.telegram_task_keyboard()` (108) — клавиатуру строит SQL, эта копия
//    существует ради тестов, как и остальной файл. А вот `parseTaskCallbackData`
//    зеркалом НЕ является: разбор живёт только в edge `telegram-webhook`, и
//    отдельной SQL-версии у него нет.
// ═══════════════════════════════════════════════════════

/** Единственный префикс, который бот берётся разбирать. Всё прочее — чужой ввод. */
export const TASK_DONE_PREFIX = 'tgdone:';

/** Жёсткий лимит Telegram на callback_data. Префикс 7 + uuid 36 = 43 — с запасом. */
const CALLBACK_DATA_MAX_BYTES = 64;

/**
 * UUID v4-подобный, без вольностей: без фигурных скобок, без верхнего регистра,
 * без `urn:uuid:`. Строгость здесь дешевле, чем `select` по мусорному id.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

/**
 * Типы, у которых сообщение получает кнопку. `automation` сюда НЕ входит, хотя
 * тоже носит `entity_type='tasks'`: это уведомление о просрочке, и «закрыть одним
 * тапом» — не то действие, которого от человека ждут. Зеркало условия в
 * `enqueue_telegram_notification` (108).
 */
export const TASK_KEYBOARD_TYPES: readonly NotificationType[] = ['task_assigned', 'task_reminder'];

export function shouldAttachTaskKeyboard(type: string, entityType: string): boolean {
  return entityType === 'tasks' && (TASK_KEYBOARD_TYPES as readonly string[]).includes(type);
}

export function buildTaskKeyboard(taskId: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [[{ text: '✓ Выполнено', callback_data: `${TASK_DONE_PREFIX}${taskId}` }]],
  };
}

/**
 * Разбор `callback_data` из нажатия кнопки.
 *
 * ⚠️ ВОЗВРАЩАЕТ `null` НА ВСЁМ, ЧТО НЕ ЛЕГЛО В ФОРМУ ТОЧНО. Это единственная
 *    точка, где в бота приходит строка, выбранная не нами: Telegram отдаёт
 *    `callback_data` как есть, а нажать её может кто угодно, у кого сохранилось
 *    старое сообщение. Проверяем длину (лимит транспорта — уже признак подделки),
 *    префикс и форму uuid; права проверяет RPC, здесь только формат.
 */
export function parseTaskCallbackData(data: string | null | undefined): string | null {
  if (typeof data !== 'string') return null;
  if (new TextEncoder().encode(data).length > CALLBACK_DATA_MAX_BYTES) return null;
  if (!data.startsWith(TASK_DONE_PREFIX)) return null;
  const id = data.slice(TASK_DONE_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}
