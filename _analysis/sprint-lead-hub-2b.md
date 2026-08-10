# Claude Code Prompt — Sprint LEAD-HUB-2b: лид в работе — здоровье, живые данные, аналитика

Третий и завершающий спринт варианта B (`_analysis/leads-entity-design.md`).
2a применён гейтом 2026-08-10 (120 в проде, `main` = `c1e2643`).

Тема спринта: **поля 117 начинают работать**. Сейчас `next_step` и
`next_action_date` у лида заполняются на карточке, но ни очередь дня, ни канбан о
них не знают — лид с назначенным на послезавтра звонком всё равно кричит «7 дн. без
движения». Плюс лид — единственная сущность ядра без realtime, и аналитики по нему нет.

## Границы

- Миграция ровно одна и однострочная (публикация realtime). Пишется и коммитится,
  **не применяется** — apply у гейта.
- Реген типов не нужен: ни колонок, ни функций миграция не трогает.
- **Сегменты для лидов — НЕ в этом спринте.** `SEGMENT_FIELDS` учит конструктор
  клауз новому набору полей и справочников; шапка `lib/constants/segments.ts` прямо
  говорит, что это учетверяет спринт. Отдельной задачей, если понадобится.

## РАЗВЕДКА

```sql
-- 1. Номер миграции: ledger целиком
select version, name from supabase_migrations.schema_migrations order by version desc limit 5;
-- ожидание: последняя 20260810104424 lead_timeline (120) ⇒ файл 121
-- (116 из fix/cleanup-116-rescope номер не занимает)

-- 2. Публикация realtime: leads там НЕТ (сверено гейтом 2026-08-10)
select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename;
```

```bash
grep -n "leadStaleness\|staleLeads" src/components/today/TodayView.tsx
grep -n "getDealHealth\|getNextActionOverdueDays" src/lib/utils/deal-health.ts
grep -n "useRealtimeSync" src/lib/hooks/use-leads.ts   # ожидание: пусто
grep -rn "SegmentsBar" src/components/                  # ожидание: только ProjectsView
```

Факты, снятые разведкой 2026-08-10:

| Что | Где | Состояние |
|---|---|---|
| Очередь дня по лидам | `TodayView.tsx:88-101`, JSX `287-311` | только `leadStaleness()` (created_at/updated_at). Полей 117 нет |
| Здоровье сделки — образец | `utils/deal-health.ts:75` `getDealHealth`, `:85` `getNextActionOverdueDays` | `open` + пустой шаг/дата → `no-action`; дата < сегодня → `overdue-action` |
| Realtime лидов | `use-leads.ts` | подписки нет; **и таблицы нет в publication** |
| Аналитика лидов | `components/analytics/` | отсутствует; 8 файлов, ни одного про лиды |
| Prefill бюджета конверсии | `LeadConversionModal.tsx:66,103` | `deal_amount: null` захардкожен, `estimated_value` игнорируется |
| Peek лида | `LeadPeekContent.tsx` | 11 полей, ни одного из 117 |
| Конвертированные | `use-leads.ts:105-122` | `.limit(100)` — крышка, для аналитики за период мало |
| Медиана/перцентили | — | клиентских хелперов нет вообще |
| `pluralRu` | `utils/plural.ts:?` | возвращает только форму слова, без числа |

---

## ЗАДАЧА 1 — Миграция 121: лиды в realtime

`supabase/migrations/121_leads_realtime.sql`:

```sql
-- ═══ 121: leads в publication supabase_realtime ═══
-- Лид — единственная сущность ядра без живого обновления: canban и очередь дня у
-- двух менеджеров расходятся до минуты (staleTime 60s + инвалидации своих мутаций).
-- Лид — общий пул, его разбирают несколько человек ⇒ расхождение здесь дороже, чем
-- у приватных задач.
--
-- ⚠️ Realtime уважает RLS: подписчик получит событие только по строке, которую
-- видит `leads_select` (org-wide) — второго контура доступа не появляется.
-- REPLICA IDENTITY не меняем: default (PK) достаточно для INSERT/UPDATE, а на
-- DELETE клиенту довольно факта удаления — payload old-строки ему не нужен.

alter publication supabase_realtime add table public.leads;
```

Проверка для гейта (в файле — закомментированной):

```sql
-- select tablename from pg_publication_tables
--  where pubname='supabase_realtime' and tablename='leads';
```

⚠️ **Отдельная находка разведки, в этот спринт НЕ входит:** в publication нет
`contacts`, `companies` и `activity_log`, хотя `use-contacts.ts`, `use-companies.ts`,
`use-activity-log.ts` и `use-entity-timeline.ts` на них подписаны — эти четыре
подписки сейчас мёртвые. Не чинить здесь: включение `activity_log` оживит ленты во
всём приложении, это самостоятельное решение с своим смоком. Записать в BACKLOG.

## ЗАДАЧА 2 — `getLeadHealth`: одно правило вместо двух сигналов

Новый файл `src/lib/utils/lead-health.ts` — зеркало `deal-health.ts` по стилю
(чистые функции, «сейчас» параметром, ноль запросов).

```ts
export type LeadHealth = 'ok' | 'overdue-action' | 'stale' | 'cold';
```

Правило, ровно в этом порядке:

1. `converted` / `disqualified` → `'ok'` (лид закрыт, из очереди уходит).
2. `next_action_date` есть и **раньше сегодня** → `'overdue-action'`.
3. `next_action_date` есть и **сегодня или позже** → `'ok'`.
   ⚠️ Это ядро задачи: **запланированный шаг глушит staleness**. Менеджер уже решил,
   когда вернуться к лиду; напоминать ему «7 дн. без движения» — ложный сигнал, а
   ложный сигнал обесценивает все остальные.
4. `next_action_date` пуст → падаем на существующий `leadStaleness()`
   (`constants/leads.ts`, пороги 1/7 дн., cold ×2) и отдаём `'stale'` / `'cold'` / `'ok'`.

Плюс `getLeadActionOverdueDays(nextActionDate, now)` — калька
`getNextActionOverdueDays`, вернуть в `lib/utils/lead-health.ts`, не дублируя из
`deal-health.ts` (разные сущности, общий хелпер здесь дал бы ложную связанность
ради трёх строк).

Функция возвращает **и уровень, и повод**: `{ level, days, reason: 'overdue' | 'idle' }` —
чтобы UI не пересчитывал, откуда взялось число дней.

Тесты `tests/unit/lead-health.test.ts` — обязательны, это доменное правило:
лид с датой шага завтра при возрасте 30 дней → `ok`; с датой вчера → `overdue-action`
и `days = 1`; без даты и 3 дня в `new` → `cold` (порог 1 × 2); `disqualified` → `ok`
при любом возрасте.

## ЗАДАЧА 3 — TodayView: очередь дня видит шаг

`components/today/TodayView.tsx`:

- `staleLeads` → `leadsNeedingAction`: фильтр по `getLeadHealth(l, now).level !== 'ok'`,
  сортировка — сначала `overdue-action` (по убыванию просрочки), затем `cold`, затем
  `stale`. Порядок внутри секции важнее, чем кажется: просроченный шаг — обещание,
  данное клиенту, залежавшийся лид — всего лишь риск.
- `meta` строки: для `overdue-action` — «шаг просрочен N дн.» (язык сделок, дословно),
  для остальных — прежнее «N дн. в новых / без движения».
- `primary`-действие: у `overdue-action` — «Шаг сделан» (чистит `next_step` и
  `next_action_date` одним update, как у `DealFocusPanel`), у прочих — прежние
  «Связаться» / «Квалифицировать».
- ⚠️ `flatRows` и смещения `off*` — порядок обязан совпадать с JSX; количество
  элементов секции меняется, но её позиция в списке — нет.
- Заголовок секции: «Лиды без реакции» → **«Лиды: шаг и реакция»**, потому что
  секция больше не только про молчание.

## ЗАДАЧА 4 — Realtime и живой кеш

`use-leads.ts`:

- В `useLeads()` — `useRealtimeSync('leads', QUERY_KEY)` (паттерн `use-calls.ts:125`,
  `use-contacts.ts:151`).
- Ключ `['leads']` — префикс, инвалидация накрывает и `['leads','one',id]`, и
  `['leads','converted']`.
- ⚠️ Хук подписки зовётся **из `useLeads`**, а не из компонента: страница
  `/leads/[id]` использует `useLead(id)` и списка может не держать. Проверить, что
  на карточке подписка тоже поднимается — если нет, добавить вызов и в `useLead`
  (refcount в `use-realtime` рассчитан на несколько потребителей одного канала).

## ЗАДАЧА 5 — Аналитика лидов

**`src/lib/domain/stats.ts`** — чистые хелперы, которых в проекте нет:

```ts
export function median(values: number[]): number | null;   // null на пустом массиве
export function share(part: number, total: number): number; // 0 при total === 0, без NaN
```

Тесты обязательны (чётная/нечётная длина, пустой массив, деление на ноль).

**`src/lib/domain/lead-metrics.ts`** — агрегация, «сейчас» параметром, ноль запросов:

```ts
export interface LeadFunnelStats {
  bySource: Array<{ source: string; total: number; converted: number; rate: number }>;
  byDisqualifyReason: Array<{ reason: string; count: number }>;
  firstTouchHours: { median: number | null; count: number };  // created_at → first_contacted_at
  qualifyDays:     { median: number | null; count: number };  // first_contacted_at → qualified_at
}
export function aggregateLeadFunnel(leads: Lead[], converted: Lead[], now: number): LeadFunnelStats;
```

- Время до первого касания меряется **в часах**, не в днях: у порога реакции 1 день
  дневная гранулярность обнулила бы метрику.
- В расчёт берутся только лиды с непустым `first_contacted_at` — `count` рядом с
  медианой показывает, на скольких она посчитана. **Медиана без размера выборки —
  театр**, поэтому оба числа в UI обязаны стоять рядом.
- Лид без источника — отдельная строка «Не указан», а не выкидывается: доля лидов
  без источника сама по себе диагноз.

**`src/components/analytics/LeadsAnalytics.tsx`** — блок страницы. Образец —
`TasksAnalytics.tsx` (KPI-плитки + диапазон в URL). Содержимое:

- Строка KPI: всего лидов в работе · конверсия % (converted / (converted + disqualified)) ·
  медиана до первого касания · медиана до квалификации.
- Таблица «Источники»: источник → всего / конвертировано / конверсия %.
  Числа вправо, `tabular-nums`, сортировка по конверсии.
- Список «Причины отказов»: причина → количество, доля полосой.
- Пустое состояние: **обязательно**. На проде сейчас ноль конвертированных лидов —
  блок обязан показывать «Данных пока нет: конверсия появится после первых
  конвертированных лидов», а не пустые таблицы и `NaN%`. Это главный риск задачи.

**Данные.** `useLeads()` (без лимита) + новый `useLeadsForAnalytics(fromISO)` в
`use-leads.ts`: `.select('*').gte('created_at', fromISO).limit(1000)` **без**
`.neq('status','converted')` — нужны все, включая конвертированных.
⚠️ Существующий `useConvertedLeads()` для аналитики **не годится**: у него
`.limit(100)` и сортировка по `converted_at` — это лента, а не выборка за период.
Не трогать его и не ломать полосу «Конвертированы».

Монтаж в `AnalyticsPage.tsx`: recharts здесь не нужен (таблицы и полосы), поэтому
**без `dynamic`** — обычный импорт, вставить перед `<TasksAnalytics />`.

## ЗАДАЧА 6 — Мелочи, которые дожимают сущность

1. **`LeadConversionModal`**: `deal_amount` в `reset` → `lead.estimated_value != null ?
   lead.estimated_value / 100 : null` (в БД копейки). Поле «Бюджет (₽)» сейчас
   неуправляемое (`defaultValue=""` на `<input>`, L339) — программный prefill без
   правки не отобразится: перевести на `value` из `Controller`, как в `LeadModal`.
2. **`LeadPeekContent`**: добавить `temperature`, `estimated_value`, `next_step` +
   `next_action_date` (с меткой просрочки через `getLeadHealth`), ответственного.
   Новых запросов не нужно — поля уже в строке.
3. **Карточка канбана и `LeadDetail`**: перевести индикатор на `getLeadHealth`,
   чтобы во всех трёх местах был один язык. Сейчас карточка показывает staleness
   даже когда шаг запланирован.

## Проверки

```bash
npx tsc --noEmit
npx eslint src --ext .ts,.tsx     # 14 errors = baseline, новых быть не должно
npx vitest run                     # +тесты lead-health и stats
npm run build                      # ПОСЛЕДНИМ
```

Ручной смок (миграция не применена ⇒ realtime ещё мёртв — проверяется остальное):
лиду проставлен шаг на завтра — из очереди дня исчезает; шаг на вчера — появляется
с «шаг просрочен N дн.» и кнопкой «Шаг сделан»; кнопка чистит оба поля и убирает
строку; блок аналитики на пустых данных показывает пустое состояние без `NaN`;
конверсия подставляет сумму из оценки.

## КОММИТ

```bash
git checkout -b feat/lead-work
git add supabase/migrations/121_leads_realtime.sql src/ tests/ docs/schema.md crm-architect/
git commit -m "Sprint LEAD-HUB-2b: здоровье лида по шагу, realtime, аналитика воронки"
```

`docs/schema.md` тем же PR: раздел realtime — `leads` в publication (статус
«НАПИСАНА, НЕ ПРИМЕНЕНА»), плюс запись в BACKLOG про четыре мёртвые подписки
(`contacts`, `companies`, `activity_log`).
`crm-architect/references/architecture.md`: `lead-health.ts` рядом с `deal-health.ts`,
`lib/domain/lead-metrics.ts`, блок аналитики.

## Гейту

apply 121 → проверить `pg_publication_tables` → смок живого обновления (правка лида
из второй сессии видна без перезагрузки) → advisors (изменений не ждём: публикация
не объект RLS) → реген типов не нужен.
