---
name: review-sprint
description: >
  Review Claude Code sprint/handoff prompts for dashboard-crm before execution.
  Verifies paths, schema, RLS patterns, and scope against the live codebase and
  crm-architect references. Writes `_analysis/review-<basename>.md`.
  Triggers: "ревью спринта", "review sprint", "/review-sprint", "проверь спринт",
  "проверь handoff", new file in `_analysis/sprint-*.md` or `_analysis/handoff-*.md`,
  "есть новый спринт", "sprint review", "можно в CC?". Use proactively when a
  sprint or handoff markdown appears without a matching review file.
---

# Review Sprint (dashboard-crm)

Pre-flight review of sprint prompts and handoffs **before** Claude Code runs them.
Read-only on source code — deliverable is a single markdown review file.

## When to run

| Trigger | Action |
|---------|--------|
| User asks to review a sprint/handoff | Review the named file |
| User says "проверь новые спринты" | Scan `_analysis/` for unreviewed or stale files |
| Watcher script invokes this skill | Review the path passed in the prompt |

## Input files

| Pattern | Example |
|---------|---------|
| Sprint | `_analysis/sprint-delivery-p2b.md` |
| Handoff | `_analysis/handoff-gantt-view2-drag.md` |
| Architecture delta (optional) | `_analysis/architecture-*.md` cited in sprint |

## Output file

```
_analysis/review-<basename>.md
```

Where `<basename>` is the sprint/handoff filename without directory, e.g.:
- `sprint-rename-deals.md` → `review-sprint-rename-deals.md`
- `handoff-gantt-v0.md` → `review-handoff-gantt-v0.md`

**Never** overwrite without reading the sprint first. If a review exists and the sprint
was not modified after it, skip (unless user asks for re-review).

## Mandatory reads before reviewing

1. The sprint/handoff file (full)
2. `~/.claude/skills/crm-architect/references/schema.md` — table/column names
3. `~/.claude/skills/crm-architect/references/architecture.md` — file paths
4. `~/.claude/skills/crm-architect/references/learnings.md` — known gotchas
5. Any architecture doc referenced in the sprint header

## Verification workflow

1. **РАЗВЕДКА** — run the sprint's diagnostic commands (grep, find). Compare output
   to what the sprint claims. Flag stale line numbers and wrong paths.
2. **Schema truth** — every table/column/RPC in SQL tasks must exist in schema.md or
   be explicitly introduced in a named migration file in the sprint.
3. **File inventory** — grep for symbols, strings, and paths mentioned in tasks.
   List missed files and false positives.
4. **Scope boundaries** — confirm "ЖЁСТКО НЕ ТРОГАТЬ" / out-of-scope sections are
   correct and complete.
5. **crm-architect checklist** — see below; each failed item is a blocker or warning.
6. **Verdict** — numeric score (0–100) + can Claude Code run as-is, or only after listed fixes?

## Scoring (обязательно)

Every review **must** include a **бальная оценка 0–100** in the verdict section.

| Балл | Значение |
|------|----------|
| **≥ 85** | **GO** — можно передавать в Claude Code (warnings W* допустимы) |
| **70–84** | **NO-GO** — правки обязательны, потом re-review |
| **&lt; 70** | **REJECT** — существенная переработка / не executable prompt |

Rules:
- **Any open blocker (B\*) caps the score at 84** (cannot be GO until blockers fixed).
- Architecture briefs / non-sprint docs that are not CC-executable: score honestly; typically **&lt; 85** until a real `sprint-*.md` exists.
- Prefer stating both: `**Оценка: 91/100 (GO).**` and short rationale.
- Legacy `X/10` alone is **not enough** — always use **/100** as the pass gate.

## crm-architect checklist (condensed)

Blockers if violated:

- [ ] Starts with РАЗВЕДКА (diagnostic commands before edits)
- [ ] Real table/column names from schema.md (no guesses)
- [ ] Real file paths from architecture.md
- [ ] learnings.md gotchas checked
- [ ] SQL migrations as separate files; **not** applied from CC
- [ ] `org_id` / RLS: org boundary first; role via `current_org_role()`
- [ ] New functions: `SECURITY DEFINER SET search_path = public, pg_temp` + ACL
- [ ] No `flowType: 'implicit'` on Supabase client
- [ ] DELETE relies on CASCADE, not client cleanup
- [ ] CSS: variables only, scoped to theme class
- [ ] schema.md updated after new migration (if sprint adds migration)

## Review document format

Write in Russian. Use this structure (match existing reviews in `_analysis/review-*.md`):

```markdown
# Ревью: <short title>

**Дата:** YYYY-MM-DD
**Ревьюер:** Grok (верификация по коду `<branch>`, …)
**Объект:** `_analysis/<file>.md` — <one-line summary>
**Контекст:** <prior sprints, migrations, related docs>

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| … | ✅ / 🟡 / ❌ |

**Оценка: NN/100 (GO | NO-GO | REJECT).** <one-line summary>
- Порог передачи в Claude Code: **≥ 85**. Ниже 85 — не отдавать в CC.
- Любой открытый B* → максимум 84 (NO-GO).

**Рекомендация:** запускать в CC / только после правок / не запускать

---

## Статус (if handoff / phased work)

| Заход | Статус в репо |
|-------|---------------|

---

## С чем согласен полностью

### 1. …

---

## Блокеры (критично — исправить до запуска)

### B1. …

---

## Предупреждения (желательно исправить)

### W1. …

---

## Пропущенные места (если grep нашёл gaps)

| Файл | Строки | Действие |
|------|--------|----------|

---

## Предлагаемые правки в спринт

1. …

---

## Чеклист перед CC

- [ ] …
```

Severity mapping:

| Symbol | Meaning |
|--------|---------|
| ❌ / B* | Blocker — do not run in CC until fixed (score ≤ 84) |
| 🟡 / W* | Warning — GO possible if score ≥ 85 |
| ✅ | Confirmed correct |

| Score | CC gate |
|-------|---------|
| **≥ 85** | GO → Claude Code |
| **70–84** | NO-GO → fix + re-review |
| **&lt; 70** | REJECT |

## Headless CLI mode (watcher script)

When invoked via `watch-sprints.sh`, Grok runs in single-turn stdout mode and **cannot**
write files with tools. In that case:

- Print the **complete** review markdown to **stdout only**
- First line: `# Ревью: <title>`
- No preamble or postscript outside the document

The watcher script saves stdout to `_analysis/review-<basename>.md`.

## Rules

- **Read-only** on `src/`, `supabase/`, etc. Only write the review markdown file
  (or print to stdout in headless CLI mode).
- **Evidence-based** — cite real paths and line numbers from grep/read.
- **No invented issues** — if the sprint is solid, say so clearly.
- **Proportional depth** — small handoff = shorter review; multi-migration sprint = deep.
- **Branch** — note current git branch in the header (`git branch --show-current`).
- Do not commit. Do not edit the sprint file unless the user explicitly asks.

## Batch mode ("проверь новые спринты")

```bash
# From repo root — list candidates
for f in _analysis/sprint-*.md _analysis/handoff-*.md; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  review="_analysis/review-${base}"
  if [ ! -f "$review" ] || [ "$f" -nt "$review" ]; then
    echo "$f"
  fi
done
```

Process one file per invocation unless the user asks for all in one session.