# Claude Code Prompt — Sprint 27: Стадийные гейты (Blueprint), фаза 2

## Контекст

Фаза 1 применена полностью (001–026, схема-док и скилл синхронизированы).
S27 — первая пользовательская фича: обязательные требования для перехода сделки
в стадию. Паттерн Zoho Blueprint, урезанный до v1.

**Решения Олега (зафиксированы):**
- Конфиг — таблица `stage_requirements` (org-scoped, настройка из UI owner/admin), НЕ hardcode.
- v1 проверяет два типа требований: **обязательные поля сделки** и **артефакты-файлы**.
  Активности («был звонок на стадии») — v2, не делать.

**Контракт прежний:** миграцию пишешь, НЕ применяешь; разведка живой БД через
Supabase MCP; schema.md обновляешь тем же заходом (026-паттерн: pending → флип
после гейта Cowork). Референсы скилла crm-architect теперь актуальны — сверяйся.

## РАЗВЕДКА (критична — enforcement зависит от неё)

```bash
# 1. Чем PipelineBoard реально двигает сделку: stage_id или legacy stage?
grep -rn "stage_id\|stage:" src/components/**/PipelineBoard* src/lib/hooks/use-projects.ts | head -20
# 2. PeekPanel сделки (куда встраивать чек-лист готовности)
ls src/components/ | grep -i peek; grep -rn "PeekPanel" src/app/projects/ | head -5
# 3. Toast-механизм проекта (что используется для ошибок мутаций)
grep -rn "toast\|sonner" src/ --include="*.tsx" -l | head -5
# 4. Settings-структура (куда добавлять секцию Gates)
grep -n "Section\|TeamSection" src/app/settings/page.tsx | head
```

Через Supabase MCP:
```sql
-- Триггеры на projects: имена, timing, events (порядок BEFORE-триггеров — по имени!)
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.projects'::regclass AND NOT tgisinternal;
-- Тело sync_project_stage (гейт не должен конфликтовать с синком stage↔stage_id)
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='sync_project_stage';
-- Состав стадий (для seed под ЧЗ-процесс)
SELECT ps.id, ps.name, ps.order_index, p.direction, p.entity_type
FROM pipeline_stages ps JOIN pipelines p ON p.id=ps.pipeline_id
ORDER BY p.direction, ps.order_index;
-- RLS project_files (обоснование SECURITY DEFINER в check-функции)
SELECT policyname, qual FROM pg_policies WHERE tablename='project_files';
```

## ЗАДАЧА 1: Миграция 027_stage_gates.sql

### 1.1. Таблица

```sql
CREATE TABLE IF NOT EXISTS public.stage_requirements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL,   -- FK на pipelines(id), сверь тип по живой схеме
  stage_id    uuid NOT NULL,   -- FK на pipeline_stages(id): гейт на ВХОД в эту стадию
  requirement_type text NOT NULL CHECK (requirement_type IN ('field','file')),
  config      jsonb NOT NULL,  -- field: {"column":"budget"} | file: {"min_count":1,"label":"КП"}
  error_hint  text NOT NULL,   -- человекочитаемое «что сделать» для toast/чек-листа
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_req_org_stage
  ON public.stage_requirements(org_id, stage_id) WHERE is_active;
```

RLS: SELECT — все члены org (`org_id = current_org_id()`), INSERT/UPDATE/DELETE —
org + `current_org_role() IN ('owner','admin')`. org_id задаётся явно из UI
(без trg_set_org_id — паттерн invitations).

### 1.2. check_stage_requirements() — единая проверка для триггера и UI

```sql
CREATE OR REPLACE FUNCTION public.check_stage_requirements(
  p_project_id uuid, p_target_stage_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
...
```

Требования к реализации:
- **Гард входа**: проект существует И `is_org_member(project.org_id)` — иначе
  RAISE 42501. SECURITY DEFINER обходит RLS, гард обязателен (урок convert_lead).
- **SECURITY DEFINER необходим**: RLS project_files — own (user_id); менеджер,
  двигающий сделку, не видит файлы, загруженные админом → false negative под INVOKER.
- **field-проверка: НИКАКОГО динамического SQL из jsonb.** Whitelist колонок
  жёстко в функции (CASE по config->>'column'): budget, company_id, contact_id,
  next_step, deadline, probability, direction, next_action_date. Неизвестная
  колонка = требование считается непройденным с hint «неподдерживаемая колонка».
  Это барьер против SQL-injection через конфиг гейта.
- file-проверка: `(SELECT count(*) FROM project_files WHERE project_id = p_project_id)
  >= COALESCE((config->>'min_count')::int, 1)`.
- Возврат: `jsonb` массив незакрытых требований
  `[{"type":"field","config":{...},"hint":"..."}]`; пустой массив = проход.
- Учитывать только `is_active` требования org проекта для `p_target_stage_id`.
- ACL: REVOKE PUBLIC/anon; GRANT authenticated (UI-чек-лист), service_role.

### 1.3. Enforcement-триггер

```sql
CREATE OR REPLACE FUNCTION public.aa_enforce_stage_gate() ...
```

- BEFORE UPDATE ON projects, срабатывает при `NEW.stage_id IS DISTINCT FROM OLD.stage_id`
  (+ если разведка покажет, что UI двигает legacy `stage` — добавь и это условие;
  гейт должен стоять на том пути, которым реально ходит UI).
- Имя триггера `trg_aa_enforce_stage_gate` — BEFORE-триггеры выполняются по алфавиту,
  `aa_` гарантирует срабатывание ДО sync_project_stage.
- Если check вернул непустой массив:
  `RAISE EXCEPTION 'stage_gate_failed' USING DETAIL = <jsonb::text>, ERRCODE = 'P0001';`
  — UI парсит DETAIL.
- **Без EXCEPTION-глотания** — гейт обязан блокировать (в отличие от log/notify-функций).
- ACL триггерной функции: только service_role (паттерн).

### 1.4. Seed под ЧЗ-процесс (идемпотентный, best-effort)

INSERT требований для дефолтной org, матч стадий по name из разведки; стадия
не нашлась — пропустить (NOT EXISTS). Ориентир (Олег поправит в UI):
- стадия «КП отправлено» (kp_sent-аналог): field budget + file min_count 1 («Загрузите КП»);
- стадия эксперимента: field company_id + field contact_id;
- стадия договора: file 1 («Договор») + field next_step.
Каждый — с осмысленным error_hint на русском.

## ЗАДАЧА 2: Типы + хуки

1. `database.ts`: StageRequirement (+ Tables), RequirementType.
2. `use-stage-requirements.ts`: список по pipeline (все члены), CRUD-мутации
   (owner/admin), invalidation.
3. `use-stage-gate.ts`: `useStageGate(projectId, targetStageId)` →
   `supabase.rpc('check_stage_requirements', ...)`, enabled при наличии обоих id.
4. `use-projects.ts`: в onError мутации стадии — парсинг ошибки
   `message === 'stage_gate_failed'` → details (jsonb) → структурированный
   объект для toast; rollback optimistic уже есть — не ломать.

## ЗАДАЧА 3: UI

1. **PipelineBoard**: отказ гейта → toast «Переход заблокирован» со списком
   error_hint'ов (существующий toast-механизм из разведки №3). Карточка
   возвращается на место (optimistic rollback).
2. **PeekPanel / ProjectDetail**: секция «Готовность к следующей стадии» —
   чек-лист требований следующей по order_index стадии: выполненные ✓ /
   невыполненные с hint. Данные из useStageGate.
3. **Settings → Gates** (owner/admin, рядом с TeamSection): выбор воронки →
   таблица требований по стадиям: тип, конфиг (field: select из whitelist —
   тот же список, что в SQL-функции, вынеси в константу; file: min_count + label),
   hint, is_active toggle, удалить. Форма добавления.
4. Scandi-правила: токены, Lucide, без хардкода цветов.

## ЗАДАЧА 4: docs/schema.md

stage_requirements + RLS, check_stage_requirements (SECURITY DEFINER, гард,
whitelist), trg_aa_enforce_stage_gate (порядок BEFORE-триггеров!), seed.
Header: 027 pending (флип после гейта Cowork).

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
grep -c "SECURITY DEFINER" supabase/migrations/027_stage_gates.sql   # ≥ 2
grep -c "format(\|EXECUTE " supabase/migrations/027_stage_gates.sql  # 0 в field-проверке (кроме seed DO-блока, если есть)
```

## КОММИТ

```bash
git add supabase/migrations/027_stage_gates.sql src/ docs/schema.md
git commit -m "Sprint 27: стадийные гейты — stage_requirements (org-scoped конфиг), check_stage_requirements + enforcement-триггер, чек-лист готовности в UI, Settings→Gates"
```

## Гейт (Cowork)

1. Ревью: whitelist полей (нет динамического SQL), гард 42501 в check,
   отсутствие EXCEPTION-глотания в enforcement, ACL, имя триггера (aa_ раньше sync).
2. apply_migration 027 + smoke: переход без budget → P0001 с DETAIL-списком;
   заполнить budget + файл → проход; is_active=false → гейт молчит; чужак на
   check_stage_requirements → 42501; порядок триггеров подтверждён pg_trigger.
3. Advisors повторно.
