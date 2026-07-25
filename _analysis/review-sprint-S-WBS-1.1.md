# Ревью: S-WBS-1.1 — rollup undated-родителя в Gantt (F1)

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `1d39766`, `use-project-schedule.ts` 136 LOC, `GanttTimeline.tsx` summary/undated, 052 WBS)  
**Объект:** `_analysis/sprint-S-WBS-1.1.md` — undated parent + dated children → summary bar; no migrations  
**Контекст:** S-WBS-1 shipped (052 + tree); F1: undated package parent drops to «Без дат» bucket before `buildTree`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Root cause: `!effectiveSpan` → undated **before** tree | ✅ L106–108 |
| `visit()` already rolls up children span | ✅ L80–90 |
| Gantt summary uses `gt.start/end` not raw task dates | ✅ L229–246, L725 |
| Scope: schedule derivation only | ✅ |
| Two-pass keepUndated + same-lane descendants | ✅ correct product |
| `visit` min/max init before kid visit | 🟡 **W1** (fix for empty start) |
| `bySpan` before computed spans | 🟡 **W2** |
| `buildTree` early `items.length < 2` | 🟡 **W3** |
| `datesFromChildren` vs reuse `isSummary` | 🟡 **W4** optional |
| `git push` in prompt | 🟡 **W5** |
| crm-architect / no mig | ✅ |

**Оценка: 9/10.** Точный F1-фикс; диагноз 1:1 с live.  
**Рекомендация:** **запускать в CC**; HOW — W1–W2 в `visit`/sort.

---

## Статус

| Заход | Репо |
|-------|------|
| 052 parent_task_id / wbs_code | ✅ |
| buildTree + isSummary rollup | ✅ |
| undated bucket pre-tree | ✅ L106–108 **= F1** |
| Gantt summary bracket render | ✅ |
| keepUndated / datesFromChildren | ❌ this sprint |

---

## Разведка (верификация)

| Утверждение | Live |
|-------------|------|
| effectiveSpan null → undated, skip lane | ✅ L34–40, L106–108 |
| buildTree visit: summary minS/maxE from kids | ✅ L80–90 |
| GanttTask: start/end/isSummary/depth/parentId | ✅ L10–18 |
| bySpan on start/end strings | ✅ L44–45, used L75, L93 |
| Summary bar from gt.start/end | ✅ no task.start_date guard |
| Undated section «Без дат» | ✅ ~L816+ |
| W7 cross-lane roots | ✅ L49, L64, L128–130 |
| Line refs ~103–133 assembly | ✅ (file 136 lines total) |

---

## С чем согласен полностью

### 1. WHY / F1

Undated parent never enters `byLane` → children become roots (parent outside idSet). Rollup code never sees parent. Fix: promote undated ancestors of **same-lane dated** descendants into the lane as summary shells.

### 2. Same-lane only (v1)

Cross-phase undated parent stays undated — matches S-WBS-1 W7. Correct.

### 3. Cascade undated→undated→dated

All ancestors in keepUndated — recursive DFS + memo. Correct.

### 4. Render likely unchanged

Summary path already uses computed `gt.start`/`gt.end`; isSummary not draggable (W6). Task 2 = verify only.

### 5. No migrations; explicit git paths

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `visit` min/max seed (must fix with datesFromChildren)

```71:90:src/lib/hooks/use-project-schedule.ts
    let minS = kids[0].start;
    let maxE = kids[0].end;
    for (const kid of kids) {
      const span = visit(kid, depth + 1, node.task.id);
      if (span.start < minS) minS = span.start;
      ...
```

If `kids[0]` is still placeholder (`start: ''`) **before** its visit, `minS` stays `''` because ISO dates are not `< ''`. Nested undated chain breaks.

**HOW:** seed from first `visit` result:

```ts
let minS: string | null = null;
let maxE: string | null = null;
for (const kid of kids) {
  const span = visit(kid, depth + 1, node.task.id);
  if (!minS || span.start < minS) minS = span.start;
  if (!maxE || span.end > maxE) maxE = span.end;
}
// guard if !minS
```

### W2. Sort kids before visit

`kids.sort(bySpan)` uses pre-rollup starts. Empty placeholders sort first.  
**HOW:** sort after visit (two-pass: visit into array, sort, re-order `out` is hard with pre-order) **or** sort by first **dated** leaf span helper, **or** DFS without bySpan on placeholders then stable order by wbs_code/text.  
Acceptable v1: visit in any order; only final node.start/end matter for bars; child **visual** order may be slightly off until second sort of siblings after spans known (rebuild out without double-push — optional polish).

### W3. `buildTree` early exit

`if (items.length < 2) return items` — single dated task OK. Single keepUndated alone (no kids in lane) shouldn't be in keepUndated. No change required if step 1 is correct.

### W4. Placeholder start/end

Prefer sentinel that fails safe comparisons, or optional `start?` + assert after visit. Type `start: string` requires something; `datesFromChildren: true` + visit always overwrites when kids exist.

Avoid `isMilestone` summary edge: undated summary + is_milestone — Gantt prefers summary bracket (L211–212). OK.

### W5. `git push` in sprint

Repo convention: push only on explicit user ask. CC: commit only unless user says push. Host is **Netlify**, not Vercel (nit).

### W6. Unit test opportunity

Pure functions: `effectiveSpan`, keepUndated DFS, buildTree rollup — cheap vitest without UI. Optional, not required by sprint.

### W7. Deps / critical path

Deps use task ids in DOM; summary bars still get `data-task-bar`. Collapse + deps remeasure already depend on collapsedSig. Smoke: arrows still align after rollup parents appear.

### W8. Same-lane definition

`column_id` match including both null → `__none__`. Parent and child both null column → same lane. Good.

---

## Алгоритм (подтверждение)

```
tasks
  → dated | undatedAll
  → keepUndated = undated with ≥1 dated descendant in same lane (DFS+memo+visited)
  → undated bucket = undatedAll \ keepUndated
  → lane items = dated GanttTasks + keepUndated shells (datesFromChildren)
  → buildTree / visit → isSummary + span from children
```

---

## Чеклист перед CC

- [x] F1 root cause confirmed L106–108  
- [x] Summary render independent of task.start_date  
- [ ] HOW W1 visit seed  
- [ ] Smoke: undated package + 2 dated kids; cross-phase; all-undated project  

---

## crm-architect checklist

| Item | |
|------|--|
| РАЗВЕДКА | ✅ |
| No SQL / no apply | ✅ |
| Real file paths | ✅ |
| Backward-compat S-WBS-1 dated trees | 🟡 smoke |

---

**Итог:** готов к Claude Code. Узкий, правильный follow-up к S-WBS-1. Главный HOW — **не сидить minS/maxE с пустого `kids[0].start` до visit**.
