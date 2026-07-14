# Claude Code Prompt — Sprint: delivery P2b — команда проекта, прогресс X/Y, apply-шаблон, CRUD фаз

Контекст: dashboard-crm, ветка `feat/aura-theme`, после P2a (коммиты 079d98a → ab3d870 → b70aecb →
9f43f26; миграции 036+036b применены на прод гейтом). Дизайн: `_analysis/architecture-delivery-p2.md`
§14 (детальный, 2026-07-11).

> ⚠️ **Миграцию НЕ применять** — только файл `supabase/migrations/037_delivery_members_progress.sql`.
> Применяет гейт (Cowork: смоуки + advisors). Коммиты — после ревью diff Олегом.

## Что делаем (P2b) / что НЕ делаем

Делаем:
1. Миграция 037: `project_members` (3 роли) + RLS; прогресс-триггер `progress_done/total`
   + бэкфилл; RPC `apply_delivery_template`.
2. UI: виджет «Команда» в ProjectDetail (delivery); прогресс «N/M задач» на карточках
   delivery-канбана и в шапке ProjectDetail; кнопка «Создать из шаблона» в empty state
   фазовой доски; CRUD фаз (rename имени / + Фаза / удаление).

НЕ делаем: default_enabled Эксперимента (одиночный UPDATE на гейте, ждёт данных Олега);
редактор шаблонов; изменение RLS-видимости проектов по членству (S25 org-wide остаётся);
привязку членов к назначению задач (assigned_to как есть).

## СВЕРЕННЫЕ ФАКТЫ (живая БД 2026-07-11 — использовать как есть)

- `profiles`: `id, full_name, avatar_url, settings, created_at, updated_at` (email в profiles НЕТ).
- На `projects` висят безусловные AFTER UPDATE: `on_stage_change` (log_stage_change),
  `trg_zz_run_automations` (run_stage_automations) — no-op при неизменной стадии, но дёргаются
  на каждый UPDATE строки ⇒ прогресс-триггер пишет в projects **только при IS DISTINCT FROM**.
- `trg_notify_project_assigned` — UPDATE OF owner_id (наш UPDATE его не заденет).
- delivery-проектов 4, задач у них 137, `progress_done/total` везде 0/0 — бэкфилл даст ненулевой результат.
- `copy_delivery_template(uuid, uuid)` — REVOKE PUBLIC/anon/authenticated (internal); гарды внутри:
  org-match шаблона, `project already has columns`. Клиентская обёртка — задача A3.
- `delete_project_column` — уже умеет приёмник задач; guard «последняя backlog/done» для
  phase-колонок вакуумен (удалять фазы можно).
- `spawn_delivery_project(p_deal_id, p_kind, p_template_id DEFAULT NULL)` — эталон гардов для A3
  (NULL-safe org → 42501, ownership owner/created_by ∨ membership owner/admin → 42501).
- Эталон RLS write-политик — `project_columns` (032/034): org + (`current_org_role() IN
  ('owner','admin')` ∨ owner/created_by проекта), ownership-подвыражения в `( SELECT auth.uid() )`.
- Урок P2a: раздельные INSERT/UPDATE/DELETE политики, НЕ `FOR ALL` (дублирует SELECT →
  advisor multiple_permissive_policies; ловили на гейте 036b).
- tasks-триггеры BEFORE: `set_updated_at` → `trg_aa_resolve_board` → `trg_set_org_id`;
  новый прогресс-триггер — AFTER, имя `trg_zz_delivery_progress` (алфавитно после всех).
- Выбор людей org: хук **`useTeamMembers()`** (`use-team-members.ts:25`) + компонент
  **`AssigneeSelect`** (`AssigneeSelect.tsx`) — `useOrgMembers` НЕ существует, не изобретать dropdown.
- Живые политики `project_columns` initplan-обёрнуты: `org_id = ( SELECT current_org_id() )` —
  политики project_members делаем в том же стиле.
- **Публикация `supabase_realtime`** (живая БД): dashboard_sync, projects, tasks, calls, meetings,
  activities, notifications, ai_runs. **`project_columns` в ней НЕТ** — `useRealtimeSync('project_columns')`
  из P2a (`use-project-columns.ts`) — мёртвая подписка (pre-existing gap PCT-1). 037 чинит: добавляет
  в публикацию `project_columns` И `project_members`. `projects` в публикации есть → realtime
  прогресса работает, но явная инвалидация надёжнее (см. B3).
- `canEdit` в `ProjectBoard.tsx` = `role !== 'viewer'` — ШИРЕ, чем RLS project_members /
  apply_delivery_template (owner-admin ∨ владелец проекта) → без B0 менеджер-не-владелец увидит
  кнопки и словит 42501 (блокер ревью Grok B1).
- `useProjects` уже тянет `progress_done, progress_total` в select (`use-projects.ts:122`) —
  расширять колонки не надо.

## РАЗВЕДКА (перед кодом)

```bash
# Карточка delivery-канбана — куда вставлять прогресс
# (ожидание: 0 совпадений — вставка новая; место: DeliveryCard, блок meta ~:92):
grep -n "progress\|budget\|Бюджет" src/components/projects/DeliveryPipelineBoard.tsx | head
# Шапка ProjectDetail delivery — куда прогресс задач
# (ожидание: 0 совпадений по задачам; место: под бейджем состояния ~:395–421):
grep -n "progress\|Прогресс\|%" src/components/projects/ProjectDetail.tsx | head -15
# Empty state фазовой доски (P2a): точка для кнопки «Создать из шаблона» (~:301):
grep -n "Фазы не созданы" src/components/tasks/ProjectBoard.tsx
# Выбор людей org: useTeamMembers + AssigneeSelect (переиспользовать, НЕ дублировать):
grep -rn "useTeamMembers\|AssigneeSelect" src/lib/hooks src/components/shared --include="*.ts*" | head
# Скрытые в P2a контролы колонок (возвращаем phase-aware):
grep -n "phaseMode" src/components/tasks/ProjectBoard.tsx | head -20
# rpc-вызовы на клиенте (эталон вызова apply_delivery_template):
grep -rn "\.rpc('spawn_delivery_project'" src --include="*.ts*"
```

---

## ЧАСТЬ A — Миграция `supabase/migrations/037_delivery_members_progress.sql` (ТОЛЬКО файл)

### A1. project_members + RLS

```sql
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager','implementer','installer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_profile ON public.project_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_project_members_org ON public.project_members(org_id);

CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select ON public.project_members FOR SELECT TO authenticated
  USING (org_id = ( SELECT public.current_org_id() ));

-- write: org + (owner/admin ∨ владелец проекта) — образец project_columns 032/034;
-- раздельные политики (урок 036b: FOR ALL дублирует SELECT → advisor-WARN)
CREATE POLICY pm_insert ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  );
CREATE POLICY pm_update ON public.project_members FOR UPDATE TO authenticated
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  )
  -- WITH CHECK повторяет USING: иначе владелец проекта A мог бы перекинуть строку
  -- (project_id) в чужой проект B, где он не владелец
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  );
CREATE POLICY pm_delete ON public.project_members FOR DELETE TO authenticated
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  );
```

### A2. Прогресс X/Y — триггер + бэкфилл

```sql
CREATE OR REPLACE FUNCTION public.recalc_delivery_progress(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_done int; v_total int;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE lane = 'done'), count(*)
    INTO v_done, v_total
  FROM public.tasks WHERE project_id = p_project_id;
  -- пишем ТОЛЬКО при изменении: на projects висят безусловные AFTER UPDATE
  -- (on_stage_change, trg_zz_run_automations) — не гоняем их вхолостую
  UPDATE public.projects
     SET progress_done = v_done, progress_total = v_total
   WHERE id = p_project_id AND type = 'delivery'
     AND (progress_done IS DISTINCT FROM v_done OR progress_total IS DISTINCT FROM v_total);
END $$;

CREATE OR REPLACE FUNCTION public.sync_delivery_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.recalc_delivery_progress(NEW.project_id);
  END IF;
  IF TG_OP IN ('DELETE','UPDATE') THEN
    IF TG_OP = 'DELETE' OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
      PERFORM public.recalc_delivery_progress(OLD.project_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_zz_delivery_progress
  AFTER INSERT OR DELETE OR UPDATE OF lane, project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_progress();

-- триггерные definer-функции не для RPC (паттерн 034)
REVOKE ALL ON FUNCTION public.recalc_delivery_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_delivery_progress(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.recalc_delivery_progress(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_delivery_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_delivery_progress() FROM anon;
REVOKE ALL ON FUNCTION public.sync_delivery_progress() FROM authenticated;

-- бэкфилл существующих delivery-проектов (факт: 4 шт., 137 задач, всё 0/0)
DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.projects WHERE type = 'delivery' LOOP
    PERFORM public.recalc_delivery_progress(v_id);
  END LOOP;
END $$;
```

### A3. apply_delivery_template — клиентский RPC (фазы для пустой доски)

Гарды — дословно по образцу `spawn_delivery_project` (035/036):

```sql
CREATE OR REPLACE FUNCTION public.apply_delivery_template(p_project_id uuid, p_template_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_project     record;
  v_privileged  boolean;
  v_template_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.projects
   WHERE id = p_project_id AND org_id = public.current_org_id() AND public.current_org_id() IS NOT NULL;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'phases can be applied only to a delivery project' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.profile_id = auth.uid() AND m.org_id = v_project.org_id AND m.role IN ('owner','admin')
  ) INTO v_privileged;
  IF NOT (v_project.owner_id = auth.uid() OR v_project.created_by = auth.uid() OR v_privileged) THEN
    RAISE EXCEPTION 'only project owner or org admin can apply template' USING ERRCODE = '42501';
  END IF;

  IF p_template_id IS NOT NULL THEN
    SELECT id INTO v_template_id FROM public.delivery_templates
    WHERE id = p_template_id AND org_id = v_project.org_id AND is_active;
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'template not found' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT id INTO v_template_id FROM public.delivery_templates
    WHERE org_id = v_project.org_id AND direction = v_project.direction
      AND kind = v_project.delivery_kind AND is_active
    LIMIT 1;
    -- здесь НЕ graceful: пользователь явно просит фазы — если шаблона нет, честная ошибка
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'no template for direction % / kind %', v_project.direction, v_project.delivery_kind USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- copy_delivery_template сам гардит org-match и «already has columns»
  PERFORM public.copy_delivery_template(p_project_id, v_template_id);
END $$;

REVOKE ALL ON FUNCTION public.apply_delivery_template(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_delivery_template(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_delivery_template(uuid, uuid) TO authenticated;
```

### A4. Realtime-публикация (фикс pre-existing gap PCT-1)

`useRealtimeSync('project_columns')` из P2a — мёртвая подписка: таблицы нет в публикации.
Добавляем обе (RLS на таблицах включён — realtime уважает политики):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
```

После применения гейтом: типы project_members/RPC дополнить в `database.ts` ВРУЧНУЮ
(файл рукописный) **и обновить `docs/schema.md`** (заодно отметить 036+036b applied — долг P2a).

---

## ЧАСТЬ B — Frontend

### B0. Контракт прав UI = RLS (блокер ревью Grok B1)

RLS project_members и apply_delivery_template требуют owner/admin ∨ владелец проекта, а
`canEdit` в ProjectBoard (`role !== 'viewer'`) шире → рассинхрон = кнопки, дающие 42501.
Единый хелпер:

```ts
// src/lib/utils/project-permissions.ts
import type { OrgRole } from '@/types/database'; // сверить фактическое имя типа роли

export function canManageDeliveryProject(
  project: { owner_id: string | null; created_by: string | null },
  orgRole: OrgRole | null | undefined,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  if (orgRole === 'owner' || orgRole === 'admin') return true;
  return project.owner_id === userId || project.created_by === userId;
}
```

Применение: виджет «Команда» (B2), кнопка «Создать из шаблона» (B4), CRUD фаз (B5).
`ProjectBoard` знает только `projectId` → новый optional prop `canManageColumns?: boolean`
(прокидывает ProjectDetail, посчитав хелпером). Существующий `canEdit` для ЗАДАЧ
(создание/смена статуса/DnD) НЕ сужать — org-wide работа с задачами остаётся.

### B1. Типы / хук

- `src/types/database.ts` — вручную: Row/Insert/Update `project_members`
  (role union `'manager'|'implementer'|'installer'`); Args-тип RPC `apply_delivery_template`.
- `src/lib/constants/delivery-phases.ts`:

```ts
export const PROJECT_MEMBER_ROLE_LABELS: Record<string, string> = {
  manager: 'Менеджер',
  implementer: 'Внедренец',
  installer: 'Монтажник',
};
export const PROJECT_MEMBER_ROLE_ORDER = ['manager', 'implementer', 'installer'] as const;
```

- `src/lib/hooks/use-project-members.ts` — по паттерну entity-хуков: список
  (`.select('*, profiles(id, full_name, avatar_url)')` по project_id), add/updateRole/remove
  с optimistic updates (cancelQueries → snapshot → set → rollback → invalidate),
  ключ `['project-members', projectId]`. `any` запрещён.
  Плюс `useRealtimeSync('project_members')` в точке использования (публикация — A4;
  без A4 подписка была бы мёртвой, как у project_columns до этого спринта).

### B2. Виджет «Команда» в ProjectDetail (только delivery)

Размещение: **отдельная full-width секция ПОД info grid** (`~:793`), перед блоком ссылки 1С:ДО
(`~:796`) — команда 3 ролей × N людей в 4-колоночный grid не влезает (ревью Grok W6):
- Список членов, сгруппированный по ролям (`PROJECT_MEMBER_ROLE_ORDER`): аватар (avatar_url,
  фолбэк — инициалы full_name), имя, роль бейджем.
- Добавление: `AssigneeSelect` (источник `useTeamMembers`) + селект роли → `add`.
  **Уже добавленных исключить из options** (иначе unique violation по (project_id, profile_id));
  ошибку дубля всё равно парсить в дружелюбный текст (гонки двух вкладок).
- Удаление — крестик с confirm. Смена роли — селект на строке (updateRole).
- Empty state: «Команда не назначена» + CTA добавления.
- Кнопки add/remove/role — по `canManageDeliveryProject` (B0), не по `role !== 'viewer'`.

### B3. Прогресс «N/M задач»

- `DeliveryPipelineBoard.tsx`, карточка: строка «N/M задач» + тонкий прогресс-бар
  (`progress_total > 0`; при 0 — не показывать). Данные уже в строке projects
  (`progress_done/progress_total` — приходят с `select`, проверить, что useProjects не режет колонки).
- `ProjectDetail.tsx`, шапка delivery: рядом со стадийным прогрессом — «Задачи: N/M»
  (не смешивать со стадийным % — это разные метрики).
- **Инвалидация (блокер ревью Grok B3):** прогресс обновляется триггером в БД, а
  `useUpdateTask`/`useMoveTask`/`useDeleteTask`/`useCreateTask` инвалидируют только `['tasks']` —
  UI показал бы устаревший N/M до staleTime. В onSettled этих мутаций добавить:

```ts
if (variables.lane !== undefined || variables.project_id || variables.column_id) {
  queryClient.invalidateQueries({ queryKey: ['projects'] });
}
```
  (`['projects']`-префикс покрывает и `['projects', id]`. Realtime на projects работает как
  подстраховка второй вкладки, но polling-зависимость недопустима для собственных действий.)

### B4. Кнопка «Создать из шаблона» (empty state фазовой доски)

`ProjectBoard.tsx`, empty state P2a («Фазы не созданы…»): для delivery добавить кнопку
«Создать из шаблона» → `supabase.rpc('apply_delivery_template', { p_project_id })` →
на success инвалидировать колонки+задачи; ошибки `42501`/`P0001`/`22023` парсить в
человекочитаемый текст (по образцу обработки spawn в ProjectDetail). Кнопку показывать
по тем же правам, что B2 (owner/created_by ∨ owner/admin).

### B5. CRUD фаз (phase-aware, возвращаем спрятанное в P2a)

`ProjectBoard.tsx`:
- Rename: в phaseMode показать карандаш, но в форме редактирования — ТОЛЬКО input имени
  (category-select не рендерить; в `onRename` слать текущую category без изменений).
- Добавление: в phaseMode кнопка «+ Фаза» — только input имени, `createColumn({ name,
  category: 'phase', position: maxPos + 1 })`.
- Удаление: показать Trash в phaseMode — существующий диалог с приёмником работает как есть.
- Подпись категории под именем колонки в phaseMode по-прежнему не показываем.

### B6. Тесты

- unit: `PROJECT_MEMBER_ROLE_LABELS/_ORDER` полны и согласованы (3 роли);
- unit: `canManageDeliveryProject` — матрица: owner/admin → true; member-владелец → true;
  member-не-владелец → false; без userId → false;
- unit: группировка членов по ролям (хелпер, если выделен);
- unit: предикат показа прогресса (`progress_total > 0`).
e2e — на ручной прогон гейта, НЕ писать.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10 && npm run build 2>&1 | tail -5
npm run test 2>&1 | tail -5
# роли — только из констант:
grep -rnE "'Менеджер'|'Внедренец'|'Монтажник'" src --include="*.tsx" | grep -v delivery-phases
# any запрещён в новых файлах:
grep -n ": any\|as any" src/lib/hooks/use-project-members.ts src/components/projects/*.tsx | head
```

### SQL-смоуки гейта (выполняет Cowork после apply, НЕ CC)

```sql
-- 1) бэкфилл: у 4 delivery-проектов progress_total > 0 (137 задач суммарно), done = count(lane='done')
-- 2) UPDATE task lane next→done → projects.progress_done +1; done→next → −1
-- 3) DELETE задачи → total −1; INSERT задачи в phase-колонку → total +1
-- 4) UPDATE задачи БЕЗ смены lane/project_id (напр. text) → триггер не дёргается (UPDATE OF)
-- 5) повторный recalc без изменений → projects.updated_at НЕ меняется (IS DISTINCT FROM guard)
-- 6) apply_delivery_template на проекте С колонками → 'project already has columns'
-- 7) apply_delivery_template (JWT-симуляция owner) на delivery без колонок → фазы+задачи созданы
-- 8) project_members: INSERT дубля (project_id, profile_id) → unique violation
-- 9) RLS: pm_select под authenticated без membership → 0 строк (NULL org = deny)
-- 10) advisors security+performance: без новых WARN (раздельные политики, индексы на месте)
-- 11) pg_publication_tables (supabase_realtime) содержит project_columns И project_members (A4)
```

## КОММИТЫ (после ревью diff Олегом)

```bash
# 1) миграция
git add supabase/migrations/037_delivery_members_progress.sql
git commit -m "feat(delivery): P2b миграция — project_members (3 роли), прогресс X/Y триггером, apply_delivery_template RPC"
# 2) UI
git add src/ tests/
git commit -m "feat(delivery): P2b UI — команда проекта, прогресс N/M на карточках, создание фаз из шаблона, CRUD фаз"
```

## VERIFICATION

```
Type Safety:            NOT_VERIFIED (ручные типы до regen; tsc в ПРОВЕРКЕ)
RLS Coverage:           WARNING (project_members — политики в A1 по образцу 032/034,
                        раздельные INSERT/UPDATE/DELETE — урок 036b; advisors на гейте)
Backward Compatibility: PASS-план (аддитивно: новая таблица, новый триггер с UPDATE OF и
                        IS DISTINCT FROM guard'ом, новый RPC; резолвер/spawn/шаблоны не тронуты)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: ~6–9 ч CC | Риск: средний-низкий (без правок резолвера; главный риск —
прогресс-триггер на горячей таблице tasks, митигация — UPDATE OF + IS DISTINCT FROM + смоук 4/5).

---
_v2 после ревью Grok (`_analysis/review-sprint-delivery-p2b.md`): закрыты B1 (B0-хелпер
canManageDeliveryProject + prop canManageColumns), B2 (useTeamMembers/AssigneeSelect вместо
несуществующего useOrgMembers), B3 (явная инвалидация ['projects'] в мутациях задач),
W1 (ожидания/якоря в РАЗВЕДКЕ), W2 (initplan-обёртки политик), W3+ (не просто подписка —
037/A4 добавляет project_columns и project_members в публикацию supabase_realtime: находка
гейта — project_columns не был в публикации, подписка P2a была мёртвой), W4 (фильтр
добавленных), W5 (подпись «N/M задач» без слова «шаблон» — осознанно считаем все задачи
проекта), W6 (full-width секция), B6 (тест canManage), текст ошибки P0001 с kind._
