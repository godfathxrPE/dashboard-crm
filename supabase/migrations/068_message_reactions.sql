-- 068_message_reactions.sql — S-CHAT-2: реакции на сообщения чата
-- Junction message<->user<->emoji. Hard-delete (эфемерная сущность, не бизнес-запись).
-- Tenant через существующий set_org_id(). Новых функций нет.
-- CC: НЕ ПРИМЕНЯТЬ. Гейт Cowork применит через MCP apply_migration.

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.project_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid()
                          REFERENCES public.profiles(id)          ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_uniq UNIQUE (message_id, user_id, emoji)
);

-- message_id покрыт ведущей колонкой UNIQUE; org_id (RLS) + user_id (FK/RLS)
CREATE INDEX IF NOT EXISTS idx_message_reactions_org  ON public.message_reactions(org_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id);

-- org_id проставляет существующий set_org_id() (как на project_messages)
DROP TRIGGER IF EXISTS trg_set_org_id ON public.message_reactions;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

-- W2: полный old-row для realtime DELETE-событий под RLS (unreact должен долетать до клиентов)
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: видит реакцию тот, кто видит сообщение (EXISTS под RLS project_messages). W1: TO authenticated.
CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT TO authenticated USING (
    org_id = (SELECT public.current_org_id())
    AND EXISTS (SELECT 1 FROM public.project_messages m WHERE m.id = message_reactions.message_id)
  );

-- INSERT: своя реакция, на видимое сообщение, в своей org
CREATE POLICY message_reactions_insert ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    org_id  = (SELECT public.current_org_id())
    AND user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.project_messages m WHERE m.id = message_reactions.message_id)
  );

-- DELETE: только свою (реакция личная; чужую не модерируем; при удалении сообщения — CASCADE)
CREATE POLICY message_reactions_delete ON public.message_reactions
  FOR DELETE TO authenticated USING (
    org_id = (SELECT public.current_org_id())
    AND user_id = (SELECT auth.uid())
  );
-- UPDATE-политики НЕТ: реакции не редактируются.

-- Grants (в духе 056): anon — ничего; authenticated под RLS. UPDATE не выдаём.
REVOKE ALL ON public.message_reactions FROM anon, public;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;

-- Realtime (idempotent-guard на повторный apply)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
