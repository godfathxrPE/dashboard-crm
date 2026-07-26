# Ревью: S-R2-TRANSITION-1b — Stage Transition Modal

**Дата:** 2026-07-26  
**Ревьюер:** Grok (depends on 1a artifacts; Modal/wonReasons patterns)  
**Объект:** `_analysis/sprint-S-R2-TRANSITION-1b.md`  
**Контекст:** UI-only after 078 applied; Blueprint-style During fields.

**Шкала:** 0–100; **≥ 85 = GO**.

---

## Вердикт

| Аспект | |
|--------|--|
| Hard STOP if 1a / 078 missing | ✅ |
| preview + During fields from unmet | ✅ |
| No status write (trigger-derived) | ✅ critical |
| Single zustand open() | ✅ anti double-modal |
| Won/lost reasons reuse validators | ✅ |
| Refetch unmet before commit | ✅ |
| Gate errors inside modal | ✅ P0 acceptance |
| Metric event always | ✅ |
| Delivery boards excluded | ✅ |
| automation preview caveats | ✅ |
| Depends on 1a quality | 🟡 sequential |

**Оценка: 90/100 (GO)** — **только после** merge+apply 1a.  
**Рекомендация:** не стартовать, пока 078 не в prod и `commitTransition`/`wf-conditions` на месте.

---

## С чем согласен

1. Flagship UX on solid 1a substrate.  
2. Unsupported gate columns as non-editable checklist rows.  
3. Client automation preview, not dry-run RPC.  
4. Disable confirm during mutation.  
5. Replace fragmented win/loss buttons with modal.  
6. Return-to-work still opens modal (clear reasons).  
7. No AI stage hints / playbooks / RPC transition.

---

## Блокеры

**Нет для текста спринта.**  
**Process B:** starting without applied 078 = runtime failure (STOP-2 already).

---

## Предупреждения

### W1. `useStageGate(projectId, toStageId)` API

Confirm hook supports target stage preview today; may need thin extend in 1b if only current-stage.

### W2. Store holds full `project` object

Stale project between open and confirm — refetch fields or pass id + load. Prefer id + query.

### W3. File requirements

Show checklist only — correct; link to upload path optional.

### W4. Kanban drag UX

Opening modal on every drag may feel heavy — product accepted; ensure cancel restores card position (optimistic).

### W5. Themes smoke aura+fuji

Named — keep.

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Preconditions / STOP | 20 | 20 |
| UX contract completeness | 30 | 28 |
| Safety (status, race, double-submit) | 25 | 24 |
| Scope cuts | 15 | 15 |
| Verify matrix | 10 | 10 |
| **Итого** | **100** | **90** |

**Итог: 90/100 GO (after 1a).**
