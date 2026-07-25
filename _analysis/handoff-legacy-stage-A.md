# Claude Code — S-LEGACY-STAGE-1 · Фаза A: легаси-читатели `projects.stage` → `stage_id`

**Контекст:** `projects.stage` (enum `deal_stage`) — легаси-зеркало; источник истины — `stage_id`→`pipeline_stages`.
Автор кода назвал это «Путь B» (`lib/utils/stage-mapping.ts`), и там же предупреждение: зеркало `stage` **семантически разъехалось**
с `stage_id` (order_index 9 = «Защита КП», а map отдаёт `contract_review`) → легаси-читатели местами показывают неверную стадию.
**Фаза A — клиентская, обратимая:** переключить всех ЧИТАТЕЛЕЙ `project.stage` на `stage_id`. Легаси-ЗАПИСИ пока НЕ трогаем
(ProjectModal / win-lost-sync / `mapToLegacyStage` — safe-интервал, Migration Safety Protocol: сначала reads, потом writes/drop).
**БД не трогаем. Read-only по схеме.** Коммить по подзадачам A1→A4.

## Инфраструктура (уже есть — переиспользуем, не изобретаем)
- `usePipelineStages()` / `useStagesForPipeline(pipelineId)` (`lib/hooks/use-pipelines.ts`) — стадии из `pipeline_stages` (name, order_index, phase_group, is_won/is_lost, probability), сортировка по order_index.
- `moveToStageId(projectId, stageId, legacyStage, opts?)` (`use-projects.ts:509`) — пишет stage_id (+ легаси-зеркало). **В Фазе A передаём `legacyStage = null`** (перестаём кормить зеркало из чеврона; для чеврон-двигаемых сделок оно и так уже застывало — BACKLOG).
- StackedPipeline (S29.1) — эталон: треки = `phase_group`, без хардкода имён.

## РАЗВЕДКА
```bash
cd ~/Downloads/dashboard-crm/src
grep -n "useStagesForPipeline\|usePipelineStages\|moveToStageId" lib/hooks/use-pipelines.ts lib/hooks/use-projects.ts
grep -n "project.stage\b\|getNextStage\|getPrevStage\|STAGE_CONFIG\|getTrack\|mapToLegacyStage" components/projects/ProjectDetail.tsx components/projects/ProjectCard.tsx components/projects/ProjectsTable.tsx components/projects/ProjectPeekContent.tsx
grep -n "attraction\|working\|approval\|closing\|phase_group" components/projects/StackedPipeline.tsx | head
```

## A0. Хелпер трека из phase_group (`lib/utils/stage-mapping.ts` или новый `stage-track.ts`)
Легаси `getTrack` даёт 3 трека по `STAGE_CONFIG.order`; сохраняем поведение (H2), но источником делаем `phase_group`:
```ts
// 3-трек (легаси-совместимость таблицы) из phase_group стадии. Кандидат на выравнивание к 4 phase_group — отдельным UX-заходом.
export function trackFromPhaseGroup(phaseGroup: string | null | undefined): 'Подготовка' | 'Эксперимент' | 'Проект' | null {
  switch (phaseGroup) {
    case 'attraction': return 'Подготовка';
    case 'working':
    case 'approval':   return 'Эксперимент';
    case 'closing':    return 'Проект';
    default:           return null;
  }
}
```

## A1. ProjectDetail — чеврон-навигация на stage_id (`components/projects/ProjectDetail.tsx`)
Сейчас `handleAdvance`/`handleRevert` берут `getNextStage(project.stage)` и пишут `stage: nextStage` (легаси reader+writer).
- Стадии текущего пайплайна: `const pipeStages = useStagesForPipeline(project.pipeline_id)` (уже отсортированы по order_index).
- Текущий индекс: `const curIdx = pipeStages.findIndex((s) => s.id === project.stage_id)`.
- `handleAdvance`: `const next = pipeStages[curIdx + 1]; if (next) moveToStageId(project.id, next.id, null)`.
- `handleRevert`: `const prev = pipeStages[curIdx - 1]; if (prev) moveToStageId(project.id, prev.id, null)`.
- Кнопки advance/revert disabled на границах (`curIdx<=0` / `curIdx>=len-1` / `curIdx===-1`).
- Удалить `stageConfig`/`nextStage`/`prevStage` на базе `project.stage` (строки ~262-264) — `headerStage`/`headerProb` уже на stage_id (S29.1), их оставить.
- Строка ~93: `filled: !!project.stage` → `filled: !!project.stage_id`.
- **Win/lost handlers (466/574) с `stage: mapToLegacyStage(...)` — НЕ трогать** (это записи, Фаза B).

**Коммит A1:** `refactor(stage): чеврон ProjectDetail на stage_id (moveToStageId, legacy=null)`. Смок: advance/revert двигают стадию, контур/probability верные, границы блокируют кнопки.

## A2. ProjectCard — снять легаси-фолбэк (`components/projects/ProjectCard.tsx` ~95-105)
Сейчас `stage_id-значение ?? (project.stage ? STAGE_CONFIG[project.stage]...)`. Нужна `stagesMap` (из `usePipelineStages` → `new Map(stages.map(s=>[s.id,s]))`, как в ProjectsTable).
- shortLabel: `pipelineStage?.name` (без STAGE_CONFIG-фолбэка).
- probability: `pipelineStage?.probability ?? null`.
- phase-цвет: из `pipelineStage?.phase_group` (токен, как в StackedPipeline `PHASE_COLOR`).
- progress: из позиции order_index среди активных стадий пайплайна (как StackedPipeline), НЕ `STAGE_CONFIG.order/12`.
Убрать импорт/ветки `STAGE_CONFIG`/`PHASE_COLOR[STAGE_CONFIG...]`.

**Коммит A2:** `refactor(stage): ProjectCard на stage_id (без STAGE_CONFIG-фолбэка)`.

## A3. ProjectsTable — трек и имя на stage_id (`components/projects/ProjectsTable.tsx`)
- `getStageName` уже stage_id-first — убрать легаси-ветку `if (p.stage) return STAGE_CONFIG[p.stage]...`.
- `getTrack(p.stage)` → `trackFromPhaseGroup(stagesMap.get(p.stage_id)?.phase_group)`. Заменить все вызовы (36, 72-74, 127, 307).
- track-фильтры `track_prep/exp/proj` (72-74): предикат через `trackFromPhaseGroup(...)===` вместо `getTrack(p.stage)`.
- Экспорт (306-307): `track: trackFromPhaseGroup(...) ?? ''`.
Убрать импорт `getTrack`/`STAGE_CONFIG`, если больше не нужны в файле.

**Коммит A3:** `refactor(stage): ProjectsTable трек/имя на stage_id (phase_group)`.

## A4. ProjectPeekContent — снять фолбэк (`components/projects/ProjectPeekContent.tsx:25`)
`(project.stage ? STAGE_CONFIG[project.stage]?.shortLabel ?? project.stage : '—')` → `stagesMap.get(project.stage_id)?.name ?? '—'` (stagesMap из usePipelineStages).

**Коммит A4:** `refactor(stage): ProjectPeek имя стадии на stage_id`.

## ПРОВЕРКА (каждая подзадача)
```bash
npx tsc --noEmit          # главный гейт
# build — нативно на Маке (dev остановить)
```
После A4: `grep -rn "project\.stage\b\|STAGE_CONFIG\[" src/components/projects/ | grep -v stage_id` — должно остаться ТОЛЬКО в записях (ProjectModal, win/lost-sync, mapToLegacyStage) и в самом STAGE_CONFIG-определении. Ни одного ЧИТАТЕЛЯ `project.stage`.
Смок: детальная сделка — чеврон двигает стадию (advance/revert, границы); карточка/таблица/peek показывают стадию из stage_id; трек-фильтры таблицы работают; ERP/IIoT/internal не падают (internal — `stage_id=null`, трек `—`).

## КОММИТ / ПУШ
Коммиты A1→A4 по готовности (только `src/`; `_analysis`/доки отдельно). НЕ пушить — с общим заходом. (Напомню: `e576887` docs-коммит тоже ждёт пуша.)

---

## Заметки гейта (Cowork) + что дальше
- **Фаза A НЕ трогает записи и НЕ дропает колонку** — легаси `stage` продолжает писаться в синхроне (ProjectModal/win-lost), но больше не читается. Это safe-интервал (Migration Safety Protocol).
- **Треки:** 3-трек сохранён через `phase_group→трек` ради H2 (поведение фильтра не меняется). Выравнивание к 4 phase_group — отдельный UX-вопрос, не рефактор.
- **Границы чеврона:** `curIdx===-1` (нет stage_id / стадии грузятся) → обе кнопки disabled, не падать.
- **ФАЗА B (следующий заход, с явным OK — DROP на проде деструктивен):** убрать `mapToLegacyStage`-вызовы (PipelineBoard:491 → null, ProjectDetail win/lost 466/574, ProjectModal stage-записи) → миграция `DROP COLUMN projects.stage` + `DROP TYPE deal_stage` + удалить `STAGE_CONFIG`/`getNextStage`/`getPrevStage`/`stage-mapping.ts`/`trackFromPhaseGroup`-если-легаси. Реверс-маппинг в БД НЕ делаем.
- build через мост невозможен (SWC arm64) — нативно на Маке.
