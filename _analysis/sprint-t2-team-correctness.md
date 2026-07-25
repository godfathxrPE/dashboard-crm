# Claude Code Prompt — Sprint T2: Корректность совместной работы (атрибуция + роль-гейт + admin↔owner)

Контекст: dashboard-crm готовится к команде. T1a/T1b завели онбординг. T2 закрывает три HIGH из аудита `_analysis/TEAM-READINESS-2026-07-18.md`, без которых команда работает некорректно: (1) не видно «кто что сделал», (2) viewer ловит сырой 42501 на скрытых-не-везде create-кнопках, (3) admin может выкинуть/разжаловать owner. Write-RLS после W1 крепкая — тут про видимость и UI-гейт, не про безопасность записи.

**Правила:** миграции пишем, применяет гейт. RLS-правки — org-граница первым конъюнктом, initplan-обёртки `( SELECT … )`. Разведка живой БД через MCP.

## РАЗВЕДКА

```bash
# Атрибуция
sed -n '1,40p' src/types/timeline.ts
grep -n "user_id\|actor\|\.select(" src/lib/hooks/use-entity-timeline.ts
grep -n "KIND_META\|renderAction\|title\|detail" src/components/shared/EntityTimeline.tsx | head
grep -n "moveToStageId\|project_updated\|fields_changed\|logActivity" src/lib/hooks/use-projects.ts
grep -n "useTeamMembers\|full_name" src/lib/hooks/use-team-members.ts
# Роль-гейт
grep -rln "useOrgRole" src/components   # где уже есть
grep -n "Компания\|Contact\|+ " src/components/companies/CompaniesTable.tsx src/components/contacts/ContactsTable.tsx src/components/calls/CallLog.tsx src/components/leads/LeadsView.tsx src/components/meetings/MeetingsList.tsx | grep -i "кнопк\|button\|onClick\|create" | head
# admin↔owner
sed -n '80,120p' src/components/settings/TeamSection.tsx
```

Интроспекция живой БД:
```sql
select policyname, cmd, qual, with_check from pg_policies
 where schemaname='public' and tablename='memberships';
select pg_get_functiondef('public.protect_last_owner()'::regprocedure);
```

## ЗАДАЧА 1: Актор в ленте активности (HIGH — «кто вёл сделку»)

`activity_log.user_id` пишется, но нигде не показан. Резолвим в имя и рендерим.

1. `src/types/timeline.ts`: `TimelineEvent` += `actorId?: string`, `actorName?: string`.
2. `src/lib/hooks/use-entity-timeline.ts`: в источнике `activity_log` селектить `user_id`; резолв id→имя через `useTeamMembers()` (Map, уже есть) на этапе сборки событий (не N запросов). Для call/meeting/task адаптеров — актор из `created_by` (по возможности; иначе оставить пустым).
3. `src/components/shared/EntityTimeline.tsx`: в строке события показать `actorName` (мелким, рядом со временем: «• Олег»). Пустой актор — не рендерить.
4. Глобальная лента (`DashboardHome` RecentActivityList) и `ActivityDrawer` — тот же резолв id→имя. **grok W4:** вынести резолв в общий `useActorName(id)` / `useActorMap()` (`lib/hooks/`), чтобы три места не разъехались.

## ЗАДАЧА 2: Осмысленный лог смены стадии (HIGH)

Сейчас `moveToStageId` пишет обезличенное `project_updated {fields_changed:['stage_id']}` — без from→to, без названий. Заменить на явное событие.

1. `src/lib/hooks/use-projects.ts` (`moveToStageId`): логировать `stage_changed` с payload `{ from_stage_id, to_stage_id, from_name, to_name }`, имена — из `usePipelineStages`-кеша на момент лога (актор `user_id` проставит `logActivity`). **grok W3 — НЕ дублировать:** `useUpdateProject.onSuccess` сейчас всегда пишет `project_updated {fields_changed:['stage_id',...]}`. Когда изменился только `stage_id` (+ производные won-поля) — логировать `stage_changed` **вместо** `project_updated` (подавить обезличенный лог для stage-only апдейта), иначе на одно перемещение два события. Старый `log_stage_change` на legacy-`stage` не трогаем (dormant).
2. `src/lib/utils/activity-events.ts` (`describeEvent`): ветка `stage_changed` → «Стадия: <from_name> → <to_name>» (у нас уже есть `stageName`-хелпер; здесь имена приходят готовыми из payload — не резолвить legacy-enum). Дедупнуть заодно дубли лейблов из W2 («причина выигрыша, причина выигрыша» — свернуть одинаковые FIELD_LABELS через Set).

## ЗАДАЧА 3: Довести роль-гейт create/edit в UI (MEDIUM-HIGH)

`useOrgRole` уже гейтит задачи/сделки; довести на Компании/Контакты/Звонки/Лиды/Встречи — чтобы viewer не жал create → 42501. Паттерн ровно как в `KanbanBoard.tsx:51` (`canCreate = role && role !== 'viewer'`), скрывать/дизейблить create-кнопку.
- `CompaniesTable.tsx`, `ContactsTable.tsx`, `CallLog.tsx`, `LeadsView.tsx`, `MeetingsList.tsx` (+ соответствующие page-заголовки с кнопкой «+ …»).
- Не трогать RLS (она держит — это чисто UX). Edit/delete-кнопки в строках — по тому же `canEdit` (owner/admin ∨ владелец записи; для простоты v1 — `role !== 'viewer'`, RLS доотсечёт чужое).
- **grok W6 — не только таблицы:** create-точки есть ещё в `CompanyDetail` («+Контакт»), `ExcelImport`, `CommandPalette` (Действия→создание), `GlobalModals`. Прогнать `grep -rn "CTAButton\|openModal\|setModalOpen" src/components` и либо загейтить те же, либо явно оставить known-gap в PR (не молча). Минимум — палитра и CompanyDetail, откуда viewer реально создаёт.

## ЗАДАЧА 4: admin не трогает owner (MEDIUM, безопасность команды)

Дыра: `TeamSection` MemberRow показывает удаление любому не-себе; RLS `membership_delete`/`membership_update` пускает admin на не-последнего owner. `protect_last_owner` спасает только край.

1. **UI** (`TeamSection.tsx` MemberRow): скрыть удаление и селект смены роли, если `row.role === 'owner'` и текущий юзер не owner. Owner-строку может трогать только owner.
2. **RLS-миграция** `059_membership_role_guard.sql` (номер сверить: T1a занял 058): ужесточить `membership_update`/`membership_delete`. **grok W1 — критично: одного USING мало.** USING проверяет СТАРУЮ строку (кого трогаю), а UPDATE-эскалацию (`SET role='owner'`) ловит только WITH CHECK на НОВОЙ строке. Без него admin поднимет manager→admin/owner.

   `membership_update` — USING (по старой роли) **И** WITH CHECK (по новой роли):
   ```sql
   -- кого можно трогать: своя org И (я owner ИЛИ я admin И старая роль IN (manager,viewer))
   using (
     org_id = ( select public.current_org_id() )
     and (
       ( select public.current_org_role() ) = 'owner'
       or ( ( select public.current_org_role() ) = 'admin' and role in ('manager','viewer') )
     )
   )
   -- какой role допустим ПОСЛЕ update: admin не может выставить admin/owner
   with check (
     org_id = ( select public.current_org_id() )
     and (
       ( select public.current_org_role() ) = 'owner'
       or ( ( select public.current_org_role() ) = 'admin' and role in ('manager','viewer') )
     )
   )
   ```
   `membership_delete` — только USING (тот же предикат; WITH CHECK у DELETE нет).
   NULL-safe: `current_org_role() IS NULL` → AND short-circuit = deny (learnings). `protect_last_owner` — нижняя граница, оставить. Точные имена политик (`membership_update`/`membership_delete`) и текущие qual — сверить разведкой перед ALTER.

## ПРОВЕРКА / ГЕЙТ

```bash
npx tsc --noEmit && npx vitest run
```
Гейт: `apply_migration` 059; смок симуляцией ролей — admin пытается удалить/разжаловать owner → 42501; admin удаляет manager → ок; viewer не видит create-кнопок, прямой INSERT под viewer → 42501 (RLS). Визуально: лента показывает актора; смена стадии — «Стадия: A → B». `get_advisors`. Обновить schema.md + skill.

## КОММИТ

```bash
git add src/types/timeline.ts src/lib/hooks/use-entity-timeline.ts src/components/shared/EntityTimeline.tsx src/lib/hooks/use-projects.ts src/lib/utils/activity-events.ts src/components/companies/ src/components/contacts/ src/components/calls/ src/components/leads/ src/components/meetings/ src/components/settings/TeamSection.tsx supabase/migrations/059_membership_role_guard.sql
git commit -m "Sprint T2: атрибуция актора в ленте + лог смены стадии, роль-гейт create в UI, admin не трогает owner (059)"
```
