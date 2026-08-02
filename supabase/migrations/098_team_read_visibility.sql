-- ═══════════════════════════════════════════════════════════════════════════
-- 098 — Командная видимость на чтение (S-VIS-A, вариант A)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ЗАЧЕМ. Сегодня менеджер, зайдя в CRM, видит пустую систему: 0 компаний из 260,
-- 0 контактов из 87, 0 лидов, 0 звонков, 0 встреч. SELECT-политики шести таблиц
-- owner-only («роль owner/admin ИЛИ запись моя»), а member-модель из 065 есть
-- только у projects/tasks. Справочник компаний и контактов — общий актив
-- организации, а не личная папка того, кто первым нажал «Создать».
--
-- ЧТО МЕНЯЕТСЯ. Ровно шесть SELECT-политик. Новое тело у всех одинаковое:
--
--     using (org_id = (select public.current_org_id()))
--
-- Роль внутри не проверяется намеренно. `current_org_id()` для пользователя без
-- membership отдаёт NULL, а `org_id = NULL` не истинно ни для одной строки —
-- чужая организация отрезана самим телом, отдельная ветка была бы её копией.
-- Viewer читает всё в пределах своей org: это ровно строка «Viewer — Read All»
-- из RBAC-матрицы проекта.
--
-- ЧТО НЕ МЕНЯЕТСЯ. INSERT / UPDATE / DELETE не тронуты ни на одной таблице:
-- менеджер видит всю базу и правит своё («роль owner/admin ИЛИ владелец строки»).
-- `projects` и `tasks` не тронуты — у них своя member-модель из 065; сделки
-- менеджерам раздаются назначением `owner_id`, это отдельный шаг после мержа.
-- `contact_company.cc_select` и `deal_stakeholders.ds_select` уже org-only.
-- `meeting_attendees.attendees_select_visible` смотрит EXISTS в `meetings` под её
-- RLS — расширится вместе с ней сама, трогать её не нужно.
--
-- ВСТРЕЧИ ТЕРЯЮТ attendee-ЭКСКЛЮЗИВНОСТЬ, И ЭТО НАМЕРЕННО. Ветка
-- `is_meeting_attendee(id)` (071) давала участнику увидеть встречу, которую он не
-- создавал; теперь встречу организации видит вся организация. Календарь команды —
-- это функция, а не утечка: встреча заведена в общей CRM, а не в личном
-- ежедневнике. Побочно уходит единственный коррелированный подзапрос в этих шести
-- политиках (аргумент-зависимый вызов `is_meeting_attendee(id)`, который не лечился
-- initplan-обёрткой).
--
-- ⚠️ СОСЕДНИЙ ПРОБЕЛ, КОТОРЫЙ ЭТА МИГРАЦИЯ НЕ ЗАКРЫВАЕТ. `activities` из списка шести
-- клиентом НЕ читается вообще (`from('activities')` в `src/` — ноль вхождений):
-- расширение там корректно, но невидимо. Ленту «Последние действия» на «Обзоре» и
-- `EntityTimeline` на хабах кормит ДРУГАЯ таблица — `activity_log`, и её политика
-- `Users see own logs` осталась прежней:
--
--     org + (роль owner/admin OR user_id = auth.uid())
--
-- То есть после 098 менеджер увидит компании, контакты, лиды, звонки и встречи, но
-- лента событий у него по-прежнему будет только своя. `activity_log` в шесть таблиц
-- спринта не входила, и расширять её здесь — выйти за согласованный скоуп; фиксирую
-- как хвост к разбору вместе с DIRECTIONS.
--
-- ЧТО ДАЛЬШЕ. Поверх этого слоя ляжет эпик DIRECTIONS (видимость по направлениям)
-- — разбор и отклонённые варианты в `claude/backlog-directions-ownership.md`.
-- Вариант A сознательно принят как предпосылка захода команды, а не как финальная
-- модель доступа.
--
-- ОТКАТ. Шесть `drop policy` + `create policy` с телами ниже (сняты с живой БД
-- 2026-08-02, до применения этой миграции). Все шесть были `for select to public`.
--
--   companies_select:
--     ((org_id = (select current_org_id()))
--      AND (((select current_org_role()) = ANY (ARRAY['owner','admin']))
--           OR (owner_id = (select auth.uid()))
--           OR (created_by = (select auth.uid()))))
--
--   contacts_select:
--     ((org_id = (select current_org_id()))
--      AND (((select current_org_role()) = ANY (ARRAY['owner','admin']))
--           OR (owner_id = (select auth.uid()))
--           OR (created_by = (select auth.uid()))))
--
--   leads_select:
--     ((org_id = (select current_org_id()))
--      AND (((select current_org_role()) = ANY (ARRAY['owner','admin']))
--           OR (user_id = (select auth.uid()))))
--
--   calls_select:
--     ((org_id = (select current_org_id()))
--      AND (((select current_org_role()) = ANY (ARRAY['owner','admin']))
--           OR (created_by = (select auth.uid()))))
--
--   meetings_select:
--     ((org_id = (select current_org_id()))
--      AND (((select current_org_role()) = ANY (ARRAY['owner','admin']))
--           OR (created_by = (select auth.uid()))
--           OR is_meeting_attendee(id)))
--
--   activities_select:
--     ((org_id = (select current_org_id()))
--      AND (((select current_org_role()) = ANY (ARRAY['owner','admin']))
--           OR (created_by = (select auth.uid()))))
--
-- ПРОИЗВОДИТЕЛЬНОСТЬ. Новое тело дешевле старого: остаётся один initplan-вызов
-- `current_org_id()` на запрос, уходят вызов `current_org_role()` и OR-ветки по
-- `owner_id`/`created_by`/`user_id`. Индекс по `(org_id)` есть у всех шести
-- (`idx_companies_org`, `idx_contacts_org`, `idx_leads_org`, `idx_calls_org`,
-- `idx_meetings_org`, `idx_activities_org` — сверено с живой БД).
--
-- Клиентская часть спринта — в отдельном коммите: хуки списков НЕ фильтруются
-- (спискам нужна команда), семантику «мои» держат потребители с личной семантикой
-- (бейдж звонков в сайдбаре, очередь «Сегодня», трекер звонков, KPI-виджеты).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── companies ──────────────────────────────────────────────────────────────
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to public
  using (org_id = (select public.current_org_id()));

-- ── contacts ───────────────────────────────────────────────────────────────
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to public
  using (org_id = (select public.current_org_id()));

-- ── leads ──────────────────────────────────────────────────────────────────
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to public
  using (org_id = (select public.current_org_id()));

-- ── calls ──────────────────────────────────────────────────────────────────
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls
  for select to public
  using (org_id = (select public.current_org_id()));

-- ── meetings ───────────────────────────────────────────────────────────────
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to public
  using (org_id = (select public.current_org_id()));

-- ── activities ─────────────────────────────────────────────────────────────
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select to public
  using (org_id = (select public.current_org_id()));
