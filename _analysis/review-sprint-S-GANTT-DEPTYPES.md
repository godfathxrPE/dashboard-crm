# Ревью: S-GANTT-DEPTYPES — типы связей SS / FF / SF

**Дата:** 2026-07-26  
**Ревьюер:** Grok (ветка `main` после merge POLISH/CPM/1B, live `gantt-schedule` + Gantt + 048)  
**Объект:** `_analysis/sprint-S-GANTT-DEPTYPES.md`  
**Контекст:** вынесено из POLISH; POLISH уже в `main` (`5257353`); UI-only; high-risk math rewrite.

**Шкала:** 0–100; **≥ 85 = GO в Claude Code**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + STOP (CHECK text, module, tests, tsc) | ✅ |
| Миграция не нужна (text CHECK, не enum) | ✅ 048 L8 |
| Честный scope (rewrite CPM + cascade) | ✅ |
| 3 места earliest согласованы (warn/cascade/CPM) | ✅ требование |
| Hook expand lag + dep_type only | ✅ live L127 lag-only |
| Vitest path `tests/unit` | ✅ |
| After POLISH (conflicts) | ✅ POLISH merged |
| `depSig` + `dep_type` | 🟡 **не назван** — must fix |
| Cascade/CPM endpoint math for FF/SF | 🟡 under-specified |
| Measure side map (anchor start/end) | 🟡 sketch only |
| Soft-warn copy «FS-нарушение» | 🟡 rename per type |

**Оценка: 88/100 (GO).**  
Порог 85 пройден. **B\* нет.** Исполняемый high-risk спринт с правильными STOP и UI-only truth.

**Рекомендация:** **в CC** на `feat/gantt-dep-types`. Обязательно закрыть W1–W3 в реализации (можно без правки sprint-файла, но не забыть).

---

## Live verification

| Claim | Live |
|-------|------|
| `dep_type text check (FS,SS,FF,SF)` | ✅ `048` L8 |
| `DepType` in `database.ts` | ✅ L330 |
| `computeCascade` / `computeCpm` FS-only filter | ✅ `if (e.dep_type !== 'FS') continue` |
| Soft-warn only `pred.end` → `succ.start` | ✅ Gantt ~L657–669 |
| Measure always `end`→`start` | ✅ ~L935–937 |
| `depSig` = id:pred>succ:**lag only** | ✅ ~L501–503 — **no dep_type** |
| Edge popover «Связь FS» hardcoded | ✅ ~L1543 |
| `useUpdateTaskDependency` lag only | ✅ L127–145 |
| `tests/unit/gantt-schedule.test.ts` | ✅ exists |
| POLISH on main | ✅ merge `5257353` |

---

## С чем согласен

1. **Отдельный спринт** после POLISH — diff/conflict hygiene; POLISH уже влит.  
2. **Не «+if в earliest»** — FF/SF constrains finish; CPM forward/backward must change.  
3. **UI-only** — CHECK already allows four values.  
4. **Hook:** only `dep_type` + `lag_days` (DAG validator INSERT-only) — correct.  
5. **Three calculators must share semantics** — warn/cascade/CPM drift = broken UX.  
6. **lag=0 same-day legal** — keep FS law.  
7. **Vitest + measure-loop caution** — project scar tissue.  
8. **One commit, full reverse** — right for this risk class.

---

## Блокеры

**Нет** (предпосылки и scope достаточны для старта CC).

---

## Предупреждения (сделать в CC, иначе баги)

### W1. `depSig` обязан включать `dep_type`

Сейчас:

```ts
`${d.id}:${d.predecessor_id}>${d.successor_id}:${d.lag_days}`
```

Смена типа **без** lag не инвалидирует measure effect → stale path / wrong anchors / no recolor.  
1a уже добавляла lag в sig по той же причине.

**Must:** `...:${d.lag_days}:${d.dep_type}` (+ compare `dep_type` in edges dedup if stored on `EdgePath`).

### W2. Cascade semantics per type (duration)

Sprint gives constraint inequalities; not the **shift algorithm**:

| Type | Violation | Shift (v1, forward only) |
|------|-----------|---------------------------|
| FS | start < earliest(pred.end) | Δ on start+end |
| SS | start < earliest(pred.start) | Δ on start+end |
| FF | end < earliest(pred.end) | Δ on start+end (preserve dur) |
| SF | end < earliest(pred.start) | Δ on start+end |

Fix in code comments + tests: always preserve duration; only forward; anchors rule from 1B stays.

### W3. Measure sides map

```ts
// proposed
const predSide = dep.dep_type === 'SS' || dep.dep_type === 'SF' ? 'start' : 'end';
const succSide = dep.dep_type === 'FF' || dep.dep_type === 'SF' ? 'end' : 'start';
```

(FS: end→start, SS: start→start, FF: end→end, SF: start→end.)  
Sprint says «левый/правый» without table — CC should use explicit map.

### W4. Soft-warn string

Hardcoded `FS-нарушение` — for SS/FF/SF use type label or neutral «Нарушение связи».

### W5. EdgeMenu state

Extend menu with `dep_type`; mutate both fields; optimistic both.  
Create-link stays **FS** (no change required).

### W6. Topo for mixed graph

Kahn currently only FS edges. With SS/FF/SF all edges must participate in topo (or multi-constraint pass).  
Document: **all four types** in graph for order; ignore unknown.

### W7. Effort 10–14h

Realistic; smoke matrix theme×zoom×type is non-optional for GO quality.

---

## Пропущенные места (inventory)

| Area | Action |
|------|--------|
| `gantt-schedule.ts` cascade + CPM | rewrite FS filter → typed earliest |
| `GanttTimeline` violation useMemo | switch on `dep_type` |
| `GanttTimeline` measure anchor sides | W3 |
| `depSig` / edge dedup | W1 |
| Popover + label | select DepType |
| `use-task-dependencies` | expand input |
| `tests/unit/gantt-schedule.test.ts` | 4 types × lag0 × mixed × fwd/bwd |

---

## Баллы

| Критерий | Макс | Факт |
|----------|------|------|
| Executable / STOP / after POLISH | 20 | 20 |
| Schema truth (no migration) | 15 | 15 |
| Math honesty (CPM rewrite) | 20 | 19 |
| Live hooks / Gantt touch points | 15 | 14 |
| Missing hard gotchas (depSig, sides) | 20 | 12 (−8 W1–W3) |
| Verify / tests path | 10 | 10 |
| **Итого** | **100** | **88** |

---

## Чеклист перед CC

- [x] ≥ 85, no B*  
- [ ] Branch `feat/gantt-dep-types` from fresh main  
- [ ] STOP: CHECK text, module, tests, clean tsc  
- [ ] Implement W1 depSig+dep_type  
- [ ] Typed earliest in warn + cascade + CPM  
- [ ] Measure side map  
- [ ] Vitest: 4 types + mixed + lag0 + fwd/bwd  
- [ ] Smoke matrix; no measure loop  

---

## Итог

**88/100 — GO → Claude Code.**  

Сильный вынос high-risk задачи из POLISH; UI-only и rewrite-scope честные.  
Критично не забыть **`depSig`+`dep_type`**, side map стрелок и единый earliest в трёх местах — иначе «типы есть в UI, математика FS-only».
