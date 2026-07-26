# Ревью: S-R2-SEGMENTS-1 — org settings + segments

**Дата:** 2026-07-26  
**Ревьюер:** Grok (`main`, reconnect consumers, settings layout, 075 free → 076/077)  
**Объект:** `_analysis/sprint-S-R2-SEGMENTS-1.md`  
**Контекст:** R2-P0-B/D; review arch F5/F8/F10/F11.

**Шкала:** 0–100; **≥ 85 = GO**.

---

## Вердикт

| Аспект | |
|--------|--|
| 076/077 free after 075 | ✅ |
| A: org settings jsonb + owner-only honesty | ✅ `org_update_owner` |
| reconnect consumers exist | ✅ Today/Contacts/Companies + last-touch |
| B: segments model + partial unique names | ✅ |
| F10/F11 no import / no user_state | ✅ |
| 075 revoke lesson on grants | ✅ |
| Predicate eval + MSK days | ✅ |
| SavedViewChips untouched | ✅ 4 consumers |
| Personal SELECT org-wide | 🟡 privacy |
| Seed ON CONFLICT vs partial indexes | 🟡 |
| `stage_dwell_defaults` UI deferred | 🟡 ok for v1 |

**Оценка: 88/100 (GO).**  
**Рекомендация:** в CC; миграции не apply. Желательно закрыть W1 (SELECT personal).

---

## С чем согласен

1. **Независимый first R2 sprint** — no deal write-path.  
2. **Owner-only org UPDATE** — document in UI, don’t widen policy.  
3. **Merge patch settings**, not replace whole jsonb.  
4. **Partial unique** shared vs personal names.  
5. **No trg_set_org_id** — explicit org_id (stage_req pattern).  
6. **WITH CHECK = USING** on update (anti personal→shared).  
7. **Client eval + 5k threshold comment**.  
8. **deals whitelist only** UI.  
9. **Silence segment not seeded** (last_touch client).

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Personal segments visible org-wide

```sql
segments_select: org_id = current_org_id()  -- all members
```

Личные сегменты читают все. Обычно:  
`is_shared OR owner_id = auth.uid() OR role IN ('owner','admin')`.  
Иначе `SegmentsBar` светит чужие personal filters.  
**Product decide** — если «org sees all» intentional, comment; иначе fix SELECT.

### W2. Seed `ON CONFLICT DO NOTHING`

Without inference target, OK on unique violation. Partial unique works in PG for DO NOTHING.  
Verify on gate re-apply seed.

### W3. `auth.uid()` in policies

Prefer `(select auth.uid())` initplan — style, not blocker.

### W4. Types before apply

Hand-stub segments / settings like baselines until gen.

### W5. `dwell` in OrgSettings type without UI

OK forward-compat; don’t build dwell UI here (WF/transition).

### W6. Migration number race

If 076 taken by parallel branch — STOP renumber.

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Structure / numbers | 15 | 15 |
| Part A settings | 20 | 19 |
| Part B schema/RLS | 25 | 21 (−4 personal select) |
| Eval + tests + UI scope | 25 | 24 |
| Process (no apply, smoke) | 15 | 15 |
| **Итого** | **100** | **88** |

**Итог: 88/100 GO.**
