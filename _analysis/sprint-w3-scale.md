# Claude Code Prompt — Sprint W3: Масштабирование данных (счётчики вместо org-fetch, ленивый ⌘K, окна дат, пагинация, last_touch)

Контекст: по ревью 2026-07-18, §P0-2. Сегодня вход в приложение грузит ВСЕ таблицы org целиком (shell в `(dashboard)/layout.tsx` монтирует CommandPalette со всеми 7 сущностями, list-хуки без limit), realtime-инвалидация перекачивает таблицы заново при каждом изменении у коллег. На команде с историей это смерть. Идти строго ПОСЛЕ W1/W2 (трогаем те же хуки).

**Порядок работ важен:** сначала убрать неявных потребителей org-fetch (задачи 1–3), потом резать сами хуки (задача 4) — иначе лимиты сломают виджеты, которые молча едят полный кеш.

## РАЗВЕДКА

```bash
grep -n "useTasks\|useCalls\|useMeetings\|useProjects\|useContacts\|useCompanies\|useLeads" src/app/\(dashboard\)/layout.tsx src/components/shared/CommandPalette.tsx src/components/layout/TextNavSidebar.tsx src/components/layout/EventReminder.tsx src/components/layout/ActivityDrawer.tsx
grep -n "head: true\|count:" src/app/\(dashboard\)/dashboard-content.tsx   # готовый паттерн count-запросов
grep -n "limit(" src/lib/hooks/*.ts        # у кого лимиты уже есть
grep -n "useLastTouchMap" -r src           # потребители: ContactsTable, CompaniesTable, TodayView, ContactDetailHub
sed -n '1,60p' src/lib/hooks/use-last-touch.ts
grep -n "select('\*'\|select(\"\*\"" src/lib/hooks/use-calls.ts src/lib/hooks/use-meetings.ts src/lib/hooks/use-tasks.ts
grep -n "PROJECT_COLUMNS" src/lib/hooks/use-projects.ts   # образец явного списка колонок
grep -n "enabled:" src/components/shared/CommandPalette.tsx || true
```

Интроспекция живой БД (Supabase MCP): `select count(*) from calls / tasks / contacts / companies / meetings;` — зафиксировать базовую линию в PR-описании.

## ЗАДАЧА 1: Счётчики и напоминания — count/окна дат вместо полных таблиц

1. `TextNavSidebar` (бейдж задач): заменить `useTasks()` на новый хук `useTaskBadgeCount()` в `use-tasks.ts` — `select('id', { count: 'exact', head: true })` с фильтром просроченных/сегодняшних (условие взять из текущей логики бейджа; паттерн — `dashboard-content.tsx:29`). queryKey `['tasks','badge-count']`, `useRealtimeSync('tasks')` уже инвалидирует префикс.
2. `EventReminder`: вместо полных calls/meetings/tasks — запросы с окном `.gte('date', today0) .lte('date', tomorrow24)` (календарные ключи через `localDateKey` — после W2). Отдельные queryKey `['calls','reminder-window']` и т.п.
3. `ActivityDrawer` (статы + мини-календарь): счётчики → count-запросы; маркеры мини-календаря → запрос с окном месяца. Activity feed уже лимитирован (50) — не трогать.

## ЗАДАЧА 2: CommandPalette — ленивые данные + серверный поиск

1. Данные не грузятся, пока палитра закрыта: во все запросы палитры `enabled: isOpen`.
2. Серверный поиск вместо полного скачивания: на query ≥ 2 символов — параллельные запросы по сущностям с `ilike` и `limit(10)` (debounce 200мс):
   `tasks.text`, `projects.name`, `companies.name`, `contacts.first_name/last_name (or)`, `calls` — по связанным именам не ищем в v1 (только последние 10 при пустом query), `meetings.title`, `leads.title`.
   queryKey `['palette', entity, query]`, `staleTime: 30_000`.
3. При пустом query — «последние 10» каждой сущности (`order created_at desc, limit 10`), НЕ вся таблица.
4. Секции «Действия»/«Виды»/«Навигация» — как были (они не про данные).

## ЗАДАЧА 3: last_touch — считает БД, не клиент

Сейчас `use-last-touch.ts` строит Map из ВСЕХ звонков и встреч org. Переводим на view.

1. Миграция `supabase/migrations/060_contact_last_touch.sql` (применяет гейт):

```sql
-- Касание = звонок status='done' ИЛИ прошедшая встреча (семантика 1:1 из use-last-touch.ts — сверить!)
create or replace view public.contact_last_touch
with (security_invoker = true)   -- ОБЯЗАТЕЛЬНО: view исполняется под RLS вызывающего
as
select contact_id,
       max(touch_at) as last_touch_at,
       (array_agg(kind order by touch_at desc))[1] as last_touch_kind
from (
  select contact_id, date as touch_at, 'call'::text as kind
    from public.calls where status = 'done' and contact_id is not null
  union all
  select contact_id, (date + coalesce(time, '00:00'::time))::timestamptz as touch_at, 'meeting'
    from public.meetings
    where contact_id is not null
      -- Паритет с клиентом: тот сравнивает с localDateKey (TZ юзера, де-факто МСК).
      -- current_date в БД — UTC, в окно 00:00–03:00 МСК даст другой день. Пиним МСК:
      and date <= (now() at time zone 'Europe/Moscow')::date
) t
group by contact_id;

create index if not exists idx_calls_contact_done_date
  on public.calls (contact_id, date desc) where status = 'done' and contact_id is not null;
create index if not exists idx_meetings_contact_date
  on public.meetings (contact_id, date desc) where contact_id is not null;
```

Семантику «прошедшая встреча» и поля времени сверить с текущим кодом `use-last-touch.ts` перед написанием — view обязана давать тот же ответ, что клиентская Map.

2. `use-last-touch.ts`: `useLastTouchMap()` → один запрос `from('contact_last_touch').select('*')` → та же Map (сигнатура хука и `daysSince`/`touchLevel` не меняются — потребители не трогаются; порог/семантику `touchLevel` в ЭТОМ спринте не менять — это W4b, одна правка поверх view). Инвалидация (grok-ревью подтвердил дыру): `useRealtimeSync('calls')` инвалидирует префикс `['calls']` — ключ `['contact-last-touch']` сам НЕ подхватится. Расширить маппинг в `use-realtime.ts` (таблица → доп. ключи: calls/meetings → `['contact-last-touch']`) — одним местом, не в каждом потребителе.

## ЗАДАЧА 4: Лимиты и явные колонки в list-хуках

1. Явные списки колонок вместо `select('*')` в `use-calls.ts` / `use-meetings.ts` (образец — `PROJECT_COLUMNS` в use-projects): всё, КРОМЕ `ai_summary` (тяжёлый jsonb, спискам не нужен). Для `AiWorkspaceModal`/`AiSummaryPanel` — точечный `useCallDetail(id)` / `useMeetingDetail(id)` с `.eq('id').single()` и полным select (проверить, откуда панель сейчас берёт ai_summary — из `useCalls` по id; перевести на точечный хук).
2. Пагинация списочных страниц: `useContacts`/`useCompanies`/`useCalls` → `useInfiniteQuery` c `.range(page*50, page*50+49)` + кнопка/сентинел «Показать ещё» в `ContactsTable`, `CompaniesTable`, `CallLog`. ВНИМАНИЕ (главный regression-риск спринта по grok-ревью): optimistic-мутации этих сущностей патчат плоский массив — форма infinite-кеша другая (`{pages}`). Завести ОДИН общий хелпер `mapInfinitePages<T>(data, fn)` в `lib/utils/` и переписать onMutate всех трёх сущностей через него; смоук — создание контакта на первой странице (optimistic виден, rollback работает). Сделки/задачи НЕ пагинируем (борды ограничены активным набором — им нужен полный срез). Поиск `ilike '%q%'` идёт seq scan — для текущих объёмов ок, зафиксировать в PR; `pg_trgm`-индексы — отдельной миграцией, когда счёт пойдёт на десятки тысяч.
3. `use-alerts.ts`: перевести на count/window-запросы (после задачи 1 полного кеша tasks/calls в памяти больше нет — алерты не должны вернуть org-fetch обратно).

## ЗАДАЧА 5: Ошибки перестают маскироваться под «нет данных»

`DashboardHome` (KPI), `CommandPalette`, `TodayView`: при `isError` любого источника — компактный бейдж «Данные не загрузились · Повторить» (кнопка → `refetch`). Не тост (политика QueryProvider сохраняется), а видимое состояние на месте нулей. Единый мини-компонент `src/components/shared/DataErrorBadge.tsx`.

## ПРОВЕРКА

```bash
npx tsc --noEmit && npx vitest run
# Ручной смоук в dev: Network-панель на холодном входе на «Сегодня»:
#  - НЕТ запросов contacts/companies/leads (палитра закрыта)
#  - calls/meetings — только окна дат/каунты, не полные таблицы
# Открыть ⌘K → пришли «последние 10», поиск «оri» → серверные ilike-запросы с limit
```

## ГЕЙТ (Cowork)

1. `apply_migration` 060; `get_advisors` (view security_invoker, unindexed FK).
2. Смоук view: контакт с done-звонком вчера → «1 дн.»; с одной запланированной встречей завтра → «касаний не было» (паритет со старой клиентской логикой на 3–5 контактах, сверить с прода до/после).
3. Перф-замер: объём network на холодный вход до/после (зафиксировать в PR).
4. Пагинация: создание контакта на первой странице — optimistic работает, «Показать ещё» дотягивает.
5. docs/schema.md + skill: view contact_last_touch, новые индексы.

## КОММИТ

```bash
git add supabase/migrations/060_contact_last_touch.sql src/lib/hooks/ src/components/shared/CommandPalette.tsx src/components/shared/DataErrorBadge.tsx src/components/layout/ src/components/contacts/ContactsTable.tsx src/components/companies/CompaniesTable.tsx src/components/calls/CallLog.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "Sprint W3: масштабирование — count/window вместо org-fetch, ленивый серверный ⌘K, view contact_last_touch (060), пагинация списков, error-бейджи"
```
