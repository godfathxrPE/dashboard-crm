# Ревью: Sprint 27 — Стадийные гейты (Blueprint)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, archive `027_stage_gates.sql`, baseline `20260712230000_baseline.sql`, active `040`–`046`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-27-stage-gates.md` — org-scoped `stage_requirements` + `check_stage_requirements` + enforcement-триггер + UI (чек-лист, Settings→Gates, toast на PipelineBoard)  
**Контекст:** Фаза multi-user S23–S26 applied; **S27 applied 2026-07-06**, гейт Cowork пройден (seed = 8 требований). Позже: S29.1 (chevron → `stage_id`), delivery completion gate 038 (тот же error-контракт). Живая цепочка до **046**. Аналогично `review-sprint-26` — handoff-артефакт, не runnable-промпт на `main`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** (SQL + UI + types + docs, гейт пройден) |
| Исторический дизайн (vs archive 027) | ✅ Почти 1:1; гейт-патч member-гарда и seed-имена стадий уточнены в applied |
| РАЗВЕДКА на `main` 2026-07-16 | 🟡 Команды полезны исторически; пути/символы частично устарели (PeekPanel, settings path) |
| Номер миграции `027` | ❌ Занят (archive + baseline + schema «applied»); next free ≥ **047** |
| `stage_requirements` + RLS | ✅ В baseline; initplan-обёртки; без `trg_set_org_id` |
| `check_stage_requirements` whitelist / no dynamic SQL | ✅ CASE whitelist; DEFINER + ACL authenticated/service_role |
| Member-гард 42501 | 🟡 В спринте «голый» `is_org_member`; **в prod** — `auth.uid() IS NOT NULL AND …` (урок learnings S27) |
| `trg_aa_enforce_stage_gate` / без EXCEPTION-глотания | ✅ BEFORE UPDATE на `stage_id`; `aa_` раньше sync; ACL service_role |
| UI: hooks + StageReadiness + GatesSection + toast | ❌ **Уже в коде** и расширено (banner, delivery gate twin) |
| `docs/schema.md` § S27 | ❌ Полный блок «027, applied»; Header **не** «027 pending» |
| Повторный `CREATE OR REPLACE` 027 | ❌ **Риск регрессии** (отрежет service-safe гард, дубли seed-логики, конфликт с baseline) |
| Контракт «CC пишет, не apply» | ✅ Процесс верный (исторически соблюдён) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности / номерам / state |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (post-S26, июль 2026): 9/10** — SQL ушёл в `archive/027_stage_gates.sql` (290 строк); гейт: P0001+DETAIL, позитивный переход, is_active-тогл, member-гард → 42501, seed 8; UI 1:1 с задачами 2–3 (с уточнёнными путями).

**Рекомендация: не запускать.** Source of truth — archive `027`, baseline, `docs/schema.md` § stage_requirements / check / trg_aa, живые хуки/UI. Новый work (activity-требования v2, file-label scoping, delivery-stage gates) — отдельный спринт поверх **047+**, не «перепрогон 027».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S23–S26 (021–026) | ✅ archive + baseline |
| **S27 027 stage gates** | ✅ **applied** 2026-07-06; `archive/027_stage_gates.sql`; baseline: table L1899+, fn `check_stage_requirements` / `aa_enforce_stage_gate`, trigger `trg_aa_enforce_stage_gate`, policies `stage_req_*` |
| 028–046 + baseline | ✅ active `040`–`046` + `20260712230000_baseline.sql` |
| Hooks | ✅ `use-stage-requirements.ts`, `use-stage-gate.ts`, `parseStageGateError` в `use-projects.ts` |
| Constants / types | ✅ `lib/constants/stage-gates.ts` (`GATE_FIELD_COLUMNS`), `database.ts` (`StageRequirement`, `UnmetRequirement`, `GateFieldColumn`) |
| UI | ✅ `GatesSection` в `SettingsContent`; `StageReadiness` в `ProjectDetail` (client deals); gate-banner на `PipelineBoard` («Переход заблокирован») |
| S29.1 chevron → stage_id | ✅ Гейт больше не обходится legacy `stage` на IIoT-деталке (schema «Known issue → закрыто») |
| 038 delivery completion gate | ✅ Твин-паттерн (`delivery_gate_failed` / `parseDeliveryGateError`) |
| **Повторный запуск sprint-27-…md** | ❌ **запрещён** |

Доказательства:

- `docs/schema.md` / crm-architect `schema.md`: «027 … применена 2026-07-06, гейт Cowork пройден: … seed = 8 требований».
- `ls supabase/migrations/archive/027_stage_gates.sql` + baseline policies/GRANT.
- `rg StageReadiness|GatesSection|useStageGate|parseStageGateError src/` → полный стек.
- architecture.md: ProjectDetail, deals routes; settings через `(dashboard)/settings`.
- learnings.md: member-гард service-safe (пойман на гейте 027); EXCEPTION-политика S27 ≠ S29; `aa_`/`zz_` order.

---

## С чем согласен полностью (как с историческим дизайном S27)

### 1. Продуктовый контракт

Конфиг в таблице, не hardcode; v1 = **field + file**, activities — v2. Совпадает с applied CHECK `requirement_type IN ('field','file')` и UI `GatesSection`.

### 2. Org-scoped RLS + явный `org_id` (без `trg_set_org_id`)

SELECT — члены org; write — owner/admin. Паттерн invitations. Совпадает с archive 027 L37–70 и learnings.

### 3. `SECURITY DEFINER` на check из-за own-only `project_files`

Baseline policy: `org_id = current_org_id() AND auth.uid() = user_id`. Без DEFINER менеджер не видит файлы админа → false negative. Верно.

### 4. Field-whitelist, zero dynamic SQL

CASE: budget, company_id, contact_id, next_step, deadline, probability, direction, next_action_date. UI-константа `GATE_FIELD_COLUMNS` синхронизирована. `grep format(|EXECUTE` в field-path — 0 (как в § ПРОВЕРКА).

### 5. Enforcement: `trg_aa_*`, P0001, без глотания

`NEW.stage_id IS DISTINCT FROM OLD.stage_id` → check → `RAISE 'stage_gate_failed' DETAIL=jsonb`. Префикс `aa_` до `trg_sync_*`. Симметрия learnings S27↔S29.

### 6. Единая RPC для UI и триггера

`useStageGate` → `supabase.rpc('check_stage_requirements', …)` — тот же контракт, что enforcement. `StageReadiness` = full list (useStageRequirements) + unmet (useStageGate).

### 7. UI-поверхность

- PipelineBoard: `moveToStageId` + `parseStageGateError` → banner «Переход заблокирован».
- Settings: `GatesSection` рядом с `TeamSection` / `AutomationsSection`.
- Optimistic rollback в хуке — сохранён; onError поверх.

### 8. Контракт миграции

«Пишешь, не apply» + schema pending→flip — соблюдён в 2026-07-06; сейчас schema уже «applied».

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже в проде — повторный прогон регрессирует

Запуск CC по этому файлу создаст/перезапишет `027_stage_gates.sql` в active tree (сейчас номер в archive; active max **046**), попытается `CREATE OR REPLACE` живых функций/триггера и «обновить schema header на 027 pending». Это:

- конфликт с baseline + history;
- риск отката service-safe member-гарда (см. B2);
- ложный commit message «Sprint 27: …» поверх main 2026-07-16.

**Действие:** не запускать. Любые доработки — новый спринт `047+` с delta-only scope.

### B2. Member-гард в спринте ≠ applied (service-context)

Спринт §1.2: «проект существует И `is_org_member(project.org_id)` — иначе 42501».

Archive/prod (и schema):

```sql
IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_project.org_id) THEN
  RAISE … ERRCODE = '42501';
END IF;
```

Learnings: без обёртки **любой** service/MCP UPDATE стадии падает 42501 (поймано на гейте S27). Повторный apply «как в спринте» сломает автоматизацию S29 / служебные апдейты.

### B3. Номер и путь миграции устарели

- Спринт: `supabase/migrations/027_stage_gates.sql`.
- Репо: `supabase/migrations/archive/027_stage_gates.sql`; active chain `040`–`046` + baseline.
- Next free: **047+** (после 046_gantt_dates).

### B4. Header schema «027 pending» — ложь

`docs/schema.md` L13–16: 027 applied, gate passed. Задача 4 («Header: 027 pending») при повторном запуске **разсинхронизирует** docs.

### B5. РАЗВЕДКА / точки встраивания — частично stale для CC

| Утверждение спринта | Факт на `main` |
|---------------------|----------------|
| PeekPanel / `src/app/projects/` | Peek — generic `shared/PeekPanel` в DataTable; readiness **не** там. Монтаж: `ProjectDetail.tsx` → `StageReadiness` (client `type==='client'`). Deals route: `src/app/(dashboard)/deals/[id]/` |
| `src/app/settings/page.tsx` + TeamSection | Фактически `src/app/(dashboard)/settings/page.tsx` → `SettingsContent` (`TeamSection` + `GatesSection` + `AutomationsSection`) |
| «UI может двигать legacy stage» | PipelineBoard / `moveToStageId` пишут **только `stage_id`** (`use-projects.ts` «единственная истина»). Legacy chevron fixed в S29.1 |
| Seed «КП отправлено» | Applied seed: **`Подготовка КП`** (+ Эксперимент, Договор) — не «КП отправлено» |

Без переписывания разведки CC вшил бы UI не туда или засеял бы 0 строк.

---

## Предупреждения (желательно учесть в любом follow-up)

### W1. Toast vs banner

Спринт: toast sonner со списком hints. Реализация: **inline gate-banner** на PipelineBoard (`setGateBlock`, auto-clear 10s) + sonner/Toaster есть глобально (`layout` + `QueryProvider` humanizeError). Не баг — UX-дельтa vs промпт.

### W2. File-проверка — count all files, не label

SQL: `count(*) FROM project_files WHERE project_id = … >= min_count`. `config.label` только для UX, **не** фильтр по типу файла. Спринт это не уточняет; v2-кандидат.

### W3. FK в DDL-черновике спринта

В промпте `pipeline_id`/`stage_id` без FK-строк («сверь тип»). Archive: полные FK ON DELETE CASCADE — правильно; черновик был неполным.

### W4. Comment drift в constants

`stage-gates.ts` ссылается на `supabase/migrations/027_stage_gates.sql` — файл уже в **archive/**. Косметика.

### W5. Scope «первая пользовательская фича после 001–026»

Исторически верно (июль 2026). Сейчас после S27: AI, automation, PCT, delivery, gantt, multi-phone… Контекст «фаза 1 = 001–026» для CC 2026-07-16 **вводит в заблуждение**.

### W6. Activities v2 — out of scope

Спринт явно «не делать». В коде нет activity-requirement_type — ок. Не добавлять в «допилить S27».

---

## Пропущенные места (если бы спринт ещё не был сделан — inventory done)

| Файл | Строки / факт | Статус vs спринт |
|------|---------------|------------------|
| `archive/027_stage_gates.sql` | 290 строк | ✅ Полный SQL |
| `src/lib/hooks/use-stage-requirements.ts` | CRUD + explicit org_id | ✅ Задача 2.2 |
| `src/lib/hooks/use-stage-gate.ts` | RPC check | ✅ Задача 2.3 |
| `src/lib/hooks/use-projects.ts` | `parseStageGateError` L20–30; `moveToStageId` | ✅ Задача 2.4 |
| `src/lib/constants/stage-gates.ts` | whitelist | ✅ Задача 3.3 константа |
| `src/types/database.ts` | StageRequirement / UnmetRequirement | ✅ Задача 2.1 |
| `src/components/settings/GatesSection.tsx` | Settings UI | ✅ Задача 3.3 |
| `src/components/projects/StageReadiness.tsx` | чек-лист | ✅ Задача 3.2 (не PeekPanel) |
| `src/components/projects/PipelineBoard.tsx` | onMoveError + banner ~L361–365, L732 | ✅ Задача 3.1 |
| `src/components/projects/ProjectDetail.tsx` | mount StageReadiness ~L642 | ✅ |
| `src/types/supabase.gen.ts` | stage_requirements + RPC | ✅ gen |

Пропусков «не сделали» нет — всё из задач 1–4 в репо.

---

## Предлагаемые правки в спринт

*Не править файл ради «запуска» — он архивный. Если оставлять в `_analysis/` как историю:*

1. В шапку: **`STATUS: APPLIED 2026-07-06`** · source of truth = `archive/027_stage_gates.sql` · **DO NOT RE-RUN**.
2. Заменить seed «КП отправлено» → «Подготовка КП» (как в archive).
3. Зафиксировать member-гард с `auth.uid() IS NOT NULL`.
4. UI-точки: `ProjectDetail` + `StageReadiness`, не PeekPanel; settings → `SettingsContent`.
5. Enforcement path: только `stage_id` (PipelineBoard / chevron post-S29.1).
6. Убрать § КОММИТ / § ПРОВЕРКА tsc-build как runnable — или пометить «historical».
7. Follow-up ideas (отдельный спринт 047+): file label filter; activity requirement_type; delivery-stage gates reuse; docs comment path archive.

---

## Чеклист перед CC

- [ ] **Не запускать** этот файл в Claude Code на `main`
- [ ] Source of truth: `supabase/migrations/archive/027_stage_gates.sql` + baseline + `docs/schema.md` § S27
- [ ] Не создавать `027_*.sql` в active migrations; next ≥ **047**
- [ ] Не `CREATE OR REPLACE check_stage_requirements` без service-safe гарда
- [ ] Не флипать schema header на «027 pending»
- [ ] Не коммитить «Sprint 27: …» повторно
- [ ] Любая доработка гейтов — новый sprint/handoff с РАЗВЕДКОЙ по **текущим** путям (`deals/`, `GatesSection`, `StageReadiness`, live `pg_trigger`)
- [ ] Регрессионный smoke (только при реальной дельте): gate fail P0001+DETAIL; pass; is_active=false; non-member RPC 42501; trigger order `trg_aa_*` before sync

---

## crm-architect checklist (condensed)

| Пункт | Как runnable сейчас | Как исторический дизайн |
|-------|---------------------|-------------------------|
| РАЗВЕДКА first | 🟡 есть, частично stale | ✅ |
| Real table/column names | ✅ | ✅ |
| Real file paths | ❌ PeekPanel / settings path | 🟡 post-rename deals |
| learnings.md gotchas | ❌ спринт без service-safe guard | ✅ applied/learnings |
| Migrations not applied from CC | ✅ process | ✅ |
| org_id / RLS | ✅ | ✅ |
| DEFINER + search_path + ACL | ✅ | ✅ |
| No flowType implicit | n/a | n/a |
| DELETE CASCADE | ✅ FK | ✅ |
| CSS tokens | ✅ Scandi | ✅ |
| schema.md after migration | ❌ already applied; «pending» wrong | ✅ was done |

---

## Итог одной строкой

**`sprint-27-stage-gates.md` — выполненный handoff (027 applied + полный UI), не runnable-промпт: оценка 2/10 на `main`, 9/10 как история; CC не запускать.**
