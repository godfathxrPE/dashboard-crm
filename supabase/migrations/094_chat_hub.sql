-- ═══════════════════════════════════════════════════════
-- 094 — CHAT-HUB фаза 1a: generalized-модель чата (conversations + messages + reads).
--
-- ЗАЧЕМ СЕЙЧАС. Сообщение перестаёт висеть на проекте и вешается на КОНТЕЙНЕР
-- (`conversations`) — паттерн Bitrix24/Monday. Чат проекта становится conversation
-- с kind='project'; general-канал org и будущие group/dm ложатся в ту же таблицу без
-- перестройки. В `project_messages` сейчас 2 строки и 0 реакций — переезд стоит
-- копейки; после адопции он стоил бы простоя.
--
-- ЧТО ЗДЕСЬ. Аддитивная миграция: новые таблицы + хелпер членства + сидеры + бэкфилл
-- + перевес FK реакций на `messages`. Legacy `project_messages` НЕ трогается — её
-- сносит отдельная 095, и только после смока 094 на переключённом коде
-- (Migration Safety Protocol: аддитивное и разрушающее — разными применениями).
--
-- ЧЛЕНСТВО БЕЗ ТАБЛИЦЫ УЧАСТНИКОВ. `is_conversation_member()` выводит доступ из kind:
-- general = вся org, project = ровно зеркало видимости проекта (те же три ветки, что в
-- политиках 067). Копировать `project_members` в свою таблицу участников канала — это
-- второй источник истины с ручной синхронизацией; урок companies.phone ↔ phones[]
-- (инвариант, который держит только клиент, не держится).
--
-- ПОЧЕМУ В conversations НЕТ updated_at. В 1a у таблицы нет UPDATE-пути вообще:
-- каналы создаются системно (сидеры + бэкфилл), политик INSERT/UPDATE/DELETE клиенту
-- не выдаётся. Колонка со штампом, который некому двигать, — мусор. Фаза 2
-- (переименование group-канала) заводит и колонку, и триггер вместе с UPDATE-политикой.
--
-- ⚠️ НЕ применена — применяет гейт (apply → advisors → ролевые смоки → gen-types).
--
-- Откат:
--   alter table public.message_reactions drop constraint message_reactions_message_id_fkey;
--   alter table public.message_reactions add constraint message_reactions_message_id_fkey
--     foreign key (message_id) references public.project_messages(id) on delete cascade;
--   -- вернуть политики реакций на project_messages (тела — в 068)
--   drop trigger if exists trg_zz_seed_general_conversation on public.organizations;
--   drop trigger if exists trg_zz_seed_project_conversation on public.projects;
--   drop function if exists public.seed_general_conversation();
--   drop function if exists public.seed_project_conversation();
--   alter publication supabase_realtime drop table public.messages;
--   drop table public.conversation_reads;
--   drop table public.messages;
--   drop table public.conversations;
--   drop function if exists public.is_conversation_member(uuid);
-- ═══════════════════════════════════════════════════════

-- ═══ 1. conversations ═══
-- kind — закрытый словарь из ЧЕТЫРЁХ значений, хотя в 1a создаются только два.
-- 'group'/'dm' сидят в CHECK заранее намеренно: расширять CHECK на живой таблице —
-- отдельная миграция с валидацией, а путей создания у них всё равно нет (INSERT-политики
-- клиенту не выдаём), так что «мёртвые» значения ничего не открывают.
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  kind       text not null check (kind in ('general','project','group','dm')),
  -- CASCADE: удалили проект — канал и его сообщения уходят следом (hard delete —
  -- конвенция проекта, deleted_at-инфраструктуры нет).
  project_id uuid references public.projects(id) on delete cascade,
  -- NULL для general/project: заголовок таких каналов вычисляется (имя проекта / «Общий»).
  title      text check (title is null or length(title) between 1 and 120),
  -- profiles, НЕ auth.users — конвенция. В сидерах/бэкфилле придёт NULL (auth.uid()
  -- в DEFINER-контексте пуст) — это нормально: системные каналы автора не имеют.
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Инвариант «project_id есть ровно у kind='project'» в обе стороны: без правой части
  -- в general-канал можно было бы протащить project_id, без левой — завести
  -- project-канал без проекта.
  constraint conversations_project_kind_chk check ((kind = 'project') = (project_id is not null))
);

-- Partial unique — по одному general-каналу на org и по одному каналу на проект.
-- Именно они делают `on conflict do nothing` в бэкфилле и в сидерах идемпотентным.
create unique index if not exists uq_conversations_general_per_org
  on public.conversations(org_id) where kind = 'general';
create unique index if not exists uq_conversations_project
  on public.conversations(project_id) where kind = 'project';
create index if not exists idx_conversations_org on public.conversations(org_id);

drop trigger if exists trg_set_org_id on public.conversations;
create trigger trg_set_org_id
  before insert on public.conversations
  for each row execute function public.set_org_id();

-- Заморозка org_id — руками: автоцикл 054 покрыл только таблицы, жившие на его момент.
-- Префикс `aa_` не косметика — порядок триггеров в Postgres алфавитный.
drop trigger if exists trg_aa_freeze_org_id on public.conversations;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.conversations
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

alter table public.conversations enable row level security;

-- ═══ 2. is_conversation_member(uuid) ═══
-- Шаблон — is_project_member (065): SECURITY DEFINER STABLE + фиксированный search_path
-- + адресный ACL. DEFINER здесь ещё и анти-рекурсия: функцию зовёт SELECT-политика самой
-- `conversations`, и без обхода RLS это был бы 42P17 (урок 071 / is_meeting_attendee).
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind       text;
  v_project_id uuid;
  v_org_id     uuid;
begin
  select c.kind, c.project_id, c.org_id
    into v_kind, v_project_id, v_org_id
    from public.conversations c
   where c.id = p_conversation_id;

  -- Строки нет ИЛИ чужой тенант. `is distinct from` вместо `<>` — при NULL с любой
  -- стороны (нет активной org в сессии) `<>` дал бы NULL, и `and NULL` в политике
  -- прошёл бы как «не false» только в USING… но в WITH CHECK NULL = отказ, а поведение
  -- обязано быть одинаковым. Сравнение NULL-safe → всегда явный false.
  if v_org_id is null or v_org_id is distinct from public.current_org_id() then
    return false;
  end if;

  -- general: своя org — уже проверена выше, больше условий нет.
  if v_kind = 'general' then
    return true;
  end if;

  -- project: ровно те же три ветки, что в политиках 067 (org owner/admin →
  -- владелец/создатель проекта → участник). Один источник правды про видимость чата.
  if v_kind = 'project' then
    return public.current_org_role() in ('owner','admin')
        or exists (
             select 1 from public.projects p
              where p.id = v_project_id
                and (p.owner_id = auth.uid() or p.created_by = auth.uid())
           )
        or public.is_project_member(v_project_id);
  end if;

  -- group/dm: путей создания нет, участников негде хранить → доступа нет.
  -- Фаза 2 заменит функцию целиком (таблица участников появится вместе с ними).
  return false;
end $$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;

comment on function public.is_conversation_member(uuid) is
  'CHAT-HUB 1a (094): членство в канале выводится из kind, без таблицы участников. '
  'general = вся org; project = зеркало видимости проекта (067); group/dm = false до фазы 2.';

-- ═══ 3. Политики conversations ═══
-- Только SELECT. Каналы в 1a системные: general заводит сидер на organizations,
-- project — сидер на projects. INSERT/UPDATE/DELETE клиенту не выдаём — иначе появится
-- второй, неконтролируемый путь создания каналов мимо инварианта «один канал на проект».
create policy conversations_select on public.conversations
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_conversation_member(id))
  );

revoke all on public.conversations from anon;
grant select on public.conversations to authenticated;

-- ═══ 4. messages ═══
-- Структура 1:1 с project_messages (067), кроме project_id → conversation_id.
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id)  on delete cascade,
  conversation_id uuid not null references public.conversations(id)  on delete cascade,
  -- nullable + SET NULL: история чата переживает ушедшего автора (как в 067)
  author_id       uuid references public.profiles(id) on delete set null default auth.uid(),
  body            text not null check (length(body) between 1 and 4000),
  edited_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_messages_org          on public.messages(org_id);
create index if not exists idx_messages_author       on public.messages(author_id);

drop trigger if exists trg_set_org_id on public.messages;
create trigger trg_set_org_id
  before insert on public.messages
  for each row execute function public.set_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.messages;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.messages
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

alter table public.messages enable row level security;

-- SELECT: видит ленту тот, кто член канала.
create policy messages_select on public.messages
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_conversation_member(conversation_id))
  );

-- INSERT: член канала пишет строго от своего имени (подмена author_id → 42501).
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
    and (select public.is_conversation_member(conversation_id))
  );

-- UPDATE: правка только своих; WITH CHECK зеркалит USING — автора не переназначить
-- и сообщение не перенести в чужой канал.
create policy messages_update on public.messages
  for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
  );

-- DELETE: свои + модерация org owner/admin (как в 067).
create policy messages_delete on public.messages
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      author_id = (select auth.uid())
      or (select public.current_org_role()) in ('owner','admin')
    )
  );

revoke all on public.messages from anon;
grant select, insert, update, delete on public.messages to authenticated;

-- Realtime: RLS применяется и к событиям — чужой канал не долетит.
-- REPLICA IDENTITY FULL здесь НЕ нужен (в отличие от реакций 068): DELETE-событие несёт
-- id, клиенту этого хватает на инвалидацию среза — ровно как в 067-чате.
-- Guard как в 068/092: голый `add table` падает на повторном apply.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ═══ 5. conversation_reads ═══
-- Фундамент unread-бейджей 1b: «докуда дочитал». PK по паре — строка у пары
-- (канал, юзер) ровно одна, upsert по ней идемпотентен.
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade default auth.uid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_reads_user on public.conversation_reads(user_id);
create index if not exists idx_conversation_reads_org  on public.conversation_reads(org_id);

drop trigger if exists trg_set_org_id on public.conversation_reads;
create trigger trg_set_org_id
  before insert on public.conversation_reads
  for each row execute function public.set_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.conversation_reads;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.conversation_reads
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

alter table public.conversation_reads enable row level security;

-- Читает и пишет каждый ТОЛЬКО свою строку: «кто что прочитал» — приватная отметка,
-- а не телеметрия для коллег.
create policy conversation_reads_select on public.conversation_reads
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
  );

create policy conversation_reads_insert on public.conversation_reads
  for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
    and (select public.is_conversation_member(conversation_id))
  );

-- UPDATE нужен ради upsert (on conflict do update) — двигать штамп придётся часто.
create policy conversation_reads_update on public.conversation_reads
  for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
  );

-- DELETE-политики НЕТ: отметку не удаляют, её двигают. Строки уходят каскадом
-- вместе с каналом или профилем.
revoke all on public.conversation_reads from anon;
grant select, insert, update on public.conversation_reads to authenticated;

-- ═══ 6. Сидеры ═══
-- Приём взят у seed_project_columns (baseline) + trg_zz_seed_columns: DEFINER-функция
-- обходит RLS новой таблицы (INSERT-политик у неё нет вообще), `zz_` в имени триггера —
-- порядок исполнения (алфавитный), чтобы сидер шёл после BEFORE-синков и валидаторов.
create or replace function public.seed_general_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.conversations (org_id, kind) values (new.id, 'general')
  on conflict do nothing;  -- partial unique uq_conversations_general_per_org
  return new;
end $$;

revoke all on function public.seed_general_conversation() from public, anon, authenticated;
grant execute on function public.seed_general_conversation() to service_role;

create or replace function public.seed_project_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.conversations (org_id, kind, project_id)
  values (new.org_id, 'project', new.id)
  on conflict do nothing;  -- partial unique uq_conversations_project
  return new;
end $$;

revoke all on function public.seed_project_conversation() from public, anon, authenticated;
grant execute on function public.seed_project_conversation() to service_role;

drop trigger if exists trg_zz_seed_general_conversation on public.organizations;
create trigger trg_zz_seed_general_conversation
  after insert on public.organizations
  for each row execute function public.seed_general_conversation();

drop trigger if exists trg_zz_seed_project_conversation on public.projects;
create trigger trg_zz_seed_project_conversation
  after insert on public.projects
  for each row execute function public.seed_project_conversation();

-- ═══ 7. Бэкфилл ═══
-- Каналы для того, что уже живёт в БД (сидеры покрывают только будущие строки).
insert into public.conversations (org_id, kind)
  select o.id, 'general' from public.organizations o
  on conflict do nothing;

insert into public.conversations (org_id, kind, project_id)
  select p.org_id, 'project', p.id from public.projects p
  on conflict do nothing;

-- Сообщения переносятся С ТЕМИ ЖЕ id — это не косметика: на них ссылается
-- message_reactions.message_id, и сохранение id позволяет перевесить FK (шаг 8) без
-- переписывания строк реакций и без потери данных. Реакций сейчас 0, но приём обязан
-- быть корректным и на непустой таблице.
insert into public.messages (id, org_id, conversation_id, author_id, body, edited_at, created_at)
  select pm.id, pm.org_id, c.id, pm.author_id, pm.body, pm.edited_at, pm.created_at
    from public.project_messages pm
    join public.conversations c on c.project_id = pm.project_id and c.kind = 'project'
  on conflict (id) do nothing;

-- ═══ 8. Перевес FK и политик message_reactions ═══
-- Порядок обязателен: сначала бэкфилл messages (шаг 7), только потом FK — иначе
-- ADD CONSTRAINT не пройдёт валидацию на существующих реакциях.
alter table public.message_reactions
  drop constraint if exists message_reactions_message_id_fkey;
alter table public.message_reactions
  add constraint message_reactions_message_id_fkey
  foreign key (message_id) references public.messages(id) on delete cascade;

-- Политики 068 проверяли видимость сообщения через EXISTS к project_messages —
-- после 095 такой ссылки не станет, а до неё она указывает на устаревшую копию ленты.
-- DROP/CREATE, не ALTER: тело политики меняется целиком.
drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
  for select to authenticated using (
    org_id = (select public.current_org_id())
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id)
  );

drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
  for insert to authenticated with check (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
    and exists (select 1 from public.messages m where m.id = message_reactions.message_id)
  );
-- message_reactions_delete (своя реакция) сообщений не касается — не трогаем.

-- ═══ Комментарии ═══
comment on table public.conversations is
  'CHAT-HUB 1a (094): контейнер сообщений. kind general (один на org) / project (один на '
  'проект) / group / dm (без путей создания до фазы 2). Каналы системные: сидеры '
  'trg_zz_seed_general_conversation + trg_zz_seed_project_conversation, INSERT-политик у '
  'клиента нет. Членство — is_conversation_member(), таблицы участников намеренно нет.';

comment on table public.messages is
  'CHAT-HUB 1a (094): сообщение чата, привязано к conversation (не к проекту). Заменяет '
  'project_messages (067) — id перенесены один-в-один, FK message_reactions перевешен сюда. '
  'Legacy-таблицу сносит 095 после смока. Hard delete, realtime, edited_at = штамп «изм.».';

comment on table public.conversation_reads is
  'CHAT-HUB 1a (094): «докуда дочитал» — (canal, user) → last_read_at. Фундамент '
  'unread-бейджей 1b. Каждый видит и двигает только свою строку; DELETE-политики нет.';
