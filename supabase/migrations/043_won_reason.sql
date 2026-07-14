-- 043: причина выигрыша — симметрия loss_reason/loss_detail
-- Аддитивно: nullable text, бэкфилл не нужен, RLS не меняется (наследуется от projects),
-- индексы не нужны (не фильтр-колонка; win-analysis — позже).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS won_reason text,
  ADD COLUMN IF NOT EXISTS won_detail text;
