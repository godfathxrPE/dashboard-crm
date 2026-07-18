-- S-TEAM-VISIBILITY-1: участник project_members видит проект, его файлы и доску задач (SELECT).
-- ЧИСТО АДДИТИВНО: helper + 3 новые permissive SELECT-политики.
-- Existing политики НЕ трогаем — доступ только расширяется (сузиться не может).
-- НЕ трогает: tasks write (update/delete), task_dependencies, storage.objects (download
-- чужих файлов остаётся own-path — S-TEAM-VISIBILITY-2), project_columns (уже org-wide).

-- 1. Helper: SECURITY DEFINER (обходит RLS → без рекурсии), hardened как is_org_member.
--    GRANT authenticated + service_role — паритет is_org_member.
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.profile_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated, service_role;

-- 2. projects: участник видит проект (заметки, шапка, стадии).
CREATE POLICY projects_select_member ON public.projects
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND (SELECT public.is_project_member(id))
  );

-- 3. project_files: участник видит МЕТАДАННЫЕ+комменты файлов проекта.
--    (download чужих — НЕ здесь: storage own-path; write остаётся own через ALL-политику)
CREATE POLICY project_files_select_member ON public.project_files
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND (SELECT public.is_project_member(project_id))
  );

-- 4. tasks: участник видит ВСЮ доску проекта (не только свои задачи).
--    write (tasks_update/delete) НЕ трогаем — правит только assigned/created/owner.
CREATE POLICY tasks_select_member ON public.tasks
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND (SELECT public.is_project_member(project_id))
  );
