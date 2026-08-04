# Ревью: S-COMPANY-AI-1c — снятие `<cite>` до проверки формы

**Дата:** 2026-08-04  
**Ревьюер:** Grok (верификация по коду `feat/company-ai-1b` @ `0f0b359`; `shape.ts`, `processRun`, `company_brief` v2, `WEB_RUN`)  
**Объект:** `_analysis/sprint-S-COMPANY-AI-1c.md` — `stripCiteTags` + order before `checkResultShape`; prompt v3; перезамер cost  
**Контекст:** 1a web search path; 1b prompt «ФОРМАТ ЗНАЧЕНИЙ» снизил, но не убрал, `<cite index="…">` (soft `</` → retry / shape_warning). Миграций нет.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Root cause: Anthropic web-search cite tags | ✅ measured |
| Deterministic strip, not more prompt | ✅ |
| `stripCiteTags` pure in `shape.ts` + vitest | ✅ |
| Clean **before** both `checkResultShape` calls | ✅ critical order |
| Only `webSearch` presets | ✅ |
| Don’t touch SHAPE_MARKERS / callClaudeWithSearch | ✅ |
| promptVersion 2→3 + shorten ФОРМАТ | ✅ |
| WEB_RUN 40k→80k | ✅ (range ≈ 34–52 ₽, not 30–45) |
| Branch base 1b not yet on main | 🟡 ops |

**Оценка: 93/100 (GO).** Tight, correct fix; implementation seams are obvious in live code.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** CC на `feat/company-ai-1c` от `0f0b359` (или `main` after 1b merge). Deploy `ai-run` — gate/Олег.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| HEAD / 1b | `0f0b359` on `feat/company-ai-1b`; **not in main** (`main` @ `243d1c1`) |
| `SHAPE_MARKERS` | includes `</` — catches `</cite>` as soft |
| `processRun` | `first.input` → `checkResultShape` **without** strip (1155–1158, 1193) |
| `result = chosen.input` | 1224 — dirty cite tags persist if shape passes soft-only |
| `company_brief` | `promptVersion: 2`, long «ФОРМАТ ЗНАЧЕНИЙ» (537–541) |
| `WEB_RUN` | `{ inTok: 40_000, … }` — underestimates ~2× |
| `tests/unit/ai-shape.test.ts` | exists — extend with stripCiteTags |
| Migrations | none required |

---

## С чем согласен полностью

### 1. Prompt cannot guarantee zero cite markup

v2 reduced rate (4/5 → 1/3) but «КМ» still had tags on **both** attempts → soft claims → retry → still tags → `shape_warning` + raw tags in UI. Soft marker is working; the data path needs cleaning.

### 2. Strip before shape check

If strip after check: still retries. If strip after DB write: UI still dirty. Only pre-check + write cleaned `input` fixes both.

### 3. Cite-only stripper, not generic HTML

Preserves `>`, `<` in prose; orphan `</cite>` from max_tokens cuts; recursive immutable walk — matches `forEachString` style in same file.

### 4. Scope discipline

No SHAPE_MARKERS change, no WithSearch rewrite, no inventing cite→URL mapping, no prod data.

### 5. WEB_RUN remeasure

Live ~75–86k in — constant 40k is wrong. UI must use formula, not hardcoded ₽.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Mutate attempt objects so `chosen.input` is clean

Minimal correct pattern:

```ts
const firstAttempt = firstSearch ?? await callClaude(...);
const first = preset.webSearch
  ? { ...firstAttempt, input: stripCiteTags(firstAttempt.input) as Record<string, unknown> }
  : firstAttempt;
let claims = checkResultShape(schema, first.input);
// same for second → chosen always carries cleaned input
```

If you only strip for the check argument and leave `chosen = first` with original `input`, tags still hit `result = chosen.input`.

### W2. Cost range after 80k

With current `PRICE_PER_MTOK.sonnet` and `WEB_SEARCH_USD_PER_REQUEST`:

| | min (1 try) | max (+retry) |
|--|--|--|
| old 40k | ~22 ₽ | ~40 ₽ |
| **new 80k** | **~34 ₽** | **~52 ₽** |

Sprint «≈ 30–45 ₽» understates **max** (includes rare retry). Update expectation/comment to **~34–52 ₽** or similar; do not hardcode in JSX.

### W3. Regex / whitespace

Suggested approach: remove `/<\/?cite\b[^>]*>/gi` (open+close), then collapse horizontal runs `/[^\S\n]{2,}/g` → single space; **do not** collapse `\n`. Nested cite unlikely; if present, multiple passes or non-greedy full-tag replace ` /<cite\b[^>]*>[\s\S]*?<\/cite>/gi ` with inner text only — prefer open/close strip so inner text is preserved automatically.

### W4. Type of `input`

`ClaudeAttempt.input` is `Record<string, unknown>`; `stripCiteTags` generic is fine. Ensure return stays a plain object for shape + DB jsonb.

### W5. Tests placement

Add `describe('stripCiteTags')` in `tests/unit/ai-shape.test.ts` (or sibling file importing from same module). Existing shape tests must still pass (strip not applied in checkResultShape itself).

### W6. Branch base

1b not on `main`. Start from `0f0b359` as sprint says; rebase onto main after 1b merge.

### W7. Gate smoke

Deploy → «КМ» + 2 others: no `retried` for cite reasons, no `<cite` in result, duration 40–55s. If new markup form appears → capture in `retry_reason` before expanding stripper.

### W8. Client promptVersion

Edge `promptVersion: 3` only; client presets don’t store version — OK. No client change required beyond WEB_RUN.

---

## Пропущенные места (grep)

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `shape.ts` | SHAPE_MARKERS, forEachString, checkResultShape | +`stripCiteTags` export |
| `index.ts` processRun | 1152–1193 shape loop | strip when `webSearch` before both checks |
| `index.ts` company_brief | 508–511, 537–541 | v3 + one-line format |
| `ai-presets.ts` | WEB_RUN 177 | 80k in + comment remeasure |
| `tests/unit/ai-shape.test.ts` | shape fixtures | +strip cases |
| SHAPE_MARKERS / WithSearch body | | **no edit** |

---

## Предлагаемые правки в спринт (необяз.)

1. Cost expectation: **34–52 ₽** after 80k (or show formula).  
2. One-liner: assign cleaned input back onto attempt before `chosen`.

---

## Чеклист crm-architect

- [x] No migration  
- [x] Pure module + unit tests  
- [x] Don’t weaken SHAPE_MARKERS  
- [x] webSearch-only path  
- [x] No secrets  
- [x] Deploy not from CC  

---

## Чеклист перед CC

- [ ] Branch from `0f0b359` / post-1b main  
- [ ] `stripCiteTags` + tests  
- [ ] processRun: strip → check (×2), result clean  
- [ ] prompt v3 short format line  
- [ ] WEB_RUN 80k + comment  
- [ ] tsc / eslint ai-run+presets / vitest / build  
- [ ] Deploy note for gate  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Diagnosis / fix design | 40 | 39 |
| Integration order in processRun | 30 | 28 |
| Cost remeasure / prompt trim | 15 | 13 |
| Process / tests / scope | 15 | 13 |
| **Итого** | **100** | **93** |

**Итог: 93/100 GO** — можно в Claude Code.
