# Claude Code Prompt — S-TODAY-V3-SCREEN-1: экран «Сегодня» — ходы и сделки

**Основание:** `_analysis/today-v3-spec.md`, макет `_analysis/mockup-S-TODAY-V3.html` (кадры 1–3, 7, 10, 11).
**Эпик:** S-TODAY-V3, спринт 2 из 3. **Зависимость:** `S-TODAY-V3-DOMAIN-1` в `main` (`deal-touch.ts`, `today-deals.ts`, `buildPulseDays`).
**Схема:** миграций нет, БД не трогаем, типы не меняются.
**Цель:** `/` показывает три хода дня и сделки по группам; обрезанных названий и шагов — 0 на 1440 и на 1280.
**Действия в этом спринте — прежние:** «Запланировать шаг» открывает `ProjectModal`, «Отложить» ставит snooze. Форма хода на месте, «Сделано», «Перенести», счётчик «N из 3» — спринт ACT-1. Подписи кнопок из макета (кадры 4–6, 9) сюда не переносить.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. Домен из DOMAIN-1 в main — ожидание: все экспорты найдены
grep -n "export function classifyDeal\|export function pickMoves\|export function riskSignals\|export function compareByWeight" src/lib/domain/today-deals.ts
grep -n "export function dropStageBounces\|export const TOUCH_EVENT_TYPES" src/lib/domain/deal-touch.ts
grep -n "export function buildPulseDays" src/lib/domain/deal-pulse.ts
ls tests/unit/fixtures/today-2026-10-03.ts

# 2. Текущий экран — ожидание: 632 строки, секции по типу сущности, max-w-3xl
wc -l src/components/today/TodayView.tsx src/components/today/QueueRow.tsx src/components/today/TodayFocus.tsx
grep -n "<Section title=\|max-w-3xl\|TodayFocus\|ProjectModal" src/components/today/TodayView.tsx

# 3. Потребители пульса — ожидание: useDealPulse зовёт только DealPulseCard
grep -rn "useDealPulse\|silenceWithin" src --include=*.ts --include=*.tsx | grep -v "^src/lib/hooks/use-deal-pulse.ts"

# 4. Ключи КП и их сброс — ожидание: три мутации сбрасывают только quotesKey(projectId)
grep -n "quotesKey\|invalidateQueries" src/lib/hooks/use-quotes.ts

# 5. Батчинг .in() — ожидание: общий помощник со времён S-DEBT-TRUTH-1
grep -rn "S-DEBT-TRUTH-1" src/lib | head -5

# 6. Готовые примитивы и форматтеры
ls src/components/ui/EmptyState.tsx src/components/shared/ContactCallChip.tsx src/components/shared/RailCard.tsx
grep -n "export function formatBudget\|export function formatBudgetFull" -r src/lib | head
grep -n "export function mskDayMonth\|export function mskDayCaption\|export function mskTime" src/lib/utils/date-helpers.ts
grep -n "export function formatActionDate" src/lib/utils/action-date.ts

# 7. Как лента сделки печатает заголовок события — найти функцию, второй не писать
grep -rn "describeEvent\|function .*[Tt]itle" src/lib/timeline src/lib/utils/activity-events.ts | head -10

# 8. Клавиши: какие буквы заняты после префикса G
grep -n "Key[A-Z]" src/components/shared/Hotkeys.tsx | head -20

# 9. Кегли и адаптив — есть ли кегль 15px и container queries
grep -n "fontSize" -A 14 tailwind.config.ts | head -30
grep -n "container-queries\|@container" tailwind.config.ts src/app/globals.css | head -5

# 10. Выпадающее меню — есть ли готовый образец
grep -rln "role=\"menu\"" src/components | head -5

# 11. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

**12. Живая БД, только чтение** (Supabase MCP `execute_sql`): объём выборки касаний. Ожидание — сотни строк, не тысячи.

```sql
select
  (select count(*) from notes where project_id is not null and deleted_at is null
     and kind = 'note' and created_at >= now() - interval '120 days') as notes_120d,
  (select count(*) from activity_log where project_id is not null
     and event_type in ('stage_changed','task_completed','call_logged','meeting_scheduled')
     and created_at >= now() - interval '120 days') as activity_120d;
```

Если любое число больше 800 — остановись и напиши об этом: ответ PostgREST обрежется на 1000 строк, нужна пагинация.

---

## ЗАДАЧА 1 — данные: касания и КП пакетом

**Зачем.** Группа считается для всех сделок экрана сразу. Запрос на сделку — это N запросов; нужно два на экран. Заодно чинится «Пульс» карточки сделки: с миграции 135 заметки не попадают в `activity_log`, и пульс их не видит.

**1.1. `src/lib/domain/deal-touch.ts` — дописать чистую сборку касаний**

```ts
export interface NoteTouchRow { project_id: string | null; created_at: string | null; kind: string | null }
export interface ActivityTouchRow {
  project_id: string | null;
  event_type: string;
  created_at: string | null;
  payload: unknown;
}

/** Касания по сделкам: заметки + события журнала, отскоки стадии сняты. */
export function touchesFromRows(
  notes: readonly NoteTouchRow[],
  activity: readonly ActivityTouchRow[],
): Map<string, DealTouch[]>;
```

Строки без `project_id` или без `created_at` пропускаются. Из заметок касание — только `kind === 'note'`: `stage_comment` — часть смены стадии, отдельно не считается (иначе комментарий к отскоку стадии остался бы касанием). `stage_changed` проходит через `dropStageBounces` отдельно по каждой сделке; `from_stage_id` и `to_stage_id` читаются из `payload` с проверкой типа, без `as`. Касания сделки — по возрастанию времени.

**1.2. Новый файл `src/lib/hooks/use-deal-touches.ts`**

```ts
export const DEAL_TOUCHES_KEY = ['deal-touches'] as const;

/** Касания пачки сделок с дня `sinceKey` ('YYYY-MM-DD'). */
export function useDealTouches(projectIds: readonly string[], sinceKey: string | null);

/** Касания одной сделки за 30 дней — для «Пульса» карточки. */
export function useDealTouchesOne(projectId: string);
```

- Два запроса в одном `queryFn`, через `Promise.all`:
  - `notes`: `select('project_id, created_at, kind')`, `.in('project_id', ids)`, `.is('deleted_at', null)`, `.gte('created_at', since)`;
  - `activity_log`: `select('project_id, event_type, created_at, payload')`, `.in('project_id', ids)`, `.in('event_type', TOUCH_EVENT_TYPES)`, `.gte('created_at', since)`.
- Результат — `touchesFromRows(...)`. Логики в `queryFn` нет: только запросы и вызов чистой функции.
- Ключ пакета: `[...DEAL_TOUCHES_KEY, 'bulk', отсортированные id через запятую, sinceKey]`. Ключ одной сделки: `[...DEAL_TOUCHES_KEY, 'one', projectId]`.
- `sinceKey` считает вызывающий: «самый ранний просроченный `next_action_date` минус 30 дней»; просроченных нет — «сегодня − 30 дней»; в любом случае не раньше «сегодня − 120 дней». Запас в 30 дней нужен, чтобы у сделки с самым старым сроком были видны касания до срока. Это день, не время: ключ запроса не должен меняться каждую миллисекунду.
- `enabled`: список id не пуст и `sinceKey` задан. `staleTime` 60 с.
- В пакетном хуке — `useRealtimeSync('notes', DEAL_TOUCHES_KEY)` и `useRealtimeSync('activity_log', DEAL_TOUCHES_KEY)`. Обе таблицы в публикации realtime. В хуке одной сделки подписок нет — как не было у прежнего `useDealPulse`: смена стадии или закрытая задача доедут по `staleTime`, а новую заметку доставляет сброс ключа из `use-notes.ts`.
- Длинный список id — через помощник батчинга из разведки п. 5, если он есть.
- В `src/lib/hooks/use-notes.ts`: `useCreateNote.onSettled` и общая `invalidateNoteCaches` дополнительно сбрасывают `DEAL_TOUCHES_KEY`. Иначе пульс карточки не увидит новую заметку до истечения `staleTime`.

**1.3. `src/lib/hooks/use-deal-pulse.ts`** — удалить. `DealPulseCard` переходит на `useDealTouchesOne` (задача 4).

**1.4. `src/lib/hooks/use-quotes.ts` — КП пачки сделок**

```ts
/** КП пачки сделок одним запросом: Map<projectId, Quote[]>. */
export function useDealsQuotes(projectIds: readonly string[]);
```

- Ключ: `['quotes', 'bulk', отсортированные id через запятую]`. Колонки — существующая `QUOTE_COLS`.
- Три мутации файла сейчас сбрасывают только `quotesKey(projectId)`. Вынеси сброс в одну функцию `invalidateQuoteKeys(qc, projectId)`: она сбрасывает и ключ сделки, и `['quotes', 'bulk']`. Все три мутации зовут её.

**Проверка:** `npx tsc --noEmit`; `grep -rn "use-deal-pulse" src` — пусто.

---

## ЗАДАЧА 2 — модель экрана: `src/lib/domain/today-model.ts`

**Зачем.** Сборка «сделка + касания + КП + задачи + звонки + встречи → ходы и группы» — место, где ошибку не видно глазами. Она обязана проверяться без сети и без React.

```ts
export interface TodayDealSource {
  id: string;
  name: string;
  companyName: string | null;
  contactId: string | null;
  status: string;
  type: string;
  next_step: string | null;
  next_action_date: string | null;
  created_at: string;
  budget: number | null;
  stage: { name: string; phase_group: string | null; order_index: number } | null;
}

export interface TodayDealTask { id: string; text: string; deadline: string | null; overdue: boolean }
export interface TodayDealCall { id: string; date: string; overdue: boolean }

/** Что печатать во второй строке колонки срока. Выбор — в модели, текст — в компоненте. */
export type AfterKind =
  | 'silence_after_due'   // срок прошёл, касаний после него нет, группа fresh
  | 'touched_after_due'   // после срока было касание: день и вид последнего
  | 'silence_since'       // группа decide, касания были: день последнего
  | 'no_touches'          // касаний в окне нет
  | 'last_touch'          // шаг впереди или шага нет: день и вид последнего касания
  | 'signals'             // шаг впереди, есть сигналы риска
  | 'planned';            // шага нет, впереди встреча или звонок

export interface AfterInfo {
  kind: AfterKind;
  /** День последнего касания, если он нужен формулировке. */
  dateKey: string | null;
  touchKind: TouchKind | null;
  /** Для `no_touches`: окно касаний покрывает всю жизнь сделки. */
  wholeLife: boolean;
}

export interface TodayDealView {
  source: TodayDealSource;
  cls: TodayDealClass;
  signals: RiskSignal[];
  amount: DealHeaderAmount;
  planned: PlannedEvent | null;
  /** Касания сделки по возрастанию времени — для полосы «Было». */
  touches: DealTouch[];
  after: AfterInfo;
  /** Задачи сделки: в работе (`lane === 'now'`) либо не закрытые с дедлайном сегодня или раньше. */
  tasks: TodayDealTask[];
  /** Мои `pending`-звонки сделки с днём сегодня или раньше. */
  calls: TodayDealCall[];
  /** Слот хода; `null` — сделка не в ходах. */
  slot: MoveSlot | null;
}

export interface TodayGroupView {
  key: TodayGroup;
  /** Строки группы: без ходов и без отложенных, по `compareByWeight`. */
  rows: TodayDealView[];
  /** Всего сделок группы, включая ходы, без отложенных. */
  total: number;
  inMoves: number;
}

export interface TodayModel {
  /** Кандидаты в ходы по всем сделкам — вход `pickMoves`; понадобятся набору дня в ACT-1. */
  candidates: MoveCandidate[];
  /** Результат `pickMoves` по кандидатам. */
  computed: Move[];
  moves: TodayDealView[];
  groups: TodayGroupView[];
  snoozed: TodayDealView[];
  total: number;
  noStepAhead: number;
  noAmount: number;
}

/** КП в объёме, нужном сумме (`dealHeaderAmount`) и сигналу `quote_expired`. */
export type TodayQuote = QuoteAmountLike & { valid_until: string | null };

export interface TodayModelInput {
  deals: readonly TodayDealSource[];
  touches: ReadonlyMap<string, readonly DealTouch[]>;
  quotes: ReadonlyMap<string, readonly TodayQuote[]>;
  tasks: readonly { id: string; project_id: string | null; lane: string; deadline: string | null; text: string }[];
  calls: readonly { id: string; project_id: string | null; status: string; date: string }[];
  meetings: readonly { id: string; project_id: string | null; date: string; time: string | null }[];
  snoozedDealIds: ReadonlySet<string>;
  /** День, с которого загружены касания: 'YYYY-MM-DD'. */
  sinceKey: string;
}

export function buildTodayModel(
  input: TodayModelInput,
  now: Date,
  thresholds?: TodayThresholds,
): TodayModel;
```

- Вход `deals` уже отфильтрован вызывающим: `type === 'client'` и `isProjectActive`. `calls` и `meetings` — уже «мои».
- `planned` — ближайшее из встреч и `pending`-звонков сделки с днём сегодня или позже. Время встречи — `time`, время звонка — `mskTime(date)`.
- `amount` — `dealHeaderAmount(quotes, budget)`. `noAmount` — число сделок с `amount.amount === null`.
- `groups` — все пять групп в порядке `TODAY_GROUP_ORDER`, пустые тоже (экран решает, что скрыть).
- `after` — по порядку: шаг просрочен и `touchedAfterDue` → `touched_after_due`; просрочен, группа `fresh` → `silence_after_due`; просрочен, группа `decide`, последнее касание есть → `silence_since`, нет → `no_touches`; шаг впереди и есть сигналы → `signals`; шага нет и есть `planned` → `planned`; иначе последнее касание есть → `last_touch`, нет → `no_touches`. `wholeLife` — `mskDateKey(created_at) >= sinceKey` (вход модели получает `sinceKey`).
- `tasks` и `calls` — то, что раньше стояло отдельными строками экрана: теперь оно внутри сделки и не должно пропасть.
- `noStepAhead` и `total` считают и отложенные сделки: это факт о книге, а не о видимых строках.
- Имена полей `tasks.text`, `calls.date`, `meetings.time` сверить с типами `Task`, `Call`, `Meeting` и поправить сигнатуру под них, не наоборот.

**Проверка:** `npx vitest run tests/unit/today-model.test.ts`.

---

## ЗАДАЧА 3 — экран: ходы и список

**Файлы.** `src/components/today/TodayView.tsx` переписывается как контейнер. Новые компоненты рядом: `TodayMoves.tsx`, `TodayMoveCard.tsx`, `TodayGroups.tsx`, `TodayDealRow.tsx`. `TodayFocus.tsx` удаляется: ходы заменили «Фокус дня» (макет, кадр 1). Ключи `focus-*` в `localStorage` не трогать.

**Данные контейнера.** Существующие хуки: `useAuth`, `useProjects`, `usePipelineStages`, `useIsProjectActive`, `useTasks`, `useCalls`, `useMeetings` + `useMyMeetings`, `useQueueSnoozes`. Новые: `useDealTouches`, `useDealsQuotes`. Модель — `buildTodayModel`. `now` для модели — состояние, которое обновляется при смене календарного дня; `useMemo` с `new Date()` внутри запрещён (learnings, «Даты и время»). Домен отсекает касания по дню, а не по времени, поэтому заметка, созданная после открытия экрана, в модель попадает.

**Макет → код.** Макет задаёт состав и размеры. Его классы и CSS не копировать: Tailwind-утилиты, токены, примитивы проекта. `px` только у границ.

| Элемент | Размеры и токены |
|---|---|
| Страница | `max-w-3xl` снять; экран занимает всю ширину контента |
| Шапка | «Сегодня» — прежний `h1`; под ним дата: «Суббота, 3 октября» |
| Ходы | заголовок секции 13/600 + подсказка 12 `text-text-dim`; сетка три колонки, зазор 0.75rem; уже 52rem — одна колонка |
| Карточка хода | материал `.sheet`, отступы 0.875rem × 1rem; номер в круге 1.125rem; название 15/600; сумма 13/500 `tabular-nums` справа; шаг 15/500, не больше двух строк; «почему здесь» 12 `text-text-dim`, до двух строк |
| Список | один лист `.sheet`; шапка: «Сделки в работе», «у N из M нет шага впереди», справа «у K не указана сумма» |
| Подписи колонок | 11 `text-text-mute`: «Сделка и шаг», «Сумма · стадия», «Срок шага · что было после» |
| Строка сделки | сетка `minmax(0,1fr) 9.5rem 15rem`, зазор 1.25rem; при узком контенте (1280) вторая колонка 8rem |
| — колонка 1 | шеврон; название 15/600, переносится, не обрезается; шаг 13/400, до двух строк; у `stale` и `decide` шаг `text-text-dim` |
| — колонка 2 | сумма 13/500 `tabular-nums` вправо; под ней стадия 12 `text-text-dim`; суммы нет — «—» `text-text-mute` с `title` |
| — колонка 3 | строка 1: «срок 30 сен» + «3 дн.» 500; строка 2: 12 `text-text-dim` — что было после срока |
| Заголовок группы | капс 11/600 с разрядкой, счётчик, рядом правило группы 12 обычным регистром |
| Свёрнутая группа | одна строка-кнопка: шеврон, название, счётчик, итог 13 `text-text-dim` |

Кегль 15px: если в `tailwind.config.ts` нет токена — `text-[0.9375rem]`.

Для замера обрезки (смок 2) поставь атрибуты: `data-today-name` на название сделки (карточка и строка), `data-today-step` на текст шага.

**Цвет.** Красный — только число дней у `fresh`: `--danger-text`. Сигнал риска — `--warning-text`. `--accent` для смысла не использовать: в `t-washi` он равен красному, в `t-aura` не цветной. Точек-маркеров у строк нет.

**Тексты.**

- Карточка, «почему здесь»: слот жирным, дальше факты через « · ».
  - `fresh`: «Свежий срыв. Срок был 30 сен, 3 дн. назад · Подготовка КП · перенесён 6 раз».
  - `biggest`: «Крупнейшая сумма без шага. Срок был 18 сен · тишина с 17 сен».
  - `assigned`: «Назначено на сегодня. 11:00 · Квалификация» (время — только если оно есть).
  - `fill`: «Добор. Срок был 8 сен · после срока: 30 сен — смена стадии».
  - «перенесён N раз» — `useFieldMoves(id).data?.step.count`, печатается при N ≥ 2, как в `DealNextStep`.
- Правила групп — рядом с заголовком, тексты из макета, кадр 1. У «Под риском»: «шаг стоит впереди, но есть сигнал: истёкшее КП или просроченная задача».
- Колонка 3, первая строка: просрочено — «срок {день месяц}» + «{N} дн.»; шаг впереди — «шаг {день недели день месяц}»; шага нет — «шага нет».
- Колонка 3, вторая строка — по `view.after.kind`, компонент ничего не выбирает сам:
  - `silence_after_due` — «после срока тишина»;
  - `touched_after_due` — «после срока: {день} — {вид касания}»;
  - `silence_since` — «тишина с {день}»;
  - `no_touches` — «касаний не было», если `wholeLife`; иначе «давно без касаний»;
  - `last_touch` — «касание {день} — {вид касания}»;
  - `signals` — сигналы через « · »: «КП истекло {день}», «задача с {день}», «звонок с {день}»;
  - `planned` — «встреча {день}, {время}» или «звонок {день}, {время}».
  - Виды касания словами: `note` — «заметка», `stage` — «смена стадии», `task` — «закрыта задача», `call` — «звонок», `meeting` — «встреча».
- Счётчик группы показывает `total`. Если `inMoves > 0` — справа «{одна|две|N} — в ходах наверху».
- Свёрнутая «Решить судьбу»: «{N} сделок молчат дольше 14 дней: {имена через запятую}». Свёрнутая «По плану»: «{имя} — {день шага}» через « · ». Больше пяти имён — «и ещё N».
- Склонения — `pluralRu`.

**Поведение.**

- «Решить судьбу» и «По плану» свёрнуты. Клик по строке-итогу раскрывает группу; состояние — в `useState`, не в `localStorage`.
- Пустая группа не рисуется.
- В открытой группе больше семи строк — показать семь и «Показаны 7 из N. Показать все».
- Клик по строке или «Подробнее» на карточке раскрывает панель (задача 4). Открыта одна панель на экран.
- Кнопки карточки: «Запланировать шаг» (`ProjectModal` с `focusNextAction`, как сейчас), «Подробнее», «Отложить» (`useSnooze`, как сейчас). Primary-кнопка на экране одна — у первой карточки.
- Под ходами, если назначено больше лимита: «На сегодня назначено N шагов при лимите 3. Показаны все».

**Состояния** (макет, кадр 10).

- Загрузка: заголовки секций и подписи колонок стоят сразу, скелет повторяет карточки и двухстрочные строки. Пока не ответили `projects`, стадии и касания, пустое состояние не показывать.
- Ошибка `projects` или касаний: блок «Не удалось загрузить сделки» + «Повторить» (`refetch`).
- Сделок экрана нет и чипы пусты — прежнее «Всё разобрано» со ссылкой на `/overview`, на примитиве `ui/EmptyState`.
- Сделок нет, чипы есть — строка «Открытых сделок нет» вместо списка.
- У всех сделок шаг впереди — в шапке списка «у всех M шаг впереди».

**Проверка:** `npx tsc --noEmit`; `grep -n "max-w-3xl\|TodayFocus" src/components/today/TodayView.tsx` — пусто.

---

## ЗАДАЧА 4 — раскрытая строка и полоса «Было»

**4.1. Новый `src/components/shared/PulseDayStrip.tsx`** — общий для «Сегодня» и карточки сделки.

- Пропсы: `days: PulseDay[]`, `dueLabel?: string`.
- Сетка 30 колонок, зазор 0.25rem. Капсула: высота 1.375rem, `rounded-full`.
- Заливка: `none` — `color-mix(in srgb, var(--text) 8%, transparent)`; `touch` — `color-mix(in srgb, var(--text) 50%, transparent)`; `stage` — `var(--info)`.
- Над капсулой дня срока — засечка-треугольник `--text-dim`. Высота полосы резервирует место под засечку всегда.
- `title` капсулы: «30 сен · смена стадии, событий: 2», «12 сен · событий нет», у дня срока в конце « · срок шага». Вид — по `kinds[0]`, у `stage` — «смена стадии».
- Под полосой: слева первый день окна, справа «сегодня». Легенда: «касание», «смена стадии», «срок шага {день}» (последнее — только при `dueLabel`).
- Контейнер — `role="img"` с `aria-label`: «30 дней: дней с касаниями — N».

**4.2. Новый `src/components/today/TodayDealPanel.tsx`** — три колонки `1.1fr 1.3fr 0.8fr`, уже 52rem — одна под другой.

- Шапка: компания · стадия · сумма; справа ссылка «Открыть сделку» (`projectHref`).
- «Было · 30 дней»: `PulseDayStrip` (`buildPulseDays(view.touches, next_action_date, now)`); три последних события ленты текстом — `useEntityTimeline('project', id)`, только события не позже `now`; заголовок события — той же функцией, что в ленте сделки (разведка п. 7); ссылка «Вся лента сделки». Касаний за 30 дней нет — «За 30 дней по сделке не было ни одного касания».
- «Сейчас»: шаг в кавычках 15/500; строка меты — «Шаг · срок был {день}» или «Шаг на {день}», « · перенесён N раз» при N ≥ 2; кнопки «Запланировать шаг» и «Отложить»; ниже — дела сделки и контекст. Задачи (`tasks` из модели) — строкой с прежним действием «Готово» (`useUpdateTask`, `lane: 'done'`); звонки (`calls`) — с прежним «Выполнен» (`useUpdateCall`, `status: 'done'`). Дальше текстом: истёкшее КП, дедлайн сделки, стадия против нормы (`useStageTimeGauge`). Чип основного контакта — `ContactCallChip` через `useContactBrief(contactId)`, как в `DealNextStep`.
- «Впереди»: шаг с датой, встреча или звонок (`planned`). Пусто — «Шага впереди нет — сделка без плана».
- Панель сделки-хода открывается под рядом карточек, панель строки — под строкой. Компонент один.

**4.3. `src/components/projects/DealPulseCard.tsx`**

- Источник — `useDealTouchesOne(project.id)`. Спарклайн и число в шапке считаются из касаний: `buildDealPulse(touches.map((t) => ({ created_at: t.at })), now)`.
- Тепловая полоса из 14 квадратов заменяется на `PulseDayStrip` (30 дней). Подпись над ней — «Дни без активности · {pulse.longestSilence.days} дн.»: окно полосы теперь равно окну пульса.
- Скелет загрузки — 30 капсул вместо 14 квадратов.
- `silenceWithin` после этого без потребителей — удалить вместе с её тестом.
- Число в шапке «N событий» изменится: правки полей больше не считаются, заметки считаются. Это ожидаемо; было и стало — в отчёт.

**Проверка:** `grep -rn "silenceWithin\|heatBackground" src tests` — пусто; `npx tsc --noEmit`.

---

## ЗАДАЧА 5 — «Не сделки», «Отложено», клавиатура, строка очереди

**5.1. Новый `src/components/today/TodayOffDeals.tsx`.** Ряд чипов под списком: «Не сделки:» и чипы со счётчиком. Чип с нулём не рисуется. Клик по чипу раскрывает под рядом список существующих строк `QueueRow`; открыт один список.

| Чип | Отбор — существующий код `TodayView`, перенести без изменения правил |
|---|---|
| Звонки | `overdueCalls` + `todayCalls`, у которых нет сделки экрана |
| Встречи сегодня | `todayMeetings` без сделки экрана |
| Лиды | `leadsNeedingAction` |
| Задачи вне сделок | `nowTasks`, у которых нет проекта или проект не клиентская сделка |
| Хвост закрытой сделки | `nowTasks` клиентских сделок, которые не `isProjectActive` |
| Остывают | `coolingContacts`, первые пять, счётчик общий |

Действия строк — прежние: «Выполнен», «На завтра», «Готово», «Шаг сделан» у лида, «Запланировать звонок», «Отложить». Задачи, звонки и встречи сделок экрана в чипы не попадают: они внутри сделки, в блоке «Сейчас» панели, со своими «Готово» и «Выполнен» (задача 4.2). Проверь разведкой, что ни одна задача `lane = 'now'` не выпала: сумма задач в чипах и в панелях сделок равна длине прежнего `nowTasks`.

**5.2. Блок «Отложено на завтра: N · показать»** — остаётся под чипами как есть; сделки берутся из `model.snoozed`.

**5.3. `src/components/today/QueueRow.tsx`.** `border-b` вместе с `rounded-lg` рисует «скобку» под строкой (аудит F-07). Убрать скругление у строки с границей; hover-подложку оставить.

**5.4. Клавиатура.** `src/lib/hooks/use-keyboard-nav.ts`: добавить необязательный проп `onKeys?: Record<string, (index: number) => void>` — ключ `e.code`. Вызов — только при `activeIndex >= 0` и не раньше 600 мс после `G` (как у `D`). Существующие потребители хука не меняются.

Плоская очередь экрана: карточки ходов → строки открытых групп сверху вниз → строки раскрытого списка чипа. Отложенные и свёрнутые строки в очередь не входят.

| Клавиша | Действие |
|---|---|
| `J` / `K` | фокус; визуал — существующий `.kbd-focus-row` |
| `Enter` | раскрыть или свернуть панель; у строки чипа — прежний переход |
| `D` | primary: «Запланировать шаг»; у строки чипа — её primary |
| `O` (`KeyO`) | открыть сделку |

Если `KeyO` занят после `G` (разведка п. 8) — правило 600 мс это уже покрывает. Навигация глушится, пока открыт `ProjectModal` (`isActive`, как сейчас). Под списком — строка подсказки клавиш 12 `text-text-dim`.

⚠️ Порядок плоской очереди и порядок элементов в JSX обязаны совпадать. Расхождение не ловят ни `tsc`, ни тесты — собери очередь одним массивом и рендери `kbdIndex` из него.

**Проверка:** `npx tsc --noEmit`; `grep -n "rounded-lg border-b" src/components/today/QueueRow.tsx` — пусто.

---

## ТЕСТЫ

**`tests/unit/deal-touch.test.ts`** — дописать `touchesFromRows`:

- заметка и `stage_changed` одной сделки → два касания по возрастанию времени;
- строка без `project_id` и строка без `created_at` пропущены;
- заметка `kind = 'stage_comment'` касанием не становится;
- `project_updated` и неизвестный тип пропущены;
- отскок «Зерде Фито» из фикстуры (payload с `from_stage_id` / `to_stage_id`) → касаний нет;
- `payload` — строка, `null`, массив → id стадий считаются пустыми, строка остаётся касанием (пары нет), функция не падает;
- события двух сделок не смешиваются.

**`tests/unit/today-model.test.ts`** — на фикстуре `today-2026-10-03.ts`:

Сумма из фикстуры подаётся в модель полем `budget`; КП есть только у `fitnes` (`sent`, `amount` 390000000, `valid_until` 2026-09-18). `sinceKey` в тестах — `2026-07-27` (срок `zerde` 26.08 минус 30 дней).

- `now = 2026-10-03T19:00:00+03:00`: `total` 17, `noStepAhead` 14, `noAmount` 11;
- `moves` → `lorenz`, `nytva`, `hn`;
- `groups`: `fresh` `total` 3, `inMoves` 2, строки — `ar`; `decide` `total` 6, `inMoves` 1, пять строк; `stale` пять строк; `risk` — `fitnes`; `plan` две строки;
- `fitnes`: `signals` — `quote_expired` и `task_overdue`; в `tasks` одна задача, `overdue`;
- `ar` отложена → её нет ни в `moves`, ни в строках; она в `snoozed`; `noStepAhead` по-прежнему 14; второй ход по-прежнему `nytva`;
- звонок `pending` сегодня в 11:00 по сделке `stroy` → `planned.time` `'11:00'`, сделка в `moves` первой со слотом `assigned`;
- задача без `project_id` на модель не влияет;
- задача сделки `lane = 'now'` без дедлайна → есть в `tasks`, `overdue` `false`, сигнала нет;
- `after`: `lorenz` и `ar` → `silence_after_due`; `glorus` → `touched_after_due`, день 2026-09-30, вид `stage`; `hn` → `silence_since`, день 2026-09-17; `agros` → `no_touches`; `fitnes` → `signals`; `stroy` → `last_touch`, день 2026-10-02;
- `no_touches`: сделка создана позже `sinceKey` → `wholeLife` `true`; раньше → `false`;
- `candidates` — 17 элементов; `computed` совпадает с `moves` по id и порядку;
- пустой вход → пять пустых групп, нули в счётчиках.

Компоненты: тестов нет — разметка и стили; логика вынесена в `today-model.ts`.

```bash
npx vitest run tests/unit/deal-touch.test.ts tests/unit/today-model.test.ts tests/unit/deal-pulse.test.ts 2>&1 | tail -15
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
grep -rn "use-deal-pulse\|TodayFocus\|silenceWithin" src tests | head
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `build` проходит.
2. `audit-tokens` — без новых находок. В новых файлах нет hex-цветов и цветовых классов Tailwind.
3. Последний `grep` — пусто.
4. В `use-deal-touches.ts` логики нет: запросы и вызов `touchesFromRows`.

## СМОКИ

Темы: сначала `t-minimal`, затем `t-aura`, `t-washi`, `t-frost`. Тему в настройках владельца не переключать: смок — на своём профиле или превью. Смоки на живых записях ничего не пишут, кроме «Отложить» на тестовой сделке.

| # | Что | Ожидание |
|---|---|---|
| 1 | `/`, 1440 | Три карточки ходов, группы в порядке спеки; «Решить судьбу» и «По плану» свёрнуты |
| 2 | 1440 и 1280: обрезанный текст | Замер в консоли (сниппет ниже) — 0 на обеих ширинах. Число — в отчёт |
| 3 | Сделка-ход | Её нет в строках группы; счётчик группы считает её; справа «… — в ходах наверху» |
| 4 | Клик по строке | Панель под строкой: полоса из 30 капсул, засечка на дне срока, три события текстом |
| 5 | Сделка под риском | В строке сигнал словами `--warning-text`; задача сделки — в «Сейчас», а не отдельной строкой экрана |
| 6 | `t-washi` и `t-aura` | Капсула смены стадии отличима от красного «N дн.» и от нейтральной капсулы |
| 7 | `t-frost` | Лист списка и панель читаются; текст не на прозрачной подложке |
| 8 | Чипы «Не сделки» | Счётчики совпадают с прежними секциями за вычетом строк сделок экрана; раскрытый список работает прежними кнопками |
| 9 | «Отложить» на карточке | Сделка уходит в «Отложено», её место в ходах занимает следующая по правилу |
| 10 | `J`/`K`/`Enter`/`D`/`O` | Фокус идёт по карточкам, затем по строкам; `Enter` раскрывает ту строку, что подсвечена |
| 11 | Карточка сделки, «Пульс» | Полоса из 30 капсул; число «N событий» — было и стало на трёх сделках, в отчёт |
| 12 | Новая заметка в сделке | «Пульс» карточки и строка на «Сегодня» обновились без перезагрузки |
| 13 | Сеть при открытии `/` | Касания — два запроса, КП — один, на весь экран. Запросы `field-moves` — только по карточкам ходов (до трёх) и по раскрытой панели |

Сниппет смока 2:

```js
[...document.querySelectorAll('[data-today-name],[data-today-step]')]
  .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length
```

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Формы хода на месте, «Сделано», «Обновить шаг», «Вернуть в работу», «Перенести», «Разобрать по одной», счётчика «N из 3» — ACT-1.
- Клавиш `U`, `T`, `S`.
- «Ждём клиента», полосы недели, перетаскивания.
- Нового определения «остывает» и правок `useLastTouchMap`.
- Правок `DealNextStep`, `getDealSignals`, `ProjectModal`.

## КОММИТ

```bash
git checkout -b feat/today-v3-screen
git add src/ tests/ _analysis/sprint-S-TODAY-V3-SCREEN-1.md
git commit -m "feat(today): экран «Сегодня» v3 — ходы дня и сделки по группам

- TodayView: три хода, группы fresh/risk/stale/decide/plan, свёрнутые «Решить судьбу» и «По плану»
- строка сделки в две линии: название, шаг целиком, срок и «что было после» словами
- раскрытие «Было · Сейчас · Впереди», PulseDayStrip — 30 капсул, смена стадии --info
- DealPulseCard на касаниях (notes + журнал): заметки после 135 снова в пульсе
- use-deal-touches, useDealsQuotes: два запроса на экран вместо N; общий сброс ключей КП
- «Не сделки» чипами, «Отложено» на месте, клавиша O; QueueRow без «скобки» (F-07)
- TodayFocus удалён

Миграций нет. Действия пока прежние: ProjectModal и snooze.
Основание: _analysis/today-v3-spec.md"
```

Без `git push`.

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

Дополнительно к формату приложи: вывод разведки п. 12; число из смока 2 для 1440 и 1280; «было → стало» из смока 11; число запросов из смока 13.
