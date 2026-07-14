# Claude Code Prompt — Sprint delivery-P3: гейт завершения «Передача на поддержку»
# v2 — правки по review/REVIEW-sprint-delivery-p3.md (Grok 8.5/10, все 4 блокера
# верифицированы Cowork по живому коду и приняты)

## Контекст

P1/P2a/P2b на проде (миграции 035–037 применены). Прод-БД: uoiavcabxgdjugzryrmj.
Ветка: main. Роль Cowork: гейт — миграцию ПИШЕШЬ, НЕ применяешь (применит Cowork
через Supabase MCP + смоуки + advisors). schema.md обновляешь тем же заходом
(pending → флип после гейта).

**Решения Олега (зафиксированы 2026-07-12, не пересматривать):**
- Гейт «Завершить проект» (status open→completed, только type='delivery') блокируется,
  пока ВСЕ is_milestone-задачи проекта не в lane='done'. Шаблон-агностично: у ERP
  приёмки размазаны по фазам (1.8/2.7/3.6/4.7/5.7/6.4 — 6 вех), у IIoT launch —
  чек-лист «Передачи на поддержку» (4.2/4.3/4.5 — 3 вехи), у IIoT experiment вех НЕТ
  (завершается свободно). НЕ привязываться к имени фазы.
- Enforcement двухуровневый (S27-паттерн): check-функция для UI-чеклиста + BEFORE-триггер
  как backstop (прямой UPDATE через API тоже блокируется).
- Проект без milestone-задач завершается свободно (ready=true). Reopen
  (completed→open) НЕ блокируется (UI reopen сейчас нет — бейдж «Завершён»).

**Ключевые факты разведки (верифицированы):**
- `copy_delivery_template` (036:218–226) теряет `is_milestone` — в `tasks` нет колонки,
  флаг живёт только в `delivery_template_tasks` (database.ts:579). P3 начинается с
  переноса флага + бэкфилла.
- На проде один живой delivery-проект «ОМК — внедрение» (launch/IIoT, 17 задач) —
  после бэкфилла ровно **3 milestone** (4.2/4.3/4.5).
- Финал-флоу: ProjectDetail.tsx:472–483 — `confirm()` + `updateProject.mutate({status:'completed'})`.
- S27-образец: `check_stage_requirements` + триггер (027), UI: `useStageGate`/`StageReadiness`,
  парсер `parseStageGateError` (use-projects.ts:20–29), баннер `gateBlock` (ProjectDetail:710).
- **Модалки колокированы с фичами** (TaskModal.tsx, MeetingModal.tsx…) — папки
  `src/components/modals/` НЕ существует. Toast-библиотеки в проекте НЕТ.
- `task_lane` enum: next / now / wait / done (фазовый цикл TaskCard: next→now→done).

## РАЗВЕДКА (обязательно, до кода)

```bash
# 1. Финал-флоу и gateBlock-баннер S27 (образец backstop-UI)
grep -n -B2 -A12 "Завершить проект" src/components/projects/ProjectDetail.tsx
sed -n '705,735p' src/components/projects/ProjectDetail.tsx
# 2. parseStageGateError + updateProject (error-контракт, куда добавлять parseDeliveryGateError)
sed -n '15,40p' src/lib/hooks/use-projects.ts
grep -n -B3 -A20 "updateProject" src/lib/hooks/use-projects.ts | head -50
# 3. Инвалидация в useUpdateTask (точка подключения delivery-gate)
grep -n -A15 "onSettled" src/lib/hooks/use-tasks.ts | head -25
# 4. Образец модалки (колокация!) и existing useStageGate
head -60 src/components/tasks/TaskModal.tsx
head -40 src/lib/hooks/use-stage-gate.ts
# 5. TaskCard: phaseMode-рендер (куда ромб)
sed -n '95,130p' src/components/tasks/TaskCard.tsx
# 6. database.ts: блок tasks (рукописный! дополняем вручную, НЕ regen)
grep -n -A35 "tasks: {" src/types/database.ts | head -45
```

Через Supabase MCP (или попроси Cowork):
```sql
-- Триггеры на projects: имена/timing — порядок BEFORE по имени! Гейт trg_zz_* должен
-- идти ПОСЛЕДНИМ (после trg_aa_enforce_stage_gate и sync_*) и видеть финальные NEW.
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.projects'::regclass AND NOT tgisinternal ORDER BY tgname;
-- Образец S27: тело check_stage_requirements (org-гард, error-контракт)
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='check_stage_requirements';
```

## ЗАДАЧА 1: Миграция supabase/migrations/038_delivery_completion_gate.sql

НЕ применять. Всё IF NOT EXISTS / OR REPLACE, аддитивно.

### 1.1. Колонка + индекс

```sql
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON public.tasks(project_id) WHERE is_milestone;
```

### 1.2. Патч copy_delivery_template — переносить флаг

В INSERT INTO public.tasks добавить колонку `is_milestone` и в SELECT — `tt.is_milestone`.
Остальное тело функции НЕ менять (lane='next' явный, wbs-префикс в text — сохранить).

### 1.3. Бэкфилл существующих delivery-задач (с org-фильтром — правка ревью §4)

```sql
UPDATE public.tasks t SET is_milestone = true
FROM public.projects p, public.project_columns pc, public.delivery_template_tasks tt
WHERE t.project_id = p.id AND p.type = 'delivery'
  AND pc.id = t.column_id AND pc.category = 'phase'
  AND tt.is_milestone
  AND tt.org_id = p.org_id              -- без этого возможен кросс-org ложный матч
  AND t.text = COALESCE(tt.wbs_code || '. ', '') || tt.title
  AND NOT t.is_milestone;
```

Переименованные пользователем задачи бэкфилл пропустит — осознанно (контроль на ОМК: 3).

### 1.4. check_delivery_completion(p_project_id uuid) RETURNS jsonb

SECURITY DEFINER, SET search_path = public, pg_temp. Возвращает:

```json
{ "ready": true|false,
  "open_milestones": [ { "id": "...", "text": "4.2. …", "phase": "Передача на поддержку", "lane": "next" } ] }
```

- open = is_milestone AND lane <> 'done'; phase = имя project_columns (LEFT JOIN — column_id nullable).
- **Org-гард — зеркалировать S27 (027:105–114), правка ревью §5:**
  проект не найден / не delivery → RAISE 42501-стиль как в S27;
  `IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_project.org_id) THEN RAISE ... USING ERRCODE='42501'`.
  Service-контекст (auth.uid() IS NULL) гард пропускает — нужен триггеру/бэкфиллу.
  НЕ current_org_id() — membership по org проекта (edge: пользователь в двух org).
- Гранты (симметрия 027:170, правка ревью §6):
  `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role;`
  (Урок P1: REVOKE FROM public НЕ снимает default-грант anon — явный REVOKE anon обязателен.)

### 1.5. Триггер-backstop — error-контракт как S27 (правка ревью §3)

```sql
CREATE OR REPLACE FUNCTION public.enforce_delivery_completion() RETURNS trigger ...
-- если NEW.type='delivery' AND OLD.status='open' AND NEW.status='completed'
-- и есть открытые вехи →
-- RAISE EXCEPTION 'delivery_gate_failed'
--   USING DETAIL = v_open_milestones::text;  -- jsonb-массив, тот же shape что RPC
CREATE TRIGGER trg_zz_delivery_completion_gate BEFORE UPDATE OF status ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_completion();
```

- message СТРОГО 'delivery_gate_failed' (симметрия 'stage_gate_failed' — единый парсинг в UI).
- Имя `trg_zz_*` — BEFORE по алфавиту, гейт после trg_aa_enforce_stage_gate и sync_* (сверь
  по разведке pg_trigger; не конфликтует: S27 реагирует на stage_id, P3 — на status).
- Функция одна и только для projects (урок: никаких generic-триггеров).
- В теле НЕ трогать NEW — только проверка/RAISE. Внутри можно переиспользовать ту же выборку,
  что в check_delivery_completion (или вызвать её — auth.uid() NULL в триггерном контексте
  service-операций гард пропустит).

### 1.6. schema.md

Обновить docs/schema.md: tasks.is_milestone, функции, триггер — по образцу секции P2b.
Пометить `Pending 038` (флип на Applied сделает Cowork после гейта).

## ЗАДАЧА 2: Типы (src/types/database.ts — вручную)

tasks Row/Insert/Update: `is_milestone: boolean` (Insert/Update — optional).
Тип ответа RPC + элемент вехи: рядом с хуком (src/lib/hooks/use-delivery-gate.ts):
`interface OpenMilestone { id: string; text: string; phase: string | null; lane: string }`,
`interface DeliveryGateResult { ready: boolean; open_milestones: OpenMilestone[] }`.
Никаких any; ответ RPC парсить как unknown → narrowing (образец useStageGate).

## ЗАДАЧА 3: Хук useDeliveryGate + инвалидация (правка ревью §2)

`src/lib/hooks/use-delivery-gate.ts` (образец: use-stage-gate.ts):
- useQuery(['delivery-gate', projectId]) → supabase.rpc('check_delivery_completion',
  { p_project_id: projectId }), enabled: isDelivery && status==='open'.
- **Явная инвалидация**: в `use-tasks.ts` → `useUpdateTask` → onSettled, в существующей
  ветке `if (vars.lane !== undefined || ...)` (строка ~266) добавить:
  `queryClient.invalidateQueries({ queryKey: ['delivery-gate'] });`
  Иначе чеклист в модалке устареет после закрытия вехи на доске. НЕ refetchOnMount.

## ЗАДАЧА 4: UI завершения (ProjectDetail, колокация — правка ревью §1)

Модалку держать рядом с фичей: inline-блок в `ProjectDetail.tsx` ЛИБО отдельный
`src/components/projects/DeliveryCompletionModal.tsx` (НЕ в components/modals/ — папки нет).
Образец разметки/паттерна [data-modal] — TaskModal.tsx.

- Заменить confirm() (:476) на модалку «Завершение проекта»:
  ready=true → «Все вехи закрыты» + кнопка «Завершить» (green);
  ready=false → список open_milestones (phase · text · lane-бейдж), кнопка disabled
  + подпись «Закройте вехи, чтобы завершить проект».
- **parseDeliveryGateError** в use-projects.ts рядом с parseStageGateError (тот же
  шаблон: message==='delivery_gate_failed' → JSON.parse(details) → OpenMilestone[]).
- Backstop-сценарий (веха переоткрыта между чеклистом и кликом):
  `updateProject.mutate({...}, { onError })` — правка ревью §9; ошибку показывать
  **alert-баннером внутри модалки** (role="alert", образец gateBlock :710–734). НЕ toast —
  toast-библиотеки в проекте нет.
- A11y: [data-modal]-паттерн (непрозрачность тёмных тем решена глобально), фокус-трап
  как в TaskModal, фокус-стейты кнопок.

## ЗАДАЧА 5: Milestone-бейдж (TaskCard.tsx — правка ревью §7)

Файл `src/components/tasks/TaskCard.tsx` (НЕ ProjectBoard — тот только контейнер).
Условие `phaseMode && task.is_milestone`: глиф Lucide `Diamond` слева от `{task.text}`
(район :118–125), цвет var(--accent), size по соседним иконкам, `title="Веха (milestone)"`.
Форма+цвет, не только цвет (CVD-урок аудита). Никаких emoji.
`useProjectBoard` тянет `*` — is_milestone придёт сам; тип Task подтянется из database.ts.

## Тест-сценарии (прогонит Cowork после apply)

1. RPC от authenticated члена org → jsonb; от anon → permission denied.
2. ОМК (IIoT launch): после бэкфилла ровно 3 is_milestone; check → ready=false, 3 open_milestones.
3. Перевести 3 вехи в done → ready=true → «Завершить проект» проходит, status=completed.
4. Прямой UPDATE projects SET status='completed' (SQL, открытая веха) → EXCEPTION
   delivery_gate_failed + DETAIL-массив.
5. Спавн IIoT experiment → 0 вех → завершается свободно.
6. **ERP launch: 6 вех по фазам 1–6** (правка ревью §10) — спавн с ERP-шаблона, проверить
   бэкфилл-копирование и блокировку до закрытия всех 6.
7. Reopen completed→open → без блокировки. Internal/client проекты триггер не трогает.
8. Веха переоткрыта в другой вкладке → клик «Завершить» → alert-баннер в модалке (parse DETAIL).
9. tsc/build зелёные; regression: won/lost флоу сделок и S27-гейт стадий не затронуты.

## КОММИТЫ — два, как P2b (правка ревью §11)

```
# 1) SQL + типы + schema.md
git add supabase/migrations/038_delivery_completion_gate.sql docs/schema.md src/types/database.ts
git commit -m "feat(delivery): P3 гейт завершения — is_milestone в tasks, check_delivery_completion, триггер-backstop (038, pending)"
# 2) UI
git add src/lib/hooks/ src/components/
git commit -m "feat(delivery): P3 UI — чеклист-модалка завершения, parseDeliveryGateError, milestone-ромб в TaskCard"
```

## VERIFICATION (ожидаемое состояние ответа CC)

```
Type Safety:            WARNING (ручной database.ts; unknown+narrowing для RPC)
RLS Coverage:           WARNING (SECURITY DEFINER + is_org_member-гард по S27; advisors на гейте)
Backward Compatibility: PASS-план (аддитивно; confirm()→модалка — единственная замена UX)
Runtime Tested:         NOT_VERIFIED (до применения миграции Cowork)
Regional Availability:  NOT_APPLICABLE
```
