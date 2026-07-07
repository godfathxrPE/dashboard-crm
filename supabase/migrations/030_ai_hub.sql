-- ============ 030: AI Hub MVP — transcripts + ai_runs ============
-- Транскрипт как самостоятельная сущность (1 транскрипт → N прогонов).
-- ai_runs — журнал прогонов (клон паттерна automation_runs S29).
-- Обе — обычные tenant-таблицы: org_id ставит trg_set_org_id (вставка под JWT юзера).
-- RLS «по сущности»: видит тот, кто видит родительский call/meeting (EXISTS под их RLS).
--
-- Применяется ПОСЛЕ 028 и 029 (гейт Cowork). Схемно от них не зависит —
-- использует только существующие calls/meetings/organizations/profiles.

-- ---------- transcripts ----------
CREATE TABLE IF NOT EXISTS public.transcripts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type  text NOT NULL CHECK (entity_type IN ('call','meeting')),
  entity_id    uuid NOT NULL,
  source       text NOT NULL DEFAULT 'paste' CHECK (source IN ('paste','file')),  -- 'stt' — будущее
  content      text,
  storage_path text,                                   -- оригинал файла (S-AI-2, private bucket)
  char_count   int  NOT NULL,
  created_by   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),   -- DEFAULT: клиентский INSERT под RLS
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transcripts_entity ON public.transcripts (entity_type, entity_id);

-- ---------- ai_runs ----------
CREATE TABLE IF NOT EXISTS public.ai_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  preset_key     text NOT NULL,
  entity_type    text NOT NULL CHECK (entity_type IN ('call','meeting')),
  entity_id      uuid NOT NULL,
  transcript_id  uuid NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','error')),
  result         jsonb,
  error          text,
  model          text,
  prompt_version int,
  input_tokens   int,
  output_tokens  int,
  duration_ms    int,
  rating         smallint CHECK (rating IN (-1, 1)),
  feedback_note  text,                    -- опционально при 👎: «что не так» (QA-датасет, концепт §3.2)
  created_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_entity ON public.ai_runs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_org_created ON public.ai_runs (org_id, created_at DESC);  -- расход токенов по org

-- Идемпотентность: один активный прогон на (транскрипт, пресет). Двойной клик / гонка → 23505.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_runs_active
  ON public.ai_runs (transcript_id, preset_key)
  WHERE status IN ('pending','running');

-- ---------- org_id через общий триггер (как остальные tenant-таблицы) ----------
DROP TRIGGER IF EXISTS trg_set_org_id ON public.transcripts;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.transcripts
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();
DROP TRIGGER IF EXISTS trg_set_org_id ON public.ai_runs;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.ai_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

-- ---------- RLS ----------
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs     ENABLE ROW LEVEL SECURITY;

-- Хелпер видимости в policy НЕ нужен: EXISTS к calls/meetings исполняется ПОД ИХ RLS,
-- то есть подзапрос вернёт строку только если пользователь реально видит сущность.
-- Это и есть «по RLS сущности» (owner/admin видят всё, manager — своё) без дублирования логики.

-- transcripts
DROP POLICY IF EXISTS transcripts_select ON public.transcripts;
CREATE POLICY transcripts_select ON public.transcripts FOR SELECT TO authenticated
USING (
  org_id = ( SELECT public.current_org_id() )
  AND (
    ( entity_type = 'call'    AND EXISTS ( SELECT 1 FROM public.calls    c WHERE c.id = entity_id ) )
    OR ( entity_type = 'meeting' AND EXISTS ( SELECT 1 FROM public.meetings m WHERE m.id = entity_id ) )
  )
);
DROP POLICY IF EXISTS transcripts_insert ON public.transcripts;
CREATE POLICY transcripts_insert ON public.transcripts FOR INSERT TO authenticated
WITH CHECK (
  created_by = ( SELECT auth.uid() )
  AND (
    ( entity_type = 'call'    AND EXISTS ( SELECT 1 FROM public.calls    c WHERE c.id = entity_id ) )
    OR ( entity_type = 'meeting' AND EXISTS ( SELECT 1 FROM public.meetings m WHERE m.id = entity_id ) )
  )
);
-- транскрипт неизменяем в MVP (правок нет); DELETE — только автор
DROP POLICY IF EXISTS transcripts_delete ON public.transcripts;
CREATE POLICY transcripts_delete ON public.transcripts FOR DELETE TO authenticated
USING ( org_id = ( SELECT public.current_org_id() ) AND created_by = ( SELECT auth.uid() ) );

-- ai_runs
DROP POLICY IF EXISTS ai_runs_select ON public.ai_runs;
CREATE POLICY ai_runs_select ON public.ai_runs FOR SELECT TO authenticated
USING (
  org_id = ( SELECT public.current_org_id() )
  AND (
    ( entity_type = 'call'    AND EXISTS ( SELECT 1 FROM public.calls    c WHERE c.id = entity_id ) )
    OR ( entity_type = 'meeting' AND EXISTS ( SELECT 1 FROM public.meetings m WHERE m.id = entity_id ) )
  )
);
-- INSERT/UPDATE прогона делает edge-функция ПОД JWT юзера → created_by = auth.uid().
DROP POLICY IF EXISTS ai_runs_insert ON public.ai_runs;
CREATE POLICY ai_runs_insert ON public.ai_runs FOR INSERT TO authenticated
WITH CHECK (
  created_by = ( SELECT auth.uid() )
  AND EXISTS ( SELECT 1 FROM public.transcripts t
               WHERE t.id = transcript_id AND t.entity_type = ai_runs.entity_type AND t.entity_id = ai_runs.entity_id )
);
-- UPDATE: смена статуса (edge, автор) + rating (автор ∨ owner/admin в org)
DROP POLICY IF EXISTS ai_runs_update ON public.ai_runs;
CREATE POLICY ai_runs_update ON public.ai_runs FOR UPDATE TO authenticated
USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin') OR created_by = ( SELECT auth.uid() ) )
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin') OR created_by = ( SELECT auth.uid() ) )
);

-- ---------- Realtime (как notifications) ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_runs;
