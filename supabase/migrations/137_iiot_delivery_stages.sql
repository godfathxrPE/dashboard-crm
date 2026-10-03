-- ═══════════════════════════════════════════════════════════════════════
-- 137_iiot_delivery_stages — стадии «IIoT Внедрение» по плану СДР (план.mxl)
-- APPLIED 2026-10-03 как 20261003200000 iiot_delivery_stages (SQL Editor владельца + запись в schema_migrations).
-- S-DELIVERY-IIOT-1, решение владельца 03.10.2026.
--
-- Было 7 стадий подряд: Инициация → Подготовительный этап → Установка БИТ.MDT →
-- Подготовка оборудования → Запуск → Регулярные мероприятия → Передача на поддержку.
-- В плане 1.1 / 1.2 / 1.3 — ПАРАЛЛЕЛЬНЫЕ части фазы «1. Подготовка к запуску», а не
-- три стадии подряд; кокпит считал «впереди ≈147 дн.» при плане ≈77.
--
-- Стало 5: Инициация (initiated) → Подготовка к запуску (planning) → Запуск (execution)
-- → Регулярные мероприятия (execution) → Передача на поддержку (completed).
-- Инициация оставлена отдельной короткой стадией (назначение ответственных, встреча по
-- старту — 1.1.1–1.1.8): без неё колонка «Инициирован» доски внедрений для IIoT пуста
-- и drag в неё молча не работает.
--
-- Только данные. Строки стадий переиспользуются (id сохраняются), «Подготовительный
-- этап» переименован; «Установка БИТ.MDT» и «Подготовка оборудования» удаляются —
-- проекты на них (на 03.10 их 0) сначала переводятся на «Подготовка к запуску».
-- Все стадии внедрения is_won=false / is_lost=false (инвариант 035).
-- ⚠️ Есть delete → применять через SQL Editor владельца (learnings: MCP виснет).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  c_pipe    constant uuid := 'a0000000-0000-4000-8000-000000000003';  -- IIoT Внедрение
  s_init    constant uuid := '5aac3faa-521a-40b6-b873-7f8391cdcb71';  -- Инициация
  s_prep    constant uuid := '8baa77fd-d414-4776-b4ae-4c20a4c237f3';  -- Подготовительный этап → Подготовка к запуску
  s_mdt     constant uuid := '85d1aeb4-a2e9-4fcb-84f5-412279ead2ad';  -- Установка БИТ.MDT (удаляется)
  s_equip   constant uuid := '2a385ad3-995f-4246-b01b-1bed7b6b4f96';  -- Подготовка оборудования (удаляется)
  s_launch  constant uuid := '7b9675d1-61d8-4394-9acf-0c65be531e39';  -- Запуск
  s_regular constant uuid := 'e5cdfcb6-4b27-4c7d-8bce-f64d5a1893b8';  -- Регулярные мероприятия
  s_handover constant uuid := 'cb791524-9e53-4a75-a3bf-52a602c7b462'; -- Передача на поддержку
begin
  if (select count(*) from public.pipeline_stages where pipeline_id = c_pipe) <> 7
     or not exists (select 1 from public.pipeline_stages where id = s_mdt) then
    raise exception 'iiot delivery: стадии уже изменены или не совпадают с ожидаемыми 7';
  end if;

  -- 1. Проекты с удаляемых стадий → «Подготовка к запуску»
  update public.projects set stage_id = s_prep where stage_id in (s_mdt, s_equip);

  -- 2. Удалить параллельные подфазы
  delete from public.pipeline_stages where id in (s_mdt, s_equip);

  -- 3. Переименование и порядок (3 и 4 освобождены шагом 2, 5 — после переноса «Запуска»)
  update public.pipeline_stages set name = 'Подготовка к запуску', phase_group = 'planning', order_index = 2 where id = s_prep;
  update public.pipeline_stages set order_index = 3 where id = s_launch;
  update public.pipeline_stages set order_index = 4 where id = s_regular;
  update public.pipeline_stages set order_index = 5 where id = s_handover;

  -- 4. Нормы (календарные дни) по длительностям плана; правятся в «Настройки → Нормы стадий»
  update public.organizations o
  set settings = jsonb_set(
    coalesce(o.settings, '{}'::jsonb), '{stage_target_days}',
    (coalesce(o.settings->'stage_target_days', '{}'::jsonb) - s_mdt::text - s_equip::text)
    || jsonb_build_object(s_init::text, 7, s_prep::text, 60, s_launch::text, 7,
                          s_regular::text, 30, s_handover::text, 7))
  where o.settings ? 'stage_target_days';
end $$;
