# Ревью: S-GANTT-POLISH + S-GANTT-LOAD (хвост дорожной карты)

**Дата:** 2026-07-25  
**Ревьюер:** Grok (код `main`, package.json, Gantt filter/edge menu, vitest, 1B/CPM deps)  
**Объект:** `_analysis/sprint-S-GANTT-POLISH-LOAD.md` (два спринта в одном файле)  
**Контекст:** roadmap после 1B → CPM → BASELINE; файл сам помечает детализацию «грубее».

**Шкала:** 0–100; **≥ 85 = GO**. B* → max 84.  
Architecture/roadmap briefs без executable РАЗВЕДКА/задач → обычно **&lt; 85**.

---

## Вердикт (сводно)

| Спринт | Оценка | CC |
|--------|--------|-----|
| **S-GANTT-POLISH** | **68/100 (REJECT)** | нет — нужен полноценный sprint-файл |
| **S-GANTT-LOAD** | **71/100 (NO-GO)** | нет — дописать + поправить false claims |

**Рекомендация:** не отдавать в CC. После 1B/CPM/BASELINE — разнести на  
`sprint-S-GANTT-POLISH.md` + `sprint-S-GANTT-LOAD.md` с РАЗВЕДКОЙ как 1B.

---

# Часть A — S-GANTT-POLISH

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Undo после 1B (ценность) | ✅ idea |
| SS/FF/SF semantics in one module | ✅ idea |
| Dep UPDATE only type/lag (048 DAG) | ✅ |
| РАЗВЕДКА / file paths / VERIFY | ❌ нет |
| vitest path | ❌ `src/lib/utils` |
| html2canvas в package | ❌ нет |
| Soft-warn Gantt только FS | 🟡 must update with types |
| Edge geometry for SS/FF | 🟡 under-specified |
| One commit vs «резать задачи» | 🟡 conflict |

**Оценка: 68/100 (REJECT).**

## Согласен

1. **Undo** после cascade — highest ROI; reuse `useShiftTasks` reverse batch.  
2. **dep_type UPDATE** only with lag — 048 validator INSERT-only (live comment `useUpdateTaskDependency`).  
3. **Enum DepType** already `FS|SS|FF|SF` in types + CHECK 048 — likely UI-only if DB enum matches (разведка `pg_enum` нужна).  
4. **Semantics in `gantt-schedule.ts` only** — right place; warn/cascade/CPM must stay aligned.  
5. **Export PNG** optional + print fallback — realistic about oklch/html2canvas.  
6. **Today / weekend shading** — low risk UX.

## Блокеры / gaps

### B1. Не executable sprint

Нет:

- блока РАЗВЕДКА с командами;  
- точных путей/сигнатур hook/Gantt;  
- «ЖЁСТКО НЕ ТРОГАТЬ»;  
- accept criteria / smoke numbered;  
- commit paths.

«Перед стартом — разведка по образцу 1B» перекладывает дизайн на CC.

### B2. Vitest path (wave-wide bug)

`vitest run src/lib/utils` + tests under src — **не** `tests/unit/**`.

### B3. Зависимости не зафиксированы

Undo **requires 1B** (`useShiftTasks`). Types **require CPM+1B module**.  
Старт POLISH до merge 1B/CPM = blocked — в шапке нет hard gate.

### W1. html2canvas

Нет в `package.json`. Нужно: `npm i html2canvas` + types **или** только print path.

### W2. Soft-warn + measure edges

1a violation loop FS-only (`GanttTimeline` L609). SS/FF/SF требуют:

- `earliest` helper shared;  
- measure endpoints (left vs right) — «самое муторное» без алгоритма hit-test.

### W3. `useUpdateTaskDependency` сейчас только `lag_days`

Расширить mutation `{ id, lag_days?, dep_type? }` + optimistic — не написано.

### W4. «Один коммит на фичу» vs один спринт

Задачи 1–4 лучше **4 commits** или 4 mini-sprints — иначе hard revert SS/FF.

## Баллы POLISH

| | Макс | Факт |
|--|------|------|
| Executable structure | 25 | 8 |
| Idea quality / order | 20 | 18 |
| Schema/deps truth | 20 | 14 |
| Implementation specificity | 25 | 12 |
| Verify/tooling | 10 | 6 |
| **Итого** | **100** | **68** |

---

# Часть B — S-GANTT-LOAD

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Idea heat-map / no leveling | ✅ |
| Pure `computeLoad` + vitest | ✅ idea |
| Exclude summary double-count | ✅ |
| Client data only | ✅ |
| «Reuse existing assignee filter» | ❌ **B1** — фильтра по assignee **нет** |
| РАЗВЕДКА / wiring UI | ❌ thin |
| vitest path | ❌ |

**Оценка: 71/100 (NO-GO).**

## Согласен

1. **Show overload, don't level** — правильный product cut.  
2. **`assigned_to` + Gantt spans** уже в клиенте.  
3. **Exclude `isSummary`** — иначе double count.  
4. **MAX_PARALLEL constant** + CSS warning token — ok.

## Блокеры

### B1. «Переиспользовать существующий фильтр Ганта» — ложь

Live filter (`GanttFilter`): **`open` | `all` | `milestones`** — **не** assignee.  
Assignee только display name на баре (`nameById`).

Нужно: новый filter UI (select assignee / all) + wire into load row — **описать как задачу**, не «reuse».

### B2. Не executable

Нет: точных insert points в `GanttTimeline`, row height interaction with `ROW_H`, empty assignees, undated tasks, theme tokens list, tests path `tests/unit/…`.

## Баллы LOAD

| | Макс | Факт |
|--|------|------|
| Idea / scope cut | 25 | 23 |
| Truth vs live Gantt | 25 | 12 (−13 false filter) |
| Executable tasks | 30 | 18 |
| Verify | 20 | 18 |
| **Итого** | **100** | **71** |

---

# Общее по файлу

## Порядок волны (из спринта)

```
1B → CPM → BASELINE → POLISH → LOAD
```

| Sprint | Review score | CC now? |
|--------|--------------|---------|
| S-SCHEDULE-1B | 82 NO-GO | после B1 vitest |
| S-GANTT-CPM | 83 NO-GO | после 1B + vitest |
| S-GANTT-BASELINE-1 | 74 NO-GO | после SQL B1–B3 |
| S-GANTT-POLISH | 68 REJECT | rewrite sprint |
| S-GANTT-LOAD | 71 NO-GO | rewrite + filter truth |

## Предлагаемые next steps

1. Починить **1B** (vitest `tests/unit`) → GO → CC.  
2. **CPM** same vitest fix → after 1B.  
3. **BASELINE** hard-delete (or exception) + drop `tasks.deleted_at` + GRANTs + profiles FK + deadline snapshot → re-review.  
4. **POLISH/LOAD** — отдельные `_analysis/sprint-S-GANTT-POLISH.md` / `…-LOAD.md` по шаблону 1B (РАЗВЕДКА, задачи, VERIFY, commit).

---

## Итог одной строкой

**Оба хвоста — roadmap-заметки, не готовые промпты для Claude Code (68 / 71 &lt; 85).**
