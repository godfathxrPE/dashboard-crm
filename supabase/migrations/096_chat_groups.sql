-- ═══════════════════════════════════════════════════════
-- 096 — CHAT-HUB фаза 1c: произвольные группы (каналы, которые заводит человек).
--
-- ЗАЧЕМ СЕЙЧАС. 1a дала модель (conversations/messages/conversation_reads), 1b — раздел
-- /chat с общим каналом и автоканалами проектов. Оба типа каналов СИСТЕМНЫЕ: их заводят
-- сидеры, состав вычисляется. Не хватает третьего — группы с названием и составом,
-- которую собирают руками под задачу, не привязанную к проекту.
--
-- ЧТО ЗДЕСЬ. Таблица участников `conversation_members` (только для kind='group'),
-- `conversations.updated_at` + триггер, инвариант «у группы есть заголовок»,
-- переписанный хвост `is_conversation_member()`, политики UPDATE/DELETE на группы
-- и RPC `create_group_conversation()`.
--
-- ПОЧЕМУ УЧАСТНИКИ ТОЛЬКО У ГРУПП. Для general/project членство по-прежнему
-- ВЫЧИСЛЯЕТСЯ (вся org / зеркало видимости проекта). Скопировать состав проекта в
-- таблицу участников канала — это второй источник истины с ручной синхронизацией;
-- урок companies.phone ↔ phones[], и ровно поэтому в 094 таблицы участников не было.
--
-- ПОЧЕМУ СОЗДАНИЕ ЧЕРЕЗ RPC, А НЕ INSERT-ПОЛИТИКОЙ. Создание группы — это вставка
-- канала ПЛЮС N строк участников. Без атомарности отвалившийся второй шаг оставляет
-- группу, в которую не входит никто, включая автора (членство группы вычисляется по
-- таблице участников). Заодно сохраняется инвариант 094: второго, неконтролируемого
-- пути создания каналов не появляется, `kind` навсегда остаётся под контролем БД.
--
-- ⚠️ САМАЯ РИСКОВАННАЯ ПРАВКА — §3, `create or replace is_conversation_member`.
--    Функция гейтит доступ ко ВСЕМ каналам (её зовут conversations_select,
--    messages_select/insert, conversation_reads_*), а не только к группам. Ветки
--    'general' и 'project' скопированы из 094 БЕЗ ИЗМЕНЕНИЙ (сверять диффом);
--    меняется только хвост, где раньше стоял безусловный `return false`.
--    Смок после apply — по ВСЕМ типам каналов, не только по группам.
--
-- ⚠️ ОБЛАСТЬ ДЕЙСТВИЯ «org owner/admin управляет группой» (осознанное ограничение).
--    Политики UPDATE/DELETE на conversations и INSERT/DELETE на conversation_members
--    пускают автора ИЛИ org owner/admin. Но owner/admin, который НЕ состоит в группе,
--    не видит её строку (conversations_select требует is_conversation_member, а
--    группа-ветка — это ровно членство), и Postgres применяет SELECT-политику к
--    UPDATE/DELETE с WHERE. Итог: администратор модерирует те группы, в которых он
--    состоит. Расширять группа-ветку хелпера до «owner/admin видит все группы» —
--    отдельное продуктовое решение (это доступ ко всей приватной переписке org),
--    и в 1c оно НЕ принималось.
--
-- ⚠️ НЕ применена — применяет гейт (apply → advisors → ролевые смоки → gen-types).
--
-- Откат:
--   drop function if exists public.create_group_conversation(text, uuid[]);
--   drop policy if exists conversations_update_group on public.conversations;
--   drop policy if exists conversations_delete_group on public.conversations;
--   revoke update, delete on public.conversations from authenticated;
--   drop trigger if exists trg_set_updated_at on public.conversations;
--   alter table public.conversations drop constraint if exists conversations_group_title_chk;
--   alter table public.conversations drop column if exists updated_at;
--   alter publication supabase_realtime drop table public.conversation_members;
--   drop table if exists public.conversation_members;
--   -- вернуть тело is_conversation_member из 094 (хвост: return false для group/dm)
-- ═══════════════════════════════════════════════════════

-- ═══ 1. conversation_members ═══
-- PK по паре — участник в канале ровно один, `on conflict do nothing` в RPC по нему
-- идемпотентен. Заполняется ТОЛЬКО для kind='group' (см. шапку); инвариант держит
-- INSERT-политика и RPC, а не CHECK: CHECK не может смотреть в другую таблицу.
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- profiles, НЕ auth.users — конвенция проекта.
  profile_id      uuid not null references public.profiles(id)      on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- SET NULL: строка участника переживает ушедшего из org автора добавления.
  added_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

-- (profile_id) — «мои группы» (по нему ходит хвост is_conversation_member).
-- (org_id) — как на всех org-таблицах проекта.
create index if not exists idx_conversation_members_profile on public.conversation_members(profile_id);
create index if not exists idx_conversation_members_org     on public.conversation_members(org_id);

-- org_id из UI не приходит (клиент шлёт только conversation_id + profile_id) — ставит
-- триггер; RPC передаёт его явно, и тогда триггер просто не срабатывает (set_org_id
-- пишет только в NULL).
drop trigger if exists trg_set_org_id on public.conversation_members;
create trigger trg_set_org_id
  before insert on public.conversation_members
  for each row execute function public.set_org_id();

-- Заморозка org_id — руками: автоцикл 054 покрыл только таблицы, жившие на его момент.
-- Префикс `aa_` не косметика — порядок триггеров в Postgres алфавитный.
drop trigger if exists trg_aa_freeze_org_id on public.conversation_members;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.conversation_members
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

alter table public.conversation_members enable row level security;

-- Realtime: без него добавленный в группу человек узнаёт о ней только по рефетчу
-- (staleTime списка каналов — 60 с). Список инвалидируется на события `messages`, а у
-- свежей группы сообщений ещё нет — ровно тот случай, когда канал появляется молча.
-- REPLICA IDENTITY FULL не ставим: DELETE-событие без него несёт только PK, и Realtime
-- не сможет проверить по нему RLS → «меня удалили из группы» долетит не всегда, а
-- рефетчем это чинится. Важен INSERT («меня добавили»), и он приезжает.
-- Guard как в 068/092/094: голый `add table` падает на повторном apply.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;

-- ═══ 2. conversations: updated_at + инвариант заголовка ═══
-- В 094 колонки не было намеренно: у таблицы не существовало UPDATE-пути вообще, и
-- штамп, который некому двигать, — мусор. 1c заводит переименование — колонка приходит
-- вместе с ним, ровно как было записано в шапке 094.
alter table public.conversations
  add column if not exists updated_at timestamptz not null default now();

-- Общий триггер проекта — `update_updated_at()` (baseline). Имя именно такое:
-- `set_updated_at` в схеме НЕТ. Расширения moddatetime в проекте тоже нет.
drop trigger if exists trg_set_updated_at on public.conversations;
create trigger trg_set_updated_at
  before update on public.conversations
  for each row execute function public.update_updated_at();

-- У группы заголовок обязателен: он единственный способ её назвать (у general он
-- константа в коде, у project — имя проекта). Существующие строки (general + project)
-- под условие не попадают — валидация ADD CONSTRAINT пройдёт.
alter table public.conversations
  drop constraint if exists conversations_group_title_chk;
alter table public.conversations
  add constraint conversations_group_title_chk
  check (kind <> 'group' or title is not null);

-- ═══ 3. is_conversation_member(uuid) — замена хвоста ═══
-- ⚠️ Ветки 'general' и 'project' — ПОБУКВЕННАЯ копия 094 (включая coalesce(…, false)
--    на project: у юзера без membership current_org_role() отдаёт NULL, и без coalesce
--    вся цепочка вернула бы NULL вместо boolean). Меняется ровно хвост.
-- Сигнатура, stable, security definer, search_path, ACL — те же, что в 094.
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
  -- coalesce не для красоты: у юзера без membership current_org_role() вернёт NULL,
  -- и вся цепочка `NULL or false or false` даст NULL. В политике NULL и так читается
  -- как отказ, но функция обязана отдавать boolean, а не «может быть».
  if v_kind = 'project' then
    return coalesce(
             public.current_org_role() in ('owner','admin')
             or exists (
                  select 1 from public.projects p
                   where p.id = v_project_id
                     and (p.owner_id = auth.uid() or p.created_by = auth.uid())
                )
             or public.is_project_member(v_project_id),
             false
           );
  end if;

  -- group/dm (096): членство ЯВНОЕ — строка в conversation_members. dm в той же ветке
  -- намеренно: механика членства у него та же, а путей создания у dm по-прежнему нет,
  -- так что ветка для него пока недостижима. `exists` NULL-safe сам: при пустой сессии
  -- auth.uid() = NULL, сравнение не совпадёт ни с одной строкой → false, не NULL.
  -- RLS самой conversation_members здесь не мешает: функция DEFINER (владелец postgres),
  -- иначе SELECT-политика участников звала бы эту же функцию — 42P17 (урок 071).
  if v_kind in ('group','dm') then
    return exists (
      select 1 from public.conversation_members m
       where m.conversation_id = p_conversation_id
         and m.profile_id = auth.uid()
    );
  end if;

  return false;
end $$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;

comment on function public.is_conversation_member(uuid) is
  'CHAT-HUB 1c (096): членство в канале. general = вся org; project = зеркало видимости '
  'проекта (067) — обе ветки без изменений с 094; group/dm = строка в conversation_members.';

-- ═══ 4. Политики conversation_members ═══
-- SELECT: состав канала виден его участникам — списку участников в GroupModal нужны
-- имена, а не только количество. Чужак не пройдёт: is_conversation_member для группы
-- это и есть «есть моя строка».
create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.is_conversation_member(conversation_id))
  );

-- INSERT: добавлять участников может автор канала или org owner/admin, и только в
-- ГРУППУ. kind='group' в EXISTS — тот самый инвариант «участники только у групп»:
-- без него можно было бы завести строку участника на общий канал, и она молча
-- расширила бы группа-ветку хелпера на чужой kind.
create policy conversation_members_insert on public.conversation_members
  for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_members.conversation_id
         and c.kind = 'group'
         and c.org_id = (select public.current_org_id())
         and (
           c.created_by = (select auth.uid())
           or (select public.current_org_role()) in ('owner','admin')
         )
    )
  );

-- DELETE: те же (автор / owner-admin) ПЛЮС «выйти самому». Выход участника — это
-- удаление своей строки, отдельного механизма нет.
-- Автору выход запрещает UI, а не политика: created_by у канала не меняется, и вышедший
-- автор сохранил бы право управлять группой, которую перестал видеть. Держать этот
-- запрет в БД пришлось бы условием на created_by в DELETE-политике — а тогда автор,
-- которого добавили обратно, тоже не смог бы выйти. Ограничение UI-уровня, записано.
create policy conversation_members_delete on public.conversation_members
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      profile_id = (select auth.uid())
      or exists (
        select 1 from public.conversations c
         where c.id = conversation_members.conversation_id
           and c.kind = 'group'
           and c.org_id = (select public.current_org_id())
           and (
             c.created_by = (select auth.uid())
             or (select public.current_org_role()) in ('owner','admin')
           )
      )
    )
  );

-- UPDATE-политики НЕТ: строка участника не редактируется — она появляется и исчезает.
revoke all on public.conversation_members from anon;
grant select, insert, delete on public.conversation_members to authenticated;

-- ═══ 5. Политики conversations: UPDATE/DELETE только на группы ═══
-- kind = 'group' в USING отсекает general и project при любом раскладе: переименовать
-- или снести общий канал/канал проекта нельзя даже owner'у.
create policy conversations_update_group on public.conversations
  for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and kind = 'group'
    and (
      created_by = (select auth.uid())
      or (select public.current_org_role()) in ('owner','admin')
    )
  )
  -- WITH CHECK зеркалит USING: `kind = 'group'` здесь не дубль, а запрет превратить
  -- группу в общий канал переименованием (и, через CHECK conversations_project_kind_chk,
  -- запрет подсунуть project_id). `created_by` в условии не даёт рядовому автору
  -- переписать авторство на другого.
  with check (
    org_id = (select public.current_org_id())
    and kind = 'group'
    and (
      created_by = (select auth.uid())
      or (select public.current_org_role()) in ('owner','admin')
    )
  );

-- DELETE: hard delete, сообщения и участники уходят каскадом (конвенция проекта —
-- инфраструктуры deleted_at нет ни у одной таблицы).
create policy conversations_delete_group on public.conversations
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and kind = 'group'
    and (
      created_by = (select auth.uid())
      or (select public.current_org_role()) in ('owner','admin')
    )
  );

-- INSERT-политики по-прежнему НЕТ: единственный путь создания канала — RPC ниже.
grant update, delete on public.conversations to authenticated;  -- select выдан в 094

-- ═══ 6. create_group_conversation(text, uuid[]) ═══
-- Каркас — create_webhook_endpoint (088): DEFINER + фиксированный search_path + ручной
-- гейт (DEFINER обходит RLS, значит проверять права обязана сама функция) + адресный ACL.
-- Отличие от 088: роль owner/admin НЕ требуется — группу заводит любой член org.
create or replace function public.create_group_conversation(
  p_title      text,
  p_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := ( select public.current_org_id() );
  v_uid   uuid := ( select auth.uid() );
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id    uuid;
begin
  -- Гейт. NULL-safe: у сессии без активной org current_org_id() отдаёт NULL, и без
  -- явной проверки INSERT упал бы на NOT NULL с невнятным 23502 вместо 42501 (урок 094).
  if v_uid is null or v_org is null then
    raise exception 'group_denied: no active org' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.org_id = v_org and m.profile_id = v_uid
  ) then
    raise exception 'group_denied: not an org member' using errcode = '42501';
  end if;

  -- Нормализация до вставки: в БД уезжает уже подрезанный заголовок, чтобы CHECK
  -- conversations (length 1..120) и валидатор UI мерили одну и ту же строку.
  if v_title is null or char_length(v_title) > 120 then
    raise exception 'group_title_invalid: название 1..120 символов' using errcode = '22023';
  end if;

  insert into public.conversations (org_id, kind, title, created_by)
  values (v_org, 'group', v_title, v_uid)
  returning id into v_id;

  -- Автор — участник ВСЕГДА и первым: членство группы вычисляется по этой таблице, и
  -- без своей строки создатель не увидел бы собственную группу. Отдельного сидер-триггера
  -- на автора не заводим — вставка внутри той же транзакции и так атомарна, а триггер
  -- был бы ещё одним невидимым путём.
  insert into public.conversation_members (conversation_id, profile_id, org_id, added_by)
  values (v_id, v_uid, v_org, v_uid)
  on conflict do nothing;

  -- Чужие id молча отбрасываются (join по memberships), а не роняют вызов: список
  -- участников приходит из UI, где состав команды мог устареть между рендером и
  -- отправкой, и падение всей группы из-за одного ушедшего человека — плохой размен.
  insert into public.conversation_members (conversation_id, profile_id, org_id, added_by)
  select v_id, m.profile_id, v_org, v_uid
    from public.memberships m
   where m.org_id = v_org
     and m.profile_id = any (coalesce(p_member_ids, '{}'::uuid[]))
  on conflict do nothing;

  return v_id;
end $$;

revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

comment on function public.create_group_conversation(text, uuid[]) is
  'CHAT-HUB 1c (096): создаёт группу (conversations.kind=''group'') и её состав одной '
  'транзакцией — INSERT-политики у conversations нет намеренно, это единственный путь '
  'создания канала клиентом. Автор добавляется участником всегда; чужие p_member_ids '
  'отбрасываются по memberships. Гейт «член org» — внутри, DEFINER обходит RLS.';

-- ═══ Комментарии ═══
comment on table public.conversation_members is
  'CHAT-HUB 1c (096): состав канала. Заполняется ТОЛЬКО для kind=''group'' — у general '
  'и project членство вычисляется в is_conversation_member() и таблицы не имеет. '
  'Строка появляется и исчезает (UPDATE-политики нет); удаление своей = выход из группы.';

comment on column public.conversations.updated_at is
  'CHAT-HUB 1c (096): штамп правки, двигает trg_set_updated_at. Меняется только у групп — '
  'UPDATE-политика есть только на них.';
