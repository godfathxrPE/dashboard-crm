-- 033: security-fix delete_project_column (найдено смоком гейта PCT-1, применено 2026-07-09).
-- Дыра: при current_org_id() IS NULL (authenticated без membership — существуют в
-- invite-flow S26) сравнение v_col.org_id <> NULL даёт NULL → оба permission-гарда
-- молча пропускали. Чужак мог удалить пустую не-последнюю колонку любого тенанта.
-- Подтверждено направленным смоком до фикса, после фикса — forbidden 42501.
-- Фикс: NULL-safe сравнение (IS DISTINCT FROM) + явный отказ без org-контекста
-- + COALESCE на current_org_role().
--
-- УРОК (просится в learnings.md): в SECURITY DEFINER функциях сравнения с
-- current_org_id()/current_org_role() ВСЕГДА NULL-safe — `<>` с NULL молча
-- пропускает гард. RLS-политик это не касается (там NULL = deny), дыра
-- специфична для императивных проверок в функциях.

CREATE OR REPLACE FUNCTION public.delete_project_column(
  p_column_id uuid,
  p_target_column_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_col public.project_columns; v_target public.project_columns;
BEGIN
  SELECT * INTO v_col FROM public.project_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'column not found'; END IF;

  -- NULL-safe: нет org-контекста ИЛИ чужой тенант → отказ.
  IF public.current_org_id() IS NULL
     OR v_col.org_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.current_org_role(), '') NOT IN ('owner','admin') AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_col.project_id
      AND (p.owner_id = auth.uid() OR p.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_col.category IN ('backlog','done') AND NOT EXISTS (
    SELECT 1 FROM public.project_columns
    WHERE project_id = v_col.project_id AND category = v_col.category AND id <> v_col.id
  ) THEN
    RAISE EXCEPTION 'cannot delete last % column', v_col.category;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE column_id = v_col.id) THEN
    SELECT * INTO v_target FROM public.project_columns
      WHERE id = p_target_column_id AND project_id = v_col.project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'target column required'; END IF;
    UPDATE public.tasks SET column_id = v_target.id WHERE column_id = v_col.id;
  END IF;

  DELETE FROM public.project_columns WHERE id = v_col.id;
END $$;
