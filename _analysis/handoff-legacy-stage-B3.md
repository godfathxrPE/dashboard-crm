# Claude Code — S-LEGACY-STAGE-1 · B3: regen типов + снос легаси-символов stage (пост-DROP)
<!-- Cowork handoff, 2026-07-16. B2 (миграция 047) исполнен и верифицирован на проде. -->


**Контекст:** B2 исполнен Cowork'ом через Supabase MCP (миграция `047_drop_legacy_projects_stage`, prod
`uoiavcabxgdjugzryrmj`, 2026-07-16). На проде **больше нет** колонки `projects.stage`, типа `deal_stage`,
триггеров `on_stage_change`/`trg_ab_null_internal_stage` и функций `log_stage_change`/`null_internal_stage`
(индекс `idx_projects_stage` ушёл каскадом). Верифицировано интроспекцией + живым смоком (27 запросов 200,
0 ошибок консоли, канбан/воронка/CommandPalette рендерят стадии из `stage_id`). Прод стабилен — B3 **не срочный**,
чистый клиентский cleanup. **БД не трогаем.**

## ⚠️ ГЛАВНОЕ РЕШЕНИЕ (pushback против «просто удалить STAGE_CONFIG»)
`STAGE_CONFIG` **НЕ мёртв.** Он используется как `[s]?.shortLabel` в двух хелперах `stageName()`
(`lib/utils/activity-events.ts:5` и inline `components/dashboard/DashboardHome.tsx:690`), и только там —
для форматирования **исторических** событий `stage_change` в ленте «Последние действия»
(`activity_log.payload.from/to` держат старые enum-строки типа `contract_review`). На живом проде это рендерит
«Стадия: Лид → Выигр.». Слепой снос → в истории вылезут сырые `contract_review` вместо «Согл. дог.».
`describeEvent` из activity-events **живой** (импортят `ProjectPeekContent.tsx:9`, `use-entity-timeline.ts:17`).

**Поэтому B3 = заменить `STAGE_CONFIG` на минимальный label-map `LEGACY_STAGE_LABELS`** (только enum→shortLabel,
для исторической ленты), а весь остальной легаси — снести. Если Олег скажет «сырые строки в истории ок» —
тогда просто убрать `stageName` и оставить `?? s` (вариант B, ниже). **Дефолт — сохранить лейблы (вариант A).**

## Что ЖИВОЕ (не трогать)
- `phases`, `type Phase`, `PHASE_CONFIG` (label/color/bgColor/dotColor) — держит `FunnelWidget.tsx:6,47`
  (`PHASE_CONFIG[f.phase]`, `phases`, `Phase`). **Оставить.**
- `describeEvent`/`relativeTime` в `activity-events.ts` — живые.
- Вся stage_id-инфраструктура (`usePipelineStages`, `useStagesMap`, `moveToStageId`, `stage-track.ts`,
  `trackFromPhaseGroup`/`phaseFromPhaseGroup`, sync-триггеры) — источник истины, не трогать.

## Что МЁРТВОЕ (снести — 0 внешних потребителей, verified grep 2026-07-16)
- `getPhaseForStage` (validators/project.ts:96) — 0 вызовов.
- `getActiveStages` (validators/project.ts:101) — 0 вызовов.
- `dealStages` (validators/project.ts:8) — 0 внешних импортов.
- `type DealStage` — **два** определения: `validators/project.ts:15` (импортит только use-projects.ts под
  поле `stage`) и **orphan** `types/database.ts:138` (0 импортов). Оба уходят после снятия поля `stage`.
- `interface StageConfig` + `STAGE_CONFIG` (validators/project.ts:21,29) — заменяются на `LEGACY_STAGE_LABELS`.
- Поле `stages: DealStage[]` в `interface PhaseConfig` + массивы `stages: [...]` в каждой записи `PHASE_CONFIG`
  — **не читаются** (все найденные `.stages` — это `track.stages`/`column.stages` из runtime `pipeline_stages`,
  не `PHASE_CONFIG[x].stages`). Убрать поле и массивы.

## ЗАДАЧА 1 — regen supabase.gen.ts (источник для entities.ts)
```bash
cd ~/Downloads/dashboard-crm
npx supabase gen types typescript --project-id uoiavcabxgdjugzryrmj > src/types/supabase.gen.ts
# (или твой обычный скрипт regen). Ожидаемо: projects.Row теряет `stage`, enum `deal_stage` исчезает.
git diff --stat src/types/supabase.gen.ts
```
**Verified Cowork'ом:** в свежих типах `projects` без голого `stage` (есть `stage_id`/`stage_entered_at`),
вхождений `deal_stage` = 0. Если regen тащит и другие дельты — показать `git diff`, гейт по содержимому.

## ЗАДАЧА 2 — `lib/hooks/use-projects.ts`: снять поле `stage` из клиентских типов
- Удалить импорт `import type { DealStage } from '@/lib/validators/project'` (строка 6).
- `interface Project`: убрать `stage: DealStage | null;` (строка 60).
- `interface ProjectInsert`: убрать `stage?: DealStage | null;` (строка 102).
- Проверить `ProjectUpdate`/прочие типы в файле на остатки `stage` (не `stage_id`) — убрать.
- **Логгер onSuccess** (ранее ~445, `logActivity(... { from: oldProject.stage, to: vars.stage })`): `oldProject.stage`/
  `vars.stage` теперь не существуют в типе → tsc заругается. Это degraded-логгер (писал `undefined`), помечен в
  бэклоге на замену stage_id-логгером. **B3: убрать этот вызов `logActivity('stage_change', ...)` целиком**
  (не чинить — отдельный спринт stage_id-логгера). Смена стадии всё равно логируется? Нет — `on_stage_change`
  дропнут в B2. Значит stage_change-события больше не пишутся вообще (историю форматируем из старых записей).
  Это ОК на переходный период; полноценный stage_id-логгер — backlog-спринт.

## ЗАДАЧА 3 — `lib/validators/project.ts`: заменить STAGE_CONFIG на LEGACY_STAGE_LABELS
Удалить: `dealStages`, `type DealStage`, `interface StageConfig`, `STAGE_CONFIG`, `getPhaseForStage`,
`getActiveStages`. Добавить минимальный map (сохраняет исторические лейблы ленты):
```ts
// Легаси-лейблы стадий (enum `deal_stage` снят в миграции 047). Оставлены ТОЛЬКО для форматирования
// исторических событий activity_log.stage_change (payload.from/to держат старые enum-строки).
// Живая стадия сделки берётся из stage_id → pipeline_stages (usePipelineStages/useStagesMap).
export const LEGACY_STAGE_LABELS: Record<string, string> = {
  new_lead: 'Лид', qualification: 'Квалиф.', waiting_materials: 'Материалы',
  preparing_kp: 'Подг. КП', kp_sent: 'КП отпр.', kp_review: 'Рассм. КП',
  preparing_docs: 'Док-ты', cz_approval: 'Согл. ЧЗ', trilateral_meeting: '3-стор.',
  experiment_setup: 'Экспер.', contract_review: 'Согл. дог.', contract_signing: 'Подпис.',
  won: 'Выигр.', lost: 'Проигр.',
};
```
В `interface PhaseConfig` убрать поле `stages: DealStage[];`; в `PHASE_CONFIG` убрать строки `stages: [...]`
из всех 4 записей. `phases`/`Phase`/`PHASE_CONFIG`(label/color/bg/dot) — оставить.

## ЗАДАЧА 4 — потребители stageName → LEGACY_STAGE_LABELS
- `lib/utils/activity-events.ts`: импорт `STAGE_CONFIG` → `LEGACY_STAGE_LABELS`;
  `stageName`: `(STAGE_CONFIG as Record<...>)[s]?.shortLabel ?? s` → `LEGACY_STAGE_LABELS[s] ?? s`.
- `components/dashboard/DashboardHome.tsx`: то же (импорт стр. 37 + `stageName` стр. 690-691). Живой inline-дубль.
- `components/projects/LostDeals.tsx:5`: импорт `STAGE_CONFIG` — **grep показал только строку импорта, 0 использований**
  → убрать `STAGE_CONFIG` из импорта (оставить `LOSS_REASON_CONFIG, formatBudget`). Если tsc найдёт скрытое
  использование — заменить на `LEGACY_STAGE_LABELS`/stage_id по месту, доложить.

## ЗАДАЧА 5 — `types/database.ts:138`: снести orphan `type DealStage` (0 импортов).

## ПРОВЕРКА
```bash
cd ~/Downloads/dashboard-crm
grep -rn "DealStage\|dealStages\|STAGE_CONFIG\|getPhaseForStage\|getActiveStages" src/ \
  | grep -v "LEGACY_STAGE_LABELS\|// \|pipeline_stages\|stage_id" || echo "легаси-символы вычищены"
grep -rn "\.stage\b" src/ | grep -v "stage_id\|stage_entered\|pipeline_stage\|stage-track\|\.stages\b\|// " \
  || echo "поле p.stage нигде не читается"
npx tsc --noEmit    # ДОЛЖЕН быть 0 — главный гейт B3
# нативный build на Маке (dev остановить; мост SWC arm64 не тянет)
```
Смок прода (ПОСЛЕ деплоя): лента «Последние действия» — исторические «Стадия: X → Y» показывают лейблы
(«Лид → Выигр.»), не сырые enum; воронка/канбан/детали сделки грузятся; создание/редактирование сделки,
win/lost, drag — БД не ругается. Консоль чистая.

## КОММИТ / ПУШ / ДЕПЛОЙ
```bash
git add -A
git commit -m "refactor(stage): снять легаси-символы deal_stage, regen типов (B3, пост-DROP 047)"
git push origin main   # после нативного build
```
Дождаться Netlify Published + смок → доложить Cowork. **S-LEGACY-STAGE-1 закрыт.**

## Заметки гейта (Cowork)
- STAGE_CONFIG был не мёртв (историческая лента) → заменён на `LEGACY_STAGE_LABELS`, а не удалён. Урок:
  «unused» проверять по РЕАЛЬНЫМ вызовам (`[s]?.shortLabel`), не по факту «легаси-имя» — grep нашёл 2 живых
  потребителя, которые я чуть не снёс вслепую.
- stage_change-события больше НЕ пишутся (триггер `on_stage_change` дропнут в B2, degraded-логгер убран в B3).
  Полноценный stage_id-логгер (кто/когда сменил стадию, с именами из pipeline_stages) — **backlog-спринт**.
- Тип derived: правим только `supabase.gen.ts` (regen) + hand-authored (`types/database.ts` orphan, use-projects
  локальный interface). `entities.ts` не трогаем руками.
- Гейтить коммит по `git show --stat` (только `src/`). Доки/handoff — отдельно в `_analysis/`.
