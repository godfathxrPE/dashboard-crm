# Ревью: S-GANTT-CPM — полный CPM (ES/EF/LS/LF + total float)

**Дата:** 2026-07-25  
**Ревьюер:** Grok (код `main`, `GanttTimeline` S-CRIT-PATH, vitest.config, dep on 1B)  
**Объект:** `_analysis/sprint-S-GANTT-CPM.md`  
**Контекст:** longest-path DP live (~L512–591); `gantt-schedule.ts` **ещё нет** (ждёт S-SCHEDULE-1B); soft-warn FS 1a; UI-only.

**Шкала:** 0–100; **≥ 85 = GO в CC**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Зависимость от 1B / модуль | ✅ (верно; 1B сам NO-GO 82) |
| WHY / SNET-модель vs user dates | ✅ |
| Формулы FS = 1a/1B | ✅ |
| Live longest-path → замена | ✅ claims match code |
| `critSig` детерминизм | ✅ |
| vitest path / VERIFY / commit | ❌ **B1** (как 1B) |
| UI totalDays badge | 🟡 |
| LF-формулировка / free float | 🟡 |

**Оценка: 83/100 (NO-GO).**  
Алгоритм и scope сильные; **тот же B1 vitest**, что валит 1B.  
Плюс: **не стартовать**, пока 1B не смёржен и `gantt-schedule.ts` не существует.

**Рекомендация:** правки B1 (+ желательно W1) → re-review → GO после merge 1B.

---

## С чем согласен

1. **Longest path ≠ total float** — product rationale верный; dual critical chains = цель.  
2. **SNET / own_start** — адекватно user-dated Gantt (не pure classic CPM).  
3. **`TF < 0` = FS-нарушение 1a** — согласовано с red arrows.  
4. **Только FS** + shared `shiftDateKeyByBuckets` / `diffDaysKey` — три места (warn/cascade/CPM).  
5. **Удалить inline DP + local `durDays`** — live `durDays` L523–524 совпадает с описанием.  
6. **critSig по sorted ids** — грабля measure-loop учтена.  
7. **UI-only, no migration** — ok.

---

## Блокеры

### B1. Vitest layout (копия дефекта 1B)

`vitest.config.ts` → `include: ['tests/unit/**/*.test.ts(x)']`.  
VERIFY `npx vitest run src/lib/utils` + commit `src/lib/utils/__tests__` → **тесты не бегут**.

**Фикс:** `tests/unit/gantt-schedule-cpm.test.ts` (или расширить существующий `gantt-schedule` suite после 1B);  
`npx vitest run tests/unit/gantt-schedule`.

---

## Предупреждения

### W1. Badge «Крит. путь: N дн»

Сейчас `critical.totalDays` = longest-path sum. После CPM `totalDays` нет в return shape (`projectFinish` есть).  
Либо: длина горизонта `diffDaysKey(min ES, projectFinish)+1`, либо убрать badge, либо sum duration критических — **явно в спринте**.

### W2. Зависимость от 1B

На `main` нет `gantt-schedule.ts`. РАЗВЕДКА `grep gantt-schedule` упадёт — STOP condition: «если файла нет — 1B не смёржен, не начинать».

### W3. Сводные + рёбра (двойной учёт)

Долг назван — ок. В UI tooltip float может «врать» на summary — footnote optional.

### W4. Edge critical = both ends critical

Сохраняете как сейчас — ok; при multi-critical paths рёбер станет больше (by design).

### W5. Soft-warn в Gantt всё ещё FS-only

Согласовано до POLISH; CPM тоже FS-only — ok.

---

## Баллы

| Критерий | Макс | Факт |
|----------|------|------|
| Structure / dependency | 15 | 14 |
| Algorithm truth vs product | 25 | 24 |
| Live code match (CRIT-PATH) | 20 | 20 |
| Tests / verify layout | 20 | 10 (−10 B1) |
| UI integration (critSig, tooltip) | 20 | 15 (−3 totalDays, −2 stop-if-no-1B) |
| **Итого** | **100** | **83** |

---

## Чеклист перед CC

- [ ] 1B merged + `gantt-schedule.ts` exists  
- [ ] B1 vitest path fixed in sprint text  
- [ ] W1 totalDays/badge decided  
- [ ] Re-score ≥ 85  

**Итог: 83/100 NO-GO** (после B1 + 1B → ожидаемо ~91 GO).
