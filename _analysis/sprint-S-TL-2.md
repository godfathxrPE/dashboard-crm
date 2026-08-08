# Claude Code Prompt — S-TL-2: у ленты появляется дно

Ось 2 роадмапа, второй шаг. S-TL-1 перенёс сборку ленты на сервер, не меняя состава.
Этот спринт чинит главный дефект, который перенос обнажил, но не тронул: **лента
показывает не «последние N событий», а «до 50 от каждого источника», и прокрутки
«раньше» нет вообще**.

**Ветка:** `feat/timeline-keyset` от свежего `main` (после мержа `feat/entity-timeline`).
**Миграция:** `113_entity_timeline_keyset.sql` — написать и закоммитить, **не применять**.
Номер сверить запросом к `supabase_migrations.schema_migrations` (последняя —
`20260808204308 entity_timeline`).

---

## Почему в спринте нет новых источников — прочитать до начала

Архитектурный документ обещал в S-TL-2 шесть новых источников (`stage_transitions`,
`messages`, `quotes`, `project_files`, `deal_stakeholders`, `project_checklists`) плюс
пересборку таксономии `kind`. **Этого здесь нет, и это решение, а не сокращение.**

Разведка живой БД на 2026-08-08:

| Источник | Строк во всей базе |
|---|---|
| `messages` в project-каналах | 8 |
| `project_files` | 7 |
| `stage_transitions` | 10 |
| `quotes` | 1 |
| `deal_stakeholders` | 3 |
| `project_checklists` | 0 |

Шесть источников добавят к ленте **29 событий на всю организацию**. При этом они тянут
за собой пересборку `TimelineKind` — а это `KIND_META`, `KIND_LABEL`, `DEFAULT_KINDS`,
`COMPANY_TIMELINE_KINDS`, чипы фильтра, производный чип «Заметки» (`isNoteEvent`),
`open-event.ts` и 12 веток `describeEvent`. Большой риск ради почти нулевой прибавки
данных — ровно то, от чего предостерегает §1 роадмапа: «каждая фича, построенная поверх
пустого множества, увеличивает поверхность системы, не увеличивая её ценность».

Дефект же, который чинит этот спринт, измерим: **3 сделки из 19 уже сегодня упираются
в потолок** (`tasks + activity_log > 50`), и их история за потолком не видна и не
запрашивается. У «Стратек — внедрение» это 143 задачи против показанных 50.

Новые источники берём отдельным спринтом — когда в чате, КП и файлах появятся данные,
и когда расширение таксономии можно будет проверить на непустом множестве.

---

## Что меняется по существу

**Лимит перестаёт быть «на источник» и становится «на страницу».** Это намеренно ломает
критерий приёмки S-TL-1 (построчное совпадение) — и именно смена состава на трёх
«толстых» сделках доказывает, что дефект починен.

**Появляется курсор.** Пара `(ts, id)`, не один `ts`: события одной секунды реальны
(в проде 159 пар в окне ±5 сек), и по одному `ts` страница либо потеряет строки, либо
повторит их.

**Ничьи получают детерминированный разбор.** `ord`/`seq` из 112 уходят целиком: они
воспроизводили порядок конкатенации массивов в старом JS, а при курсоре нужен
устойчивый ключ. Вместо них — `order by ts desc, id desc` сквозь все ветки. Это
закрывает находку гейта S-TL-1: у «Хороший вкус — внедрение» 40 задач с одним и тем же
`created_at`, и их порядок сейчас держится на физическом порядке строк, а не на
контракте.

**`date_trunc('milliseconds', ts)` уходит.** Он существовал ради совпадения с
JS-сортировкой прежней ленты; сортировки на клиенте больше нет, а усечение мешает
курсору — две строки с разницей в 300 мкс схлопывались бы в один ключ.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull && git status --short
git checkout -b feat/timeline-keyset

# 1. база: что есть сейчас
sed -n '1,60p' supabase/migrations/112_entity_timeline.sql
wc -l src/lib/hooks/use-entity-timeline.ts src/lib/timeline/rpc-adapter.ts \
      src/components/shared/EntityTimeline.tsx

# 2. кто зовёт ленту и с какими опциями
grep -rn -A 9 "<EntityTimeline" src/components/projects/ProjectDetail.tsx \
  src/components/companies/CompanyDetail.tsx src/components/contacts/ContactDetailHub.tsx

# 3. группировка и splitUpcoming — их поведение при пагинации меняется
grep -n "splitUpcoming\|groups\|sameMonth" src/components/shared/EntityTimeline.tsx | head

# 4. номер миграции — из ledger
ls supabase/migrations/ | tail -3
```

Ожидается: 112 на месте, три потребителя с `includeSystem: true`, последний файл
миграции — `112_entity_timeline.sql`.

---

## ЗАДАЧА 1: миграция `113_entity_timeline_keyset.sql`

### 1.1 Индексы под ось курсора

У задачи ось события — `coalesce(deadline, created_at)`, и по ней же теперь идёт отбор.
Обычный индекс по `created_at` для этого бесполезен — нужен индекс по выражению.

```sql
create index if not exists idx_tasks_project_ts
  on public.tasks (project_id, (coalesce(deadline, created_at)) desc);
create index if not exists idx_tasks_company_ts
  on public.tasks (company_id, (coalesce(deadline, created_at)) desc);
create index if not exists idx_tasks_contact_ts
  on public.tasks (contact_id, (coalesce(deadline, created_at)) desc);
```

Индексы из 112 (`idx_tasks_*_created`) **не удалять**: они остаются нужны доске задач
и прежним выборкам. Три новых аддитивны, `concurrently` не требуется — 654 строки.

### 1.2 Функция: сигнатура

```sql
create or replace function public.entity_timeline(
  p_entity_type text,
  p_entity_id   uuid,
  p_before      timestamptz default null,   -- курсор: ts последнего показанного
  p_before_id   text        default null,   -- курсор: его id (тай-брейк)
  p_limit       int         default 50
)
returns table (
  ts timestamptz, id text, source text, kind text,
  actor_id uuid, ref_type text, ref_id uuid, payload jsonb
)
language sql stable security invoker
set search_path = public, pg_temp
```

⚠️ **Старую трёхаргументную функцию не удалять этой же миграцией.** Postgres допускает
перегрузку, но PostgREST при двух кандидатах с пересекающимися именами аргументов
отвечает `PGRST203` (ambiguous). Поэтому:

```sql
drop function if exists public.entity_timeline(text, uuid, int);
```

**первой строкой** миграции, до `create or replace`. Клиент обновляется тем же PR, так
что окна несовместимости нет; но в `docs/schema.md` это отметить явно — сигнатура
меняется, а не расширяется.

### 1.3 Тело: что переписывается

Взять тело из 112 и внести ровно четыре изменения. Всё остальное — маппинг источников,
дедуп `union`, `meetings.date::timestamp at time zone 'UTC'`, разделение
`created_at`/`deadline` у задач — **оставить буква в букву**.

**(а) Каждая ветка получает фильтр курсора и общий tie-break.** Шаблон на примере
`src_calls`; так же для остальных пяти:

```sql
src_calls as (
  select c.date as ts,
         'call:' || c.id::text as id,
         'calls' as source, 'call' as kind,
         c.created_by as actor_id,
         'call' as ref_type, c.id as ref_id,
         jsonb_build_object('status', c.status, 'next_step', c.next_step,
                            'agreements', c.agreements) as payload
  from calls c
  where ( (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id) )
    -- курсор: грубая отсечка по ts, точная — снаружи по паре (ts, id)
    and (p_before is null or c.date <= p_before)
  order by c.date desc, ('call:' || c.id::text) desc
  limit (select v from n)
),
```

Внутренний `order by` обязан нести **тот же tie-break**, что и внешний. Иначе при
ничьих (у «Хороший вкус» 40 задач с одним `created_at`) ветка отдаст произвольные N
строк, а внешний запрос отсортирует уже урезанный набор — и часть событий пропадёт
безвозвратно, без всякого признака.

**(б) `src_tasks`: отбор переезжает на ось события.** Подзапрос `order by created_at
desc limit N` заменяется на отбор по `coalesce(deadline, created_at)` — иначе курсор
и выборка живут на разных осях, и страница «раньше» будет терять задачи:

```sql
from (
  select t2.id, t2.text, t2.lane, t2.deadline, t2.created_at, t2.created_by
  from tasks t2
  where ( … тот же предикат сущности … )
    and (p_before is null or coalesce(t2.deadline, t2.created_at) <= p_before)
  order by coalesce(t2.deadline, t2.created_at) desc, ('task:' || t2.id::text) desc
  limit (select v from n)
) t
```

**(в) `ord`/`seq` и `date_trunc` удаляются.** Финал становится:

```sql
select all_src.ts, all_src.id, all_src.source, all_src.kind,
       all_src.actor_id, all_src.ref_type, all_src.ref_id, all_src.payload
from ( … union all шести веток … ) all_src
where p_before is null
   or (all_src.ts, all_src.id) < (p_before, coalesce(p_before_id, 'zzzz'))
order by all_src.ts desc, all_src.id desc
limit (select v from n);
```

Строковое сравнение пары — стандартный keyset. `coalesce(p_before_id, 'zzzz')`
страхует вызов с `p_before` без `p_before_id`: тогда отсечка вырождается в
«строго раньше этого ts».

**(г) `src_ai`: `actor_id` заполняется.** В 112 стоял `null::uuid` ради совпадения с
эталоном — критерия больше нет, ставим `r.created_by` (колонка `ai_runs.created_by`
NOT NULL). В подзапрос добавить `ar.created_by` в оба ветки `union`.

### 1.4 Комментарий и гранты

`comment on function` переписать под новую сигнатуру: **лимит на страницу, курсор
(ts, id)**. Гранты повторить — после `drop`+`create` они не наследуются:

```sql
revoke all on function public.entity_timeline(text, uuid, timestamptz, text, int) from public, anon;
grant execute on function public.entity_timeline(text, uuid, timestamptz, text, int) to authenticated;
```

### 1.5 `docs/schema.md`

Раздел «Лента сущности» обновить тем же PR, статус — **`НАПИСАНА, НЕ ПРИМЕНЕНА`**
(версию проставит гейт). Явно отметить: сигнатура **заменена**, старая трёхаргументная
удалена; лимит сменил смысл; `ord`/`seq`/`date_trunc` удалены и почему.

---

## ЗАДАЧА 2: хук — `useInfiniteQuery`

`src/lib/hooks/use-entity-timeline.ts`.

```ts
const PAGE_SIZE = 50;   // лимит СТРАНИЦЫ, не источника — переименовать из PER_SOURCE_LIMIT

const timeline = useInfiniteQuery({
  queryKey: ['timeline', entityType, entityId],
  initialPageParam: null as { ts: string; id: string } | null,
  queryFn: ({ pageParam }) => fetchTimelinePage(entityType, entityId!, pageParam),
  getNextPageParam: (lastPage) =>
    lastPage.length < PAGE_SIZE
      ? undefined                                   // страница неполная ⇒ дно достигнуто
      : { ts: lastPage[lastPage.length - 1].date, id: lastPage[lastPage.length - 1].id },
  enabled,
  staleTime: STALE_TIME,
});
```

`fetchTimelinePage` передаёт `p_before` / `p_before_id` из `pageParam`. Курсор берётся
из **последнего события страницы** — `TimelineEvent.date` и `TimelineEvent.id`, то есть
ровно те значения, что вернул SQL (`id` уже в форме `kind:uuid`).

Возвращаемое значение хука расширяется, существующие поля сохраняются:

```ts
return {
  events,                       // flat по всем загруженным страницам
  isLoading: timeline.isLoading,
  error: timeline.error as Error | null,
  hasMore: timeline.hasNextPage,
  loadMore: timeline.fetchNextPage,
  isLoadingMore: timeline.isFetchingNextPage,
};
```

⚠️ **Резолв актора остаётся на сборке** (`useActorMap`) и должен применяться ко всем
страницам, а не только к первой — проверить, что `useMemo` зависит от
`timeline.data?.pages`, а не от одной страницы.

⚠️ **`includeSystem` снимается**, как и обещано в S-TL-1: RPC отдаёт все шесть
источников, флаг только прятал два вида на клиенте, все три потребителя передают
`true`. Удалить из хука, из `UseEntityTimelineOptions` и из трёх call-site.
Если после удаления `options` становится пустым — убрать проп целиком.

---

## ЗАДАЧА 3: UI — кнопка «Показать раньше»

`src/components/shared/EntityTimeline.tsx`, после списка групп, до закрывающего тега:

```tsx
{hasMore && (
  <button
    onClick={() => loadMore()}
    disabled={isLoadingMore}
    className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-text-dim
               transition-colors hover:bg-surface-hover hover:text-text-main disabled:opacity-50"
  >
    {isLoadingMore ? 'Загружаем…' : 'Показать раньше'}
  </button>
)}
```

Кнопка, а не бесконечная прокрутка: лента живёт внутри блока с `max-h`, и
scroll-триггер в контейнере с собственным скроллом ведёт себя непредсказуемо при
вложенной прокрутке страницы. Прокрутку можно добавить позже поверх той же механики.

⚠️ **Клиентский фильтр по `kind` теперь врёт.** Он фильтрует загруженные страницы, а не
ленту: выбрав «Звонки», человек видит звонки только из первых 50 событий. Это уже так
работало (комментарий в компоненте это признаёт), но с пагинацией становится заметно.
В этом спринте **не чинить** — вынести в бэклог как «фильтр по kind должен уехать в
параметр RPC `p_kinds text[]`». Добавить к чипам подпись-подсказку не нужно: молчаливое
поведение лучше объяснить один раз в S-TL-3, чем городить полумеру.

**Группировка** («Просрочено / Этот месяц / Ранее») пересчитывается по всем загруженным
событиям — менять не нужно, она уже строится от `filtered`.

---

## ЗАДАЧА 4: три хвоста от S-TL-1

1. **`meeting_scheduled` в `describeEvent`.** Сейчас событие журнала «встречу
   запланировали» и сама встреча рендерятся одинаково — «Встреча: Фитнес Десерты», —
   и на карточке компании читаются как дубль. Найдено гейтом. В
   `src/lib/utils/activity-events.ts` ветку `meeting_scheduled` переписать на
   **«Запланирована встреча: …»**; дату брать из `payload.date`, если нужна в `detail`.
2. **`actor_id` у `ai_runs`** — сделано в задаче 1(г), проверить, что в ленте у
   AI-событий появился автор.
3. **Тай-брейк по `id`** — сделано в задаче 1(а/в).

---

## ЗАДАЧА 5: тесты

`tests/unit/` — три новых файла или дополнения к существующим:

1. **Курсор.** Чистая функция построения `pageParam` из последнего события: полная
   страница → курсор, неполная → `undefined` (дно). Вынести её из хука в
   `src/lib/timeline/cursor.ts`, чтобы тест не тянул React Query.
2. **Склейка страниц.** Две страницы по 50 → 100 событий, порядок сохранён, дублей нет
   (проверять по `id`).
3. **`describeEvent('meeting_scheduled')`** → «Запланирована встреча: …», и он **не
   равен** заголовку события `kind='meeting'` с тем же названием.

Тест, который CC-прогон обязан подтвердить красным на дефектном коде: убрать tie-break
из внутреннего `order by` — тест склейки страниц должен упасть на дублях/пропусках.
Это проверяется не юнит-тестом, а на гейте (см. ниже), но записать ожидание нужно.

---

## Критерий приёмки — он ДРУГОЙ, чем в S-TL-1

Построчного совпадения с прежней лентой **не будет и быть не должно**. Вместо него:

| Проверка | Ожидание |
|---|---|
| «Стратек — внедрение» (143 задачи, 50 activity) | первая страница — **честные последние 50** событий по `ts`, а не 50+50 |
| Кнопка «Показать раньше» | добавляет ещё 50, дублей нет, порядок не рвётся |
| Дно | на сделке с <50 событий кнопки нет вовсе |
| «Хороший вкус» (40 задач с одним `created_at`) | порядок **устойчив** между перезагрузками |
| Компания / контакт | лента не пустеет, транзитивные источники на месте |
| Ошибка | ветка ошибки из фикса S-TL-1 продолжает работать |

---

## Проверка перед сдачей

```bash
npx tsc --noEmit
npm test          # 1075 + новые
npm run lint      # 49 находок (15 err / 34 warn) — baseline
```

Миграция **не применяется**. В `_analysis/sprint-S-TL-2.md` дописать раздел «Сверка на
гейте»: команды для проверки склейки страниц через RPC (две страницы подряд, сравнение
множеств `id` на пересечение — оно обязано быть пустым) и ролевой смок под
owner / manager-участник / manager-не-участник.

## КОММИТ

```bash
git add .
git commit -m "S-TL-2: keyset-курсор и прокрутка «раньше» (миграция 113)

Лимит переехал с источника на страницу — лента перестала молча обрываться
на 50 событиях от каждого источника (3 сделки из 19 упирались в потолок).
Курсор — пара (ts, id); ord/seq и date_trunc из 112 удалены, порядок ничьих
теперь задан контрактом, а не физическим порядком строк.
Новые источники сознательно НЕ вошли: 29 строк на всю базу против пересборки
таксономии kind — отдельным спринтом, когда появятся данные.
Миграция написана и НЕ применена."
```

---

## Что НЕ входит — не делать

- Шесть новых источников и пересборка `TimelineKind` — отдельный спринт, см. шапку
- `p_kinds` в RPC (серверный фильтр по видам) — S-TL-3
- `org_timeline()` для дайджеста — S-TL-3
- Бесконечная прокрутка вместо кнопки
- Дедуп смены стадии по эпохам — он нужен только вместе с `stage_transitions`
- `task_id` в payload `task_created` — отдельная правка триггера

---

# Сверка на гейте (S-TL-2, дописано исполнителем)

Проверять **после** `apply_migration 113` и регена типов. Все запросы read-only,
кроме самого apply. `X` ниже — id сделки; эталонные значения сняты 2026-08-09
на живой БД (`uoiavcabxgdjugzryrmj`):

| Сделка | id | всего событий |
|---|---|---|
| Стратек — внедрение | `562c6104-e734-4a74-93d1-8a1c37f9476c` | 143 задачи + 103 журнала = **246** |
| Хороший вкус — внедрение | `73ef7090-4d68-48b3-bd69-1b0f28d17a3b` | 40 + 17 = **57** |
| Завод Атлант | `a56ddc6c-0930-4252-a582-18be21a795e7` | 2 + 49 = **51** |

У всех трёх `calls`, `meetings` и `ai_runs` — **ноль** (сверено 2026-08-09), поэтому
суммы точные, а не нижняя граница: числа страниц ниже можно сравнивать буквально.

## 1. Склейка страниц — пересечение обязано быть ПУСТЫМ

Главная проверка спринта. Гоняется от `postgres` (RLS не мешает увидеть весь набор);
ролевую видимость проверяет п. 4.

```sql
with p1 as (
  select * from public.entity_timeline('project', '562c6104-e734-4a74-93d1-8a1c37f9476c', null, null, 50)
), cur as (
  select ts, id from p1 order by ts asc, id asc limit 1
), p2 as (
  select t.* from cur, lateral public.entity_timeline(
    'project', '562c6104-e734-4a74-93d1-8a1c37f9476c', cur.ts, cur.id, 50
  ) t
)
select (select count(*) from p1)                                             as n1,
       (select count(*) from p2)                                             as n2,
       (select count(*) from (select id from p1 intersect select id from p2) x) as overlap,
       (select count(distinct id) from (select id from p1 union all select id from p2) y) as uniq_total,
       (select min(ts) from p1) as p1_min,
       (select max(ts) from p2) as p2_max;
```

**Ожидание:** `n1 = 50`, `n2 = 50`, **`overlap = 0`**, `uniq_total = 100`,
`p2_max <= p1_min`. Ровно эти числа получены на теле функции ДО apply
(`p1_min = 2026-07-24 06:51:24.025678+00`, `p2_max = 2026-07-24 06:51:23.587466+00`).

**`overlap > 0` — блокер, не косметика.** Это значит, что тай-брейк по `id` где-то
разъехался: страницы пересеклись, а значит столько же событий провалилось между ними
незамеченными.

## 2. Устойчивость порядка на ничьих

У «Хороший вкус» **40 событий с одним и тем же `ts`** (`2026-07-12 17:43:03.178164+00`)
— пагинация режет ленту ровно посреди этого блока (57 событий, страница 50).

```sql
select count(*) as n, count(distinct id) as n_uniq,
       md5(string_agg(id, ',' order by ts desc, id desc)) as fingerprint
from public.entity_timeline('project', '73ef7090-4d68-48b3-bd69-1b0f28d17a3b', null, null, 50);
```

Прогнать **дважды подряд** — `fingerprint` обязан совпасть. До 113 порядок этих 40
держался на физическом порядке строк, то есть ни на чём.

Вторая страница той же сделки обязана быть **неполной** (57 − 50 = 7) — это и есть
дно, по которому клиент прячет кнопку:

```sql
with cur as (
  select ts, id from public.entity_timeline('project', '73ef7090-4d68-48b3-bd69-1b0f28d17a3b', null, null, 50)
  order by ts asc, id asc limit 1
)
select count(*) from cur, lateral public.entity_timeline(
  'project', '73ef7090-4d68-48b3-bd69-1b0f28d17a3b', cur.ts, cur.id, 50) t;
```
**Ожидание: 7.**

## 3. Компания и контакт не опустели

```sql
select 'company' as scope, count(*) from public.entity_timeline('company', (select company_id from projects where id = '562c6104-e734-4a74-93d1-8a1c37f9476c'), null, null, 50)
union all
select 'contact', count(*) from public.entity_timeline('contact', (select contact_id from projects where id = '562c6104-e734-4a74-93d1-8a1c37f9476c'), null, null, 50);
```
Обе строки > 0. ⚠️ У компании и контакта ветка `activity` **только транзитивная**
(`activity_log.company_id` / `.contact_id` = NULL у всех 809 строк) — если тут ноль,
смотреть `scope_projects`, а не курсор.

## 4. Ролевой смок — owner / manager-участник / manager-НЕ-участник

`entity_timeline` — **`SECURITY INVOKER`**, видимость целиком наследуется от RLS
источников. Смысл смока: убедиться, что после `drop`+`create` не поехали ни гранты,
ни видимость.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '<uid>', 'role', 'authenticated')::text, true);
select count(*) as n, count(*) filter (where kind = 'task') as tasks
from public.entity_timeline('project', '562c6104-e734-4a74-93d1-8a1c37f9476c', null, null, 50);
rollback;
```

| Актор | Ожидание |
|---|---|
| **owner** орг | лента полная, 50 строк |
| **manager, участник сделки** (`project_members`) | лента непустая; `tasks` ≤ owner'ского (`tasks_select` = assigned_to ∨ created_by ∨ `is_project_member`) |
| **manager, НЕ участник** | сделка чужая → задач не видит; ноль или только то, что даёт `activity_log` по org-политике |
| **anon** | `permission denied for function entity_timeline` — грант снят явно |

⚠️ Пункт «anon» проверять **обязательно**: гранты после `drop function` не наследуются,
и если бы `revoke/grant` в миграции забыли, дефолт пустил бы `public`.

## 5. Что смотреть в UI

1. «Стратек — внедрение»: первая страница — **честные последние 50 событий по дате**,
   а не 50 задач + 50 записей журнала. Внизу — кнопка «Показать раньше».
2. Клик по кнопке → +50 событий, **дублей нет**, стык страниц не рвёт порядок дат.
3. «Завод Атлант» (ровно 51 событие) — кнопка есть, вторая страница = **1** событие,
   после неё кнопка исчезает.
4. Сделка с < 50 событий — кнопки нет вовсе.
5. Карточка компании: событие журнала теперь читается «**Запланирована встреча: X**»
   и больше не сливается с самой встречей «Встреча: X».
6. У AI-событий появился автор (`ai_runs.created_by`).
7. Ветка ошибки жива: сломать RPC (например, звать с несуществующим именем) → на
   экране «Не удалось загрузить активность», а НЕ «Пока нет активности».

## 6. Advisors

Новых WARN не ожидается: функция остаётся `SECURITY INVOKER` (в
`authenticated_security_definer_function_executable` она не попадает по построению),
три новых индекса аддитивны. Появление `unindexed_foreign_keys` / `unused_index` на
`idx_tasks_*_ts` — норма до первого прогрева.
