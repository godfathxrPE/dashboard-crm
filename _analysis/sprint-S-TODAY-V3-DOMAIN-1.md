# Claude Code Prompt — S-TODAY-V3-DOMAIN-1: правила экрана «Сегодня» в домене

**Основание:** `_analysis/today-v3-spec.md` (п. 2 «Термины и правила»), макет `_analysis/mockup-S-TODAY-V3.html`.
**Эпик:** S-TODAY-V3, спринт 1 из 3. Следом — `sprint-S-TODAY-V3-SCREEN-1.md` (экран), `sprint-S-TODAY-V3-ACT-1.md` (действия).
**Схема:** миграций нет, БД не трогаем, типы не меняются.
**Экран в этом спринте не меняется.** Спринт кладёт чистые функции и тесты; потребители появятся в SCREEN-1.
**Цель:** правила групп, касаний, веса и тройки ходов — одна проверяемая реализация в `src/lib/domain/`, эталонный тест на снимке БД 03.10.2026.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. Основание на месте — ожидание: оба файла есть
ls _analysis/today-v3-spec.md _analysis/mockup-S-TODAY-V3.html

# 2. Функции, на которые опираемся — ожидание: все найдены
grep -n "export function getDealHealth\|export function getNextActionOverdueDays" src/lib/utils/deal-health.ts
grep -n "export function mskDateKey\|export function diffDaysKey\|export function localDateKey" src/lib/utils/date-helpers.ts
grep -n "export function buildDealPulse\|export interface PulsePoint" src/lib/domain/deal-pulse.ts
grep -n "export function pickActiveQuote\|export interface QuoteLike" src/lib/domain/quote-version.ts
grep -n "export function quoteValidity" src/lib/domain/quote-validity.ts

# 3. Порядок фаз deal-воронки — ожидание: DEAL_PHASE_ORDER = attraction, working, approval, closing
grep -n "DEAL_PHASE_ORDER" src/lib/constants/phase-labels.ts

# 4. Статусы КП и звонков — ожидание: 'sent' у КП, 'pending'/'done' у звонка
grep -n "quoteStatuses\|QuoteStatus" src/lib/validators/quote.ts | head -4
grep -n "export type CallStatus" src/types/database.ts

# 5. Новых имён ещё нет — ожидание: «No such file» на все четыре
ls src/lib/domain/deal-touch.ts src/lib/domain/today-deals.ts tests/unit/deal-touch.test.ts tests/unit/today-deals.test.ts

# 6. Базовая линия тестов и линта — запиши числа, они нужны в отчёте
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

**7. Живая БД, только чтение** (Supabase MCP `execute_sql`): типы событий журнала и виды заметок за 30 дней. Сверь с таблицей касаний в спеке, п. 2.

```sql
select event_type, count(*) from activity_log
where created_at >= now() - interval '30 days' group by 1 order by 2 desc;

select kind, count(*) from notes
where project_id is not null and deleted_at is null
  and created_at >= now() - interval '30 days' group by 1;
```

Тип события, которого нет в таблице спеки, касанием не считается. В коде он получает `null`, в отчёте — отдельную строку в «Вопросы и риски».

---

## ЗАДАЧА 1 — касание: `src/lib/domain/deal-touch.ts`

**Зачем.** Группа сделки зависит от того, было ли касание после срока шага. Определение касания сейчас размазано: «Пульс» считает все строки журнала, включая правки полей; заметки с миграции 135 в журнал не пишутся вовсе.

Новый файл, ноль React, ноль запросов, ноль `Date.now()` внутри.

```ts
export type TouchKind = 'note' | 'stage' | 'task' | 'call' | 'meeting';

export interface DealTouch {
  /** ISO-таймстамп события. */
  at: string;
  kind: TouchKind;
}

/** Типы `activity_log.event_type`, которые запрашивает пакетный хук (SCREEN-1). */
export const TOUCH_EVENT_TYPES = ['stage_changed', 'task_completed', 'call_logged', 'meeting_scheduled'] as const;

/** Вид касания по типу события журнала; `null` — событие не касание. */
export function touchKindOfActivity(eventType: string): TouchKind | null;

/** Строка смены стадии в объёме, нужном для отсева отскоков. */
export interface StageChangeRow {
  at: string;
  fromStageId: string | null;
  toStageId: string | null;
}

export const STAGE_BOUNCE_MINUTES = 30;

/**
 * Снимает пары «A→B, затем B→A не позже чем через STAGE_BOUNCE_MINUTES».
 * Возвращает оставшиеся строки по возрастанию времени.
 */
export function dropStageBounces(rows: readonly StageChangeRow[]): StageChangeRow[];

/** ISO последнего касания с днём не позже дня `now`; `null` — таких нет. */
export function lastTouchAt(touches: readonly DealTouch[], now: Date): string | null;
```

Правила:

- `touchKindOfActivity` — явная таблица: `stage_changed → stage`, `task_completed → task`, `call_logged → call`, `meeting_scheduled → meeting`. Всё остальное, включая `comment_added` и неизвестные строки, — `null`. Ветка «иначе» написана явно, с комментарием, почему `comment_added` не касание (заметки читаются из `notes`).
- `dropStageBounces` сортирует вход сам и не полагается на порядок. Пара снимается целиком. Пара — только при непустых id: две строки с `null` в `fromStageId` или `toStageId` парой не считаются и остаются. Строка участвует не более чем в одной паре: `A→B, B→A, A→B` за десять минут — снята первая пара, третья строка остаётся.
- `lastTouchAt` берёт максимум по времени, а не первое подходящее. Отсечка — по дню: касание с `mskDateKey(at)` позже `mskDateKey(now)` игнорируется. Отсечки по времени внутри дня нет: заметка, созданная после открытия экрана, обязана учитываться.

Источник отскока — `activity_log.payload` события `stage_changed`: ключи `from_stage_id` и `to_stage_id`. Разбор payload в эту задачу не входит, функция получает уже готовые строки.

**Проверка:** `npx vitest run tests/unit/deal-touch.test.ts`.

---

## ЗАДАЧА 2 — группа сделки и сигналы риска: `src/lib/domain/today-deals.ts`

**Зачем.** Экран делит сделки по типу решения, а не по типу сущности. Правило должно быть одно и проверяться без сети.

```ts
import type { DealTouch } from './deal-touch';

export type TodayGroup = 'fresh' | 'risk' | 'stale' | 'decide' | 'plan';

/** Порядок групп на экране. */
export const TODAY_GROUP_ORDER: readonly TodayGroup[] = ['fresh', 'risk', 'stale', 'decide', 'plan'];

export interface TodayThresholds {
  /** Дней тишины после срока, после которых «сорвано» становится «решить судьбу». */
  decideDays: number;
  /** Ходов на день. */
  movesLimit: number;
}
export const DEFAULT_TODAY_THRESHOLDS: TodayThresholds = { decideDays: 14, movesLimit: 3 };

export type RiskSignalKey = 'quote_expired' | 'task_overdue' | 'call_overdue';

export interface RiskSignal {
  key: RiskSignalKey;
  /** День, с которого сигнал горит: 'YYYY-MM-DD'. */
  since: string;
}

export interface RiskInput {
  /** `QuoteLike` — из `quote-version.ts`: его требует `pickActiveQuote`. */
  quotes: readonly (QuoteLike & { valid_until: string | null })[];
  tasks: readonly { lane: string; deadline: string | null }[];
  calls: readonly { status: string; date: string }[];
}

export function riskSignals(input: RiskInput, now: Date): RiskSignal[];

export interface PlannedEvent {
  /** День события: 'YYYY-MM-DD'. */
  dateKey: string;
  /** 'HH:MM' по МСК; `null` — времени нет. */
  time: string | null;
  kind: 'meeting' | 'call';
}

export interface TodayDealInput {
  id: string;
  /** Тот же тип статуса, что у параметра `getDealHealth` (`DealStatus`). */
  status: DealStatus;
  next_step: string | null;
  next_action_date: string | null;
  created_at: string;
  touches: readonly DealTouch[];
  signals: readonly RiskSignal[];
  /** Ближайшая встреча или звонок сделки с днём сегодня или позже; `null` — нет. */
  planned: PlannedEvent | null;
}

export interface TodayDealClass {
  group: TodayGroup;
  /** Шаг с датой сегодня или позже. */
  stepAhead: boolean;
  /** Шага или его даты нет. */
  noStep: boolean;
  /** Календарных дней после срока шага; `null` — срока нет или он не прошёл. */
  overdueDays: number | null;
  /** Было касание в день строго после дня срока. */
  touchedAfterDue: boolean;
  /** ISO последнего касания с днём не позже дня `now`. */
  lastTouchAt: string | null;
  /** Назначено на сегодня; `time` — у встречи или звонка. */
  assignedToday: { time: string | null } | null;
}

export function classifyDeal(
  input: TodayDealInput,
  now: Date,
  thresholds?: TodayThresholds,
): TodayDealClass;
```

Правила `classifyDeal` — таблица из спеки, п. 2. Порядок проверок:

| # | Условие | Группа |
|---|---|---|
| 1 | `getDealHealth(input, now) === 'ok'` и сигналов нет | `plan` |
| 2 | `getDealHealth === 'ok'` и сигнал есть | `risk` |
| 3 | `'overdue-action'` и есть касание с `mskDateKey(at) > next_action_date` | `stale` |
| 4 | `'overdue-action'`, касаний после срока нет, `overdueDays ≤ decideDays` | `fresh` |
| 5 | `'overdue-action'`, касаний после срока нет, `overdueDays > decideDays` | `decide` |
| 6 | `'no-action'` и `planned` задан | `plan` |
| 7 | `'no-action'`, от последнего касания или создания сделки не больше `decideDays` дней | `stale` |
| 8 | `'no-action'`, тишина дольше `decideDays` | `decide` |

Детали, на которых легко ошибиться:

- Трихотомию «шаг впереди / просрочен / нет шага» даёт существующая `getDealHealth` — второй формулы не заводим. Просрочку в днях — `getNextActionOverdueDays(next_action_date, now)`.
- Касание в сам день срока — не «после срока». Сравнение по ключам дня: `mskDateKey(touch.at) > next_action_date`. Касания с днём позже сегодняшнего в правиле 3 не участвуют — та же отсечка, что у `lastTouchAt`.
- `assignedToday`: шаг впереди и `next_action_date === localDateKey(now)` → `{ time: null }`; либо `planned.dateKey === localDateKey(now)` → `{ time: planned.time }`. Время встречи или звонка побеждает пустое время шага.
- Строки 7–8: день отсчёта — более поздний из `mskDateKey(lastTouchAt)` и `mskDateKey(created_at)`; разница — `diffDaysKey`.
- Вызывающий код отдаёт только сделки экрана (спека, п. 2). Проверки `status` внутри, кроме той, что уже делает `getDealHealth`, нет.

Правила `riskSignals`:

- `quote_expired` — `pickActiveQuote(quotes)` в статусе `sent` и `quoteValidity(valid_until, now).level === 'expired'`; `since` — `valid_until`. Черновик и принятое КП сигнала не дают.
- `task_overdue` — есть задача с `lane !== 'done'` и `mskDateKey(deadline) < localDateKey(now)`; `since` — самый ранний такой день.
- `call_overdue` — есть звонок `status === 'pending'` с `mskDateKey(date) < localDateKey(now)`; `since` — самый ранний.
- Порядок в массиве фиксирован: `quote_expired`, `task_overdue`, `call_overdue`.

**Проверка:** `npx vitest run tests/unit/today-deals.test.ts`.

---

## ЗАДАЧА 3 — вес и тройка ходов: тот же `today-deals.ts`

**Зачем.** В v3.1 самая крупная сорванная сделка стояла третьей, а сделка на 10 млн без шага в ходы не попадала вовсе. Правило — спека, п. 2 «Ходы дня».

```ts
export interface MoveCandidate {
  id: string;
  cls: TodayDealClass;
  /** Индекс фазы в `DEAL_PHASE_ORDER` (`lib/constants/phase-labels.ts`): attraction 0 … closing 3; неизвестная фаза — 0. */
  phaseRank: number;
  /** `pipeline_stages.order_index`. */
  stageOrder: number;
  /** Копейки, из `dealHeaderAmount`; `null` — суммы нет. */
  amount: number | null;
  snoozed: boolean;
}

export type MoveSlot = 'assigned' | 'fresh' | 'biggest' | 'fill';

export interface Move {
  id: string;
  slot: MoveSlot;
}

export function phaseRank(phaseGroup: string | null): number;
export function compareByWeight(a: MoveCandidate, b: MoveCandidate): number;
export function pickMoves(candidates: readonly MoveCandidate[], limit: number): Move[];
export function countNoStepAhead(classes: readonly TodayDealClass[]): number;
```

`phaseRank` берёт индекс из существующей `DEAL_PHASE_ORDER` — второго списка фаз не заводим.

`compareByWeight`: `phaseRank` по убыванию → `amount` по убыванию, `null` в конце → `stageOrder` по убыванию → `cls.overdueDays` по возрастанию, `null` в конце → `id`.

`pickMoves`:

1. Отложенные (`snoozed`) не участвуют нигде.
2. `assigned` — все с `cls.assignedToday`. Сначала со временем по возрастанию времени, затем без времени по `compareByWeight`. Берутся все, даже сверх лимита.
3. `free = max(0, limit − assigned.length)`. При `free === 0` — конец.
4. Пул — группы `fresh`, `stale`, `decide`, не из `assigned`.
5. Первые `free − 1` слотов — `fresh` из пула по `compareByWeight`.
6. Последний слот — `biggest`: сделка пула с наибольшим `amount` среди ещё не взятых. При равенстве — `compareByWeight`. Среди ещё не взятых ни у кого нет суммы — слот получает следующая `fresh` (слот `fresh`).
7. Остались пустые слоты — `fill`: `stale` по весу, затем `decide` по весу.
8. Порядок выхода: `assigned`, `fresh`, `biggest`, `fill`.

`countNoStepAhead` — число классов с группой `fresh`, `stale` или `decide`.

**Проверка:** `npx vitest run tests/unit/today-deals.test.ts`.

---

## ЗАДАЧА 4 — дни пульса: `src/lib/domain/deal-pulse.ts`

**Зачем.** Полоса «Было» рисует капсулу на каждый из 30 дней и отличает смену стадии от прочего касания (решение C-21). Окно — то же, что у `buildDealPulse`.

Добавить в файл, существующие экспорты не менять:

```ts
import type { DealTouch, TouchKind } from './deal-touch';

export type PulseDayKind = 'none' | 'touch' | 'stage';

export interface PulseDay {
  /** Календарный день по МСК, 'YYYY-MM-DD'. */
  day: string;
  count: number;
  kind: PulseDayKind;
  /** Виды касаний за день, без повторов, в порядке появления. */
  kinds: TouchKind[];
  /** День срока шага. */
  isDue: boolean;
}

export function buildPulseDays(
  touches: readonly DealTouch[],
  dueKey: string | null,
  now: Date,
): PulseDay[];
```

- 30 дней от `now − 29` до `now` включительно, без пропусков — те же ключи, что строит `buildDealPulse`. Цикл ключей можно вынести во внутреннюю функцию файла; сигнатура и поведение `buildDealPulse` при этом не меняются, его тесты остаются зелёными без правок.
- `kind`: в дне есть касание `stage` → `'stage'`; есть любое другое → `'touch'`; нет → `'none'`.
- `isDue` — у дня, равного `dueKey`. Срок вне окна или `null` — ни одного.
- Касания с днём позже сегодняшнего и старше окна не учитываются.

**Проверка:** `npx vitest run tests/unit/deal-pulse.test.ts`.

---

## ТЕСТЫ

Vitest, файлы в `tests/unit/` (так устроен `vitest.config.ts`). `now` в каждом кейсе задан явно, в середине дня по МСК.

**`tests/unit/deal-touch.test.ts`**

- `stage_changed`, `task_completed`, `call_logged`, `meeting_scheduled` → свой вид.
- `project_updated`, `comment_added`, `task_created`, `entity_deleted`, `automation_fired`, `stage_transition_committed`, `lead_status_changed`, `'что-то-новое'` → `null`.
- Отскок: `A→B` в 17:56 и `B→A` в 18:07 → пусто.
- Те же две строки через 31 минуту → обе остаются.
- `A→B`, затем `B→C` → обе остаются.
- `A→B`, `B→A`, `A→B` за десять минут → остаётся одна, третья.
- Вход в обратном порядке времени → тот же результат.
- `lastTouchAt`: пусто → `null`; касание завтрашним днём не считается; касание сегодня на час позже `now` считается; возвращается максимум, а не первый элемент.
- Отскок: две строки с `null` вместо id стадий в пределах десяти минут → обе остаются.

**`tests/unit/today-deals.test.ts`**

- Срок вчера, касаний после нет → `fresh`, `overdueDays` 1.
- Касание в день срока → `fresh`; на следующий день → `stale`.
- Срок 14 дней назад, тишина → `fresh`; 15 дней → `decide`.
- Срок 40 дней назад, касание через день после срока, дальше тишина → `stale`.
- Шаг сегодня → `plan`, `assignedToday` `{ time: null }`.
- Шаг через неделю и `quote_expired` → `risk`.
- Шага нет, сделке 3 дня, касаний нет → `stale`, `noStep`; сделке 20 дней → `decide`.
- Шага нет, встреча через два дня → `plan`, `noStep`; встреча сегодня в 14:00 → `assignedToday` `{ time: '14:00' }`.
- Шаг из одних пробелов — шага нет.
- `riskSignals`: КП `sent` со сроком вчера → `quote_expired`; `draft` с истёкшим сроком → пусто; `accepted` → пусто.
- `riskSignals`: задача `done` с прошлым дедлайном → пусто; две задачи `now` с дедлайнами 10-го и 15-го → один сигнал, `since` — 10-е.
- `riskSignals`: звонок `pending` вчера → `call_overdue`; `done` → пусто.
- `compareByWeight`: `closing` выше `approval`, тот выше `working`, тот выше `attraction`; при равной фазе большая сумма выше; сделка без суммы ниже сделки с суммой; дальше — `order_index`.
- `pickMoves`: назначено пять при лимите три → все пять, добора нет.
- `pickMoves`: сумм в пуле нет → третий слот — следующая `fresh`.
- `pickMoves`: свежих нет → `biggest`, затем `stale` по весу, затем `decide`.
- `pickMoves`: отложенная сделка не попадает ни в один слот.
- `pickMoves`: вход перемешан → результат тот же.

**Эталон на снимке 03.10.2026.** Файл `tests/unit/fixtures/today-2026-10-03.ts` экспортирует 17 сделок. Данные — из живой БД на 03.10 (сумма уже посчитана по `dealHeaderAmount`, копейки). Все касания — в 12:00 МСК своего дня, кроме отскока «Зерде Фито».

| id | Фаза · `order_index` | Срок шага | Сумма, коп. | Касания (день: вид) | Сигналы |
|---|---|---|---|---|---|
| `lorenz` | working · 4 | 2026-09-30 | 1432697600 | 09-07 stage, 09-09 note, 09-15 note, 09-18 note, 09-22 note, 09-24 note, 09-29 stage | — |
| `ar` | attraction · 2 | 2026-09-30 | — | 09-30 note | — |
| `nytva` | attraction · 3 | 2026-09-25 | — | 09-21 note, 09-22 note, 09-24 note | — |
| `fitnes` | approval · 6 | 2026-10-09 | 390000000 | 09-08 note, 09-09 note, 09-16 note, 09-22 note, 09-23 note | КП `sent`, `valid_until` 2026-09-18; задача `now`, дедлайн 2026-09-15 |
| `glorus` | closing · 5 | 2026-09-08 | 500000000 | 09-04 call, 09-07 note, 09-09 note, 09-14 stage, 09-30 stage | — |
| `prodfond` | attraction · 3 | 2026-09-04 | 150000000 | 09-16 note | — |
| `hleb` | working · 4 | 2026-09-22 | — | 09-07 note, 09-09 note, 09-15 note, 09-16 note, 09-22 note, 09-23 task | — |
| `rodina` | attraction · 2 | 2026-09-16 | — | 09-10 note, 09-16 note, 09-24 note, 09-30 note | — |
| `mdm` | attraction · 3 | 2026-09-15 | — | 09-15 note, 09-16 note | — |
| `hn` | attraction · 2 | 2026-09-18 | 1000000000 | 09-14 note, 09-15 stage, 09-17 note | — |
| `lid` | attraction · 1 | 2026-09-18 | 100000 | — | — |
| `rus` | attraction · 2 | 2026-09-18 | — | 09-15 note | — |
| `agroh` | attraction · 3 | 2026-09-15 | — | 09-09 stage | — |
| `agros` | attraction · 2 | 2026-09-10 | — | — | — |
| `zerde` | attraction · 1 | 2026-08-26 | — | две строки журнала `stage_changed`: 2026-10-03T14:56:39Z, `payload` `{ from_stage_id: 'lead', to_stage_id: 'won' }`; 2026-10-03T15:07:26Z, `payload` `{ from_stage_id: 'won', to_stage_id: 'lead' }` | — |
| `stroy` | attraction · 2 | 2026-10-05 | — | 10-02 note | — |
| `anfish` | attraction · 3 | 2026-10-05 | — | 10-02 meeting, 10-02 note | — |

У всех сделок шаг задан, `status` — `open`, `planned` — `null`, никто не отложен. Дни создания (`created_at`, 12:00 МСК): `fitnes` 08-05, `glorus` 09-04, `lorenz` 08-24, `hleb` 08-11, `agroh` 08-21, `anfish` 10-02, `mdm` 08-21, `nytva` 09-18, `prodfond` 08-06, `agros` 09-10, `ar` 09-30, `rodina` 09-10, `rus` 09-15, `stroy` 10-02, `hn` 07-14, `zerde` 08-26, `lid` 09-17 — все 2026 года. Сигналы у `fitnes` получаются вызовом `riskSignals`, не вписываются руками. Строки `zerde` фикстура хранит сырыми, как в журнале (`event_type`, `created_at`, `payload`): в этом спринте тест сам приводит их к `StageChangeRow` и пропускает через `dropStageBounces`; в SCREEN-1 те же строки пойдут через `touchesFromRows`.

Ожидания при `now = 2026-10-03T19:00:00+03:00`:

- `fresh`: `lorenz`, `ar`, `nytva`.
- `risk`: `fitnes`.
- `stale`: `glorus`, `prodfond`, `hleb`, `rodina`, `mdm`.
- `decide`: `hn`, `lid`, `rus`, `agroh`, `agros`, `zerde`.
- `plan`: `stroy`, `anfish`.
- `countNoStepAhead` → 14.
- `pickMoves(…, 3)` → `lorenz` (`fresh`), `nytva` (`fresh`), `hn` (`biggest`).

Ожидания при `now = 2026-10-05T09:00:00+03:00`:

- `pickMoves(…, 3)` → `anfish` (`assigned`), `stroy` (`assigned`), `lorenz` (`biggest`).

**`tests/unit/deal-pulse.test.ts`** — дописать, существующие кейсы не трогать:

- 30 дней, последний — день `now`.
- В дне есть `stage` и `note` → `kind` `stage`, `count` 2, `kinds` `['stage', 'note']` в порядке появления.
- В дне только `note` → `touch`; пустой день → `none`, `count` 0.
- `dueKey` внутри окна → ровно один `isDue`; вне окна и `null` → ни одного.
- Касание завтрашним днём и касание старше 30 дней в дни не попадают.

```bash
npx vitest run tests/unit/deal-touch.test.ts tests/unit/today-deals.test.ts tests/unit/deal-pulse.test.ts 2>&1 | tail -15
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
```

Критерии приёмки:

1. `tsc` — 0 ошибок.
2. `lint` — 0 errors, warnings не больше базовой линии из разведки.
3. `vitest` — зелено; число тестов выросло, ни один прежний не изменён.
4. `audit-tokens` — без новых находок.
5. `build` — проходит.
6. `git diff --stat main` — только `src/lib/domain/deal-touch.ts`, `src/lib/domain/today-deals.ts`, `src/lib/domain/deal-pulse.ts`, три тест-файла, фикстура и файлы `_analysis/`. Компоненты и хуки не тронуты.

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Хуков, запросов, компонентов и правок `TodayView`.
- Правок `getDealHealth` и `getDealSignals`; изменений поведения `buildDealPulse`.
- Времени у шага сделки: время хода берётся только у встречи и звонка.
- Смены правила «касание сразу после срока, потом тишина» — оно остаётся `stale`, как согласовано. См. «Отчёт».

## КОММИТ

```bash
git checkout -b feat/today-v3-domain
git add src/lib/domain/deal-touch.ts src/lib/domain/today-deals.ts src/lib/domain/deal-pulse.ts tests/unit/ _analysis/today-v3-spec.md _analysis/mockup-S-TODAY-V3.html _analysis/sprint-S-TODAY-V3-DOMAIN-1.md _analysis/sprint-S-TODAY-V3-SCREEN-1.md _analysis/sprint-S-TODAY-V3-ACT-1.md
git commit -m "feat(today): правила экрана «Сегодня» v3 в домене — касание, группы, тройка ходов

- deal-touch: вид касания по типу события, отсев отскока стадии (30 мин), последнее касание
- today-deals: classifyDeal (fresh/risk/stale/decide/plan), riskSignals, compareByWeight, pickMoves
- deal-pulse: buildPulseDays — 30 дней с видом дня и засечкой срока
- эталонный тест на снимке БД 03.10.2026: 3/1/5/6/2, ходы Лоренц · Нытва · ЭЙЧ ЭНД ЭН

Экран не меняется. Миграций нет.
Основание: _analysis/today-v3-spec.md"
```

Без `git push`.

⚠️ Пять файлов `_analysis/` (спека, макет, три спринт-файла) лежат в основном чекауте неотслеживаемыми. Работаешь в worktree — скопируй их из основного чекаута в worktree до `git add`: иначе в ветку они не попадут, а следующие два спринта читают их из `main`.

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

Дополнительно к формату приложи два числа с живой БД (read-only):

1. Вывод обоих запросов разведки п. 7.
2. Сколько сделок экрана попадают в `stale` при тишине дольше 14 дней от последнего касания. Это цена согласованного правила; решение по нему принимает владелец.
