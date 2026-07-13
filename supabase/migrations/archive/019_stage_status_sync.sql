-- ============================================
-- Migration 019: единый источник истины won/lost + возраст в стадии
-- 1) stage_entered_at — когда сделка вошла в текущую стадию
-- 2) Триггер: stage_id → status/actual_close_date/stage_entered_at.
--    Кто бы ни двигал стадию (drag, кнопка, модалка) — статус консистентен.
-- 3) Backfill существующих рассинхронов.
-- Applied via Supabase MCP (2026-07-05)
-- ============================================

BEGIN;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION sync_project_stage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_is_won boolean;
  v_is_lost boolean;
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_entered_at := now();

    SELECT is_won, is_lost INTO v_is_won, v_is_lost
    FROM pipeline_stages WHERE id = NEW.stage_id;

    IF v_is_won THEN
      NEW.status := 'won';
      NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    ELSIF v_is_lost THEN
      NEW.status := 'lost';
      NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    ELSE
      -- Возврат из терминальной стадии: on_hold не трогаем
      IF NEW.status IN ('won', 'lost') THEN
        NEW.status := 'open';
      END IF;
      NEW.actual_close_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_project_stage ON projects;
CREATE TRIGGER trg_sync_project_stage
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION sync_project_stage();

-- Backfill: возраст стадии ≈ последнее обновление (лучшая доступная оценка)
UPDATE projects SET stage_entered_at = updated_at WHERE stage_entered_at IS NULL;

-- Backfill: рассинхроны status ↔ stage
UPDATE projects p SET
  status = 'won',
  actual_close_date = COALESCE(p.actual_close_date, p.updated_at::date)
FROM pipeline_stages s
WHERE p.stage_id = s.id AND s.is_won AND p.status <> 'won';

UPDATE projects p SET
  status = 'lost',
  actual_close_date = COALESCE(p.actual_close_date, p.updated_at::date)
FROM pipeline_stages s
WHERE p.stage_id = s.id AND s.is_lost AND p.status <> 'lost';

UPDATE projects p SET
  status = 'open',
  actual_close_date = NULL
FROM pipeline_stages s
WHERE p.stage_id = s.id AND NOT s.is_won AND NOT s.is_lost AND p.status IN ('won', 'lost');

COMMIT;

-- VERIFICATION:
-- SELECT status, count(*) FROM projects GROUP BY status;
-- SELECT p.name, p.status, s.name, s.is_won, s.is_lost FROM projects p JOIN pipeline_stages s ON s.id = p.stage_id;
