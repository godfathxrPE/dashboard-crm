# Claude Code Prompt — Sprint: модуль «Проекты» (delivery) — P1 «Лёгкая карточка» — v2

> **v2:** учтён code-review Grok (`_analysis/review-sprint-delivery-projects-p1.md`), все блокеры сверены
> по живому коду. Добавлено: **B0 routing-контракт** (`/projects`→delivery, сделки→`/deals` — решение Олега),
> отдельный delivery-компонент канбана (`entity_type='project'`), единый `delivery-phases.ts`, internal
> отдельным списком, ownership-гард в RPC, `mapToLegacyStage`→null, `useProjects` фильтр по type, `schema.md`.
>
> Источник дизайна: `_analysis/architecture-delivery-projects.md` (D3 v2 + §8 + §9 ФИНАЛ).
> Все SQL-факты **сверены по prod** (`uoiavcabxgdjugzryrmj`, 2026-07-10). Стек неизменен: Next.js 15 +
> TS strict + Tailwind + Supabase. Ветка `feat/aura-theme` (локальная, не задеплоена).

## Что делаем (P1) / что НЕ делаем

**P1 = лёгкая карточка проекта внедрения + разведение разделов.** После выигранной сделки РП жмёт
«Создать проект внедрения» → `projects`-строка `type='delivery'`, связанная со сделкой, с состоянием
(4 phase_group), направлением, ссылкой в 1С:ДО. Раздел «Проекты» = delivery (канбан по 4 состояниям) +
internal (отдельный список). Сделки (`client`) переезжают в раздел «Сделки» на `/deals`.

**НЕ в этом заходе (P2+):** доска-план (колонки=фазы СДР), шаблоны Запуск/Эксперимент,
`project_members` (3 роли), прогресс X/Y из задач, гейт «Передача на поддержку», синк 1С:ДО.
`progress_done/total` заводим (аддитивно), считаем в P2. delivery в P1 получает дефолтную доску от
существующего триггера (не используется, P2 заменит фазовой).

**Модель (закрыта, §9):** состояние = `phase_group` на стадиях project-пайплайна; фаза = `stage_id`.
4 состояния (слаг→лейбл): `initiated`→Инициирован, `planning`→Планируется, `execution`→Исполняется,
`completed`→Завершён.

**Порядок коммитов (для ревьюабельности):** сначала **B0 (routing split)** отдельным коммитом —
проверить, что всё работает после переезда; затем миграция + delivery-фича вторым коммитом.

---

## СВЕРЕННЫЕ ФАКТЫ (использовать как есть, не перепроверять)

**БД (prod):**
- `projects.type` default `'client'`; `projects_type_chk`=`IN ('client','internal')` → +`delivery`.
- `projects_type_pipeline_chk`: `(client→pipeline+stage+direction NOT NULL) OR (internal→всё NULL)` → +3-я ветка delivery.
- `projects_status_chk`=`IN ('open','won','lost','on_hold','completed')` → **не трогаем**; delivery ограничим отдельным CHECK до `open/completed`.
- `projects.stage` — enum `deal_stage` default `'new_lead'`, nullable; `null_internal_stage` нулит только для `internal` → расширить на delivery.
- Колонок `parent_deal_id/delivery_kind/do_url/do_external_id/do_synced_at/progress_done/progress_total` нет.
- `pipeline_entity_t`=`{deal,project}` — новый enum НЕ нужен.
- `pipeline_stages`: `id, pipeline_id, name, order_index(int2), probability, phase_group(text), is_won, is_lost`.
- `phase_group` — **слаги** (`attraction/working/approval/closing` у сделок).
- Project-пайплайны: **ERP Внедрение** `a0000000-0000-4000-8000-000000000004`, **IIoT Внедрение** `a0000000-0000-4000-8000-000000000003`. Стадии **никто не референсит** (0 projects, 0 automations) → reseed безопасен. `existing_delivery=0`.
- Роль-функции `user_role()`/`is_org_admin()` в БД **НЕТ** — есть `current_org_id()` и таблица `memberships(id, org_id, profile_id, role, created_at)`; текущие роли: только `owner`.
- ⚠️ Все delivery-стадии = `is_won=false, is_lost=false` (иначе `sync_*` выставят `status='won'`, нарушит `projects_delivery_status_chk`).
- `convert_lead()` — эталон spawn (SECURITY DEFINER, `search_path public,pg_temp`, NULL-safe гард; проверяет `user_id=auth.uid()` на источнике — ownership).

**Код (`feat/aura-theme`, факты Grok — подтверждены):**
- `/projects` = «Сделки» (rename выполнен): `Sidebar.tsx:23`, `ScandiSidebar.tsx:19`, `ScandiContentHeader.tsx:16`, `CommandPalette.tsx:45,153`, `Hotkeys.tsx:11`, `section-colors.ts:7`.
- Канбан сделок хардкодит `entity_type==='deal'`: `PipelineBoard.tsx:425`, `StageBoard.tsx:319`, `ProjectModal.tsx:96`.
- `PHASE_ORDER=['attraction','working','approval','closing']` + `PHASE_LABELS` — в **6 файлах**: `PipelineBoard.tsx:56`, `StageBoard.tsx`, `ProjectCard.tsx`, `StackedPipeline.tsx`, `analytics/Charts.tsx`, `lib/utils/stage-mapping.ts`. **Не трогаем их — delivery получает СВОЙ набор.**
- `mapToLegacyStage(stage, direction)` (`lib/utils/stage-mapping.ts`): ERP/null→`null`, IIoT→ маппинг `order_index`→`deal_stage`. Вызовы drag: `PipelineBoard.tsx:530,572`, `ProjectDetail.tsx:498`. Для delivery должен давать `null` (⚠️ но триггер `null_internal_stage` и так занулит `stage` в БД — это не integrity-блокер, а optimistic-консистентность).
- `useProjects.fetchProjects` (`use-projects.ts:104`) грузит ВСЕ projects (`select *`, без фильтра type).
- Detail-роут: `src/app/(dashboard)/projects/[id]/page.tsx` → `ProjectDetail`; список `projects/page.tsx` → `ProjectsView`.

---

## РАЗВЕДКА (перед кодом — сверить точки, ОБА регистра)

```bash
# полный инвентарь /projects (nav + deep-links на client-сделки — переезжают на /deals)
grep -rnE "'/projects'|\"/projects|/projects/|\`/projects" src --include="*.ts" --include="*.tsx"
# как канбан сделок группирует phase_group + drag-путь (эталон для delivery-компонента)
grep -rnE "PHASE_ORDER|PHASE_LABELS|phase_group|handleDragEnd|moveToStageId" src/components/projects --include="*.tsx"
# spawn-кнопка: якорь на won-сделке
grep -nE "is_won|'won'|Выиграна|wonStage" src/components/projects/ProjectDetail.tsx | head
# useProjects — точки, где нужен фильтр type
grep -rn "useProjects\|activeProjects\|from('projects')" src/lib src/components src/app --include="*.ts" --include="*.tsx" | head -30
```

---

## B0 — ROUTING CONTRACT (блокер, ОТДЕЛЬНЫЙ КОММИТ)

**Целевое состояние:**
```
/deals            → «Сделки» = client (воронка сделок + таблица + detail). Бывший контент /projects.
/deals/[id]       → карточка сделки (client)
/projects         → «Проекты» = delivery (канбан 4 состояний) + internal (отдельный список/вкладка)
/projects/[id]    → карточка delivery/internal
```

**Аддитивно + redirect-бэкстопы (чтобы deep-links и старые ссылки не давали 404):**

1. **Новые роуты** `src/app/(dashboard)/deals/page.tsx` + `deals/[id]/page.tsx` — перенести туда текущий
   deals-контент (`ProjectsView` c client-воронкой / `ProjectDetail` для client). Проще: `ProjectsView`
   принимает проп `scope: 'deals' | 'projects'` и рендерит соответствующий набор.
2. **`/projects` перенацелить** на delivery+internal раздел (см. B3/B3b).
3. **Бэкстопы по типу в detail-роутах** (страховка от пропущенных call-site и старых закладок):
   - `deals/[id]/page.tsx`: если `project.type IN ('delivery','internal')` → `redirect('/projects/'+id)`.
   - `projects/[id]/page.tsx`: если `project.type='client'` → `redirect('/deals/'+id)`.
4. **Навигация → обновить (по инвентарю):**
   - `Sidebar.tsx:23`: «Сделки» `href:'/deals'`; **добавить** пункт «Проекты» `href:'/projects'` (icon свой, sectionColor).
   - `ScandiSidebar.tsx:19`: «Сделки»→`/deals`; добавить «Проекты»→`/projects` (`short:'Пр'`).
   - `ScandiContentHeader.tsx:16`: `'/deals':'Сделки'`, `'/projects':'Проекты'`.
   - `CommandPalette.tsx`: `:45` ROUTE_LABELS `/deals`+`/projects`; `:153` nav-пункт «Сделки»→`/deals` + добавить «Проекты»→`/projects`; `:185` deep-link клиентских сделок → `/deals/${id}` (delivery — свой источник, см. B7).
   - `Hotkeys.tsx:11`: `p:'/projects'` — решить: `G P`→Проекты, добавить комбо для Сделок (напр. `G D`→`/deals`). Согласовать с `settings/SettingsContent` подсказками.
   - `section-colors.ts:7`: добавить `'/deals'` (тот же цвет, что был у /projects) + оставить `'/projects'`.
   - Дашборд-плитки/виджеты на воронку СДЕЛОК → `/deals`: `dashboard-content.tsx:78` («Активных проектов»→«Активных сделок», href `/deals`), `DashboardHome.tsx:247,256,818`, `StatsWidget.tsx:77`, `QuickActions.tsx:8` («Сделка»→`/deals`).
5. **Deep-links на client-сделки → `/deals/${id}`** (эти сущности ссылаются на сделки): `calls/CallLog.tsx:211`, `tasks/TaskCard.tsx:116`, `calendar/CalendarView.tsx:150`, `leads/LeadsView.tsx:280,306`, `leads/LeadConversionModal.tsx:122`, `contacts/ContactDetail.tsx:207`, `contacts/ContactDetailHub.tsx:509`, `companies/CompanyDetail.tsx:196`, `dashboard/DashboardHome.tsx:523,668,833`, `layout/NotificationBell.tsx:17` (project_assigned — но delivery тоже шлёт это уведомление! см. ниже), `lib/hooks/use-alerts.ts:43,67`, `widgets/DeadlineRadar.tsx:48`, `lib/timeline/open-event.ts:33`, `CommandPalette.tsx:185`.
   ⚠️ Часть из них может указывать и на delivery/internal (напр. `TaskCard`, `NotificationBell`, `timeline`,
   `use-alerts` — привязка к любому projects.id). Для НИХ надёжнее направлять по типу: хелпер
   `projectHref(project)` → `type==='client' ? '/deals/'+id : '/projects/'+id`. Ввести в `lib/utils` и
   использовать во всех deep-link точках вместо хардкода. Бэкстоп (п.3) страхует остаток.
6. **`use-saved-views.ts`** — ключ маршрута хранит `/projects`; при переезде saved views сделок должны
   мигрировать на `/deals`. Либо разово переназначить route-ключ, либо оставить views на `/projects` для
   delivery, а сделкам завести заново. Зафиксировать (простейшее: сохранённые view сделок редки → переключить ключ на `/deals`).
7. **`ProjectDetail.tsx:270,304,313`** back-navigation `router.push('/projects')` → по типу проекта
   (`client`→`/deals`, delivery/internal→`/projects`). `ProjectsView.tsx:44,58,72` — привязать к своему scope.

**Проверка B0 (до delivery-фичи):** сборка зелёная; сделки открываются на `/deals` и `/deals/[id]`; старые
`/projects/[id]` клиентских сделок редиректят на `/deals/[id]`; sidebar показывает «Сделки»(/deals) и
«Проекты»(/projects); дашборд-плитки ведут на `/deals`. Коммит B0 отдельно.

---

## ЧАСТЬ A — Миграция `035_delivery_projects.sql` (ТОЛЬКО файл, НЕ применять)

> Контракт гейта: пишешь файл в `supabase/migrations/`, **не применяешь**. Применяет гейт (Cowork)
> через `apply_migration`+смоуки+`get_advisors` после ревью Олега. Прод-миграции без подтверждения — запрещены.

```sql
-- === 035_delivery_projects.sql ===

-- 1) Тип delivery
ALTER TABLE public.projects DROP CONSTRAINT projects_type_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_chk CHECK (type IN ('client','internal','delivery'));

-- 2) Новые поля (аддитивно)
ALTER TABLE public.projects
  ADD COLUMN parent_deal_id  uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  ADD COLUMN delivery_kind   text CHECK (delivery_kind IN ('launch','experiment')),
  ADD COLUMN do_url          text,
  ADD COLUMN do_external_id  text,
  ADD COLUMN do_synced_at    timestamptz,
  ADD COLUMN progress_done   int NOT NULL DEFAULT 0,
  ADD COLUMN progress_total  int NOT NULL DEFAULT 0;

-- 3) Инвариант type↔pipeline: 3-я ветка delivery
ALTER TABLE public.projects DROP CONSTRAINT projects_type_pipeline_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_pipeline_chk CHECK (
     (type='client'   AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL)
  OR (type='internal' AND pipeline_id IS NULL     AND stage_id IS NULL)
  OR (type='delivery' AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL
        AND parent_deal_id IS NOT NULL AND delivery_kind IS NOT NULL)
);

-- 4) Статус delivery: только open/completed
ALTER TABLE public.projects ADD CONSTRAINT projects_delivery_status_chk CHECK (
  type <> 'delivery' OR status IN ('open','completed')
);

-- 5) Индекс parent_deal_id
CREATE INDEX IF NOT EXISTS idx_projects_parent_deal_id ON public.projects(parent_deal_id)
  WHERE parent_deal_id IS NOT NULL;

-- 6) null_internal_stage: нулить legacy stage и для delivery
CREATE OR REPLACE FUNCTION public.null_internal_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NEW.type IN ('internal','delivery') THEN NEW.stage := NULL; END IF;
  RETURN NEW;
END $$;

-- 7) Reseed project-пайплайнов под §9 ФИНАЛ. ВСЕ is_won=false,is_lost=false. phase_group=слаги.
DELETE FROM public.pipeline_stages
  WHERE pipeline_id IN ('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000003');

INSERT INTO public.pipeline_stages (pipeline_id, name, order_index, phase_group, is_won, is_lost) VALUES
  ('a0000000-0000-4000-8000-000000000004','Инициация',      1,'initiated', false,false),
  ('a0000000-0000-4000-8000-000000000004','Планирование',   2,'planning',  false,false),
  ('a0000000-0000-4000-8000-000000000004','Обследование',   3,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Моделирование',  4,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Проектирование', 5,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Разработка',     6,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Внедрение',      7,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Эксплуатация',   8,'completed', false,false);

INSERT INTO public.pipeline_stages (pipeline_id, name, order_index, phase_group, is_won, is_lost) VALUES
  ('a0000000-0000-4000-8000-000000000003','Инициация',              1,'initiated', false,false),
  ('a0000000-0000-4000-8000-000000000003','Подготовительный этап',  2,'planning',  false,false),
  ('a0000000-0000-4000-8000-000000000003','Установка БИТ.MDT',      3,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Подготовка оборудования',4,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Запуск',                 5,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Регулярные мероприятия', 6,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Передача на поддержку',  7,'completed', false,false);

-- 8) RPC spawn_delivery_project — эталон convert_lead + OWNERSHIP-гард (правка ревью Grok)
CREATE OR REPLACE FUNCTION public.spawn_delivery_project(p_deal_id uuid, p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_deal        record;
  v_privileged  boolean;
  v_pipeline_id uuid;
  v_first_stage uuid;
  v_new_id      uuid;
BEGIN
  IF p_kind NOT IN ('launch','experiment') THEN
    RAISE EXCEPTION 'invalid delivery_kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_deal FROM public.projects
   WHERE id = p_deal_id AND org_id = public.current_org_id() AND public.current_org_id() IS NOT NULL;
  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'deal not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_deal.type <> 'client' OR v_deal.status <> 'won' THEN
    RAISE EXCEPTION 'delivery can be spawned only from a won client deal' USING ERRCODE = 'P0001';
  END IF;

  -- Ownership: владелец/создатель сделки, либо привилегированная роль org (RBAC-матрица архитектуры).
  SELECT EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.profile_id = auth.uid() AND m.org_id = v_deal.org_id AND m.role IN ('owner','admin')
  ) INTO v_privileged;
  IF NOT (v_deal.owner_id = auth.uid() OR v_deal.created_by = auth.uid() OR v_privileged) THEN
    RAISE EXCEPTION 'only deal owner or org admin can spawn delivery' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_pipeline_id FROM public.pipelines
   WHERE entity_type='project' AND direction=v_deal.direction AND is_default=true LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'no project pipeline for direction %', v_deal.direction USING ERRCODE='P0001';
  END IF;
  SELECT id INTO v_first_stage FROM public.pipeline_stages
   WHERE pipeline_id=v_pipeline_id ORDER BY order_index LIMIT 1;

  INSERT INTO public.projects (
    org_id, owner_id, created_by, name, type, direction,
    pipeline_id, stage_id, stage, status, company_id, contact_id, parent_deal_id, delivery_kind
  ) VALUES (
    v_deal.org_id, COALESCE(v_deal.owner_id, auth.uid()), auth.uid(),
    v_deal.name || ' — внедрение', 'delivery', v_deal.direction,
    v_pipeline_id, v_first_stage, NULL, 'open',
    v_deal.company_id, v_deal.contact_id, p_deal_id, p_kind
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.spawn_delivery_project(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.spawn_delivery_project(uuid, text) TO authenticated;
```

**Заметки:** `seed_project_columns` в P1 НЕ трогаем (дефолтная доска — ок; type-aware guard в P2).
`progress_done/total` не считаем (P2). `status='completed'` ставит приложение по «Завершить проект».
После применения гейтом: `generate_typescript_types` → `src/types/database.ts` **и обновить `docs/schema.md`**
(чеклист crm-architect: новые поля projects, project-пайплайны, RPC `spawn_delivery_project`).

---

## ЧАСТЬ B — Frontend

### B1. Типы / валидаторы
`database.ts` regen → `type` union `'client'|'internal'|'delivery'`. Ручные union-дубли (если есть) +`delivery`.
`lib/validators/project.ts` — ветка `delivery` (parent_deal_id, delivery_kind, do_url). `any` запрещён.

### B2. Единый источник delivery-фаз — `src/lib/constants/delivery-phases.ts`
Не размазывать по 6 файлам. Один модуль:
```ts
export const DELIVERY_PHASE_ORDER = ['initiated','planning','execution','completed'] as const;
export const DELIVERY_PHASE_LABELS: Record<string,string> = {
  initiated:'Инициирован', planning:'Планируется', execution:'Исполняется', completed:'Завершён',
};
export const DELIVERY_PHASE_COLOR: Record<string,string> = { /* var(--…) по образцу PipelineBoard */ };
```
Deal-константы (`attraction/…` в 6 файлах) **не трогаем** — слаги не пересекаются, delivery живёт на своих.

### B3. Delivery-канбан — ОТДЕЛЬНЫЙ компонент `DeliveryPipelineBoard.tsx`
Не ветвить перегруженный `PipelineBoard` (он хардкодит `entity_type='deal'`, `:425`). Новый компонент:
- пайплайн по `direction` + `entity_type='project'`;
- колонки по `DELIVERY_PHASE_ORDER` (4), лейблы/цвета из `delivery-phases.ts`;
- drag между колонками → `moveToStageId(project.id, targetStage.id, /* stage: */ null, …)` — **для delivery всегда `null`**, `mapToLegacyStage` не звать (триггер занулит `stage` в БД, но payload должен быть консистентным);
- клик карточки → `/projects/${id}`.

### B3b. Internal — отдельный список во вкладке раздела «Проекты»
`internal` нет `stage_id` → в phase_group-канбан не попадёт. Раздел «Проекты» = табы **«Внедрение»**
(delivery-канбан) + **«Внутренние»** (`ProjectsTable`, отфильтрованная `type='internal'`). Убрать бейдж
«Внутренний» из раздела «Сделки» (internal там больше не показывается — см. B7 фильтры).

### B4. Кнопка «Создать проект внедрения» на won-сделке
Якорь: `ProjectDetail.tsx` рядом с бейджем won (РАЗВЕДКА — ~`:394`, подтвердить). Показывать при
`project.type==='client' && project.status==='won'`. Диалог выбора `kind` (Полный запуск `launch` /
Эксперимент `experiment`):
```ts
const { data, error } = await supabase.rpc('spawn_delivery_project', { p_deal_id: dealId, p_kind: kind });
// success: queryClient.invalidateQueries({ queryKey: ['projects'] }); router.push(`/projects/${data}`);
```
Ошибки: `42501`(доступ), `P0001`(не won / нет пайплайна) → тост. 1 сделка → 1..N проектов (кнопка не блокируется).

### B5. Карточка delivery (лёгкая)
`ProjectDetail` — ветка `type==='delivery'`: имя, parent-сделка (ссылка `/deals/${parent_deal_id}`),
направление, состояние (лейбл из `DELIVERY_PHASE_LABELS[stage.phase_group]`), текущая фаза (`stage.name`),
`delivery_kind`, поле `do_url` (редактируемое). Скрыть deal-специфику (бюджет/воронка сделки/won-lost кнопки).
Фаза-грид: `StackedPipeline` с `pipelineId={project.pipeline_id}` (project-пайплайн, 7–8 фаз) и лейблами
delivery — либо отдельный лёгкий грид, если `StackedPipeline` завязан на deal-константы. `progress` в P1 — «—».
Действие «Завершить проект» → `update projects set status='completed'` (delivery, RLS покрывает).

### B6. `mapToLegacyStage` → null для delivery (правка ревью)
Во всех move-путях delivery передавать `stage: null` (не звать `mapToLegacyStage`). DB-триггер
`null_internal_stage` (расширен) — бэкстоп; правка нужна для optimistic-консистентности UI.

### B7. `useProjects` — фильтр по type (правка ревью)
`fetchProjects` грузит все projects без фильтра (`use-projects.ts:104`) → счётчики/Cmd+K/дашборд потянут
лишнее после split. Ввести разделение: `useDeals()` (`type='client'`) и `useDeliveryProjects()`
(`type IN ('delivery','internal')`) ИЛИ параметр `type` в query-key. Явные колонки вместо `select *`
(QUERY STRATEGY), пагинация. Обновить потребителей: Cmd+K (сделки→`/deals`, delivery→`/projects`),
дашборд-счётчики, аналитика.

### B8. Edge cases
Empty/loading/error во всех новых списках/канбане. delivery без do_url — не ломается. RLS: member видит
свои + где owner (наследуется `projects`, новых политик не надо).

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -30
rm -rf .next && npm run build 2>&1 | tail -12
# остатки хардкода состояний вне constants:
grep -rnE "'Инициирован'|'Планируется'|'Исполняется'|'Завершён'" src --include="*.tsx" | grep -vE "delivery-phases|LABEL|Record"
# остатки /projects, ведущих на клиентские сделки (должны быть /deals или projectHref):
grep -rnE "/projects/\\$\{|'/projects'" src --include="*.tsx" | grep -viE "delivery|projectHref"
```

Ручные сценарии:
1. **B0:** сделки на `/deals` + `/deals/[id]`; старый `/projects/[id]` клиентской сделки → редирект на `/deals/[id]`; sidebar «Сделки»(/deals)+«Проекты»(/projects); дашборд-плитки → `/deals`.
2. Won-сделка → «Создать проект внедрения» → «Эксперимент» → проект `type='delivery'`, состояние «Инициирован», привязан к сделке; редирект на `/projects/[id]`.
3. Раздел «Проекты»: вкладка «Внедрение» — delivery-канбан 4 состояний; вкладка «Внутренние» — список internal. Сделок (client) тут нет.
4. Канбан: drag Инициирован→Планируется→Исполняется→Завершён — состояние меняется, `stage_id`=первая стадия группы, `stage` в БД остаётся NULL.
5. Карточка delivery: parent-сделка кликабельна (→`/deals/[id]`), do_url сохраняется, «Завершить проект»→`completed`.
6. spawn на НЕ-won сделке → P0001; spawn НЕ-владельцем/не-admin → 42501.
7. Регресс: сделки и воронка (`/deals`), PCT-1 доска, Cmd+K (обе секции), дашборд-счётчики без утечек типов.
8. RLS-смоук (гейт): spawn под чужим org → 42501; member видит только свои delivery.

---

## VERIFICATION

```
Type Safety:            NOT_VERIFIED (типы regen после миграции; union +delivery, валидаторы — на реализации)
RLS Coverage:           WARNING (delivery наследует политики projects; RPC SECURITY DEFINER + NULL-safe org-гард + ownership по memberships)
Backward Compatibility: WARNING (миграция аддитивна; НО B0 меняет роутинг — client-deep-links переезжают на /deals + redirect-бэкстопы по типу; project-пайплайны никто не референсит — 0 строк, проверено; ветка локальная, не задеплоена)
Runtime Tested:         NOT_VERIFIED (миграцию применяет гейт; 8 сценариев)
Regional Availability:  NOT_APPLICABLE (1С:ДО внутренняя; синк P4)
```

Трудоёмкость: **~1.5–2 спринта** (B0 routing split ощутимо добавил объём — Grok прав, что первая оценка
была занижена). Риск средний-высокий на B0 (много nav-точек), низкий-средний на миграции. B0 — отдельным
коммитом, проверить до delivery-фичи.

## КОММИТЫ (после ревью diff Олегом)
```bash
# 1) routing split
git add src/ && git commit -m "refactor(nav): сделки → /deals, /projects освобождён под delivery-«Проекты» (redirect-бэкстопы по типу)"
# 2) delivery-фича
git add supabase/migrations/035_delivery_projects.sql src/ docs/schema.md
git commit -m "feat(delivery): P1 модуль «Проекты» внедрения — type=delivery, spawn из won-сделки, 4-состояние (phase_group), канбан+internal-список, ссылка в 1С:ДО"
```

---

### P2 (следующий заход)
delivery-доска (колонки=фазы СДР, статус задачи=badge) + `seed_project_columns` type-aware guard;
шаблоны Запуск/Эксперимент (источники: презентация «Технология реализации проекта 1С v2.2» — ERP 6 этапов;
СДР 1С:ДО — IIoT); `project_members` (3 роли); прогресс X/Y из задач.
