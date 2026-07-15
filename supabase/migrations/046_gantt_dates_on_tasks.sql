-- Migration 046: S-GANTT-DATES-1 — gantt dates on tasks (additive, nullable)
ALTER TABLE public.tasks
  ADD COLUMN start_date date,
  ADD COLUMN end_date   date;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_dates_order_chk
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

COMMENT ON COLUMN public.tasks.start_date IS 'Gantt: начало задачи (nullable). S-GANTT-DATES-1.';
COMMENT ON COLUMN public.tasks.end_date   IS 'Gantt: конец задачи (nullable). Fallback на deadline::date — на уровне рендера. S-GANTT-DATES-1.';
