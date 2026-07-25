# Ревью: S-WF-2C-B — task_overdue в UI + NotificationBell route

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui` @ `6e134b2`; ancestor `ad6a1d2` / `91fd2a0`; live `src/`, `supabase/migrations/051_task_overdue.sql`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-WF-2C-B.md` — UI-финал Workflow D1: триггер `task_overdue` в редакторе + deep-link task-automation в `NotificationBell`  
**Контекст:** Предыдущее ревью `_analysis/review-sprint-S-WF-2C-B.md` (2026-07-17, вердикт «запускать в CC»). С тех пор **спринт выполнен**: `ad6a1d2` (code) + `91fd2a0` (docs). 051 backend (`58c2515`) в репо и в docs/skill schema как applied.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Разведка в промпте vs live-код **сейчас** | ❌ **устарела** (описывает pre-`ad6a1d2` @ `58c2515`) |
| Scope: чистый /code, без БД | ✅ (и код уже так сделан) |
| Tasks 1–7 (types → Bell) | ✅ **уже в репо** |
| Task 8 docs/schema 051 | ✅ `91fd2a0` + skill `references/schema.md` с 051 |
| Whitelist = движок 051 (notify/create_activity) | ✅ validator + UI filter + SQL L63–68 |
| NotificationBell `entity_type === 'tasks'` | ✅ L21 |
| crm-architect checklist (как промпт) | ✅ был корректен |
| Повторный запуск в CC | ❌ **no-op / риск дублирования** |

**Оценка: 9/10** как исторический handoff (качество scope/маппинга на 051).  
**Как live-промпт на 2026-07-19: 2/10** — разведка противоречит коду, работа сделана.

**Рекомендация:** **не запускать в CC.** Спринт закрыт коммитами `ad6a1d2` + `91fd2a0` (есть в `main` и в текущей ветке). Повторный прогон даст пустой diff или конфликты с уже влитым UI. Остаточный polish (W2 conditions reset, nullable `AutomationRun.project_id`) — только отдельным микро-спринтом, не re-run 2C-B.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| S-WF-2A backend 050 | ✅ applied (docs + skill) |
| S-WF-2B UI 3×4 | ✅ `661d6a9` |
| S-WF-2C-A 051 SQL | ✅ `supabase/migrations/051_task_overdue.sql`, `58c2515` |
| 051 applied (docs/skill) | ✅ docs L8/L114–126; skill schema L8/L126–132 — **applied 2026-07-17** |
| UI task_overdue + Bell route (Tasks 1–7) | ✅ **`ad6a1d2`** (7 files, +112/−23) |
| docs/schema 051 (Task 8) | ✅ **`91fd2a0`** |
| Chrome-смок / Cowork post-check | 🟡 не верифицировался в этом ревью (runtime) |

---

## С чем согласен полностью (дизайн промпта был верный)

### 1. Scope = движок 051

`051_task_overdue.sql` (live):
- action v1 только `notify` / `create_activity` (L63–68; иначе `continue` **до** run);
- notify → `coalesce(assigned_to, created_by)`, recipient из config **не читается** (L79);
- `entity_type='tasks'`, `entity_id=t.id` (L85);
- conditions: `wf_eval_conditions(..., to_jsonb(t))` (L70–71) → поля **tasks** (`priority` / `lane` / `text` — реальные колонки, `docs/schema.md` ~L599–606);
- идемпотентность «раз на задачу» (run по `trigger_key = task_id::text`).

Промпт правильно ограничил UI: whitelist, hide recipient, task field options, copy «один раз».

### 2. Inventory файлов (был точный)

| Task | Файл | Сейчас |
|------|------|--------|
| 1 | `src/types/database.ts` L236–259 | `task_overdue` + `TaskOverdueConfig` + union |
| 2 | `src/lib/validators/automation-rule.ts` L20, L63–65 | enum + superRefine |
| 3 | `src/lib/constants/automation.ts` L46–51, L111–121 | TRIGGER + `AUTOMATION_TASK_FIELD_OPTIONS` + `AUTOMATION_CONDITION_FIELD_LABEL` |
| 4 | `ConditionRow.tsx` L22–29 | prop `fieldOptions` |
| 5 | `RuleEditorModal.tsx` | toInput `{}`, isOverdue, action filter, useEffect, hide recipient, placeholders `{task}`, footer hint |
| 6 | `AutomationsSection.tsx` L54–55, L67–68 | «Просрочка задачи» / «уведомить исполнителя» |
| 7 | `NotificationBell.tsx` L18–26 | `automation && entity_type === 'tasks' → /tasks` |
| 8 | `docs/schema.md` | дельта 051 полная |

### 3. NotificationBell W1

`Notification.entity_type: string` (`database.ts` L443). Маршрут `/tasks` есть (`src/app/(dashboard)/tasks/page.tsx`). `payloadTitle` automation читает `payload.text` (Bell L67–69) — ок для 051 payload.

### 4. «ЖЁСТКО НЕ ТРОГАТЬ»

БД/051, 3 legacy-триггера, create_task/set_field для overdue — соблюдены реализацией. Два коммита code/docs — как в промпте.

### 5. crm-architect checklist (для исходного промпта)

| Пункт | |
|-------|--|
| РАЗВЕДКА (на момент написания @ 58c2515) | ✅ была |
| Реальные имена / пути | ✅ |
| SQL не apply из CC | ✅ |
| org_id / RLS | не менялись |
| CSS variables | reuse классов |
| schema.md после 051 | Task 8 → сделан |

---

## Блокеры (для **повторного** запуска CC)

### B1. Спринт уже реализован

Коммиты:
- `ad6a1d2` — `feat(workflow): S-WF-2C-B — task_overdue в UI + NotificationBell route по entity_type`
- `91fd2a0` — `docs(schema): дельта 051 task_overdue (pg_cron + run_overdue_automations)`

Оба — предки `HEAD` (`feat/chat-ui` @ `6e134b2`) и есть на `main`. Запускать тот же handoff в CC **нельзя**: работа закрыта.

### B2. Разведка в шапке — анти-факты live-кода

Промпт утверждает (строки 5–12), что:
- `AutomationTriggerType` **без** `task_overdue`;
- validator enum ×3;
- `ConditionRow` хардкодит `AUTOMATION_FIELD_OPTIONS`;
- Bell automation → `/deals/${id}` (404).

Live (2026-07-19):
- `database.ts` L236: `… | 'task_overdue'`;
- validator L20: 4 значения;
- `ConditionRow` L25–29: `fieldOptions` prop;
- Bell L21: `entity_type === 'tasks' → '/tasks'`.

CC, следуя «разведке», будет «чинить» уже исправленное или вносить дубли. **Не использовать файл как active handoff без переписывания шапки в post-mortem.**

---

## Предупреждения (остаточный долг после 2C-B)

### W1. Сброс conditions при смене триггера — **не сделан** (бывш. W2 pre-review)

`RuleEditorModal` меняет `fieldOptions` (`isOverdue ? TASK : FIELD`), но **нет** `setValue('conditions', [])` при переключении `trigger_type`.  
Если пользователь добавил условие `budget`, затем выбрал «Просрочка задачи» — в form останется `field: 'budget'`. 051 eval на row задачи → fail-closed → «мёртвое» правило.

**Микро-фикс (вне 2C-B):** useEffect на `triggerType` / `isOverdue` — чистить conditions, если `field ∉ fieldOptions`.

### W2. Free-text для enum-условий priority/lane

`ConditionRow` — text input; значения должны быть `important` / `now`, не «Важный». MVP ок (комменты в constants L112–113); select из `AUTOMATION_PRIORITY_OPTIONS` / `LANE_OPTIONS` — later.

### W3. `AutomationRun.project_id: string` vs 051 nullable

`database.ts` L320: `project_id: string` (NOT NULL-style). 051 + docs: nullable + partial unique. **Вне scope** 2C-B (runs UI нет) — хвост types при первом UI журнала runs.

### W4. notify `recipient` в payload при task_overdue

`toInput` L103 всегда пишет `recipient: v.a_assignee ?? 'deal_owner'`. 051 игнорирует; describe special-case L67–68 — ок. Косметика: для overdue писать `recipient: 'assignee'` или опускать — не блокер.

### W5. Runtime-смок не подтверждён этим ревью

Промпт «ПОСЛЕ ТЕБЯ — Cowork»: create rule → config `{}` → Bell → `/tasks`. По коду путь корректен; e2e в браузере здесь не гонялся.

### W6. skill `architecture.md`

Упоминает `NotificationBell`, но не `task_overdue` / automation editor paths. Не блокер 2C-B (schema уже синхронизирован).

---

## Пропущенные места (re-check inventory)

| Файл | Live | Действие CC |
|------|------|-------------|
| `types/database.ts` | task_overdue + TaskOverdueConfig | **готово** |
| `validators/automation-rule.ts` | enum + superRefine | **готово** |
| `constants/automation.ts` | TRIGGER + TASK fields + CONDITION labels | **готово** (W1 pre-review закрыт) |
| `ConditionRow.tsx` | `fieldOptions` prop | **готово** |
| `RuleEditorModal.tsx` | все ветки Task 5 + footer `{task}` | **готово** (W3 pre-review закрыт) |
| `AutomationsSection.tsx` | case + «исполнителя» + CONDITION labels | **готово** |
| `NotificationBell.tsx` | entity_type branch | **готово** |
| `docs/schema.md` | 051 delta | **готово** |
| skill `references/schema.md` | 051 applied | **готово** (вне репо) |
| `use-automation-rules.ts` | types only | **не трогать** (верно) |
| `activity-events.ts` | `task_overdue: 'просроченная задача'` L50 | бонус, вне sprint |

False positives / лишнее в scope: **нет**.

---

## Предлагаемые правки в спринт

1. **Не править для CC** — спринт executed. Либо пометить шапку:  
   `> ✅ DONE ad6a1d2 + 91fd2a0 (2026-07-17). Не запускать повторно.`  
2. Опциональный follow-up (не 2C-B): conditions reset (W1), `AutomationRun.project_id: string | null` (W3).  
3. Если watcher снова подхватит файл — review должен сразу вердиктить **already shipped**, не «запускать».

---

## Чеклист перед CC

- [x] ~~Разведка @ 58c2515~~ → **устарела; код post-2C-B**
- [x] 051 SQL = notify/create_activity, conditions on task, entity_type=tasks
- [x] `/tasks` route существует
- [x] `Notification.entity_type` в типах
- [x] Types → validator → constants → ConditionRow → RuleEditorModal → AutomationsSection → Bell
- [x] Commits code + docs (skill schema)
- [x] docs/schema + skill: 051 applied
- [ ] (опц.) Chrome-смок: rule + Bell → `/tasks`
- [ ] (опц.) conditions reset при смене триггера
- [ ] **Не** re-run S-WF-2C-B в CC

---

## Итог одной строкой

Спринт **уже закрыт** (`ad6a1d2` + `91fd2a0`): UI task_overdue + Bell route + docs 051 в дереве; промпт годится как post-mortem, **не** как active handoff — повторный CC запрещён (B1/B2); остаток — polish conditions-reset и types nullable run.
