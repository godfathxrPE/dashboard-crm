-- 075: привести гранты baseline-таблиц к тому, что обещает шапка 074.
-- Дефолтные привилегии Supabase выдают authenticated ВСЕ права на новую таблицу в public,
-- поэтому `grant select, delete` в 074 ничего не сузил. RLS запись и так не пропускает
-- (INSERT/UPDATE-политик нет), но TRUNCATE/REFERENCES/TRIGGER под RLS не ходят —
-- снимаем их явно. Единственный путь записи остаётся прежним: RPC create_project_baseline
-- (security definer). Данные не трогаются, откат — обратный grant.

revoke insert, update, truncate, references, trigger
  on public.project_baselines from authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.baseline_tasks from authenticated;

-- Остаётся ровно: select+delete на заголовок, select на строки.
-- baseline_tasks удаляются каскадом от project_baselines (FK on delete cascade),
-- прямой DELETE строк клиентом не нужен и DELETE-политики на них нет.
grant select, delete on public.project_baselines to authenticated;
grant select         on public.baseline_tasks    to authenticated;

revoke all on public.project_baselines from anon;
revoke all on public.baseline_tasks    from anon;
