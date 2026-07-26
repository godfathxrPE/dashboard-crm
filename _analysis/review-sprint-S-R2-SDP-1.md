# Ревью: S-R2-SDP-1 — Smart Deal Progression (HITL)

**Дата:** 2026-07-26  
**Ревьюер:** Grok (ai-run/ai-presets, ai_runs.transcript_id NOT NULL, set_field whitelist)  
**Объект:** `_analysis/sprint-S-R2-SDP-1.md`  
**Контекст:** R2-P0-C; no migration by default; HITL write-back after call.

**Шкала:** 0–100; **≥ 85 = GO**.

---

## Вердикт

| Аспект | |
|--------|--|
| Open decision transcript_id default | ✅ good (verified NOT NULL in gen types) |
| No stage_id in proposal | ✅ P2 ban |
| Whitelist = set_field I7 | ✅ |
| Edge preset only, no ai-summarize expand | ✅ |
| Freshness via project.updated_at | ✅ |
| Checkboxes default off | ✅ |
| applied_at idempotency | ✅ |
| Text only render | ✅ |
| Zod before UI | ✅ |
| vitest progression | ✅ |
| Dual path notes vs transcript | 🟡 product confirm |

**Оценка: 91/100 (GO).**  
**Рекомендация:** в CC on default (transcript required) unless Олег asks 080 nullable.

---

## Live

- `supabase/functions/ai-run`, `ai-summarize` exist ✅  
- `ai_runs.transcript_id: string` (required) ✅  
- set_field whitelist next_step/pinned_note/next_action_date/probability ✅ (schema 050)

---

## С чем согласен

1. HITL gap is real product missing.  
2. Shared constant for field whitelist with automations.  
3. No budget/owner/status/org.  
4. Partial apply via checkboxes.  
5. Injection case like S28.  
6. Tasks via existing create hook.  
7. activity_log audit event.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Confirm transcript default in report

Sprint requires explicit report line.

### W2. `ai_runs.result` mutation for applied_at

Client UPDATE ai_runs — need RLS allows author update result. Verify 030 policies; may need only specific keys merge.

### W3. Edge deploy

New preset = edge deploy on gate, not only git.

### W4. Timeline last 5 events payload size

Cap chars as existing presets.

### W5. Meeting entity_type

Contract supports meeting — UI parity with call.

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Product/HITL design | 25 | 25 |
| Security (whitelist, injection, text) | 25 | 24 |
| Contract / edge / apply flow | 25 | 23 |
| Verify / smoke | 15 | 14 |
| Open decisions | 10 | 10 |
| **Итого** | **100** | **91** |

**Итог: 91/100 GO.**
