# Claude Code Prompt — Sprint: Депрекейт legacy `stage` (источник истины → `stage_id`)

Контекст: dashboard-crm. У `projects` две колонки стадии: `stage` (legacy text enum `deal_stage`) и `stage_id` (FK → pipeline_stages). Аудит 2026-06-14 нашёл рассинхрон между ними.

**Данные на проде УЖЕ выровнены** (миграция `backfill_legacy_stage_from_stage_id`, 14.06): `stage` приведён в соответствие с `mapToLegacyStage(stage_id, direction)` для всех 6 проектов, 0 drift. Эта задача — про КОД, чтобы рассинхрон не вернулся и чтобы убрать legacy-зависимость.

НЕ трогай: Aura-контраст в globals.css, уже закоммиченные фиксы.

---

## Суть проблемы

`stage_id` (→ pipeline_stages) — **первичный** источник (канбан PipelineBoard, ProjectCard, ProjectDetail ERP-путь читают его). `stage` — **производное зеркало**, которое каждый write-путь пересчитывает через `mapToLegacyStage()` из `stage_id`. Зеркало нужно legacy IIoT-UI, который ещё работает на text-enum `STAGE_CONFIG.order`:
- `StackedPipeline.tsx` — порядок стадий по `STAGE_CONFIG[].order`
- `ProjectDetail.tsx` — кнопки next/prev стадии (getNextStage/getPrevStage по enum)
- `dashboard-content.tsx:32`, `CallModal.tsx:162`, `ActivityDrawer.tsx:280` — фильтр `stage !== 'won'/'lost'`

**Найденный баг в самом маппинге** (`lib/utils/stage-mapping.ts`): `IIOT_STAGE_MAP` мапит `order_index → enum`. Но pipeline_stages переименованы/переупорядочены, и для стадий после точки расхождения маппинг семантически неверен:
- order_index 10 = «Договор» (по смыслу contract_review), а map отдаёт `contract_signing` (order 10 в старом enum).
- ОМК: stage_id «Материалы» (order 3) → map `waiting_materials`, но в БД лежал `trilateral_meeting` (order 7).

То есть `order_index` старого enum ≠ `order_index` текущих pipeline_stages. Зеркало воспроизводит этот сдвиг.

---

## РАЗВЕДКА (выполни первой)

```bash
# 1. Все чтения legacy stage (исключая stage_id, *_stage tracks)
grep -rnE "\.stage\b|'stage'|\"stage\"|getPhaseForStage|STAGE_CONFIG|getNextStage|getPrevStage" src \
  --include="*.ts" --include="*.tsx" | grep -vE "stage_id|preparation_stage|experiment_stage|project_stage|stage_changed"

# 2. Маппинг и его использование
cat src/lib/utils/stage-mapping.ts
grep -rn "mapToLegacyStage\|IIOT_STAGE_MAP" src --include="*.ts" --include="*.tsx"

# 3. Что реально в pipeline_stages (через Supabase MCP execute_sql):
#    select order_index, name, phase_group, is_won, is_lost from pipeline_stages
#    where pipeline_id = (select pipeline_id from projects where direction='iiot' limit 1)
#    order by order_index;
#    → сверь order_index ↔ name ↔ phase_group с IIOT_STAGE_MAP

# 4. Где аналитика читает фазу
sed -n '156,217p' src/components/analytics/Charts.tsx   # PipelineChart: getPhaseForStage(p.stage)
grep -rn "phase_group\|getPhaseForStage" src --include="*.ts" --include="*.tsx"
```

---

## РЕШЕНИЕ (выбери на основе разведки)

Два пути, по возрастанию объёма. Прими решение и обоснуй в ответе ПЕРЕД кодом.

### Путь A — минимальный (рекомендую для первого захода)
Не выпиливать `stage`, но устранить источник расхождения и убрать зеркало из аналитики.

1. **Аналитику перевести на `phase_group`**, а не на `stage`. В `Charts.tsx` `PipelineChart` (стр. ~156): вместо `getPhaseForStage(p.stage)` группируй по `pipeline_stages.phase_group` через `stage_id`. Маппинг `phase_group → label` (attraction→Привлечение, …) возьми из pipeline_stages напрямую. Это убирает зависимость графика от legacy enum (и от бага маппинга).
2. **Фильтры `won/lost`** (dashboard-content, CallModal, ActivityDrawer) переведи на `pipeline_stages.is_won/is_lost` через `stage_id`, а не строковое сравнение `stage`.
3. `mapToLegacyStage` оставь (legacy IIoT-UI на нём держится), но добавь к нему юнит-тест, фиксирующий текущее поведение, и комментарий-предупреждение про сдвиг order_index.

### Путь B — полный (отдельный, более рискованный заход)
Выпилить `stage` полностью: перевести StackedPipeline и next/prev-навигацию ProjectDetail на `pipeline_stages.order_index`, убрать `STAGE_CONFIG`/`mapToLegacyStage`/`IIOT_STAGE_MAP`, затем `ALTER TABLE projects DROP COLUMN stage`. Большой объём — НЕ делай в одном спринте с A.

---

## ЗАДАЧИ (для Пути A)

### ЗАДАЧА 1: Аналитика на phase_group
`src/components/analytics/Charts.tsx`, `PipelineChart`. Группировку проектов по фазам считать из `stage_id → pipeline_stages.phase_group`, не из `getPhaseForStage(p.stage)`. Лейблы фаз — из pipeline_stages. Проверь, что `CallsChart` legacy-stage не использует.

### ЗАДАЧА 2: Фильтры won/lost на is_won/is_lost
- `app/(dashboard)/dashboard-content.tsx:32` — запрос «активные проекты»: вместо `.neq('stage','lost').neq('stage','won')` фильтруй по `stage_id` через стадии где `is_won=false and is_lost=false` (или джойни pipeline_stages). Если проще — оставь как есть, но учти что это legacy.
- `CallModal.tsx:162`, `ActivityDrawer.tsx:280` — то же.

### ЗАДАЧА 3: Тест + предупреждение для mapToLegacyStage
- `tests/unit/` — новый тест, фиксирующий `mapToLegacyStage(order_index, direction)` для всех order_index 1-13 и ERP→null.
- В `stage-mapping.ts` — комментарий: «⚠️ order_index в IIOT_STAGE_MAP — это порядок СТАРОГО enum, не текущих pipeline_stages. При расхождении зеркало `stage` будет семантически смещено. TODO: депрекейт через Путь B».

### Проверка
```bash
npx tsc --noEmit          # 0 ошибок
npm run test              # unit зелёные, включая новый тест
npm run dev
# /analytics: «Проекты по фазам» — распределение совпадает с канбаном /projects
# (ОМК должен быть в Привлечение, т.к. stage_id='Материалы')
```

---

## КОММИТ
```bash
npx tsc --noEmit && npm run test && npm run build
git add .
git commit -m "refactor: аналитика и фильтры на stage_id/phase_group, депрекейт legacy stage (Путь A)"
```
Покажи diff кратко перед коммитом.

---

## Контекст данных (на момент 14.06, после backfill)
6 проектов, все iiot, 0 drift между stage и stage_id:
- ОМК → «Материалы» (oi=3, attraction) / stage=waiting_materials
- Завод Атлант → «Встреча 3х» (oi=7, approval) / stage=trilateral_meeting
- Аграрная → «Договор» (oi=10, closing) / stage=contract_signing
- 3× lost → «Проиграна» (oi=13)
