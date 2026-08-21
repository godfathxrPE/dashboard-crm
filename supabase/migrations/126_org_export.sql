-- ═══════════════════════════════════════════════════════
-- 126 — S-EXPORT-1 (ось 5, «швы опциональности»): выгрузка данных организации
-- одним вызовом. Закрывает развилку Р1 (152-ФЗ, переносимость) и снимает
-- аргумент «данные заперты в чужом Supabase».
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260821104527 contact_company_capture` (125) ⇒ 126.
--    Грепом по номеру ledger не сверяется: 069–073 записаны без числового
--    префикса, а имена после 086 префикс потеряли вовсе.
--
-- ⚠️ SECURITY INVOKER — ОСОЗНАННОЕ отклонение от конвенции проекта (DEFINER +
-- адресный ACL). Третий такой случай после `entity_timeline` (112) и её
-- расширений, и ровно по той же причине.
--
--   У DEFINER изоляция организаций держалась бы на правильности `where org_id = …`
--   ВНУТРИ функции — одна ошибка, и владелец одной org выгружает чужую. У INVOKER
--   она держится на RLS, которая уже написана, уже проверена advisors и уже покрыта
--   ролевыми смоками. Экспорт по определению отдаёт пользователю то, что он и так
--   вправе прочитать, — значит совпадает с RLS один в один и не нуждается в
--   собственной копии правил. Копия разошлась бы с политикой при первой же правке
--   RLS, и разошлась бы МОЛЧА.
--
-- ⚠️ СЛЕДСТВИЕ, КОТОРОЕ НАДО ПРИНЯТЬ. Выгрузка у `owner` и у `manager` будет
-- РАЗНОГО ОБЪЁМА — ровно настолько, насколько различаются их права по RLS. Это не
-- дефект, а свойство: экспорт отдаёт данные организации в том объёме, в каком они
-- доступны запросившему. Кнопка в UI показана ТОЛЬКО владельцу — чтобы у manager
-- не возникло ложного впечатления, что он выгрузил всю организацию.
--
-- ⚠️ ЧЛЕНСТВО ПРОВЕРЯЕТСЯ ЯВНО, и это НЕ дубль RLS. Без проверки посторонний
-- получил бы валидный объект с 34 пустыми массивами вместо честной ошибки — то
-- есть «экспорт прошёл, данных нет». Проверка отвечает на вопрос «ты вообще в этой
-- org?», а не «какие строки тебе видны»; второй вопрос по-прежнему за RLS.
-- Сама проверка тоже идёт через RLS (`membership_select_own_org`), поэтому чужую
-- org она не подтвердит.
--
-- ⚠️ `memberships.profile_id`, НЕ `user_id`. Колонки `user_id` в таблице нет
-- (`id, org_id, profile_id, role, created_at`) — сверено `information_schema`.
-- Ownership в проекте вообще идёт через `owner_id`/`created_by`/`profile_id`.
--
-- ⚠️ ИМЯ ТАБЛИЦЫ В `format(%I)` БЕРЁТСЯ ИЗ ЛИТЕРАЛА-МАССИВА ВЫШЕ, а не из
-- аргумента функции: пользовательский ввод в идентификатор не попадает ни при
-- каком вызове. Аргумент `p_org_id` уходит только параметром `$1`.
--
-- СОСТАВ. 34 таблицы из 50 org-таблиц. Исключения и причина по каждой —
-- `src/lib/domain/org-export.ts`, `EXCLUDED_TABLES`; расхождение SQL-массива и
-- TS-списка ловит `tests/unit/org-export.test.ts`, а не прод.
--
-- ЛИМИТ 50 000 строк на таблицу — предохранитель, не пагинация. На 21.08 самая
-- крупная таблица `activity_log` — 1357 строк, весь экспорт единицы мегабайт.
-- Порядок строк не задан (у части таблиц нет одиночного `id` — `contact_company`,
-- `conversation_members`, `message_reactions`), и при упоре в лимит срез был бы
-- произвольным; это допустимо ровно потому, что до лимита три порядка.
-- ═══════════════════════════════════════════════════════

create or replace function public.export_org_data(p_org_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_table  text;
  v_rows   jsonb;
  v_tables text[] := array[
    'companies','contacts','contact_company','leads','deal_stakeholders',
    'projects','project_members','project_columns','project_checklists',
    'project_baselines','baseline_tasks',
    'tasks','task_dependencies','recurring_task_templates',
    'calls','scheduled_calls','meetings','transcripts','quotes',
    'stage_transitions','stage_requirements','segments',
    'conversations','conversation_members','messages','message_reactions',
    'kpi_entries','call_tracker_days','activity_log',
    'delivery_templates','delivery_template_phases','delivery_template_tasks',
    'checklist_templates','automation_rules'
  ];
begin
  -- Членство проверяем явно: RLS не даст чужие строки, но без этой проверки
  -- посторонний получил бы объект с пустыми массивами вместо честной ошибки.
  if not exists (
    select 1 from memberships m
    where m.org_id = p_org_id and m.profile_id = ( select auth.uid() )
  ) then
    raise exception 'not a member of organization %', p_org_id
      using errcode = '42501';
  end if;

  foreach v_table in array v_tables loop
    -- Таблица берётся из массива-литерала выше, не из аргумента функции —
    -- пользовательский ввод в идентификатор не попадает.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select * from public.%I where org_id = $1 limit 50000
       ) t', v_table)
    into v_rows using p_org_id;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
  end loop;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'org_id',      p_org_id,
      'exported_at', now(),
      'exported_by', ( select auth.uid() ),
      'format',      'dashboard-crm/org-export@1',
      'tables',      to_jsonb(v_tables)
    ),
    -- Состав организации — отдельным ключом, а не таблицей в `data`:
    -- `memberships` целиком (с id строки) для переноса бесполезна, нужна пара
    -- «кто — в какой роли».
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', m.profile_id, 'role', m.role))
      from memberships m where m.org_id = p_org_id
    ), '[]'::jsonb),
    'data', v_result
  );
end;
$$;

revoke all on function public.export_org_data(uuid) from public, anon;
grant execute on function public.export_org_data(uuid) to authenticated;

comment on function public.export_org_data(uuid) is
  'S-EXPORT-1. Выгрузка данных организации в JSON. SECURITY INVOKER: объём определяется '
  'правами вызывающего по RLS, поэтому у owner и manager он разный — это свойство, не дефект. '
  'Состав таблиц — контракт из src/lib/domain/org-export.ts, исключения и причины там же '
  'в EXCLUDED_TABLES. Не член организации получает 42501, а не пустой объект.';
