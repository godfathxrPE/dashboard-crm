// supabase/functions/telegram-webhook/capture.ts — S-TG-3
//
// Быстрый ввод компании и контакта из пересланного боту текста.
//
// ⚠️ ЭТО ВТОРОЙ КЛИЕНТ ГОТОВОГО КОДА, А НЕ ВТОРАЯ ЕГО РЕАЛИЗАЦИЯ. Разбор делает
//    edge `ai-capture` (та же, что зовёт веб-виджет), реквизиты — `company-lookup`
//    (ЕГРЮЛ), ИНН распознаёт `extractInn` чексуммой ФНС, дубль ищет
//    `findCaptureDuplicate` — всё из `_shared`. Собственной логики разбора здесь
//    нет, и если она появилась, значит что-то делается неправильно.
//
// ⚠️ МОЛЧА НЕ СОЗДАЁМ НИЧЕГО. Разбор → карточка с кнопками → RPC под явным актором.
//    Тот же инвариант, что в веб-виджете: AI предлагает, человек применяет.
//
// ⚠️ ЗАПИСЬ — ТОЛЬКО ЧЕРЕЗ `tg_apply_capture`/`tg_cancel_capture` С ЯВНЫМ АКТОРОМ.
//    Функция работает под service_role, где `auth.uid()` = NULL и RLS не защищает
//    ничего. Прямых INSERT по `contacts`/`companies` здесь нет и быть не может.

import {
  extractEmail,
  extractInn,
  findCaptureDuplicate,
  type CaptureDuplicate,
  type DedupCompanyRow,
  type DedupContactRow,
} from '../_shared/capture-helpers.ts';
import { okvedToIndustry } from '../_shared/okved.ts';
import { formatEnvNames, resolveGatewayAuth } from '../_shared/env.ts';
import { describeInvokeError, formatInvokeFailure } from '../_shared/invoke-error.ts';
import {
  buildAppliedKeyboard,
  buildAppliedText,
  buildCaptureCard,
  type CaptureCallback,
  type CaptureCardCompany,
  type CaptureCardContact,
} from '../_shared/telegram-capture.ts';

/** Зеркало `CAPTURE_MAX_CHARS` (`src/lib/validators/capture.ts`) и лимита ai-capture. */
const CAPTURE_MAX_CHARS = 2000;

/**
 * Потолок выборки для дедупа. На 2026-08-08 в проде 89 контактов и 268 компаний —
 * до потолка далеко, и до него дедуп точен. ⚠️ ДОЛГ, А НЕ РЕШЕНИЕ: после потолка
 * дубль перестанет находиться МОЛЧА. Ровно тот же компромисс уже сделан в
 * веб-виджете (он сверяется со списками из кэша React Query, тоже неполными);
 * лечится он одинаково — сверкой на стороне БД, и это отдельная работа.
 */
const DEDUP_FETCH_LIMIT = 2000;

const MSG_NOT_LINKED =
  'Профиль не привязан. Откройте Настройки → Telegram в CRM и подключите бота.';
const MSG_TOO_LONG = `Слишком длинный текст — не больше ${CAPTURE_MAX_CHARS} символов. Пришлите только карточку контакта или реквизиты.`;
const MSG_PARSING = 'Разбираю…';
/**
 * Ответ пришёл, но не лёг в схему. Повтор здесь ИМЕЕТ смысл: другая формулировка
 * действительно может разобраться.
 */
const MSG_PARSE_FAILED = 'Не удалось разобрать текст. Попробуйте прислать его ещё раз.';
/**
 * Разбор не состоялся по нашей причине: `ai-capture` не ответила (сбой, исчерпан
 * баланс, нет ключа) или не записался черновик.
 *
 * ⚠️ ТЕКСТ ОШИБКИ НЕ ДОЛЖЕН ПРЕДЛАГАТЬ ДЕЙСТВИЕ, КОТОРОЕ НЕ МОЖЕТ ПОМОЧЬ. Раньше
 *    сюда попадал `MSG_PARSE_FAILED` со словами «попробуйте ещё раз» — 2026-08-08
 *    в бою при исчерпанном балансе Claude API человек полчаса переформулировал
 *    сообщение, пытаясь угодить боту, которому нечем было отвечать. «Ещё раз» на
 *    инфраструктурном сбое переводит нашу проблему в разряд пользовательских.
 */
const MSG_UNAVAILABLE =
  'Разбор временно недоступен — это на нашей стороне. Сообщите администратору CRM.';
const MSG_EMPTY = 'В тексте не нашлось ни контакта, ни компании.';

const CB_CREATED = 'Готово';
const CB_CANCELLED = 'Отменено';
const CB_ALREADY = 'Уже создано';
const CB_FOREIGN = 'Это не ваш черновик';
const CB_EXPIRED = 'Черновик устарел';
const CB_NEED_KIND = 'Выберите: контакт или компания';
const CB_FAILED = 'Не удалось. Откройте CRM';
const CB_NO_RIGHTS = 'У вашей роли нет права создавать записи';
const CB_DUPLICATE_INN = 'Такая компания уже есть';

/** Минимальный интерфейс Bot API, который даёт вызывающий (index.ts). */
export interface BotApi {
  send(chatId: number, text: string): Promise<number | null>;
  edit(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { parseMode?: 'HTML'; replyMarkup?: unknown },
  ): Promise<void>;
  answer(callbackId: string, text: string): Promise<void>;
}

/** Привязка Telegram → человек и его организация. */
export interface TelegramActor {
  profile_id: string;
  org_id: string;
}

// ═══ Сужение ответа ai-capture ═══
//
// Zod здесь нет (Deno-бандл), но сужать внешний payload обязательно: `any`
// запрещён правилом проекта, а битый деплой функции иначе протёк бы undefined-ами
// прямо в INSERT.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Строка или '' — модель обязана отдавать пустую строку вместо выдумки. */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Ветка разбора или null.
 *
 * ⚠️ СТРОКА `"null"` — ЭТО NULL. Haiku на пустую ветку системно возвращает строку
 *    «null» вместо литерала — двум прогонам из трёх (гейт S-QUICK-CAPTURE-1).
 *    Промптом это не лечится, лечится здесь. Зеркало препроцессора `nullBranch`
 *    в `src/lib/validators/capture.ts`; расхождение означало бы контакт с именем
 *    «null», заведённый из мессенджера.
 */
function branch(v: unknown): Record<string, unknown> | null {
  if (v === 'null' || v === '' || v === undefined || v === null) return null;
  return isRecord(v) ? v : null;
}

interface CaptureParsed {
  intent: 'contact' | 'company' | 'unclear';
  contact: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
}

function narrowCapture(raw: unknown): CaptureParsed | null {
  if (!isRecord(raw)) return null;
  const intent = raw.intent;
  if (intent !== 'contact' && intent !== 'company' && intent !== 'unclear') return null;
  return { intent, contact: branch(raw.contact), company: branch(raw.company) };
}

// ═══ Сборка полей ═══

/** Телефон в форме `companies.phones`/`contacts.phones` (jsonb NOT NULL DEFAULT '[]'). */
function phoneEntry(value: string, type: 'mobile' | 'work') {
  return { type, value, is_primary: true };
}

/** Поля контакта. Зеркало `buildContactPrefill` в QuickCapture.tsx. */
function contactFields(c: Record<string, unknown> | null, rawText: string) {
  const phone = str(c?.phone);
  // Почту берём детерминированно из текста, если модель её не вернула: регулярка
  // тут надёжнее любого разбора.
  const email = str(c?.email) || extractEmail(str(c?.notes)) || extractEmail(rawText) || '';
  return {
    first_name: str(c?.first_name),
    last_name: str(c?.last_name),
    position: str(c?.position),
    email,
    phone,
    phones: phone ? [phoneEntry(phone, 'mobile')] : [],
    notes: str(c?.notes),
  };
}

/** Поля компании ДО обращения к ЕГРЮЛ. Зеркало `buildCompanyPrefill` (база). */
function companyFields(co: Record<string, unknown> | null, rawText: string, inn: string | null) {
  const phone = str(co?.phone);
  return {
    name: str(co?.name),
    inn: inn ?? '',
    email: str(co?.email) || extractEmail(rawText) || '',
    website: str(co?.website),
    // ⚠️ Фактический адрес — ТОЛЬКО из текста. Юрадрес реестра ложится в
    //    `legal_address` и `address` не трогает (инвариант миграции 102).
    address: str(co?.address),
    phone,
    phones: phone ? [phoneEntry(phone, 'work')] : [],
    notes: str(co?.notes),
  };
}

/** Ответ `company-lookup`. Зеркало `CompanyLookupResult` (company-lookup/normalize.ts). */
interface LookupResult {
  found?: unknown;
  short_name?: unknown;
  legal_name?: unknown;
  kpp?: unknown;
  ogrn?: unknown;
  legal_address?: unknown;
  status?: unknown;
  okved?: unknown;
  phones?: unknown;
  emails?: unknown;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
}

/**
 * Реквизиты ЕГРЮЛ поверх полей модели.
 *
 * ⚠️ Название реестра ПЕРЕБИВАЕТ разбор: имя из ЕГРЮЛ — факт, имя от модели —
 *    догадка по тексту. (В самой карточке компании правило обратное: там в поле
 *    уже лежит имя, введённое человеком, и реестр его не трогает.)
 */
function mergeLookup(base: ReturnType<typeof companyFields>, r: LookupResult) {
  const industry = okvedToIndustry(typeof r.okved === 'string' ? r.okved : null);
  const emails = strList(r.emails);
  const phones = strList(r.phones);
  return {
    ...base,
    name: str(r.short_name) || base.name,
    legal_name: str(r.legal_name),
    kpp: str(r.kpp),
    ogrn: str(r.ogrn),
    legal_address: str(r.legal_address),
    inn_status: str(r.status),
    okved: str(r.okved),
    industry: industry ?? '',
    // Сверка действительно произошла только что — дата честная.
    inn_verified_at: new Date().toISOString(),
    email: base.email || emails[0] || '',
    phones: base.phones.length
      ? base.phones
      : phones.map((value, i) => ({ type: 'work' as const, value, is_primary: i === 0 })),
  };
}

// ═══ Вызовы соседних edge-функций ═══
//
// ⚠️ `ai-capture` и `company-lookup` объявлены `verify_jwt = true`, и ослаблять это
//    ЗАПРЕЩЕНО — обе открыты из браузера. Снятие проверки сделало бы их публичным
//    endpoint'ом, жгущим токены любому, кто узнал URL.
//
// ⚠️ Шлюз требует ВАЛИДНЫЙ ПРОЕКТНЫЙ JWT — не пользовательскую сессию, но и НЕ ЛЮБОЙ
//    ключ. Запись S-TG-3 «ключ service_role — такой же подписанный проектом JWT,
//    поэтому `functions.invoke` от service-клиента проходит» была верна ровно до
//    18.08.2026: платформа перешла на ключи новой схемы и стала отдавать в
//    `SUPABASE_SERVICE_ROLE_KEY` минченный `sb_secret_…`. Для данных он рабочий
//    (журнал апдейтов и дедуп идут через него), но JWT не является — а `supabase-js`
//    кладёт ключ клиента и в `apikey`, и в `Authorization`. Шлюз пытается разобрать
//    `Authorization` как JWT и отвечает 401 ДО кода функции: в `function_logs` пусто,
//    статус лежит в `function_edge_logs`, а в поле `request.sb.apikey.apikey.prefix`
//    там видно `sb_secret_…`.
//
//    Поэтому JWT для шлюза берётся ОТДЕЛЬНО от ключа данных (`resolveGatewayAuth`) и
//    ставится заголовком на сам вызов. Клиент при этом остаётся прежним.
//
// ⚠️ Обе функции в БД не пишут ни строки (см. их security-контуры) — то есть токен
//    здесь не расширяет их полномочий, а только открывает калитку. Ровно поэтому
//    годится и самый бедный из проектных JWT.

const GATEWAY = resolveGatewayAuth((n) => Deno.env.get(n));

// Одна строка при холодном старте — чем именно открывается калитка. Без неё выбор
// источника виден только в отказе, а он к этому моменту уже стоил двух дней.
if (GATEWAY.token) {
  console.log(`telegram-webhook: JWT для шлюза взят из ${GATEWAY.source}`);
} else {
  // Не бросок: без JWT `/start`, кнопки и уведомления работают, отваливается только
  // разбор текста. Ронять из-за этого весь бот значит менять один отказ на четыре.
  console.error(
    'telegram-webhook: JWT для шлюза не найден — ai-capture и company-lookup ответят 401. ' +
      `Проверено: ${GATEWAY.checked.join(' | ')}. ` +
      'Нужен секрет EDGE_INVOKE_JWT (легаси-JWT service_role, имя без префикса SUPABASE_).',
  );
}

// deno-lint-ignore no-explicit-any
type Supa = any;

async function invokeJson(supabase: Supa, name: string, body: unknown): Promise<unknown | null> {
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    // Ключ клиента шлюз не примет, если он новой схемы; заголовок ставим адресно.
    ...(GATEWAY.token ? { headers: { Authorization: `Bearer ${GATEWAY.token}` } } : {}),
  });
  if (error) {
    // Раньше в лог уходил только `error.message` — у `FunctionsHttpError` это всегда
    // одна и та же фраза без статуса и без тела. Именно поэтому 401 два дня читался
    // как «ИИ не работает».
    const failure = await describeInvokeError(error);
    console.error(`telegram-webhook: ${formatInvokeFailure(name, failure)}`);
    if (failure.status === 401) logGatewayDiagnosis(name);
    return null;
  }
  return data ?? null;
}

/**
 * Разбор 401: имена и длины `SUPABASE_*` и то, чем мы авторизовались.
 *
 * ⚠️ ЗНАЧЕНИЙ НЕ ПЕЧАТАЕТ НИ ОДНОГО — только имя, вид и длину. Логи функций читаются
 *    из дашборда, и ключ в них — это ключ в них.
 */
function logGatewayDiagnosis(name: string): void {
  console.error(
    `telegram-webhook: шлюз не принял вызов ${name}. ` +
      `Окружение: ${formatEnvNames(Deno.env.toObject(), 'SUPABASE_')}. ` +
      `Authorization взят из: ${GATEWAY.source ?? 'ниоткуда'}. ` +
      `Кандидаты: ${GATEWAY.checked.join(' | ')}.`,
  );
}

// ═══ Дедуп ═══

/**
 * Строки организации для поиска дубля.
 *
 * ⚠️ Веб-виджет берёт их из кэша React Query, которого у бота нет, — поэтому
 *    запросом. САМО ПРАВИЛО при этом общее (`findCaptureDuplicate`): разойдясь, эти
 *    два дедупа дали бы дубль из мессенджера на тексте, где веб дубль показывает.
 */
async function loadDedupRows(
  supabase: Supa,
  orgId: string,
): Promise<{ contacts: DedupContactRow[]; companies: DedupCompanyRow[] }> {
  const [c, co] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, phones')
      .eq('org_id', orgId)
      .limit(DEDUP_FETCH_LIMIT),
    supabase.from('companies').select('id, name, inn').eq('org_id', orgId).limit(DEDUP_FETCH_LIMIT),
  ]);

  // Сбой выборки НЕ отменяет разбор: без дедупа карточка всё ещё полезна, а
  // «ничего не пришло» человек прочтёт как поломку бота целиком.
  if (c.error) console.error('telegram-webhook: выборка контактов упала:', c.error.message);
  if (co.error) console.error('telegram-webhook: выборка компаний упала:', co.error.message);

  return {
    contacts: (c.data ?? []) as DedupContactRow[],
    companies: (co.data ?? []) as DedupCompanyRow[],
  };
}

/** `organizations.settings.app_url` или null. Валидность проверяет `entityUrl`. */
async function loadAppUrl(supabase: Supa, orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  if (error) {
    console.error('telegram-webhook: чтение settings упало:', error.message);
    return null;
  }
  const url = (data as { settings?: { app_url?: unknown } } | null)?.settings?.app_url;
  // Фолбэк — тот же литерал, что APP_ORIGIN в src/lib/utils/entity-links.ts и в 107.
  return typeof url === 'string' && url.trim() !== ''
    ? url.trim()
    : 'https://dashboard-crm-ten.vercel.app';
}

// ═══ Свободный текст ═══

/**
 * Разбор пересланного текста и карточка подтверждения.
 *
 * Порядок шагов важен: «Разбираю…» уходит ДО обращения к модели. Разбор занимает
 * секунды, а молчание бота человек читает как поломку и присылает текст повторно —
 * то есть платит вторым прогоном модели за наше молчание.
 */
export async function handleCaptureText(
  supabase: Supa,
  bot: BotApi,
  chatId: number,
  fromId: number,
  rawText: string,
): Promise<void> {
  const actor = await resolveActor(supabase, fromId);
  if (!actor) {
    await bot.send(chatId, MSG_NOT_LINKED);
    return;
  }

  if (rawText.length > CAPTURE_MAX_CHARS) {
    await bot.send(chatId, MSG_TOO_LONG);
    return;
  }

  const progressId = await bot.send(chatId, MSG_PARSING);
  // Не отправилась заглушка — редактировать нечего; дальше отвечаем новым
  // сообщением. Терять разбор из-за сбоя одного sendMessage незачем.
  const say = async (text: string, opts?: { parseMode?: 'HTML'; replyMarkup?: unknown }) => {
    if (progressId !== null) await bot.edit(chatId, progressId, text, opts);
    else await bot.send(chatId, text);
  };

  const parsedRaw = await invokeJson(supabase, 'ai-capture', { text: rawText });
  // ⚠️ ДВА РАЗНЫХ ИСХОДА, РАНЬШЕ СКЛЕЕННЫЕ В ОДНУ СТРОКУ. `invokeJson` отдаёт
  //    `null` ТОЛЬКО на сбое вызова — это наша сторона, и «попробуйте ещё раз»
  //    там ложный совет. Ответ, не легший в схему, — другое дело: он приходит
  //    объектом, и повтор с другой формулировкой может сработать.
  if (parsedRaw === null) {
    await say(MSG_UNAVAILABLE);
    return;
  }
  const parsed = narrowCapture((parsedRaw as { result?: unknown } | null)?.result);
  if (!parsed) {
    await say(MSG_PARSE_FAILED);
    return;
  }

  // ⚠️ ИНН НЕ ПАРСИТ МОДЕЛЬ. Чексумма ФНС на нашей стороне → ЕГРЮЛ. Реквизиты —
  //    факт реестра, а не догадка LLM (инвариант фичи).
  const inn = extractInn(rawText);

  const contact = contactFields(parsed.contact, rawText);
  let company = companyFields(parsed.company, rawText, inn) as CaptureCardCompany &
    Record<string, unknown>;

  // За реквизитами идём, только если есть за чем: без ИНН реестру нечего сказать.
  if (inn && (parsed.intent === 'company' || parsed.intent === 'unclear' || parsed.company)) {
    const lookup = (await invokeJson(supabase, 'company-lookup', { inn })) as LookupResult | null;
    // `found: false` — штатный ответ «такого ИНН в ЕГРЮЛ нет», а не сбой: карточка
    // уходит с тем, что разобрала модель.
    if (lookup && lookup.found === true) {
      company = mergeLookup(companyFields(parsed.company, rawText, inn), lookup) as typeof company;
    }
  }

  // Пустой разбор — честный исход, а не ошибка. Пустую карточку с кнопкой
  // «Создать» показывать нельзя: она предлагает завести карточку ни о чём.
  const hasContact = Boolean(contact.first_name || contact.last_name || contact.email || contact.phone);
  const hasCompany = Boolean(company.name || company.inn);
  if (!hasContact && !hasCompany) {
    await say(MSG_EMPTY);
    return;
  }

  const { contacts, companies } = await loadDedupRows(supabase, actor.org_id);
  const duplicate: CaptureDuplicate | null = findCaptureDuplicate(
    { contact: parsed.contact ? contact : null, company: parsed.company ? company : null },
    inn,
    contacts,
    companies,
  );

  // Ветка сужается фактами: модель сказала «unclear», но одной из веток в тексте
  // нет — спрашивать не о чем.
  let kind: 'contact' | 'company' | 'unclear' = parsed.intent;
  if (kind === 'unclear') {
    if (hasContact && !hasCompany) kind = 'contact';
    else if (hasCompany && !hasContact) kind = 'company';
  }

  const { data: draftRow, error: draftErr } = await supabase
    .from('telegram_capture_drafts')
    .insert({
      org_id: actor.org_id,
      profile_id: actor.profile_id,
      kind,
      payload: { contact, company },
      source_text: rawText,
      duplicate_id: duplicate?.id ?? null,
      duplicate_kind: duplicate?.kind ?? null,
    })
    .select('id')
    .single();

  const draftId = (draftRow as { id?: string } | null)?.id ?? null;
  if (draftErr || !draftId) {
    console.error('telegram-webhook: черновик не записан:', draftErr?.message ?? 'нет id');
    // Разбор к этому моменту УЖЕ состоялся — «не удалось разобрать текст» здесь
    // было бы неправдой, а «пришлите ещё раз» — бесполезным советом.
    await say(MSG_UNAVAILABLE);
    return;
  }

  const appUrl = await loadAppUrl(supabase, actor.org_id);
  const card = buildCaptureCard({
    draftId,
    kind,
    contact: hasContact ? (contact as CaptureCardContact) : null,
    company: hasCompany ? (company as CaptureCardCompany) : null,
    duplicate,
    appUrl,
  });

  // parse_mode HTML — можно: текст СВОЙ и экранирован (см. editMessage в index.ts).
  await say(card.text, { parseMode: 'HTML', replyMarkup: card.reply_markup });
}

/** Привязка по `from.id`. Org берётся ОТТУДА ЖЕ — второго источника у бота нет. */
async function resolveActor(supabase: Supa, fromId: number): Promise<TelegramActor | null> {
  const { data, error } = await supabase
    .from('telegram_accounts')
    .select('profile_id, org_id')
    .eq('telegram_user_id', fromId)
    .maybeSingle();
  if (error) {
    console.error('telegram-webhook: чтение привязки упало:', error.message);
    return null;
  }
  const row = data as { profile_id?: string; org_id?: string } | null;
  return row?.profile_id && row?.org_id
    ? { profile_id: row.profile_id, org_id: row.org_id }
    : null;
}

// ═══ Нажатия кнопок карточки ═══

/**
 * Кнопки «Создать» / «Отмена» / выбор ветки.
 *
 * ⚠️ `answerCallbackQuery` — В КАЖДОЙ ВЕТКЕ, включая отказные: без ответа кнопка
 *    «крутится» до таймаута Telegram, и человек жмёт её повторно.
 *
 * ⚠️ АКТОР — ПО `from.id`, А НЕ ПО `message.chat.id`. В личном чате они совпадают,
 *    но кнопку можно нажать и в пересланном сообщении: там chat чужой, а `from`
 *    всегда тот, кто нажал.
 */
export async function handleCaptureCallback(
  supabase: Supa,
  bot: BotApi,
  cq: { id: string; from_id: number; chat_id: number | null; message_id: number | null },
  parsedData: CaptureCallback,
): Promise<void> {
  const actor = await resolveActor(supabase, cq.from_id);
  if (!actor) {
    await bot.answer(cq.id, MSG_NOT_LINKED);
    return;
  }

  const canEdit = cq.chat_id !== null && cq.message_id !== null;

  if (parsedData.action === 'cancel') {
    const { data, error } = await supabase.rpc('tg_cancel_capture', {
      p_actor_id: actor.profile_id,
      p_draft_id: parsedData.draftId,
    });
    if (error) {
      await bot.answer(cq.id, error.code === '42501' ? CB_FOREIGN : CB_FAILED);
      if (error.code !== '42501') {
        console.error('telegram-webhook: tg_cancel_capture упала:', error.message);
      }
      return;
    }
    const status = (data as { status?: string } | null)?.status;
    await bot.answer(cq.id, status === 'already_applied' ? CB_ALREADY : CB_CANCELLED);
    // Клавиатуру снимаем в любом исходе: возвращаться к этой карточке незачем.
    if (canEdit) {
      await bot.edit(
        cq.chat_id as number,
        cq.message_id as number,
        status === 'already_applied' ? '✓ Уже создано' : '× Отменено',
      );
    }
    return;
  }

  const { data, error } = await supabase.rpc('tg_apply_capture', {
    p_actor_id: actor.profile_id,
    p_draft_id: parsedData.draftId,
    p_kind: parsedData.kind,
  });

  if (error) {
    // 42501 — единственный ожидаемый отказ: чужой черновик, другая org или роль
    // viewer. Текст сообщения различает только последнюю: остальное человеку
    // одинаково значит «это не ваше».
    if (error.code === '42501') {
      await bot.answer(cq.id, error.message?.includes('viewer') ? CB_NO_RIGHTS : CB_FOREIGN);
      return;
    }
    console.error('telegram-webhook: tg_apply_capture упала:', error.message);
    await bot.answer(cq.id, CB_FAILED);
    return;
  }

  const result = (data ?? {}) as {
    status?: string;
    id?: string;
    kind?: 'contact' | 'company';
    label?: string;
  };

  if (result.status === 'created' && result.id && result.kind) {
    await bot.answer(cq.id, CB_CREATED);
    if (canEdit) {
      const appUrl = await loadAppUrl(supabase, actor.org_id);
      // ⚠️ БЕЗ parse_mode: текст уходит как есть, без разметки и без экранирования.
      //    Название с амперсандом иначе уронило бы правку — а правка здесь и есть
      //    единственный признак того, что запись создана.
      await bot.edit(cq.chat_id as number, cq.message_id as number, buildAppliedText(result.kind, result.label ?? ''), {
        replyMarkup: buildAppliedKeyboard(appUrl, result.kind, result.id),
      });
    }
    return;
  }

  // ⚠️ ШТАТНЫЙ ИСХОД, А НЕ СБОЙ (111, S-TG-3-INN-DUP). Вставка компании упёрлась в
  //    `uq_companies_org_inn`: такая организация в org уже заведена. Раньше это
  //    приходило исключением и человек видел «Не удалось. Откройте CRM» — без
  //    единого слова про ИНН и с живой кнопкой, дающей ровно тот же ответ.
  if (result.status === 'duplicate_inn') {
    await bot.answer(cq.id, CB_DUPLICATE_INN);
    if (canEdit) {
      // `id` может прийти NULL: запись удалили между падением вставки и поиском.
      // Тогда текст без кнопки — ссылка в никуда хуже её отсутствия.
      const appUrl = result.id ? await loadAppUrl(supabase, actor.org_id) : null;
      await bot.edit(
        cq.chat_id as number,
        cq.message_id as number,
        buildAppliedText('company', result.label ?? '', 'duplicate_inn'),
        {
          // Клавиатуру снимаем в любом случае: работа по черновику закончена, он
          // закрыт как applied, и повторное нажатие даст тот же ответ.
          replyMarkup: result.id
            ? buildAppliedKeyboard(appUrl, 'company', result.id)
            : { inline_keyboard: [] },
        },
      );
    }
    return;
  }

  if (result.status === 'already_applied') {
    await bot.answer(cq.id, CB_ALREADY);
    if (canEdit) await bot.edit(cq.chat_id as number, cq.message_id as number, '✓ Уже создано');
    return;
  }

  if (result.status === 'kind_required') {
    // Прилетает только на `tgcap:` по черновику `unclear` — то есть на кнопку,
    // которой в такой карточке нет. Значит, сообщение старое; молчать нельзя.
    await bot.answer(cq.id, CB_NEED_KIND);
    return;
  }

  // 'not_found' — черновик вычистил ретеншн (сутки) либо его отменили. Кнопку
  // убираем: возвращаться к ней незачем.
  await bot.answer(cq.id, result.status === 'cancelled' ? CB_CANCELLED : CB_EXPIRED);
  if (canEdit) {
    await bot.edit(
      cq.chat_id as number,
      cq.message_id as number,
      result.status === 'cancelled' ? '× Отменено' : '× Черновик устарел — пришлите текст ещё раз',
    );
  }
}
