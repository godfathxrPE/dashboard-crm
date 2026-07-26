# Ревью: S-R2-TRANSITION-1a — gate patch + stage_transitions + unified write

**Дата:** 2026-07-26  
**Ревьюер:** Grok (`main`, baseline `check_stage_requirements` / `aa_enforce_stage_gate`, write-paths)  
**Объект:** `_analysis/sprint-S-R2-TRANSITION-1a.md`  
**Контекст:** R2 foundation; UI unchanged; after SEGMENTS (078).

**Шкала:** 0–100; **≥ 85 = GO**.

---

## Вердикт

| Аспект | |
|--------|--|
| F1 gate reads pre-update row | ✅ **confirmed** baseline L: SELECT INTO then field CASE on v_project |
| F2 no stage history since 047 | ✅ plausible; STOP live tg check correct |
| New `_row` + 2-arg delegate (no overload ambig) | ✅ excellent |
| stage_transitions + soft audit (EXCEPTION swallow) | ✅ |
| 075-style grants | ✅ |
| trg_zy before zz automations | ✅ |
| Unified `commitTransition` + write-path table | ✅ |
| PipelineBoard via moveToStageId | ✅ covers 4 board points |
| ProjectModal stage read-only | ✅ |
| wf-conditions golden tests | ✅ |
| metric without source column | ✅ honest |
| StageBoard/Delivery also use moveToStageId | ✅ covered if service under hook |
| Live function body may differ baseline | 🟡 STOP-2 |

**Оценка: 91/100 (GO).**  
**Рекомендация:** в CC after SEGMENTS merge / free 078. **Hot path** — gate smoke matrix mandatory.

---

## F1 proof (live baseline)

```sql
-- aa_enforce: check_stage_requirements(NEW.id, NEW.stage_id)
-- check_*: SELECT * INTO v_project FROM projects WHERE id = p_project_id
-- field checks use v_project.* (disk row = OLD for concurrent same-statement visibility)
```

Postgres BEFORE UPDATE: `SELECT` same row typically sees **OLD** image → patch fields invisible → F1 real.  
`to_jsonb(NEW)` in enforce is the right fix.

---

## С чем согласен

1. Split 1a/1b like DEPTYPES/POLISH.  
2. Don’t drop 2-arg RPC (use-stage-gate).  
3. Single CASE for supported columns.  
4. Audit never blocks UPDATE.  
5. No backfill.  
6. No playbooks/RPC transition yet.  
7. Behavior-preserving client rewiring.

---

## Блокеры

**Нет** (STOP-1/2 handle live drift).

---

## Предупреждения

### W1. Write-path inventory completeness

Also call `moveToStageId`: **StageBoard**, **DeliveryPipelineBoard**.  
If only `useMoveProject` internals change → OK. Grep acceptance must allow delivery paths (1b excludes modal, not service).

### W2. `log_stage_change` still in baseline.sql

File still defines `on_stage_change` — may be dead in prod after 047.  
**Always** take live `pg_trigger` / `pg_get_functiondef` as STOP says.

### W3. `changed_by` NULL in service context

OK; document for analytics.

### W4. Types / gen after 078

Stub `stage_transitions` until gate gen.

### W5. `commitTransition` + comment activity_log

Non-atomic vs stage update — acceptable; metric already approximate.

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Problem diagnosis F1/F2 | 25 | 25 |
| Migration design | 25 | 24 |
| Client unification | 20 | 19 |
| Tests / metric honesty | 15 | 14 |
| Process / smoke | 15 | 15 |
| **Итого** | **100** | **91** |

**Итог: 91/100 GO.**
