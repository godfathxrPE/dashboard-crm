# Claude Code Prompt — S-TL-4: org-лента, и «Последние действия» перестают врать

Ось 2, четвёртый шаг. Лента сущности готова; теперь та же функция обслуживает уровень
организации — и заменяет два места, которые сегодня показывают **только журнал**,
выдавая его за всю активность.

**Ветка:** `feat/org-timeline` от свежего `main` (после мержа `feat/timeline-kinds`).
**Миграция:** `115_org_timeline.sql` — написать и закоммитить, **не применять**.
Номер сверить запросом к `supabase_migrations.schema_migrations`: последняя —
`20260809083732 entity_timeline_kinds` (114).

---

## Что чиним — по фактам

`useRecentActivity` читает `activity_log` напрямую и питает два места:

| Где | Сколько | Что показывает |
|---|---|---|
| «Последние действия» на дашборде | 20 записей | только `activity_log` |
| `ActivityWidget` в `ActivityDrawer` | 5 записей | только `activity_log` |

**Звонков, встреч, задач, сделок и AI-прогонов там нет.** Не потому что их не бывает —
потому что источник один. В базе: `activity_log` 801, `tasks` 654, `calls` 14,
`projects` 19, `ai_runs` 21, `meetings` 1 — **1510 событий**, из которых виджеты видят
чуть больше половины, и то однобоко.

Это не «новая фича» — это существующий виджет, который врёт названием.

---

## 🔴 Находка разведки: org-ленте нужен контекст события

В ленте сущности вопрос «к чему это относится» не стоит — карточка и есть ответ.
На уровне org он становится главным: строка «Задача: Приёмка отчёта» без указания
сделки бесполезна.

Сегодня оба виджета решают это по-своему: `useRecentActivity` тянет
`project:projects(id, name)` вложенным select и печатает имя рядом с текстом.
**`TimelineEvent` такого поля не имеет.** Прямая замена источника потеряла бы контекст —
и виджет стал бы полнее, но нечитаемее.

Поэтому контракт расширяется двумя колонками:

```
parent_type text   -- 'project' | 'company' | 'contact' | null
parent_id   uuid
```

**Имя не отдаём** — только идентификатор. Резолв `id → имя` делает клиент из уже
загруженных кэшей (`useProjects`, `useCompanies`, `useContacts`), ровно как
`useActorMap` резолвит актора. Джойнить три таблицы в каждой из шести веток ради
строки, которая у клиента уже есть, — лишняя работа на каждой странице.

Приоритет при заполнении: `project` → `company` → `contact` (первый непустой).

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull && git status --short
git checkout -b feat/org-timeline

sed -n '46,60p' supabase/migrations/114_entity_timeline_kinds.sql     # сигнатура 114
grep -n "ACTIVITY_TABS" -A 8 src/components/dashboard/DashboardHome.tsx
grep -n "useRecentActivity\|useRealtimeSync" -r src/ | head
grep -n "KIND_META\|EVENT_ICON\|EVENT_COLOR" -r src/components | head
ls supabase/migrations/ | tail -3
```

Ожидается: 114 шестиаргументная, `useRecentActivity` в двух компонентах,
`EVENT_ICON`/`EVENT_COLOR` — локальные карты дашборда по `event_type`.

---

## ЗАДАЧА 1: миграция `115_org_timeline.sql`

### 1.1 Сигнатура и контракт

```sql
drop function if exists public.entity_timeline(text, uuid, timestamptz, text, int, text[]);

create or replace function public.entity_timeline(
  p_entity_type text,                        -- + 'org'
  p_entity_id   uuid        default null,    -- для 'org' может быть null
  p_before      timestamptz default null,
  p_before_id   text        default null,
  p_limit       int         default 50,
  p_kinds       text[]      default null
)
returns table (
  ts timestamptz, id text, source text, kind text,
  actor_id uuid, ref_type text, ref_id uuid,
  parent_type text,        -- ← новое
  parent_id   uuid,        -- ← новое
  payload jsonb
)
```

`p_entity_id` получает `default null` — для org он не нужен. Внутри:

```sql
-- для 'org' идентификатор сущности не нужен: границу задаёт RLS источников,
-- а сузить её до чужой org нельзя — политики этого не позволят.
-- p_entity_id при p_entity_type='org' игнорируется целиком.
```

⚠️ **Не подставлять `current_org_id()`** и не фильтровать по `org_id` вручную. Границу
организации уже держит RLS каждого источника (`org_id = current_org_id()`), и вторая
проверка в теле функции — это копия предиката, которая разойдётся при первом же
изменении политики. Ровно та причина, по которой функция `SECURITY INVOKER` (см. 112).

`drop` первой строкой — PGRST203, как в 113 и 114. Гранты повторить (шесть аргументов).

### 1.2 Предикат сущности в каждой ветке

Сейчас в ветках стоит тройка `project|company|contact`. Добавляется четвёртая ветвь —
для `'org'` **предиката сущности нет вовсе**:

```sql
    and ( p_entity_type = 'org'
       or (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id) )
```

Так во всех шести ветках. Особые случаи:

- **`src_projects`** сейчас включён только для `company|contact` (на карточке сделки это
  сама сущность). Для `'org'` — включить: создание сделки это событие org-уровня.
- **`src_activity`**, транзитивная ветвь — при `'org'` она **лишняя**: прямая ветвь уже
  отдаёт весь журнал org. Условие `p_entity_type <> 'project'` заменить на
  `p_entity_type in ('company','contact')`, иначе события задвоятся через `union`
  (дедуп спасёт, но выборка вырастет вдвое зря).
- **`src_ai`**, ветвь «по самой сущности» — при `'org'` не применима
  (`ar.entity_type = p_entity_type` дал бы `'org'`, которого в `ai_runs` не бывает).
  Условие `p_entity_type <> 'contact'` заменить на `p_entity_type in ('project','company')`.
  Ветвь «по детям» для org тоже не годится — `scope_children` пуст. Вместо этого при
  `'org'` брать **все** прогоны: `p_entity_type = 'org' or ar.entity_id in (…)`.

### 1.3 `parent_type` / `parent_id` по веткам

| Ветка | Выражение |
|---|---|
| `src_calls` | первый непустой из `c.project_id` → `c.company_id` → `c.contact_id` |
| `src_meetings` | то же по `m.*` |
| `src_tasks` | то же по `t.*` (в подзапрос добавить три колонки) |
| `src_projects` | `'project'`, `p.id` — сделка сама себе родитель |
| `src_activity` | то же по `al.*` |
| `src_ai` | `ar.entity_type` + `ar.entity_id`, но только когда `entity_type in ('project','company')`; для `call`/`meeting` — null (родитель-звонок в кэшах клиента не лежит) |

Удобно оформить парой выражений, чтобы не плодить `case` шесть раз:

```sql
case when x.project_id is not null then 'project'
     when x.company_id is not null then 'company'
     when x.contact_id is not null then 'contact' end as parent_type,
coalesce(x.project_id, x.company_id, x.contact_id) as parent_id
```

⚠️ Порядок в `case` и в `coalesce` **обязан совпадать** — иначе тип и id разъедутся,
и клиент пойдёт искать компанию по id проекта. Написать это рядом и с комментарием.

### 1.4 Два новых псевдовида в `p_kinds`

Табы дашборда сегодня фильтруют по `event_type`: «Стадии»
(`stage_change|stage_changed`) и «Удаления» (`entity_deleted`). Чтобы они пережили
переезд и стали серверными, словарь расширяется по образцу `note`:

```
'stage'   → activity_log, event_type in ('stage_change','stage_changed')
'deleted' → activity_log, event_type = 'entity_deleted'
```

Предикат `src_activity` (обе ветви) становится:

```sql
where ( p_kinds is null
     or 'activity' = any(p_kinds)
     or ('note'    = any(p_kinds) and al.event_type = any(array['comment_added']))
     or ('stage'   = any(p_kinds) and al.event_type = any(array['stage_change','stage_changed']))
     or ('deleted' = any(p_kinds) and al.event_type = any(array['entity_deleted'])) )
```

⚠️ Псевдовидов стало три, и все три дублируют константы из TS. **Свести их в один
CTE-словарь** в начале функции, чтобы список event_type был записан один раз:

```sql
note_types  as (select array['comment_added'] a),
stage_types as (select array['stage_change','stage_changed'] a),
```

и ссылаться на них. Дубль между SQL и TS этим не снимается — его снять нельзя, — но
внутри SQL повторов быть не должно: сейчас список заметок написан дважды (в обеих
ветвях `union`), и это уже полкласса того дефекта, что жил в трёх копиях дедупа ОПФ.

### 1.5 `docs/schema.md`

Статус — **`НАПИСАНА, НЕ ПРИМЕНЕНА`**. Отметить: четвёртое значение `p_entity_type`;
две новые колонки контракта; три псевдовида; `p_entity_id` стал nullable.

---

## ЗАДАЧА 2: клиент — org-режим и резолв родителя

**`src/types/timeline.ts`** — в `TimelineEvent` добавить:

```ts
/** К чему относится событие. Заполнено всегда; на карточке сущности не используется. */
parentType?: 'project' | 'company' | 'contact' | null;
parentId?: string | null;
/** Имя родителя — проставляет хук из кэшей, как actorName. */
parentName?: string;
```

**`src/lib/timeline/rpc-adapter.ts`** — прокинуть новые поля (гвард расширить).

**`src/lib/hooks/use-entity-timeline.ts`**:

- `TimelineEntityType` += `'org'`; при `'org'` вызывать с `p_entity_id: null` и
  `enabled: true` (сейчас `enabled = Boolean(entityId)` — для org это дало бы `false`,
  и лента молча не загрузилась бы; **это тот же класс, что немой сбой из S-TL-1**).
- Резолв `parentId → parentName` рядом с `useActorMap`: одна `Map` из кэшей
  `useProjects`/`useCompanies`/`useContacts`, без новых запросов.
- Экспортировать тонкую обёртку `useOrgTimeline(kinds?, limit = 20)` — чтобы виджеты
  не передавали `'org', null` руками.

---

## ЗАДАЧА 3: «Последние действия» на дашборде

`src/components/dashboard/DashboardHome.tsx`, `RecentActivityList`.

- Источник: `useOrgTimeline(kindsForTab, 20)` вместо `useRecentActivity(20)`.
- `ACTIVITY_TABS` переписать на `p_kinds` — фильтрация переезжает на сервер:

| Таб | `p_kinds` |
|---|---|
| Все | `null` |
| Стадии | `['stage']` |
| Звонки | `['call']` — теперь **настоящие звонки**, а не `call_logged` из журнала |
| Задачи | `['task']` — настоящие задачи, а не записи журнала о них |
| Удаления | `['deleted']` |

- Текст строки: `event.title` вместо `describeEvent(entry)` — заголовок уже собран.
- Иконка и цвет: `KIND_META` из `EntityTimeline` вместо локальных `EVENT_ICON`/
  `EVENT_COLOR` по `event_type`. Если экспортировать `KIND_META` неудобно — завести
  общий модуль `src/lib/timeline/kind-meta.ts` и импортировать из обоих мест.
  **Двух карт иконок быть не должно.**
- Имя проекта рядом с текстом: `event.parentName`.
- Ссылка: `parentType === 'project' ? /deals/${parentId} : …` — на карточку компании и
  контакта тоже, раньше это было невозможно.
- Пустое состояние и «Создать сделку →» сохранить.

## ЗАДАЧА 4: `ActivityDrawer`

`ActivityWidget` — то же самое, `useOrgTimeline(undefined, 5)`, `event.title`,
`event.parentName`. Собственный формат времени (`5м` / `2ч` / `3д`) сохранить —
это его стиль, не трогать.

## ЗАДАЧА 5: `useRecentActivity` — удалить

После задач 3 и 4 потребителей не остаётся. Удалить хук целиком.

⚠️ **Не потерять realtime.** `useRecentActivity` держал
`useRealtimeSync('activity_log', QUERY_KEY)` — новое событие журнала обновляло виджет
само. Лента такой подписки не имеет. Завести её в `useOrgTimeline`: подписка на
`activity_log` + инвалидация ключа `['timeline','org']`. Полного покрытия это не даёт
(задачу или звонок realtime не принесёт), и **так и записать в комментарии** —
честный частичный realtime лучше молчаливой потери того, что работало.

---

## Критерий приёмки

| Проверка | Ожидание |
|---|---|
| Дашборд, таб «Все» | события **всех шести** видов, а не только журнал |
| Таб «Звонки» | настоящие звонки (`kind='call'`), 14 в базе |
| Таб «Стадии» / «Удаления» | те же записи, что и раньше — функциональность не потеряна |
| Каждая строка | имя сделки/компании рядом, ссылка ведёт на карточку |
| `ActivityDrawer` | 5 событий, смешанные виды |
| org-лента, пагинация | 1510 событий доходят до дна, дублей нет |
| Ролевой смок | manager-не-участник не видит чужих задач **в org-ленте тоже** |

Последняя строка — самая важная: org-режим снимает предикат сущности, и если бы
границу держал не RLS, а тело функции, здесь была бы утечка на всю организацию.

---

## Проверка перед сдачей

```bash
npx tsc --noEmit
npm test          # 1091 + новые
npm run lint      # 49 находок (15 err / 34 warn) — baseline
```

Миграция **не применяется**. В `_analysis/sprint-S-TL-4.md` дописать «Сверку на гейте»:
SQL-цикл до дна для `p_entity_type='org'`, проверка `parent_type`/`parent_id` на
непустоту и согласованность, ролевой смок под тремя ролями.

## КОММИТ

```bash
git add .
git commit -m "S-TL-4: org-лента, «Последние действия» показывают все виды (миграция 115)

Виджеты дашборда и дровера читали activity_log напрямую и выдавали журнал за
всю активность: из 1510 событий организации видели только 801, без звонков,
встреч, задач, сделок и AI.
entity_timeline получает четвёртое значение p_entity_type='org' — вторая функция
с копией тела не заводится. Контракт расширен parent_type/parent_id: на уровне org
событие без указания сделки нечитаемо; имя резолвит клиент из кэшей.
Табы дашборда переехали на p_kinds, добавлены псевдовиды stage и deleted.
Миграция написана и НЕ применена."
```

---

## Сверка на гейте

Миграция 115 **не применена**. Ниже — что гейт обязан прогнать после `apply_migration`
и что уже сверено на живых данных ДО применения (телом функции как обычным SELECT,
read-only, под service-ролью — то есть RLS обойдена: это проверяет механику, а не
видимость; видимость проверяет ролевой смок в §3).

### 1. org-режим: состав, курсор, контекст (сверено до apply)

Полное тело 115 с `p_entity_type='org'`, `p_entity_id=null`, `p_limit=200`, `p_kinds=null`:

| Проверка | Результат |
|---|---|
| строк / уникальных `id` | **200 / 200**, дублей нет |
| виды в выдаче | `task` 77, `activity` 99, `ai_run` 18, `project` 5, `meeting` 1 — **не только журнал** |
| `parent_type` без `parent_id` (и наоборот) | **0** |
| `parent_type` вне `project\|company\|contact` | **0** |
| строк с родителем | 159 из 200 (остальные — записи журнала без привязки, законно) |

Источники org-ленты на 2026-08-09 (сумма — 1510):
`activity_log` 801 (без `stage_transition_committed`), `tasks` 654, `ai_runs` 21,
`projects` 19, `calls` 14, `meetings` 1.

Прогулка по страницам keyset'ом в org-режиме (без предиката сущности) на самом
большом источнике — `tasks`, 654 строки, страницы по 200: **200 + 200 + 200 + 54 =
654 уникальных**. Дно достигается, дублей нет.

**На гейте докрутить до конца union'а:** цикл `p_entity_type='org'`, `p_limit=200`,
курсор от последней строки предыдущей страницы — до страницы короче 200. Ожидание —
**1510 событий, 0 дублей** (число сверить заново: за время до применения оно вырастет).

### 2. Псевдовиды `p_kinds` (сверено до apply, предикат ветки `src_activity`)

```sql
-- ожидание в скобках, сверено 2026-08-09
select count(*) from entity_timeline('org', null, null, null, 200, array['note']);    -- (1)
select count(*) from entity_timeline('org', null, null, null, 200, array['stage']);   -- (89)
select count(*) from entity_timeline('org', null, null, null, 200, array['deleted']); -- (151)
select count(*) from entity_timeline('org', null, null, null, 200, array['activity']);-- (801, упрётся в лимит 200)
select count(*) from entity_timeline('org', null, null, null, 200, array['call']);    -- (14 настоящих звонков)
```

⚠️ **`call` больше не значит `call_logged`.** Таб «Звонки» на дашборде раньше отбирал
записи журнала `call_logged` — их в базе **2**; теперь показывает настоящие звонки —
их **14**. То же с «Задачами»: было 478 записей журнала, стало 654 задачи. Смена
состава — это и есть починка, а не регрессия.

### 3. Ролевой смок — самая важная строка приёмки

org-режим снимает предикат сущности, и границу организации держит **только RLS
источников**. Под тремя ролями (`owner`, `admin`, `manager`-не-участник):

```sql
select count(*), count(*) filter (where kind = 'task') as tasks
from entity_timeline('org', null, null, null, 200, null);
```

Ожидание: у `manager`-не-участника **чужих задач нет** — число `tasks` меньше, чем у
владельца, ровно на недоступные ему по политике `tasks`. Если бы границу держало тело
функции, здесь была бы утечка на всю организацию.

### 4. Сигнатура, колонки и гранты

```sql
select p.oid::regprocedure::text, p.proacl,
       (select array_agg(t.attname order by t.attnum)
          from unnest(p.proargnames) with ordinality as t(attname, attnum)) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'entity_timeline';
-- ожидание: РОВНО одна строка, шесть аргументов, authenticated=X,
-- в returns table — parent_type и parent_id перед payload
```

### 5. Клиент после регена типов

После `gen-types` снять локальный тип `TimelineRpcArgs` и каст клиента в
`use-entity-timeline.ts` (они существуют ровно потому, что 115 не применена).
Мягкую проверку `parent_*` в `isTimelineRpcRow` при этом **не ужесточать без нужды**:
она написана так, чтобы лента пережила окно «клиент выкачен, миграция не применена».

---

## Что НЕ входит

- Шесть новых источников и пересборка таксономии — ждут данных
- Дайджест «что произошло за неделю» письмом — отдельная работа поверх org-ленты
- `task_id` в payload `task_created` — правка триггера
- Долг `kindFilter` (клиентская резка набора чипов) — S-TL-3 задокументировал
