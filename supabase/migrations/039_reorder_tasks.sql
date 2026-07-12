-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 039 — bulk reorder_tasks RPC (AUDIT A2.2)
-- ───────────────────────────────────────────────────────────────────────────
-- Проблема (AUDIT 2.2): drop карточки в KanbanBoard рассыпался на 15-30
-- параллельных updateTask.mutate — каждый инвалидирует ['tasks'], откат одной
-- затирает соседние успешные, порядок «прыгает» после рефетча промежуточного
-- состояния. Заменяем на ОДНУ мутацию: массив перестановок одним UPDATE.
--
-- Гард: все задачи из p_moves должны принадлежать org вызывающего — считаем
-- нарушителей одним запросом (is_org_member по org_id самих задач); при чужой
-- задаче RAISE 42501. UPDATE идёт через jsonb_to_recordset одним стейтментом
-- и дублирует org-гард в WHERE (двойная защита). Резолвер resolve_task_board
-- (032) отработает per-row как при обычном updateTask({lane, sort_order}).
--
-- Урок 033: явный REVOKE anon — SECURITY DEFINER не должна быть доступна
-- анониму. GRANT только authenticated/service_role.
--
-- ⚠️ НЕ ПРИМЕНЯТЬ: гейт advisors у Cowork (как 038). Pending.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reorder_tasks(p_moves jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_bad_count int;
BEGIN
  -- Пустой батч — no-op (guard от jsonb_array_length(NULL)).
  IF p_moves IS NULL OR jsonb_typeof(p_moves) <> 'array'
     OR jsonb_array_length(p_moves) = 0 THEN
    RETURN;
  END IF;

  -- Org-гард: сколько задач из p_moves НЕ принадлежат org вызывающего.
  -- JOIN отбрасывает несуществующие id (их UPDATE просто не тронет — безвредно);
  -- ловим именно попытку тронуть ЧУЖУЮ существующую задачу.
  SELECT count(*)
    INTO v_bad_count
  FROM jsonb_to_recordset(p_moves) AS m(id uuid, lane text, sort_order int)
  JOIN public.tasks t ON t.id = m.id
  WHERE NOT public.is_org_member(t.org_id);

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'not authorized for one or more tasks in reorder batch'
      USING ERRCODE = '42501';
  END IF;

  -- Одним стейтментом. is_org_member в WHERE — вторая линия защиты (на случай
  -- гонки смены org между проверкой и апдейтом).
  UPDATE public.tasks t
     SET lane       = m.lane::task_lane,
         sort_order = m.sort_order,
         updated_at = now()
  FROM jsonb_to_recordset(p_moves) AS m(id uuid, lane text, sort_order int)
  WHERE t.id = m.id
    AND public.is_org_member(t.org_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_tasks(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reorder_tasks(jsonb) TO authenticated, service_role;
