# Ревью: Sprint 29.1 — чеврон детальной → stage_id

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, grep/read, crm-architect references)  
**Объект:** `_analysis/sprint-29-1-chevron-stage-id.md` — UI-микро: StackedPipeline читает/пишет только `stage_id`, legacy `stage` из чеврона убрать  
**Контекст:** S27 (гейты на `stage_id`), S29 (автоматизация на `stage_id`); после S29.1 цепочка S-LEGACY-STAGE-1 (A→B3) уже закрыла чтение/запись/DROP `projects.stage` (047 + `d904172`)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз бага (chevron → legacy `stage`, минуя гейт/автоматизацию) | ✅ Был верен **до** 2026-07-06 |
| Цель «только stage_id, без миграций» | ✅ Архитектурно верна |
| Задачи 1–3 vs live-код | ❌ **Уже сделаны** (коммит `01dbd08`) |
| Гипотеза «3 трека = phase_group» | 🟡 Почти: в БД **4** deal-слага, не 3 |
| Символы `preparation_stage` / `experiment_stage` / `project_stage` | ❌ В `src/` никогда не были DB/UI-полями |
| docs/BACKLOG/architecture (Задача 3) | ✅ Уже отражают S29.1 done |
| Актуальность промпта для CC сегодня | ❌ **Stale** — повторный прогон вреден |
| Суперсессия | ✅ S-LEGACY-STAGE-1 закрыта: колонки `stage` нет в типах/select |

**Оценка: 3/10 как исполняемый спринт на `main` сегодня; 8/10 как исторический handoff (диагноз и решение были правильными).**  
**Рекомендация: не запускать в Claude Code.** Работа закрыта коммитом `01dbd08` (2026-07-06); последующие фазы legacy-stage ушли дальше промпта. Новый work — только дельта (например stage_id-логгер, docs-дельта 047), не перепрогон S29.1.

---

## Статус (факт в репо)

| Заход | Статус в репо | Доказательство |
|-------|---------------|----------------|
| **S29.1 (этот спринт)** | ✅ done | `01dbd08` — `StackedPipeline.tsx`, `ProjectDetail.tsx`, `docs/schema.md`, `_analysis/BACKLOG.md` |
| Гейт-баннер S27 на детальной | ✅ | `ProjectDetail.tsx:152–157`, `614–628` + `parseStageGateError` |
| `moveToStageId` без legacy | ✅ | `use-projects.ts:488–503` — пишет только `{ id, stage_id, ...extra }` |
| Задача 2: legacy-читатели | ✅ суперсессия | handoff A/B1/B1.5; `project.stage` в UI почти мёртв; `filled: !!project.stage_id` (`ProjectDetail.tsx:87`) |
| Задача 3: docs/BACKLOG/architecture | ✅ | BACKLOG L18–22 `[x] S29.1`; skill `architecture.md:222–229`; skill `schema.md:826–832` |
| **S-LEGACY-STAGE-1 B2/B3** | ✅ done (после S29.1) | DROP `projects.stage` (047 на проде); B3 `d904172`; `supabase.gen.ts` Row **без** `stage` |

Файл спринта: mtime ~2026-07-11, но **содержимое — pre-merge промпт** (описывает баг как «найдено на смоках S29»). Отдельного `_analysis/review-sprint-29-1-*.md` до этого ревью не было.

---

## С чем согласен полностью

### 1. Корневая причина (исторически)

До S29.1 `StackedPipeline` принимал `currentStage: DealStage` и клик писал legacy enum через `updateProject` / `mapToLegacyStage`, **минуя** `stage_id`.  
Гейт `trg_aa_enforce_stage_gate` и `trg_zz_run_automations` смотрят на `NEW.stage_id IS DISTINCT FROM OLD.stage_id` — поэтому «чеврон: Подготовка КП / бейдж: Лид · 5%» — точный симптом.

Pre-image (`01dbd08^`):

- `StackedPipeline`: хардкод 3 трека (prep/exp/proj) + `STAGE_CONFIG` + `DealStage`
- `ProjectDetail`: `currentStage={project.stage}`, `onStageClick` → legacy

### 2. Правильное целевое решение

- Источник: `pipeline_stages` текущего `pipeline_id`, группа по `phase_group`, внутри — `order_index`
- Клик: `moveToStageId` + `parseStageGateError` → существующий баннер
- Без DB-миграций в рамках S29.1 — верно (UI-only)
- Прогресс от позиции `stage_id` — выбран и зафиксирован в коде

### 3. Инфраструктура для переиспользования (уже была к моменту S29.1)

| Символ | Путь | Статус |
|--------|------|--------|
| `moveToStageId` | `src/lib/hooks/use-projects.ts:488` | ✅ |
| `parseStageGateError` | `use-projects.ts:20–30` | ✅ message `stage_gate_failed` |
| `usePipelineStages` / `useStagesForPipeline` | `src/lib/hooks/use-pipelines.ts:29–67` | ✅ |
| PipelineBoard pattern | `PipelineBoard.tsx:331,490+` | ✅ эталон |

### 4. Live-реализация совпадает с DoD спринта

`StackedPipeline.tsx` (шапка L9–16, L67–117):

- props: `pipelineId`, `currentStageId`, `onStageClick?: (stageId: string) => void`
- треки из `phase_group` (attraction/working/approval/closing + delivery-слаги)
- `pct` = `(currentIndex + 1) / stages.length` по активным стадиям, **не** probability
- сегмент кликает `stage.id` (uuid)

`ProjectDetail.tsx:556–578` (IIoT):

```text
currentStageId={project.stage_id}
moveToStageId(project.id, newStageId, { onError: onGateError })
// комментарий: S29.1 / B1 — legacy stage не трогаем
```

Бейдж шапки: `headerStage` из `stage_id` (`ProjectDetail.tsx:219–221, 295–296`).

ERP-аналог `DealProgressBar` — тот же `stage_id` + `moveToStageId` (L532–551).  
Delivery переиспользует `StackedPipeline` (L586–608).

### 5. Docs-хвост спринта уже закрыт

- `_analysis/BACKLOG.md:18–22` — S29.1 `[x] done`
- `docs/schema.md` / skill schema — known issue S27 → closed S29.1
- skill `architecture.md:222–229` — StackedPipeline = stage_id + phase_group

Сообщение коммита `01dbd08` **буквально** совпадает с блоком «КОММИТ» в спринте.

---

## Блокеры (критично — не запускать)

### B1. Спринт уже выполнен — повторный прогон = noop / риск регрессии

Коммит `01dbd08e23970f88de22fc3fa4d29e42bd67aa74` (2026-07-06):

> Sprint 29.1: чеврон детальной страницы на stage_id (phase_group из pipeline_stages), legacy stage больше не пишется из UI, гейт-баннер переиспользован  

Файлы: `StackedPipeline.tsx`, `ProjectDetail.tsx`, `docs/schema.md`, `_analysis/BACKLOG.md`.

**Действие:** не отдавать в CC. Пометить файл как historical/done (опционально: шапка `Status: DONE 01dbd08`) или архивировать. Новый scope — отдельный sprint-файл.

### B2. Мир после S29.1: `projects.stage` уже DROP

Промпт говорит «legacy read-only, кандидат на вынос» и «читатели в BACKLOG S30+».  
На `main` сегодня:

- `src/types/supabase.gen.ts` — `projects.Row` **без** колонки `stage`
- `moveToStageId` — legacy не пишет (B1)
- session handoff 2026-07-16: S-LEGACY-STAGE-1 **закрыт** (047 DROP + B3)

Задачи 2–3 и формулировки «ещё пишется из ERP/ProjectModal» — **устарели**. CC, следуя промпту, может:

- править несуществующие записи `stage`
- «обновлять» BACKLOG в состояние mid-2026-07-07 (откат прогресса)
- искать `preparation_stage*` и invent-fix

### B3. Ложные символы в РАЗВЕДКЕ / ПРОВЕРКЕ

Спринт многократно ссылается на `preparation_stage` / `experiment_stage` / `project_stage` как на писуемые поля.

```bash
# live: 0 совпадений в src/ (кроме несвязанного sync_project_stage в docs)
```

До S29.1 были **хардкод-треки** `prep` / `exp` / `proj` и ключи `DealStage` (`new_lead`, `preparing_kp`, …), не колонки с такими именами.  
Гейт `grep … preparation_stage | wc -l` вводит в заблуждение.

---

## Предупреждения (если когда-либо править промпт / учить на нём)

### W1. «Три трека» vs `phase_group` в БД

Гипотеза спринта: Подготовка / Эксперимент / Проект = `phase_group`.  
Факт (и skill architecture, и `StackedPipeline` / `PipelineBoard`):

| phase_group | UI-лейбл (PHASE_LABELS) |
|-------------|-------------------------|
| `attraction` | Привлечение |
| `working` | Проработка |
| `approval` | Согласование |
| `closing` | Закрытие |

Плюс delivery: `initiated` / `planning` / `execution` / `completed` (035).  
Старый 3-track UX **не** равен 4 phase_group — S29.1 это исправил, а не сохранил 1:1.

### W2. Разведочный grep `.stage[^_I]` — шум

Ловит `.stages` (массивы колонок), `chartData[…].stage` (часто UUID `stage_id`), и т.п.  
Для читателей legacy нужен более узкий паттерн (`project.stage`, `p.stage`, `vars.stage`, select-списки).  
Сейчас legacy-колонки нет — разведка Задачи 2 бессмысленна на `main`.

### W3. docs/schema.md vs прод после 047

Skill и `docs/schema.md` всё ещё описывают колонку `stage` как legacy (кандидат на вынос).  
Session handoff: **docs-дельта 047 не перенесена** — отдельный docs-долг, не scope S29.1.  
Не чинить «через» повтор S29.1.

### W4. Commit path в промпте

```text
git add src/ docs/schema.md _analysis/BACKLOG.md
```

Skill architecture — вне репо (`~/.claude/skills/...`); промпт верно не кладёт его в git add, но «Скилл architecture.md» (Задача 3) CC с моста может не достучаться (грабля session handoff: `~/.claude/skills` мосту недоступен). На практике skill уже обновлён.

---

## Пропущенные / уточнённые места (инвентарь live)

| Файл | Строки / факт | Отношение к S29.1 |
|------|---------------|-------------------|
| `src/components/projects/StackedPipeline.tsx` | весь файл, S29.1 header | ✅ Цель Задачи 1 — **done** |
| `src/components/projects/ProjectDetail.tsx` | 556–578 IIoT; 532–551 ERP; 586–608 delivery; 614+ gate banner | ✅ |
| `src/lib/hooks/use-projects.ts` | `moveToStageId` 488–503; `parseStageGateError` 20–30 | ✅ переиспользован |
| `src/lib/hooks/use-pipelines.ts` | `useStagesForPipeline` | ✅ |
| `src/components/projects/PipelineBoard.tsx` | move + gate | эталон, не трогать |
| `src/components/projects/DealProgressBar.tsx` | single-track ERP | уже на stage_id (вне узкого «IIoT-only» текста, но согласовано) |
| `preparation_stage*` | **0** в `src/` | ложный target |
| `projects.stage` в gen types | **отсутствует** | B2/B3 после S29.1 |

Проверка спринта «chevron больше не пишет legacy»:

```text
grep preparation_stage|experiment_stage|project_stage → 0
moveToStageId payload → только stage_id
```

---

## crm-architect checklist

| Пункт | Результат |
|-------|-----------|
| Есть РАЗВЕДКА | ✅ (команды ок как шаблон; часть символов stale) |
| Реальные table/column | ✅ `stage_id`, `pipeline_stages.phase_group`, `order_index` |
| Реальные пути | ✅ `StackedPipeline`, `ProjectDetail`, `use-projects` |
| learnings gotchas | ✅ не путать Gantt `phase` column с deal `phase_group` — спринт про deal/detail, ок |
| Миграции не из CC | ✅ UI-only (и уже применено) |
| org_id / RLS | n/a (нет нового SQL) |
| CSS variables | ✅ StackedPipeline на `--track-*` / semantic tokens |
| schema.md после migration | n/a для S29.1; 047 docs — отдельный долг |

---

## Предлагаемые правки в спринт

**Не править для запуска** — запуск не нужен. Если файл оставляют в `_analysis/` как историю:

1. В шапку:  
   `Status: DONE (01dbd08, 2026-07-06). Do not re-run. Superseded by S-LEGACY-STAGE-1 (DROP stage).`
2. Удалить/зачеркнуть Задачи 1–3 как executable steps; оставить как design note.
3. Заменить `preparation_stage|…` на «хардкод TRACKS prep/exp/proj + DealStage».
4. Заменить «3 трека» на «4 phase_group deal + delivery-слаги».
5. Задачу 2 пометить: выполнена цепочкой handoff-legacy-stage-A…B3.

Актуальный follow-up (если нужен новый sprint, **не** 29.1):

- stage_id-логгер в `activity_log` (триггер `stage_change` дропнут с 047)
- docs: дельта 047 в `docs/schema.md` + skill `references/schema.md`

---

## Чеклист перед CC

- [x] Верифицировано: S29.1 уже в `main` (`01dbd08`)
- [x] Live `StackedPipeline` / `ProjectDetail` на `stage_id` + `moveToStageId` + gate banner
- [x] BACKLOG и architecture уже описывают done
- [x] Legacy `projects.stage` снят сильнее, чем просил спринт (DROP 047)
- [ ] **Не запускать** этот файл в Claude Code
- [ ] При появлении «нового» work по стадиям — новый `_analysis/sprint-*.md` с delta-only scope, next migration ≥ 048 если нужен DDL
- [ ] Опционально: пометить `sprint-29-1-*.md` как DONE / archive

---

## Итог одной строкой

Промпт S29.1 был **правильным фиксом правильного бага** и **полностью влит** 2026-07-06; на текущем `main` это архивный документ — повторный запуск в CC запрещён.
