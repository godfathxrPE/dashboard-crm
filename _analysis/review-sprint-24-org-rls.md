# Ревью: Sprint 24 — Org-scoped RLS (`current_org_role`)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, archive `023_org_rls.sql`, baseline `20260712230000`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-24-org-rls.md` — перевод RLS 1:1 на org-модель + helpers + hook `useOrgRole`  
**Контекст:** Фаза multi-user S23–S26 **уже в проде** (с 2026-07-05); живая цепочка до **046**; S24 applied как archive `023`; S25 (024) ужесточил visibility/logs/convert_lead и **удалил** `user_role()`/`profiles.role`; S26+ — invites, notifications, gates, AI hub, delivery, gantt

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** |
| Исторический дизайн (vs archive 023) | ✅ Почти 1:1 с applied SQL |
| РАЗВЕДКА на `main` 2026-07-16 | ❌ Утверждения про «нет memberships в коде» / last mig ~022 **ложны** |
| Номер миграции `023` | ❌ Занят (archive + baseline); next free ≥ **047** |
| Helpers `current_org_role` / `shares_org_with` + ACL | ✅ Верно (и уже в baseline) |
| Initplan `( SELECT ... )` | ✅ В бизнес-политиках; 🟡 `shares_org_with(id)` без обёртки (как в applied) |
| Scope «не apply из CC» | ✅ Процесс верный |
| Задача 2 `use-org-role.ts` | ❌ Файл **уже есть** и UI **уже** на `useOrgRole()` (S25+) |
| `docs/schema.md` § RLS | ❌ Уже переписан; pending-S23/S24 сняты |
| Повторный DROP+CREATE политик | ❌ **Откатит** S25/S26+ (leads team-vis, memberships write, …) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности/номерам/state |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (июль 2026, post-S23): 9/10** — SQL почти байт-в-байт ушёл в `archive/023_org_rls.sql` и сработал; пробел NOT NULL↔service-логи зафиксирован в learnings как инцидент S24 → фикс 024.  

**Рекомендация: не запускать.** Source of truth — archive `023`, baseline, `docs/schema.md` § RLS-модель. Новый RLS-work — отдельный спринт поверх **047+**, не «перепрогон 023».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S23 schema (021/022) | ✅ archive + baseline |
| **S24 org-scoped RLS (023)** | ✅ **applied**; `supabase/migrations/archive/023_org_rls.sql` (417 строк); `grep -c current_org_id` = **49** |
| S25 team visibility + drop `user_role` (024) | ✅ archive; leads/activity_log расширены; log_delete COALESCE; `user_role`/`profiles.role` DROP |
| S26 notifications + invitations (025/026) | ✅ write-политики memberships |
| 027–046 + baseline | ✅ active `040–046` + `20260712230000_baseline.sql` |
| `useOrgRole` / `OrgRole` | ✅ `src/lib/hooks/use-org-role.ts` + UI (Settings, boards, ProjectDetail, …) |
| **Повторный запуск sprint-24-org-rls.md** | ❌ **запрещён** |

Доказательства:

- `docs/schema.md` L9 / L94: «S24 org-scoped RLS (023)», «_applied_».
- Baseline: `current_org_role`, `shares_org_with`, `projects_delete` с `org_id + owner`, `cc_select` org-only.
- `src/types/database.ts`: `OrgRole = 'owner'|'admin'|'manager'|'viewer'`.
- Активные миграции: `040…046` + baseline; **023 только в archive**.

---

## С чем согласен полностью (как с историческим дизайном S24)

### 1. Цель «1:1 семантика + org-граница», расширение — S25

Правильный разрез: не менять ownership-модель для текущего single-org UX, только добавить `org_id = current_org_id()` и переложить роли на memberships. На проде так и сделано; командная видимость leads/activity_log — 024.

### 2. Маппинг ролей

`admin→owner`, `pm→admin`, `member→manager`, `viewer→viewer` — совпадает с 022 backfill, archive 023 и `docs/schema.md` § маппинг.

### 3. Helpers + hardening-конвенция

`current_org_role()` / `shares_org_with(uuid)`: `SECURITY DEFINER STABLE`, `SET search_path = public, pg_temp`, REVOKE PUBLIC/anon, GRANT authenticated+service_role — **точно** как в archive 023 и learnings.

### 4. Initplan-шаблон политик

`org_id = ( SELECT public.current_org_id() )` + `( SELECT public.current_org_role() )` + `( SELECT auth.uid() )` — эталон; archive 023 и baseline совпадают с примером `projects_*` из промпта.

### 5. Инвентарь и исключения scope

- `activities` — только SELECT+INSERT (не добавлять U/D) ✅  
- `meeting_attendees` — join к meetings, без своей `org_id` ✅  
- `user_settings` / `dashboard_sync` / pipelines — вне S24 ✅ (`dashboard_sync` personal — подтверждено S25 в schema)  
- memberships write — S26 ✅  
- `profiles_update_own` не трогать ✅  

### 6. contact_company: закрытие `USING true`

Замена на org-границу — реальная дыра pre-S24; applied `cc_select` = только `org_id = current_org_id()`.

### 7. Процесс: миграция в репо, apply через Cowork/MCP, security-review

Совпадает с project process; `без BEGIN/COMMIT` — верно для `apply_migration`.

### 8. Деприкация, не DROP `user_role()` в S24

Правильно отложено на S25 (024 реально сделал DROP после UI-переезда).

---

## Блокеры (критично — не запускать)

### B1. Спринт уже применён — повтор = regression + collision

| Ожидание промпта | Реальность `main` 2026-07-16 |
|------------------|------------------------------|
| Писать `023_org_rls.sql` | Файл в **archive**, policies в baseline |
| Last migration ~022 | Active: **046** + baseline; archive 001–039 |
| `use-org-role` создать, UI не трогать | Файл есть; UI **уже** на `useOrgRole` (SettingsContent, TeamSection, KanbanBoard, PipelineBoard, ProjectBoard, ProjectDetail, Automations, Gates) |
| memberships/organizations «не должно быть в src» | `use-team-members.ts`, invitations, stage_requirements, automation — читают/пишут |
| `user_role` COMMENT / deprecate | Функция **удалена** в 024 (`DROP FUNCTION IF EXISTS public.user_role()`) |
| `docs/schema.md` pending 023 | § RLS-модель: «С S24 (023, _applied_)» + S25/S26/… |

Повтор `CREATE OR REPLACE` helpers — no-op/harmless, но **DROP POLICY + CREATE** по семантике S24 **сотрёт** пост-S24 изменения (см. B2).

### B2. Повтор политик откатит S25+ (высокий blast radius)

Промпт явно пересоздаёт, среди прочего:

- `leads_*_own` — own-only + org  
- `"Users see own logs"` — own-only + org  
- memberships: «write НЕ добавлять»

После 024 leads/activity_log SELECT — **командные** (owner/admin org-wide). После 026 — write-политики memberships + invitations/notifications.  

Повтор 023-логики без учёта 024–046 = **сужение visibility / потеря write memberships** → production break. Это не «идемпотентный re-apply», а **downgrade RLS**.

### B3. Номер `023` и путь миграции

Новые DDL → **047+** (или timestamp), не `023_org_rls.sql` в active tree. `git add supabase/migrations/023_org_rls.sql` конфликтует с archive-моделью (001–039 не реплеятся; точка сборки — baseline).

### B4. РАЗВЕДКА №1–4 даёт ложный «зелёный» контекст для CC

```bash
ls supabase/migrations/ | tail -3
# → 045, 046, baseline — НЕ «после 022»
```

`grep memberships|organizations` → **есть** в hooks (не «только types»).  
`grep user_role` → в UI по сути нет legacy `profiles.role`; роль — memberships / `useOrgRole`.  
CC, следующий «если разведка ок — пиши 023», получит **ложный** go-ahead.

### B5. `COMMENT ON FUNCTION public.user_role()` упадёт

В 024 функция удалена. Хвост задачи 1.6 на живой БД → error (если не `IF EXISTS` — в SQL COMMENT нет IF EXISTS на function в том виде).

---

## Предупреждения (исторический дизайн / hygiene)

### W1. NOT NULL на service-таблицах без правки log_* — инцидент S24

Промпт §1.5: `ALTER … org_id SET NOT NULL` на activities/activity_log/…  
**Не** правит `log_delete_*` / `log_stage_change` на `COALESCE(OLD.org_id, current_org_id())`.

Learnings + `docs/schema.md`: под service-контекстом `current_org_id()=NULL` → INSERT activity_log без org_id валится на NOT NULL; под `EXCEPTION WHEN OTHERS` лог **молча теряется**. Фикс — **024**, не 023.  

Если бы промпт правили «с нуля» до apply — это был бы **warning→blocker** в том же спринте. На applied path — known debt, закрыт.

### W2. `shares_org_with(id)` без `( SELECT … )`

Learnings: параметризованный helper — **per-row**, не initplan. Applied 023 / baseline: `OR public.shares_org_with(id)` — как в промпте. Не security-дыра (DEFINER), но perf-замечание; advisors иногда WARN. Ок как accepted.

### W3. `convert_lead`: только REVOKE anon + search_path

Ownership-гард и фикс `user_id`→`owner_id`/`created_by` — **S25 (024)**. Сигнатура 11 args в промпте совпадает с baseline (positional types). Исторически ок для S24 scope; IDOR через DEFINER — осознанный follow-up.

### W4. Комментарий в `use-org-role.ts` устарел

Файл всё ещё говорит «S24: к UI НЕ подключён» — **ложь** на `main`. Не баг спринта-промпта, а stale comment post-S25 (отдельный micro-fix, не через этот sprint).

### W5. Инвентарь pg_policies «2026-07-05»

Корректен как snapshot pre-023. Сегодня **не** source of truth: 30+ таблиц, project_columns, transcripts, automations, notifications, … Политики эволюционировали. Для нового RLS-спринта — MCP `pg_policies` / baseline, не таблица из S24.

### W6. Commit path в промпте

`git add … 023 … use-org-role … docs/schema.md` — все три артефакта **уже** в истории; повторный commit «Sprint 24…» запутает git-семантику.

---

## Пропущенные места (разведка `main` — не для «дописать в 023»)

Промпт scoped на tenant-таблицы эпохи 001–022. **Сейчас** org-RLS уже на сущностях, которых **не было** в S24 — **не** «добавить через этот спринт»:

| Область | Откуда | Примечание |
|---------|--------|------------|
| `project_columns` | 032–034 | org + owner/admin write |
| `transcripts` / `ai_runs` | 030 | RLS «по сущности» + org |
| `automation_rules` / `runs` | 029 | org + role |
| `stage_requirements` | 027 | org + role |
| `notifications` / `invitations` | 026 | org explicit |
| `project_members` / delivery | 035–038 | org model |
| `dashboard_sync` | personal | **без** org_id (S25 decision) |

Повторный «пройдись по всем таблицам и навесь S24-шаблон» **сломает** entity-RLS и personal tables.

---

## Diff: SQL промпта vs applied archive 023

| Элемент | Промпт | Archive `023_org_rls.sql` |
|---------|--------|---------------------------|
| Helpers + ACL + search_path | ✅ | ✅ идентично |
| projects / companies / contacts / tasks / calls / meetings / activities | матрица | ✅ 1:1 с примерами |
| contact_company `cc_*` | ✅ | ✅ |
| attendees_own join + role | ✅ | ✅ + WITH CHECK зеркало |
| leads/activity_log/project_files/kpi/tracker/scheduled own+org | ✅ | ✅ |
| profiles_select + shares_org_with | ✅ | ✅ |
| org_update_owner | ✅ | ✅ |
| convert_lead REVOKE + search_path; sync_project_stage | ✅ | ✅ |
| NOT NULL ×6 service tables | ✅ | ✅ |
| COMMENT user_role deprecated | ✅ | ✅ |
| log_delete COALESCE | ❌ нет | ❌ нет (→ 024) |

**Вывод:** промпт = **исполненный** blueprint, не черновик-с-дырами как sprint-23 (там self-ref RLS). Опасность сегодня — не «плохой SQL», а **повтор на evolved schema**.

---

## crm-architect checklist (condensed)

| Пункт | Как дизайн S24 | Как runnable на main |
|-------|----------------|----------------------|
| РАЗВЕДКА в начале | ✅ | ❌ команды устарели |
| Реальные table/column | ✅ (на 2026-07-05) | 🟡 inventory incomplete vs 046 |
| Пути файлов | ✅ hooks/types/docs | ❌ 023 path, docs state |
| learnings gotchas | 🟡 initplan/ACL ok; service NOT NULL gap | ❌ |
| SQL file, не apply из CC | ✅ | n/a (уже applied) |
| org_id first + current_org_role | ✅ | ✅ already |
| DEFINER search_path + ACL | ✅ | ✅ already |
| schema.md after migration | ✅ задача 3 | ✅ already |

---

## Предлагаемые правки в спринт

**Не править для запуска.** Варианты:

1. **Пометить SUPERSEDED** в шапке файла (когда разрешат edit):
   ```markdown
   > ⛔ SUPERSEDED / APPLIED (2026-07-05, MCP apply 023). Не запускать в CC.
   > Source of truth: `supabase/migrations/archive/023_org_rls.sql`,
   > baseline, `docs/schema.md` § RLS-модель (S24 + дельты S25+).
   > Инцидент service-log NOT NULL → фикс 024 (не повторять 023 без COALESCE).
   ```

2. **Не создавать** «Sprint 24 re-run». Любой новый tenant-RLS / policy change — **новый** sprint id, миграция **047+**, разведка: archive + baseline + `pg_policies` + post-023 миграции.

3. Опциональный micro-fix вне этого спринта: обновить JSDoc в `use-org-role.ts` (убрать «UI не подключён»).

---

## Чеклист перед CC

- [ ] **Не запускать** `_analysis/sprint-24-org-rls.md` в Claude Code
- [ ] Не создавать `supabase/migrations/023_org_rls.sql` в active tree
- [ ] Не DROP/CREATE policies «как в S24» на живой БД без diff vs baseline+024…046
- [ ] Для справки по S24: читать `archive/023_org_rls.sql` + `docs/schema.md` L685–732
- [ ] Для service-context / NOT NULL: `learnings.md` § Multi-tenancy + archive 024 log_* 
- [ ] Следующий schema-sprint: номер ≥ **047**, РАЗВЕДКА включает `archive/`, baseline, MCP list_migrations
- [ ] Do not commit; do not edit sprint file unless user asks for SUPERSEDED banner
