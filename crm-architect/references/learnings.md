# Learnings & Gotchas

Hard-won knowledge from 40+ спринтов. **Read before every sprint prompt.**

---

## Supabase

### ❌ Never override `storageKey` or `flowType` in Supabase client
**What happens**: browser/server session mismatch → infinite redirect loops on auth.
**Fix**: use default Supabase client config. No overrides.
**Correction (2026-06-12)**: ранее запись называла `flowType: 'pkce'` причиной —
мисдиагноз. Default в @supabase/ssr — `'pkce'`, и он корректен. Ломает именно
override, в частности `flowType: 'implicit'` (рушит server-side code exchange).
Не переопределяй flowType вообще.

### ❌ Never use generic trigger functions for multiple tables
**What happens**: `OLD.column_name` references resolve at parse time, not runtime.
A trigger function that branches on `TG_TABLE_NAME` and references `OLD.name`
will fail on tables that don't have a `name` column — even inside an
`IF TG_TABLE_NAME = 'projects'` block.
**Fix**: one trigger function per table (migration 011).

### ❌ Never clean up FK references client-side on DELETE
**What happens**: RLS blocks the client from updating rows in other tables
(e.g., setting `project_id = NULL` on tasks when deleting a project).
**Fix**: use `ON DELETE SET NULL` or `ON DELETE CASCADE` at the database level.
The DB handles FK cleanup before RLS is evaluated.

### ❌ Never use `supabase db push` or CLI migration tools
**What happens**: schema drift, migration conflicts, broken state.
**Fix**: **apply — операция гейта через Supabase MCP** (`apply_migration` → gen-types →
advisors → ролевые смоки), не CLI и не ручной прогон в SQL Editor. Claude Code пишет
`supabase/migrations/0NN_name.sql`, коммитит и на этом останавливается.
_(До 2026-08-05 здесь стоял до-гейтовый реликт — «прогнать SQL руками в дашборде», —
прямо противоречивший действующему контракту. Заменён.)_

### ✅ Always add `IF NOT EXISTS` to ALTER TABLE / CREATE INDEX
Prevents errors when re-running migrations or when column already exists.

### ✅ Always make new FK columns nullable with `ON DELETE SET NULL`
Unless it's a junction table (CASCADE) or owned resource (CASCADE).
Non-nullable FKs cause delete failures when parent is removed.

### ✅ activity_log.project_id must be nullable
Deleted entities have no project. Entity-deletion log entries need `project_id = NULL`.

### ⚠️ Дефолтные model-строки в edge — сверять с docs на гейте; смена через env
Хардкод `model: 'claude-…'` в edge-функции устаревает молча. Дефолт держи через
`Deno.env.get('AI_…_MODEL') ?? '<строка>'`, а саму строку **сверяй с актуальным списком
моделей на гейте перед деплоем** (S-AI-1: `claude-sonnet-4-6 → claude-sonnet-5` поправили
именно на гейте). Смена модели в проде — через env-переменную секрета, **не редеплой**
функции. Так же сделано в S28 (`AI_SUMMARY_MODEL`).

### ✅ Однострочники из журнала (детали — по ссылке на раздел)
- Интроспекция: `like '%foo_bar%'` по `prosrc` врёт — `_` вайлдкард; проверять `position()`. Гранты — только `unnest(relacl)`. Журнал: «S-COST-TRUTH-1», «Сквозные грабли».
- `net._http_response` — первое место при сбое `pg_net`→edge: статус и тело дословно. Журнал: «S-TG-1».
- `RETURNS TABLE` — часть типа возврата: новая колонка = `drop` + `create` (42725 не грозит — аргументы те же). Клиент лишние поля ответа RPC молча игнорирует ⇒ «apply → потом редеплой» безопасен. Журнал: «S-TG-2».
- `exception` вешать на ОПЕРАЦИЮ, не на тело: вложенный блок = SAVEPOINT, обработчик знает свой констрейнт. Журнал: «S-TG-3-INN-DUP».
- Флаг «уже сделано» (`*_at`) обязан знать, ЧТО его сбрасывает (`reminded_at` ↔ триггер сброса на deadline). Журнал: «S-TG-2».
- Событие журнала обязано нести id сущности, даже если сегодня его никто не читает: 478 `task_created` без `task_id` невосстановимы. Журнал: «S-COST-TRUTH-1».
- Автогенерация типов описывает СХЕМУ, а не права: тип компилируется — запрос может быть запрещён grants/RLS. Журнал: «S-TG-1».

### ⚠️ `AFTER UPDATE OF <col>` не фичит derived-by-BEFORE-trigger колонки
Если `<col>` проставляется BEFORE-триггером (напр. `status` дерайвится из `stage_id`),
то `AFTER UPDATE OF status` **не сработает** (в момент постановки события старого UPDATE OF
ещё нет изменения). Решение: plain `AFTER UPDATE` + явный `WHEN`. И помни: `EXCEPTION WHEN
OTHERS` в теле молча **маскирует** нарушение CHECK/constraint — фичу гейтить смоуком, а
коммит — по `git show --stat` (2 бага Cowork'а в 045 нашлись именно смоуком: `OF status`
не фичил + `notifications_type_check` не пускал `deal_won`).

### ⚠️ jsonb-колонку НЕ обновлять с клиента через supabase-js `update()` — он ЗАМЕНЯЕТ её целиком
Дописывание ключей — только `result || …` в RPC (INVOKER + RLS UPDATE). Детали: журнал, «Уроки 2026-08-22».

### ✅ Прежде чем дописать значение в колонку — перечислить ВСЕ механизмы, которые её держат, и читателей, которые по ней фильтруют
127 держал capture шестью механизмами; запись типа в колонку молча изменила бы таймлайны. Связь ушла в jsonb. Детали: журнал, «Уроки 2026-08-22».

---

## Edge-функции и шлюз

### ⛔ Шлюз рвёт синхронный вызов ~90 с — 502 БЕЗ нашего тела
Свой таймаут ставить заведомо ниже шлюзового; единицу работы — с трёхкратным запасом.
Дорогой этап не имеет права быть отменён дешёвым: оплаченный результат фиксируется
(фаза `partial`), сбой единицы не прерывает цикл. Журнал: «S-FIX-VOICE-1».

### ✅ `verify_jwt=true` — пробник без секретов: POST с битым телом
**400** от тела = шлюз пропустил, **401** = нет. `SUPABASE_SERVICE_ROLE_KEY` с 18.08.2026 —
`sb_secret_…`, НЕ JWT ⇒ edge→edge только `EDGE_INVOKE_JWT`/anon-JWT. Журнал: «S-TG-3», «S-TG-VOICE-1», «FIX tg-capture-401».

### ✅ Общий модуль в `_shared/` вместо зеркала — где расхождение копий НЕ имеет симптома
Фильтры, лимиты, правила → один файл, два специфера (Deno с расширением `.ts`, TS без).
Зеркало + побайтовый тест допустимы для текстов промптов (расхождение видно). Порог,
нужный обеим сторонам, — третий модуль без импортов и без `Deno` (`_shared/*-limits.ts`):
импорт из чужого `index.ts` поднимает второй `Deno.serve`. Журнал: «S-TG-3», «S-TG-VOICE-1».

### ⚠️ Числовые константы из чужого кода — опознавать, чья это граница
4.5 МБ был вериселев лимит, не Groq (у того 25). Одна константа на два смысла — всегда долг. Журнал: «S-R3-VOICE-1», «S-FIX-VOICE-1».

---

## Multi-tenancy & RLS (фаза 1, S23–S26)

### ❌ Self-referencing RLS policy → infinite recursion (42P17)
Политика на таблице, чей `USING` делает подзапрос к **той же** таблице
(`memberships` проверяет членство через `memberships`), падает с
`infinite recursion detected in policy` — RLS применяется и к подзапросам внутри
политик. **Fix**: выносить проверку в `SECURITY DEFINER` helper (`is_org_member`),
который RLS обходит (021).

### ✅ Initplan-паттерн: оборачивай вызовы в `( SELECT ... )`
`( SELECT auth.uid() )`, `( SELECT public.current_org_role() )` — no-arg STABLE
функции планировщик вычисляет **один раз** на запрос (initplan), а не per-row.
Голый `current_org_role()` или параметризованный `shares_org_with(id)` —
вычисляется на каждую строку. Все org-политики используют обёртку (023).

### ✅ Hardening-конвенция для КАЖДОЙ новой функции
`SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL:
- **RLS/RPC-helpers** (зовёт клиент): `REVOKE anon`, `GRANT authenticated, service_role`.
- **Триггерные** (зовёт только триггер): `GRANT service_role` только — EXECUTE
  проверяется при `CREATE TRIGGER`, не при срабатывании, поэтому authenticated
  не нужен. Без `search_path` advisors ругается (mutable search_path).

### ❌ Service-контекст: `auth.uid()` = NULL → `current_org_id()` = NULL
В SQL Editor / MCP / фоне JWT нет → helpers возвращают NULL. Триггеры, пишущие
в NOT NULL `org_id`, обязаны наследовать его из строки:
`org_id = COALESCE(OLD.org_id, current_org_id())` (delete-логи),
`COALESCE(NEW.org_id, ...)` (stage-sync). Иначе `NOT NULL` роняет запись — а под
`EXCEPTION WHEN OTHERS` лог **молча теряется** (инцидент S24, фикс 024).

### ✅ `trg_set_org_id` заполняет `org_id` только при NULL
Явно переданное значение (из OLD/NEW в definer-триггере) переживает BEFORE INSERT.
На org-инфру (invitations/notifications) триггер НЕ вешается — org_id всегда явный.

### ⚠️ Member-гард в SECURITY DEFINER функции — только для auth-контекста
Гард владения/членства (`IF NOT is_org_member(...) THEN RAISE 42501`) в
SECURITY DEFINER функции оборачивай в `auth.uid() IS NOT NULL AND ...`. Иначе в
service-контексте (`auth.uid() IS NULL`: бэкфиллы, MCP/SQL Editor, автоматизация,
служебные операции) гард ложно срабатывает и роняет легитимную операцию `42501`.
Поймали на гейте 027 (S27): member-гард в `check_stage_requirements` падал бы на
ЛЮБОМ служебном UPDATE стадии. **Ключевое:** гард защищает только RPC-поверхность
(чужие org через прямой вызов) — сами бизнес-проверки должны идти ПОСЛЕ гарда и
выполняться для всех контекстов (в service-режиме доверяем вызывающему коду).
Симметрично записи org_id: там `COALESCE(..., current_org_id())` (см. выше) —
service-контекст обрабатывается явно, не через отказ.

### ❌ SECURITY DEFINER: сравнение с `current_org_id()`/`current_org_role()` — ТОЛЬКО NULL-safe
В императивной SECURITY DEFINER-функции гард вида `IF v_row.org_id <> current_org_id()
THEN RAISE 42501` **дырявый**: при `current_org_id() IS NULL` (authenticated без
membership — существуют в invite-flow S26; service-контекст) сравнение `<> NULL` даёт
`NULL` → `IF NULL` не срабатывает → **оба гарда молча пропускают**, чужак проходит.
Аналогично `current_org_role() NOT IN (...)`: `NULL NOT IN (...)` = `NULL` → пропуск.
**Fix**: NULL-safe и явный отказ без org-контекста:
```sql
IF public.current_org_id() IS NULL
   OR v_row.org_id IS DISTINCT FROM public.current_org_id() THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF COALESCE(public.current_org_role(), '') NOT IN ('owner','admin') AND ... THEN ...
```
Поймали на гейте PCT-1: дыра в `delete_project_column` **подтверждена направленным
смоком** (чужак удалял пустую не-последнюю колонку любого тенанта) и **закрыта в 033**.
**Отличие от RLS-политик**: там NULL в `USING` = deny (безопасно по умолчанию) — дыра
специфична ИМПЕРАТИВНЫМ проверкам в функциях. Симметрично member-гарду выше: NULL-контекст
обрабатывай явно, не полагайся на «само отсечётся».
**Ещё раз в S-DEPS-1 B1 (048):** DEFINER-валидатор `check_task_dependency_valid()` читает
`tasks` в обход RLS — обе задачи ребра обязаны быть `= current_org_id()` вызывающего, под
`auth.uid() IS NOT NULL`, NULL-safe. Иначе cross-tenant ребро между задачами разных орг по
известным UUID. Тот же паттерн, новое место — DEFINER + чтение чужих строк = всегда явный org-гард.

### ⚠️ EXCEPTION-политика: валидатор НЕ глотает, исполнитель глотает (S27 ↔ S29)
Противоположные политики `EXCEPTION` для двух классов триггеров на одной таблице:
- **BEFORE-валидатор** (гейт `aa_enforce_stage_gate`, S27) — **НЕ глотает**:
  его работа — заблокировать операцию (`RAISE ... ERRCODE`). Глотание убило бы
  смысл гейта.
- **AFTER-исполнитель** (автоматизация `run_stage_automations`, S29) — **глотает
  всё**: побочное действие (создать задачу) НИКОГДА не должно ронять исходную
  операцию (переход стадии). Два уровня: внешний `EXCEPTION WHEN OTHERS THEN
  RETURN NEW` (весь исполнитель) + вложенный `BEGIN/EXCEPTION` на каждый элемент
  цикла (падение одного правила не гасит остальные).
Симметрично: `notify_*`-триггеры (S26) — тоже AFTER-исполнители, тоже глотают.
**Композиция вместо дублирования**: S29 не пишет уведомление руками — задача с
`assigned_to` триггерит `notify_task_assigned` (S26). Строй новую механику как
INSERT, дёргающий уже существующий триггерный конвейер.

### ✅ Порядок триггеров именем: `aa_` — первым, `zz_` — последним
Postgres вызывает триггеры одного события в алфавитном порядке имени. Гейт S27 —
`trg_aa_enforce_stage_gate` (отклонить ДО синков). Автоматизация S29 —
`trg_zz_run_automations` (сработать ПОСЛЕ всех BEFORE-синков и AFTER-логов, по
финальным `NEW`). Префикс — сознательный инструмент упорядочивания.

### ❌ Живое тело функции ≠ файл миграции в репо
`CREATE OR REPLACE FUNCTION` бери из `pg_get_functiondef(oid)` (там реальные
`SECURITY DEFINER`/`search_path`/тело), меняй минимально. `convert_lead` в репо
ссылался на `companies/contacts/projects.user_id` — колонок нет (владение через
`owner_id`/`created_by`), **прод был сломан** (42703), поймали только на гейте
применения 024. Всегда сверяй тело интроспекцией перед правкой.

### ❌ Volatile-функция с side effects: изменения не видны подзапросам того же statement
Postgres statement видит снапшот на начало. `UPDATE ... RETURNING` внутри CTE +
проверочный `SELECT` в том же запросе → SELECT не увидит изменений. Проверочные
чтения (`apply_pending_invites` идемпотентность) — **отдельным** запросом.

### ⚠️ projects: `direction`/`pipeline_id`/`stage_id` — NOT NULL только для `type='client'` (с 032)
До PCT-1 (032) все три были NOT NULL — вставки в projects падали без них. **С 032**
они **nullable**, но связаны CHECK-инвариантом `projects_type_pipeline_chk`:
`type='client'` → все три NOT NULL; `type='internal'` → `pipeline_id`/`stage_id` NULL
(internal-проект вне воронки). Sid/smoke клиентских сделок по-прежнему передают все три;
internal — передают `type='internal'` + стадийные поля `null` (иначе инвариант падает).
Legacy `stage` у internal зануляет `trg_ab_null_internal_stage` (DEFAULT `new_lead`
сохранён ради convert_lead).

### ❌ Перенос сортировки из JS в SQL: `getTime()` режет до миллисекунд, Postgres считает микросекунды
`new Date(ts).getTime()` **отбрасывает** разряды мельче миллисекунды, поэтому две записи
одной транзакции (Δ ≈ 100–600 мкс) для JS — ничья, и стабильный `Array#sort` оставляет
их в порядке источников. `order by ts desc` в SQL видит разницу и меняет их местами.
На S-TL-1 это разошлось в трёх парах `task`/`activity` из ста — и нашлось только потому,
что эталон снимался ДО правок. **Переносишь сортировку в БД — переноси и разрешение:**
`order by date_trunc('milliseconds', ts) desc, <ранг источника>, <позиция внутри источника>`,
где ранг повторяет порядок конкатенации массивов в прежнем JS. Тот же класс, что ключ
идемпотентности из `timestamptz`: разница представлений времени, а не логики.

### ❌ `x = any((select arr from cte))` — это ANY(**subquery**), а не ANY(array)
Вынес список литералов в CTE, чтобы не дублировать его по веткам, — и получил
`42883 operator does not exist: text = text[]`. Причина не в типах CTE: Postgres видит
подзапрос в аргументе `any()` и выбирает форму «сравни с каждой СТРОКОЙ результата», а
строка там одна и она типа `text[]`. Лечится кастом, который превращает подзапрос в
выражение: `= any((select arr from cte)::text[])` — либо формой `in (select u from cte,
lateral unnest(arr) u)`. Ошибка парсится до выполнения, поэтому ловится первым же
прогоном тела функции как обычного SELECT — но только если такой прогон вообще делается.

### ✅ Границу видимости в «глобальном» режиме RPC держит RLS, а не второй предикат
У функции ленты появился режим `p_entity_type='org'`, где предикат сущности снимается
целиком. Соблазн дописать `and org_id = current_org_id()` силён и неверен: это копия
предиката политики, которая разойдётся с ней при первом изменении RLS, и разойдётся
молча — лента покажет лишнее. Правильный ответ — `SECURITY INVOKER` и ничего сверх
него; проверяется ролевым смоком (`manager`-не-участник не видит чужих задач в
org-режиме). Тот же принцип, по которому в проекте не заводится вторая функция
`org_timeline()` с копией тела: копия — это будущее расхождение с оригиналом.

### ❌ Отсечка курсора СНАРУЖИ union держится на запасе кандидатов — фильтр её убивает
Keyset-пагинация по union нескольких источников: ветка отбирает свои топ-N по **грубой**
отсечке (`ts <= p_before`), точная — по паре `(ts, id)` — стоит снаружи. Пока веток
много, выброшенное снаружи покрывается запасом (6 × 50 кандидатов против 50 в выдаче),
и схема выглядит рабочей. **Первый же параметр, сужающий выборку до одной ветки
(`p_kinds`), запас снимает:** если курсор попал в середину блока строк с одинаковым `ts`,
снаружи отбрасывается всё отобранное, страница выходит короче лимита — и клиент,
у которого «неполная страница = дно», встаёт **на живом хвосте**, без ошибки и без
признака. На S-TL-3 это стоило бы 30 задач из 40 у одной сделки (вторая страница
приходила пустой). **Правило: точная отсечка живёт ВНУТРИ каждой ветки, рядом с грубой.**
Грубая остаётся ради index scan, внешняя — страховкой на случай новой ветки без
внутренней. Обе половины пары — на той же оси, что и `ts` ветки (у `meetings` — по
UTC-выражению, хотя `order by` идёт по сырой `date` ради индекса). Проверяется только
прогоном по страницам до пустой: одиночный вызов выглядит корректным.

### ❌ `const f = client.method` отрывает `this` — и React Query делает сбой немым
Обход отсутствующего типа через `const rpc = supabase.rpc as unknown as F` ломает
рантайм: методы supabase-js читают `this.rest`, оторванный вызов бросает TypeError
**до сети**. React Query ловит бросок из `queryFn` и по умолчанию молчит — экран
показывает пустое состояние, консоль чиста, логи БД чисты, запроса в сети нет.
Диагностика уходит в серверную часть, где всё исправно (на S-TL-1 функция в проде
отдавала честные 100 строк, RLS и порядок были проверены — а лента была пуста).
**Правило: кастуй объект (`createClient() as unknown as { rpc: F }`), никогда не
метод.** И: пустое состояние компонента обязано отличаться от состояния ошибки —
иначе класс дефектов «queryFn бросил» не имеет симптома вовсе. Тест на чистый
адаптер такое не ловит по построению: дефект в вызове, а не в разборе ответа —
мок клиента должен читать `this` так же, как настоящий
(`tests/unit/entity-timeline-rpc-this.test.tsx`).

### ✅ Ownership — через `owner_id`/`created_by`, НЕ `user_id`
companies/contacts/projects/tasks/calls/meetings/activities владеют через
`owner_id`/`created_by` (→ profiles). `user_id` (→ auth.users) остался только у
leads, activity_log, project_files, dashboard_sync. Не пиши `.user_id` для CRM-ядра.

### ❌ `useRealtimeSync` без таблицы в publication молчит — и молчит ТИХО
У realtime два конца, и клиентский ничего не знает о серверном. `useRealtimeSync('contacts', …)`
открывает канал, канал подключается успешно, ошибки нет ни в консоли, ни в сети — просто
событий не приходит никогда, потому что таблицы нет в `supabase_realtime`. Симптом
неотличим от «в системе ничего не происходит», поэтому дефект живёт годами: подписки
`contacts`/`companies` (S-R2) и `activity_log` (042) были мёртвыми до 122 (S-TAILS-1),
четыре хука. Заметным это стало только по контрасту — после 121 лид на канбане
обновлялся живьём, а контакт рядом нет.

**Правило:** заводя realtime новой сущности, сверять ОБА конца одним запросом —
```sql
select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1;
```
против грепа `useRealtimeSync\(` по `src/`. Расхождение в любую сторону — дефект:
подписка без таблицы молчит, таблица без подписки шлёт трафик в никуда (в проекте
таких четыре: `activities`, `dashboard_sync`, `message_reactions`, `project_members`).

⚠️ Включение таблицы шире, чем кажется по числу хуков: `activity_log` питает ленту
сущности, org-ленту дашборда и правый дровер сразу, а пишут её ещё и триггеры аудита
(087) — чаще, чем люди. Такую строку `alter publication` нужно смочить на частоту
перерисовки, а не только на «событие долетело».

### ✅ Новую RLS на project-scoped таблице — ЗЕРКАЛИТЬ с политики видимости проекта
`project_videos_select`/`project_messages_select` = точная копия `projects_select` + `projects_select_member` (owner/admin OR project ownership OR is_project_member; **без manager**). Не изобретать role-список: «кто видит проект — видит его видео/чат». Если добавить manager (которого нет в projects_select) — дочерняя запись виднее родителя (ловилось в F2 как «B1»; забыть ownership-ветку — владелец-не-member не видит свои данные).

### ⚠️ canManage — UI-гейт; RLS бэкапит АСИММЕТРИЧНО
- tasks_update/delete: RLS строже-или-равно UI (owner/admin OR assigned/created) — manager-не-owner deny.
- **tasks_insert: RLS ШИРЕ UI** — пускает любого org-manager (org owner/admin/manager). canManage для создания задач — только UI-гейт (импорт плана E: org-manager может лить задачи в любой проект org). project_columns/project_videos — RLS согласован с canManage (owner/admin OR ownership). **Чат project_messages INSERT — намеренно ВСЯ команда** (participant), не canManage.

### ✅ Право на одну строку ≠ право на набор
`canDeleteTask` — зеркало RLS; массовое удаление ВСЕГДА уже RLS (только мои, не строки
плана): owner'у политика разрешает снести чужую закрытую работу одной кнопкой — именно
поэтому кнопка так не делает. `assigned_to` даёт UPDATE, но НЕ DELETE. Журнал: «S-TASKS-FIX-2».

---

## Процесс DB-спринтов (контракт фазы 1 — работает, сохранять)

### ✅ Миграции ≠ источник истины — разведка живой БД обязательна
Перед каждым спринтом с DB-изменениями: интроспекция через Supabase MCP
(read-only) — `information_schema`, `pg_policies`, `pg_get_functiondef`,
`pg_enum`, `pg_publication_tables`, `supabase_migrations.schema_migrations`.
Папка `supabase/migrations/` теряла объекты (dashboard_sync, ENUM, hardening).

### ✅ Разделение ответственности: CC пишет, Cowork применяет
Claude Code пишет миграции + код, коммитит, **НЕ применяет**. Гейт Cowork:
ревью → `apply_migration` (атомарно, без BEGIN/COMMIT, пишется в history) →
smoke → `get_advisors`.

### ✅ Smoke через симуляцию ролей
```sql
SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid>')::text, true);
SET LOCAL ROLE authenticated;
```
Чужак = случайный uuid; tamper = явный чужой `org_id` в запросе. Проверяй
владельца / чужака / tamper. После — вернуть роль, прогнать advisors.

### ✅ schema.md обновляется тем же заходом, что применяется миграция
И репозиторный `docs/schema.md`, и этот скилл. Не откладывать — иначе дрейф
(как перед этой синхронизацией: skill описывал 013, реальность — 026).

### ❌ Счётчика миграций в памяти НЕТ — и заводить его снова не надо
Здесь стоял «последняя 068, следующая 069 (2026-07-21)». К 2026-08-05 реальность ушла на
104, а счётчик так и звал писать `069_*`. Любое число в памяти устаревает быстрее, чем его
успевают править, и превращается в ловушку.

**Номер следующей миграции берётся запросом к `supabase_migrations.schema_migrations`** —
не из памяти, не из `ls supabase/migrations/`. В папке номера теряются (047 и 088a
применены без файла: 65 файлов при последнем номере 104), а версии **069–073** записаны в
ledger **без числового префикса** — греп по номеру их не находит, сверять надо целиком.
На этом дважды делался ложный вывод «миграция не применена» про применённую.
**060 зарезервирована и не занята** — идти вперёд.

### ✅ Однострочники процесса (детали — по ссылке)
- Гейт Cowork без сети: цепочка apply → gen-types → снять стаб разорвана между исполнителями — стык в отчёт гейта явным пунктом. Журнал: «S-LEAD-CARRY-1».
- git из Cowork-сессии не звать даже на чтение: мост не умеет unlink ⇒ вечный `.git/index.lock`. Журнал: «S-LEAD-CARRY-1».
- Гвард удаления по КОЛИЧЕСТВУ строк не защищает состав набора — гвардить списком id, окно разведка→apply короткое. Журнал: «S-FIX-BATCH-1».
- Числовой порог в сиде — сначала прогнать по живой БД; ноль строк — решение, а не сюрприз. Журнал: «S-R3-TRUST-1».
- Вычисление в SQL заводится под серверного ЧИТАТЕЛЯ; без него вторая формула — дрейф. Журнал: «S-R3-TRUST-1».
- Отрицательные утверждения отчёта («X отсутствует») проверять грепом: следа в диффе нет. Журнал: «S-TG-VOICE-1».
- Контракт, не проверяемый по схеме, расходится молча: «soft delete по умолчанию» декларирован, а `deleted_at` НЕТ ни у одной таблицы — проект на hard delete. Решения нет до сих пор. Журнал: «S-FIX-BATCH-1».
- Фильтр поверх мусора маскирует источник: сначала «откуда данные», потом «как спрятать». Журнал: «S-FIX-BATCH-1».

### ✅ Migration-спринт: мёрж в main ТОЛЬКО после apply; ветки эпиков — от main
Прод-код обратится к несуществующей таблице, если смёржить до apply миграции. Ветки эпиков заводить от main (независимые PR — F2/F1 так). Типы до apply — ручной stub в supabase.gen.ts (паттерн quotes) + alias в entities.ts; regen после apply снимает stub (сдифить — не потерять RelaxOrgId hand-edits).

---

## Auth & Session

### ❌ Never override Supabase auth defaults
No `storageKey`, no `flowType`, no custom `storage` adapter.
The defaults work. Overrides cause redirect loops.

### ✅ Use `createBrowserClient()` for client components
### ✅ Use `createServerClient()` for server components / API routes
Never mix them. The browser client uses cookies; the server client reads headers.

---

## Типы и реген

### ⚠️ Типы сущностей derived — аддитивная колонка = только regen
`entities.ts` выводится из `supabase.gen.ts` (генерируемый). Аддитивная колонка →
**только регенерация типов**, руками `entities`/`database` не трогать (искл. hand-authored
union). Грабли:
- Реген может затипить jsonb-поле как `Json` вместо доменного типа → tsc-ошибки; фикс
  точечным `as unknown as <T>` / `as never` (не глобально).
- `.refine()` на Zod-схеме → `ZodEffects`, теряет `.shape`/`.extend` (используй superRefine
  или refine на самом внешнем уровне).
- `''::date` невалиден в Postgres → на date-инпутах `setValueAs: v => v === '' ? null : v`.

### ✅ Однострочники (детали — по ссылке)
- **Снятый каст доказывается ошибкой компилятора:** после регена типов добавь в `.select()` несуществующую колонку — обязан появиться `SelectQueryError<"column … does not exist">`. Тишина означает, что выражение схлопнулось в `any` и проверка исчезла молча. Журнал: «S-QUEUE-1».
- Стаб таблицы до apply — `type` интерсекшеном в `database.ts`, НЕ `interface` (postgrest-js требует индексную сигнатуру); снимать полностью. Журнал: «Сквозные грабли».
- Стаб не покрывает РУКОПИСНЫЕ интерфейсы: `Company` живёт в `use-companies.ts`, не в `entities.ts` — новое поле добавляется в ДВА места, из рукописного после регена НЕ уходит. Журнал: «S-LEAD-CARRY-1».
- Payload формы держит Zod-схема, не интерфейс: `.insert(x as never)` снимает проверку, новое поле схемы уезжает в запрос ВСЕГДА (в т.ч. `null`) ⇒ ветка с колонкой до apply ломает каждое сохранение (PGRST204). Журнал: «S-LEAD-CARRY-1».

---

## Домен: факты, дающие ноль строк без ошибки

- **Сделка = `projects.type='client'`**, НЕ `'deal'`; `delivery` — внедрение, `internal` — внутренний. Запрос с `type='deal'` молча пуст. Журнал: «S-R3-TRUST-1».
- **Живая колонка причины проигрыша — `loss_reason`**; `lost_reason` — пустое legacy. Две похожие колонки — проверять по ДАННЫМ. Журнал: «S-R3-TRUST-1».
- **Деньги — КОПЕЙКИ везде** (`budget`, `quotes.amount`, `estimated_value`); деление на 100 существует ровно в одном месте — отображении. Единицу определяет ПОЛУЧАТЕЛЬ поля. Журнал: «S-TASKS-BOARD-1/2».
- **Peek живёт на** `/companies` `/contacts` `/deals` `/leads` `/tasks` — НЕ на `/projects`. Журнал: «Сквозные грабли».
- В проекте ДВА типа `Company` — карточка читает рукописный из `use-companies.ts`. Журнал: «S-LEAD-CARRY-1».
- **Формула, читающая несуществующую колонку, не падает — она молча занижает результат.** `calculateDealHealth` читал `last_contact_date` (колонки нет ни в БД, ни в `PROJECT_COLUMNS`): фактор всегда 0, потолок 6 из 8 при пороге «зелёная» 6. Входы формулы сверять со СХЕМОЙ, а не с TS-интерфейсом — там поле было `optional`. Журнал: «S-HEALTH-V2-1».
- **Данные пишутся ≠ данные показаны.** `stage_transitions` заполнялась триггером месяц и не читалась в UI ни разу; аудит полей 087, наоборот, уже рендерился `describeEvent`. Перед фичей проверять обе стороны — иначе заводится второе место для одного факта. Журнал: «S-STAGE-STORY-1».
- **Личное состояние интерфейса (snooze, скрытие, персональный порядок) — отдельная таблица с `created_by = auth.uid()`, НЕ колонка сущности:** колонка общая на org, плюс UPDATE `projects` будит `trg_zz_run_automations`. Журнал: «S-QUEUE-1».
- **Триггер `AFTER UPDATE OF col` не видит INSERT:** вход в первую стадию в журнал переходов не попадает (`from_stage_id is null` — 0 строк), начало первого отрезка берётся из `created_at`. Журнал: «S-STAGE-STORY-1».

### ⚠️ Gantt-фаза = `column_id` → колонка `category='phase'`, НЕ `phase_group`
Swimlane Gantt/фазовой доски **data-driven** от колонок проекта (`isPhaseBoard`), а НЕ от
`phase_group` пайплайна продаж. `use-project-schedule.ts` селектит board+columns.

### ⚠️ Delivery-задачи: `lane = 'next'` («Не начата»), НЕ `'now'` («В работе»)
Фазовая доска/шаблоны создают задачи с `lane:'next'` (ProjectBoard phaseMode, ProjectDetail defaultLane, copy_delivery_template 036); `'now'` = «В работе»; progress (037) считает по lane. Массовое создание (импорт плана) обязано ставить `'next'` — иначе весь план мгновенно «В работе». **Источник истины — delivery-путь (ProjectBoard/template), НЕ общий TaskModal/CallLog.** Урок: при сборке промпта сверять delivery-специфичные дефолты по delivery-пути, не по первому грепу (ловилось в D и E как «B1»).

---

## Даты и время

### ⚠️ Календарные вычисления из `timestamptz` на клиенте — фиксируй TZ
- `mskDateKey` — ключ дня из timestamptz через `Intl` (`en-CA`, `Europe/Moscow`), НЕ
  browser-local/UTC (иначе deadline у пограничных часов уезжает на сутки).
- Бакеты/инкремент дня Gantt — на **UTC-полдне** (`T12:00:00Z`), иначе off-by-one на
  переходах суток/DST.
- ❌ **`date`-колонку нельзя вычитать из локальной полуночи.** `new Date('2026-08-09')`
  — это UTC-полночь, а `new Date(now.toDateString())` — ЛОКАЛЬНАЯ: в MSK разница
  теряет три часа, и `Math.floor(diff / 86400000)` съедает целые сутки. Так
  `getNextActionOverdueDays` показывала «просрочен 0 дн.» на вчерашнем шаге сделки —
  дефект прожил в проде до S-TAILS-1 и нашёлся не глазами, а тестом соседней сущности.
  Разницу календарных дат считать **только ключами дня**: `diffDaysKey(dateKey, localDateKey(now))`.
  ⚠️ Смещение ломает ДЕЛЕНИЕ, но не СРАВНЕНИЕ: `new Date(date) < today` устойчиво
  (граница сдвинута одинаково у обеих дат) — поэтому `getDealHealth` намеренно оставлена
  как была. Не «доводить до единообразия» заодно: это меняет условие попадания в очередь дня.
- ✅ **«Сейчас» — всегда параметр с дефолтом** (`now: Date = new Date()`). Без него
  функция недетерминирована и не тестируется. И передавать его надо ДО САМОГО НИЗА:
  `leadStaleness` параметр принимала, а внутри читала `Date.now()` — тест этого не ловил.

### ✅ Часы читает тот, кто совершает ДЕЙСТВИЕ, а не тот, кто рендерит
`now` из `useMemo(() => new Date(), [data])` протухает (structural sharing не меняет ссылку):
дроп «Сегодня» со вчерашним `now` персистит вчерашний дедлайн. В обработчике — `const at =
new Date()`, домен получает его аргументом. Журнал: «S-TASKS-BOARD-1/2».

### ✅ Обратная функция оси живёт рядом с прямой; критерий — round-trip
«Брошенное в колонку X остаётся в X» — прогонять по всем бакетам × опорным дням (обязательно
сб/вс). Разнесённые функции разъедутся тихо. Журнал: «S-TASKS-BOARD-1/2».

---

## CSS & Themes

### ℹ️ `.t-* aside` сужены до `[data-app-nav]` / `[data-drawer]`
Запрет на `<aside>` вне навигации снят S-FIX-CO360-1. Единственное непривязанное
правило — `.t-aura aside:not([data-app-nav]) .bracket` — требует дочернего `.bracket`.
Рельсы контекста (`DealContextRail`, `CompanySidebar`) на `<aside>` безопасны.

### ❌ Комментарий-запрет живёт дольше своей причины
«⚠️ НЕ `<aside>`» пережил снятие основания на месяцы и чуть не заставил завести вторую
семантику для той же рельсы. **Правило**: снял причину — тем же PR перепиши или удали
комментарий, который на неё ссылался. Запрет без живой причины дороже отсутствия
комментария (журнал 2026-08-24).

### ℹ️ Тем 7, дефолт `t-aura` (AUDIT C + M1)
`scandi`/`paper`/`sand` **удалены**. Живые темы (`THEMES` в `lib/stores/theme-store.ts`):
`t-aura` (дефолт, light, орбы), `t-washi`, `t-fuji`, `t-minimal` (light, нейтральный, Inter),
`t-frost`/`t-aurora`/`t-tidal` (dark glass).
Persisted/неизвестное legacy-значение → миграция на `t-aura`. Подробности — `theme-system.md`.

### ❌ Never use Tailwind color classes for dynamic colors
`bg-gray-100`, `text-blue-500` etc. bypass the theme system.
Always use `var(--token)` (реальные имена: `--bg`/`--surface`/`--text`/`--accent`/…, НЕ `--color-*`).

### ❌ Never hardcode hex colors in components
Breaks on theme switch. Use CSS variables.

### ❌ Never use rgba for chevron pipeline colors
Semi-transparent fills bleed through on dark themes.
Use solid opaque hex per theme.

### ❌ Never apply font changes globally — только через `--font-app`
`:root` задаёт `--font-app: var(--font-manrope)`, `html` применяет; темы **переопределяют
переменную** (`t-aura` → Onest, `t-fuji` → IBM Plex). Прямой `font-family` на тема-селекторе
перебивает `html` и ломает каскад — запрещён.

### ℹ️ Store value = CSS class (с префиксом `t-`)
Значение стора совпадает с классом на `<html>`: `theme === 't-aura'` (НЕ короткое `'aura'`).
Старая ловушка «store `'scandi'` ≠ class `'t-scandi'`» больше не актуальна — темы хранятся
полным именем класса.

### ⚠️ Тултип/поповер внутри `overflow-x-auto` клиппится
`overflow-x: auto` ⇒ `overflow-y` перестаёт быть `visible` → всплывашка обрезается.
Fix: `position: fixed` (или портал). Поймано на Gantt-тултипе (Волна 2).

### ⚠️ Overflow клиппит не только тултип — hover-Trash на full-width баре
Gantt full-width bar → hover-кнопка удаления уезжает за `overflow`-контейнер (тот же класс, что тултип в overflow-x-auto). Fallback: удаление такой задачи с доски «План». Known-issue (не блокер).

### ✅ Однострочники тем (детали — по ссылке)
- Тема-селектор целится через data-атрибут (`aside[data-app-nav]`), НЕ в голый тег: `.t-* aside` красил чужие компоненты. Журнал: «Уроки 2026-08-04/05».
- CSS-переменная, объявленная в ОДНОЙ теме, читается всеми семью: недостающая не падает — `color` наследует, `border` исчезает целиком. Компонентный токен объявляется там, где видят все темы. Журнал: «S-UI-SEMANTIC-1».
- Инлайновый стиль отменяет ЛЮБОЕ правило темы: перед объявлением `:hover` в CSS проверить, не ставит ли компонент это свойство инлайном — сначала убрать инлайн. Журнал: «S-CAL-MONTH-2».
- Сетка с текстом в ячейках — `repeat(N, minmax(0, 1fr))`, не `1fr` (`auto` = min-content ломает равные колонки); у отдельной шапки — та же трек-функция И тот же `gap`. Журнал: «S-CAL-MONTH-1».
- Токен границы подобран под ОДИН фон: на `--surface2`/тинте контраст мерять заново; `--border2` НЕ «темнее» (в washi светлее `--border`); рамка интерактива — `--border-input`. Журнал: «S-CAL-MONTH-2».
- Палитровое ≠ семантическое: `--danger` про сбой, `--red` про красное; массовая замена 614 мест была бы новой неточностью. Журнал: «S-UI-SEMANTIC-1».
- Новый акцент темы: Δhue ≥ 30° до всех семантических цветов + `scripts/audit-contrast.py`, не на глаз. Журнал: «Уроки 2026-08-04/05».

### ✅ Контракт токенов проверяется машиной — `scripts/audit-tokens.py`
Семь правил (хардкод hex, Tailwind-палитра, альфа на `-l`, `hover:elevation`, ручной лист,
позиционный `nth-child` в тема-фиксе, `font-family` на корне темы) + реестр законных
исключений с обоснованием каждого; отдельный шаг `Token contract` в CI. Карта токенов и
границы правил — `theme-system.md` → «Контракт токенов». Журнал: «S-TOKENS-CONTRACT-1».

### ⚠️ `nth-child` в тема-фиксе — только внутри именованного якоря
`.t-fuji .flex.gap-1.border-b > button:nth-child(5)` прятал таб «Удаления» в одной полосе,
а ловил ЛЮБУЮ полосу вкладок с теми же утилитарными классами: пятая вкладка карточки сделки
исчезала в Fuji молча (в DOM есть, на экране нет; tsc/линт/тесты слепы). Позиционный селектор
привязывать к `data`-атрибуту компонента. Журнал: «S-STAGE-STORY-1».

### ℹ️ Декор-скобки `「 」` убраны глобально (Sprint UI-D1)
Реликт удалённой scandi. Класс `.bracket` и bracket-псевдоэлементы больше не используются.

### ℹ️ Токен-волна: геометрия · тени · type (2026-07-21, S-TOKENS-GEOM + S-TYPO-TOKENS)
Полностью — `theme-system.md` §«Геометрия, тени, type-токены». Грабли:
- `tailwind.config borderRadius`: `rounded-md` **удалён** (был дублем `rounded`); `rounded-xl = calc(var(--radius-l) + 2px)` фиксит инверсию `xl<lg`. `extend` deep-мержится с дефолтом TW — порядок мержа важен. Острая тема — washi (`--radius: 4px`, `--radius-l: 8px`); у minimal средние 10/14.
- Канон теней: floating-слои → `--elevation-3`, чарт-тултипы → `--elevation-2`, **карточки → `--shadow-card` (НЕ elevation)**. **`hover:elevation-N` НЕ работает** (утилита `.elevation-*` не реагирует на `hover:`) → `hover:shadow-[var(--elevation-N)]`.
- fontSize-токены `text-meta` (0.6875rem/11px) · `text-body` (0.8125rem/13px), rem-scalable, **без lineHeight** (0 сдвига). Примитивы (Card/Table/Button/Input) → `text-body`.
- **Грабля синхронности:** переименование `text-[11px]`→`text-meta` ОБЯЗАНО синхронно править `.t-washi/.t-fuji aside .text-meta` в `globals.css` — тема-контраст-фиксы нав-подписей таргетят сам класс, иначе контраст молча откатывается к WCAG-fail.
- НЕ трогать (blast): `text-xs` (12px, 690×), `text-sm` (14px, 302×), `text-[10px]` (badge), карточные тени, прямые `font-size` в globals.

### ℹ️ Дедлайн-кап `>90д` живёт в ТРЁХ местах (F-16, S-UI-POLISH-1)
Форматтеры дней дедлайна независимы: `deadlineUrgency` (DashboardHome), `getUrgency` (DeadlineRadar), IIFE в `ProjectCard.tsx`. Кап дальних сроков (`if (d > 90) return '>90д'`) добавлять во **все три** — иначе рассинхрон (`/overview` показывал `>90д`, карточка `/deals` — `389д`). При правках форматирования дат искать все три пути, не первый греп.

---

## Z-Index

### ❌ Never set overlay z-index below sticky headers
If header is z-50 and overlay is z-49, header punches through the modal blur.
**Fix**: overlay z-999, modal z-1000. Headers at z-35-40.

### ❌ Never forget dropdown z-index
Theme picker and select dropdowns need z-50 minimum to appear above
ActivityDrawer widgets (z-30).

### ✅ Z-index hierarchy
```
Content: auto  |  Sidebar: 20  |  Drawer: 30  |  Headers: 35-40
Dropdowns: 50  |  Overlay: 999  |  Modal: 1000
```

---

## React / Next.js

### ❌ Проп «открыться сразу» через начальное значение `useState`
`useState(startEditing)` читает проп ОДИН раз, при монтировании. Повторное открытие
работает, только пока родитель размонтирует компонент между показами; оставишь
смонтированным — проп замрёт молча, без ошибки и без предупреждения тайпчекера.
**Fix**: либо гарантировать размонтирование и написать это в JSDoc пропа, либо
синхронизировать `useEffect`-ом. `InlineEdit.startEditing` — первый вариант
(журнал 2026-08-24).

### ❌ Never use `ignoreBuildErrors: true` in next.config
Masks TypeScript errors that break in production. Fix the errors instead.
(Was temporarily enabled, then disabled in sprint fix.)

### ❌ Stale closures in useEffect event handlers
Event handlers registered in `useEffect` capture state at registration time.
**Fix**: use `useRef` to hold current state, read `ref.current` in handler.

### ✅ Optimistic updates on all mutations
Every create/update/delete mutation should:
1. `cancelQueries` for the entity
2. Save previous data
3. Optimistically update cache
4. Rollback on error
5. Invalidate on settled

### ✅ React Query key convention
```
['tasks']           — all tasks
['projects']        — all projects
['project', id]     — single project
['activity-log', projectId]  — activity for project
```

### ❌ Вторая витрина тех же строк без инвалидации — молчаливо устаревшая цифра
Раздел «Транскрипты» показывает производную от `transcripts` + счётчик прогонов из `ai_runs`.
Запись расшифровки и запуск прогона сбрасывали только «свои» ключи (`transcript`,
`transcripts-presence`), про ключ витрины (`transcripts-list`) не знал никто — бейдж «✦ N»
оставался на старом числе, а новая расшифровка не появлялась в разделе до истечения
`staleTime`. Ошибки нет, тесты зелёные, дефект виден только глазами в браузере.
**Fix**: сбрасывать ВСЕ витрины сущности из ОДНОЙ общей функции инвалидации
(`invalidateTranscriptKeys` в `use-ai-run.ts`), а не из каждого вызывающего. Новый
вызывающий тогда не может забыть половину. Поймано смоком S-TR-CREATE-1.

### ✅ Realtime sync
`useRealtimeSync('tableName')` in page components.
Accepts optional second parameter (unused, for signature compatibility).

### ❌ Эффект с DOM-измерением + setState → рантайм-луп (tsc/build НЕ ловят)
`useLayoutEffect`, который меряет DOM (`getBoundingClientRect`) и делает `setState`(новый
объект) каждый прогон, + нестабильные deps (напр. `filteredSwimlanes` — новый ref каждый
рендер) → «Maximum update depth exceeded». tsc/build зелёные — ловится ТОЛЬКО рантайм-смоком.
**Fix**: (1) дедуп setState — функц. апдейт, возвращающий `prev` при идентичном результате
(React бейлит, re-render не идёт); (2) стабильная сигнатура в deps (строка `depSig` вместо
объекта). Поймано Chrome-смоком S-DEPS-1 (0463596 → фикс 4a5eeab). **УРОК: Gantt/DOM-measure
фичи — обязателен рантайм-смок, не только tsc/build.**

### ⚠️ Серия HMR-правок бьёт `.next` dev-cache
После нескольких быстрых правок dev-сервер может словить «Cannot find module
'./vendor-chunks/*.js'» / «`__webpack_modules__`[id] is not a function». Это не баг кода —
рассинхрон `.next`. **Fix**: `rm -rf .next && npm run dev`. При странных webpack/module-ошибках
на dev — первым делом чистый ребилд, не диагностика кода.

### ℹ️ `window.confirm` — конвенция проекта (25+ сайтов), не дефект
Удаление везде через `window.confirm`/`confirm()` (нет кастомного `ConfirmDialog`:
calls/tasks/leads/projects/contacts/meetings/companies). Замена на кастомный confirm —
отдельный app-wide эпик (`useConfirm` + миграция всех сайтов), не точечно (иначе одно место
непоследовательно). При добавлении delete-действия — следовать конвенции `window.confirm`.

### ℹ️ Триггер-функции: `authenticated=X` авто-грантится Supabase default privileges
`revoke public/anon` НЕ снимает `authenticated` — Supabase раздаёт EXECUTE через ALTER DEFAULT
PRIVILEGES. Поэтому 0029-advisor (function search_path / definer surface) шумит на всех
definer-функциях, даже trigger-returning: их **нельзя вызвать напрямую** (Postgres запрещает
`SELECT trigger_fn()`) → не эксплойт, шум. Чтобы убрать из 0029 — **явно** `revoke execute
FROM authenticated` (как в `run_stage_automations` 050). `check_task_dependency_valid` 048 —
оставлен с `authenticated=X` осознанно (как `notify_deal_won`): trigger-returning, не вызываем.

### ✅ Ролевой смок триггер-движка: транзакция + `ROLLBACK`
Для триггеров/DEFINER-функций (S-WF-2A) проверка ролями без порчи данных: одна txn →
`set_config('request.jwt.claims', '{"sub":...,"role":"authenticated"}', true)` +
`SET LOCAL ROLE authenticated` → INSERT правила + UPDATE `projects` (провоцирует триггер) +
верификация side-effects (task/notification/activity/automation_runs) → **`ROLLBACK`**.
Прогоняет backward-compat, идемпотентность, re-entrancy, swallow — на живой БД, откатывая всё.

### ✅ Ролевой смок из Cowork (MCP `execute_sql`): `DO` + финальный `RAISE EXCEPTION`
У MCP-канала нет управления транзакцией между вызовами — `begin; … rollback;` в одном
запросе полагаться нельзя. Приём (S-TR-CREATE-1, гейт): весь сценарий в одном `DO $$ … $$`
(`set_config('request.jwt.claims', …, true)` + `SET LOCAL ROLE authenticated` → INSERT'ы →
`SELECT count(*)` видимости) и **последней строкой `RAISE EXCEPTION 'РЕЗУЛЬТАТ … %', …`**.
Даёт сразу два: гарантированный откат (исключение откатывает блок целиком) и **результат в
тексте ошибки** — единственный способ вернуть значения наружу, `RAISE NOTICE` через MCP не
виден. Обязательно после — контрольный `SELECT` по возвращённым id: откат подтверждается
фактом, а не механикой.

### ℹ️ Radix НЕ в стеке
Модалки — кастомный `shared/Modal.tsx`; `components/ui/` — кастомные примитивы (не Radix
Dialog/Dropdown). Дропдауны — свой `Combobox`/`AssigneeSelect` + портал. UI-либы:
`@dnd-kit`, `lucide-react` (Next 15 / React 19).

### ⚠️ Pointer-хендлеры высокой частоты — истина в `useRef`, не в state-замыкании
Быстрый свайп: pointer-события приходят пачкой ДО ре-рендера → guard по state-замыканию теряет `pointermove`, короткий свайп открывает edit вместо дропа (S-GANTT-UX-2, drag из «Без дат»). Fix: источник правды drag → `useRef`, `state` только для рендера призрака. Класс = stale-closure в useEffect-хендлерах. **Ловится ТОЛЬКО рантайм-смоком** (tsc/build не видят).

### ✅ Однострочники React (детали — по ссылке)
- Новый React-Query ключ = новая запись во ВСЕХ мутациях, меняющих его данные; id для инвалидации — из строки ОТВЕТА, не из payload. Журнал: «Уроки 2026-08-04/05».
- Портал в SSR — флаг `mounted` (useState+useEffect), НЕ `typeof document`: ветка даёт разный markup по построению и роняет гидрацию. Журнал: «S-CAL-MONTH-1».
- `valueAsNumber` на select с пустой опцией → NaN → Zod молча валит сабмит; только `setValueAs: v => v === '' ? null : Number(v)`. Журнал: «S-TG-2».
- `useDroppable({disabled})` НЕ отменяет дроп — перенаправляет в соседнюю колонку (тихая запись не того дня); отказ решает обработчик. Журнал: «S-TASKS-BOARD-1/2».
- Шаблонная строка печатает `null` текстом: имена — только `[a,b].filter(Boolean).join(' ')`. Журнал: «Уроки 2026-08-04/05».
- Что показывать элементу, решает КОНТЕЙНЕР (бакет/колонка), а не сам элемент — иначе «просрочено» на выполненном. Журнал: «S-TASKS-BOARD-1/2».

---

## LLM-структурированный вывод

### ✅ Поле схемы без ПРИМЕРА модель заполняет заметно хуже
`assignee_hint` с примерами работал, `project_hint` без них пустовал — при исправном
резолвере. Каждое извлекаемое поле — пример «вход → выход»; запрет задаёт границу, но
не форму. Журнал: «S-TG-TASK-1».

### ✅ Не заставляй модель выбирать между полями, когда ответ знает только БД
«Завод Атлант» — и сделка, и компания: развилка неразрешима моделью и провоцирует пустоту.
Инструкция — одна цитата в ОБА поля, разрешают независимые резолверы. Дублирование с `text`
разрешать явно: `text` читает человек, `hint` — поиск. Журнал: «S-TG-TASK-1».

---

## Интеграции с внешним состоянием

### ❌ Секрет, вводимый руками в двух местах, разойдётся
Генерировать в переменную и подставлять скриптом в оба места; после `secrets set` ждать
~30 с. Журнал: «S-TG-1».

### ❌ У интеграции есть состояние НА ЧУЖОЙ СТОРОНЕ — его читают обратно после каждой записи
`allowed_updates` у Telegram молча ел callback_query без единого симптома; повторный
`setWebhook` без параметра СОХРАНЯЕТ прежний список. Правило для 1С:ДО/почты/n8n: чужое
состояние (1) перечислено в runbook, (2) читается назад после записи. Журнал: «S-TG-1».

### ⚠️ Внешний API может валидировать по ИМЕНИ файла, а не по содержимому
Groq не знает `.oga` (те же байты как `.ogg` — 200). Нормализация расширения — в адаптере
провайдера. Отказ по формату и отказ по распознаванию — РАЗНЫЕ тексты, иначе диагностика
уходит в модель. Журнал: «S-TG-VOICE-1».

### ✅ Курс валюты и любой внешний коэффициент — снапшот С ДАТОЙ
`USD_RUB = 100` тихо завышал прогноз И факт четверть месяца: значение без даты сверки не
устаревает, а врёт. В комментарии — дата, источник, что ломается при протухании. Журнал: «S-COST-TRUTH-1».

### ❌ Текст ошибки не предлагает действие, которое не может помочь
Сбой на нашей стороне («сообщите администратору») и «не поняли ввод» («попробуйте иначе») —
разные сообщения; склейка — дезинформация. Кнопка, которая не может сработать (дубль по
ИНН при «Всё равно создать»), — дефект интерфейса: уникальный индекс — утверждение и об UI.
Журнал: «S-TG-3-INN-DUP».

---

## Тесты и смоки

### ❌ Посылка «данных для смока нет» не проверяется глазами в UI
Открытая карточка — не выборка. Прежде чем заводить тестовую запись, выполнить запрос:
`select count(*) ... group by <тип>`. Смок S-DEAL-CTX-1 залил файл в живую сделку клиента
на посылке «файлов нет ни у одной сделки», тогда как все девять существующих файлов лежали
именно у сделок. Красная линия «не гонять смоки на живых записях клиентов» нарушается
обычно не умыслом, а непроверенной посылкой (журнал 2026-08-24).

### ✅ Инвариант проверяется в единицах, в которых его ВИДИТ пользователь
«Нет пересечений» держался в минутах оси — виден в пикселях: шесть зелёных тестов при
наложении 158px. Величина в двух системах координат (rem↔минуты) не бывает константой.
Дёшево: headless-браузер + `getBoundingClientRect`. Журнал: «S-CAL-LANES-1».

### ❌ Тест, зовущий вторую половину механизма, не проверяет первую
«Сузить выборку» + «выбрать точно»: тест на точный матч с литеральными кандидатами молчит
о том, что грубый отбор не отдаёт НИЧЕГО. Проверять пару на реальном входе (падеж, предлог).
Журнал: «S-TG-TASK-1».

### ✅ Сторож проверяется подсадной ошибкой И контролем на ложное срабатывание
Подсадить нарушение по каждому правилу (ловится, файл и строка верные) — доказана
чувствительность. Подсадить похожую, но ЗАКОННУЮ конструкцию (не ловится) — доказана
точность. Без второй половины сторож неотличим от того, который всегда молчит.
Журнал: «S-TOKENS-CONTRACT-1».

### ❌ Эвристика, при поломке возвращающая «ничего», не имеет симптома
Дедуп/резолвер/фильтр молчат одинаково и без дефекта, и с ним (`\b` с кириллицей жил
полтора года). Такое проверяется тестом на ПОЛОЖИТЕЛЬНЫЙ исход. Журнал: «S-TG-3».

### ✅ Однострочники смока (детали — по ссылке)
- Тест вне `tests/unit/**` молча не запускается — «зелёный прогон» ничего не значит, пока не видно, что файл в него вошёл. Журнал: «Уроки 2026-08-04/05».
- CSS-дефекты тем не ловятся ни tsc, ни lint, ни JSDOM — визуальный смок хотя бы раз в теме, отличной от той, где писался код. Журнал: «S-UI-SEMANTIC-1».
- Компоненты с TTL (InlineConfirm, 5 с) — одним скриптом в пределах TTL, не серией вызовов. Журнал: «S-TASKS-FIX-2».
- Скриншот показывает РЕНДЕР (плейсхолдер ≠ значение) — любая находка подтверждается `select`. Журнал: «S-TG-TASK-1».
- Усечённая выборка (`limit N` вернул N) обесценивает и единственное совпадение — `truncated` проверяется ДО подсчёта. Журнал: «S-TG-TASK-1».
- Смок гарда «чужой профиль» — профилем ВНЕ org, не состоящим в двух: второй проходит законно, смок ложно зеленеет. Журнал: «S-TG-TASK-1».
- Юнит-тест по спецификации не ловит дефект САМОЙ спецификации: «одно состояние — две причины» (`getDealHealth` → `no-action` и на пустом шаге, и на пустой дате) видно только на живых данных. Журнал: «S-HEALTH-V2-1».
- Порог сигнала сверяется с живой БД ДО выбора: «разумные» 14 дн. тишины давали ноль срабатываний, а сигнал без гейта по фазе — 8 из 10 (фон). Журнал: «S-HEALTH-V2-1».

---

## CSV Export

### ✅ Always add BOM prefix for Cyrillic
```typescript
const BOM = '\uFEFF';
const csvContent = BOM + csvString;
```
Without BOM, Excel shows кракозябры (mojibake) for Russian text.

---

## Sprint Prompt Writing

### ⚠️ Числовой порог плотности переносится вместе со своим контекстом
«Пустое состояние не больше занятого» — про вертикаль ПОЛОТНА, которую пустота крадёт у
работы. В модалке, drawer и peek порог не действует: они открываются по запросу и ни с чем
не конкурируют. Перенесённый буквально, он заставляет выкидывать описание или действие,
заданные тем же спринтом — то есть спринт начинает противоречить сам себе
(журнал 2026-08-24).

### ✅ Мокап собирается на ДЕФОЛТНОМ состоянии компонента
Не на том, что видно на присланном скриншоте. Свёрнутое по умолчанию (`useState(false)`)
на скриншоте может быть раскрыто рукой — и мокап начнёт согласовывать экран, которого
пользователь не видит. Стоило неверного упрёка чужому варианту и завышенной на ~120px
оценки вертикали (журнал 2026-08-24).

### ⚠️ Ветка от невлитой ветки — ребейз обязателен до ревью
Спринт, ветвящийся от предыдущего, даёт PR с чужими коммитами: `base=main`, а в диффе
оба спринта. Порядок: смержить базовый PR → `git checkout main && git pull` →
`git rebase main` → `git push --force-with-lease`. Гейт обязан проверять
`git log main..HEAD`, а не верить строке отчёта (журнал 2026-08-24).

### ✅ Always start with РАЗВЕДКА
Diagnostic bash/grep commands BEFORE any code changes.
Verify file exists, check current content, confirm column names.

### ✅ Use exact column/table names from database.ts
Never guess. Always verify against schema.md.

### ❌ Модалки лежат в фиче-папках, НЕ в `components/modals/`
`CallModal`→`calls/`, `MeetingModal`→`meetings/`, `TaskModal`→`tasks/`,
`ProjectModal`→`projects/`, `ContactModal`→`contacts/`, `CompanyModal`→`companies/`,
`LeadModal`/`LeadConversionModal`→`leads/`. `architecture.md` исторически врал (единый
`modals/`), грабли ловились дважды (промахи `git add`/`grep` по несуществующему пути).
Перед вставкой пути модалки в промпт или команду — `find src -name "*Modal.tsx"`, не
доверяй памяти/дереву.

### ✅ Новый раздел приложения = ШЕСТЬ точек правки
Страница · пункт меню · section-colors · ContentHeader · AuraOrbs+globals · ⌘K (дважды).
Пять из шести ломаются МОЛЧА (фолбэк на чужой цвет/пустую шапку). Таблицу из журнала
(«S-FIX-VOICE-1») вставлять в промпт нового раздела целиком.

### ✅ Include commit message
Every sprint prompt ends with a git commit command.

### ⚠️ Критерий приёмки против буквы спецификации — прав критерий
Спринт требовал `ageDays` «до последнего перехода» и самопроверку «сумма сегментов ≈ возраст»:
требования несовместимы — последний сегмент не закрывается никогда. Исполнитель обязан взять
проверяемую величину и записать обоснование, а не выполнить букву. Журнал: «S-STAGE-STORY-1».

### ⚠️ grep-самопроверка ловит собственные комментарии
`grep -rn "calculateDealHealth" src/ && echo "❌ остались ссылки"` дал красный на комментарии,
который объясняет удаление функции. Проверку удаления писать по коду либо считать её
подсказкой, а не критерием приёмки. Журнал: «S-HEALTH-V2-1».

### ✅ One concern per task block
Don't mix UI changes with DB migrations in the same task section.
DB changes first (migration), then types, then hooks, then components.

### ⚠️ Цифры долга из STATUS пересчитывать ПЕРЕД спринтом
Запись в реестре верна на момент записи. «309 классов вхолостую» из августа дали ноль в
тот же месяц — закрыли соседние волны, реестр не узнал. Разведка старого долга начинается
с пересчёта, иначе спринт ищет несуществующее. Журнал: «S-TOKENS-CONTRACT-1».

### ⚠️ Имя файла миграции ≠ версия в ledger
В папке конвенция `NNN_name.sql` (README миграций), версию ставит `apply_migration`
(129 → `20260823182046`). Требовать timestamp в ИМЕНИ файла — значит путать носитель
порядка с версией и готовить следующий ложный вывод «миграция не применена».
Журнал: «S-QUEUE-1».

### ✅ Migration → Types → Validator → Hook → Component
This is the dependency order. Always follow it.

---

## Common Patterns to Reuse

### ❌ Подъём приватного примитива в общий не меняет дефолт поведения
`Row` → `RailRow` получил `truncate` по умолчанию ради нового вызывающего — для прежнего
это был бы тихий регресс обрезки. **Правило**: новое поведение вводится опциональным
пропом, а все существующие call-site переводятся на явную опцию, сохраняющую прежний вид.
Проверка на гейте — счёт вызовов до и после плюс счёт вызовов с опцией (журнал 2026-08-24).

### Pre-filling modals from context
When opening a modal from a detail page (e.g., creating a call from
Company detail), pass pre-fill values:
```tsx
<CallModal
  defaultValues={{ company_id: company.id }}
  onSuccess={() => refetch()}
/>
```

### Clickable entity badges
Task cards show project name and company name as clickable badges
that route to the entity detail page:
```tsx
<Link href={`/projects/${task.project_id}`}>
  <Badge>{task.projects?.name}</Badge>
</Link>
```

### Настройка организации — повторять паттерн целиком
`organizations.settings` (jsonb) + Zod `.passthrough()` + запись merge'ом + резолвер
`настройка → дефолт → фолбэк` (при пустых — ТА ЖЕ ссылка на дефолт); порог — в ИМЕНИ
сегмента, не в подразумеваемой настройке. Образец — `stage_dwell_defaults`. Журнал: «S-R3-TRUST-1».

### Два источника одного факта — вес и подпись, не слияние
Declared (человек) побеждает derived (справочник), подпись источника на экране разная,
неизвестные значения не проглатываются. Образец — `chz_groups`. Журнал: «S-LEAD-CARRY-1».

### Два индикатора одной оси — калибровать по соседу
Прежде чем назначить состояние новому сигналу, посмотреть, как ТА ЖЕ величина уже показана
в существующем индикаторе. `DealHealthDot` рисует `no-action` жёлтой обводкой, просрочку —
красной заливкой; `bad` для «шага без даты» расходился с ним, и список с карточкой говорили
о сделке разное. Журнал: «S-HEALTH-V2-1».

### Empty state pattern
When a list/table has no items, show a centered illustration + message +
CTA button. Never show an empty table with just headers.

---

## Хроника спринтов

Уроки по конкретным спринтам вынесены в [`journal.md`](./journal.md) (S-MEM-1, 2026-08-21).
Здесь — только тематика, переиспользуемая между спринтами.
