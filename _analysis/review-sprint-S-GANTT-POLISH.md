# Ревью: S-GANTT-POLISH — undo, типы связей, экспорт, навигация

**Дата:** 2026-07-25  
**Ревьюер:** Grok (ветка `feat/gantt-baseline-1` / live Gantt + `gantt-schedule.ts` + 1B/CPM)  
**Объект:** `_analysis/sprint-S-GANTT-POLISH.md`  
**Контекст:** после 1B (cascade toast) + CPM (`computeCpm`); UI-only; задача 2 опционально «резать».

**Шкала:** 0–100; **≥ 85 = GO в Claude Code**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + STOP (CPM / tests / html2canvas) | ✅ |
| Vitest only `tests/unit/**` | ✅ (wave-bug закрыт) |
| Live: `proposeCascade` / `commitDates` / `useShiftTasks` | ✅ line claims match |
| Undo + sonner `action`+`cancel` (1 toast) | ✅ |
| Undo only full success; undated out | ✅ |
| dep_type = text CHECK, не enum | ✅ 048 L8 |
| Task 2 risk honesty + separate commit | ✅ |
| Export = print, no new dep | ✅ |
| Nav: today line | 🟡 **уже есть** |
| MSK key «из gantt-schedule» | 🟡 на самом деле `date-helpers` |
| `useUpdateTaskDependency` + dep_type | 🟡 нужно расширить (в задаче 2) |

**Оценка: 90/100 (GO).**  
Порог 85 пройден. **B\* нет.**  
Рекомендация: **в CC**, желательно **без Задачи 2** в первом заходе (1+3+4); Задачу 2 — отдельный спринт/PR как сам sprint советует.

---

## С чем согласен

### 1. Executable + STOP

Жёсткие стопы на отсутствие `computeCpm` / `gantt-schedule.test.ts` — правильно.  
html2canvas: отсутствует в package, STOP «если уже есть — сказать» — ok.

### 2. Undo design (Task 1)

Live:

- `proposeCascade` L687–708: toast 12s + action «Сдвинуть», recompute on click  
- `commitDates` L715–721: `onSuccess → proposeCascade`  
- `useShiftTasks` L396: allSettled + silentError  
- `pluralDependent` уже в файле  

Rulings: один toast (`cancel` + `action`), undo только `failed===0`, undated без undo — снимают реальные UX/API ловушки. Sonner `cancel?` есть в types.

Prev из onMutate cache / bar closure — верно vs snapshotTaskCaches.

### 3. Task 2 honesty

`dep_type text CHECK (...FS,SS,FF,SF)` — **не** pg_enum.  
CPM rewrite для constraints on `end` — не «+3 if branch».  
Отдельный коммит / optional cut — правильно.

### 4. Export print-first

Нет зависимости; color-mix/themes risk named; `@media print` — ok.

### 5. VERIFY

`tests/unit/gantt-schedule`, scoped eslint, no false green — wave standard.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. «Вертикальная линия сегодня» уже в коде

```tsx
// GanttTimeline ~L1087–1089
{todayIdx !== -1 && (
  <div style={{ gridColumn: `${todayIdx + 1}` }} className="border-l border-accent" />
)}
```

Задача 4 не «добавить с нуля», а **проверить/усилить** (z-index поверх баров, толщина) + **новые**: «Сегодня» button, autoscroll once, weekend shading.  
Иначе CC дублирует линию.

### W2. MSK-ключ не в `gantt-schedule.ts`

`todayIdx` уже: `mskDateKey(new Date())` из **`date-helpers`**.  
В `gantt-schedule` нет MSK-хелпера.  
**Фикс текста:** «`mskDateKey` из `date-helpers`» (не invent second helper в schedule module).

### W3. Task 2 — расширить hook явно

`useUpdateTaskDependency` сейчас:

```ts
mutationFn: async (input: { id: string; lag_days: number })
// update({ lag_days }) only
```

Нужно: `{ id, lag_days?, dep_type? }`, optimistic оба поля, popover select.  
Sprint говорит «строго dep_type и lag_days» — добавить 3–4 строки «расширить input».

### W4. Soft-warn + measure edges (Task 2)

Violation loop FS-only L605–618; measure L811+.  
SS/FF endpoint geometry — high risk; smoke matrix zoom×themes обязателен.  
Не блокер если Task 2 cut.

### W5. Single-drag undo prev = effective span

`gt.start`/`gt.end` могут быть deadline-derived; undo пишет в `start_date`/`end_date` — материализует span (как сам drag). Acceptable; footnote optional.

### W6. Branch expectation

РАЗВЕДКА ждёт `main` after CPM. Сейчас worktree может быть на baseline/feature — STOP по symbols, не по имени ветки. Ok.

---

## Баллы

| Критерий | Макс | Факт |
|----------|------|------|
| Executable / STOP / vitest path | 20 | 20 |
| Live code match (1B toast, hooks) | 20 | 20 |
| Task 1 design depth | 20 | 19 |
| Task 2 honesty / scope cut | 15 | 14 |
| Task 3–4 accuracy | 15 | 11 (−3 today line exists, −1 msk path) |
| Verify / commits | 10 | 10 |
| **Итого** | **100** | **90** |

---

## Чеклист перед CC

- [x] ≥ 85, no B*  
- [ ] Решить: **с Task 2 или без** (рекоменд. без → 1,3,4)  
- [ ] STOP: `computeCpm` + `tests/unit/gantt-schedule.test.ts` present  
- [ ] Task 4: не дублировать today line (W1)  
- [ ] Одна задача = один commit  

**Итог: 90/100 GO → Claude Code** (лучше slice 1+3+4 first).
