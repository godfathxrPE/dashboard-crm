# Ревью: S-WF-2 — Workflow Engine architecture (D3)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `4ce54d7`, crm-architect `schema.md` / `architecture.md` / `learnings.md`, baseline + archive `029` / `045`, UI automation v1)  
**Объект:** `_analysis/sprint-S-WF-2-architecture.md` — design-delta Workflow Engine MVP (эволюция S29 → 2A/2B/2C)  
**Контекст:** roadmap D1/§14; S29 applied (029); 045 `deal_won`; исполняемый handoff `_analysis/sprint-S-WF-2A.md` (отдельное ревью); 050 в репо нет; skill schema: 048 applied, **049 PENDING**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Факты S29 (таблицы, CHECK, unique, `trg_zz_`, EXCEPTION) | ✅ |
| Соответствие roadmap D1 (triggers/actions/scope) | ✅ (+ честный pushback `task_overdue`) |
| DATA MODEL дельта (conditions, trigger_key, CHECK) | ✅ |
| RLS «без изменений» + матрица owner/admin | ✅ |
| Указание: SQL/CC → `sprint-S-WF-2A.md` | ✅ (исправлено относительно раннего черновика) |
| ENGINE: имя + re-entrancy + swallow + DEFINER/ACL | ✅ дизайн / 🟡 только псевдокод |
| `notify` / `create_activity` контракты INSERT | 🟡 недоспецифицированы в DATA MODEL |
| `set_field` (whitelist + anti-dynamic-SQL) | 🟡 whitelist ок; псевдокод выглядит как dynamic UPDATE |
| `trigger_key` NOT NULL vs NULL-значения | 🟡 |
| Пригодность как **исполняемый** CC-промпт | ❌ (это design; CC = `sprint-S-WF-2A.md`) |

**Оценка: 8.5/10 как architecture-delta; 3/10 как runnable sprint.**  
Модель, декомпозиция 2A/2B/2C, pushback по `task_overdue` и инварианты S29 (`zz_`, double EXCEPTION, composition с notify) совпадают с live schema/learnings. Файл **явно** отдаёт полный SQL в 2A — правильная роль. Для CC **не самодостаточен** (и не претендует).  
**Рекомендация:** **не запускать CC по этому файлу**. Использовать как дизайн-источник; исполнение — `_analysis/sprint-S-WF-2A.md` после закрытия блокеров того ревью. Ниже — правки, чтобы architecture ↔ 2A не разъезжались.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| S29 `automation_rules` / `runs` + `run_stage_automations` | ✅ baseline L981–1079, L1420+, unique L1999–2000 (`automation_runs_rule_id_project_id_stage_id_key`), `trg_zz_run_automations` L2674; archive `029_automation.sql` |
| 045 `notifications_type_check` + `deal_won` | ✅ `045_notify_deal_won.sql` L26–28; baseline CHECK без `deal_won` — устарел |
| 048 / 049 | ✅ 048 applied (skill schema); **049 PENDING** (файл `049_task_dep_created_by_default.sql` в репо) |
| 050 workflow engine | ❌ нет |
| UI automation v1 | ✅ `use-automation-rules.ts`, `AutomationsSection`, types только `stage_entered`/`create_task` → **2B** |
| `NotificationType` / bell | ✅ `task_assigned` \| `project_assigned` \| `deal_won` — **без** `automation` → 2B |
| Исполняемый `sprint-S-WF-2A.md` | ✅ есть; architecture L67 / L134 ссылается явно |

---

## Разведка (факт vs claims architecture)

| Утверждение architecture | Live / schema / code |
|--------------------------|----------------------|
| `trigger_type` CHECK = только `stage_entered` | ✅ baseline L1431; schema.md S29; `database.ts` `AutomationTriggerType` |
| `action_type` CHECK = только `create_task` | ✅ baseline L1430; types |
| `trigger_config` / `action_config` JSONB; `is_active`; org_id явный, без `trg_set_org_id` | ✅ schema.md L294–315; `use-automation-rules.ts` L49–50 |
| `UNIQUE(rule_id, project_id, stage_id)` | ✅ **`automation_runs_rule_id_project_id_stage_id_key`** |
| `run_stage_automations` SECURITY DEFINER + `search_path=public,pg_temp` + `trg_zz_run_automations` AFTER UPDATE | ✅ baseline L981–983, L2674; ACL L3863–3864 **service_role only** |
| stage_entered → create_task, `{deal}` replace, assignee owner/creator, lane/priority whitelist, due_in_days | ✅ baseline L1018–1056 |
| double EXCEPTION + per-rule isolation | ✅ L1069–1070, L1076–1078; learnings S27↔S29 |
| composition: task `assigned_to` → `trg_notify_task_assigned` | ✅ 029 header + schema S29 |
| RLS: select org-wide; write owner/admin; runs select-only | ✅ 029 L73–111; schema L335–339 |
| set_field whitelist columns exist | ✅ `next_step`, `pinned_note`, `probability` (**smallint**), `next_action_date` (**date**) |
| conditions example `budget` | ✅ `projects.budget` (bigint) |
| `activities.type='note'` | ✅ enum `activity_type` incl. `note` (baseline L26–34); `title` NOT NULL |
| notifications + type `automation` | 🟡 паттерн 045 ок; live CHECK: `task_assigned`/`project_assigned`/`deal_won` — расширять, **не сужать** |
| Roadmap D1: 4 triggers MVP incl. `task_overdue` | ✅ roadmap L442–457; architecture честно выносит overdue в 2C |
| Порядок AFTER: `on_stage_change` → `trg_notify_project_assigned` → `trg_zz_*` | 🟡 устарело: с 045 есть **`trg_notify_deal_won`** (алфавит: deal_won между on_stage_change и project_assigned); `zz_` по-прежнему последний — инвариант сохранён |
| §ENGINE = полное SQL-тело | ❌ псевдокод L69–116; **намеренно** → 2A §5 (L67) |

---

## С чем согласен полностью

### 1. Эволюция S29, не greenfield

Опора на `automation_rules` / `automation_runs` / `run_stage_automations` + `trg_zz_` — верный якорь. Greenfield tables/triggers не нужны. Совпадает с schema.md S29 и roadmap D1 («таблицы уже есть»).

### 2. Красная линия scope + pushback `task_overdue`

Без visual canvas, JSON-rules, `task_overdue` только с планировщиком (2C) — совпадает с roadmap risks и здравым смыслом: полу-CHECK без executor = мёртвые правила. Pushback L127–129 качественный.

### 3. DATA MODEL: conditions + trigger_key

- `conditions jsonb NOT NULL DEFAULT '[]'` — backward-compat для seed/UI v1.  
- Секвенс backfill `trigger_key = stage_id::text` → NOT NULL → `stage_id` nullable → drop old unique → `UNIQUE(rule_id, project_id, trigger_key)` — корректная обобщённая идемпотентность.  
- Имя старого unique для DROP (в 2A): `automation_runs_rule_id_project_id_stage_id_key` (baseline; live сверить на гейте).

### 4. Имя функции и триггера не трогать

`CREATE OR REPLACE` тела, **не** пересоздавать `trg_zz_run_automations`. Порядок `zz_` после BEFORE-синков и AFTER-логов сохранён (learnings: aa_ first, zz_ last). L67: **DEFINER / search_path / ACL сохранить** — критично и правильно (REPLACE может сбросить attrs, если не прописать явно).

### 5. EXCEPTION-политика и re-entrancy guard

Double swallow + per-rule `BEGIN/EXCEPTION` — канон S29. `set_config('wf.ran','1',true)` transaction-local для `set_field` — правильный класс защиты; v1-лимит «один automation-проход на txn» задокументирован (L123).

### 6. RLS без изменений

Новые колонки покрыты row-level политиками. Write runs по-прежнему только DEFINER. Матрица owner/admin write, manager/viewer read — соответствует `automation_rules_select` (org-wide) + write policies с `current_org_role() IN ('owner','admin')`.

### 7. Декомпозиция 2A / 2B / 2C + явная точка входа CC

Backend → UI (`Settings` уже имеет `AutomationsSection`) → scheduled overdue — здравый cut. L67 / L134: полный SQL и CC → `sprint-S-WF-2A.md` — **роль файла зафиксирована**.

### 8. VERIFICATION design-level

Type Safety N/A для SQL-only 2A; RLS PASS; BC PASS при DEFAULT conditions + backfill; WARNING на idempotency/re-entrancy — верные гейты для smoke.

---

## Блокеры (критично)

### B1. Этот файл — **не** executable CC-промпт

Нет секции **РАЗВЕДКА** с diagnostic commands, нет `050_*.sql`, нет «CC пишет / **не apply**», нет smoke-чеклиста, нет «ЖЁСТКО НЕ ТРОГАТЬ». Это **by design** (L67, L134), но критично для оркестрации: **CC кормить только `sprint-S-WF-2A.md`**.

**Действие:** не править роль файла; в handoff/очереди явно: architecture = read-only design, entrypoint = 2A.

### B2. `notify` в DATA MODEL — неполный контракт INSERT

L35: `{recipient: 'deal_owner'|'deal_creator', text}` → «INSERT notification».  
Live `notifications` (baseline L1707–1718 + 045): **`org_id`, `recipient_id`, `type`, `entity_type`, `entity_id` NOT NULL**; `actor_id` optional. Паттерн 045:

```sql
INSERT INTO public.notifications
  (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
VALUES (NEW.org_id, <owner|creator>, auth.uid(), 'automation', 'projects', NEW.id,
        jsonb_build_object('title', …, 'text', …));
```

Под per-rule EXCEPTION неполный INSERT = «правило мёртвое, UPDATE ок» (класс smoke-бага 045).  
**Правка architecture:** зафиксировать полный INSERT + resolve recipient + skip при NULL; CHECK: `task_assigned|project_assigned|deal_won|automation` (не забыть `deal_won`). 2A уже ближе к этому — синхронизировать формулировку.

### B3. `create_activity` — «activities **или** activity_log» (ambiguous)

L36: «INSERT activities (`type='note'`) **или** activity_log».  
Два разных продукта:

| Цель | Таблица | Контракт |
|------|---------|----------|
| Заметка в CRM / timeline (roadmap E1) | `activities` | `type='note'`, **`title` NOT NULL**, `project_id`, `org_id` |
| Системный audit | `activity_log` | `event_type` + payload; уже пишется `automation_fired` |

MVP: **одно** — `activities` type=note + отдельный `activity_log` `automation_fired` (как сейчас). Иначе design ↔ 2A расходятся. Псевдокод L105 уже ближе к activities — убрать «или activity_log» в DATA MODEL.

---

## Предупреждения (желательно исправить)

### W1. Header «≤4 триггера» vs risk «≤3»

L5: «≤4 триггера»; L141: «≤3 триггера/4 действия»; pushback исключает `task_overdue`.  
Roadmap D1 MVP формально 4 incl. overdue.  
**Правка:** «MVP 2A: 3 row-triggers; 4-й (`task_overdue`) = 2C» — одна формулировка.

### W2. `trigger_key` NOT NULL vs NULL-значения

`field_changed` → `to_jsonb(NEW)->>field` при очистке поля = NULL → INSERT runs падает → swallow.  
**Правка:** `COALESCE(…, '__null__')` (2A уже использует sentinel) — подтянуть в architecture L41/L94.

### W3. `set_field` — CASE-cast, не dynamic SQL

Whitelist полей верный (`next_step` text, `pinned_note` text, `probability` **smallint**, `next_action_date` **date**).  
L106: `UPDATE projects SET <field>=<value>` читается как dynamic SQL.  
Learnings/S27: **жёсткий CASE идентификаторов** + per-field cast. Иначе cast exception → silent fail под EXCEPTION.

### W4. `status_changed` + derived `status`

`status` часто выставляет BEFORE `trg_sync_deal_stage_fields` из `stage_id` (045 comments). AFTER `trg_zz_*` видит финальный NEW — **ок**.  
Документировать: один UPDATE стадии может зажечь и `stage_entered`, и `status_changed` (разные rules / keys) — ожидаемо, не баг.  
Также: `trg_notify_deal_won` уже шлёт won-notify; rule `status_changed→notify` может **дублировать** UX — smoke/product note.

### W5. `eval_conditions` как SECURITY DEFINER

L118: «SECURITY DEFINER (или STABLE helper)».  
Чистая функция над jsonb **не** нуждается в DEFINER. Предпочтительно `IMMUTABLE`/`STABLE` + `search_path` + ACL (preview 2B). Fail-closed на exception — ок. 2A draft: non-DEFINER + grant authenticated — правильнее.

### W6. UI / `NotificationType` / bell — 2B

`NotificationType` без `automation`; `NotificationBell` — known types only. SQL-smoke 2A ок; prod-правила `notify` без 2B = «невидимые» в UI. Не блокер 2A, если не сидить notify в 050.

### W7. «D2» на 2B preview

L135 «preview… D2» — roadmap **D2** = Progression UX (модалка перехода + preview actions), **D1** = engine + Settings UI.  
Preview в Settings-editor = часть 2B/D1; deep preview на drag = D2. Развести, чтобы 2B не раздулся.

### W8. schema.md / skill после apply

Architecture не напоминает обновить `docs/schema.md` + crm-architect schema (conditions, trigger_key, CHECK, engine body). Learnings: schema обновляется **с apply**. Добавить в Cowork-чеклист 2A.

### W9. Re-entrancy: set_field не зажигает последующие field_changed

Guard в начале txn-pass: nested UPDATE после `set_field` не гоняет движок снова — **не** сработают правила `field_changed` на поле, выставленное automation. L123 близко; явно: «v1 не каскадит actions на set_field-результат».

### W10. Заголовок «/architect D3» vs roadmap D1

Roadmap блок **D1** = Workflow Engine MVP; **D3** в roadmap — другой артефакт (delivery architecture). Если «D3» = уровень проработки architect-skill — одной строкой пояснить, чтобы не путать с roadmap D3.

### W11. Условие `stage_entered` и `pipeline_id`

Match по `trigger_config.stage_id = NEW.stage_id` (как S29) — ок; `pipeline_id` в config — UI-контекст. Зафиксировать: engine **не** требует match pipeline (stage_id globally unique в org обычно).

### W12. Нумерация миграции / 049 gate

Architecture не фиксирует `050_workflow_engine.sql`. 2A — да. Skill: **049 PENDING** → apply order 049→050 на гейте; не полагаться на «049 already applied» без MCP list_migrations.

---

## Пропущенные места (inventory для 2A/2B)

| Файл / объект | Строки / факт | Действие |
|---------------|---------------|----------|
| `supabase/migrations/20260712230000_baseline.sql` | L981–1079 engine; L1420–1449 tables; L1999–2000 unique; L2674 trigger; L3863–3864 ACL | канон REPLACE |
| `supabase/migrations/archive/029_automation.sql` | полный S29 + seed | reference |
| `supabase/migrations/045_notify_deal_won.sql` | CHECK + INSERT notifications + `trg_notify_deal_won` | шаблон `notify`; порядок AFTER |
| `src/lib/hooks/use-automation-rules.ts` | v1 types/CRUD | **2B only** |
| `src/types/database.ts` | Automation* L232+; NotificationType L380 | **2B** |
| `src/components/settings/AutomationsSection.tsx` | Settings UI v1 | **2B** |
| `src/components/layout/NotificationBell.tsx` | types/routes | **2B** для `automation` |
| `src/lib/constants/automation.ts` | lane/priority/assignee whitelist UI | **2B** + sync с SQL CASE |
| `docs/schema.md` / skill `schema.md` | S29 v1 only | обновить **на apply** |
| Seed 029 (3 пресета) | stage_entered→create_task | остаются валидны под новым CHECK |
| `_analysis/sprint-S-WF-2A.md` | executable 050 | **точка входа CC** |
| `improvements/CRM-ROADMAP-projects-deals.md` | D1 L442–457 | alignment source |

---

## Предлагаемые правки в architecture

1. **B2:** полный `INSERT notifications (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)` + recipient resolve; CHECK с `deal_won`+`automation`.  
2. **B3:** `create_activity` = только `activities` type=`note` (title NOT NULL); `activity_log` — только `automation_fired`.  
3. **W1–W3, W9:** выровнять «3 triggers»; `COALESCE`/`__null__` trigger_key; CASE-cast set_field; non-cascade field_changed.  
4. **W5:** `wf_eval_conditions` = non-DEFINER IMMUTABLE/STABLE.  
5. **W4, W7–W8, W10–W12:** dual fire stage+status; D1 vs D2; Cowork schema; label D1; 049→050 order.  
6. Опционально: имя unique `automation_runs_rule_id_project_id_stage_id_key` в §DATA MODEL; актуальный список AFTER-триггеров incl. `trg_notify_deal_won`.

---

## crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА (claims «живой БД») | ✅ факты S29 подтверждены baseline/schema (executable РАЗВЕДКА — в 2A) |
| Реальные table/column names | ✅ |
| Реальные paths / engine names | ✅ |
| learnings (EXCEPTION, zz_, composition, CC≠apply) | ✅ design; 🟡 ACL/process в 2A |
| SQL отдельным файлом; CC не apply | ✅ отсылка к 2A (L67/L134); process apply — в 2A |
| org_id / RLS | ✅ без изменений; runs definer-only |
| New/replace functions: DEFINER + search_path + ACL | 🟡 «сохранить» сказано (L67); полное тело — в 2A |
| No `flowType: 'implicit'` | N/A |
| DELETE CASCADE | N/A (FK already CASCADE) |
| CSS variables | N/A |
| schema.md after migration | 🟡 не упомянуто (W8) |

---

## Чеклист перед CC

- [ ] **Не** кормить CC только `sprint-S-WF-2-architecture.md`  
- [ ] CC-вход: `_analysis/sprint-S-WF-2A.md` (после закрытия блокеров **того** ревью)  
- [ ] Синхронизировать architecture ↔ 2A по B2–B3 / W2–W3  
- [ ] Миграция: `supabase/migrations/050_workflow_engine.sql` (после 049); **не apply** из CC  
- [ ] На гейте: MCP `list_migrations` — 049 pending? → 049 затем 050; unique name + `notifications_type_check` live  
- [ ] Smoke: stage_entered compat; status/field triggers; conditions; idempotent re-entry; set_field no loop; notify/activity INSERT; dual stage+status; advisors  
- [ ] Cowork: `docs/schema.md` + skill schema  
- [ ] 2B: types, Settings editor, `NotificationType`/`NotificationBell`  
- [ ] 2C: `task_overdue` + scheduler (**не** в CHECK 2A)

---

## Итог одной строкой

Architecture S-WF-2 — **сильный design-delta** (S29→rules engine, scope, idempotency, 2A/2B/2C, явная отсылка SQL в 2A); **не runnable sprint**. Запуск CC — только через `sprint-S-WF-2A.md`; добить в architecture контракты `notify`/`create_activity` и anti-dynamic `set_field`, чтобы design и handoff не расходились.
