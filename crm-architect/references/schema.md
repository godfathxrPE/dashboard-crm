# Schema — указатель, не копия

**Схемы БД в этом файле больше нет и не будет.** До 2026-08-05 здесь лежала копия
`docs/schema.md` — 3317 строк, 326 КБ, синхронизируемая руками. На момент замены она
отличалась от оригинала пятью строками, и ровно в том месте, где ошибка дороже всего:
**миграция 104 значилась «НАПИСАНА, НЕ ПРИМЕНЕНА», хотя гейт применил её 2026-08-03**
(`20260803194153`), плюс отсутствовал протокол ролевых смоков. Копия живого документа
расходится всегда — вопрос только в том, на чём поймают. Дешевле её не иметь.

## Источник истины

| Вопрос | Куда идти |
|---|---|
| Таблицы, колонки, RLS, триггеры, функции, индексы, ledger миграций | **`docs/schema.md` в репозитории** — его ведёт тот же гейт, что применяет миграции, и он проходит ревью вместе с кодом |
| «Что реально в проде прямо сейчас» | **живая БД через Supabase MCP, read-only**: `information_schema`, `pg_policies`, `pg_get_functiondef` (только с `p.prokind='f'` — на агрегатах падает с 42809), `pg_enum` |
| **Номер следующей миграции** | **запрос к `supabase_migrations.schema_migrations`** — и только он |

⚠️ **Номер следующей миграции нельзя брать ни отсюда, ни из `ls supabase/migrations/`.**
В папке номера теряются: 047 и 088a применены без файла, а всего файлов 65 при
последнем номере 104. В `schema_migrations` версии **069–073 записаны без числового
префикса** — греп по номеру их не находит, сверять надо ledger целиком. На этом дважды
делался ложный вывод «миграция не применена» про применённую. **060 зарезервирована и
не занята** — идти вперёд, не возвращаться к ней.

**Медленный запрос** → `explain (analyze, buffers)` через MCP `execute_sql`. ANALYZE
запрос исполняет: DML оборачивать в `begin … rollback` (в CC сервер `supabase_ro`
read-only — DML там упадёт и так, профилировать его на гейте). Главные нарушители —
`pg_stat_statements` (расширение установлено) + `get_advisors type=performance`.

## Что остаётся памятью скилла (этого нет в `docs/schema.md`)

**Порядок слоёв.** Migration → Types (`supabase.gen.ts` регенерацией, руками не
править) → Validator (`lib/validators/*.ts`, singular) → Hook (`lib/hooks/use-*.ts`,
plural) → Component. Пропуск слоя — источник расхождения `database.ts` ≠
`supabase.gen.ts`.

**Ownership — через `owner_id` / `created_by`, НЕ `user_id`.** `activity_log.user_id` —
исключение: это актор записи журнала, а не владелец сущности.

**RLS org-first.** `org_id = current_org_id()` первым конъюнктом, роль через
`current_org_role()`, обе — в initplan-обёртке `( select public.current_org_role() )`,
иначе планировщик зовёт их построчно. Аргумент-зависимый вызов
(`is_meeting_attendee(id)` в `meetings_select`) обёрткой не лечится — там
коррелированный подзапрос по определению; либо принять, либо редизайн видимости.

**Hardening новых функций.** Дефолт для новой функции — `SECURITY INVOKER`.
Hardening относится к функциям, которые ОБЯЗАНЫ быть `SECURITY DEFINER`:
`SET search_path = public, pg_temp` + адресный ACL: `revoke all from public, anon` →
`grant execute to authenticated | service_role`. Новые внутренние хелперы (не RPC,
клиент их не зовёт) — в схему `private` с `revoke execute … from public, anon`; схемы
`private` в живой БД пока нет (сверено 2026-10-11) — её заводит первая такая миграция.
Исключения осознанные: `check_stage_requirements` обязана быть
исполняемой у `authenticated` (её зовёт модалка перехода стадии, guard внутри
функции) — «доведение до конвенции» сломает переход из UI. По той же причине 20 WARN
`authenticated_security_definer_function_executable` в advisors — это RPC проекта,
массово снимать `EXECUTE` нельзя.

**Новая org-таблица.** `org_id not null references organizations(id) on delete
cascade`; `created_by uuid default auth.uid() references public.profiles(id) on delete
set null` (именно `profiles`, не `auth.users`); `created_at`/`updated_at`, второй —
триггером на `public.update_updated_at()` (имя именно такое, не `set_updated_at`);
`enable row level security`; `revoke all … from anon` + явные гранты `authenticated`.
Заморозка `org_id` — **вручную**, триггером `trg_aa_freeze_org_id` (порядок триггеров
алфавитный): автоцикл 054 покрыл только таблицы, существовавшие на момент 054.
`revoke truncate, references, trigger` писать не нужно — 082 сузил дефолтные
привилегии в корне.

**`pipelines` / `pipeline_stages` — глобальные словари, не org-scoped.**
Org-специфичные атрибуты стадии заводятся отдельной таблицей `(org_id, stage_id, …)`.

**Таблицы в `public` создаются только миграциями.** Созданная через UI дашборда
приедет с широкими дефолтами `supabase_admin`, включая `anon`, и правке недоступна
(`postgres` не член `supabase_admin`).

**Hard delete.** Ни одной таблицы с `deleted_at` в проекте нет — физический DELETE +
CASCADE. Одинокий soft-delete не вводить.

**Применение миграций — операция гейта.** Claude Code пишет
`supabase/migrations/0NN_name.sql` и коммитит; apply делает Cowork через Supabase MCP
(`apply_migration` → gen-types → advisors → ролевые смоки). Ни CLI (`supabase db
push`), ни ручной прогон в SQL Editor. `docs/schema.md` обновляется тем же PR, что
миграция.
DDL на горячей таблице (`ALTER`, `CREATE INDEX`) — первой строкой
`set lock_timeout = '5s';`. После большого бэкфилла — `analyze <table>`.
**Исключение из гейта:** миграцию с `drop` или `delete` прогоняет владелец в SQL
Editor (MCP `apply_migration` на них виснет) — см. learnings, «MCP `apply_migration` /
`execute_sql` виснет на `drop` и на `delete`».
Прогон — одной транзакцией с `insert into supabase_migrations.schema_migrations`.
