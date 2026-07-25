# Ревью: S-WF-2C-A — task_overdue (pg_cron, миграция 051)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui` @ `6e134b2`; `supabase/migrations/050_workflow_engine.sql`, `051_task_overdue.sql`, baseline, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-WF-2C-A.md` — backend-only handoff: CHECK `task_overdue`, nullable `automation_runs.project_id`, partial-unique, `idx_tasks_overdue`, `run_overdue_automations()`, pg_cron daily  
**Контекст:** S-WF-2A (`050`, applied), S-WF-2B UI (`661d6a9`), 2C-A commit `58c2515` (051), 2C-B UI+route `ad6a1d2`, docs 051 `91fd2a0`. Файл спринта сейчас **untracked** (`??`), SQL внутри **byte-identical** с `supabase/migrations/051_task_overdue.sql` (140 строк).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| SQL-дизайн / имена / контракты 050+baseline | ✅ |
| SQL в промпте ≡ `051_task_overdue.sql` | ✅ identical |
| CHECK `trigger_type` + не трогать `action_type` / `run_stage_automations` | ✅ |
| `project_id` DROP NOT NULL + W2 partial-unique + W3 skip no-op + W5 idx + W7 company/contact | ✅ |
| DEFINER + `search_path` + REVOKE/GRANT service_role | ✅ learnings |
| Scope: только 051, не apply из CC, не `src/` | ✅ соблюдено в `58c2515` |
| Нумерация 051 на момент написания (applied ≤050) | ✅ тогда; **сейчас stale** (docs: 001–061, 051 applied) |
| CC-работа | ✅ **уже сделана** (`58c2515`) |
| Cowork apply + schema | ✅ по `docs/schema.md` / skill schema (051 applied 2026-07-17; дельта задокументирована) |
| Хвосты W1 NotificationBell / UI task_overdue | ✅ закрыты в **S-WF-2C-B** (`ad6a1d2`) |
| Форма индекса vs глобальный скан | 🟡 косметика planner |
| Семантика «один fire навсегда» (W6) | 🟡 product-принятие v1 |
| Повторный запуск CC | ❌ **не делать** |

**Оценка: 9/10** (как handoff на момент написания — executable, имена/контракты точны; SQL-предупреждения W2/W3/W5/W7 уже вшиты).  
**Рекомендация:** **не запускать Claude Code.** Миграция, apply (по docs), UI 2C-B и schema-дельта **уже в истории репо**. Спринт полезен как архив/аудит, не как executable prompt.

---

## Статус

| Заход | Статус в репо (2026-07-19) |
|-------|----------------------------|
| 050 workflow engine (S-WF-2A) | ✅ `050_workflow_engine.sql`; applied |
| `051_task_overdue.sql` | ✅ 140 строк, commit `58c2515` (ancestor of HEAD) |
| SQL спринта ≡ 051 | ✅ `diff` пустой |
| pg_cron / `run_overdue_automations` в живой БД | ✅ по `docs/schema.md` L114–126 / skill schema: **051 applied 2026-07-17** (прямую `cron.job` из репо не верифицируем) |
| `docs/schema.md` + skill `references/schema.md` | ✅ блок 051, partial-unique, job, history |
| UI task_overdue + NotificationBell route | ✅ S-WF-2C-B: `AutomationTriggerType` + `task_overdue`, `NotificationBell.tsx` L19–21 → `/tasks` |
| Повторный CC по этому спринту | ❌ no-op / риск пустого/дублирующего commit |

---

## Разведка (claim vs live)

| Утверждение спринта | Live |
|---------------------|------|
| applied по 050 → следующий **051** | 🟡 **на момент 2C-A верно**; **сейчас** docs: applied **001–061**, 051 уже applied |
| `trigger_type` CHECK: 3 значения → +`task_overdue` | ✅ 050 L9–11; 051 L6–8 |
| `action_type` уже `notify`/`create_activity` | ✅ 050 L13–15 |
| `automation_runs.project_id` NOT NULL → drop | ✅ 051 L16; baseline runs L1442 (исторически NOT NULL) |
| UNIQUE `(rule_id, project_id, trigger_key)` | ✅ 050 L28–30 `automation_runs_rule_project_key_uniq` |
| Partial unique `(rule_id, trigger_key) WHERE project_id IS NULL` | ✅ 051 L21–23 |
| `idx_tasks_overdue` partial | ✅ 051 L26–28 |
| `task_id` nullable на runs | ✅ baseline |
| `tasks`: deadline, lane, project_id nullable, assigned_to/created_by, org_id, text, company_id, contact_id | ✅ baseline tasks ~L1916–1933 |
| notifications NOT NULL: org_id/recipient_id/type/entity_type/entity_id; type `automation` | ✅ baseline + 050 L35–37 |
| activities: type/title/org_id NOT NULL; project/company/contact/created_by nullable | ✅ baseline |
| activity_log.project_id / user_id nullable | ✅ baseline |
| `wf_eval_conditions(jsonb,jsonb)` | ✅ 050 L42–72 |
| `run_stage_automations` всегда пишет `project_id = new.id` | ✅ 050 L165–169 |
| `entity_type='tasks'` допустим (text, без enum-check) | ✅ baseline notifications |
| UI не отдаёт `task_overdue` | 🟡 **было** true; **сейчас** UI отдаёт (`automation.ts` L46–50, validator, RuleEditorModal) |
| NotificationBell: automation → `/deals/{id}` | 🟡 **было**; **сейчас** ветка `entity_type==='tasks'` → `/tasks` (L19–21) |
| pg_cron 1.6.4 available / personal overdue | ⚪ pre-flight Cowork (в шапке спринта); схеме не противоречит |
| Прод ref `uoiavcabxgdjugzryrmj` | ✅ совпадает с docs/schema |

Ложных table/column/function имён **не найдено**. SQL-блок спринта **идентичен** файлу миграции.

---

## С чем согласен полностью

### 1. Декомпозиция и scope

`task_overdue` — time-based / task-centric (не row-trigger на `projects`) — согласуется с architecture pushback 2A. Планировщик **pg_cron in-Postgres** (не Netlify/Edge) — консистентно с DEFINER-движком. UI → 2C-B; create_task/set_field no-op v1 — корректный MVP (notify + create_activity уже в action CHECK 050). «Миграцию пишешь, НЕ применяешь» — правильный гейт.

### 2. DDL §1–2

- DROP/ADD `automation_rules_trigger_type_check` — тот же идемпотентный паттерн, что 050.  
- `project_id DROP NOT NULL` — обязателен: `tasks.project_id` nullable (личные задачи).  
- 3-колоночный unique для project-триггеров не ломается: `run_stage_automations` всегда пишет `new.id`.  
- **Partial unique** `automation_runs_rule_key_null_project_uniq` — закрывает NULL≠NULL дыру PG для personal runs.  
- **Partial index** `idx_tasks_overdue` — predicate совпадает с «есть deadline и не done».

### 3. Executor `run_overdue_automations`

| Блок | Оценка |
|------|--------|
| SECURITY DEFINER + `search_path = public, pg_temp` | ✅ |
| REVOKE public/anon/authenticated; GRANT service_role | ✅ (cron/SQL editor — superuser/postgres) |
| Скан `deadline < now() AND lane <> 'done'` | ✅ NULL-deadline отсекается (`NULL < now()` → unknown) |
| Org-scoped rules `trigger_type = 'task_overdue'` | ✅ |
| **W3:** skip action ∉ (notify, create_activity) **до** insert run | ✅ 051 L66–68 |
| conditions: `wf_eval_conditions(r.conditions, to_jsonb(t))` | ✅ поля задачи |
| Идемпотентность: `trigger_key = t.id::text` + NOT EXISTS | ✅ task PK глобален |
| notify: assignee→creator; type `automation`; entity `tasks`; actor null | ✅ |
| `{task}` replace; title `left(t.text, 120)` | ✅ симметрия `{deal}` 050 |
| create_activity: note + company_id/contact_id (W7) + nullable project_id | ✅ |
| activity_log `automation_fired` | ✅ |
| Per-(rule,task) + outer EXCEPTION swallow | ✅ learnings S29 executor |
| Не трогает `run_stage_automations` / action CHECK | ✅ |

### 4. pg_cron §4

`CREATE EXTENSION IF NOT EXISTS`, unschedule-then-schedule `wf-overdue-daily`, `0 6 * * *` (06:00 UTC = 09:00 MSK). Fallback Dashboard прописан. Ручной `select run_overdue_automations()` в SQL editor обходит REVOKE authenticated.

### 5. Процесс

- Не apply из CC; не `src/`; commit только 051 — **соблюдено** в `58c2515` (1 file, +140).  
- W6 (один fire) и W1 (NotificationBell → 2C-B) зафиксированы; **2C-B и schema-дельта выполнены** отдельно.  
- Cowork smoke txn+rollback — корректный гейт (learnings).

---

## Блокеры (критично — исправить до запуска)

### B1. Операционный: CC уже выполнен — повторный прогон запрещён

Файл `supabase/migrations/051_task_overdue.sql` **существует**, commit `58c2515` на ancestry HEAD, SQL ≡ промпт.  
Повторный Claude Code даст no-op rewrite / пустой diff / риск лишнего commit.  

**Действие:** skip CC. Если нужна проверка живой БД — только read-only (`cron.job`, list_migrations), не «написать 051 заново».

**Схемных/SQL-блокеров для исходного handoff нет.**

---

## Предупреждения (желательно учесть)

### W1. Шапка спринта устарела относительно текущего репо

Спринт утверждает: applied ≤050, UI 2C-B ещё нет, schema обновлять после apply.  
**Сейчас:** 051 applied (docs), UI+route 2C-B в коде, schema-дельта в docs+skill.  
Не блокер исполнения (уже поздно), но **вводит в заблуждение** при «можно в CC?». Имеет смысл баннер «DONE / archive» при правке файла (не обязательно для истории).

### W2. Форма `idx_tasks_overdue` (org_id leading)

Executor: **глобальный** `WHERE deadline < now() AND lane <> 'done'` (без фильтра org).  
Индекс `(org_id, deadline) WHERE …` может хуже матчить planner, чем `(deadline)` / `(deadline, org_id)`. На малых объёмах ок; при росте — `EXPLAIN` на проде.

### W3. Идемпотентность «раз навсегда» (W6 спринта)

Повторная просрочка после done→reopen / сдвига deadline **не** стрельнёт (run уже есть). Для v1 принято; copy UI 2C-B должен говорить «напоминаем один раз» (проверить продукт-копию при желании).

### W4. notify без `action_config.recipient`

050: deal_owner/deal_creator. 051: жёстко `coalesce(assigned_to, created_by)`. Совпадает с узким скоупом; 2C-B UI это отражает (select recipient скрыт для overdue).

### W5. EXCEPTION глотает constraint-ошибки

Паттерн 050/S29 (learnings: AFTER-исполнитель глотает). Smoke на гейте обязателен был: notify + idempotency + personal null project_id + conditions. Миграция «прошла» ≠ side-effects проверены.

### W6. Гонка insert без `ON CONFLICT` (мягко)

Явный NOT EXISTS + insert; partial unique / 3-col unique ловят race (unique_violation → exception → continue). Для project-linked 3-col unique; для personal — partial. Порядок «run → side effect» как в 050: при падении после insert side-effect может потеряться навсегда (редко; тот же класс риска, что stage-engine).

### W7. Спринт без блока «РАЗВЕДКА»-команд CC

Факты БД в шапке (Cowork) + полный SQL — для pure-DDL достаточно. Классических `grep`/`find` в теле нет; для этого scope допустимо.

---

## Пропущенные места

| Файл / зона | Строки / факт | Действие |
|-------------|---------------|----------|
| `supabase/migrations/051_task_overdue.sql` | = спринт | **CC done** — не трогать |
| `src/components/layout/NotificationBell.tsx` | L19–21 | **2C-B done** |
| `src/lib/constants/automation.ts`, validators, RuleEditorModal | `task_overdue` в UI | **2C-B done** |
| `docs/schema.md` + skill schema | блок 051 | **docs done** (`91fd2a0`) |
| Индекс shape vs query | 051 L26–28 vs L47 | опц. EXPLAIN |
| `_analysis/sprint-S-WF-2C-A.md` | untracked | архив/добавить в git по желанию |

Ложных путей / несуществующих объектов в SQL-теле **нет**.

---

## Предлагаемые правки в спринт

1. **Статус-баннер (если файл ещё используют):**  
   `DONE — CC 58c2515; applied 051; 2C-B ad6a1d2; docs 91fd2a0. Не пересоздавать 051.`  
2. **Правок SQL не требуется** — файл и промпт уже согласованы.  
3. Опционально: убрать/пометить «ПОСЛЕ ТЕБЯ — Cowork» как выполненный checklist.

Без правок файла спринта **запускать CC не нужно**.

---

## Чеклист crm-architect

- [x] SQL миграция отдельным файлом; **не** apply из CC  
- [x] Реальные table/column/RPC (050 + baseline + schema)  
- [x] `SECURITY DEFINER SET search_path = public, pg_temp` + ACL  
- [x] org_id из строки задачи/правила (не `current_org_id()` в фоне)  
- [x] RLS automation_* не ломается; write runs — DEFINER  
- [x] action_type / run_stage не трогаем  
- [x] DELETE/CASCADE — N/A  
- [x] CSS / client / `flowType: implicit` — N/A  
- [x] schema.md после миграции — **сделано** (docs + skill)  
- [~] РАЗВЕДКА — pre-flight Cowork в шапке (достаточно для pure-DDL)

---

## Чеклист перед следующим шагом

- [x] 050 в репо; 051 создан и закоммичен  
- [x] SQL: W2 partial unique, W3 no-op skip, W5 index, W7 company/contact  
- [x] ЖЁСТКО: src, apply из CC, run_stage, action CHECK — соблюдено  
- [x] Apply 051 + schema (по docs/skill: applied 2026-07-17)  
- [x] 2C-B: NotificationBell entityRoute + UI trigger `task_overdue`  
- [ ] (опц.) read-only health: `select jobname, schedule, active from cron.job where jobname='wf-overdue-daily'`  
- [ ] (опц.) EXPLAIN скана overdue при росте `tasks`

---

**Итог:** handoff **качественно написан** и **фактически полностью закрыт** в репозитории и (по schema-docs) в проде. Блокеров схемы/SQL нет. **Claude Code по этому спринту не запускать** — следующий смысл только операционный health-check cron/job, не переписывание 051.
