-- ═══════════════════════════════════════════════════════
-- 100 — S-CHAT-AUDIT-1: `messages.edited_at` перестаёт быть клиентским полем.
--
-- ЗАЧЕМ. Штамп «· изм.» подаётся человеку как признак того, что реплику правили после
-- отправки. До этой миграции его ставил клиент (`use-messages.ts`, `useEditMessage`:
-- `.update({ body, edited_at: new Date().toISOString() })`), а колонка (094:179) не имела
-- ни DEFAULT, ни триггера. Политика `messages_update` (094) проверяет только `org_id` и
-- `author_id` и НЕ сравнивает новое значение со старым — значит автор одним запросом
-- менял тело и слал `edited_at: null`, после чего сообщение становилось неотличимо от
-- исходного. Второй копии текста нет нигде: `activity_log` сообщения не пишет, истории
-- правок у чата нет. Признак, который показывают пользователю, обязан ставить сервер.
--
-- ЧТО ЗДЕСЬ. Триггерная функция `public.set_message_edited_at()` + BEFORE UPDATE триггер
-- `trg_set_edited_at` на `public.messages`, плюс обновлённый комментарий колонки.
--
-- ⚠️ ЗНАЧЕНИЕ ИЗ PAYLOAD ЗАТИРАЕТСЯ В ОБЕИХ ВЕТКАХ — В ЭТОМ ВЕСЬ СМЫСЛ.
--    Тело изменилось → `now()`. Тело не изменилось → `old.edited_at` (правка соседних
--    полей штамп не двигает). Третьей ветки, где до колонки доходит клиентское значение,
--    нет: иначе обнуление возвращается ровно тем же запросом, что и раньше.
--
-- ⚠️ ИМЯ ТРИГГЕРА БЕЗ ПРЕФИКСОВ `aa_`/`zz_` — ОСОЗНАННО.
--    На `messages` уже висят `trg_aa_freeze_org_id` (BEFORE UPDATE OF org_id) и
--    `trg_set_org_id` (BEFORE INSERT). Порядок BEFORE-триггеров у Postgres алфавитный;
--    `trg_set_edited_at` встаёт между ними и ни с одним не пересекается: freeze трогает
--    только `org_id` и срабатывает лишь при его изменении, set_org_id — вообще на INSERT.
--    Префикс нужен там, где триггеры спорят за одно поле (грабля стадий: два синка на
--    `stage_id`); здесь спорить не о чем, и лишний префикс сделал бы вид, что есть
--    зависимость, которой нет.
--
-- ⚠️ ФУНКЦИЯ ТРИГГЕРНАЯ — КЛИЕНТ ЕЁ НЕ ЗОВЁТ. Отсюда ACL без `authenticated`:
--    EXECUTE проверяется при `CREATE TRIGGER`, а не при срабатывании (learnings), так
--    что триггер работает и без гранта вызывающему.
--
-- Схему не меняем: колонок не добавляется ⇒ регенерация типов не нужна.
--
-- ⚠️ НЕ применена — применяет гейт (apply → advisors → ролевые смоки чата).
--
-- Откат:
--   drop trigger if exists trg_set_edited_at on public.messages;
--   drop function if exists public.set_message_edited_at();
-- ═══════════════════════════════════════════════════════

create or replace function public.set_message_edited_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.body is distinct from old.body then
    -- Правка тела — единственное, что считается «изменением» для человека.
    new.edited_at := now();
  else
    -- Всё остальное (в том числе будущие колонки) штамп не двигает. Присваивание
    -- обязательно: без него сюда доехало бы значение из payload клиента.
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;

revoke all on function public.set_message_edited_at() from public, anon, authenticated;
grant execute on function public.set_message_edited_at() to service_role;

comment on function public.set_message_edited_at() is
  'S-CHAT-AUDIT-1 (100): серверный штамп messages.edited_at. now() при изменении body, '
  'иначе прежнее значение. Клиентское значение игнорируется всегда — подделать или '
  'обнулить пометку «изм.» нельзя.';

drop trigger if exists trg_set_edited_at on public.messages;
create trigger trg_set_edited_at
  before update on public.messages
  for each row execute function public.set_message_edited_at();

comment on column public.messages.edited_at is
  'Штамп правки («· изм.» в ленте). Ставит триггер trg_set_edited_at (100) при изменении '
  'body; значение из клиентского payload игнорируется — messages_update не сравнивает '
  'старое и новое, и без триггера автор мог бы обнулить пометку тем же запросом, '
  'которым правит текст.';
