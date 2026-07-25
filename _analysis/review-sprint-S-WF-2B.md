# Ревью: S-WF-2B — Workflow UI (Settings → Правила)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui` @ `6e134b2`; `src/`, `supabase/migrations/050_workflow_engine.sql` + `051_task_overdue.sql`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-WF-2B.md` — UI-редактор automation-правил под движок 050 (3 триггера × 4 действия + conditions)  
**Контекст:** S-WF-2A applied (`050`, 2026-07-16); S-WF-2B **уже закоммичен** (`661d6a9`, 2026-07-17); S-WF-2C-A/B поверх (`051` + UI `task_overdue`, `ad6a1d2`); предыдущее `_analysis/review-sprint-S-WF-2B.md` (2026-07-17) **stale** — фиксировало «файлов ещё нет».

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (диагностика примитивов) | ✅ команды и API сходятся |
| Соответствие SQL 050 / schema.md (типы, ops, set_field whitelist, notify) | ✅ |
| Качество промпта как handoff (scope, маппинг, red lines) | ✅ (исторически) |
| **Базовый claim «UI только stage_entered→create_task» vs live** | ❌ **устарел** |
| **Inventory: файлы задач 1–6 ещё «создать»** | ❌ **уже в main-line** |
| Scope: чистый /code, без БД, без canvas | ✅ (и соблюдён в коммите) |
| Риск повторного запуска в CC после 2C-B | ❌ **регресс `task_overdue` UI** |
| crm-architect checklist (как план) | ✅ / 🟡 мелочи в тексте |

**Оценка: 4/10 как executable handoff сейчас; 9/10 как исторический дизайн-промпт (уже исполнен).**  
**Рекомендация:** **не запускать в Claude Code.** Спринт выполнен (`661d6a9`); поверх него уже S-WF-2C-B. Повторный прогон перезапишет живой UI и снимет/сломает `task_overdue`. Пометить спринт как **DONE** / архив; для доработок — отдельный delta-handoff, не этот файл as-is.

---

## Статус

| Заход | Статус в репо (live, 2026-07-19) |
|-------|----------------------------------|
| 050 workflow engine (S-WF-2A) | ✅ `supabase/migrations/050_workflow_engine.sql`; schema.md 047–050 |
| 051 task_overdue (S-WF-2C-A) | ✅ `supabase/migrations/051_task_overdue.sql`; schema.md 051 |
| Types `Automation*` | ✅ 3+`task_overdue` триггера, 4 действия, `conditions`, set_field whitelist (`database.ts` ~L230–325) |
| `NotificationType` | ✅ `… \| 'automation'` (L432); Bell: Zap, TYPE_LABEL, route, payload |
| `AutomationsSection` | ✅ org-wide list, chip-filter, describeRule 3×4 (+ overdue), edit/toggle/delete, **нет** AddForm |
| `settings/automation/RuleEditorModal.tsx` | ✅ RHF+Zod, Modal form id, fromRule/toInput, status `{}` |
| `settings/automation/ConditionRow.tsx` | ✅ field/op/value; nullary ops; fieldOptions trigger-aware |
| `validators/automation-rule.ts` | ✅ superRefine + 2C: `task_overdue` + action whitelist notify/activity |
| `constants/automation.ts` | ✅ FIELD/STATUS/OP/SET_FIELD + comment S-WF-2/050; + TASK_FIELD для 2C |
| Хук `use-automation-rules` | ✅ `AutomationRuleInput` + `conditions?`; CRUD generic + `current_org_id` |
| S-WF-2B commit | ✅ `661d6a9` — ровно файлы из блока КОММИТ спринта |
| S-WF-2C-B commit | ✅ `ad6a1d2` — task_overdue в UI + Bell `entity_type=tasks` → `/tasks` |

---

## Разведка (claim спринта vs live)

| Утверждение спринта | Live 2026-07-19 |
|---------------------|-----------------|
| UI умеет только `stage_entered → create_task` (inline useState) | ❌ **ложь.** Rebuild 2B + 2C-B: `RuleEditorModal`, chip-filter, `describeRule` на 4 триггера |
| `settings/automation/*` создать | ❌ уже есть (`RuleEditorModal.tsx` 2026-07-17, `ConditionRow.tsx`) |
| `validators/automation-rule.ts` создать | ❌ есть; schema включает `task_overdue` (шире, чем 2B) |
| Modal: нет `open`; isDirty/footer/maxWidth | ✅ `Modal.tsx` L24–35; TaskModal + RuleEditor: `form="…"`, footer submit, `isDirty` |
| Modal focus-trap | ✅ **нет**; Esc + overlay + `role="dialog"` / `aria-modal` — спринт честен |
| Combobox `value: string \| null` | ✅; в RuleEditor — **Controller** (как ProjectModal) |
| AssigneeSelect = uuid профиля, не deal_owner | ✅; automation — native `<select>` + `AUTOMATION_ASSIGNEE_OPTIONS` |
| Button `primary\|secondary\|ghost`, `md\|sm` | ✅ API; в редакторе фактически native buttons (ок, CSS-var) |
| 050: 3×4 + 9 ops + set_field whitelist | ✅ migration L11–15, L134–139, L252–259; schema.md automation_rules |
| `status_changed`: empty `to` → SQL `->>'to' IS NULL` | ✅ 050 L136–137; toInput: `t_status_to ? {to} : {}` (L85–86) — **не** `{to:''}` |
| notify: type `automation`, payload text/title, entity projects | ✅ schema + Bell L18–25, L67–69 |
| Pipeline-filter «теряет» status/field | ✅ **снят**; org-wide + chip `filter` по `trigger_type` |
| `task_overdue` в UI **не** добавлять (2C) | ⚠️ в **live уже добавлен** 2C-B; красная линия 2B соблюдена в исходном коммите 2B, сейчас UI шире промпта |
| Field classes `border-input bg-surface … text-[12px]` | ✅ RuleEditor + ConditionRow |

Диагностические команды из РАЗВЕДКИ валидны для референса API, но **не** описывают текущее состояние Automations UI.

---

## С чем согласен полностью (качество исходного промпта)

### 1. Scope и красные линии (на момент написания)

Чистый frontend, без миграций, set_field = SQL 050 (`next_step` / `pinned_note` / `next_action_date` / `probability`), без visual canvas, `task_overdue` → отдельный 2C — корректно относительно schema.md 050/051 и learnings (EXCEPTION-политика движка, org-граница).

### 2. Контракт form ↔ engine

Явный маппинг `status_changed` empty → `{}` (B2) — критично и **реализовано**.  
create_task defaults (`lane:'now'`, assignee/priority/due); conditions `?? []`; nullary ops → `value:''`.

### 3. Modal / RHF+Zod+useFieldArray

Паттерн TaskModal (условный монтаж, form id, footer submit, isDirty). Плоский Zod + superRefine — RHF-friendly. ConditionRow + useFieldArray — в духе PhoneFields. Feature-folder `settings/automation/` — по architecture (модалки не в `components/modals/`).

### 4. Assignee / NotificationBell / org-wide list

Native select + `AUTOMATION_ASSIGNEE_OPTIONS` (не AssigneeSelect). Bell: `'automation'`, Zap, `/deals/${id}` для projects, `payload.text \|\| title`. Org-wide list вместо pipeline-only filter — обязательно и сделано.

### 5. Курируемые поля

`AUTOMATION_FIELD_OPTIONS` без org_id/type/stage_id/status — согласовано с dynamic `->>` в SQL и отдельным `status_changed`.

### 6. Хук

CRUD generic + явный `current_org_id` на create (нет `set_org_id` на automation_rules) — не ломать; cast `unknown` — паттерн сохранён.

---

## Блокеры (критично — до «запуска» в CC)

### B1. Спринт уже исполнен — re-run запрещён

**Evidence:**
- `git log`: `661d6a9 feat(workflow): S-WF-2B — UI редактора правил (3 триггера × 4 действия + conditions)` — 8 файлов = блок КОММИТ спринта.
- Live: `AutomationsSection` импортирует `RuleEditorModal`; inline `AddForm` отсутствует; types/constants/validator/hook расширены.

Промпт всё ещё инструктирует CC «создать/переписать» эти файлы с baseline «только stage_entered→create_task».  
**Действие:** не запускать. Статус sprint = **DONE**. При необходимости — gate/smoke, не re-implement.

### B2. Повторный прогон регрессирует S-WF-2C-B

Live UI **намеренно** шире 2B:
- `AutomationTriggerType` += `task_overdue`
- `ruleSchema` + action whitelist notify/create_activity для overdue
- `AUTOMATION_TASK_FIELD_OPTIONS` для conditions на tasks
- Bell: `automation` + `entity_type==='tasks'` → `/tasks` **до** общей ветки `/deals`

Спринт L11 / L181: «`task_overdue` НЕ добавляем» + enum только 3 триггера → CC по тексту **сотрёт** 2C-UI.

**Действие:** любой follow-up только как delta «поверх 2C-B», с явным «не откатывать task_overdue».

### B3. Stale inventory / «Статус» в старых ревью

Предыдущий review-файл утверждал «`settings/automation/*` ❌ ещё нет» — это **не** текущая правда. Опираться на live grep/git, не на старое ревью.

---

## Предупреждения (для истории промпта / polish; не для re-run)

### W1. «ЖЁСТКО НЕ ТРОГАТЬ» всё ещё перечисляет `AssigneeSelect` в «переиспользуй»

L182 конфликтует с шапкой L7–8. В **реализованном** коде AssigneeSelect не использован — риск только при re-run.

### W2. `ui/Button` в design-принципах, в редакторе — native buttons

API Button существует; реализация 2B использует plain `<button>` + CSS-var-классы (как Gates/Team). Не баг; формулировка спринта чуть шире практики.

### W3. superRefine не требует `t_pipeline_id`

Как и раньше: SQL матчит `stage_id`; pipeline_id — UI/seed. Live: pipeline пишется в config; empty stage валидируется. Ок.

### W4. `AutomationRun.project_id` в hand-types vs 051 nullable

schema.md 051: `project_id` nullable для personal overdue. `database.ts` `AutomationRun.project_id: string` — может быть NOT NULL в hand-type. Вне scope 2B (хук runs почти не читает); 🟡 для 2C-дока, не блокер 2B.

### W5. VERIFICATION спринта: Type Safety / A11y NOT_VERIFIED

Имеет смысл только как post-implement gate (tsc/build + Chrome-смок), не как pre-flight для повторного CC.

---

## Пропущенные места

Для **исполнения 2B** gaps нет — всё на месте. Ниже — карта «что спринт называл → где сейчас».

| Файл | Факт live | Действие для CC |
|------|-----------|-----------------|
| `src/types/database.ts` ~L230–325 | Automation* + conditions + task_overdue | **не трогать** as 2B re-write |
| `src/lib/hooks/use-automation-rules.ts` | Input + conditions; CRUD intact | ok |
| `src/components/layout/NotificationBell.tsx` | automation + tasks route (2C-B) | ok; не сужать |
| `src/components/settings/AutomationsSection.tsx` | full rebuild 2B+2C | ok |
| `src/lib/constants/automation.ts` | FIELD/STATUS/OP/SET + TASK_FIELD | ok |
| `src/lib/validators/automation-rule.ts` | ruleSchema + overdue refine | ok |
| `src/components/settings/automation/*` | RuleEditor + ConditionRow | ok |
| `supabase/migrations/050_*.sql` / `051_*.sql` | read-only reference | **не трогать** |
| `src/components/shared/AssigneeSelect.tsx` | uuid only | не для automation assignee |
| `src/types/supabase.gen.ts` | automation_rules.conditions: Json есть | ok |

Ложных путей в спринте (имена файлов) нет; ложны **claims о состоянии** («ещё v1 only»).

---

## crm-architect checklist

- [x] Есть РАЗВЕДКА (диагностика примитивов)  
- [x] Имена trigger/action/ops/set_field = schema.md 050  
- [x] Пути файлов реальны (architecture + live)  
- [x] learnings: org create через `current_org_id`, no flowType, no client DELETE-cascade  
- [x] SQL migrations **не** apply из CC (scope /code)  
- [x] RLS: write owner/admin (UI `useOrgRole` + RLS; не меняется)  
- [n/a] Новые DEFINER-функции — нет  
- [x] CSS variables / theme classes  
- [n/a] schema.md update — нет новой миграции в 2B  
- [ ] **Baseline «текущий UI» актуален** — **FAIL (B1)**

---

## Предлагаемые правки в спринт (если файл оставляют в `_analysis/`)

1. **Шапка:** статус `✅ DONE (661d6a9, 2026-07-17)`; «не запускать в CC».  
2. **Блок «РАЗВЕДКА»:** заменить claim «только stage_entered» на «после 2B+2C: RuleEditor + task_overdue».  
3. **Ссылка:** follow-up UI-баги → новый `sprint-…` / handoff, не re-open 2B.  
4. **W1 (cosmetic):** убрать AssigneeSelect из «переиспользуй» в red-line — на случай копипасты в другие спринты.  
5. Старое `_analysis/review-sprint-S-WF-2B.md` (2026-07-17) — пометить superseded этим ревью.

---

## Чеклист перед CC

- [ ] **Не запускать** этот sprint as-is в Claude Code  
- [x] Подтвердить DONE: `git show 661d6a9 --stat`  
- [x] Подтвердить 2C-B поверх: `git show ad6a1d2 --stat`  
- [ ] (Опц.) Cowork Chrome-смок из блока «ПОСЛЕ ТЕБЯ» — если ещё не закрыт: status_changed→notify, field_changed→activity, edit/toggle/delete, 6 тем  
- [ ] (Опц.) `npx tsc --noEmit && npm run build` как healthcheck, **без** правок по этому промпту  
- [ ] Новые фичи workflow UI — только отдельный промпт с baseline = текущий RuleEditor + 2C

---

## Итог одной строкой

Промпт S-WF-2B был сильным handoff’ом и **уже успешно исполнен**; сейчас это **архивный DONE-документ**, а не задание для Claude Code — повторный запуск = блокер (регресс 2C и rewrite живого UI).
