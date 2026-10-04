# Спринт S-BRIEF-IN-DEAL-1.2 — AI-бриф компании в шаге сделки (кнопка и панель)

**03.10.2026, сверено с `main` `0a36e0a` 04.10.** **Вход:** S-BRIEF-IN-DEAL-1.1 влит (#161), миграция 138 применена, типы перегенерированы: в `src/types/supabase.gen.ts` есть `company_brief_auto_state` и `auto_reason`. Нет — стоп, в отчёт «вход не выполнен». **Миграций нет.** После 1.1 в `main` влиты S-TODAY-V3 (#162–#166) и страж (#167, #168): `DealNextStep.tsx`, `use-ai-run.ts`, `section-state.ts` не менялись; `globals.css` сдвинулся на +34 строки — якоря ниже по `grep`, не по номерам строк.
**Ветка:** `feat/brief-in-deal-1`, worktree по `worktree-isolation`. Файл лежит в основном чекауте (`_analysis/sprint-S-BRIEF-IN-DEAL-1.2.md`, untracked, в `main` его нет) — скопировать в worktree первым делом и закоммитить вместе с кодом: страж (`.claude/guard.json`, правило `sprint-file`) отклонит коммит с `src/` без спринт-файла в ветке.
**Экран — апрувленный мокап:** `_analysis/mockup-S-BRIEF-IN-DEAL-1.html` (копия артефакта «AI-бриф в шаге сделки», апрув владельца 03.10). Размеры, отступы и тексты — оттуда; расхождение мокапа и этого файла решает этот файл (правки при апруве — ниже).
**Решения:** проект Claude — `claude/mockup-brief-in-deal-2026-10-03.md`.

## Зачем

После 1.1 бриф собирается сам, но в сделке его по-прежнему не видно: `CompanyBriefRenderer` живёт только в карточке компании. Менеджер готовится к звонку в сделке — там бриф и нужен. Владелец отклонил карточку в правой рельсе («справа может потеряться») и предложил кнопку у «Шаг сделан» с панелью под шагом.

## Решения владельца (апрув 03.10)

1. **Кнопка** «AI-бриф · дд.мм ⌄» — в футере стекла «Следующий шаг», левая группа, сразу после «Шаг сделан». Нет `next_step` (нет «Шаг сделан») — после даты и пометок просрочки.
2. **Панель** раскрывается внутри того же стекла под футером, отделена волосяной линией. По умолчанию свёрнута; выбор «открыто/закрыто» запоминается в `localStorage` — один на все сделки. Рельса «Контекст» брифа не получает.
3. **Точка «новое»** — бриф моложе 14 дн. и этот пользователь его ещё не раскрывал (по компании, в `localStorage`). Гаснет при раскрытии.
4. **Лимит автозапуска 10 в сутки** — в текстах очереди; ручные «Обновить» / «Собрать сейчас» / «Повторить сейчас» вне лимита.

**Правки мокапа, принятые без отдельного решения:**
- «в очереди»: в мокапе «Соберём сегодня: лимит занят — 3 из 3» — противоречие. Текст — по фактическому состоянию (ЗАДАЧА 1, `briefNote`).
- «устарел»: не обещать «сегодня» — «обновление стоит в очереди автосбора».
- «Что искали» (мало данных) — нечем наполнить: запросы поиска не хранятся (`meta.searches` — только число). Вместо неё — «Весь бриф».
- «Мало данных» в мокапе: «ни сайта, ни новостей» — не всегда правда (сайт бывает). Текст без этой части.
- Подпись мокапа «"Шаг сделан" у viewer и так нет» кодом не подтверждена: в `DealNextStep.tsx` кнопка ролью не гейтится. Существующую кнопку не трогаем.

## Что НЕ меняется

- `AiCompanyPanel`, `CompanyBriefRenderer`, `AiRunResultModal` — переиспользуются как есть.
- Порядок и вид остальных элементов футера `DealNextStep` (дата, просрочка, переносы, «Шаг сделан», «без касания», чип контакта) — байт-в-байт.
- `DealContextRail` и зона «Контекст» — без изменений.
- БД, RLS, `ai-run` — без изменений. Ручной запуск — существующий `useStartRun('company', …)`.
- `crm-architect/*`, `STATUS.md` — правит гейт.

## Ограничения проекта, которые здесь легко нарушить

- **Боковых кантов и полос слева нет** — ни у панели, ни у пунктов зацепок (preferences владельца). Маркер пункта — точка.
- **Волосяная линия панели — классом в CSS материала, не утилитой `border-t`:** safety-net тёмных тем `.t-frost *` (`globals.css`, блок «DARK THEME BORDER SAFETY NET», ~стр. 2060) перебивает `border-*`-утилиты при равной специфичности — тот же приём, что `data-empty` у стекла.
- **Параллельно может идти S-TODAY-FOCUS** — он тоже дописывает блоки в `globals.css`. Свой блок — только в материале стекла после dark safety-net; чужие блоки и их порядок не трогать.
- Цвета — только токены; на стекле `--text` / `--text-dim` / `--accent` / `--warning-text` уже переадресованы на `--sheet-*` (блок `.glass-sheet` в `globals.css`) — утилиты потомков работают без theme-if.
- Единицы — rem; эмодзи нет, иконки Lucide.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -3
grep -n "company_brief_auto_state\|auto_reason" src/types/supabase.gen.ts | head
grep -n "auto_reason" src/types/database.ts
sed -n 50,207p src/components/projects/DealNextStep.tsx
grep -n "export function useEntityRuns" -A 30 src/lib/hooks/use-ai-run.ts
grep -n "export function useStartRun" -A 45 src/lib/hooks/use-ai-run.ts
sed -n 1,40p src/components/ai/AiRunResultModal.tsx
cat src/lib/hooks/use-org-role.ts
cat src/lib/utils/section-state.ts
grep -rln "section-state" src tests | head
grep -n "export interface CompanyBriefResult" -A 22 src/types/database.ts
cat src/lib/utils/action-date.ts
grep -n "export function pluralRu" -A 8 src/lib/utils/plural.ts
grep -n "DARK THEME BORDER SAFETY NET" -A 14 src/app/globals.css
grep -n "^\.glass-sheet,$" -A 24 src/app/globals.css
grep -rn "from 'sonner'\|useToast\|toast\." src/components/projects/*.tsx | head -3
grep -n "company?:" src/lib/hooks/use-projects.ts
```

Ответить до кода:
- как `section-state.ts` читается в компоненте без расхождения гидратации (SSR видит пустой `localStorage`) — тем же способом читаются `deal-brief:*`;
- какой ключ React Query у `useEntityRuns('company', id)` — его инвалидирует опрос в состоянии «в очереди»;
- где в `globals.css` блок материала стекла после dark safety-net — туда встают `.glass-divider` и `.glass-skeleton`;
- как проекту принято показывать ошибку мутации (тост) — так же для сбоя ручного запуска.

---

## ЗАДАЧА 1: Домен брифа — `src/lib/domain/company-brief.ts`

Чистые функции, время — аргументом `now`. Тесты — сразу после файла (раздел ТЕСТЫ).

```ts
export const BRIEF_NEW_DAYS = 14;
/** Зеркало порога `stale` в company_brief_candidates() (миграция 138) — менять парой. */
export const BRIEF_STALE_DAYS = 90;
/** «Мало данных» — источников ≤ 1. Прод 03.10: 2 из 24 брифов без источников, следующий минимум — 2. */
export const BRIEF_LOW_DATA_MAX_SOURCES = 1;
/** Зеркало «не больше 2 автопопыток на компанию в сутки» (138). */
export const BRIEF_AUTO_MAX_ATTEMPTS = 2;

export type BriefAutoReason = 'no_brief' | 'stale' | 'stage';
/** Строка company_brief_auto_state(); null — RPC не ответил или компания вне org. */
export type BriefAutoState = {
  reason: BriefAutoReason | null;
  used_today: number;
  daily_limit: number;
  attempts_today: number;
};

export type BriefRuns = { latestDone: AiRunRow | null; active: AiRunRow | null; latest: AiRunRow | null };
export type BriefKind = 'new' | 'fresh' | 'stale' | 'lowData' | 'running' | 'queued' | 'failed' | 'none';

/** Строка RPC → домен. Сгенерированный тип врёт про NULL (см. ниже) — сужаем из unknown. */
export function toBriefAutoState(row: unknown): BriefAutoState | null;
export function pickBriefRuns(runs: AiRunRow[]): BriefRuns;
export function briefAgeDays(createdAt: string, now: Date): number;
export function isBriefLowData(result: CompanyBriefResult | null | undefined): boolean;
export function briefKind(i: { runs: BriefRuns; auto: BriefAutoState | null; seenRunId: string | null; now: Date }): BriefKind;
export function briefNote(i: { kind: BriefKind; runs: BriefRuns; auto: BriefAutoState | null }): string | null;
export function briefAction(kind: BriefKind): { label: string; lead?: string } | null;
export function pickHeadlineNews(news: CompanyBriefResult['recent_news'] | undefined): CompanyBriefResult['recent_news'][number] | null;
export function newsHost(url: string): string | null;
export function formatBriefChipDate(iso: string): string;               // «04.09»
export function formatBriefMetaDate(iso: string, now: Date): string;     // «4 сентября · 29 дн. назад»
```

Правила:
- `toBriefAutoState` — **сгенерированный тип `company_brief_auto_state` говорит `reason: string`, а на деле там бывает NULL**: Postgres не передаёт NULL-ность колонок `RETURNS TABLE`, генератор ставит их не-NULL (реген 04.10, коммит `b7a01f2`). Поэтому строку RPC не кастуем, а сужаем: не объект → `null`; `reason` вне `'no_brief' | 'stale' | 'stage'` → `null`; числа — `Number.isFinite`, иначе 0.
- `pickBriefRuns` — только `preset_key === 'company_brief'`, порядок по `created_at` убыв. (на порядок входа не полагаться). `active` — `pending` / `running`; `latestDone` — последний `done`; `latest` — последний любой.
- `briefAgeDays` — целые сутки `floor((now − created) / 86 400 000)`, только для подписи «N дн. назад». Пороги 14 / 90 сравниваются в миллисекундах (`now − created > 90 суток`), как `interval '90 days'` в 138: иначе на границе UI показал бы «свежий», а тик уже поставил бы обновление.
- `isBriefLowData` — `Array.isArray(result.sources) && result.sources.length <= BRIEF_LOW_DATA_MAX_SOURCES`. Поля нет (старый прогон) — `false`: сказать нечего, молчим (принцип `CompanyBriefRenderer`).
- `briefKind` — первое сработавшее:
  1. есть `active` → `running`;
  2. есть `latestDone`: старше `BRIEF_STALE_DAYS` суток → `stale`; иначе мало данных → `lowData`; иначе моложе `BRIEF_NEW_DAYS` суток и `seenRunId !== latestDone.id` → `new`; иначе `fresh`;
  3. `latest?.status === 'error'` → `failed`;
  4. `auto?.reason` → `queued`;
  5. иначе `none`.
- `briefNote` (тексты дословно, `—` — длинное тире):
  - `running`, `active.auto_reason` есть, `latestDone` нет: «Запущено автоматически: {причина}. Можно закрыть страницу — бриф соберётся без неё.»; причина: `no_brief` — «у компании не было брифа», `stale` — «бриф старше 90 дней», `stage` — «сделка перешла в рабочую стадию, а бриф старше 30 дней»;
  - `running`, ручной, `latestDone` нет: «Собираем бриф, около минуты. Можно закрыть страницу — бриф соберётся без неё.»;
  - `running`, `latestDone` есть: «Обновляем бриф, около минуты. Пока показана прежняя версия.»;
  - `stale`: «Бриф старше 90 дней: руководство и новости могли смениться.» + при `auto.reason === 'stale'` « Обновление стоит в очереди автосбора.»;
  - `lowData`: «В открытых источниках о компании почти ничего нет. Контекст соберите на встрече.»;
  - `queued`: `daily_limit === 0` — «Брифа ещё нет. Автосбор выключен в настройках организации.»; `used_today >= daily_limit` — «Брифа ещё нет. Лимит автосбора на сегодня исчерпан ({used} из {limit}) — соберём завтра.»; иначе — «Брифа ещё нет. Соберём автоматически в рабочее время, обычно в течение часа.»;
  - `failed`: `auto` есть, `daily_limit > 0`, `used_today < daily_limit` и (`reason` есть или `attempts_today < BRIEF_AUTO_MAX_ATTEMPTS`) — «Не удалось собрать бриф. Повторим автоматически примерно через час.»; иначе — «Не удалось собрать бриф. Автоповтор — завтра.»;
  - `none`: «Брифа нет.»; `new` / `fresh` — `null`.
- `briefAction`: `new` / `fresh` / `lowData` — «Обновить»; `stale` — «Обновить сейчас»; `queued` — «Собрать сейчас» с `lead` «Нужно до звонка?»; `none` — «Собрать сейчас»; `failed` — «Повторить сейчас»; `running` — `null`.
- `pickHeadlineNews` — самая свежая по `Date.parse(date)`; без даты и с непарсящейся датой — после датированных, в исходном порядке; пусто → `null`.
- `newsHost` — `hostname` без `www.`; невалидный URL → `null`.
- `formatBriefMetaDate` — `formatActionDate` по ключу дня (`YYYY-MM-DD` из `created_at`, локальная дата) + ` · N дн. назад` при возрасте ≥ 2.

## ЗАДАЧА 2: Хранилище панели — `src/lib/utils/brief-panel-state.ts`

По образцу `section-state.ts` (чистые ключи + чтение/запись в `try/catch`, приватный режим Safari бросает):

```ts
export const BRIEF_PANEL_OPEN_KEY = 'deal-brief:open';
export function briefSeenKey(companyId: string): string;           // 'deal-brief:seen:<companyId>'
export function readBriefPanelOpen(): boolean;                      // '1' → true, иначе false
export function writeBriefPanelOpen(open: boolean): void;
export function readBriefSeen(companyId: string): string | null;    // id прогона
export function writeBriefSeen(companyId: string, runId: string): void;
```

Одна запись «увиденного» на компанию — хранилище не растёт с числом брифов.

## ЗАДАЧА 3: Хук — `src/lib/hooks/use-deal-brief.ts`

`useDealBrief(companyId: string | null)`:
- прогоны — `useEntityRuns('company', companyId)` (общий ключ с карточкой компании, второго запроса нет); `pickBriefRuns`;
- состояние автосбора — `useQuery(['brief-auto-state', companyId])` → `supabase.rpc('company_brief_auto_state', { p_company_id })`, первая строка через `toBriefAutoState`, нет строки → `null`; `staleTime` 60 с, `refetchOnWindowFocus`; ошибка RPC → `null` (кнопка живёт без очереди);
- при смене `id` / `status` последнего прогона — инвалидировать `['brief-auto-state', companyId]`;
- в состоянии `queued` — раз в 60 с инвалидировать ключ прогонов компании (автопрогон стартует в фоне, Realtime по `ai_runs` доезжает не всегда — комментарий в `useEntityRuns`); очистка интервала обязательна;
- `open` / `seenRunId` — из `brief-panel-state` способом, найденным в РАЗВЕДКЕ (без расхождения гидратации); `toggle()` пишет `deal-brief:open`;
- раскрыто и есть `latestDone` → `writeBriefSeen(companyId, latestDone.id)` (точка гаснет и после перезагрузки);
- `canRun` — роль известна и не `viewer` (пока роль грузится — `false`);
- `run()` — `useStartRun('company', companyId).mutate({ preset_key: 'company_brief' })`; успех — инвалидировать оба ключа; ошибка — тост проекта с текстом ошибки invoke;
- наружу: `kind`, `runs`, `auto`, `open`, `toggle`, `canRun`, `run`, `starting`.

## ЗАДАЧА 4: Кнопка, панель и место в `DealNextStep`

**`src/components/projects/DealBriefButton.tsx`**
- Классы — как у «Шаг сделан» (рамка `border-border`, `rounded-lg`, `px-2 py-0.5`, `text-xs`, `text-text-dim`, hover `bg-surface2` + `text-text`), `whitespace-nowrap`; раскрыта — `bg-surface2 text-text`.
- Состав: [точка «новое»] [иконка 14] «AI-бриф» [`·` + хвост] [`ChevronDown` 12, поворот 180° при раскрытии, `transition-transform`].
- Иконки Lucide: базовая `WandSparkles`; `running` — `Loader2` с `motion-safe:animate-spin`; `queued` — `Clock`; `failed` — `AlertCircle`.
- Хвост: `new` / `fresh` — `formatBriefChipDate` (`tabular-nums`); `stale` — та же дата классом `text-warning-text`; `running` — «собираем…»; `queued` — «в очереди»; `lowData` — «мало данных»; `failed` — «не собран»; `none` — «нет брифа».
- Точка: `size-[0.4375rem] rounded-full bg-accent`, `aria-hidden` (на стекле `bg-accent` уже перекрашен в метку темы правилом `.glass-sheet .bg-accent`).
- A11y: `aria-expanded`, `aria-controls="deal-brief-panel"`; у `new` — `aria-label="AI-бриф компании, новый"`.

**`src/components/projects/DealBriefPanel.tsx`** — внутри стекла, после футера:
- обёртка: `id="deal-brief-panel"`, `role="region"`, `aria-label="AI-бриф компании"`, класс `glass-divider` + `mt-3.5 pt-3.5 flex flex-col gap-3`;
- **верхняя строка** (`flex flex-wrap items-center gap-x-4 gap-y-1.5`):
  - мета (`text-meta text-text-dim`, перенос по словам, `flex-1 basis-72`): «Бриф компании **{project.company.name}**» · `formatBriefMetaDate` · «{N} источник/источника/источников» (`pluralRu`); без готового брифа вместо даты и источников — «собираем, около минуты» / «брифа ещё нет» / «не собран»;
  - действия (справа): «Весь бриф» — кнопка-ссылка `text-xs font-semibold text-accent` + `FileText` 12, открывает `AiRunResultModal` с `latestDone` (только когда он есть); пилюля действия по `briefAction` с `RefreshCw` 12 (классы кнопки выше), перед ней `lead` (`text-xs text-text-dim`); при `canRun === false` пилюли нет; при `starting` — `disabled`;
- **строка-примечание** `briefNote` (`text-body text-text-dim max-w-[72ch]`): у `stale` — `text-warning-text`; у `lowData` — иконка `SearchX` 13 перед текстом;
- **при готовом брифе:** сводка `summary` — `max-w-[72ch] text-sm leading-normal line-clamp-3`; зацепки — заголовок «Зацепки для разговора · 2 из {N}» (при N > 2, иначе без хвоста; `text-meta font-semibold text-text-dim`), первые две, каждая `line-clamp-2 max-w-[72ch]`, маркер — точка 5px `bg-text-dim`, **не полоса**; новость (`pickHeadlineNews`) одной строкой `flex items-baseline gap-2 min-w-0 max-w-[72ch]`: «Новость» · дата (`ru-RU`, `tabular-nums`; нет — «без даты») · ссылка `target="_blank" rel="noopener noreferrer"`: заголовок с `truncate` + `newsHost` + `ExternalLink` 11. Нет зацепок / новости — блок не рисуется;
- **`running` без готового брифа:** каркас повторяет раскладку готового (по завершении ничего не прыгает): три полосы 96 / 90 / 58 % + две колонки по две полосы; класс `glass-skeleton`;
- `queued` / `failed` / `none` без готового брифа: верхняя строка + примечание, без каркаса.

**`src/app/globals.css`** — в блок материала стекла **после** dark safety-net:
```css
/* S-BRIEF-IN-DEAL-1.2: разделитель внутри стекла. Классом, а не утилитой border-t:
   safety-net `.t-frost *` перебивает border-утилиты при равной специфичности. */
.glass-sheet .glass-divider { border-top: 1px solid var(--sheet-plate-border); }
.glass-sheet .glass-skeleton {
  height: 0.5625rem;
  border-radius: 999px;
  background: var(--sheet-plate-bg);
}
```

**`DealNextStep.tsx`**
- `const brief = useDealBrief(project.company_id ?? null);`
- `DealBriefButton` — сразу после блока «Шаг сделан», до правой группы (`ml-auto`). `project.company_id` пуст — ни кнопки, ни панели.
- `{brief.open && <DealBriefPanel … />}` — после `div` футера, внутри `glass-sheet`.
- Комментарий у вставки: место и причина (левая группа — «что делаем с шагом»; в правой на 1280 футер давал третью строку — замер мокапа).

---

## ТЕСТЫ

`tests/unit/company-brief.test.ts` — поведением:
- `toBriefAutoState`: `{ reason: null, used_today: 3, daily_limit: 10, attempts_today: 0 }` → `reason: null`; `reason: 'stage'` → сохраняется; `reason: 'другое'` → `null`; `used_today: '3'` или `NaN` → 0; `null` / строка → `null`;
- `pickBriefRuns`: чужие пресеты отброшены; несортированный вход → `latestDone` / `active` / `latest` верные; пусто → все `null`;
- `isBriefLowData`: 0 и 1 источник → `true`; 2 → `false`; поля `sources` нет → `false`; `null` → `false`;
- `briefKind`: активный прогон при свежем готовом → `running`; ровно 90 суток → не `stale`, 90 суток + 1 ч → `stale`; 1 источник и 30 суток → `lowData`; 13 суток и не видел → `new`; 13 суток и `seenRunId === latestDone.id` → `fresh`; ровно 14 суток → `fresh`; нет готового и последний `error` → `failed`; нет готового, `auto.reason = 'no_brief'` → `queued`; нет ничего и `auto = null` → `none`;
- `briefNote`: `queued` при `used 10 / limit 10` → текст про «завтра» и «10 из 10»; при `used 3 / limit 10` → «в течение часа»; при `limit 0` → «выключен»; `failed` при `attempts 2`, `reason null` → «завтра»; при `attempts 1` → «примерно через час»; `running` с `auto_reason = 'stage'` → текст про рабочую стадию; `new` → `null`;
- `pickHeadlineNews`: из трёх с датами — самая свежая; датированная раньше недатированной; все без дат — первая; пусто → `null`;
- `newsHost`: `https://www.forbes.ru/x` → `forbes.ru`; мусор → `null`;
- `formatBriefMetaDate`: возраст 29 → «… · 29 дн. назад»; сегодня → «сегодня» без хвоста.

`tests/unit/brief-panel-state.test.ts` — запись и чтение `open` и `seen`; хранилище, которое бросает на `getItem` / `setItem`, → дефолты без исключения.

UI — без юнит-тестов: разметка и связки.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -8
grep -nE "#[0-9a-fA-F]{3,8}\b" src/components/projects/DealBrief*.tsx
grep -n "border-l\|border-t" src/components/projects/DealBrief*.tsx
npm run build 2>&1 | tail -5
```
Оба `grep` — пусто.

Визуально (`npm run dev`, тема **minimal**, затем aura и frost; ширина 1280 с сайдбаром). **Сделки клиентов на проде не трогать** — смоки на тестовой компании:
- футер в худшем случае (просрочка + переносы + «Шаг сделан» + бриф + «без касания» + чип) — не больше двух строк;
- компания без брифа: «в очереди» → «Собрать сейчас» → «собираем…» с каркасом → готовый бриф без скачка высоты; точка «новое»; раскрыл — точка погасла и не вернулась после перезагрузки;
- состояние панели переживает перезагрузку и переход в другую сделку;
- «Весь бриф» открывает модалку брифа, со сделки не уводит;
- viewer: кнопка и панель есть, пилюли действия нет;
- сделка без компании — кнопки нет;
- клавиатура: Tab до кнопки, Enter / Space раскрывает, фокус-кольцо видно на стекле во всех трёх темах;
- `stale` / `lowData` / `failed` воспроизводятся только данными — они закрыты тестами домена; визуально — если найдутся на тестовой компании.

## КОММИТ

Явным списком, не `git add -A`. `git add` и `git commit` — двумя отдельными вызовами Bash (страж oleg-guard, правило C2); спринт-файл — в том же списке (правило `sprint-file`).

```
git add _analysis/sprint-S-BRIEF-IN-DEAL-1.2.md src/lib/domain/company-brief.ts src/lib/utils/brief-panel-state.ts src/lib/hooks/use-deal-brief.ts src/components/projects/DealBriefButton.tsx src/components/projects/DealBriefPanel.tsx src/components/projects/DealNextStep.tsx src/app/globals.css tests/unit/company-brief.test.ts tests/unit/brief-panel-state.test.ts
```

```
git commit -m "feat(deals): AI-бриф компании в шаге сделки — кнопка, панель, состояния (S-BRIEF-IN-DEAL-1.2)" -m "Кнопка «AI-бриф · дата» после «Шаг сделан», панель внутри стекла: сводка, две зацепки, свежая новость, «Весь бриф» — модалка прогона. Состояния: новый, свежий, устарел, мало данных, собирается, в очереди (лимит автосбора), не собран. Раскрытие и «увиденное» — localStorage. Тексты очереди по фактическому состоянию RPC company_brief_auto_state."
```

Без push.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, таблицы, функции.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд. Без цепочек «осуществление проведения проверки».
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · 42 теста passed · build exit 0).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».
