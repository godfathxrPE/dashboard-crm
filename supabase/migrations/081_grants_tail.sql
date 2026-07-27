-- 081 — S-SEC-GRANTS-TAIL: гранты семи таблиц БЕЗ колонки `org_id`.
--
-- Хвост 080. Та миграция сужала гранты через каталог, фильтром
-- `information_schema.columns.column_name = 'org_id'`, — и поэтому принципиально не видела
-- семь таблиц, у которых такой колонки нет: тенантность у них другая (у `organizations`
-- тенант живёт в `id`, `meeting_attendees` тенантен через join, `pipelines` /
-- `pipeline_stages` — глобальные словари, `profiles` / `user_settings` — per-user,
-- `dashboard_sync` — служебная). У всех семи `authenticated` до сих пор держит полный
-- набор `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`.
-- Здесь добиваем явным списком — каталожный фильтр 080 их не берёт по построению.
--
-- Состояние прода перед правкой (сверено 2026-07-27, RLS включён на всех семи):
--   organizations      SELECT, UPDATE                     ← гранты ШИРЕ политик
--   profiles           SELECT, UPDATE                     ← гранты ШИРЕ политик
--   pipelines          SELECT                             ← гранты ШИРЕ политик
--   pipeline_stages    SELECT                             ← гранты ШИРЕ политик
--   user_settings      ALL
--   meeting_attendees  ALL + SELECT
--   dashboard_sync     SELECT, INSERT, UPDATE, DELETE
-- `anon` пуст на всех семи (056 держится).
--
-- Поведение не меняется: операция без политики и сейчас блокируется RLS. Меняется только
-- текст ошибки — было «0 строк / RLS violation», станет `42501 permission denied`. Смысл
-- правки в том, что грант шире политики — ложное обещание, которое станет реальным доступом
-- в день, когда кто-нибудь добавит политику «чтобы починить» и не посмотрит на гранты.
--
-- Откат — обратный `grant` (по каждой таблице отдельной строкой, см. блоки ниже).
--
-- Применяет гейт Cowork через apply_migration.

------------------------------------------------------------------------
-- 1. TRUNCATE / REFERENCES / TRIGGER — снять у всех семи.
--
--    Эти три привилегии RLS не покрывает вообще. У `organizations` тенант живёт в `id`,
--    и `TRUNCATE` там игнорирует политики целиком — одна команда сносит корень всех org.
--    `TRIGGER` позволяет навесить собственный триггер на таблицу профилей и организаций.
--    Ни то, ни другое клиенту не нужно ни в одном сценарии.
------------------------------------------------------------------------
revoke truncate, references, trigger on
  public.organizations,
  public.profiles,
  public.pipelines,
  public.pipeline_stages,
  public.user_settings,
  public.meeting_attendees,
  public.dashboard_sync
from authenticated;

-- Страховка, симметрично 080: `anon` уже пуст после 056 (+ default privileges).
revoke all on
  public.organizations,
  public.profiles,
  public.pipelines,
  public.pipeline_stages,
  public.user_settings,
  public.meeting_attendees,
  public.dashboard_sync
from anon;

------------------------------------------------------------------------
-- 2. DML → привести к политикам там, где грант шире.
--
--    Каждому revoke предшествует guard: если политика на снимаемую операцию появилась
--    (то есть операция задумана и картина выше устарела), миграция падает целиком —
--    вся она в одной транзакции, — вместо того чтобы вслепую отобрать нужное право.
--    'ALL' в списке cmd не случайно: политика `FOR ALL` покрывает и INSERT, и DELETE.
--
--    НЕ трогаем DML у `user_settings` (политика ALL), `meeting_attendees` (ALL + SELECT)
--    и `dashboard_sync` (все четыре cmd) — там политики есть, значит операции задуманы.
------------------------------------------------------------------------

-- 2.1 Словари `pipelines` / `pipeline_stages`: политика ровно одна, SELECT. Это глобальные
--      словари, не org-scoped; запись в них идёт миграциями, не клиентом. Клиентский код
--      читает их только через `usePipelines` / `usePipelineStages` (`.select()`), проверено
--      грепом по `src/` и по edge-функциям.
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'pipelines'
               and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception '081: у pipelines появилась write-политика — revoke отменён, разобраться';
  end if;
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'pipeline_stages'
               and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception '081: у pipeline_stages появилась write-политика — revoke отменён, разобраться';
  end if;
end $$;

revoke insert, update, delete on public.pipelines       from authenticated;
revoke insert, update, delete on public.pipeline_stages from authenticated;

-- 2.2 `organizations`: политики SELECT + UPDATE (owner-only, `org_update_owner`).
--      INSERT/DELETE политик нет. UPDATE остаётся — им живёт правка `settings` (076)
--      через `useUpdateOrgSettings`.
--      ⚠️ Уточнение к брифу: организацию НЕ создаёт `complete_onboarding` — та функция
--      только доштампывает профиль (`update public.profiles … onboarded_at`). В живой БД
--      вообще нет функции, которая пишет в `organizations` (проверено по `pg_get_functiondef`
--      всех функций public/auth), и нет такого кода в `src/` и в edge-функциях: org
--      заводится вне приложения (SQL/дашборд под service_role). Клиентский INSERT/DELETE
--      не нужен ни одному сценарию.
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'organizations'
               and cmd in ('INSERT', 'DELETE', 'ALL')) then
    raise exception '081: у organizations появилась политика INSERT/DELETE — revoke отменён, разобраться';
  end if;
end $$;

revoke insert, delete on public.organizations from authenticated;

-- 2.3 `profiles`: политики SELECT + UPDATE (own, `profiles_update_own`). INSERT/DELETE
--      политик нет. Профиль заводит `handle_new_user()` — SECURITY DEFINER-триггер на
--      `auth.users` (owner `postgres`), грант клиента ему не нужен. Удаление профиля идёт
--      каскадом от `auth.users`. UPDATE остаётся: `useUpdateProfile`, `useUploadAvatar`.
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'profiles'
               and cmd in ('INSERT', 'DELETE', 'ALL')) then
    raise exception '081: у profiles появилась политика INSERT/DELETE — revoke отменён, разобраться';
  end if;
end $$;

revoke insert, delete on public.profiles from authenticated;
