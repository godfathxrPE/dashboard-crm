-- Sprint Contact-Hub-A: covering-индексы под серверный фильтр EntityTimeline.
--
-- useEntityTimeline фильтрует источники по entity-колонке на СЕРВЕРЕ
-- (.eq('contact_id', id) и т.п.). Ранее эти выборки шли org-fetch'ем и
-- фильтровались на клиенте, поэтому индексы под contact_id не были нужны.
-- Теперь запрос идёт прямо в БД — закрываем два незаиндексированных FK,
-- на которые жаловался advisor (unindexed foreign keys).
--
-- Уже проиндексированы (не трогаем): meetings(contact_id/company_id) — 012,
-- tasks(contact_id/company_id) — 013, calls(company_id) — 005,
-- projects(company_id) — 003.

CREATE INDEX IF NOT EXISTS idx_calls_contact    ON public.calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_contact ON public.projects(contact_id);
