# S-WF-2 — Workflow Engine MVP (/architect D3)

**Эволюция S29, НЕ greenfield.** Обобщаем существующий движок `automation_rules`/`automation_runs`/`run_stage_automations()` (сейчас жёстко `stage_entered → create_task`) до конфигурируемого rules-engine. Roadmap §D1/§14 — «главный структурный разрыв».

**Красная линия scope-creep (roadmap risks):** без visual canvas, JSON-rules only, ≤4 триггера. Держим.

---

## CRM-аналогии
- **HubSpot Workflows:** enrollment trigger → (if/then) → actions (create task, set property, send notification). Наш MVP = плоский аналог: trigger + conditions (AND) + actions.
- **Salesforce Flow / Process Builder:** object trigger + entry criteria + action group. Мы = record-triggered на `projects` (DB-триггер).
- **Zoho CommandCenter / Accelo triggers:** stage/status hooks → tasks/notifications. Наш `run_automations` — ровно этот паттерн, уже частично живёт (S29).
- **Адаптация под стек:** движок остаётся в Postgres (SECURITY DEFINER триггер на `projects`), как S29/S27/S26 — композиция с уже существующими notify-триггерами, без внешнего оркестратора.

## Что уже есть (S29, разведка живой БД 2026-07-16)
- `automation_rules`: `trigger_type` CHECK = только `stage_entered`; `action_type` CHECK = только `create_task`; `trigger_config`/`action_config` JSONB; `is_active`; org_id (явный, без trg_set_org_id).
- `automation_runs`: журнал + идемпотентность `UNIQUE(rule_id, project_id, stage_id)`.
- `run_stage_automations()` (SECURITY DEFINER, `trg_zz_run_automations` AFTER UPDATE ON projects): при смене `stage_id` → матч правил → идемпотентный run → create_task ({deal}-replace, assignee owner/creator, lane/priority whitelist, due_in_days) → `activity_log 'automation_fired'`. **Двойной EXCEPTION-swallow** (никогда не блокирует переход) + per-rule изоляция. Composition: задача с `assigned_to` → `trg_notify_task_assigned` сам шлёт уведомление.

---

## DATA MODEL — дельта (аддитивная)

### `automation_rules` (ALTER)
| Колонка | Изменение |
|---------|-----------|
| `trigger_type` | CHECK расширить: `stage_entered`, `status_changed`, `field_changed`. **`task_overdue` — НЕ в этом спринте** (см. Pushback). |
| `action_type` | CHECK расширить: `create_task`, `notify`, `create_activity`, `set_field`. |
| `conditions` | **НОВАЯ** `jsonb NOT NULL DEFAULT '[]'` — массив предикатов, AND-комбинация (v1 без вложенных OR). Элемент: `{"field":"budget","op":"gte","value":1000000}`. ops: `eq/neq/gt/lt/gte/lte/contains/is_null/not_null`. Вычисляется против `to_jsonb(NEW)`. |

`trigger_config` (JSONB, существует) — семантика по триггеру: `stage_entered` → `{pipeline_id, stage_id}`; `status_changed` → `{to?: 'won'}` (опц. целевой статус); `field_changed` → `{field: 'budget'}`.

`action_config` (JSONB, существует) — по действию:
- `create_task`: как сейчас (`task_text`, `assignee`, `lane`, `priority`, `due_in_days`).
- `notify`: `{recipient: 'deal_owner'|'deal_creator', text}` → INSERT notification (тип новый — см. ниже).
- `create_activity`: `{title, description?}` → INSERT activities (`type='note'`) или activity_log.
- `set_field`: `{field, value}` — **whitelist безопасных полей** (`next_step`, `pinned_note`, `probability`, `next_action_date`). **НИКОГДА** `stage_id`/`status`/`type`/`org_id` (каскад/инвариантные).

### `automation_runs` (ALTER — обобщение идемпотентности)
Текущий `UNIQUE(rule_id, project_id, stage_id)` заточен под stage. Обобщаем:
- **НОВАЯ** `trigger_key text` — строковый идентификатор инстанса срабатывания: `stage_entered` → `stage_id::text`; `status_changed` → `NEW.status`; `field_changed` → новое значение поля (`to_jsonb(NEW)->>field`).
- `stage_id` → сделать **nullable** (заполняется только для stage_entered, для контекста).
- Секвенс (одна миграция, executor заменяется тем же заходом — нет конкурентного старого кода на unique):
  1. `ADD COLUMN trigger_key text`;
  2. backfill `trigger_key = stage_id::text`;
  3. `ALTER COLUMN trigger_key SET NOT NULL`, `ALTER COLUMN stage_id DROP NOT NULL`;
  4. `DROP CONSTRAINT` старый unique; `ADD UNIQUE(rule_id, project_id, trigger_key)`.

Идемпотентность: правило стреляет **один раз на (rule, project, trigger_key)** — тот же анти-спам паттерн S29, обобщённый (по стадии/статусу/значению).

### `notifications.type` CHECK
Добавить `automation` (или переиспользовать generic). Действие `notify` пишет уведомление напрямую (не через task_assigned). CHECK расширить как в 045 (`deal_won`).

### RBAC / RLS — БЕЗ изменений
`automation_rules`/`automation_runs` RLS уже: select org-wide (для UI), insert/update/delete — org + `current_org_role() IN ('owner','admin')`; runs — только definer-триггер пишет. Новые колонки покрыты существующими политиками. Матрица (существующая):
```
             | Create | Read | Update | Delete | Toggle |
Admin/Owner  |   ✓    |  ✓   |   ✓    |   ✓    |   ✓    |
Manager      |   ✗    |  ✓   |   ✗    |   ✗    |   ✗    |   (только видит, для прозрачности)
Viewer       |   ✗    |  ✓*  |   ✗    |   ✗    |   ✗    |
```

---

## ENGINE — `run_stage_automations()` (обобщение тела)

> **Полный исполняемый SQL движка — в `sprint-S-WF-2A.md` §5** (это дизайн-псевдокод; CC берёт готовое тело из 2A, не транскрибирует отсюда). `CREATE OR REPLACE` того же тела, **имя функции и триггер `trg_zz_run_automations` НЕ трогаем** (минимальный diff), **DEFINER/search_path/ACL обязательно сохранить**. Псевдокод для понимания логики:

```
BEGIN
  -- RE-ENTRANCY GUARD (для set_field, чтобы UPDATE projects не зациклил движок)
  IF current_setting('wf.ran', true) = '1' THEN RETURN NEW; END IF;
  PERFORM set_config('wf.ran', '1', true);   -- transaction-local

  -- какие триггеры сработали этим UPDATE:
  fired := [];
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN fired += 'stage_entered'; END IF;
  IF NEW.status   IS DISTINCT FROM OLD.status   THEN fired += 'status_changed'; END IF;
  -- field_changed: проверяется per-rule (поле в trigger_config)

  FOR v_rule IN SELECT * FROM automation_rules WHERE org_id=NEW.org_id AND is_active LOOP
    BEGIN  -- per-rule изоляция (падение одного не гасит остальные)
      -- матч триггера:
      CASE v_rule.trigger_type
        WHEN 'stage_entered'  → 'stage_entered' IN fired AND trigger_config.stage_id = NEW.stage_id
        WHEN 'status_changed' → 'status_changed' IN fired AND (trigger_config.to IS NULL OR = NEW.status)
        WHEN 'field_changed'  → to_jsonb(NEW)->>field IS DISTINCT FROM to_jsonb(OLD)->>field
      END → если не матч, CONTINUE;

      -- conditions (AND-предикаты против to_jsonb(NEW)):
      IF NOT eval_conditions(v_rule.conditions, to_jsonb(NEW)) THEN CONTINUE; END IF;

      -- trigger_key по типу:
      v_key := stage_id::text | NEW.status | to_jsonb(NEW)->>field;

      -- идемпотентный run:
      INSERT INTO automation_runs(rule_id, org_id, project_id, stage_id, trigger_key)
      VALUES (...) ON CONFLICT (rule_id, project_id, trigger_key) DO NOTHING
      RETURNING id INTO v_run; IF v_run IS NULL THEN CONTINUE; END IF;

      -- диспатч действия:
      CASE v_rule.action_type
        WHEN 'create_task'    → (существующая логика)
        WHEN 'notify'         → INSERT notifications(recipient=owner/creator, type='automation', ...)
        WHEN 'create_activity'→ INSERT activities(type='note', title, ..., project_id, org_id)
        WHEN 'set_field'      → whitelist-гард → UPDATE projects SET <field>=<value> WHERE id=NEW.id
      END;

      -- лог + привязка run.task_id (для create_task)
      INSERT INTO activity_log(... 'automation_fired' ...);
    EXCEPTION WHEN OTHERS THEN CONTINUE; END;  -- swallow
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- НИКОГДА не блокирует UPDATE
END;
```

**`eval_conditions(conds jsonb, row jsonb) → bool`** — отдельная `SECURITY DEFINER` (или `STABLE` helper): цикл по массиву, для каждого `{field,op,value}` сравнение `row->>field` с `value` (числовой каст для gt/lt). Пустой `[]` → true.

**Ключевые инварианты (сохранить из S29):**
- Триггер `trg_zz_` — стреляет ПОСЛЕ всех BEFORE-синков (по финальным NEW). Не трогать порядок.
- Двойной EXCEPTION-swallow: побочка НИКОГДА не роняет UPDATE проекта.
- `set_config('wf.ran','1',true)` — transaction-local guard: set_field-каскад (UPDATE projects → снова AFTER UPDATE) видит флаг → RETURN. **v1-ограничение:** один automation-проход на транзакцию (батч-апдейт нескольких проектов в одной txn обработает только первый). Приемлемо для UI-путей (одна сделка за раз). Задокументировать.

---

## PUSHBACK (честно, против MVP-таблицы roadmap)
- **`task_overdue` НЕ в S-WF-2A.** Это НЕ row-триггер — нужен планировщик (скан просроченных задач по расписанию). Roadmap сам кладёт `scheduled_automation_jobs`/pg_cron в «Full»/P2. Полу-собранный task_overdue (в CHECK, но без исполнителя) = мёртвые правила. Делаем отдельным **S-WF-2C** (pg_cron ИЛИ Netlify scheduled function → Edge → скан overdue → те же actions). Схему готовим совместимой (trigger_key generic), но триггер-тип добавим в CHECK только вместе с исполнителем.
- **`set_field` — последним и за guard'ом.** Единственное каскадящее действие. Если хочется совсем безопасно в первой итерации — вынести в S-WF-2A.2. По умолчанию включаю с whitelist + re-entrancy guard.

---

## ДЕКОМПОЗИЦИЯ (roadmap: 1.5–2 спринта)
- **S-WF-2A — движок (backend).** Миграция (CHECK-расширение, `conditions`, `trigger_key` дедуп, notifications.type) + `run_stage_automations` (3 триггера: stage_entered/status_changed/field_changed) + `wf_eval_conditions` + 4 действия (create_task/notify/create_activity/set_field за guard). RLS не меняем. **Исполняемый промпт с полным SQL → `sprint-S-WF-2A.md`.** Гейт: смок ролями (Cowork).
- **S-WF-2B — UI (Settings → Правила).** Таблица правил + редактор (RHF+Zod: trigger picker, conditions-строки, action-config), `use-automation-rules` CRUD, is_active-тогл, «preview: что сработает». D2.
- **S-WF-2C — task_overdue (scheduled).** pg_cron/Edge daily → скан overdue → actions. Отдельно (нужна инфра расписания).

## ROI / Effort / Риски
- **ROI:** закрывает «главный разрыв» — рутина на переходах (напомнить, создать задачу, проставить поле) без ручного труда. Gantt без этого — «половина ценности» (§14).
- **Effort:** 2A ~1 спринт (движок+смок), 2B ~0.6–0.8 (UI), 2C ~0.4 (расписание).
- **Риски:** (1) scope-creep → держим ≤3 триггера/4 действия, без canvas; (2) `set_field` каскад → guard+whitelist; (3) идемпотентность field_changed по значению — если поле осциллирует, каждое новое значение = новый run (анти-спам по значению, не по факту изменения) — задокументировать; (4) EXCEPTION-swallow маскирует баги правил → смок обязателен на каждое действие.

## VERIFICATION (дизайн-уровень)
```
Type Safety:            N/A (2A — SQL; типы в 2B)
RLS Coverage:           PASS (политики automation_* не меняются; новые колонки покрыты)
Backward Compatibility: PASS (аддитивно; старое правило stage_entered→create_task работает как есть; runs backfill trigger_key)
Idempotency:            WARNING (обобщение unique на trigger_key — верифицировать смоком: повтор не дублирует)
Re-entrancy (set_field):WARNING (guard транзакционный — верифицировать: set_field не зацикливает)
```
