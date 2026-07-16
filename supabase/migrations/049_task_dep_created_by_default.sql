-- 049: created_by у task_dependencies — DEFAULT auth.uid() (аудит «кто связал»)
-- auth.uid() под authenticated → id автора; под service/MCP (null) → NULL (ок, nullable).
alter table public.task_dependencies
  alter column created_by set default auth.uid();
