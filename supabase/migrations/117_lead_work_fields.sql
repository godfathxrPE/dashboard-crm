-- ═══════════════════════════════════════════════════════════════════════════
-- 117 — S-LEAD-CORE-1: лид как рабочая сущность. Поля работы, ownership на
--       `owner_id`, RLS с проверкой роли.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260809092051 org_timeline` (115) ⇒ следующая
--    свободная 117 (файл 116 написан, ждёт гейта).
--
-- ЧТО БЫЛО. `leads` (016 + 018) — плоская запись триажа: title/source/status/
-- direction/raw-контакты/конверсионные ссылки. Ответственный — legacy `user_id`
-- → `auth.users`, против конвенции проекта (`owner_id` → `profiles`). Следующего
-- шага, температуры, суммы и квалификации нет вовсе — глубина лида кончается
-- на стейл-метке.
--
-- ЧТО СТАЛО. Двенадцать колонок работы и квалификации + ownership переезжает на
-- `owner_id`. `user_id` НЕ удаляется этой миграцией: колонка NOT NULL, на неё
-- смотрит гард `convert_lead` и старые строки — удаление идёт отдельной миграцией
-- после того, как гейт подтвердит, что клиент её больше не пишет.
--
-- ⚠️ Одно ОСОЗНАННОЕ УЖЕСТОЧЕНИЕ прав: `leads_insert_own` роль НЕ проверяла —
--    viewer мог создать лид вопреки UI-гейту (`canCreate` в LeadsView) и вопреки
--    комментарию в коде. Новая `leads_insert` требует owner/admin/manager, как
--    остальные org-таблицы 048-паттерна.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ Поля работы и квалификации ═══

alter table public.leads
  add column owner_id            uuid default auth.uid() references public.profiles(id) on delete set null,
  add column next_step           text,
  add column next_action_date    date,
  add column temperature         text,
  add column estimated_value     bigint,
  add column pain                text,
  add column budget_status       text not null default 'unknown',
  add column decision_role       text,
  add column chz_groups          text[],
  add column regulatory_deadline date,
  add column first_contacted_at  timestamptz,
  add column qualified_at        timestamptz;

alter table public.leads
  add constraint leads_temperature_check
    check (temperature is null or temperature in ('hot','warm','cold')),
  add constraint leads_budget_status_check
    check (budget_status in ('unknown','none','estimated','confirmed')),
  add constraint leads_estimated_value_check
    check (estimated_value is null or estimated_value >= 0);

comment on column public.leads.estimated_value is
  'Оценка суммы, КОПЕЙКИ (как projects.budget / quotes.amount)';
comment on column public.leads.decision_role is
  'Роль контакта в решении. Словарь — deal_stakeholders.role (092), CHECK намеренно нет: у лида роль это гипотеза, а не запись в карте стейкхолдеров';
comment on column public.leads.chz_groups is
  'Товарные группы «Честного Знака» — названия из src/lib/data/chz-groups.ts (снапшот справочника, не FK)';
comment on column public.leads.user_id is
  'DEPRECATED с 117: ответственный — owner_id. Колонка NOT NULL и её читает гард convert_lead; держится default''ом до отдельной миграции удаления';

-- Бэкфилл владельца из legacy `user_id`. Гард `exists`: `user_id` смотрит в
-- auth.users, а `owner_id` — в profiles; строки автора без профиля остаются с
-- NULL-владельцем (править их сможет только owner/admin — это честнее, чем FK-падение).
update public.leads l
   set owner_id = l.user_id
 where l.owner_id is null
   and exists (select 1 from public.profiles p where p.id = l.user_id);

-- Клиент `user_id` больше не пишет — NOT NULL закрывает default.
alter table public.leads alter column user_id set default auth.uid();

-- ═══ RLS: ownership на owner_id, insert получает роль ═══
-- Семантика прежняя (owner/admin правят все лиды org, остальные — свои), новое —
-- только проверка роли на INSERT. Обе функции ролей — в initplan-обёртке
-- `( select … )`, иначе планировщик зовёт их построчно.
-- Старые политики висели на `to public` — новые на `to authenticated` (048-паттерн).

drop policy leads_insert_own on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

drop policy leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( ( select public.current_org_role() ) in ('owner','admin')
          or owner_id = ( select auth.uid() ) )
  )
  with check ( org_id = ( select public.current_org_id() ) );

drop policy leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( ( select public.current_org_role() ) in ('owner','admin')
          or owner_id = ( select auth.uid() ) )
  );

-- Партиальные индексы (042-паттерн): у большинства лидов оба поля пусты.
create index idx_leads_owner       on public.leads(owner_id)         where owner_id is not null;
create index idx_leads_next_action on public.leads(next_action_date) where next_action_date is not null;

-- `revoke truncate, references, trigger` не нужен: 082 сузил дефолтные привилегии
-- в корне, новых таблиц миграция не заводит.
