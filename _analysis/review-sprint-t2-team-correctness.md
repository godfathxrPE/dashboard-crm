# Ревью: Sprint T2 — Корректность совместной работы

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `2fe8806`; T2-коммит `ab88f24` 2026-07-18; live: `timeline.ts`, `use-actor.ts`, `use-entity-timeline.ts`, `use-projects.ts`, `activity-events.ts`, tables + TeamSection, `059_membership_role_guard.sql`, `docs/schema.md`, skill refs)  
**Объект:** `_analysis/sprint-t2-team-correctness.md` — актор в ленте · `stage_changed` · UI role-gate · 059 admin↛owner  
**Контекст:** TEAM-READINESS HIGH #3–4; T1a `058_accept_invitation.sql`; предыдущий review (2026-07-18, pre-implement) **устарел** — scope T2 **уже влит и 059 APPLIED**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (пути, grep, SQL policies) | ✅ команды валидны; **claims спринта ≠ live** (работа уже сделана) |
| Качество HOW (WITH CHECK, dual-log, useActorMap, W6) | ✅ в теле спринта корректно |
| Задача 1: актор в ленте | ✅ **DONE** (`actorId`/`actorName`, `use-actor.ts`, EntityTimeline + Dashboard + Drawer) |
| Задача 2: `stage_changed` | ✅ **DONE** (`useUpdateProject` + `describeEvent` + unit-test) |
| Задача 3: role-gate create | 🟡 **DONE create**; edit/delete/bulk/EditableCell **не** загейчены |
| Задача 4: admin↛owner UI + 059 | ✅ **DONE** + APPLIED; self-delete сохранён (лучше спринта) |
| Номер миграции 059 | ✅ был верен; сейчас цепочка → **067**, 059 не «свободный» номер |
| Повторный запуск в CC | ❌ **нельзя** — re-apply/дубль кода |

**Оценка: 3/10 как handoff «запустить сейчас».** Как исходный дизайн (до `ab88f24`) — ~9/10; **как актуальный промпт для CC — устарел и опасен.**  
**Рекомендация:** **не запускать в CC.** Спринт закрыт коммитом `ab88f24` + gate 059. Хвосты (edit-gate viewer, `leads_insert_own`, team-wide `activity_log` SELECT) — отдельный мини-спринт/хвост, не re-run T2.

---

## Статус (репо vs текст спринта)

| Заход | Статус в репо |
|-------|---------------|
| `TimelineEvent.actorId` / `actorName` | ✅ `src/types/timeline.ts` L30–34 |
| `activity_log` select `user_id` | ✅ `use-entity-timeline.ts` L158, L171 |
| `useActorMap` / `useActorName` | ✅ `src/lib/hooks/use-actor.ts` |
| Actor UI: EntityTimeline / RecentActivityList / ActivityDrawer | ✅ L155; DashboardHome L501/525; ActivityDrawer L246–261 |
| Adapters `created_by` → `actorId` | ✅ `src/lib/timeline/adapters.ts` |
| `stage_changed` + suppress stage-only `project_updated` | ✅ `use-projects.ts` L432–487 |
| `describeEvent('stage_changed')` + Set-дедуп FIELD_LABELS | ✅ `activity-events.ts` L62–68, L78–84; test L45+ |
| Create-gate companies/contacts/calls/leads/meetings | ✅ `canCreate = role != null && role !== 'viewer'` |
| W6: CompanyDetail, CommandPalette, ExcelImport | ✅ Detail/Palette; ExcelImport спрятан через parent `canCreate` |
| Edit/delete/bulk/EditableCell для viewer | ❌ **не сделано** (см. W1) |
| MemberRow `ownerLocked` | ✅ `TeamSection.tsx` L57–62 |
| `059_membership_role_guard.sql` | ✅ файл + **APPLIED** (`docs/schema.md` блок 059) |
| schema.md / skill | ✅ 059 отражён; миграции 061–067 уже поверх |
| T2 commit | ✅ `ab88f24` (20 files, +331/−58) |

---

## Разведка (claims спринта → live 2026-07-19)

| Утверждение спринта | Live |
|---------------------|------|
| Актор не в `TimelineEvent` / не в UI | ❌ **устарело** — поля + «• {actorName}» есть |
| `activity_log` select без `user_id` | ❌ **устарело** — `user_id` в select |
| `moveToStageId` → только `project_updated {stage_id}` | ❌ **устарело** — `stage_changed` с from/to names |
| Create без `useOrgRole` на CRM-таблицах | ❌ **устарело** — все 5 + Detail/Palette |
| MemberRow delete без gate на owner | ❌ **устарело** — `ownerLocked` |
| `059*` нет, номер сверить с 058 | ❌ **устарело** — 059 есть и APPLIED; next free **068** (060 reserved) |
| Kanban `canCreate` L51 | 🟡 фактически `canEdit = role !== 'viewer'` (`KanbanBoard.tsx` L50–51) — смысл тот же |
| Policies `membership_update` / `membership_delete` | ✅ имена верны; pre-059 baseline: admin на любую строку org; post-059: admin только manager/viewer + WITH CHECK |
| Self-leave `profile_id = auth.uid()` | 🟡 спринт SQL **опускает**; live 059 **сохраняет** (правильно) |
| `usePipelineStages` для имён | 🟡 live: `usePipelineStagesMap()` — лучше/точнее |

---

## С чем согласен полностью (как исходный дизайн)

### 1. Актор в ленте (HIGH)
`activity_log.user_id` писался, UI не показывал. Shared Map через `useTeamMembers` без N+1 — верный паттерн. Реализация вынесла `use-actor.ts` и покрыла три surface.

### 2. `stage_changed` вместо шума
Обезличенный `project_updated {fields_changed:['stage_id']}` + dual-log — реальная боль. Подавление stage-only + derived won/loss-полей (`STAGE_DERIVED_FIELDS`) и payload с готовыми именами — верно. Legacy `stage_change` не трогать — верно (047 DROP).

### 3. UI role-gate create (не write-RLS)
Write-RLS после W1/054 крепкая; 42501 на create у viewer — UX. Паттерн `role !== 'viewer'` — ок. W6 (палитра, CompanyDetail) — must.

### 4. admin↛owner: USING **и** WITH CHECK
Классическая ловушка UPDATE: USING = OLD, escalation ловит только WITH CHECK на NEW. Спринт SQL и live 059 совпадают по смыслу; initplan `( SELECT … )`, org-first, `protect_last_owner` floor — по learnings.

---

## Блокеры (критично — до **повторного** запуска)

### B1. Спринт уже выполнен — re-run в CC запрещён

Коммит `ab88f24` («Sprint T2: атрибуция… 059») + `docs/schema.md`: **059 APPLIED 2026-07-18**.  
Повторный прогон:

- перепишет уже правильный код / создаст merge-конфликт с `main`;
- попытается снова `apply_migration` 059 (уже в history);
- `git add` list спринта **неполный** vs реальный diff (нет `use-actor.ts`, DashboardHome, ActivityDrawer, adapters, tests, CommandPalette, CompanyDetail).

**Действие:** закрыть T2 как done; не кормить файл в CC as-is.

### B2. Текст спринта утверждает «дыра сейчас» — все core-дыры закрыты

Любой агент, читающий спринт без live-сверки, начнёт «чинить» уже починенное.  
**Действие:** пометить файл DONE / archive header, либо заменить на residual-хвост (см. W*).

*Других блокеров дизайна HOW нет — проблема только в stale execution state.*

---

## Предупреждения (хвосты post-T2, не re-run)

### W1. Edit/delete/bulk/EditableCell для viewer не загейчены

Спринт: «Edit/delete … `role !== 'viewer'`». Live — **только create**:

| Surface | Create | Edit / Delete / bulk |
|---------|--------|----------------------|
| CompaniesTable | ✅ | ❌ `EditableCell`, openEdit, bulk «Удалить» |
| ContactsTable | ✅ | ❌ аналогично |
| CallLog | ✅ | ❌ Pencil/Trash всегда |
| MeetingsList | ✅ | ❌ onEdit/onDelete всегда |
| LeadsView | ✅ | ❌ handleEdit / bulk delete |

Viewer ловит 42501 на mutate (RLS), но UI врёт. Мини-хвост: `canEdit = canCreate` (v1) на row-actions + bulk danger + disable EditableCell.

### W2. `leads_insert_own` без роль-чека (TEAM-READINESS)

`baseline` L3445: INSERT = org + `user_id = auth.uid()` — **viewer может INSERT lead** в обход UI-гейта. Спринт явно «не трогать RLS» на create-gate — ок для scope T2, но дыра жива. Отдельный one-liner migration (role IN owner/admin/manager) — backlog.

### W3. Атрибуция manager’а на чужих `activity_log` — partial

SELECT policy `"Users see own logs"`: owner/admin — всё; иначе `user_id = auth.uid()`. Manager видит entity timeline (calls/tasks via entity RLS), но **чужие audit-строки activity_log** — нет → «кто двигал сделку» для manager неполон. 065 team-visibility **не** трогал activity_log. Out of T2, product follow-up.

### W4. `role !== 'viewer'` vs `role != null && …`

T2-таблицы: hide create при `role == null` (loading) — хорошо.  
Kanban/Pipeline: `canEdit = role !== 'viewer'` → при `null` **true** (краткий flash). Не регрессия T2, но паттерн лучше унифицировать.

### W5. Commit-list спринта неполный

Реальный `ab88f24` также: `use-actor.ts`, `adapters.ts`, `DashboardHome`, `ActivityDrawer`, `CommandPalette`, `CompanyDetail`, `tests/unit/activity-events.test.ts`, `docs/schema.md`.  
Если когда-либо reuse HOW — обновить `git add`.

### W6. Реализация лучше SQL-черновика спринта

059 live **добавила** self-delete (`or profile_id = ( select auth.uid() )`) — baseline имел, спринт-блок SQL затирал бы. При любом будущем rewrite политики — не терять self-leave.

---

## Пропущенные места (если бы T2 ещё не был сделан)

| Файл | Строки / символ | Действие |
|------|-----------------|----------|
| `src/lib/hooks/use-actor.ts` | new | общий резолв (спринт W4 — сделано) |
| `src/lib/timeline/adapters.ts` | `actorId` from `created_by` | сделано |
| `src/components/dashboard/DashboardHome.tsx` | RecentActivityList | сделано |
| `src/components/layout/ActivityDrawer.tsx` | actor render | сделано |
| `src/components/shared/CommandPalette.tsx` | canCreate | сделано |
| `src/components/companies/CompanyDetail.tsx` | +Контакт | сделано |
| `tests/unit/activity-events.test.ts` | stage_changed | сделано |
| Companies/Contacts **edit path** | EditableCell / bulk Trash | **осталось** (W1) |
| CallLog / MeetingsList / LeadsView row actions | Pencil/Trash | **осталось** (W1) |

---

## Предлагаемые правки в спринт

1. **Header DONE:**  
   `> STATUS: IMPLEMENTED ab88f24 · 059 APPLIED 2026-07-18 · do not re-run in CC`
2. Убрать формулировки «сейчас дыра / `059*` нет» — заменить статусом live.
3. Commit-list → фактический diff `ab88f24` (+ `use-actor`, adapters, Dashboard, Drawer, tests).
4. SQL delete — явно оставить self-delete (как в live 059).
5. Остаточный scope (опц. T2.1): W1 edit-gate + W2 `leads_insert` role check; **не** трогать номер 059.
6. Миграционный совет: «номер сверить» → next free **068** (060 reserved, 061–067 заняты).

---

## Чеклист crm-architect

- [x] Есть РАЗВЕДКА (bash + SQL policies)
- [x] Реальные table/column (`memberships.role`, `activity_log.user_id`, `pipeline_stages`)
- [x] Реальные paths (architecture: EntityTimeline, use-entity-timeline, TeamSection, activity-events)
- [x] learnings: initplan, org-first, NULL-safe role deny в RLS
- [x] SQL отдельным файлом; apply — гейт (не CC)
- [x] UPDATE: USING + WITH CHECK (W1)
- [x] Нет `flowType: 'implicit'`
- [x] CSS не в scope
- [x] schema.md обновлён **после** 059 (live docs + skill)
- [ ] ~~Готов к CC~~ → **уже выполнен**

---

## Чеклист перед CC

- [x] ~~Исправить блокеры B*~~ → **не применимо: не запускать**
- [x] Подтвердить `git log` / `ab88f24` / 059 APPLIED
- [ ] При необходимости — отдельный residual prompt (W1 edit-gate, W2 leads INSERT), **без** 059
- [ ] Не `apply_migration` 059 повторно
- [ ] Не коммитить re-implementation поверх done-кода

---

**Итог:** промпт T2 был сильным и почти 1:1 совпал с реализацией; **на 2026-07-19 это archive/done-документ, не handoff.** Запускать в Claude Code **нельзя**.
