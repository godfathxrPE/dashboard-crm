# Ревью: S-COMPANY-AI-1 — маркировочный профиль ЧЗ (F2) + AI-бриф компании (F3)

**Дата:** 2026-08-03  
**Ревьюер:** Grok (верификация по коду `main` @ `243d1c1`; 085/103, `ai-run`, `ai-presets`, AiDealPanel/Modal, CompanyDetail, okved)  
**Объект:** `_analysis/sprint-S-COMPANY-AI-1.md` — F2 `chz-groups` + UI; F3 migration **104**, `company_brief` + web search  
**Контекст:** S-INN-1 + S-OKVED-1 merged; `okved` on companies; ai_runs entity `call|meeting|project`, no-transcript presets listed in 085.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Base `main` @ `243d1c1`, 103 present, **104 free** | ✅ |
| F2 pure dict + no AI + snapshot table | ✅ |
| F2 UI on CompanyDetail only (not peek) | ✅ |
| F3 CHECK extend + full rewrite RLS policies (085 style) | ✅ |
| No new columns → no stub/regen | ✅ correct |
| Separate `callClaudeWithSearch` (don't touch callClaude) | ✅ |
| chz-groups dual copy + deepEqual guard | ✅ |
| UI path: sprint says AiWorkspaceModal | 🟡 **wrong sample** — project uses AiDealPanel/Modal |
| useStartRun company like project (no transcript) | 🟡 must extend |
| processRun branch to WithSearch | 🟡 implement explicitly |
| Anthropic web_search API details | 🟡 verify headers/version |

**Оценка: 88/100 (GO).** Strong product coupling F2→F3; migration/edge design solid. UI wiring must copy **AiDeal\***, not transcript workspace.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** CC на `feat/company-ai` от `main` @ `243d1c1`. Apply 104 + deploy `ai-run` — **gate only**.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| 103 `company_okved` | in main |
| 104 | **free** |
| `src/lib/data/okved.ts` | exists; pattern for chz-groups |
| `ai_runs` entity CHECK | call\|meeting\|project (085) |
| transcript_required | deal_progression, analytic_note, meeting_prep, deal_summary |
| `callClaude` | forced `tool_choice: tool` — no web search |
| Project AI UI | `AiDealModal` + `AiDealPanel` on ProjectDetail |
| Call/meeting AI | `AiWorkspaceModal` + transcript |
| CompanyDetail | legal block + okved; **no AI** |
| Review | не было (этот документ) |

---

## С чем согласен полностью

### 1. F2 deterministic before F3 generative

CHZ profile is product signal without tokens; feeds brief prompt for directed search. Correct layering.

### 2. Snapshot-only CHZ table

Fixed date + sources; no model inventing dates. Dedup groups in `matchChzGroups`. Prefix match on start of code.

### 3. Migration 104 = 085 playbook

- Extend entity_type CHECK with `company`  
- Extend transcript_required with `company_brief` (widen only)  
- drop+create `ai_runs_insert` / `ai_runs_select` with **full** old branches + company EXISTS  
- `ux_ai_runs_active_entity` already covers idempotency  

No stub/regen: constraints aren't in gen types.

### 4. Edge: leave `callClaude` byte-stable

New path for `webSearch: true` only. Dual chz-groups file + sync test = same class as INN_RE dual.

### 5. Website suggest-only

Never silent write — matches INN/name/industry empty-only rules.

### 6. Security render

Text + links with `rel=noopener`; no HTML from model — same as other ai_runs renderers.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. UI sample is wrong: use **AiDealPanel**, not AiWorkspaceModal

| Entity | UI |
|--------|-----|
| call/meeting | `AiWorkspaceModal` + transcript path |
| project | **`AiDealModal` → `AiDealPanel`** (entity-only, `useStartRun('project', id)`) |
| company | **mirror AiDeal\*** |

Sprint §5 naming will send CC to transcript modal. Correct deliverable: e.g. `AiCompanyPanel` / button on CompanyDetail opening panel/modal with `presetsForEntity('company')` + `useEntityRuns('company', id)` + history list + `AiResultRenderer`.

### W2. `useStartRun` hard-codes project

```ts
if (entityType === 'project') {
  throw new Error('К сделке нельзя привязать транскрипт…');
}
```

Add `company` (same no-transcript path). Transcripts CHECK/policies only call|meeting anyway.

### W3. `processRun` must branch

Today always `callClaude`. After preset:

```ts
const attempt = preset.webSearch
  ? await callClaudeWithSearch(...)
  : await callClaude(...);
// shape retry same, but retry must also use WithSearch for company_brief
```

Shape retry on forced tool path vs auto tool_choice: second attempt should still be WithSearch + SHAPE_RETRY_HINT.

### W4. Anthropic web search API

Sprint: `tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }, preset.tool]`, `tool_choice: auto`.  
CC must confirm against current Anthropic Messages docs (beta header / tool type string / usage fields). Wrong type → 400 at gate smoke. Document chosen API version in edge comment.

### W5. RLS company branch org conjunct

085 project branch: `exists (… projects p where p.id = entity_id)` (visibility via table RLS).  
Sprint adds `c.org_id = ai_runs.org_id` — **good** defense-in-depth; keep it. Don't drop org-first on policy outer `org_id = current_org_id()`.

### W6. Types / renderer / serialize

- `CompanyBriefResult` interface + union `AiRunResult` in `database.ts`  
- `AiResultRenderer` case `company_brief`  
- `serializeRun` if copy button used (AiDealPanel has copy)  
- Edge `EntityType` += `'company'`; Preset `webSearch?: boolean`

### W7. `matchChzGroups` details

- Normalize: trim; optional strip spaces  
- Match: `code.startsWith(prefix)` or prefix.startsWith? **code starts with prefix** (`10.51.1` matches `10.51`)  
- Return unique groups (same group, multi-prefix)  
- Order: stable table order or status priority (mandatory first) — define for UI  
- Tests as listed including `10.86` once, `62.01` → []

### W8. F2 colors

`mandatory` green/neutral, `starting` yellow (hot lead), `experiment` mute — **CSS vars only** (`bg-yellow-l`, `text-text-mute`, etc.).

### W9. F3 website URL safety

`brief.website` before link/button: only `https:` (or http) absolute; reject `javascript:` etc. Show text if invalid.

### W10. Cost / latency

Web search + sonnet can approach isolate timeout; `max_uses: 5` ok. No mass jobs. Idempotent active run index prevents double-click storms.

### W11. loadEntityBlock company fields

Explicit select includes `okved` — companies without okved still run brief with empty CHZ profile (valid). Don't require okved for F3.

### W12. Dual file sync test path

`tests/unit/chz-groups.test.ts` imports  
`@/lib/data/chz-groups` and  
`../../supabase/functions/ai-run/chz-groups`  
like company-lookup normalize tests.

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| `085_ai_runs_nullable_transcript.sql` | CHECK + policies template | 104 full rewrite |
| `ai-run/index.ts` PRESETS, callClaude, loadEntityBlock, processRun | no company/webSearch | 4.x |
| `ai-presets.ts` | AiEntityType, PresetKey | +company / company_brief |
| `use-ai-run.ts` | project no-transcript guard | +company |
| `AiDealPanel.tsx` / Modal | project entity AI | **template for company** |
| `AiResultRenderer.tsx` | switch presets | +company_brief |
| `CompanyDetail.tsx` | legal + okved | F2 block + AI entry |
| `src/lib/data/okved.ts` | pure data module | pattern for chz-groups |
| `database.ts` AiRunResult | hand result types | CompanyBriefResult |

---

## Предлагаемые правки в спринт (необяз.)

1. §5: replace AiWorkspaceModal with **AiDealPanel/Modal** as the project analogue.  
2. Explicit: `useStartRun` company branch; `processRun` uses WithSearch for webSearch presets (including retry).  
3. Note Anthropic API verification at implement time.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА / 104 free  
- [x] Migration not applied from CC  
- [x] RLS org-first; drop+create full policy text  
- [x] Edge DEFINER not needed (service path via edge + user JWT RLS)  
- [x] Dual pure modules + sync test  
- [x] No silent website write  
- [x] CSS variables for F2 badges  
- [x] Secrets not read  
- [x] callClaude unchanged  

---

## Чеклист перед CC

- [ ] Branch `feat/company-ai` from `243d1c1`  
- [ ] `chz-groups.ts` (src + edge) + tests + sync guard  
- [ ] CompanyDetail F2 block  
- [ ] `104_ai_runs_company.sql`  
- [ ] PRESET company_brief + loadEntityBlock + callClaudeWithSearch + processRun branch  
- [ ] Client presets + useStartRun + panel/modal + renderer + website suggest  
- [ ] tsc / path eslint / vitest chz-groups  
- [ ] grep: web_search only on new path; callClaude untouched  
- [ ] build last; no apply/deploy  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| F2 dictionary + UI | 25 | 24 |
| F3 migration / RLS | 25 | 24 |
| Edge web search design | 25 | 21 |
| Client wiring accuracy | 25 | 19 |
| **Итого** | **100** | **88** |

**Итог: 88/100 GO** — можно в Claude Code; UI path = AiDeal-style, not workspace.
