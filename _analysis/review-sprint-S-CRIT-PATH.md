# Ревью: S-CRIT-PATH — критический путь на Гантте (longest path в DAG)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `143afeb`, `GanttTimeline.tsx`, `use-project-schedule.ts`, `048_task_dependencies.sql`, review S-DEPS-1/fix-loop)  
**Объект:** `_analysis/sprint-S-CRIT-PATH.md` — клиентский longest-path по видимым задачам + подсветка баров/стрелок  
**Контекст:** S-DEPS-1 в проде (`048`, `useTaskDependencies`, link-mode, SVG-стрелки); loop-fix применён (`depSig` + dedupe `setEdges` @ L382–388); схема не меняется

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope: только UI, read-only, без SQL | ✅ |
| DAG / триггер 048 (циклы) | ✅ |
| Точки интеграции в `GanttTimeline.tsx` | ✅ |
| Алгоритм longest-path (DP + backtrack) | ✅ |
| Консистентность с видимыми узлами (W4) | ✅ |
| Предупреждение про dedupe `setEdges` + `critical` | ✅ критично |
| `gt.start`/`gt.end` = date-key строки | ✅ (нужно уточнить HOW) |
| `durDays` через date-helpers | 🟡 `noonMs` не экспортирован |
| Стиль крит-бара: `var(--accent)` vs Tailwind | 🟡 лучше как `isLinkSource` |
| РАЗВЕДКА line refs (`255–300`) | 🟡 сдвинуты (deps @ ~282) |
| GanttBar отдельный файл | ✅ нет — всё в одном файле |
| crm-architect checklist | ✅ |

**Оценка: 9/10.** Спринт зрелый: правильный v1-scope (longest path, не CPM), честные границы, главная грабля S-DEPS-1 (loop) названа заранее.  
**Рекомендация:** **запускать в CC** с 2–3 строками уточнений в HOW (W1–W2).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| 048 `task_dependencies` + cycle trigger | ✅ `trg_zz_check_task_dependency`, `P0001 cycle` |
| `useTaskDependencies` + `depSig` | ✅ L282–291 |
| Стрелки + measurement effect | ✅ L355–398 |
| dedupe `setEdges` (id+d) | ✅ L382–388 (fix-loop применён) |
| `showCritical` / longest-path | ❌ нет |
| `GanttBar.isCritical` | ❌ нет |

---

## С чем согласен полностью

### 1. Scope и WHY

Критический путь как **самая длинная цепочка по сумме длительностей** в DAG — корректный v1 без CPM (ES/EF/LS/LF). Честно задокументировано: FS не enforced на датах (как S-DEPS-1 W7), даты пользовательские. Схема не трогается — всё есть в `task_dependencies` + `GanttTask.start/end`.

### 2. Живой код подтверждает РАЗВЕДКУ

| Утверждение спринта | Live `GanttTimeline.tsx` |
|---------------------|--------------------------|
| `useTaskDependencies` | L282 |
| `edges: {id,d}[]` | L270, L372 |
| `filteredSwimlanes` | L319 |
| `model` / `bucketKeyOf(gt.start)` | L331, L530–531 |
| `GanttBar` + `isLinkSource` | L90–91, L191, L547–548 |
| `data-task-bar` для anchor | L196, L363 |
| Тумблер «Связи» | L440–450 |

`GanttTask` (`use-project-schedule.ts` L10–14): `start`/`end` — **`string` YYYY-MM-DD**, не `Date`. Спринт верно требует «существующую date-логику», не `new Date()` вслепую.

### 3. Алгоритм

- Узлы = видимые датированные задачи в `filteredSwimlanes` — **консистентно** с `anchor()` (L364: нет бара → стрелка скрыта).
- Рёбра только между видимыми узлами — как в measurement loop (L373–376).
- DP `best[id] = max(best[pred]) + durDays(id)` + backtrack — стандартный longest path на DAG.
- Порог «≥1 ребро» для смысла пути — правильно (одиночная задача не «крит. путь»).

### 4. Задача 4 — dedupe setEdges

Это **главный риск** после S-DEPS-1. Сейчас dedupe сравнивает только `id` и `d`:

```382:388:src/components/tasks/GanttTimeline.tsx
      setEdges((prev) => {
        if (
          prev.length === next.length &&
          prev.every((e, i) => e.id === next[i].id && e.d === next[i].d)
        ) return prev;
        return next;
      });
```

Спринт правильно требует добавить `critical` в сравнение **и** `showCritical`/`critSig` в deps effect. Без этого toggle «Крит. путь» не перекрасит стрелки или вернёт update-depth.

### 5. useMemo vs effect-loop

`[filteredSwimlanes, dependencies]` в useMemo для `critical` — безопасно (спринт верно отделяет от measurement-effect со `setState`). `depSig` для effect уже есть — для critical-path useMemo можно тоже завязаться на `depSig`, чтобы не гонять пересчёт на `dependencies = []` каждый рендер.

### 6. Гейты и коммит

`tsc` + `build` + smoke + один файл `GanttTimeline.tsx` — верно (`GanttBar` — внутренняя функция, не отдельный модуль).

---

## Блокеры

Нет. Можно стартовать в CC.

---

## Предупреждения (желательно уточнить в спринте)

### W1. `durDays`: использовать UTC-полдень, не `mskDateKey`

`gt.start`/`gt.end` уже **date-key** строки (из `effectiveSpan`), не timestamptz. Для разницы в днях — паттерн проекта:

```ts
// date-helpers.ts L35–37 (сейчас private)
Date.parse(`${dateKey}T12:00:00Z`)
```

`mskDateKey` — для **timestamptz → MSK-календарь**; для двух YYYY-MM-DD ключей не нужен. В HOW явно: `const ms = Date.parse(\`${gt.end}T12:00:00Z\`) - Date.parse(\`${gt.start}T12:00:00Z\`)` или **экспортировать `noonMs`** из `date-helpers` (как в review VIEW-1 / shiftDateKey).

Inclusive days: `Math.max(1, Math.round(ms / 86_400_000) + 1)` — согласовано с барами (однодневная веха = 1 день).

### W2. Стиль крит-бара — следовать `isLinkSource`

Сейчас predecessor: `ring-2 ring-accent ring-offset-1 ring-offset-surface` (L191) — **токены темы через Tailwind**, не inline `var(--accent)`. Для `isCritical` логичнее **добавить** класс (напр. `ring-2 ring-accent` или border-accent), а не смешивать inline style. Спринт говорит «CSS-переменная» — в scandi это уже `ring-accent` / `border-accent`. Уточнить: «как `isLinkSource`, но другой визуальный вес (заливка vs ring)».

### W3. РАЗВЕДКА: номера строк

`sed -n '255,300p'` попадает в середину `GanttBar`, не в блок deps. Актуальные якоря: deps/state **~268–291**, measurement **~355–398**, controls **~409–450**. Не блокер — CC найдёт по grep из спринта.

### W4. Топосорт при нескольких компонентах DAG

Алгоритм берёт **один** глобальный max — корректно для «самой длинной цепи проекта». Если две несвязные компоненты с равной длиной — backtrack выберет одну (зависит от порядка итерации `best`). Для v1 ок; можно комментом в коде.

### W5. `critical` useMemo deps

Рекомендация: `depSig` вместо `dependencies` (как measurement), плюс стабильный `critSig` только для effect стрелок. В useMemo critical-path достаточно `[filteredSwimlanes, depSig]`.

---

## Пропущенные места

| Файл | Что проверить |
|------|----------------|
| `GanttTimeline.tsx` L382–388 | Расширить dedupe: `e.critical === next[i].critical` |
| `GanttTimeline.tsx` L585–594 | SVG `stroke`/`strokeWidth` по `edge.critical` |
| `GanttTimeline.tsx` L191 | Образец ring для `isCritical` |
| `date-helpers.ts` | Опционально экспорт `noonMs` |

Других файлов не требуется — спринт верно ограничивает diff.

---

## Предлагаемые правки в спринт (1–2 строки в HOW)

1. **Задача 1 `durDays`:** «`noonMs` из date-helpers (или `Date.parse(\`${key}T12:00:00Z\`)`); не `mskDateKey` для date-key строк.»
2. **Задача 3:** «Стиль крит-бара — Tailwind `ring-accent`/`border-accent` по образцу `isLinkSource`, без hex.»
3. **Задача 1 deps useMemo:** «`[filteredSwimlanes, depSig]` вместо `dependencies`.»

---

## Чеклист перед CC

- [x] РАЗВЕДКА есть
- [x] Схема не меняется; 048 + cycle trigger на месте
- [x] Пути верны (`GanttTimeline.tsx` единственный файл)
- [x] learnings S-DEPS-1 loop учтён (dedupe + stable deps)
- [x] CSS через токены темы (уточнить Tailwind vs inline)
- [x] Миграции не apply из CC — N/A
- [x] org_id / RLS — N/A (read-only UI)

**Вердикт для Cowork:** после CC — Chrome-смок из спринта (цепь 3 задач, ветвление, toggle, фильтр «Все» vs «Открытые»).