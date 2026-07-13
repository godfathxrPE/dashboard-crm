-- 040_rls_hardening.sql — AUDIT-B2 «Схема — источник истины»
-- ⚠️ PENDING: НЕ применять автоприменением. Применяет ТОЛЬКО гейт Cowork через
--    MCP apply_migration, после верификации против живой БД (см. тест-сценарии в
--    _analysis/sprint-audit-B-schema-truth.md).
--
-- Базовая точка — 20260712230000_baseline.sql (снимок прода 2026-07-12).
-- Все определения ниже реконструированы из baseline; имена политик/функций сохранены.
--
-- Покрывает: AUDIT 2.3 (org-гард ai_hub INSERT), 2.10 (notif WITH CHECK),
--            2.4 (confirmed-email для инвайтов), 2.6 (FK ON DELETE).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.3  ai_hub org-INSERT: INSERT-политики transcripts/ai_runs пропускали org_id.
--      Без гарда автор мог вставить строку с чужим org_id (created_by свой).
--      Добавляем `org_id = current_org_id()` в WITH CHECK (DROP + CREATE, имя то же).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "transcripts_insert" ON "public"."transcripts";
CREATE POLICY "transcripts_insert" ON "public"."transcripts"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    (org_id = ( SELECT public.current_org_id() ))
    AND (created_by = ( SELECT auth.uid() ))
    AND (
      ( (entity_type = 'call'::text)
        AND EXISTS ( SELECT 1 FROM public.calls c WHERE c.id = transcripts.entity_id ) )
      OR
      ( (entity_type = 'meeting'::text)
        AND EXISTS ( SELECT 1 FROM public.meetings m WHERE m.id = transcripts.entity_id ) )
    )
  );

DROP POLICY IF EXISTS "ai_runs_insert" ON "public"."ai_runs";
CREATE POLICY "ai_runs_insert" ON "public"."ai_runs"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    (org_id = ( SELECT public.current_org_id() ))
    AND (created_by = ( SELECT auth.uid() ))
    AND EXISTS (
      SELECT 1 FROM public.transcripts t
      WHERE t.id = ai_runs.transcript_id
        AND t.entity_type = ai_runs.entity_type
        AND t.entity_id = ai_runs.entity_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.10  notif_update: была только USING, без WITH CHECK — при UPDATE строку можно
--       было «увести» на чужой org_id/recipient_id. Дублируем USING в WITH CHECK.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "notif_update" ON "public"."notifications";
CREATE POLICY "notif_update" ON "public"."notifications"
  FOR UPDATE
  USING (
    (org_id = ( SELECT public.current_org_id() ))
    AND (recipient_id = ( SELECT auth.uid() ))
  )
  WITH CHECK (
    (org_id = ( SELECT public.current_org_id() ))
    AND (recipient_id = ( SELECT auth.uid() ))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.4  Инвайты (minimal-фикс): принимать членство ТОЛЬКО если у нового пользователя
--      email подтверждён (email_confirmed_at IS NOT NULL). Функция apply_pending_invites
--      не видит auth.users напрямую — добавляем параметр p_email_confirmed, который
--      прокидывает триггер handle_new_user из NEW.email_confirmed_at.
--
--      ⚠️ ГРАНИЦЫ ЭТОГО ФИКСА (для гейта Cowork):
--        • Триггер handle_new_user срабатывает на INSERT auth.users. При включённой
--          верификации email в этот момент ещё NULL → инвайт при регистрации НЕ
--          применится, и подхватить его на UPDATE (подтверждении) пока НЕКОМУ.
--          Полноценный приём — через RPC accept_invitation(p_token) + страница /invite.
--        • При ВЫКЛЮЧЕННОЙ верификации GoTrue авто-подтверждает на INSERT, поэтому
--          сам по себе гард сценарий «регистрация на чужой адрес» НЕ закрывает —
--          закрытие требует включённой верификации ИЛИ token-flow.
--      TODO (СЛЕДУЮЩИЙ спринт): RPC accept_invitation(p_token) + /invite + триггер
--          на подтверждение email. Здесь — только «пояс» под включённую верификацию.
--
--      ⚠️ На проде висит непринятый инвайт god4azer@gmail.com/manager — после
--         применения перепроверить, что легитимный приём не сломан (см. тест-сценарии).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS "public"."apply_pending_invites"("uuid", "text");

CREATE OR REPLACE FUNCTION "public"."apply_pending_invites"(
    "p_profile_id" "uuid",
    "p_email" "text",
    "p_email_confirmed" boolean DEFAULT false
) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_count integer := 0;
BEGIN
  -- Гард: без подтверждённого email членство по инвайту не выдаём.
  IF NOT p_email_confirmed THEN
    RETURN 0;
  END IF;

  WITH matched AS (
    UPDATE public.invitations
    SET accepted_at = now()
    WHERE lower(email) = lower(p_email)
      AND accepted_at IS NULL
      AND expires_at > now()
    RETURNING org_id, role
  ), inserted AS (
    INSERT INTO public.memberships (org_id, profile_id, role)
    SELECT org_id, p_profile_id, role FROM matched
    ON CONFLICT (org_id, profile_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END; $$;

ALTER FUNCTION "public"."apply_pending_invites"("uuid", "text", boolean) OWNER TO "postgres";
-- ГЕЙТ-ФИКС Cowork: default privileges схемы public раздают EXECUTE anon/authenticated
-- на КАЖДУЮ новую функцию; REVOKE FROM PUBLIC их НЕ снимает (урок P1). Без явного
-- revoke новая сигнатура стала бы вызываемой через REST rpc → угон чужого инвайта
-- самозарегистрированным authenticated. Старая функция на проде: service_role-only
-- (verified has_function_privilege 2026-07-13) — реплицируем.
REVOKE ALL ON FUNCTION "public"."apply_pending_invites"("uuid", "text", boolean) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."apply_pending_invites"("uuid", "text", boolean) TO "service_role";

-- Прокидываем флаг подтверждения из auth.users в обновлённую сигнатуру.
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  PERFORM public.apply_pending_invites(
    NEW.id,
    NEW.email,
    NEW.email_confirmed_at IS NOT NULL
  );

  RETURN NEW;
END; $$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.6  FK без ON DELETE.
--
--   Сверка по живой схеме (baseline 2026-07-12) — уже ON DELETE SET NULL, НЕ трогаем:
--     • activities.project_id            → SET NULL  ✅ (уже в проде)
--     • scheduled_calls.company_id       → SET NULL  ✅
--     • scheduled_calls.contact_id       → SET NULL  ✅
--     • scheduled_calls.project_id       → SET NULL  ✅
--
--   Реальный пробел — kpi_entries.profile_id: правило ON DELETE отсутствует (NO ACTION),
--   удаление профиля упирается в RESTRICT.
--
--   ⚠️ ОТКЛОНЕНИЕ ОТ ПРОМПТА (SET NULL → CASCADE): kpi_entries.profile_id объявлен
--      NOT NULL и входит в UNIQUE(profile_id, week_start, metric) — SET NULL физически
--      невозможен без снятия NOT NULL, а KPI-строка без владельца бессмысленна и ломает
--      UNIQUE. Выбран ON DELETE CASCADE: при удалении профиля его KPI-история удаляется.
--      На ревью гейта: если нужен «архив» KPI удалённых — пересматриваем на SET NULL
--      со снятием NOT NULL отдельным решением.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."kpi_entries"
  DROP CONSTRAINT IF EXISTS "kpi_entries_profile_id_fkey";
ALTER TABLE "public"."kpi_entries"
  ADD CONSTRAINT "kpi_entries_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

COMMIT;
