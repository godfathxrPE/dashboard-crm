-- ═══════════════════════════════════════════════════════
-- 101 — S-DEBT-TRUTH-1: состав группы перестаёт врать.
--
-- ЗАЧЕМ. Комментарий 096 (`conversation_members`, строка ~60) утверждает: «Заполняется
-- ТОЛЬКО для kind='group'; инвариант держит INSERT-политика и RPC». Инвариант там на
-- самом деле ДВА, и держит их только RPC. `create_group_conversation` (096) фильтрует
-- добавляемых по `memberships` (`join … where m.org_id = v_org`), а политика
-- `conversation_members_insert` проверяет `org_id` строки, `kind='group'` канала и права
-- ДОБАВЛЯЮЩЕГО — про добавляемого не проверяет ничего, кроме FK на `public.profiles`.
-- Два механизма под одним именем инварианта реализуют разные правила, а клиент ходит
-- именно политикой: `useAddMembers` делает прямой INSERT, а не RPC.
--
-- ЧТО ЛОМАЕТСЯ. Автор группы кладёт строку с `profile_id` человека, у которого нет
-- `memberships` в этой организации. Утечки нет — `is_conversation_member` сначала
-- сравнивает `org_id` канала с `current_org_id()` читателя, — но состав группы
-- становится ложью: `useConversationMembers` показывает человека в списке, счётчик
-- «N уч.» его считает, сообщений он не получит никогда.
--
-- Обратный порядок опаснее и достижим без консоли: человека снимают с `memberships`,
-- строки `conversation_members` не чистятся (FK стоит на `profiles`, не на
-- `memberships`), и группа продолжает показывать его в составе.
--
-- ЧТО ЗДЕСЬ. Пересоздание политики `conversation_members_insert`: прежние три условия
-- целиком (скопированы из ЖИВОЙ политики через `pg_policies`, не из файла 096 —
-- источник истины тело в БД) плюс четвёртое — добавляемый обязан быть членом
-- организации.
--
-- ⚠️ РЕКУРСИИ НЕТ. Подзапрос идёт к `memberships`, а не к `conversation_members`.
--    Политика `membership_select_own_org` (`profile_id = auth.uid() or
--    is_org_member(org_id)`) на `conversation_members` не ссылается — цикла 42P17,
--    который ловили на `is_meeting_attendee` (071), тут возникнуть не из чего.
--
-- ⚠️ ЛОЖНЫХ ОТКАЗОВ НЕ БУДЕТ. Подзапрос выполняется правами вызывающего, то есть под
--    RLS `memberships`. Добавляющий — сам член org (иначе он не прошёл бы первое
--    условие по `current_org_id()`), а `is_org_member(org_id)` открывает ему все строки
--    своей организации. Значит член org виден ему всегда, и `exists` честен.
--
-- ⚠️ RPC ЭТА ПРАВКА НЕ КАСАЕТСЯ. `create_group_conversation` — SECURITY DEFINER, RLS
--    внутри не действует; свой фильтр по `memberships` у неё уже есть, и он совпадает
--    с новым условием политики. После 101 оба пути наконец описывают одно правило.
--
-- ⚠️ ЧЕГО ЗДЕСЬ НЕТ — И ЭТО РЕШЕНИЕ, А НЕ ЗАБЫВЧИВОСТЬ. Чистки `conversation_members`
--    при снятии `memberships` (триггер AFTER DELETE на `memberships`) в этой миграции
--    нет. 101 закрывает только новые строки; уже осиротевшие остаются, и человек,
--    снятый с org, продолжит числиться в составе групп. Автоудаление молча уносит
--    данные — это отдельное решение, его надо обсуждать, а не протаскивать хвостом
--    к правке политики. Известный остаток S-DEBT-TRUTH-1.
--
-- Схему не меняем: колонок не добавляется ⇒ регенерация типов не нужна.
--
-- ⚠️ НЕ применена — применяет гейт (apply → advisors → ролевые смоки чата).
--
-- Откат — вернуть тело из 096 (то же, без четвёртого условия):
--   drop policy if exists conversation_members_insert on public.conversation_members;
--   create policy conversation_members_insert on public.conversation_members
--     for insert to authenticated
--     with check (
--       org_id = (select public.current_org_id())
--       and exists (
--         select 1 from public.conversations c
--          where c.id = conversation_members.conversation_id
--            and c.kind = 'group'
--            and c.org_id = (select public.current_org_id())
--            and (
--              c.created_by = (select auth.uid())
--              or (select public.current_org_role()) in ('owner','admin')
--            )
--       )
--     );
-- ═══════════════════════════════════════════════════════

drop policy if exists conversation_members_insert on public.conversation_members;

create policy conversation_members_insert on public.conversation_members
  for insert to authenticated
  with check (
    -- ═══ прежние условия 096, без изменений ═══
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
    -- ═══ 101: добавляемый обязан быть членом организации ═══
    -- Ровно тот же фильтр, что уже стоит внутри create_group_conversation. Без него
    -- строка состава могла ссылаться на любой profile: FK смотрит на `profiles`
    -- (справочник всех людей продукта), а не на `memberships` (люди ЭТОЙ org).
    and exists (
      select 1 from public.memberships mm
       where mm.org_id = (select public.current_org_id())
         and mm.profile_id = conversation_members.profile_id
    )
  );

comment on table public.conversation_members is
  'CHAT-HUB 1c (096): состав канала. Заполняется ТОЛЬКО для kind=''group'' — у general '
  'и project членство вычисляется в is_conversation_member() и таблицы не имеет. '
  'Строка появляется и исчезает (UPDATE-политики нет); удаление своей = выход из группы. '
  '101: «участник обязан быть членом org» держат ОБА пути записи — INSERT-политика '
  '(прямой insert из useAddMembers) и create_group_conversation (создание группы). '
  'Осиротевшие строки после снятия memberships не чистятся: FK стоит на profiles, '
  'автоудаления нет намеренно (известный остаток S-DEBT-TRUTH-1).';
