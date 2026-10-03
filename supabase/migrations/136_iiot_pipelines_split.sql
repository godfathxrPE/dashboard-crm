-- ═══════════════════════════════════════════════════════════════════════
-- 136_iiot_pipelines_split — APPLIED 2026-10-03 как 20261003160000 iiot_pipelines_split
-- (SQL Editor владельца + ручная запись в schema_migrations: MCP apply_migration висит на delete в DO-блоке).
-- Разделение пресейла IIoT на две воронки: «IIoT Проект» и «IIoT Эксперимент».
-- Решения владельца 03.10.2026 (claude/decisions-iiot-pipelines-2026-10-03.md):
--   • Проект:      Лид → Квалификация → Материалы → Подготовка КП → Защита КП → Договор → Выиграна | Проиграна
--   • Эксперимент: Лид → Квалификация → Материалы → Документы → Согл. ЧЗ → Встреча 3х → Выиграна | Проиграна
--   • «Запуск проекта» и «Эксперимент» уходят из продаж: это работа внедрения (IIoT Внедрение, по плану СДР).
--   • КП в эксперименте нет (обсуждается «чек на эксперимент» — это бюджет сделки, не КП).
--
-- Сделки НЕ переезжают: все открытые сделки IIoT — проектные, на стадиях 5–8 и 11 сделок нет
-- (гард ниже). Документы / Согл. ЧЗ / Встреча 3х переносятся в новую воронку СТРОКАМИ (id
-- сохраняются) — журнал stage_transitions и нормы по stage_id не рвутся.
-- Удаляются две стадии без сделок: «Эксперимент» (каскадом 2 требования-поля) и «Запуск проекта».
-- На них ссылаются 2 строки stage_transitions тестовой сделки «ЭЙЧ ЭНД ЭН» (FK нет) — допустимо.
--
-- Воронка эксперимента НЕ default: доска и форма сделки до спринта S-PIPE-SPLIT-2 её не покажут.
-- Откат: обратная миграция не тривиальна (удалённые стадии) — перед apply снять снимок
-- pipeline_stages / stage_requirements / automation_rules / organizations.settings воронки 0001.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  c_project  constant uuid := 'a0000000-0000-4000-8000-000000000001';  -- «IIoT Продажи» → «IIoT Проект»
  c_exp      constant uuid := 'a0000000-0000-4000-8000-000000000005';  -- новая «IIoT Эксперимент»

  -- стадии проектной воронки
  s_lead     constant uuid := '9b9851dd-5117-46db-8000-eb141a994976';
  s_qual     constant uuid := '095fc847-414c-4130-8f8f-a18272f66e0a';
  s_mat      constant uuid := '40490b05-2e54-4f1a-9ce2-dc34e7cb654c';
  s_kp       constant uuid := '5d90502d-155f-47e4-b47d-60300bc62338';
  s_defense  constant uuid := '9ac86845-e266-4e6f-b40a-1bcb7644ed5c';
  s_contract constant uuid := '5348376f-d396-4edd-8c19-a5dfacd788c3';
  s_won      constant uuid := '97725947-58cf-4060-b3d3-d37794d69223';
  s_lost     constant uuid := '3174081e-3e05-4437-9676-7e58dda4a4de';
  -- переезжают в эксперимент
  s_docs     constant uuid := 'c37e3a59-41cf-4986-8a25-bf32a7b401f7';
  s_czapp    constant uuid := '4a04f236-6f95-4282-8423-726d3910cfa3';
  s_meet3    constant uuid := '41999257-e6b8-4751-9629-7db42d145386';
  -- удаляются
  s_expstage constant uuid := '6b906725-5996-4834-ac17-03e475cf9aac';
  s_launch   constant uuid := '5fa39aa8-ecee-4968-930b-2ac1aee88b95';

  e_lead uuid := gen_random_uuid();
  e_qual uuid := gen_random_uuid();
  e_mat  uuid := gen_random_uuid();
  e_won  uuid := gen_random_uuid();
  e_lost uuid := gen_random_uuid();
begin
  -- ── 0. Гарды ────────────────────────────────────────────────────────
  if exists (select 1 from public.projects
             where stage_id in (s_docs, s_czapp, s_meet3, s_expstage, s_launch)) then
    raise exception 'iiot split: на стадиях эксперимента/запуска есть сделки — разнести вручную до миграции';
  end if;
  if exists (select 1 from public.pipelines where id = c_exp) then
    raise exception 'iiot split: воронка % уже существует', c_exp;
  end if;

  -- ── 1. Воронки ─────────────────────────────────────────────────────
  update public.pipelines set name = 'IIoT Проект' where id = c_project;
  insert into public.pipelines (id, name, direction, entity_type, is_default)
  values (c_exp, 'IIoT Эксперимент', 'iiot', 'deal', false);

  -- ── 2. Удалить стадии без сделок (освобождает order_index 8 и 11) ──
  delete from public.pipeline_stages where id in (s_expstage, s_launch);

  -- ── 3. Перенос стадий эксперимента строками (id сохраняются) ───────
  --     Новая воронка пуста — order_index ставится сразу, конфликта unique нет.
  update public.pipeline_stages set pipeline_id = c_exp, order_index = 4 where id = s_docs;
  update public.pipeline_stages set pipeline_id = c_exp, order_index = 5 where id = s_czapp;
  update public.pipeline_stages set pipeline_id = c_exp, order_index = 6 where id = s_meet3;
  update public.stage_requirements set pipeline_id = c_exp where stage_id in (s_docs, s_czapp, s_meet3);

  -- ── 4. Перенумерация проекта: 9→5, 10→6, 12→7, 13→8 (5–8 свободны после шагов 2–3)
  --     Вероятности: Защита КП 80→50, Договор 90→80 — 80% была ценой ПОСЛЕ эксперимента.
  update public.pipeline_stages set order_index = 5, probability = 50 where id = s_defense;
  update public.pipeline_stages set order_index = 6, probability = 80 where id = s_contract;
  update public.pipeline_stages set order_index = 7 where id = s_won;
  update public.pipeline_stages set order_index = 8 where id = s_lost;

  -- ── 5. Свои стадии эксперимента (общие названия — новые id) ────────
  insert into public.pipeline_stages (id, pipeline_id, name, order_index, probability, phase_group, is_won, is_lost) values
    (e_lead, c_exp, 'Лид',          1,   5, 'attraction', false, false),
    (e_qual, c_exp, 'Квалификация', 2,  10, 'attraction', false, false),
    (e_mat,  c_exp, 'Материалы',    3,  15, 'attraction', false, false),
    (e_won,  c_exp, 'Выиграна',     7, 100, 'closing',    true,  false),
    (e_lost, c_exp, 'Проиграна',    8,   0, 'closing',    false, true);

  -- ── 6. Ожидаемые роли — копия проектных ────────────────────────────
  insert into public.pipeline_expected_roles (org_id, pipeline_id, role, is_required, hint, sort_order, created_by)
  select org_id, c_exp, role, is_required, hint, sort_order, created_by
  from public.pipeline_expected_roles where pipeline_id = c_project;

  -- ── 7. Автоматизации победы — копия на «Выиграна» эксперимента ─────
  insert into public.automation_rules (org_id, name, trigger_type, trigger_config, action_type, action_config, is_active, conditions)
  select r.org_id,
         r.name || ' (эксперимент)',
         r.trigger_type,
         jsonb_build_object('stage_id', e_won, 'pipeline_id', c_exp),
         r.action_type,
         case when r.action_type = 'suggest_spawn'
              then jsonb_build_object('text', 'Нас выбрали интегратором — создай внедрение эксперимента')
              else r.action_config end,
         r.is_active,
         r.conditions
  from public.automation_rules r
  where r.trigger_type = 'stage_entered'
    and r.trigger_config->>'stage_id' = s_won::text;

  -- ── 8. Нормы стадий (organizations.settings.stage_target_days, календарные дни)
  --     Удалённые ключи — вон; проект и эксперимент — значения из разбора 30.09.
  update public.organizations o
  set settings = jsonb_set(
    coalesce(o.settings, '{}'::jsonb),
    '{stage_target_days}',
    (coalesce(o.settings->'stage_target_days', '{}'::jsonb) - s_expstage::text - s_launch::text)
    || jsonb_build_object(
         s_lead::text, 5,  s_qual::text, 14, s_mat::text, 14, s_kp::text, 7,
         s_defense::text, 14, s_contract::text, 14,
         e_lead::text, 5,  e_qual::text, 14, e_mat::text, 14,
         s_docs::text, 7,  s_czapp::text, 10, s_meet3::text, 10)
  )
  where o.settings ? 'stage_target_days';

  -- ── 9. Вероятность открытых сделок — только там, где стояло старое значение стадии
  --     (ручную вероятность не трогаем). На 03.10 это «Глорус-норд» на Защите КП: 80 → 50.
  update public.projects p set probability = 50
  where p.stage_id = s_defense and p.probability = 80;
  update public.projects p set probability = 80
  where p.stage_id = s_contract and p.probability = 90;
end $$;
