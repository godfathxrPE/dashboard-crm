-- ═══════════════════════════════════════════════════════
-- 129 — queue_snoozes: «отложить строку очереди дня до завтра» (S-QUEUE-1).
--
-- Аналог «Hide suggestion» в Pipedrive Pulse / snooze в Close Inbox. У сделок, лидов
-- и остывающих контактов в очереди «Сегодня» нет своего механизма переноса (у звонков
-- есть bump, у задач — дедлайн и lane), поэтому строка висит в списке, пока действие
-- не сделано, — и очередь перестают читать целиком.
--
-- ⚠️ Snooze — ЛИЧНОЕ состояние очереди, не свойство сущности. Поэтому таблица, а не
-- колонка `snoozed_until` в projects/leads/contacts: колонка была бы общей на org, и
-- «отложил» одного менеджера прятало бы строку у коллеги. Плюс любой UPDATE
-- public.projects будит trg_zz_run_automations — писать в сделку ради интерфейсного
-- жеста «скрыть на день» значит гонять движок автоматизаций (тот же довод, что в 092).
--
-- ⚠️ `until` — DATE, не timestamptz. «До завтра» — календарное обещание («покажи снова
-- завтра утром»), а не 24 часа от клика: клик в 23:50 не должен прятать строку почти
-- на весь следующий день. Сравнение в клиенте идёт ключом дня (`localDateKey`),
-- поэтому граница суток — локальная, и типы совпадают: 'YYYY-MM-DD' ↔ date.
--
-- ⚠️ Строка со сроком «до сегодня включительно» СКРЫТА: клик «отложить до завтра»
-- пишет until = завтра, и весь сегодняшний день строка не видна. Активные =
-- `until >= today`.
--
-- Realtime НЕ включаем: чужие snooze по построению не видны (RLS сужает до
-- created_by = auth.uid()), а свои приходят из оптимистичной мутации того же клиента.
-- Публикация тут добавила бы трафик и ноль сведений.
--
-- Бэкфилла нет: до этой миграции отложенных строк не существовало.
--
-- ⚠️ НЕ применена — применяет гейт (apply → gen-types → advisors → ролевые смоки).
--
-- Откат:
--   drop table public.queue_snoozes cascade;
-- ═══════════════════════════════════════════════════════

create table if not exists public.queue_snoozes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- Ownership — `created_by`, конвенция проекта (`user_id` есть только в
  -- activity_log, где это актор журнала). profiles, НЕ auth.users.
  --
  -- ⚠️ `on delete cascade`, а не `set null` (обычная конвенция): строка без владельца
  -- бессмысленна — snooze ничего не прячет, потому что прячет он ИМЕННО у своего
  -- автора. Осиротевшая строка держала бы место в уникальном индексе.
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entity_type text not null,
  -- FK нет намеренно: entity_id указывает в три разные таблицы (projects/leads/
  -- contacts) и полиморфную ссылку в Postgres не выразить одним ключом. Цена —
  -- висячая строка после удаления сущности; она безвредна, потому что очередь
  -- сопоставляет snooze с уже загруженным списком и «отложенное несуществующее»
  -- просто не находит (см. snoozedEntries в TodayView).
  entity_id   uuid not null,
  -- До какого ДНЯ ВКЛЮЧИТЕЛЬНО строка скрыта.
  until       date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint queue_snoozes_entity_type_chk
    check (entity_type in ('deal','lead','contact'))
);

-- Одна отложенная строка на человека и сущность: повторный «отложить» ПРОДЛЕВАЕТ
-- срок, а не плодит вторую строку (клиент делает upsert ровно по этому ключу).
create unique index if not exists queue_snoozes_owner_entity_uniq
  on public.queue_snoozes (created_by, entity_type, entity_id);

-- Рабочий запрос ровно один — «мои активные на сегодня» (created_by = me, until >= today).
create index if not exists queue_snoozes_active_idx
  on public.queue_snoozes (created_by, until);

create index if not exists queue_snoozes_org_idx
  on public.queue_snoozes (org_id);

-- ═══ Триггеры ═══
-- org_id клиент не передаёт — ставит set_org_id (как deal_stakeholders/092).
-- Заморозка org_id — руками: автоцикл 054 покрыл только таблицы, существовавшие
-- на его момент. Префикс `aa_` не косметика — порядок триггеров алфавитный.
drop trigger if exists trg_set_org_id on public.queue_snoozes;
create trigger trg_set_org_id
  before insert on public.queue_snoozes
  for each row execute function public.set_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.queue_snoozes;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.queue_snoozes
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

-- Имя функции именно `update_updated_at` (`set_updated_at` в схеме НЕТ).
drop trigger if exists trg_set_updated_at on public.queue_snoozes;
create trigger trg_set_updated_at
  before update on public.queue_snoozes
  for each row execute function public.update_updated_at();

-- ═══ RLS ═══
-- org-граница первым конъюнктом, ЛИЧНАЯ видимость вторым. Роль не проверяется
-- намеренно: отложить строку в своей очереди вправе любой член организации —
-- ограничение по роли означало бы «viewer обязан смотреть на список, который не
-- может ни сделать, ни убрать».
-- current_org_id()/auth.uid() строго в обёртке ( select … ) — initplan, иначе
-- функция считается построчно (advisor WARN).
-- Раздельные политики на операцию, не FOR ALL (урок 036b).
alter table public.queue_snoozes enable row level security;

create policy queue_snoozes_select on public.queue_snoozes for select to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
  );

create policy queue_snoozes_insert on public.queue_snoozes for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
  );

-- WITH CHECK повторяет USING — урок 054: без него строку можно перенести в чужую org
-- (org_id прикрыт ещё и trg_aa_freeze_org_id) или переписать на чужого владельца.
create policy queue_snoozes_update on public.queue_snoozes for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
  )
  with check (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
  );

create policy queue_snoozes_delete on public.queue_snoozes for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
  );

-- ═══ Гранты ═══
-- `revoke truncate, references, trigger` НЕ пишем: 082 сузил дефолтные привилегии
-- postgres в public в корне (authenticated = arwd). `revoke … from anon` остаётся:
-- default ACL роли supabase_admin всё ещё раздаёт anon полный набор.
revoke all on public.queue_snoozes from anon;

grant select, insert, update, delete on public.queue_snoozes to authenticated;  -- поверх RLS

comment on table public.queue_snoozes is
  'S-QUEUE-1 (129): личный snooze строки очереди дня. Одна строка = «этот человек скрыл '
  'эту сущность до даты until включительно». RLS сужает до created_by = auth.uid() — '
  'чужое «отложить» не прячет строку у коллеги. Полиморфная ссылка (entity_type + '
  'entity_id) на projects/leads/contacts, FK нет; висячие строки безвредны. Realtime '
  'не включён намеренно.';

comment on column public.queue_snoozes.until is
  'До какого ДНЯ ВКЛЮЧИТЕЛЬНО строка скрыта. Активные = until >= сегодня. Тип date, '
  'не timestamptz: «до завтра» — календарное обещание, а не 24 часа от клика.';

comment on column public.queue_snoozes.entity_id is
  'Полиморфная ссылка: projects.id | leads.id | contacts.id по entity_type. FK нет.';
