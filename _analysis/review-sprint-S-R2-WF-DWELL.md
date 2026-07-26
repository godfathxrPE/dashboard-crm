# Ревью: S-R2-WF-DWELL — days_in_stage + suggest_spawn

**Дата:** 2026-07-26  
**Ревьюер:** Grok (050/051 patterns, notifications checks, automation UI)  
**Объект:** `_analysis/sprint-S-R2-WF-DWELL.md`  
**Контекст:** R2-P0-E; migration **079** after 078; extends engine, no rewrite.

**Шкала:** 0–100; **≥ 85 = GO**.

---

## Вердикт

| Аспект | |
|--------|--|
| Extends 050/051 CHECKs via live constraint names | ✅ |
| Cron pattern from 051 | ✅ |
| trigger_key dwell idempotency | ✅ smart (stage@entered_at) |
| No auto-spawn I8 | ✅ |
| suggest_spawn = notification only | ✅ |
| Reuse action branches (refactor risk named) | ✅ |
| Cron minute stagger 10 6 | ✅ |
| Client constants/validators/RuleEditor | ✅ |
| Deep link ?spawn=1 | ✅ minimal |
| Parallel vs SEGMENTS numbering | 🟡 must be after 078 |
| Extract shared actions from 050 | 🟡 highest risk |

**Оценка: 89/100 (GO).**  
**Рекомендация:** в CC after 078 number free; gate smoke 1–6 including stage_entered regression.

---

## С чем согласен

1. Time-based like task_overdue, not row trigger.  
2. open client projects only.  
3. Re-fire on re-entry via stage_entered_at change.  
4. min_days change doesn’t re-fire same stay — documented.  
5. Rollback note for CHECK narrowing.  
6. notifications_type_check += spawn_suggest (live constraint from 045/050 chain).

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Migration order

Sprint says independent of TRANSITION but **079 after 078**.  
If 1a delayed, either wait or take 078 for dwell and renumber 1a — **don’t dual-claim 079**.

### W2. Factoring `run_stage_automations` actions

Highest regression surface. Prefer: extract `wf_dispatch_action(...)` used by stage + dwell; smoke stage_entered create_task before merge.

### W3. `stage_entered_at` updates

Confirm existing sync triggers still bump on stage_id change (else dwell broken). Live exploration required.

### W4. UI filter days_in_stage vs task_overdue

task_overdue UI limited notify/activity — mirror for dwell + suggest_spawn allowlist.

### W5. No unit tests for SQL

Acceptable; gate manual run_dwell_automations required.

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Engine extension design | 30 | 28 |
| I8 / product safety | 20 | 20 |
| Client wiring | 20 | 18 |
| Process / smoke | 15 | 14 |
| Order / risk honesty | 15 | 14 |
| **Итого** | **100** | **89** |

**Итог: 89/100 GO.**
