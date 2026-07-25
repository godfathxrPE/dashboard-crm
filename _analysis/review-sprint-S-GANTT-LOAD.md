# Ревью: S-GANTT-LOAD — загрузка исполнителей

**Дата:** 2026-07-25  
**Ревьюер:** Grok (live `GanttFilter`, `nameById`/`team`, `ScheduleNode.hasOwnDates`, yellow tokens)  
**Объект:** `_analysis/sprint-S-GANTT-LOAD.md`  
**Контекст:** UI-only add-on после 1B/CPM module; опциональный product go/no-go.

**Шкала:** 0–100; **≥ 85 = GO**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + STOP | ✅ |
| Vitest `tests/unit/**` | ✅ |
| «Filter assignee — NEW» (не reuse) | ✅ **исправлен** vs roadmap-v1 |
| `GanttFilter = open\|all\|milestones` | ✅ live L39 |
| `nameById` only tooltip | ✅ L393 / L1051 |
| Exclude via `hasOwnDates`, not is_summary | ✅ correct model |
| Unassigned row, no MAX on null | ✅ |
| Orthogonal load filter vs bar filter | ✅ |
| Highlight ≠ critical outline | ✅ |
| No resource leveling | ✅ |
| `computeLoad` signature detail | 🟡 |
| Token `--yellow` / `text-yellow` | ✅ exists in themes |

**Оценка: 92/100 (GO).**  
Порог 85 пройден. **B\* нет.**  
Рекомендация: **в CC** после product confirm «команда реально пересекается».

---

## С чем согласен

### 1. False claim roadmap-v1 закрыт

Явно: filter assignee **нет**, `nameById` только тултип, новый `useState` orthogonal to `GanttFilter` — совпадает с live.

### 2. Summary double-count

`hasOwnDates === false` (`!datesFromChildren`) — правильный критерий; live `scheduleNodes` L532–539 уже нормализует.

### 3. Unassigned

`assigned_to` nullable; отдельная строка без MAX_PARALLEL — product-sound.

### 4. Load filter ≠ hide bars

Предотвращает UX-сюрприз «фильтр исполнителя спрятал Гант».

### 5. Visual channel vs CPM

Critical = outline/accent; overload = bg/side mark + Esc — не коллизия.

### 6. Scope cut leveling

Правильный NO.

### 7. VERIFY wave-standard

tests/unit, scoped eslint, no hex — ok.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Сигнатура `computeLoad` — доуточнить в коде

Sprint:

```ts
computeLoad(nodes, assigneeById, buckets) → Map<bucketKey, Map<assigneeId, number>>
```

Нужно зафиксировать:

- `nodes: ScheduleNode[]` **не** содержат `assigned_to` — `assigneeById: Map<taskId, string | null>` (или pass tasks);  
- `buckets: { key: string }[]` = `model.buckets`;  
- overlap rule: task counts in bucket if `start ≤ bucket ≤ end` (day) / week/month via `bucketKeyOf`?  
  **Обязать:** та же bucket-принадлежность, что бары (`bucketIndexOf` / span covers bucket key).  
- unassigned key: `''` or `null` — string map key prefer `'__none__'`.

Без этого CC угадает week/month overlap — W, не B (разведка + smoke).

### W2. `team` vs assignees on board

Селект из `useTeamMembers()` — ок; задачи с `assigned_to` вне team (left org) — строка orphan.  
Optional: union ids from tasks ∪ team.

### W3. Performance

O(tasks × buckets) на клиенте — fine for CRM sizes; no RPC.

### W4. Product go/no-go

Sprint сам: не делать, если нет пересечений. Не score issue.

### W5. Depends on module

STOP if no `gantt-schedule.test.ts` — correct gate after 1B/CPM.

---

## Баллы

| Критерий | Макс | Факт |
|----------|------|------|
| Executable / STOP / vitest | 20 | 20 |
| Truth vs live Gantt/filter | 25 | 25 |
| Algorithm / rulings (hasOwnDates, unassigned) | 25 | 23 (−2 overlap/bucket detail) |
| UI tasks (filter, click highlight) | 20 | 19 |
| Verify / scope | 10 | 10 |
| **Итого** | **100** | **92** |

---

## Чеклист перед CC

- [x] ≥ 85, no B*  
- [ ] Product: load row needed on real projects  
- [ ] STOP symbols present  
- [ ] Spec overlap rule in implementation comments (W1)  
- [ ] Max parallel = 3 constant at top of file  

**Итог: 92/100 GO → Claude Code.**
