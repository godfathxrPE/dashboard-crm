-- 085: ai_runs — прогоны без транскрипта + сущность 'project'
--      (S-R2-AI-HARDEN, R2-P1).
--
-- Зачем. Половина AI-контура работает НЕ по транскрипту:
--   • инъекционный смоук на звонке «Толедо» — инъекция лежит в calls.agreements,
--     транскрипта у звонка нет вовсе;
--   • meeting_prep — бриф ПЕРЕД встречей, транскрипта не существует по определению;
--   • deal_summary — сводка по полям сделки.
-- `ai_runs.transcript_id NOT NULL` делал такие прогоны физически невозможными.
--
-- ⚠️ ОБРАТИМОСТЬ (проверено на текущих данных: строк с NULL и с 'project' сегодня 0,
--    откат выполним без потерь прямо сейчас):
--      delete from public.ai_runs where transcript_id is null;
--      delete from public.ai_runs where entity_type = 'project';
--      drop index if exists public.ux_ai_runs_active_entity;
--      alter table public.ai_runs drop constraint ai_runs_transcript_required;
--      alter table public.ai_runs alter column transcript_id set not null;
--      alter table public.ai_runs drop constraint ai_runs_entity_type_check;
--      alter table public.ai_runs add constraint ai_runs_entity_type_check
--        check (entity_type in ('call','meeting'));
--      -- + вернуть политики ai_runs_insert / ai_runs_select в редакцию 030.
--
-- ⚠️ ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: FK transcript_id НЕ переводится на ON DELETE SET NULL.
--    Разбор в отчёте спринта (B3): SET NULL столкнулся бы с CHECK ниже — удаление
--    транскрипта обнулило бы transcript_id у прогона meeting_protocol и уронило бы
--    сам DELETE. Каскад остаётся: удаление транскрипта сносит его прогоны, как и до
--    085. Это существующее поведение, а не регрессия, и задачам спринта не мешает.

-- ── 1. Транскрипт становится необязательным ───────────────────────────────────
alter table public.ai_runs alter column transcript_id drop not null;

-- Обязательность транскрипта — по пресету. Снять NOT NULL без замены = разрешить
-- мусорный прогон «протокол встречи по пустоте». Держим в БД, а не в вере в клиента.
--
-- ⚠️ СПИСОК ОБЯЗАН СОВПАДАТЬ с реестром PRESETS в supabase/functions/ai-run/index.ts.
--    Перечислены пресеты, которым транскрипт НЕ нужен; всё остальное (включая пресеты,
--    которых ещё нет) требует транскрипт — безопасный дефолт. Расширяешь реестр —
--    правь этот CHECK отдельной миграцией.
alter table public.ai_runs add constraint ai_runs_transcript_required
  check (
    transcript_id is not null
    or preset_key in ('deal_progression', 'analytic_note', 'meeting_prep', 'deal_summary')
  );

-- ── 2. Сделка как сущность прогона ────────────────────────────────────────────
-- meeting_prep / deal_summary вешаются на сделку: бриф готовится, когда встречи
-- в CRM ещё нет, а сводка по сделке к звонку не привязана вовсе.
alter table public.ai_runs drop constraint ai_runs_entity_type_check;
alter table public.ai_runs add constraint ai_runs_entity_type_check
  check (entity_type in ('call', 'meeting', 'project'));

-- ── 3. RLS: оба пути INSERT + видимость прогонов по сделке ────────────────────
-- Без этого 085 бесполезна: политика 030 требовала EXISTS по transcripts, то есть
-- INSERT с transcript_id = NULL отбивался RLS (42501) даже после снятия NOT NULL,
-- а строка с entity_type='project' была бы невидима в SELECT — прогон уходил бы
-- в никуда.
drop policy if exists ai_runs_insert on public.ai_runs;
create policy ai_runs_insert on public.ai_runs
  for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
    and (
      -- путь «по транскрипту»: транскрипт существует и указывает на ТУ ЖЕ сущность
      (
        transcript_id is not null
        and exists (
          select 1 from public.transcripts t
          where t.id = ai_runs.transcript_id
            and t.entity_type = ai_runs.entity_type
            and t.entity_id = ai_runs.entity_id
        )
      )
      or
      -- путь «по сущности» (085): транскрипта нет — сущность обязана существовать
      -- и быть видимой вызывающему (подзапрос идёт под RLS своей таблицы).
      (
        transcript_id is null
        and (
             (entity_type = 'call'    and exists (select 1 from public.calls    c where c.id = ai_runs.entity_id))
          or (entity_type = 'meeting' and exists (select 1 from public.meetings m where m.id = ai_runs.entity_id))
          or (entity_type = 'project' and exists (select 1 from public.projects p where p.id = ai_runs.entity_id))
        )
      )
    )
  );

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and (
         (entity_type = 'call'    and exists (select 1 from public.calls    c where c.id = ai_runs.entity_id))
      or (entity_type = 'meeting' and exists (select 1 from public.meetings m where m.id = ai_runs.entity_id))
      or (entity_type = 'project' and exists (select 1 from public.projects p where p.id = ai_runs.entity_id))
    )
  );

-- ── 4. Дедупликация активного прогона для безтранскриптного пути ──────────────
-- ux_ai_runs_active — UNIQUE (transcript_id, preset_key) WHERE status in (pending,running).
-- NULL в btree-uniq различимы (NULLS DISTINCT по умолчанию), поэтому для прогонов
-- без транскрипта он не срабатывает вовсе: каждый клик плодил бы новый прогон.
-- Второй частичный индекс закрывает ровно этот путь по (сущность, пресет).
-- NULLS NOT DISTINCT на первом индексе не годится: он схлопнул бы ВСЕ безтранскриптные
-- прогоны одного пресета по всей таблице в одну строку, независимо от сущности.
create unique index if not exists ux_ai_runs_active_entity
  on public.ai_runs (entity_type, entity_id, preset_key)
  where transcript_id is null and status in ('pending', 'running');

-- ── 5. Документация колонки ───────────────────────────────────────────────────
comment on column public.ai_runs.transcript_id is
  'Транскрипт-источник прогона. NULL допустим для пресетов, работающих по полям сущности '
  '(deal_progression, analytic_note, meeting_prep, deal_summary) — 085. Для meeting_protocol '
  'и spin_review обязателен: CHECK ai_runs_transcript_required.';

comment on column public.ai_runs.entity_type is
  'call | meeting | project. ''project'' добавлен в 085 под пресеты meeting_prep/deal_summary, '
  'которые вешаются на сделку. Три места обязаны совпадать: этот CHECK, clientMeta в edge '
  'ai-run и entityTypes в src/lib/constants/ai-presets.ts.';
