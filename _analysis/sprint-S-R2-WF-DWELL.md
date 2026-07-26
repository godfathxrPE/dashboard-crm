# S-R2-WF-DWELL — автоматизации: `days_in_stage` + `suggest_spawn`

**Ветка:** `feat/r2-wf-dwell` от `main`. Миграция **079**. Один коммит.

R2-P0-E. Расширение работающего движка (050/051), **не** переписывание. Две вещи: триггер
«застряла на стадии N дней» и действие «предложи создать внедрение» (HITL-уведомление, не
автоспавн).

**Трудоёмкость: ~6–8 ч. Риск низкий-средний** (новый cron-джоб + расширение CHECK'ов).

Независим от `SEGMENTS` и `TRANSITION` по коду, но **номер 079 занимает только после того,
как 078 ушла в 1a** (W1 ревью: не «претендовать» на один номер из двух ветвей). Если 1a
задерживается — либо ждём, либо dwell берёт 078, а 1a перенумеровывается; согласовать до старта.

## Проверено по живой БД до старта (можно не перепроверять)

**`stage_entered_at` действительно обновляется при смене стадии** — это был главный открытый
вопрос ревью (W3: «если нет — dwell не работает вообще»). Механизм: триггер
`trg_sync_project_stage` (BEFORE INSERT OR UPDATE) → `sync_project_stage()`, внутри
`IF TG_OP='INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN NEW.stage_entered_at := now()`.
Ключ идемпотентности `stage_id@stage_entered_at` рабочий.

⚠️ **Но там же засада для действий:** на смене стадии работают **два** пересекающихся
триггера — `trg_sync_deal_stage_fields` (BEFORE UPDATE OF stage_id: перезаписывает
`probability` значением из стадии, ставит `status`/`actual_close_date`) и
`trg_sync_project_stage` (BEFORE INSERT OR UPDATE: `stage_entered_at`, `status`,
`actual_close_date`). Порядок алфавитный → `sync_project_stage` выигрывает конфликты.
Следствие для этого спринта: действие `set_field` с полем `probability` на dwell-правиле
**переживёт только до следующей смены стадии** — стадия его перезапишет. В UI редактора
правил это не запрещаем, но в подсказку поля вынести.

**Реальные имена констрейнтов (брать эти, не угадывать):**

| Констрейнт | Текущее значение |
|---|---|
| `automation_rules_trigger_type_check` | `stage_entered`, `status_changed`, `field_changed`, `task_overdue` |
| `automation_rules_action_type_check` | `create_task`, `notify`, `create_activity`, `set_field` |
| `notifications_type_check` | `task_assigned`, `project_assigned`, `deal_won`, `automation` |

**Живые cron-джобы:** `wf-overdue-daily` (`0 6 * * *`), `recurring-daily` (`5 6 * * *`) —
`10 6` для dwell свободен.

---

## РАЗВЕДКА

```bash
git branch --show-current && git status --short
ls supabase/migrations/ | tail -3                  # ожидание: 078 → берём 079

# движок как есть
sed -n '1,30p' supabase/migrations/050_workflow_engine.sql          # CHECK trigger_type/action_type
grep -n "trigger_key\|automation_runs_rule_project_key_uniq" supabase/migrations/050_workflow_engine.sql
sed -n '1,30p;120,145p' supabase/migrations/051_task_overdue.sql    # cron-паттерн + partial-unique
grep -rn "notifications_type_check" supabase/migrations/*.sql docs/schema.md | head

# UI движка
cat src/lib/constants/automation.ts
grep -n "trigger_type\|action_type" src/lib/validators/automation-rule.ts | head
grep -n "t_stage_id\|trigger_config\|action_config" src/components/settings/automation/RuleEditorModal.tsx | head

# cron: расширение pg_cron уже включено (051) — проверить через MCP
# select jobname, schedule, command from cron.job;
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. `pg_cron` не включён / джоба `wf-overdue-daily` нет → сначала разобраться с 051, не
   заводить второй джоб «вслепую».
2. `trigger_type` CHECK уже содержит `days_in_stage` → часть работы сделана, доложить.
3. Последняя миграция не 078 / `tsc` красный.

---

## Миграция `079_wf_dwell.sql`

### 1. Расширение CHECK'ов

```sql
alter table public.automation_rules drop constraint if exists <имя_из_050_trigger>;
alter table public.automation_rules add constraint <то_же_имя> check (
  trigger_type in ('stage_entered','status_changed','field_changed','task_overdue','days_in_stage')
);
-- аналогично action_type += 'suggest_spawn'
-- notifications_type_check += 'spawn_suggest'
```

Имена — из таблицы выше (сверено по `pg_constraint` 2026-07-26); всё равно перепроверить
в разведке одним запросом, вдруг что-то поменялось между гейтами.

⚠️ **Обратимость:** откат (re-narrow CHECK) упадёт, если в таблицах уже есть строки с новыми
значениями. Записать в шапку миграции: перед откатом — удалить правила с
`trigger_type='days_in_stage'` / `action_type='suggest_spawn'` и уведомления
`type='spawn_suggest'`.

### 2. `run_dwell_automations()` — DEFINER + cron

Зеркалит `run_overdue_automations` (051): не row-триггер, а обход.

Скоуп: открытые **client**-проекты org, у которых
`now() - stage_entered_at >= (rule.trigger_config->>'min_days')::int`, и если в конфиге задан
`stage_id` — только эта стадия. `status` — только `open` (won/lost не «застревают»).

**Идемпотентность — один раз за пребывание на стадии:**

```
trigger_key = coalesce(stage_id::text,'') || '@' || coalesce(stage_entered_at::text,'')
```

Существующий `unique (rule_id, project_id, trigger_key)` из 050 покрывает дедуп полностью
(project_id здесь всегда not null, partial-unique из 051 не нужен).

Записать в комментарий функции два следствия, чтобы не считались багами:
- смена `min_days` в правиле **не** вызовет повторного срабатывания на том же пребывании;
- возврат на ту же стадию обновляет `stage_entered_at` → правило сработает снова (это желаемое).

Контекст cron: `auth.uid()` = NULL. Actor для уведомления брать
`coalesce(owner_id, created_by)` — как в 050.

Действия внутри — **переиспользовать существующие ветки** (`notify`, `create_task`,
`create_activity`, `set_field`). Дублировать код действий из 050 нельзя: разъедутся.
Если тело 050 не разложено на вызываемые части — вынести общую часть в отдельную
DEFINER-функцию и вызвать из обоих мест; это правка 050-логики, поэтому **делать её отдельным
шагом и отдельно смокировать**, что stage_entered по-прежнему работает.

ACL: `revoke all from public, anon, authenticated`, `grant execute to service_role` (051).

```sql
select cron.schedule('wf-dwell-daily', '10 6 * * *', 'select public.run_dwell_automations();');
```

`10 6` — после `wf-overdue-daily` (`0 6`) и `recurring-daily` (`5 6`), чтобы джобы не
дрались за одну минуту.

### 3. Действие `suggest_spawn`

Создаёт **уведомление**, не проект:

```sql
insert into public.notifications (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
values (new.org_id, v_recipient, v_actor, 'spawn_suggest', 'projects', new.id,
        jsonb_build_object('title', coalesce(new.name,''),
                           'text', replace(coalesce(v_rule.action_config->>'text',''), '{deal}', coalesce(new.name,''))));
```

**Инвариант I8: авто-спавн внедрения запрещён.** Никакого вызова
`spawn_delivery_project` из автоматизации — РП выбирает `delivery_kind` руками. Действие
`spawn_delivery` не добавлять даже «на будущее».

Задачу вместо уведомления не делаем (решение по вопросу §14.9): уведомление даёт deep link и
не мусорит в задачах.

---

## Клиентская часть

- `src/lib/constants/automation.ts` — расширить юнионы/лейблы: триггер «Застряла на стадии»,
  действие «Предложить создать внедрение».
- `src/lib/validators/automation-rule.ts` — схемы конфигов: `days_in_stage` →
  `{ stage_id?: uuid, min_days: int 1..365 }`; `suggest_spawn` → `{ text: string }`.
- `src/components/settings/automation/RuleEditorModal.tsx` — поля под новый триггер
  (селект стадии, опциональный + числовой порог) и под новое действие. Существующие ветки
  (`t_stage_id` для `stage_entered`) не ломать.
- Уведомления: `spawn_suggest` в `use-notifications` / список уведомлений — иконка, текст и
  **deep link на сделку с открытием `SpawnWizard`** (параметр в URL, который читает
  `DealDeliveryHub`/детальная страница). Если готового способа открыть визард по URL нет —
  добавить минимальный (`?spawn=1`), не переписывая визард.

---

## VERIFY / коммит

```bash
npx tsc --noEmit                                                  # 0
npx eslint src/lib src/components/settings                        # 0 (scoped)
npm test
grep -rn "spawn_delivery_project" src/lib src/components/settings # пусто (I8)
git --no-pager diff --stat
```

Миграцию **не применять.** Смоук на гейте:

1. Правило `days_in_stage(min_days=1)` + действие `notify` → сделка со `stage_entered_at`
   старше суток получает уведомление после ручного `select run_dwell_automations();`.
2. Повторный прогон в тот же день → **второго уведомления нет** (`automation_runs` — одна
   строка на `rule+project+trigger_key`).
3. Перевод сделки на другую стадию и обратно → `stage_entered_at` обновился, правило
   сработало снова.
4. Действие `suggest_spawn` → уведомление `type='spawn_suggest'`, deep link открывает визард;
   **внедрение само не создалось** (проверить `select count(*) from projects where
   type='delivery'` до/после).
5. Регресс движка: правило `stage_entered` + `create_task` по-прежнему работает (если общая
   часть выносилась — это главный риск спринта).
6. `advisors` без новых WARN; `cron.job` содержит три джоба с разными минутами.

Коммит один:

```
feat(r2): триггер days_in_stage и действие suggest_spawn в движке автоматизаций (R2-P0-E)
```

**Не пушить.** В отчёте: выносилась ли общая часть действий из 050 (если да — что именно и
как проверен регресс), результат пунктов 1–6 и итоговый список `cron.job`.
