# Claude Code Prompt — Sprint: Supabase Security & RLS

Контекст: dashboard-crm, Supabase ref `uoiavcabxgdjugzryrmj`. Аудит 2026-06-14 (advisors).
ВАЖНО: миграции применяются ВРУЧНУЮ через Supabase Dashboard → SQL Editor → Run.
НЕ используй `supabase db push` / CLI. Каждый файл — отдельная миграция, с `IF EXISTS`/`IF NOT EXISTS`.

Цель: закрыть RLS-дыры и security-замечания линтера. Сначала P1 (дыры), потом P2/P3 (гигиена).

---

## РАЗВЕДКА (выполни первой)

Через Supabase MCP подтверди текущее состояние перед изменениями:
```
1. get_advisors type=security  — перечитай свежий список
2. execute_sql: проверь политику meeting_attendees
   select policyname, cmd, qual, with_check from pg_policies
   where schemaname='public' and tablename='meeting_attendees';
3. execute_sql: есть ли вообще данные в meeting_attendees (используется ли таблица)
   select count(*) from meeting_attendees;
4. execute_sql: список SECURITY DEFINER функций и их grants
   select p.proname, p.prosecdef from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef;
```

---

## ЗАДАЧА 1 (P1): Закрыть RLS-дыру meeting_attendees

Сейчас `attendees_all FOR ALL USING(true)` — открыта всем (включая anon). Скоупим через связь с meetings.

Миграция `supabase/migrations/0XX_fix_meeting_attendees_rls.sql`:
```sql
DROP POLICY IF EXISTS attendees_all ON meeting_attendees;

CREATE POLICY attendees_own ON meeting_attendees FOR ALL
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_attendees.meeting_id
      AND m.user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = meeting_attendees.meeting_id
      AND m.user_id = (select auth.uid())
  ));
```
Применить в SQL Editor. После — `get_advisors security` не должен показывать `rls_policy_always_true` для meeting_attendees.

---

## ЗАДАЧА 2 (P1): activity_log — ограничить service-insert

`Service insert logs WITH CHECK(true)` нужна была для триггеров, но триггеры пишут как SECURITY DEFINER и так. Убери широкую политику, оставь пользовательскую `Users insert own logs`.

```sql
-- Проверь сначала что триггеры (log_delete_*, log_stage_change) — SECURITY DEFINER (они и так пишут в обход RLS).
DROP POLICY IF EXISTS "Service insert logs" ON activity_log;
-- Останется "Users insert own logs" WITH CHECK (user_id = auth.uid())
```
ОСТОРОЖНО: после применения проверь, что удаление сущности всё ещё пишет лог (триггер DEFINER). Если лог перестал писаться — верни политику, но в форме `WITH CHECK (user_id = auth.uid())`.

---

## ЗАДАЧА 3 (P2): RLS initplan — auth.uid() → (select auth.uid())

38 политик вызывают `auth.uid()` per-row. Оберни в подзапрос. Сгенерируй миграцию, которая для каждой затронутой политики делает DROP+CREATE с `(select auth.uid())`.

Затронутые таблицы (политики SELECT/UPDATE/DELETE/INSERT/ALL):
activities, activity_log, call_tracker_days, calls, companies, contacts, dashboard_sync,
kpi_entries, leads, meetings, profiles, project_files, projects, scheduled_calls, tasks, user_settings.

Пример паттерна:
```sql
DROP POLICY IF EXISTS tasks_select ON tasks;
CREATE POLICY tasks_select ON tasks FOR SELECT USING (user_id = (select auth.uid()));
-- ...повтори для каждой политики каждой таблицы
```
Перед написанием возьми точные определения политик:
```sql
select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname='public' order by tablename, cmd;
```
Собери миграцию `0XX_rls_initplan.sql` строго из реальных определений (не выдумывай qual). После — `get_advisors performance`: `auth_rls_initplan` должен исчезнуть.

---

## ЗАДАЧА 4 (P3): search_path функций + revoke SECURITY DEFINER от anon

```sql
-- 4a: зафиксировать search_path у всех функций
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_profile_settings() SET search_path = public, pg_temp;
ALTER FUNCTION public.user_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_stage_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_deal_stage_fields() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_leads_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_delete_project() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_delete_task() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_delete_call() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_delete_meeting() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_delete_contact() SET search_path = public, pg_temp;
ALTER FUNCTION public.log_delete_company() SET search_path = public, pg_temp;
-- convert_lead имеет аргументы — укажи полную сигнатуру (возьми из РАЗВЕДКИ):
-- ALTER FUNCTION public.convert_lead(uuid,text,text,text,text,text,text,text,numeric) SET search_path = public, pg_temp;

-- 4b: триггер-функции не должны вызываться напрямую через REST
REVOKE EXECUTE ON FUNCTION public.log_delete_project() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_delete_task() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_delete_call() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_delete_meeting() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_delete_contact() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_delete_company() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_stage_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_role() FROM anon;
-- convert_lead вызывается из use-leads.ts (.rpc) — ОСТАВЬ authenticated, убери только anon:
-- REVOKE EXECUTE ON FUNCTION public.convert_lead(...) FROM anon;
```
ОСТОРОЖНО: `convert_lead` дёргается из приложения — не отзывай у `authenticated`. Проверь после, что конвертация лида в UI работает.

---

## ЗАДАЧА 5 (P3): Leaked password protection

Не SQL — в Supabase Dashboard → Authentication → Policies/Settings включи "Leaked password protection" (HaveIBeenPwned). Зафиксируй в чеклисте go-live.

---

## ПОРЯДОК И ПРОВЕРКА

1. Применяй миграции по одной в SQL Editor (P1 → P2 → P3).
2. После каждой — `get_advisors` соответствующего типа, убедись что замечание ушло.
3. Smoke-тест в UI: создание/удаление сущности (лог пишется), конвертация лида (RPC работает), встречи с участниками.
4. Обнови `references/schema.md` скилла crm-architect: 19 таблиц, новые политики (через Settings → Capabilities, в сессии скилл read-only).

Индексы FK / unused (P3) — отдельным заходом, осторожно (статистика unused сбрасывается на репликах). Здесь не трогаем.
