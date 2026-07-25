# Ревью: S-DEPS-1 — task_dependencies (FS + DAG + стрелки)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `6d86d37`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-DEPS-1.md` — junction `task_dependencies`, DEFINER DAG-валидатор, хук, SVG-стрелки + link-mode на Гантте  
**Контекст:** VIEW-1/VIEW-2 закрыты; 046 `start_date`/`end_date` в репо; B2-DROP 047 применён через MCP (файла нет); предыдущее ревью (`review-sprint-S-DEPS-1.md`, 20:53) **устарело** — спринт обновлён (21:07) и закрыл B1/W1–W5

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Нумерация миграции **048** (046 + MCP-047 без файла) | ✅ |
| Junction-паттерн (`org_id`, CASCADE, hard-delete) | ✅ |
| RLS initplan + роль owner/admin/manager + no UPDATE | ✅ |
| `SECURITY DEFINER SET search_path` + org-гард (B1) | ✅ |
| Триггер-порядок `trg_set_org_id` → `trg_zz_*` | ✅ |
| Пути: GanttTimeline / schedule / date-helpers / types | ✅ |
| Scope / «ЖЁСТКО НЕ ТРОГАТЬ» / не scheduling engine | ✅ |
| SELECT project-scope (W3) + filter skip (W4) + CSS token | ✅ |
| Геометрия barRect vs gridColumn | ✅ (HOW верный; см. W1–W2 по px/phase) |
| Процесс: CC пишет, Cowork apply+smoke | ✅ |
| Phantom «Validator» в цепочке, gen-stub depth | 🟡 |

**Оценка: 9/10.** Спринт после правок готов к Claude Code: security-blocker закрыт, разведка совпадает с live tree, scope v1 чёткий. Остались только implementation-warnings (Y-ось phase headers, link-mode vs modal click, полнота hand-stub в gen).  
**Рекомендация:** **запускать в CC** (правки W* желательны одной строкой в HOW, не блокируют старт).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| 046 Gantt dates | ✅ `supabase/migrations/046_gantt_dates_on_tasks.sql` |
| VIEW-1 read-only Gantt | ✅ `src/components/tasks/GanttTimeline.tsx` (455 строк) |
| VIEW-2 drag (`useUpdateTaskDates`) | ✅ `src/lib/hooks/use-tasks.ts` ~296+ |
| 047 DROP legacy stage | ✅ applied via MCP; **файла `047_*` в `supabase/migrations/` нет** (`handoff-legacy-stage-B3.md`) |
| 048 / `task_dependencies` / `use-task-dependencies` | ❌ отсутствует (ожидаемо) |
| `docs/schema.md` дельта 047 | ⏳ backlog (`handoff-session-2026-07-16.md`) — не смешивать с 048 |

---

## Разведка (факт vs спринт)

| Утверждение спринта | Live |
|---------------------|------|
| Последний файл миграций = 046; 047 нет; next = 048 | ✅ `040`…`046_gantt_dates_on_tasks.sql` + baseline; `*047*` / `*048*` нет |
| `trg_set_org_id` → `public.set_org_id()` | ✅ baseline + archive 022/032/030/037 |
| `set_org_id` заполняет только при `org_id IS NULL` | ✅ learnings + baseline |
| `current_org_id()` / `current_org_role()` | ✅ baseline; RLS-обёртка `( SELECT … )` — initplan-конвенция |
| Junction-прецедент `contact_company`: org_id, CASCADE на ends, hard-delete | ✅ baseline; org FK без CASCADE (legacy), sprint CASCADE — как `project_members`/`project_columns` (современный паттерн) |
| `gridColumn: s+1 / e+2`, `ROW_H`, `getBucketPx` via `gridRef` | ✅ L170, L28, L269–272, L366 |
| filter open: hide done | ✅ L243–244: `gt.task.lane !== 'done'` (не `lane==='done'`, семантика та же) |
| `--text-mute` (не muted) | ✅ `globals.css` во всех 6 темах |
| `effectiveSpan` в schedule | ✅ L30–36 **private**; UI должен брать `GanttTask.start/end` (уже span), не реэкспортить |
| `useUpdateTaskDates` dual-key | ✅ board + `['tasks']` — в «не трогать» верно |
| `task_dependencies` в типах/БД | ❌ нет — net-new |

---

## С чем согласен полностью

### 1. Нумерация 048

Active chain: `040`…`046`. B2 = MCP `047_drop_legacy_projects_stage` без коммита файла — задокументировано. Переиспользовать 047 нельзя; 048 + сверка `schema_migrations` на гейте — верный процесс.

### 2. Сущность и hard-delete

M:N self-ref на `tasks`, `org_id NOT NULL`, FK `ON DELETE CASCADE`, unique `(predecessor_id, successor_id)`, no self, `dep_type` + `lag_days` как задел. Hard-delete осознан: у `contact_company` нет `deleted_at`. Session handoff («+ soft-delete») — **устаревшая** формулировка; спринт точнее.

### 3. DEFINER-валидатор + B1 (закрыт)

- Self / not-found / cross-org (pred≠succ) / cross-project / cycle CTE — корректны.  
- **Org-гард вызывающего** (auth.uid() IS NOT NULL + NULL-safe `current_org_id()` + IS DISTINCT FROM) — ровно урок PCT-1 / learnings.  
- Service/MCP (`auth.uid() IS NULL`) не ломается.  
- `trg_zz_check_task_dependency` после `trg_set_org_id` по алфавиту (`set_` < `zz_`) — подтверждено.  
- `SECURITY DEFINER SET search_path = public, pg_temp` + REVOKE/GRANT — по конвенции.

### 4. RLS

- SELECT org-wide — как `project_columns` (конфиг/оверлей борда).  
- INSERT/DELETE: org + `owner|admin|manager` — менеджер ведёт расписание (шире `cc_delete` = owner/admin only; продуктово ок).  
- UPDATE отсутствует — иммутабельное ребро.  
- Grant authenticated select/insert/delete, revoke anon — жёстче legacy baseline ALL.

### 5. Scope v1

Storage + DAG + draw + manual create/delete. **Не** cascade shift, **не** FS date-constraint, **не** critical path. Явно в шапке, «ЖЁСТКО НЕ ТРОГАТЬ», VERIFICATION — согласовано с roadmap S-DEPS-1 / §9.3.

### 6. Хук и кэш

- `['task-dependencies', projectId]` + filter `.in(pred).in(succ)` по `taskIds` — обязателен (RLS org-wide, своей `project_id` нет).  
- `enabled: taskIds.length > 0`.  
- Optimistic 5-шагов + errcode toast (`P0001`/`23514`/`23505`/`42501`) — паттерн `parseMemberError` / SpawnWizard.  
- Не трогать VIEW-2 dual-key — верно.

### 7. UI / a11y / CSS

- SVG overlay на `relative` timeline-body (прецедент today-line L411–416).  
- Link-mode + gate drag; `aria-pressed`.  
- `var(--text-mute)` / `var(--accent)`, solid tip.  
- Skip стрелки вне filter-view.

### 8. Процесс

CC: файл миграции, не apply. Cowork: apply + smoke (cycle, cross-project, dup, viewer, **B1 cross-org**, advisors, known-race W6). `tsc`/`build` на ручных типах. Docs — отдельный коммит.

---

## Блокеры (критично — исправить до запуска)

**Нет.**  
Прежний B1 (DEFINER без привязки tasks к `current_org_id()`) **уже в SQL спринта** (строки ~96–107). CSS-токен и project-scoped SELECT тоже закрыты.

---

## Предупреждения (желательно исправить)

### W1. `ROW_H` — строка rem, `bucketPx` — px

`const ROW_H = '1.75rem'` (L28). `getBucketPx()` возвращает **пиксели**. В barRect нельзя смешивать `'1.75rem'/2` со `x = idx * bucketPx`.  
**HOW одной строкой:** `const ROW_PX = 28` (1.75×16) или `rowEl.getBoundingClientRect().height`; весь barRect только в px.

### W2. Phase-заголовки ≠ `ROW_H`

L385: `{sl.label !== null && <div className="pt-2 pb-0.5 text-[10px]">&nbsp;</div>}` — высота **не** `ROW_H` (padding + line-height ~10px).  
Формула «+ phase headers» без DOM-measure или константы → стрелки съедут в phaseMode (delivery).  
**Предпочтение:** накопить Y обходом laneRows с `getBoundingClientRect` рядов/headers, либо измерить spacer+rows один раз (ResizeObserver уже в спринте).

### W3. Link-mode vs open-modal на pointerup

Сейчас L136–138: `|rawDx| < CLICK_PX` → `onEditTask` (модалка). Спринт гейтит drag, но **не** явно: «в link-mode клик = select pred/succ, **не** open modal».  
Без этого link-mode откроет TaskModal на каждом клике.  
**Добавить:** `if (linkMode) { …select…; return }` до `onEditTask`; keyboard Enter/Space по-прежнему открывает модалку (a11y).

### W4. Hand-stub в `supabase.gen.ts` — полный Table shape

`database.ts` только `RelaxOrgId` поверх gen. Без записи `task_dependencies: { Row, Insert, Update, Relationships }` в **gen** `.from('task_dependencies')` не пройдёт `tsc`.  
Интерфейс `TaskDependency` в `entities.ts`/`database.ts` — удобный доменный тип, **не** замена gen-stub. Образец — соседний `project_members` (~L1508).

### W5. «Validator» в цепочке без задачи

Шапка: `Migration → Types → Validator → Hook → Component`, но Задачи 1–5 без Zod/validator. Для двух UUID отдельный `validators/*` не обязателен.  
**Правка:** убрать «Validator» из порядка **или** 2 строки: «client-side only UUID check optional; Zod не нужен».

### W6. ACL триггер-функции: revoke + authenticated

Конвенция 034: `REVOKE ALL … FROM PUBLIC, anon, authenticated` на чисто trigger DEFINER. Спринт revoke'ит public/anon, grant service_role — **не** revoke authenticated → теоретически торчит как RPC.  
**Добавить:** `revoke all … from authenticated` (как `resolve_task_board` / `aa_enforce_stage_gate`).

### W7. Hit-target стрелки

`pointer-events: stroke` на тонком path — сложно кликнуть. Невидимый wide stroke (`stroke-width` 8–12, transparent) + visible 1.5–2 — UX, не блокер.

### W8. Gonkа A→B ∥ B→A (уже в спринте)

W6 known-race — принято для v1. Serial-smoke на гейте достаточен.

### W9. `created_by` всегда null

INSERT только `{predecessor_id, successor_id}`. Опционально: клиент `created_by: user.id` или DEFAULT `auth.uid()` в DDL. v1 ok без этого.

### W10. docs/schema 047 backlog

Не смешивать с 048-доками. Спринт верно: отдельный docs-коммит.

---

## Пропущенные места (inventory)

| Файл | Факт | Действие |
|------|------|----------|
| `supabase/migrations/048_task_dependencies.sql` | нет | создать, **не** apply |
| `src/lib/hooks/use-task-dependencies.ts` | нет | создать (Задача 3) |
| `src/types/supabase.gen.ts` | нет `task_dependencies` | hand-stub Tables (Row/Insert/Update/Relationships) |
| `src/types/entities.ts` / `database.ts` | re-export layer | `TaskDependency` + `DepType` аддитивно |
| `src/components/tasks/GanttTimeline.tsx` | L1–455, GanttBar L81–228, shell L231+ | SVG + link-mode + drag/modal gate |
| `src/lib/hooks/use-project-schedule.ts` | `effectiveSpan` private L30–36 | **не** дублировать; `GanttTask.start/end` |
| `src/lib/hooks/use-tasks.ts` | `useUpdateTaskDates` | не трогать dual-key |
| `src/lib/utils/date-helpers.ts` | bucket helpers есть | трогать только если выносят barRect (W8 спринта) |
| Realtime publication | `task_dependencies` нет | v1: invalidate on mutate; publication optional later |

Ложных путей нет. Якоря разведки L160–180 / 260–290 / 360–420 — актуальны.

---

## Предлагаемые правки в спринт (необязательные, 5–10 строк)

1. **W1+W2:** barRect только в px; phase header height measure/const, не `ROW_H`.  
2. **W3:** link-mode click ≠ open modal.  
3. **W4:** явный «stub в `supabase.gen.ts` по образцу `project_members`».  
4. **W5:** убрать Validator из pipeline или пометить N/A.  
5. **W6:** `REVOKE … FROM authenticated` на `check_task_dependency_valid`.

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА в начале  
- [x] Реальные/явно вводимые имена таблиц-колонок  
- [x] Пути из architecture / live tree  
- [x] learnings: DEFINER org-гард NULL-safe — **в SQL**  
- [x] Миграция файлом; CC не apply  
- [x] org_id + RLS initplan + role  
- [x] `SECURITY DEFINER SET search_path` + ACL (см. W6)  
- [x] no `flowType: implicit` (N/A)  
- [x] DELETE CASCADE, не client cleanup  
- [x] CSS variables only (`--text-mute`)  
- [x] schema.md — отдельный docs-коммит после apply  

---

## Чеклист перед CC

- [x] B1 org-гард в SQL 048  
- [x] CSS `--text-mute`  
- [x] barRect HOW от gridColumn/s/e + filter skip + project-scoped query  
- [x] Блок «ЖЁСТКО НЕ ТРОГАТЬ»  
- [ ] (Желательно) W1–W3 HOW + REVOKE authenticated  
- [ ] CC: миграция + types (gen stub!) + hook + GanttTimeline  
- [ ] CC: `npx tsc --noEmit` + `npm run build` на ручных типах  
- [ ] CC: **не** `apply_migration`  
- [ ] Cowork: apply 048 → smoke cycle / cross-project / dup / viewer / **cross-org 42501** → advisors → Chrome link-mode + zoom  
- [ ] Docs schema 048 отдельным коммитом; 047-дельту не смешивать  

**Итог:** спринт **можно отдавать в Claude Code as-is**; желательно дописать 3 HOW-строки (px Y, link-mode click, gen-stub). Блокеров нет.
