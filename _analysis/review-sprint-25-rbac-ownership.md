# Ревью: Sprint 25 — RBAC-финализация + владение записями

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, archive `024_team_visibility_and_hardening.sql`, baseline `20260712230000_baseline.sql`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-25-rbac-ownership.md` — командная видимость leads/activity_log, org_id в log-функциях, гард `convert_lead`, DROP `user_role()`/`profiles.role`, AssigneeSelect + useOrgRole в UI  
**Контекст:** Фаза multi-user S23–S26+ **уже в проде** (с 2026-07-05); живая цепочка до **046**; S25 applied как archive `024` (2026-07-05); далее S26–S-GANTT, AUDIT-B baseline, active `040–046`. Аналогично `review-sprint-24-org-rls.md` — handoff-артефакт, не runnable-промпт.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** (SQL + UI + docs) |
| Исторический дизайн (vs archive 024) | ✅ Почти 1:1 с applied SQL; на гейте доп. фикс ownership в `convert_lead` |
| РАЗВЕДКА на `main` 2026-07-16 | ❌ Утверждения про «useOrgRole не подключён», «нет AssigneeSelect», «мода́лки в components/modals» **ложны** |
| Номер миграции `024` | ❌ Занят (archive + baseline + `docs/schema.md` «applied»); next free ≥ **047** |
| RLS leads / activity_log (team visibility) | ✅ В baseline и archive 024; initplan-обёртки верны |
| Log-функции `COALESCE(OLD/NEW.org_id, …)` | ✅ 7 вхождений в archive 024; в baseline те же INSERT |
| Гард `convert_lead` + ERRCODE `42501` | ✅ В baseline L367–375; smoke на гейте пройден |
| DROP `user_role()` / `profiles.role` | ✅ archive 024 L312–313; `UserRole` в `src/` = 0 |
| Задача 2–4 UI (team-members, AssigneeSelect, useOrgRole) | ❌ **Уже в коде** (и расширены S26+) |
| Пути модалок `src/components/modals/*` | ❌ Папки нет; модалки в feature-папках (`tasks/`, `projects/`, …) |
| `docs/schema.md` § S25 | ❌ Уже полный блок «С S25 (024, _applied_)»; Header не «024 pending» |
| Повторный `CREATE OR REPLACE convert_lead` / DROP legacy | ❌ **Риск регрессии** (тело после S25+ менялось; DROP no-op, но лишняя миграция 024 недопустима) |
| Контракт «CC пишет, не apply» | ✅ Процесс верный (исторически соблюдён) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности / номерам / state |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (post-S24, июль 2026): 9/10** — SQL ушёл в `archive/024_team_visibility_and_hardening.sql` (313 строк), гейт поймал `42703` в живом `convert_lead` (несуществующие `user_id` на companies/contacts/projects) и починил на `owner_id`/`created_by`; smoke и advisors пройдены.

**Рекомендация: не запускать.** Source of truth — `archive/024_team_visibility_and_hardening.sql`, baseline, `docs/schema.md` § «С S25». Новый RBAC/ownership-work — отдельный спринт поверх **047+**, не «перепрогон 024».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S23 schema (021/022) | ✅ archive + baseline |
| S24 org-scoped RLS (023) | ✅ archive; `current_org_role` / `shares_org_with` |
| **S25 team visibility + hardening (024)** | ✅ **applied** 2026-07-05; `supabase/migrations/archive/024_team_visibility_and_hardening.sql`; baseline policies `leads_*`, `"Users see own logs"`, COALESCE в log_*, гард convert_lead |
| S26+ invitations / notifications / gates / AI / delivery / gantt | ✅ 025–046 + baseline; active `040–046` |
| `useTeamMembers` / `AssigneeSelect` | ✅ `src/lib/hooks/use-team-members.ts`, `src/components/shared/AssigneeSelect.tsx` + модалки |
| `useOrgRole` в UI | ✅ Settings бейдж; `canEdit = role !== 'viewer'` в KanbanBoard / PipelineBoard / ProjectBoard; Team/Gates/Automations |
| Валидаторы `assigned_to` / `owner_id` | ✅ task / project / company / contact |
| **Повторный запуск sprint-25-rbac-ownership.md** | ❌ **запрещён** |

Доказательства:

- `docs/schema.md` L9–10, L734–758, L1062–1067: «S25 … 024», smoke-итоги.
- Baseline: `leads_select` / `leads_update` / `leads_delete` (team + org); activity_log SELECT; convert_lead guard L367–375; log_delete_* с `COALESCE(OLD.org_id, …)`.
- `grep -c COALESCE(OLD.org_id\|COALESCE(NEW.org_id` на archive 024 → **7** (как в § ПРОВЕРКА спринта).
- `grep -rn UserRole src/` → **0**.
- Активные миграции: `040…046` + baseline; **024 только в archive**.

---

## С чем согласен полностью (как с историческим дизайном S25)

### 1. Разрез «командная видимость» для leads + activity_log

Правильный product-call: owner/admin видят всё в org, manager — своё (`user_id` / own). INSERT leads остаётся own (`leads_insert_own` не трогать). Совпадает с archive 024 L24–54 и baseline policies.

### 2. Initplan-паттерн в политиках

`org_id = ( SELECT public.current_org_id() )` + `( SELECT public.current_org_role() )` + `( SELECT auth.uid() )` — эталон learnings / S24; в 024 и baseline соблюдён.

### 3. Log-функции: org_id из OLD/NEW (инцидент S24)

`COALESCE(OLD.org_id, public.current_org_id())` на 6 delete-логах + `COALESCE(NEW.org_id, …)` в `log_stage_change` — ровно то, что требует learnings («Service-контекст: auth.uid() = NULL → current_org_id() = NULL»). Одна функция = один CREATE OR REPLACE (грабли 011) — верно.

### 4. Гард в `convert_lead` (IDOR)

SECURITY DEFINER обходит RLS — явный EXISTS + `42501` обязателен. Контракт RPC не менять — верно (`use-leads.ts` зовёт `.rpc('convert_lead', …)`).

### 5. Чистка legacy `user_role()` / `profiles.role`

Единственный source of truth ролей — `memberships.role`. DROP после разведки «никто не читает» — корректный финал фазы 1. В `src/types/database.ts` остаётся `OrgRole`, не `UserRole`.

### 6. UI-назначение через shared AssigneeSelect + useTeamMembers

Паттерн правильный: profiles RLS (`shares_org_with`) режет выборку; staleTime 5 мин; CSS-токены; optional uuid в Zod. Реализация шире промпта (memberships+role, excludeIds, портал) — но направление то же.

### 7. useOrgRole как UX-слой над RLS

`canEdit = role !== 'viewer'` на create/edit — осознанный UX-слой; безопасность в RLS. Settings-бейдж роли — сделано (`SettingsContent.tsx` L55–59).

### 8. docs: dashboard_sync персональная

Решение «без org_id, аналог user_settings» зафиксировано в `docs/schema.md` L148–151 — совпадает с задачей 5.

### 9. Контракт CC / Cowork

Миграции без BEGIN/COMMIT, apply только Cowork MCP, smoke + advisors — процесс соблюдён на гейте 024.

---

## Блокеры (критично — не запускать)

### B1. Спринт уже applied — повторный прогон недопустим

Контекст промпта («S23–S24 применены… S25 добивает…», «024 pending») описывает мир **июля 2026 post-S24**. На `main` 2026-07-16:

- archive `024` + baseline уже содержат весь SQL S25;
- UI (AssigneeSelect, team-members, useOrgRole, validators) уже в дереве;
- `docs/schema.md` документирует 024 как applied.

Повтор: ложные «новые» файлы `024_…sql`, перезапись docs в «pending», риск `CREATE OR REPLACE` живых функций телом из устаревшего шаблона.

### B2. Номер миграции `024` занят

Next free в active-цепочке ≥ **047** (после 046 gantt dates). Писать снова `024_team_visibility_and_hardening.sql` в `supabase/migrations/` — конфликт с archive/history/baseline.

### B3. Ложные предпосылки РАЗВЕДКИ / контекста

| Утверждение спринта | Факт на `main` |
|---------------------|----------------|
| «useOrgRole создан в S24, к UI не подключён» | Подключён: Settings, boards, ProjectDetail, Team/Gates/Automations |
| «хук команды / AssigneeSelect — сделать» | `use-team-members.ts`, `AssigneeSelect.tsx` существуют; подключены в 4 модалки + ProjectTeam + SpawnWizard |
| `src/components/modals/*.tsx` | **Папки нет** (`zsh: no matches`); модалки: `src/components/{tasks,projects,companies,contacts}/…Modal.tsx` (architecture.md L55–61) |
| «UserRole / profiles.role в types — удалить» | `UserRole` уже 0; `profiles.role` удалена в 024 |
| «Header schema: 024 pending» | Header: 001–046 applied; S25 в блоке _applied_ |

Запуск «как написано» сломает разведку (ложные пути) и продублирует готовую работу.

### B4. Повторный `CREATE OR REPLACE convert_lead` по промпту ≠ безопасный re-apply

Промпт §1.4 даёт **только** фрагмент гарда. В applied 024 / baseline тело ещё содержит **S25 gate-fix**: companies/contacts/projects через `owner_id`/`created_by`, не `user_id` (docs/schema.md L754–758; learnings «Живое тело ≠ файл миграции»). Если CC соберёт тело из старого archive 016/018 + гард, прод снова получит **42703**. Даже с инструкцией «бери pg_get_functiondef» — на сегодня **менять convert_lead не нужно**.

### B5. Задача 5 (docs) откатит актуальный schema

«Header: 024 pending до применения» противоречит текущему `docs/schema.md` (001–046, S25 applied). Выполнение задачи 5 без полной переписи = **дрейф документации назад**.

---

## Предупреждения (исторические / product — не для re-run)

### W1. Гард convert_lead — только owner лида, не org-admin

```sql
user_id = auth.uid() AND org_id = public.current_org_id()
```

Admin может SELECT/UPDATE чужие leads (team policy), но **не** конвертировать их через RPC. Это согласовано с archive 024 и smoke («чужого лида → 42501»), но product-gap, если «командная» модель подразумевает admin-конверсию. Новый спринт (не 024) — если понадобится:  
`OR current_org_role() IN ('owner','admin')` + NULL-safe обёртка.

### W2. NULL-safety гарда vs learnings PCT-1 / 033

`EXISTS (… AND org_id = current_org_id() AND user_id = auth.uid())` при `auth.uid()`/`current_org_id()` NULL → no match → **fail-closed** (42501). Для client RPC это ок. Паттерн `IS DISTINCT FROM` + явный отказ без org (learnings) здесь не обязателен, но service-контекст convert_lead тоже получит 42501 — обычно приемлемо (RPC не для service).

### W3. Промпт не предупреждал про `user_id` в теле convert_lead

Исторический gap: §1.4 «менять минимально» не упоминал, что живое тело ссылалось на несуществующие колонки. Гейт 024 это закрыл. Для любых будущих REPLACE-функций — **только** `pg_get_functiondef` + diff (уже в learnings).

### W4. useTeamMembers шире ТЗ

Спринт: только `id, full_name, avatar_url`. Реальность: + `memberships` (role, membership_id) + мутации role/remove — нужны S26 TeamSection. Переписать «строго по ТЗ» **сломает** Settings → Team.

### W5. Стилизация «t-scandi»

В проекте 6 тем (`t-aura` default и др.); правило «CSS-переменные, без хардкода» верно; привязка имени к scandi — устаревшая формулировка. AssigneeSelect уже на токенах (`bg-accent-l`, `text-accent`, …).

### W6. activity_log policy name остаётся `"Users see own logs"`

Имя лжёт (командная видимость). Не блокер; при следующем RLS-спринте можно переименовать с DROP/CREATE.

### W7. Комментарий в `use-org-role.ts` L15–16 устарел

«S24: хук создан, но к UI НЕ подключён» — текст врёт. Косметика, не блокер S25.

---

## Пропущенные / неверные места (grep vs спринт)

| Файл / путь | Факт | Действие при re-run |
|-------------|------|---------------------|
| `src/components/modals/*.tsx` | Не существует | Использовать feature-папки |
| `src/components/tasks/TaskModal.tsx` | AssigneeSelect + `assigned_to` | Не трогать |
| `src/components/projects/ProjectModal.tsx` | AssigneeSelect + `owner_id` | Не трогать |
| `src/components/companies/CompanyModal.tsx` | AssigneeSelect + `owner_id` | Не трогать |
| `src/components/contacts/ContactModal.tsx` | AssigneeSelect + `owner_id` | Не трогать |
| `src/lib/validators/{task,project,company,contact}.ts` | uuid nullable optional | Не трогать |
| `src/lib/hooks/use-team-members.ts` | Есть + S26 extensions | Не упрощать до ТЗ |
| `src/components/shared/AssigneeSelect.tsx` | Есть | Не пересоздавать с нуля |
| `src/components/settings/SettingsContent.tsx` | Бейдж роли | Готово |
| `src/components/tasks/KanbanBoard.tsx` L51 | `canEdit = role !== 'viewer'` | Готово |
| `src/components/projects/PipelineBoard.tsx` L334 | то же | Готово |
| `src/components/tasks/ProjectBoard.tsx` L204 | то же | Готово |
| `supabase/migrations/024_…` (active) | Нет; есть **archive**/024 | Не создавать 024 заново |
| `supabase/migrations/20260712230000_baseline.sql` | Полный снимок post-S25…S39 | Истина для schema/functions |

РАЗВЕДКА спринта (п.1–4) на текущем дереве:

1. `user_role` / `profiles.role` в `src/` — только комментарий в `use-org-role.ts` (упоминание legacy).  
2. `UserRole` в `database.ts` — **нет**; есть `OrgRole`.  
3. `assigned_to` / `owner_id` — в feature-модалках и validators (не `components/modals`).  
4. `profiles` в hooks — `use-team-members.ts`, `use-project-members.ts` (уже есть).

---

## Предлагаемые правки в спринт

**Не править sprint-25 для запуска.** Файл — архивный handoff. Если нужен «чистый» артефакт:

1. В шапке: **STATUS: APPLIED 2026-07-05** → `archive/024_team_visibility_and_hardening.sql`; UI landed; docs § S25.  
2. **DO NOT RUN on main.**  
3. Ссылка на gate-fix convert_lead (`owner_id`/`created_by`) — обязательна в historical notes.  
4. Для новой работы: новый `_analysis/sprint-*.md` с миграцией **047+**, разведкой live `pg_get_functiondef` / `pg_policies`, без повторного DROP legacy.

Опциональный follow-up (отдельный спринт, не S25):

- Admin/owner convert чужих leads (W1).  
- Переименовать policy activity_log (W6).  
- Обновить JSDoc `use-org-role.ts` (W7).

---

## Чеклист crm-architect (condensed)

| Пункт | Как runnable-промпт | Как historical design |
|-------|---------------------|------------------------|
| РАЗВЕДКА в начале | 🟡 Команды ок; выводы на main **устарели** | ✅ На момент S25 |
| Реальные table/column | ✅ leads.user_id, activity_log, memberships | ✅ |
| Реальные file paths | ❌ `components/modals` | 🟡 UI-пути сдвинуты к feature-folder |
| learnings gotchas | 🟡 COALESCE org_id учтён; convert_lead live-body — частично | ✅ gate закрыл 42703 |
| SQL separate, not apply from CC | ✅ | ✅ applied via MCP |
| org_id / current_org_role first | ✅ | ✅ |
| SECURITY DEFINER + search_path + ACL | ✅ на REPLACE log_* / convert_lead (как в 024) | ✅ |
| No flowType implicit | n/a | n/a |
| DELETE CASCADE not client | n/a | n/a |
| CSS variables | ✅ формулировка | ✅ AssigneeSelect |
| schema.md after migration | ❌ «pending» vs applied | ✅ docs обновлены на гейте |

---

## Чеклист перед CC

- [ ] **Не запускать** этот файл в Claude Code на `main`
- [ ] Source of truth: `supabase/migrations/archive/024_team_visibility_and_hardening.sql` + baseline
- [ ] Не создавать `024_*.sql` в active migrations
- [ ] Не DROP/REPLACE `convert_lead` / log_* / leads policies «как в спринте»
- [ ] Не упрощать `useTeamMembers` / AssigneeSelect
- [ ] Не откатывать `docs/schema.md` Header к «024 pending»
- [ ] Новая RBAC-работа → sprint **047+** + live introspection, не re-run S25
- [ ] При сомнении: `list_migrations` / `pg_policies` / `pg_get_functiondef` (Cowork MCP), не archive alone

---

**Итог:** Sprint 25 — сильный, уже **закрытый** handoff. SQL и UI совпадают с продом; повторный запуск опасен (номер миграции, stale paths, регрессия `convert_lead`, docs). Как runnable-промпт — **не запускать** (2/10); как запись того, что сделали 2026-07-05 — **хранить** (9/10).
