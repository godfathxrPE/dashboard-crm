# Ревью: S-OKVED-1 — отрасль компании из ОКВЭД (без AI)

**Дата:** 2026-08-03  
**Ревьюер:** Grok (верификация по коду `feat/inn-lookup` @ `ff4ddd1` = S-INN-1; `main` ещё без INN merge; live company-lookup / CompanyModal / CompanyDetail / 102)  
**Объект:** `_analysis/sprint-S-OKVED-1.md` — `companies.okved` (**103**), справочник `okvedToIndustry`, normalize + form/detail  
**Контекст:** S-INN-1 (102 + edge `company-lookup` → DaData). 261 companies / 225 with INN / industry sparse — claim from gate (not re-counted here).

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Product: okved (реестр) ≠ industry (человек) | ✅ |
| Zero new provider / reuse DaData party | ✅ |
| Миграция 103 free (после 102) | ✅ |
| Справочник class override + section ranges | ✅ solid |
| normalize.ts pure + tests pattern | ✅ |
| industry only if empty (как name) | ✅ |
| Не писать код в industry / no backfill | ✅ |
| CompanyDetail «Обновить» → write okved | 🟡 must wire |
| Base branch: main after S-INN-1 merge | 🟡 ops |
| phones/emails on Suggest tariff often empty | 🟡 documented |

**Оценка: 90/100 (GO).** Executable, tight scope, correct invariants; follow S-INN-1 seams.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** CC на `feat/okved-industry` **от `main` после merge S-INN-1** (сейчас S-INN-1 на `feat/inn-lookup`, не ancestor of `main`). Миграцию 103 и edge **не apply/deploy**.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| 102 `company_legal_fields` | файл есть; types gen has kpp/ogrn/legal_* |
| 103 | **free** |
| `company-lookup/normalize.ts` | legal fields only; **no okved/phones/emails** |
| `use-company-lookup.ts` | mirrors normalize |
| `CompanyModal.handleLookup` | put legal; name if empty; **no industry** |
| `CompanyDetail.handleRefreshLegal` | legal fields only; industry in header if set |
| industry consumers | table, peek, export, modal, detail header |
| `src/lib/data/` | **нет** — создать |
| Review | не было (этот документ) |

---

## С чем согласен полностью

### 1. Две колонки: `okved` vs `industry`

Код реестра не должен ехать в UI-отрасль (таблица, palette sub, CSV). Lookup fills `okved` always; `industry` only when empty — manager override wins.

### 2. Локальный справочник, не «название из DaData»

DaData `data.okved` = code; name from local map → no dual dictionary in DB. No index on okved until analytics — correct for 261 rows.

### 3. CLASS_OVERRIDES for marking-relevant production

Food/beverages/tobacco/textile/chem/pharma/electronics/trade/IT — fit First Bit / ЧЗ profile without 100+ subclass rows.

### 4. Pure `okvedToIndustry` + vitest

Same isolation as `normalize.ts`. Garbage → null, no throw.

### 5. Extend normalize, not rewrite form

handleLookup block-extend; okved hidden in form; show on detail requisites. No mass enrich 224 rows.

### 6. Stub types, no gen by hand; gate apply/deploy

Matches S-INN-1 / project rules.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `CompanyDetail.handleRefreshLegal` must write `okved`

Спринт: «кнопка уже есть, отдельной логики не требует» — **неточно**. Refresh — явный whitelist полей:

```ts
updateCompany.mutateAsync({
  legal_name, kpp, ogrn, legal_address, inn_status, inn_verified_at,
  // + okved: r.okved
  // + industry if empty on company.industry
})
```

Без этого карточка «Обновить из ЕГРЮЛ» **никогда не сохранит ОКВЭД**.  
Recommendation: same rules as form — `okved` always; `industry` only if `!company.industry?.trim()`.

### W2. Branch base

Sprint: from `main` after S-INN-1. Workspace: S-INN-1 on `feat/inn-lookup` @ `ff4ddd1`, **not in main**.  
CC: wait for merge, or branch from `feat/inn-lookup` and rebase later.

### W3. `okvedToIndustry` implementation detail

- Parse: `trim().match(/^(\d{1,2})/)` → `Number`  
- Override key: `String(n).padStart(2, '0')` so `01` works with sections  
- Classes 34, 40 gaps → null OK  
- Tests: `10.13.2`, `64.19`, `62.01`, `34`, empty, `01` — as specified

### W4. Phones/emails from DaData

Suggest tariff often empty — OK. When non-empty: form only if phones array empty / email empty.  
PhoneEntry: `{ type: 'work', value, is_primary }` — first primary true; `normalizePhones` on submit still runs.

### W5. Type guard `isLookupResult`

Сейчас только `found: boolean`. Новые поля можно не требовать в guard (optional presence); after deploy old edge without okved would still type-narrow — client treats missing as undefined → setValue careful with `r.okved ?? null`.

### W6. Form schema + defaultValues

`okved` in Zod + create/edit defaults + onSubmit spread — otherwise setValue orphan. **No** visible field (Task 4).

### W7. `use-companies` / domain types

If domain `Company` lists fields by hand, add `okved`. Prefer Tables row after stub.

### W8. Detail display

legalFields: `{ label: 'ОКВЭД', value: code + (industryLabel ? ` — ${industryLabel}` : '') }` only if code.  
Do not put raw code into `company.industry` column.

### W9. Edge deploy coupling

normalize change needs **redeploy company-lookup** on gate. Without deploy, form sets okved null always. Report NOT_VERIFIED until gate.

### W10. ExcelImport lint debt

Path-scoped eslint — correct; don't "fix" any in ExcelImport.

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| `102_company_legal_fields.sql` | legal cols pattern | mirror comments for 103 |
| `normalize.ts` / tests | no okved | Task 3 |
| `use-company-lookup.ts` | mirror interface | +3 fields |
| `CompanyModal.handleLookup` | name-if-empty pattern | industry/okved/email/phones |
| `CompanyDetail` legalFields + refresh | no okved | display + W1 write |
| `validators/company.ts` | industry exists | +okved |
| `CompaniesTable` industry | human text | no change (don't write codes) |
| `src/lib/data/okved.ts` | missing | create + tests |

No other industry writers that force OKVED codes.

---

## Предлагаемые правки в спринт (необяз.)

1. Task 5: explicit `handleRefreshLegal` payload includes `okved` (+ industry if empty).  
2. Note: base branch after S-INN-1 on main.  
3. padStart(2) for class key in okved.ts.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА / migration number 103  
- [x] Migration file only, not apply  
- [x] No RLS change on existing table  
- [x] Stub types, not hand gen  
- [x] Edge pure normalize + unit tests  
- [x] No secrets in client  
- [x] Don't write code into industry  

---

## Чеклист перед CC

- [ ] Base: main with 102 + company-lookup, or inn-lookup  
- [ ] Branch `feat/okved-industry`  
- [ ] `103_company_okved.sql` + stub  
- [ ] `okved.ts` + unit tests  
- [ ] normalize + client mirror + form lookup  
- [ ] Detail row + refresh writes okved  
- [ ] tsc / path eslint / vitest okved+normalize  
- [ ] build last; no apply/deploy  
- [ ] Report: existing industry oddities list (read-only if MCP)  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Product / data model | 25 | 25 |
| Dictionary + normalize design | 30 | 28 |
| Client wiring (modal/detail) | 25 | 21 |
| Process / gates / branch | 20 | 16 |
| **Итого** | **100** | **90** |

**Итог: 90/100 GO** — можно в Claude Code (после/на базе S-INN-1).
