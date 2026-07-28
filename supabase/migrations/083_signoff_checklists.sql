-- 083: sign-off чеклисты внедрения — таблицы, RLS, гранты, сид (S-R2-SIGNOFF-1, R2-P1-G).
--
-- Две таблицы: checklist_templates (org-словарь, правит owner/admin) + project_checklists
-- (экземпляр на проекте, отмечает команда). Разделение — принятый в проекте паттерн
-- delivery_templates → tasks: экземпляр после создания живёт своей жизнью и на шаблон
-- не смотрит, дуального состояния не возникает.
--
-- Гейт завершения и RPC отметки — в 084, чтобы откат делился на «данные» и «поведение».
--
-- ⚠️ ОБРАТИМОСТЬ: откат — drop обеих таблиц. Безопасен только ПОСЛЕ отката 084
--    (там функции ссылаются на project_checklists). Порядок отката: 084, затем 083.
--
-- ⚠️ CHECK на checklist_type сужать обратно нельзя, пока в таблицах есть строки с
--    новыми значениями — сначала delete, потом re-narrow.
--
-- Отклонение от текста спринта (и почему):
--   • `direction` — тип `public.direction_t`, НЕ `public.project_direction`: последнего в
--     схеме не существует (проверено по pg_type живой БД 2026-07-28, в public всего 7 enum:
--     activity_type, call_status, direction_t, pipeline_entity_t, quote_status, task_lane,
--     task_priority). `projects.direction` — именно `direction_t` ('erp','iiot').

create table if not exists public.checklist_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  direction      public.direction_t,                -- null = любое направление
  delivery_kind  text check (delivery_kind is null or delivery_kind in ('launch','experiment')),
  checklist_type text not null check (checklist_type in
                   ('doc_review','handover_support','erp_stage_accept','custom')),
  title          text not null check (char_length(trim(title)) between 1 and 120),
  items          jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  is_active      boolean not null default true,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Один активный шаблон на (org, тип, направление, вид) — иначе инстанцирование
-- недетерминировано. NULL в direction/delivery_kind означает «на всё» и обязан
-- участвовать в ограничении, а обычный unique его пропускает (NULL != NULL).
--
-- ⚠️ Решение — `nulls not distinct` (PG15+; в проде 17.6), а НЕ индекс по
-- `coalesce(direction::text,'*')`, как было в тексте спринта: `enum_out` помечен
-- **STABLE**, а не IMMUTABLE (проверено по pg_proc), прямого pg_cast
-- `direction_t → text` нет — приведение идёт через I/O-конверсию, и Postgres
-- отклонил бы такой индекс с «functions in index expression must be marked
-- IMMUTABLE». Побочная выгода: индекс по голым колонкам, а не по выражению,
-- поэтому пригоден и для обычных выборок шаблонов.
create unique index if not exists uq_checklist_templates_slot
  on public.checklist_templates (org_id, checklist_type, direction, delivery_kind)
  nulls not distinct
  where is_active;

create index if not exists idx_checklist_templates_org
  on public.checklist_templates (org_id, checklist_type);

create table if not exists public.project_checklists (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  checklist_type text not null check (checklist_type in
                   ('doc_review','handover_support','erp_stage_accept','custom')),
  title          text not null check (char_length(trim(title)) between 1 and 120),
  items          jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  completed_at   timestamptz,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, checklist_type)
);

-- Гейт на каждом завершении читает чеклисты проекта — индекс обязателен.
create index if not exists idx_project_checklists_project
  on public.project_checklists (project_id);
create index if not exists idx_project_checklists_org
  on public.project_checklists (org_id);

-- ── Триггеры новой таблицы — дословно паттерн 077 ──
-- `set_org_id` НЕ вешаем: org_id приходит ЯВНО (из UI при «Добавить чеклист», из
-- instantiate_project_checklists при спавне). Тот же выбор сделан в 077 для segments
-- и в stage_requirements/invitations. В DEFINER-контексте current_org_id() может
-- вернуть NULL, так что явная передача надёжнее подстановки.
--
-- Заморозка org_id обязательна: без неё строку можно перекинуть в чужую org апдейтом.
-- Узкий `before update of org_id` + `when` — копия автоцикла 054 (он покрывает только
-- таблицы, существовавшие на момент 054; новые выписываются руками).
-- Префикс `aa_` не косметика: порядок исполнения триггеров в Postgres алфавитный, и
-- проект на этом уже обжёгся (trg_sync_deal_stage_fields против trg_sync_project_stage).
drop trigger if exists trg_aa_freeze_org_id on public.checklist_templates;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.checklist_templates
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.project_checklists;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.project_checklists
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

-- updated_at. Функция называется `update_updated_at` — проверено по pg_proc живой БД:
-- `set_updated_at` в схеме НЕТ вовсе. Имена в проекте разъезжаются, не угадывать.
drop trigger if exists trg_set_updated_at on public.checklist_templates;
create trigger trg_set_updated_at
  before update on public.checklist_templates
  for each row execute function public.update_updated_at();

drop trigger if exists trg_set_updated_at on public.project_checklists;
create trigger trg_set_updated_at
  before update on public.project_checklists
  for each row execute function public.update_updated_at();

-- ═══ RLS ═══
-- Стиль обязателен: current_org_*() строго в обёртке ( select … ) — initplan-оптимизация,
-- иначе функция вычисляется на каждую строку (advisor WARN).

alter table public.checklist_templates enable row level security;
alter table public.project_checklists  enable row level security;

-- ── checklist_templates: читают все члены org, правят owner/admin ──
create policy checklist_templates_select on public.checklist_templates
  for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

create policy checklist_templates_write on public.checklist_templates
  for all to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

-- ── project_checklists: читают все члены org ──
create policy project_checklists_select on public.project_checklists
  for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

-- ⚠️ ОТЛИЧИЕ ОТ 077, ЭТО НЕ ОПЕЧАТКА:
-- INSERT/UPDATE/DELETE на project_checklists — ТОЛЬКО owner/admin.
-- Рядовой участник отмечает пункты НЕ прямым UPDATE, а через DEFINER-RPC
-- toggle_checklist_item (084), которая штампует auth.uid()/now() серверно.
-- Если дать участнику прямой UPDATE на items — он перепишет чужие checked_by,
-- и sign-off перестаёт быть accountability (F7 ревью архитектуры).
create policy project_checklists_write on public.project_checklists
  for all to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

-- ═══ Гранты — урок 075/082 ═══
-- С 082 дефолтные привилегии `postgres` в public сужены в корне (проверено по
-- pg_default_acl: authenticated=arwd, без D/x/t/m) — новая таблица приходит с ровно
-- нужным набором БЕЗ единого revoke в своей миграции. Поэтому `revoke truncate,
-- references, trigger` здесь НЕ пишем (это единственное отступление от «выписывать
-- всё явно», и оно проверяемо: права разбираются поэлементно через unnest(relacl),
-- НЕ like по склейке — грабля 080, склейка врёт из-за прав соседней роли).
--
-- `revoke ... from anon` остаётся: default ACL роли supabase_admin в public всё ещё
-- раздаёт anon полный набор, и таблица, созданная не от postgres, приедет широкой.
-- `grant` выписан явно — конвенция проекта: миграция читается как самодостаточное
-- описание прав, а не как «доверься 082».
revoke all on public.checklist_templates from anon;
revoke all on public.project_checklists  from anon;

grant select, insert, update, delete on public.checklist_templates to authenticated;  -- поверх RLS
grant select, insert, update, delete on public.project_checklists  to authenticated;  -- поверх RLS

-- ═══ Сид: два шаблона на каждую существующую org ═══
-- ⚠️ Формулировки — РАБОЧИЕ ЗАГЛУШКИ (Открытое решение 1 спринта не закрыто: реальных
-- пунктов из 1С:ДО на момент коммита нет). Labels лежат в jsonb и правятся из Настроек
-- (ChecklistTemplatesSection) без миграции — осознанно дешёвый откат.
--
-- Идемпотентно: конфликт по uq_checklist_templates_slot → do nothing.
-- direction/delivery_kind = NULL — шаблон применяется к любому внедрению.
--
-- `erp_stage_accept` в CHECK заведён, но НЕ сидируется — это P1-I (ERP parity).
insert into public.checklist_templates (org_id, direction, delivery_kind, checklist_type, title, items)
select o.id, null::public.direction_t, null::text, v.checklist_type, v.title, v.items
from public.organizations o
cross join (values
  ('doc_review', 'Проверка документов перед сдачей', '[
     {"key":"tz_signed",     "label":"ТЗ подписано заказчиком",           "required":true},
     {"key":"acts_ready",    "label":"Акты сформированы",                 "required":true},
     {"key":"docs_uploaded", "label":"Документы приложены к проекту",     "required":true},
     {"key":"invoice_sent",  "label":"Счёт выставлен",                    "required":false}
   ]'::jsonb),
  ('handover_support', 'Передача на сопровождение', '[
     {"key":"instructions",  "label":"Инструкции переданы пользователям", "required":true},
     {"key":"contacts",      "label":"Контакты сопровождения переданы",   "required":true},
     {"key":"kb_article",    "label":"Описание решения в базе знаний",    "required":false},
     {"key":"support_brief", "label":"Бриф для линии сопровождения",      "required":false}
   ]'::jsonb)
) as v(checklist_type, title, items)
on conflict do nothing;

comment on table public.checklist_templates is
  'Шаблоны sign-off чеклистов внедрения (R2-P1-G, 083): org-словарь, правит owner/admin. '
  'Инстанцируется в project_checklists при spawn_delivery_project (084) и кнопкой '
  '«Добавить чеклист» в UI. items — [{key,label,required}]; бэкфилла на существующие '
  'внедрения НЕТ (обязательные пункты сделали бы идущие проекты незавершаемыми).';

comment on table public.project_checklists is
  'Экземпляр sign-off чеклиста на проекте внедрения (R2-P1-G, 083). items — '
  '[{key,label,required,checked,checked_by,checked_at}]; отметка ставится ТОЛЬКО через '
  'DEFINER-RPC toggle_checklist_item (084), прямой UPDATE рядовому участнику закрыт '
  'политикой project_checklists_write (owner/admin) — в этом и смысл sign-off. '
  'Незакрытые required-пункты блокируют завершение (check_delivery_completion, 084).';
