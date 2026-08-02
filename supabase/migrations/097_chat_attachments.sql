-- ═══════════════════════════════════════════════════════
-- 097 — CHAT-HUB фаза 1d: вложения в сообщениях.
--
-- ЗАЧЕМ СЕЙЧАС. 1a дала модель, 1b — раздел /chat, 1c — группы. Чат без файлов
-- заканчивается тем, что скрин отправляют в мессенджер, а обсуждение уезжает туда же.
--
-- ЧТО ЗДЕСЬ. Приватный бакет `chat-files`, хелпер доступа к его объектам, три политики
-- на `storage.objects`, таблица метаданных `message_attachments` и ослабление CHECK на
-- `messages.body` (сообщение может быть из одного файла).
--
-- ⚠️ ЧЕМ ЭТОТ БАКЕТ ОТЛИЧАЕТСЯ ОТ `project-files` (055) — ГЛАВНОЕ РЕШЕНИЕ МИГРАЦИИ.
--    У `project-files` политики **own-path**: `(storage.foldername(name))[1] = auth.uid()`,
--    то есть файл читает ровно тот, кто его загрузил. Для чата это неприменимо: вложение
--    обязан видеть ВЕСЬ канал, иначе картинка в общем чате видна одному человеку.
--    Поэтому путь начинается не с пользователя, а с КАНАЛА:
--      <conversation_id>/<message_id>/<uuid>.<ext>
--    и доступ проверяется той же `is_conversation_member()`, что гейтит всё остальное
--    в чате. Один источник правды: кто видит канал — видит его вложения.
--
--    Первый сегмент — `conversation_id`, а не `message_id`, специально: объект грузится
--    ДО вставки сообщения (иначе путь неоткуда взять), и на момент загрузки строки
--    сообщения ещё нет — проверить членство можно только по каналу.
--
-- ⚠️ КАСТ ПУТИ — ТОЛЬКО ЧЕРЕЗ ХЕЛПЕР. Написать `((storage.foldername(name))[1])::uuid`
--    прямо в политике нельзя: объект с битым первым сегментом уронил бы весь запрос на
--    `22P02 invalid_text_representation` вместо честного отказа. Разбор живёт в
--    `can_access_chat_file()` под перехватом исключения — fail closed.
--
-- ⚠️ НЕ применена — применяет гейт (apply → advisors → смоки Storage → gen-types).
--
-- Откат:
--   alter table public.messages drop constraint if exists messages_body_check;
--   alter table public.messages add constraint messages_body_check
--     check (length(body) >= 1 and length(body) <= 4000);
--   alter publication supabase_realtime drop table public.message_attachments;
--   drop table if exists public.message_attachments;
--   drop policy if exists "chat_files_select" on storage.objects;
--   drop policy if exists "chat_files_insert" on storage.objects;
--   drop policy if exists "chat_files_delete" on storage.objects;
--   drop function if exists public.can_access_chat_file(text);
--   -- объекты бакета удалить руками, затем: delete from storage.buckets where id = 'chat-files';
-- ═══════════════════════════════════════════════════════

-- ═══ 1. Бакет ═══
-- 25 МБ против 50 у `project-files` — сознательно: чат не файловое хранилище, тяжёлое
-- место живёт в проекте. `on conflict do update` делает шаг идемпотентным (приём 055,
-- там же он написан как UPDATE — бакет уже существовал; здесь бакета нет, разведка
-- живой БД 2026-08-02: только `avatars` и `project-files`).
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)
on conflict (id) do update
  set public = false, file_size_limit = 26214400;

-- ═══ 2. can_access_chat_file(text) ═══
-- Предикат политик бакета. DEFINER — как у всех хелперов видимости проекта: внутри
-- зовётся `is_conversation_member()`, которая читает `conversations` в обход RLS
-- (иначе рекурсия, урок 071).
create or replace function public.can_access_chat_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_conv uuid;
begin
  begin
    -- Первый сегмент пути = id канала. Пустой путь даёт NULL (не исключение) —
    -- его ловит проверка ниже; мусор вместо uuid даёт 22P02 — его ловит exception.
    v_conv := ((storage.foldername(p_name))[1])::uuid;
  exception when invalid_text_representation or others then
    -- Fail closed. `others` здесь не лень: это предикат доступа, и любая
    -- неожиданность обязана читаться как «нельзя», а не ронять запрос листинга
    -- бакета целиком из-за одного кривого объекта.
    return false;
  end;

  if v_conv is null then
    return false;
  end if;

  -- coalesce — та же причина, что в самой is_conversation_member: функция обязана
  -- отдавать boolean, а не «может быть» (урок 094).
  return coalesce(public.is_conversation_member(v_conv), false);
end $$;

revoke all on function public.can_access_chat_file(text) from public, anon;
grant execute on function public.can_access_chat_file(text) to authenticated, service_role;

comment on function public.can_access_chat_file(text) is
  'CHAT-HUB 1d (097): доступ к объекту бакета chat-files. Путь — '
  '<conversation_id>/<message_id>/<uuid>.<ext>; членство проверяет is_conversation_member() '
  'по первому сегменту. Битый путь = false (fail closed), а не 22P02.';

-- ═══ 3. Политики storage.objects для chat-files ═══
-- Каноничные имена + предваряющий drop — идемпотентность (приём 055).
-- `can_access_chat_file(name)` в `(select …)` НЕ заворачивается: аргумент зависит от
-- строки, и обёртка дала бы коррелированный подзапрос, а не initplan (тот же случай,
-- что `is_meeting_attendee(id)` в meetings_select — записано в конвенциях проекта).
drop policy if exists "chat_files_select" on storage.objects;
create policy "chat_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.can_access_chat_file(name));

drop policy if exists "chat_files_insert" on storage.objects;
create policy "chat_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_access_chat_file(name));

-- DELETE = членство в канале ПЛЮС авторство объекта (правка гейта Cowork 2026-08-02).
--
-- Исходный вариант спринта проверял только членство, и это давало асимметрию с таблицей:
-- `message_attachments_delete` пускает «свои + org owner/admin», а бакет пускал бы любого
-- участника канала. Побеждала бы политика бакета — она про сами байты. Участник, который
-- НЕ может удалить чужое сообщение, мог бы стереть приложенный к нему файл, и строка
-- `message_attachments` осталась бы указывать в пустоту: битое вложение у всех в канале.
--
-- Авторства в ПУТИ действительно нет — но оно есть в самой строке `storage.objects.owner`
-- (Supabase проставляет его на upload; проверено на живых объектах 2026-08-02). Сравнение
-- колонки бесплатно, EXISTS к таблице не нужен, и права совпадают с табличными.
drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and public.can_access_chat_file(name)
    and (
      owner = (select auth.uid())
      or (select public.current_org_role()) in ('owner','admin')
    )
  );

-- UPDATE-политики нет: объект не правят, его заменяют новым (upsert по тому же пути
-- невозможен — имя содержит свежий uuid).

-- ═══ 4. message_attachments ═══
-- Роль та же, что у `project_files` рядом с бакетом: Storage хранит байты, БД — имя,
-- размер, mime и связь с сообщением.
create table if not exists public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  message_id   uuid not null references public.messages(id)      on delete cascade,
  -- unique: две строки на один объект означали бы, что удаление одной оставит
  -- висящую ссылку на уже снесённые байты.
  storage_path text not null unique,
  -- Исходное имя файла живёт ТОЛЬКО здесь. Ключ хранилища из него не строится никогда:
  -- кириллица, пробелы и `../` в имени — это проблема ключа, а не отображения.
  file_name    text not null check (char_length(file_name) between 1 and 255),
  file_size    bigint,
  mime_type    text,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_message_attachments_message on public.message_attachments(message_id);
create index if not exists idx_message_attachments_org     on public.message_attachments(org_id);

drop trigger if exists trg_set_org_id on public.message_attachments;
create trigger trg_set_org_id
  before insert on public.message_attachments
  for each row execute function public.set_org_id();

-- Заморозка org_id руками — автоцикл 054 покрыл только таблицы, жившие на его момент.
drop trigger if exists trg_aa_freeze_org_id on public.message_attachments;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.message_attachments
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

alter table public.message_attachments enable row level security;

-- SELECT: видимость зеркалит видимость сообщения. EXISTS к `messages` идёт под её
-- собственной RLS (messages_select → is_conversation_member) — приём политик реакций 068.
create policy message_attachments_select on public.message_attachments
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and exists (
      select 1 from public.messages m where m.id = message_attachments.message_id
    )
  );

-- INSERT: вложение цепляют только к СВОЕМУ сообщению. Без `m.author_id = auth.uid()`
-- любой участник канала мог бы дописать файл в чужой пузырь — визуально это выглядело
-- бы как «он это отправил».
create policy message_attachments_insert on public.message_attachments
  for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.messages m
       where m.id = message_attachments.message_id
         and m.author_id = (select auth.uid())
    )
  );

-- DELETE: свои + модерация org owner/admin — те же права, что на само сообщение (094).
-- Строки уходят и каскадом, когда сносят сообщение.
create policy message_attachments_delete on public.message_attachments
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      created_by = (select auth.uid())
      or (select public.current_org_role()) in ('owner','admin')
    )
  );

-- UPDATE-политики НЕТ: метаданные файла не правят — файл появляется и исчезает.
revoke all on public.message_attachments from anon;
grant select, insert, delete on public.message_attachments to authenticated;

-- Realtime: вложение должно доезжать вместе с сообщением. Без подписки чужая лента
-- показала бы пузырь без файла до следующего рефетча.
-- Guard как в 068/092/094/096: голый `add table` падает на повторном apply.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'message_attachments'
  ) then
    alter publication supabase_realtime add table public.message_attachments;
  end if;
end $$;

-- ═══ 5. messages.body — пустое тело становится валидным ═══
-- Имя констрейнта сверено с живой схемой (pg_constraint, 2026-08-02):
--   messages_body_check → CHECK ((length(body) >= 1) AND (length(body) <= 4000))
-- Нижняя граница снимается: сообщение может состоять из одного файла, и заставлять
-- писать «вот» рядом со скриншотом — это не инвариант, а раздражение.
--
-- Инвариант «есть текст ИЛИ вложение» в БД НЕ выражается: это кросс-табличное условие
-- (`messages` × `message_attachments`), а CHECK видит одну строку, и вложения вставляются
-- ПОСЛЕ сообщения — на момент проверки их ещё нет физически. Держит его UI (кнопка
-- «Отправить» неактивна без текста и без файлов). Тот же класс ограничений, что «автора
-- не убирают из группы» в 096: живёт в интерфейсе осознанно, а не по недосмотру.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000);

-- ═══ Комментарии ═══
comment on table public.message_attachments is
  'CHAT-HUB 1d (097): метаданные вложения сообщения (байты — в бакете chat-files). '
  'Видимость зеркалит сообщение; цеплять файл можно только к своему сообщению. '
  'Каскад от messages уносит строки, но НЕ объекты Storage — их удаляет клиент перед '
  'удалением сообщения (тот же приём, что в use-project-files).';

comment on column public.message_attachments.storage_path is
  'Ключ объекта: <conversation_id>/<message_id>/<uuid>.<ext>. Из file_name НИКОГДА не '
  'строится. Первый сегмент — канал: на нём стоит проверка доступа can_access_chat_file().';
