-- ═══════════════════════════════════════════════════════
-- 127 — S-AI-OBS-1: `ai_runs` перестаёт быть слепым на `ai-capture`.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260821211823 org_export` (126) ⇒ 127. Грепом по
--    номеру ledger не сверяется: 069–073 записаны без числового префикса, а имена
--    после 086 префикс потеряли вовсе.
--
-- ПОЧЕМУ. Вывод разбора AI-контура 21.08 «из семи пресетов живёт один, AI повёрнут
-- наружу» построен на этом логе и неверен ПО ИСТОЧНИКУ: `ai-capture` — то есть вся
-- AI-работа по СОБСТВЕННЫМ данным (резолв исполнителя, сделки, компании по
-- справочникам), встроенная в поток ввода, — не журналировалась вообще. Только за
-- 19–21.08 мимо лога прошло ≥14 разборов (столько черновиков в
-- `telegram_capture_drafts`) плюс неизвестное число из веб-виджета. Пока лог слеп,
-- любая статистика по AI врёт в одну сторону.
--
-- ═══ ЧТО ИМЕННО БЛОКИРОВАЛО ЗАПИСЬ ═══
--
-- Контекст-документ спринта называл ДВА механизма, разведка БД нашла ЧЕТЫРЕ,
-- а `pg_policies` — ещё ДВА. Итого шесть, и последние два дороже всех остальных,
-- потому что не роняют вставку, а делают строку НЕВИДИМОЙ:
--
--   1. entity_id   NOT NULL              — capture работает ДО появления сущности
--   2. entity_type NOT NULL              — то же
--   3. CHECK ai_runs_entity_type_check   — IN (call, meeting, project, company)
--   4. CHECK ai_runs_transcript_required — transcript_id NOT NULL OR preset_key IN (5 шт)
--   5. POLICY ai_runs_insert  — WITH CHECK требует EXISTS по calls/meetings/projects/
--      companies на `entity_id`; строка capture не проходит НИ ОДНУ ветку
--   6. POLICY ai_runs_select  — тот же перебор четырёх сущностей в USING
--
-- ⚠️ ПУНКТ 6 — ГЛАВНЫЙ, И ЕГО ЛЕГКО ПРОГЛЯДЕТЬ. Без него запись из сервисной роли
--    (бот) прошла бы мимо RLS и в таблице лежала бы, а приложение и владелец
--    организации не увидели бы ни одной строки: `ai_runs_select` перечисляет
--    сущностные ветки, и `entity_type = 'capture'` не совпадает ни с одной.
--    Контрольный запрос гейта под `postgres` при этом показал бы «строки есть» —
--    то есть смок бы прошёл, а фича осталась бы слепой ровно там, ради чего
--    затевалась. Обе политики переписываются целиком — тем же способом, что 104.
--
-- ═══ ИЗМЕНЕНИЕ АДДИТИВНОЕ ═══
--
-- Расширяем допустимое, не сужаем: все 34 существующие строки под старые правила
-- по-прежнему проходят (сверено запросом — у всех `entity_type`/`entity_id`
-- заполнены, строк с пустой парой нет ни одной).
--
-- ═══ ПОЧЕМУ CAPTURE ПИШЕТСЯ ОДНОЙ ВСТАВКОЙ СО СТАТУСОМ done/error ═══
--
-- Не так, как `ai-run` (INSERT `pending` → работа → UPDATE): capture синхронный,
-- к моменту записи результат уже есть. Одна вставка вместо двух — и, что важнее,
-- строка НЕ ПОПАДАЕТ под частичный уникальный индекс
--   ux_ai_runs_active_entity (entity_type, entity_id, preset_key)
--     WHERE transcript_id IS NULL AND status IN ('pending','running')
-- Параллельные разборы не будут блокировать друг друга даже теоретически.
-- (Побочно: при `entity_id = NULL` уникальность и так не сработала бы —
-- `NULL <> NULL`, — но опираться на это не нужно: строку выводит из-под индекса
-- сам статус.)
-- ═══════════════════════════════════════════════════════

-- ── 1–2. Снятие NOT NULL ────────────────────────────────────────────────
alter table public.ai_runs alter column entity_id   drop not null;
alter table public.ai_runs alter column entity_type drop not null;

-- ── 3. Тип сущности: пятое значение ─────────────────────────────────────
-- Откат: значения были ('call','meeting','project','company') — редакция 104.
alter table public.ai_runs drop constraint if exists ai_runs_entity_type_check;
alter table public.ai_runs add  constraint ai_runs_entity_type_check
  check (
    entity_type is null
    or entity_type in ('call', 'meeting', 'project', 'company', 'capture')
  );

-- ── 4. Пресет без транскрипта: шестой ключ ──────────────────────────────
-- Откат: ключи были ('deal_progression','analytic_note','meeting_prep',
-- 'deal_summary','company_brief') — редакция 104.
alter table public.ai_runs drop constraint if exists ai_runs_transcript_required;
alter table public.ai_runs add  constraint ai_runs_transcript_required
  check (
    transcript_id is not null
    or preset_key in (
      'deal_progression', 'analytic_note', 'meeting_prep',
      'deal_summary', 'company_brief', 'capture'
    )
  );

-- ── Защита от расползания снятого NOT NULL ──────────────────────────────
-- Сущностные прогоны обязаны нести ОБЕ координаты: снятие сделано ради capture,
-- а не ради возможности потерять привязку у call/meeting/project/company.
alter table public.ai_runs add constraint ai_runs_entity_pair_or_capture
  check (
    (entity_type = 'capture' and entity_id is null)
    or (entity_type is not null and entity_id is not null)
    or (entity_type is null and entity_id is null and transcript_id is not null)
  );

comment on constraint ai_runs_entity_pair_or_capture on public.ai_runs is
  'S-AI-OBS-1. entity_type/entity_id снялись с NOT NULL ради capture (работает до '
  'появления сущности). Этот CHECK не даёт снятию расползтись на сущностные '
  'прогоны: у capture обе координаты пустые, у остальных — обе заполнены.';

-- ── 5. RLS INSERT: пятая ветка ──────────────────────────────────────────
--
-- Полная перезапись редакции 104 плюс ветка capture. Сверять построчно с
-- `ai_runs_select` ниже: разъехавшись, они дадут строку, которую можно записать
-- и нельзя прочитать.
--
-- ⚠️ У ветки capture НЕТ EXISTS-проверки, и это не пропуск: проверять нечего —
--    сущности на момент разбора не существует. Границу организации держат первые
--    два конъюнкта (`org_id = current_org_id()`, `created_by = auth.uid()`), они
--    же не дают записать прогон в чужую org.
drop policy if exists ai_runs_insert on public.ai_runs;
create policy ai_runs_insert on public.ai_runs
  for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
    and (
      -- Прогон по транскрипту: координаты обязаны совпасть с транскриптом.
      (
        transcript_id is not null
        and exists (
          select 1 from public.transcripts t
          where t.id = ai_runs.transcript_id
            and t.entity_type = ai_runs.entity_type
            and t.entity_id = ai_runs.entity_id
        )
      )
      -- Прогон по полям сущности: сущность обязана существовать.
      or (
        transcript_id is null
        and (
          (entity_type = 'call'    and exists (select 1 from public.calls c    where c.id = ai_runs.entity_id))
          or (entity_type = 'meeting' and exists (select 1 from public.meetings m where m.id = ai_runs.entity_id))
          or (entity_type = 'project' and exists (select 1 from public.projects p where p.id = ai_runs.entity_id))
          or (
            entity_type = 'company'
            and exists (
              select 1 from public.companies c
              where c.id = ai_runs.entity_id and c.org_id = ai_runs.org_id
            )
          )
          -- S-AI-OBS-1: разбор быстрого ввода. Сущности ещё нет — и координат тоже.
          or (entity_type = 'capture' and entity_id is null)
        )
      )
    )
  );

-- ── 6. RLS SELECT: пятая ветка ──────────────────────────────────────────
--
-- Без неё вся затея бессмысленна: строка пишется и не читается.
-- Видимость org-wide, как у остальных веток, — статистика по AI это статистика
-- организации, а не личный журнал автора.
drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and (
      (entity_type = 'call'    and exists (select 1 from public.calls c    where c.id = ai_runs.entity_id))
      or (entity_type = 'meeting' and exists (select 1 from public.meetings m where m.id = ai_runs.entity_id))
      or (entity_type = 'project' and exists (select 1 from public.projects p where p.id = ai_runs.entity_id))
      or (
        entity_type = 'company'
        and exists (
          select 1 from public.companies c
          where c.id = ai_runs.entity_id and c.org_id = ai_runs.org_id
        )
      )
      or entity_type = 'capture'
    )
  );

comment on column public.ai_runs.entity_type is
  'call|meeting|project|company — сущность прогона; capture (S-AI-OBS-1) — разбор '
  'быстрого ввода, у которого сущности ещё нет: entity_id при нём NULL. Источник '
  '(telegram|web) лежит в result->>''source'': отдельной колонки под него нет и не '
  'заводится — ради одного поля она дороже, чем ключ в уже существующем jsonb.';
