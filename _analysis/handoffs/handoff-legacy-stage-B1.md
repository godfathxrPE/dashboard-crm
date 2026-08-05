# Claude Code — S-LEGACY-STAGE-1 · Фаза B1: убрать клиентские ЗАПИСИ `projects.stage`

**Контекст:** Фаза A убрала читателей `projects.stage`. B1 убирает клиентские **записи** — после деплоя B1 прод-код
перестаёт писать `stage`, и только ТОГДА Cowork дропнет колонку (B2, миграция). **Порядок строгий: B1 задеплоить и
проверить на проде ДО B2 DROP** — иначе задеплоенный писатель `stage` упадёт на несуществующей колонке.
**БД не трогаем. Только клиент.** После B1 — коммит, пуш, деплой, смок прода, доложить Cowork → тогда B2.

## РАЗВЕДКА (post-Phase-A состояние)
```bash
cd ~/Downloads/dashboard-crm/src
grep -rn "mapToLegacyStage\|moveToStageId\|stage: \|editProject.stage\|STAGE_CONFIG\|getNextStage\|getPrevStage\|dealStages\|DealStage" components/projects/ lib/hooks/use-projects.ts lib/utils/stage-mapping.ts lib/validators/project.ts | grep -v "stage_id\|stage_entered\|pipeline_stage\|stage_requirement\|StageTrack\|phaseGroup"
```

## ЗАДАЧА 1 — `moveToStageId` без легаси-параметра (`lib/hooks/use-projects.ts`)
`moveToStageId(projectId, stageId, legacyStage, opts?)` → убрать параметр `legacyStage` и **удалить `stage: legacyStage`** из update-мутации (оставить `stage_id: stageId`). Обновить сигнатуру + всех вызывающих (см. Задачи 2-3).

## ЗАДАЧА 2 — PipelineBoard (`components/projects/PipelineBoard.tsx`)
Строка ~491: `moveToStageId(project.id, targetStage.id, mapToLegacyStage(targetStage, project.direction), { … })`
→ `moveToStageId(project.id, targetStage.id, { … })`. Удалить импорт `mapToLegacyStage` (стр. 41).

## ЗАДАЧА 3 — DeliveryPipelineBoard (`components/projects/DeliveryPipelineBoard.tsx`)
Строка ~253: `moveToStageId(project.id, targetStage.id, null)` → `moveToStageId(project.id, targetStage.id)`.

## ЗАДАЧА 4 — ProjectModal (`components/projects/ProjectModal.tsx`): форма больше не шлёт `stage`
- Удалить импорт `mapToLegacyStage` (стр. 25) и вычисление `legacyStage = mapToLegacyStage(...)` (~255).
- Убрать `stage: …` из ВСЕХ payload/reset-объектов (63, 117 `editProject.stage` round-trip, 139, 241, 251, 256). Форма стадию не отправляет — БД-дефолт/`stage_id` рулят.
- Тип `ProjectFormValues`/payload: убрать поле `stage` если оно там объявлено (валидатор `lib/validators/project.ts`).

## ЗАДАЧА 5 — ProjectDetail win/lost (`components/projects/ProjectDetail.tsx`)
Строки ~466 и ~574: убрать `stage: mapToLegacyStage(firstStage/lostStage, project.direction),` из update-payload win/lost (оставить `stage_id`/прочее). Удалить импорт `mapToLegacyStage`, если больше не нужен.

## ЗАДАЧА 6 — снос мёртвого легаси-кода (что стало unused после A+B1)
Грепом подтвердить 0 использований, затем удалить:
- **`lib/utils/stage-mapping.ts`** целиком (`mapToLegacyStage` + `IIOT_STAGE_MAP`) — после Задач 2/4/5 импортеров нет.
- В `lib/validators/project.ts`: **`STAGE_CONFIG`**, **`getNextStage`**, **`getPrevStage`**, `StageConfig`/`Phase`/`phases`/`PhaseConfig` — удалить ТОЛЬКО реально неиспользуемые (грепнуть каждый по src). **`DealStage` тип и `dealStages` — ОСТАВИТЬ** (пока `projects.stage` в `supabase.gen.ts`; уйдут в B3 после regen).
- `trackFromPhaseGroup`/`stage-track.ts` — НЕ трогать (phase_group-based, живой).

## ПРОВЕРКА
```bash
npx tsc --noEmit        # зелёный
grep -rn "mapToLegacyStage\|STAGE_CONFIG\|getNextStage\|getPrevStage" src/ || echo "легаси-конфиг вычищен"
grep -rn "stage:" src/components/projects/ | grep -v "stage_id\|stage_entered\|StageTrack\|// " || echo "клиент stage не пишет"
# build — нативно на Маке (dev остановить)
```
Смок прода (ПОСЛЕ деплоя): создать сделку, отредактировать в ProjectModal, подвигать чевроном (DealProgressBar/StackedPipeline), выиграть/проиграть, kanban-drag — всё работает, БД не ругается (колонка stage ещё есть, просто не пишется).

## КОММИТ / ПУШ / ДЕПЛОЙ
```bash
git add -A && git commit -m "refactor(stage): убрать клиентские записи projects.stage (B1, перед DROP)"
# ПУШ: этот заход ИМЕННО про деплой — пуш нужен, чтобы прод перестал писать stage до B2 DROP.
# git push origin main  (после нативного build; уедут и хвосты: e576887 + Фаза A 9cc16c5/40aca3f/9ebc308/3875e96)
```
**После деплоя + смока прода — доложить Cowork.** Cowork выполнит B2 (снос триггеров + DROP column/type через Supabase MCP), затем даст B3 (regen типов + снос DealStage).

## Заметки гейта (Cowork)
- **B1 НЕ трогает БД.** Колонка `stage` живёт, просто клиент её не пишет. DB-триггер `null_internal_stage` ещё занулит её у internal — безвредно (снесётся в B2).
- **Деплой B1 обязателен ПЕРЕД B2** — иначе старый прод-код пишет stage → DROP COLUMN ломает прод.
- **B2 (Cowork, после деплоя+смока):** `DROP TRIGGER on_stage_change` + `DROP FUNCTION log_stage_change` (аудит смены стадии — дропаем, stage_id-логгер отдельным спринтом); `DROP TRIGGER trg_ab_null_internal_stage` + `DROP FUNCTION null_internal_stage`; `ALTER TABLE projects DROP COLUMN stage`; `DROP TYPE deal_stage`. `sync_deal_stage_fields`/`sync_project_stage` НЕ трогать (они на stage_id).
- **B3 (после B2):** regen `supabase.gen.ts` (stage уйдёт), снести `DealStage`/`dealStages`, tsc, деплой.
- build через мост невозможен (SWC arm64) — нативно на Маке.
