# Ревью: S-SCHEDULE-1B — авто-каскад сдвига зависимых задач

**Дата:** 2026-07-25  
**Ревьюер:** Grok (верификация по коду `main`, live paths, vitest.config, Gantt/1a semantics)  
**Объект:** `_analysis/sprint-S-SCHEDULE-1B.md` — `computeCascade` + toast confirm + `useShiftTasks` (UI-only)  
**Контекст:** S-SCHEDULE-1a (soft-warn FS, lag UI) applied в коде; 048/062 deps; `useUpdateTaskDates` + `patchTaskCaches`; следующий задуманный S-GANTT-CPM (файла спринта в `_analysis/` **нет**).

**Шкала:** 0–100; **порог в Claude Code = 85**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА / executable structure | ✅ / 🟡 (тесты: ложный find) |
| UI-only, миграций нет | ✅ |
| Семантика FS = soft-warn 1a | ✅ live |
| `parentId` vs `parent_task_id` (W7) | ✅ |
| Чистый модуль + vitest-first | ✅ идея / ❌ путь тестов |
| `commitDates` как единая точка врезки | ✅ |
| `canManage` gate + sonner action | ✅ |
| `scheduleRef` / recompute on click | ✅ (паттерн undatedDragRef) |
| Cache patch vs `useUpdateTaskDates` | 🟡 |
| Partial batch RLS debt named | ✅ |
| Crit-path / Kahn не трогать | ✅ scope |
| Out-of-scope / долги | ✅ |

**Оценка: 82/100 (NO-GO).**  
Порог **85** не пройден из‑за **B1** (путь/сбор vitest). Продукт и алгоритмический контракт сильные; после правки 5–10 строк в спринте — ожидаемый re-score **~90–92 GO**.

**Рекомендация:** **не отдавать в CC** до фикса B1 (и желательно W1–W2 в том же патче спринта).

---

## Статус

| Заход | В репо |
|-------|--------|
| Soft-warn FS + lag (1a) | ✅ `GanttTimeline.tsx` ~597–618, `violation` / `violSig` |
| `shiftDateKeyByBuckets` / `noonMs` | ✅ `date-helpers.ts` (noonMs **private**, тот же файл — ok для `diffDaysKey`) |
| `useUpdateTaskDates` + `patchTaskCaches` | ✅ `use-tasks.ts` |
| `DependencyEdge` / `DepType` | ✅ hook + `database.ts` (`FS\|SS\|FF\|SF`) |
| `gantt-schedule.ts` / cascade | ❌ ещё нет |
| `sprint-S-GANTT-CPM.md` | ❌ нет (ok, future) |
| vitest unit tests | ✅ **`tests/unit/**/*.test.ts` only** (не `src/**`) |

---

## Разведка: факт vs спринт

| Утверждение | Live |
|-------------|------|
| FS: `earliest = shift(pred.end,'day',lag)`; наруш. `succ.start < earliest` | ✅ `GanttTimeline.tsx` L609–610; lag=0 same-day **легален** |
| `GanttTask.parentId` = parent **в свимлейне** | ✅ `use-project-schedule.ts` L18–19, W7 |
| `datesFromChildren` / effectiveSpan | ✅ L19–21, L37–44 |
| `commitDates` → `updateDates.mutate` | ✅ L672–678; callers: bar drag + undated drop |
| `canManage` UI-гейт write | ✅ props + bars |
| `meta.silentError` | ✅ QueryProvider + deps hooks |
| sonner `toast(..., { action })` | ✅ types: `action?` в sonner |
| Тесты «где-то в src» | ❌ **include только `tests/unit/**`** |
| `npx vitest run src/lib/utils` | ❌ не подхватит файлы вне include |
| `find src -name '*.test.ts'` | ❌ пусто; реальные тесты в `./tests/unit/` |
| `plural` helper | 🟡 только локальный `pluralAction` в `TodayView.tsx` — общего util нет |
| Partial non-atomic batch | ✅ честный долг (RPC v2) |

---

## С чем согласен полностью

### 1. Продукт: propose → confirm

Тост с action, отказ = поведение 1a — совпадает с «AI предлагает — юзер подтверждает». Не silent cascade без колонки `schedule_strict`.

### 2. Алгоритм v1 жёстко зафиксирован

Только FS, только вперёд, duration preserve, max по входящим FS, anchors, cycle guard, subtree по **сырому** `parent_task_id` — правильный контракт под CPM-фундамент.

### 3. Семантика earliest = 1a

Сверка с live soft-warn — идентична. Иначе тост и красные стрелки разъедутся (спринт это явно требует).

### 4. Одна врезка после `commitDates`

Покрывает move / resize / undated drop; не три точки. `canManage` false → no compute.

### 5. Recompute on click (`scheduleRef`)

Грабля stale closure уже в Gantt (`undatedDragRef`) — правильно названа.

### 6. UI-only + named debt

Non-atomic `allSettled` + отсутствие strict mode — осознанно, не скрытый scope creep.

### 7. Не трогать crit-path / inline Kahn

Дедуп в CPM-спринт — чистый diff.

---

## Блокеры (критично — исправить до CC)

### B1. Путь vitest / РАЗВЕДКА / VERIFY / commit — неверны

**Факт:**

```ts
// vitest.config.ts
include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
```

Все unit-тесты лежат в `tests/unit/*.test.ts` (safe-href, delivery-health, plan-import, …).  
Под `src/` test-файлов **нет**.

Спринт:

- РАЗВЕДКА: `find src -name "*.test.ts"` → пусто → CC «не найдёт» convention;  
- VERIFY: `npx vitest run src/lib/utils` → при файле вне include **0 тестов, exit 0** (ложная зелень);  
- commit: `src/lib/utils/__tests__` — **вне include**, тесты не бегут в CI `vitest run`.

Ядро спринта — «математика под 100% vitest». Без правильного пути риск снимается.

**Правка в спринт (минимум):**

```text
Тесты: tests/unit/gantt-schedule.test.ts  (и при необходимости date-helpers в tests/unit/)
РАЗВЕДКА: ls tests/unit | head; cat vitest.config.ts | head -20
VERIFY: npx vitest run tests/unit/gantt-schedule
commit: tests/unit/gantt-schedule.test.ts
```

---

## Предупреждения (после B1 — для 90+)

### W1. «После успешного `commitDates`» ≠ fire-and-forget `mutate`

Сейчас:

```ts
updateDates.mutate(v, { onError: () => toast.error(...) });
```

`mutate` не ждёт сервер. Если предложить каскад сразу после вызова — при 42501 на якоре тост каскада всё равно всплывёт / состояние разъедется.

**Правка:** расширить `commitDates` / вызвать `mutate` с **`onSuccess`** (предложение каскада только там) или `mutateAsync` + try/catch. Явно в ЗАДАЧЕ 5.

### W2. Оптимистик — только через `patchTaskCaches` / `snapshotTaskCaches`

Спринт: «патч кэша борда». Live-грабля (коммент `useUpdateTaskDates`): Гант читает `['tasks','board',projectId]`, личный — `['tasks']`; **единый** `patchTaskCaches` по префиксу `['tasks']`.

**Правка:** в ЗАДАЧЕ 4 явно: «скопировать механики `useUpdateTaskDates` (snapshotTaskCaches + patchTaskCaches), не `setQueryData` только board».

### W3. `hasOwnDates: false` не должен попадать в `mutationFn`

Правило 5 есть; в `useShiftTasks` не сказано filter.  
`datesFromChildren` span — **синтетика**; запись в `start_date`/`end_date` материализует фантом.

**Правка:** `computeCascade` **не эмитит** CascadeShift для `!hasOwnDates` (только working map + дети), **или** hook: `shifts.filter(s => …)` / поле `write: boolean`.

### W4. Плюрализация

Общего `plural` util нет (`TodayView.pluralAction` локальный). Inline 3-form ok; не искать несуществующий helper.

### W5. VERIFY `eslint` path

`npx eslint src/lib/utils …` — ок если eslint настроен; иначе tsc+vitest достаточно. Не блокер.

### W6. `sprint-S-GANTT-CPM.md`

Ссылка на следующий спринт — файла нет. Не блокер 1B.

### W7. Partial rights toast

`tasks_update` RLS: owner/admin ∨ assigned ∨ created — `canManage` уже уже. Частичный fail на чужих successor — редкий edge; allSettled + invalidate — ок.

---

## Пропущенные места

| Файл | Действие |
|------|----------|
| `tests/unit/gantt-schedule.test.ts` | **сюда** тесты (B1) |
| `vitest.config.ts` | не менять include |
| `src/lib/hooks/use-tasks.ts` | `useShiftTasks` рядом с `useUpdateTaskDates`, reuse patch helpers |
| `src/lib/utils/date-helpers.ts` | `diffDaysKey` (доступ к private `noonMs` / `GANTT_DAY_MS`) |
| `src/components/tasks/GanttTimeline.tsx` | только post-success `commitDates` + toast + scheduleRef |
| `src/lib/utils/gantt-schedule.ts` | new pure module |

Ложных путей к Gantt/hooks/deps — нет.

---

## Предлагаемые правки в спринт (чтобы ≥ 85)

1. **B1:** `tests/unit/gantt-schedule.test.ts` + РАЗВЕДКА/VERIFY/commit.  
2. **W1:** каскад-тост только в `onSuccess` даты якоря.  
3. **W2:** `patchTaskCaches` / `snapshotTaskCaches` by name.  
4. **W3:** не писать `!hasOwnDates` в БД.  
5. (опц.) пример sonner:

```ts
toast.message(`Сдвинуть ${n} …?`, {
  duration: 12_000,
  action: { label: 'Сдвинуть', onClick: () => { /* recompute + mutate */ } },
});
```

(проверить API: `toast()` vs `toast.message` — оба в sonner; action поддерживается.)

---

## crm-architect checklist

| Пункт | |
|-------|--|
| РАЗВЕДКА | 🟡 (ложный find tests) |
| Реальные columns (`start_date`/`end_date`/`parent_task_id`/`lag_days`) | ✅ |
| Реальные paths Gantt/hooks | ✅ |
| learnings: measure-loop, undated ref, patch board | ✅ / W2 |
| Миграции | N/A UI-only ✅ |
| RLS new | N/A; reuse tasks_update ✅ |
| CSS variables | N/A toast sonner ✅ |
| schema.md | N/A |

---

## Балльный разбор

| Критерий | Макс | Факт |
|----------|------|------|
| Executable structure | 15 | 13 (−2 test discovery) |
| Truth vs live Gantt/1a/FS | 20 | 20 |
| Algorithm / scope / pure module | 20 | 19 (−1 hasOwnDates write ambiguity) |
| Hooks / cache / RLS honesty | 15 | 12 (−3 board-only wording, success path) |
| File inventory / vitest layout | 15 | 8 (−7 B1) |
| Verify / smoke / debts | 15 | 10 (−3 false vitest cmd, −2 onSuccess) |
| **Итого** | **100** | **82** |

Cap: B1 → **NO-GO** (≤ 84).

---

## Чеклист перед CC (после правок спринта)

- [ ] B1 закрыт: tests в `tests/unit/`, VERIFY зелёный с реальными кейсами  
- [ ] W1: onSuccess якоря  
- [ ] W2: patchTaskCaches  
- [ ] W3: no DB write for datesFromChildren  
- [ ] Оценка re-review ≥ 85  
- [ ] Ветка `feat/schedule-1b-cascade`  
- [ ] Миграций нет — apply-гейт не нужен  

---

## Итог

**82/100 — NO-GO.**  
Сильный product/algorithm sprint, но **vitest-пути ломают главный safety net**.  
Патч B1 (+ желательно W1–W3) → re-review → ожидаемо **GO ≥ 90**.
