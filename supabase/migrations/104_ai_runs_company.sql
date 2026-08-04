-- 104: ai_runs — компания как сущность прогона + пресет company_brief
--      (S-COMPANY-AI-1, F3).
--
-- Зачем. Пресейл начинается не со сделки, а с компании: бриф к первому звонку
-- («чем занимается, масштаб, свежие события, признаки работы с Честным Знаком»)
-- строится по карточке компании, когда сделки ещё нет вовсе. Контур ai_runs это
-- физически запрещал: CHECK разрешал только call|meeting|project, а прогон без
-- транскрипта — только четыре перечисленных пресета.
--
-- ЧТО ЗДЕСЬ:
--   1. ai_runs_entity_type_check       += 'company'         (drop + add, CHECK не альтерится)
--   2. ai_runs_transcript_required     += 'company_brief'   (то же)
--   3. ai_runs_insert / ai_runs_select — полный переписанный текст (редакция 085
--      плюс ветка company). `create or replace` для политик не существует: только
--      drop + create с тем же именем и ПОЛНЫМ текстом, включая старые ветки.
--   4. Комментарии колонок приведены в соответствие.
--
-- ⚠️ РАСШИРЕНИЕ, НЕ СУЖЕНИЕ. Оба новых CHECK'а надмножества старых, поэтому все
--    существующие строки ai_runs проходят их без исключения — бэкфилл и проверка
--    данных перед применением не нужны.
-- ⚠️ Индексы НЕ добавляются: `ux_ai_runs_active_entity` (partial unique по
--    entity_type/entity_id/preset_key при transcript_id IS NULL, 085) уже покрывает
--    идемпотентность company-прогонов — двойной клик вернёт существующий прогон.
--
-- ⚠️ ОТКАТ (на текущих данных строк с entity_type='company' ноль, откат без потерь):
--      delete from public.ai_runs where entity_type = 'company';
--      alter table public.ai_runs drop constraint ai_runs_entity_type_check;
--      alter table public.ai_runs add constraint ai_runs_entity_type_check
--        check (entity_type in ('call','meeting','project'));
--      alter table public.ai_runs drop constraint ai_runs_transcript_required;
--      alter table public.ai_runs add constraint ai_runs_transcript_required
--        check (transcript_id is not null
--               or preset_key in ('deal_progression','analytic_note','meeting_prep','deal_summary'));
--      -- + вернуть ai_runs_insert / ai_runs_select в редакцию 085.

-- ── 1. Компания как сущность прогона ──────────────────────────────────────────
alter table public.ai_runs drop constraint ai_runs_entity_type_check;
alter table public.ai_runs add constraint ai_runs_entity_type_check
  check (entity_type in ('call', 'meeting', 'project', 'company'));

-- ── 2. Брифу по компании транскрипт не положен по смыслу ──────────────────────
-- ⚠️ СПИСОК ОБЯЗАН СОВПАДАТЬ с реестром PRESETS в supabase/functions/ai-run/index.ts
--    и с AI_PRESETS в src/lib/constants/ai-presets.ts. Держит тест
--    tests/unit/ai-presets-sync.test.ts — он читает ИМЕННО эту миграцию как
--    актуальную редакцию обоих CHECK'ов (085 стала историей).
alter table public.ai_runs drop constraint ai_runs_transcript_required;
alter table public.ai_runs add constraint ai_runs_transcript_required
  check (
    transcript_id is not null
    or preset_key in ('deal_progression', 'analytic_note', 'meeting_prep', 'deal_summary', 'company_brief')
  );

-- ── 3. RLS: видимость и запись прогонов по компании ───────────────────────────
-- Без этого 104 бесполезна: INSERT с entity_type='company' отбивался бы политикой
-- (42501), а строка была бы невидима в SELECT — прогон уходил бы в никуда.
--
-- Ветка company повторяет стиль существующих (EXISTS по таблице сущности идёт под
-- её собственной RLS), но добавляет явную сверку org: `c.org_id = ai_runs.org_id`.
-- Это defense-in-depth, а не замена внешнему `org_id = current_org_id()` — оба
-- конъюнкта остаются на месте.
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
          or (entity_type = 'company' and exists (
                select 1 from public.companies c
                where c.id = ai_runs.entity_id and c.org_id = ai_runs.org_id))
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
      or (entity_type = 'company' and exists (
            select 1 from public.companies c
            where c.id = ai_runs.entity_id and c.org_id = ai_runs.org_id))
    )
  );

-- ── 4. Документация колонок ───────────────────────────────────────────────────
comment on column public.ai_runs.transcript_id is
  'Транскрипт-источник прогона. NULL допустим для пресетов, работающих по полям сущности '
  '(deal_progression, analytic_note, meeting_prep, deal_summary, company_brief) — 085, 104. '
  'Для meeting_protocol и spin_review обязателен: CHECK ai_runs_transcript_required.';

comment on column public.ai_runs.entity_type is
  'call | meeting | project | company. ''project'' добавлен в 085 (meeting_prep/deal_summary), '
  '''company'' — в 104 (company_brief: бриф по компании к первому звонку). Три места обязаны '
  'совпадать: этот CHECK, реестр PRESETS в edge ai-run и entityTypes в '
  'src/lib/constants/ai-presets.ts.';
