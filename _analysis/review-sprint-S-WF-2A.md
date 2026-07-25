# Ревью: S-WF-2A — Workflow Engine backend (миграция 050) — v2

**Дата:** 2026-07-16  
**Ревьюер:** Grok (повторное ревью после v2 ПОЛНЫЙ SQL; код `main` @ `4ce54d7`, baseline L981–1079, 045, crm-architect `schema.md`)  
**Объект:** `_analysis/sprint-S-WF-2A.md` — миграция `050_workflow_engine.sql`  
**Контекст:** дизайн `sprint-S-WF-2-architecture.md` v2; UI — S-WF-2B; `task_overdue` — S-WF-2C

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + зафиксированные имена constraint | ✅ |
| DDL §1–3 (CHECK, conditions, trigger_key, notifications) | ✅ |
| `wf_eval_conditions` + ACL | ✅ |
| Полное SQL `run_stage_automations` | ✅ **закрыт B1** |
| DEFINER + search_path + REVOKE/GRANT | ✅ **закрыт B3** |
| notify INSERT (NOT NULL) | ✅ **закрыт B2** |
| `trigger_key` COALESCE / sentinel | ✅ |
| set_field whitelist CASE (no dynamic SQL) | ✅ |
| create_task S29 1:1 | ✅ |
| create_activity `note` + NOT NULL | ✅ |
| Scope / Cowork smoke / schema update | ✅ |
| activity_log payload vs S29 | 🟡 |
| create_task без guard на NULL assignee | 🟡 (как S29) |
| `probability` ::int без range check | 🟡 |

**Оценка: 9/10** (было 6.5/10). Блокеры B1–B3 закрыты; миграция **готова к CC** (один файл, не apply).  
**Рекомендация:** **запускать в Claude Code как есть**; W1–W3 — по желанию в том же файле одной-двумя строками.

---

## Статус

| Заход | Репо |
|-------|------|
| S29 engine (baseline) | ✅ |
| 045 `deal_won` | ✅ файл |
| 049 `created_by` default | ✅ файл; спринт: applied Cowork (skill schema может отставать) |
| 050 workflow_engine | ❌ ожидаемо |

---

## Разведка (верификация)

| Утверждение v2 | Live |
|----------------|------|
| unique `automation_runs_rule_id_project_id_stage_id_key` | ✅ baseline L1999–2000 |
| notifications CHECK: 3 типа + automation | ✅ 045 L27–28 + новый тип |
| `run_stage_automations` DEFINER + search_path | ✅ baseline L981–983 |
| GRANT service_role only | ✅ baseline L3863–3864 |
| activities: `type`, `title`, `org_id` NOT NULL; enum `note` | ✅ |
| Следующий файл **050** после `049_*.sql` | ✅ |

---

## С чем согласен полностью

### 1. DDL (§1–3)

- `DROP CONSTRAINT IF EXISTS` + re-add — идемпотентно (045-style).
- Backfill `trigger_key = stage_id::text` перед NOT NULL — backward-compat для S29 runs.
- `stage_id` nullable на runs — только для non-stage триггеров; stage_entered пишет `new.stage_id` (L185).
- `UNIQUE(rule_id, project_id, trigger_key)` + `ON CONFLICT` на те же колонки (L188) — согласовано.

### 2. `wf_eval_conditions`

`IMMUTABLE`, `search_path`, fail-closed на unknown op/exception, REVOKE public/anon — ок для AND-предикатов и preview 2B.

### 3. Движок — структура

| Блок | Оценка |
|------|--------|
| Re-entrancy `wf.ran` первым | ✅ |
| `SELECT *` всех active rules org | ✅ (W8 закрыт) |
| Матч по `trigger_type` в PL/pgSQL | ✅ |
| `status_changed` optional `to` | ✅ |
| `field_changed` + `coalesce(..., '__null__')` | ✅ |
| Per-rule + outer EXCEPTION | ✅ |
| `create_task` — lane/priority/assignee/deadline/org_id | ✅ совпадает с baseline L1018–1056 |
| `notify` — полный INSERT | ✅ |
| `set_field` — жёсткий CASE whitelist | ✅ |
| ACL после REPLACE | ✅ |

### 4. notify branch (L230–247)

```sql
(org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
```

Соответствует NOT NULL baseline L1707–1714; skip при `v_recipient IS NULL` — правильно (иначе silent fail).

### 5. Процесс

ЖЁСТКО НЕ ТРОГАТЬ `src/`, не apply, Cowork smoke 1–9 + **schema.md** (п.9) — по learnings.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `activity_log` payload — смена формата для `create_task`

S29 (baseline L1065): `jsonb_build_object('rule_id', …, 'task_id', …, 'stage_id', …)`.

v2 (L289–290): `rule_id`, `trigger`, `action`, `trigger_key` — **без `task_id`/`stage_id`**.

`task_id` остаётся в `automation_runs.task_id` (L228). Потребителей `automation_fired` в `src/` нет — **не блокер**. Если 2B/UI читает log — добавить `task_id` в payload для `create_task` (опционально, backward-compat).

### W2. `create_task` при NULL `v_assignee`

Как S29: INSERT с `assigned_to = null` допустим (`tasks.assigned_to` nullable). Notify не сработает. Можно `IF v_assignee IS NULL THEN CONTINUE` после run insert — улучшение, не обязательно.

### W3. `probability` ::int

Колонка `smallint`; `'abc'` → per-rule swallow (смок п.8). Диапазон 0–100 не валидируется — ок для v1 под swallow + admin-only rules.

### W4. Combined `stage_entered` + `status_changed` на одном UPDATE

При смене стадии BEFORE-триггер может выставить `status='won'`. Один UPDATE может сработать **два** правила с разными `trigger_key` — ожидаемо; в smoke Cowork стоит один кейс явно (п.3 отдельно от п.2).

### W5. Skill `schema.md` vs шапка «049 applied»

Спринт: 049 applied в сессии Cowork. Skill на момент ревью может ещё писать PENDING — п.9 Cowork закрывает; **не блокер для CC**.

### W6. `NotificationType` / колокольчик

2A верно не трогает `src/`. Правила `notify` до 2B в UI не отобразятся в bell labels — smoke п.7 проверяет INSERT в БД, не UX.

---

## Diff-check: create_task vs baseline S29

| Элемент | Baseline | v2 SQL |
|---------|----------|--------|
| `{deal}` replace | ✅ | ✅ |
| assignee CASE | ✅ | ✅ |
| lane `now` default | ✅ | ✅ (when 'now' убран — else now) |
| priority default normal | ✅ | ✅ |
| due_in_days default 3 | ✅ | ✅ |
| explicit org_id on tasks | ✅ | ✅ |
| automation_runs.task_id | ✅ | ✅ |

**Регрессии create_task не найдены.**

---

## crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА | ✅ |
| Real table/column names | ✅ |
| SQL отдельным файлом; CC не apply | ✅ |
| org_id / RLS без изменений | ✅ |
| DEFINER + search_path + ACL на executor | ✅ |
| learnings (zz_, swallow, CC≠apply) | ✅ |
| schema.md после apply | ✅ в Cowork п.9 |

---

## Чеклист перед CC

- [x] B1 — полное SQL-тело в файле  
- [x] B2 — notify INSERT  
- [x] B3 — DEFINER + ACL  
- [ ] W1 — task_id в activity_log (опционально)  
- [x] Только `supabase/migrations/050_workflow_engine.sql` + commit  
- [x] Cowork: apply 050 → smoke 1–9 → schema.md  

**Вердикт: запускать в CC.**