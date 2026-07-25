# Ревью: S-WBS-1 — WBS-иерархия задач (parent_task_id + wbs_code)

**Дата:** 2026-07-17  
**Ревьюер:** Grok (верификация по коду `main` @ `f398209`, `048_task_dependencies.sql`, `use-project-schedule.ts`, `GanttTimeline.tsx`, `use-tasks.ts`, `TaskModal.tsx`, `entities.ts`, crm-architect learnings)  
**Объект:** `_analysis/sprint-S-WBS-1.md` — миграция 052 + модалка + Gantt tree + wbs-префикс на доске  
**Контекст:** S-DEPS-1 (048 deps/Gantt), 046 dates, 051 task_overdue; roadmap §6 B4

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope v1 (модель + modal + Gantt; не DnD-board) | ✅ |
| Миграция 052 аддитивна; next after 051 | ✅ |
| Триггер parent: DEFINER + search_path + ACL + zz_ order | ✅ (паттерн 048) |
| Ацикличность + same project + org-гард | ✅ |
| Типы / validator / hooks / TaskModal / schedule / Gantt | ✅ inventory |
| Task type path (`entities.ts` / gen types) | 🟡 **W1** |
| Gantt: один filtered list для label + bar (выравнивание) | 🟡 **W2** |
| Summary vs milestone render | 🟡 **W3** |
| Перенос родителя в другой project (дети) | 🟡 **W4** |
| `git add .` / schema.md post-apply | 🟡 **W5** |
| crm-architect checklist | ✅ |

**Оценка: 8.5/10.** Зрелый v1: правильный SQL-паттерн 048, честные границы, Gantt-фокус. Блокеров на запись миграции/кода **нет**.  
**Рекомендация:** **запускать в CC**; HOW — W1–W2 (типы до regen; единый visible list на Gantt).

---

## Статус

| Заход | Репо |
|-------|------|
| 048 task_dependencies + Gantt deps | ✅ |
| 046 start_date/end_date | ✅ |
| 051 task_overdue | ✅ файл |
| `parent_task_id` / `wbs_code` | ❌ |
| 052 migration | ❌ |
| Tree на Gantt | ❌ (flat sort by start L68–70) |

---

## Разведка (верификация)

| Утверждение спринта | Live |
|---------------------|------|
| Последняя нумер. миграция **051** → **052** | ✅ |
| `Task` = gen Row + joins в `entities.ts` | ✅ L10–13 (не hand-Task в database.ts) |
| `start_date`/`end_date`/`is_milestone` в gen | ✅ `supabase.gen.ts` tasks Row |
| `GanttTask` = task + start/end + isMilestone | ✅ `use-project-schedule.ts` L10–15 |
| Swimlane sort by start/end | ✅ L68–70 |
| `taskFormSchema` без parent/wbs | ✅ `validators/task.ts` L6–19 |
| `useCreateTask`: `.insert(input)` + explicit optimistic | ✅ L163–199 |
| `useUpdateTask`: spread `updates` | ✅ L242–247 |
| `useProjectBoard(projectId)` key `['tasks','board',id]` | ✅ L66–71 |
| TaskModal: dates L248–256; reset L72–94; mutate values | ✅ |
| TaskCard path: `src/components/tasks/TaskCard.tsx` | ✅ (не `projects/`) |
| Gantt: left labels L606–614 + bars L644; `data-task-bar` | ✅ |
| 048 DEFINER + auth.uid org-гард + REVOKE | ✅ L26–99 |
| tasks triggers: `trg_aa_resolve_board`, set_updated_at, … | ✅ baseline; `zz_` после `set_org_id` |

---

## С чем согласен полностью

### 1. Scope v1

Иерархия = данные + parent в модалке + дерево на Gantt. DnD-репарент на доске / cascade dates — v2. Read-only `wbs_code` на карточке — правильно для lite.

### 2. Миграция 052

- `ADD COLUMN IF NOT EXISTS` + partial index — learnings.  
- FK `ON DELETE SET NULL` — дети не каскадно удаляются.  
- `check_task_parent_valid`: self / not found / cross-org / same project / recursive ancestors — зеркало 048.  
- `auth.uid() IS NOT NULL` org-гард — DEFINER + RLS bypass (learnings B1).  
- `trg_zz_check_task_parent` BEFORE INSERT OR UPDATE OF parent_task_id, project_id — org_id уже от set_org_id.  
- REVOKE public/anon; GRANT service_role only — триггерный ACL.

Цикл CTE (вверх от parent): при reparent A→descendant корректно ловит `node = new.id`.

### 3. Клиентский anti-cycle

Исключить self + descendants из select — UX; DB — второй рубеж. `useProjectBoard(watch('project_id'))` — верный источник.

### 4. Gantt algorithm

- childrenOf **внутри свимлейна** (v1) — documented cross-phase.  
- roots: parent null **или** parent вне свимлейна.  
- summary span = min/max children; isSummary; depth indent; collapse Set; deps только для visible DOM — согласовано с S-DEPS measurement.

### 5. Hooks

Create/update уже generic: insert(input) / update(updates). Достаточно полей в form + optimistic + types. Invalidate `['tasks']` префиксом задевает board — ок.

### 6. Не apply из CC

Стандарт проекта. 052 в git → Cowork MCP.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Типы: `Task` живёт в `entities.ts` + gen

Спринт упоминает `database.ts` / `entities.ts` / regen. Live:

```10:13:src/types/entities.ts
export type Task = Database['public']['Tables']['tasks']['Row'] & {
  project?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
};
```

`supabase.gen.ts` **без** parent/wbs. До apply+regen:

1. Расширить **intersection** на `Task`: `parent_task_id: string | null; wbs_code: string | null` (или optional до apply).  
2. `TaskInsert`/`TaskUpdate` — либо intersection override, либо `as TaskInsert` на mutate (form уже шлёт поля).  
3. Optimistic object (L178–199) — **обязательно** добавить оба поля, иначе tsc после required intersection.  
4. После Cowork apply: `gen types` + убрать ручные overrides.

Не править только `database.ts` вручную, если Row идёт из gen.

### W2. Gantt: один список видимых задач на свимлейн

Левая колонка (L606) и bars (L644) — **два** `sl.tasks.map`. Collapse-фильтр нужно применять **один раз** (useMemo `visibleTasks`), иначе label/bar разъедутся по высоте.

Также: critical-path / dep measurement уже берут `filteredSwimlanes` — collapsed ids должны отфильтровываться **до** critical и `setEdges` (спринт это намекает — зафиксировать в HOW).

### W3. `isSummary` vs `isMilestone`

«Сводный бар тоньше» и «ромб если is_milestone» — конфликт, если summary+milestone.  
**Правило:** `isMilestone && !isSummary` → ромб; иначе если summary → bracket-bar; иначе leaf. Или: milestone никогда не summary (редко). Явно в GanttBar.

### W4. Смена `project_id` у **родителя**

Триггер на UPDATE OF `project_id` у **строки-ребёнка** ок. Если **родителя** переносят в другой проект, дети остаются с `parent_task_id` → cross-project orphan, триггер на parent **не** валидирует детей.

v1 edge (редко). Опционально follow-up: при UPDATE project_id обнулять parent у детей / валидировать. Не блокер.

### W5. Процесс

- `git add .` → явный список файлов (052, entities/validators/hooks, TaskModal, schedule, Gantt, TaskCard).  
- После apply: **docs/schema.md** + skill schema (learnings) — в спринте не сказано → Cowork checklist.  
- `parent_task_id` select: `setValueAs` `'' → null` (как dates), иначе uuid-схема упадёт.

### W6. Summary span vs drag dates

Сводный `start/end` = envelope детей; `useUpdateTaskDates` на summary может писать «ложные» даты родителя. v1: drag на summary **disable** или только open modal. Уточнить в GanttBar: `if (gt.isSummary) /* no drag */`.

### W7. Cross-phase parent

Задокументировать (спринт EDGE) — комментарий в `use-project-schedule` обязателен, иначе «баг» при review.

### W8. TaskCard path

Спринт: `ProjectBoard.tsx` / `TaskCard.tsx` — файл = `src/components/tasks/TaskCard.tsx` (не projects/).

---

## Пропущенные места

| Файл | Действие |
|------|----------|
| `supabase/migrations/052_task_wbs.sql` | **new** SQL |
| `src/types/entities.ts` (+ gen later) | parent_task_id, wbs_code |
| `src/lib/validators/task.ts` | schema fields |
| `src/lib/hooks/use-tasks.ts` | optimistic (+ insert types) |
| `src/components/tasks/TaskModal.tsx` | parent select + wbs input |
| `src/lib/hooks/use-project-schedule.ts` | tree + summary |
| `src/components/tasks/GanttTimeline.tsx` | depth, summary bar, collapse |
| `src/components/tasks/TaskCard.tsx` | wbs prefix |
| `docs/schema.md` | Cowork post-apply |

False positives: **нет** (не трогать 048, overdue, board DnD).

---

## Предлагаемые правки в спринт

1. **W1:** HOW типов — `entities.ts` intersection + optimistic; regen после apply.  
2. **W2:** `visibleTasks` shared label/bar/critical/deps.  
3. **W3/W6:** render priority summary/milestone; disable drag on summary.  
4. **W5:** explicit `git add` paths; schema.md на гейте.  
5. TaskCard path: `src/components/tasks/TaskCard.tsx`.

---

## Чеклист перед CC

- [ ] 052 SQL only additive; **не apply**
- [ ] Триггер zz_ + cycle CTE + same project
- [ ] Form: parent (anti-cycle options) + wbs_code; no project → hide parent
- [ ] Schedule tree per swimlane; summary min/max children
- [ ] Gantt: depth pad, collapse, wbs prefix, no orphan arrows
- [ ] TaskCard wbs prefix only
- [ ] `npx tsc --noEmit && npm run build`
- [ ] Smoke after Cowork apply: parent save, cycle reject, Gantt nest/collapse

---

## Итог одной строкой

Спринт **готов к CC**: 052 по паттерну 048, v1-scope честный, точки встройки (schedule/Gantt/modal) верные; HOW-gaps — **типы до gen**, **единый visible-list на Gantt**, summary drag/milestone.