# Ревью: FIX S-GANTT-BASELINE-1 — правки после Cowork-гейта

**Дата:** 2026-07-25  
**Ревьюер:** Grok (ветка `feat/gantt-baseline-1` @ `8addfa9`, live 074 + hooks + Gantt)  
**Объект:** `_analysis/fix-S-GANTT-BASELINE-1.md`  
**Контекст:** baseline уже в коде; миграция 074 **не applied** → правка файла 074 допустима; 3 коммита, fix 1 до apply.

**Шкала:** 0–100; **≥ 85 = GO в Claude Code**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + STOP (074 applied / dirty tree / useOrgRole) | ✅ |
| Порядок: fix1 pre-apply → gate → fix2/3 | ✅ |
| A: RPC visibility = SELECT predicate | ✅ live bug real |
| B: `meta.silentError` double toast | ✅ live bug real |
| C: horizon + ghost `?? 0` | ✅ live bug real |
| D: Trash vs DELETE RLS | ✅ live bug real |
| G: p_name / empty previous / success toast / select | ✅ |
| F: CASCADE task_id out of scope | ✅ |
| Vitest `tests/unit` + pure `computeHorizon` | ✅ |
| STOP-3 vs dirty analysis tree | 🟡 |
| Line anchors (~L682 model) | 🟡 drift ok |

**Оценка: 93/100 (GO).**  
Все три фикса бьют в **подтверждённые** дыры live-кода. Блокеров нет.

**Рекомендация:** **в CC**, строго: fix 1 → **стоп / apply 074 гейтом** → fix 2 → fix 3. Не apply из CC.

---

## Live verification (claims → code)

| Claim | Evidence |
|-------|----------|
| HEAD `8addfa9` | ✅ `git log -1` |
| RPC org-only, no membership | ✅ `074` L109–116 |
| SELECT visibility narrower | ✅ `project_baselines_select` membership mirror |
| No `meta.silentError` on create/delete | ✅ hooks L119–131, L139–170 |
| Global MutationCache double-toasts | ✅ `QueryProvider` L30–33 |
| `model` min/max only tasks | ✅ Gantt L682–703, deps without plan |
| Ghost `?? 0` | ✅ L1131–1132 |
| Trash `canManage` | ✅ L1004 |
| Delete RLS owner/admin only | ✅ 074 delete policy |
| `useOrgRole` → `data: OrgRole \| null` | ✅ `use-org-role.ts` L18–28 |
| `onError` `if (ctx?.previous)` empty-array bug | ✅ L165 |
| `is_milestone` selected unused | ✅ L105–109 Map drops it |
| 074 not in applied history (assumed) | STOP-1; list_migrations on gate |

---

## С чем согласен

### Fix 1 (A) — must ship before apply

DEFINER RPC сейчас: any org manager + known UUID → create baseline of project they may not SELECT.  
Replacement visibility block = SELECT predicate + separate role write check + p_name → `22023` — правильно; fails closed; single error text for invisible project (no existence oracle for non-members).

`auth.uid()` in plpgsql without `(select …)` — correct (initplan is RLS-only).

### Fix 1 (B) — silentError

Both mutations toast in `onError`; global cache also toasts → double. `meta: { silentError: true }` is the project pattern (`use-task-dependencies`).

### Fix 1 (E) — comments

Documents intentional deviations (no updated_at, narrow grants) — good for next reviewer.

### Fix 2 (C) — horizon

Root cause of false full-width ghost at col 1 when plan is outside axis — classic.  
Expand by **visible** task plans only — preserves filters.  
`ghostVisible` instead of `?? 0` — defense in depth.  
Extract `computeHorizon` + `tests/unit/gantt-horizon.test.ts` — correct (component logic untestable).

### Fix 3 (D) — role-gate Trash

`canManage` ≠ DELETE RLS. Hide trash for manager — stops fake optimistic delete UX.  
Create button stays `canManage` + RPC role — aligned after Fix 1A for members.

### Fix 3 (G)

- Drop unused `is_milestone` select  
- `previous !== undefined` for `[]` snapshot  
- success toast on create  
- CASCADE task_id left alone — correct non-scope  

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. STOP-3 vs текущий working tree

Сейчас `git status` **не пуст** (`_analysis/*` modified/untracked).  
Строго по STOP-3 CC должен остановиться.  

**Практика:** либо stash/commit analysis отдельно, либо в fix: «STOP только для dirty **src/supabase**» — иначе analysis-only noise блокирует.

### W2. Line number drift

`model` ~L682 (fix says ~L682 / L390 for planByTask) — `planByTask` wiring near baseline hooks (~earlier in file). CC must locate by symbol, not only line.

### W3. `useOrgRole` loading

`data === null` while loading → Trash hidden — safer than flash. Optional: don't show until settled.

### W4. After Fix 1, re-apply path

If someone already applied old 074 on a remote env — STOP-1 forces 075. Good. Local unapplied file edit is correct.

### W5. `computeHorizon` API

Specify:

```ts
computeHorizon(
  tasks: { start: string; end: string; id: string }[],
  planByTask: Map<string, { start: string; end: string }> | null,
): { min: string; max: string } | null
```

and that empty tasks → null (caller keeps undated branch). Minor.

### W6. Types

«`src/types/*` не править» — ok; hooks already stubbed.

---

## crm-architect / process

| | |
|--|--|
| Migration edit only pre-apply | ✅ |
| No apply from CC | ✅ explicit |
| DEFINER + visibility | ✅ Fix 1 |
| RLS org-first unchanged | ✅ |
| Tests in `tests/unit` | ✅ |
| 3 atomic commits | ✅ |

---

## Баллы

| Критерий | Макс | Факт |
|----------|------|------|
| Root-cause accuracy vs live | 30 | 30 |
| Fix correctness / ordering pre-apply | 25 | 24 |
| STOP / process safety | 15 | 13 (−2 dirty-tree STOP) |
| Scope discipline (F out) | 10 | 10 |
| Tests / pure extract | 10 | 10 |
| Executable clarity | 10 | 10 |
| **Итого** | **100** | **93** |

---

## Чеклист перед CC

- [x] ≥ 85, no B*  
- [ ] Clean **src/supabase** (or clarify STOP-3 for analysis-only)  
- [ ] Confirm 074 **not** applied  
- [ ] Fix 1 only → hand off apply  
- [ ] Then Fix 2 + unit tests  
- [ ] Then Fix 3  

---

## Итог

**93/100 — GO → Claude Code.**  

Три фикса — не «полировка», а закрытие реальных: IDOR-write RPC, double toast, ghost axis, role UX.  
Порядок pre-apply / post-apply выдержан.
