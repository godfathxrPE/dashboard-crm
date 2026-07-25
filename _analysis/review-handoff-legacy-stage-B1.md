# Ревью: handoff-legacy-stage-B1 (S-LEGACY-STAGE-1 · Фаза B1)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, grep/read, git history, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/handoff-legacy-stage-B1.md` — убрать клиентские **записи** `projects.stage` (перед DROP)  
**Контекст:** цепочка S-LEGACY-STAGE-1. Handoff описывает pre-B1 мир («колонка `stage` живёт, клиент перестаёт писать»). В репо уже: **B1 `044253a`** → B1.5 `f3ec081` → B2 (047 DROP на prod) → **B3 `d904172`**. Ветка: `main` (ahead origin на 3, unrelated gantt).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Порядок B1 → deploy/smoke → B2 DROP | ✅ Архитектурно верно (на момент написания) |
| Scope: только клиент, БД не трогаем | ✅ |
| РАЗВЕДКА + `tsc`/grep-гейты | ✅ |
| Сигнатура `moveToStageId` без `legacyStage` | ✅ Исполнено в `044253a` |
| Снос `stage-mapping.ts` / `getNextStage`/`getPrevStage` | ✅ |
| Сохранить `DealStage`/`dealStages` до B3 | ✅ Верный gate на момент B1 |
| **Актуальность handoff vs живой код** | ❌ **Уже исполнен + цепочка закрыта** |
| Номера строк (PipelineBoard ~491, ProjectDetail ~466/574) | ❌ Устарели |
| Инвентарь вызывающих `moveToStageId` | 🟡 Пропущен `StageBoard` (CC нашёл сам) |
| Задача 6: `phases`/`PHASE_CONFIG` vs `STAGE_CONFIG` | 🟡 Формулировка рискованна; B3 позже уточнил через `LEGACY_STAGE_LABELS` |
| Контекст «колонка stage ещё есть» / «B2 после смока» | ❌ На prod колонка уже DROPped (047) |

**Оценка: 2/10 как runnable-промпт (полностью устарел); 8/10 как исторический техдизайн B1.**  
**Рекомендация: не запускать в Claude Code.** Работа B1 уже в `main` (`044253a`, 2026-07-16 11:16 +0300). Повторный прогон — no-op, ложные «правки» поверх B3 (`LEGACY_STAGE_LABELS`, regen без `deal_stage`) или регресс. Цепочка S-LEGACY-STAGE-1 **закрыта** (A → B1 → B1.5 → B2 → B3). Handoff оставить как архив.

---

## Статус цепочки S-LEGACY-STAGE-1

| Заход | Статус в репо | Факт |
|-------|---------------|------|
| A — читатели в `components/projects/` | ✅ | ProjectCard/Detail/Peek/Table/… на `stage_id` |
| **B1 — убрать клиентские записи `stage`** | ✅ **`044253a`** | `moveToStageId` без legacy; формы не шлют `stage`; `stage-mapping.ts` удалён |
| B1.5 — читатели + select | ✅ `f3ec081` | `PROJECT_COLUMNS` без bare `stage` |
| B2 — DROP `projects.stage` / `deal_stage` | ⚠️ вне репо | 047 applied via MCP 2026-07-16; файла `047_*.sql` нет |
| B3 — regen + снос символов | ✅ `d904172` | `LEGACY_STAGE_LABELS`; `DealStage`/`STAGE_CONFIG`/`deal_stage` сняты |

---

## С чем согласен полностью (дизайн handoff *на момент написания*)

### 1. Строгий порядок B1 deploy → B2 DROP

Контекст handoff верен: писатель `stage` + `DROP COLUMN` = падение прода. Правило «B1 задеплоить и смокнуть **до** B2» — ключевой operational gate. Подтверждено: B1 (`044253a`) → B1.5 (`f3ec081`) → B2 (MCP) → B3 (`d904172`).

### 2. Scope «БД не трогаем»

Соответствует crm-architect: SQL/DROP — Cowork/MCP, не Claude Code. `sync_deal_stage_fields` / `sync_project_stage` (на `stage_id`) — правильно не трогать.

### 3. Ядро задач 1–5

| Задача | Handoff | Факт в `044253a` / текущий `main` |
|--------|---------|-----------------------------------|
| 1 `moveToStageId` | убрать `legacyStage` + `stage:` из mutate | ✅ `use-projects.ts:488–503` — `(id, stageId, options?, extra?)`, payload только `stage_id` |
| 2 PipelineBoard | 3-arg → 2-arg + opts | ✅ `PipelineBoard.tsx:490` — `moveToStageId(project.id, targetStage.id, { onError… })` |
| 3 DeliveryPipelineBoard | `…, null` → 2 args | ✅ `DeliveryPipelineBoard.tsx:251–252` + комментарий `// B1:` |
| 4 ProjectModal | не слать `stage`, убрать `mapToLegacyStage` | ✅ только `stage_id` в defaults/reset/payload (`ProjectModal.tsx:59,112,133,236…`) |
| 5 ProjectDetail win/lost | убрать `stage: mapToLegacyStage…` | ✅ win/lost через `moveToStageId(…, wonStage.id, …, { won_reason… })` / `stage_id: lostStage.id` |
| 6 `stage-mapping.ts` | удалить файл | ✅ файла нет |
| 6 `getNextStage`/`getPrevStage` | удалить | ✅ 0 вхождений в `src/` |
| 6 `DealStage`/`dealStages` | оставить до B3 | ✅ оставлены в B1; сняты в B3 `d904172` |

### 4. Коммит-сообщение handoff ≈ фактический commit

Handoff: `refactor(stage): убрать клиентские записи projects.stage (B1, перед DROP)` — совпадает с `044253a` (message + body перечисляют те же файлы).

### 5. Проверочный grep

Текущее состояние (post-B3):

```
mapToLegacyStage | STAGE_CONFIG | getNextStage | getPrevStage → 0 (кроме комментариев)
stage-mapping.ts → ABSENT
deal_stage / DealStage / dealStages в src/types + validators → сняты (B3)
supabase.gen.ts projects → только stage_id / stage_entered_at
```

---

## Блокеры (критично — **не** «исправить handoff», а **не запускать**)

### B1. Handoff уже исполнен

Коммит `044253a` (9 files, −180/+22) закрывает Задачи 1–6. Повторный запуск в CC бессмысленен и опасен (см. B2).

### B2. Контекст handoff противоречит prod/schema

Handoff утверждает:

- «колонка `stage` живёт, просто клиент её не пишет»
- «DB-триггер `null_internal_stage` ещё занулит…»
- «после деплоя + смока → Cowork B2 DROP»

**Факт (crm-architect `schema.md` 047–049 + `docs/schema.md` + B3 handoff):** на prod `uoiavcabxgdjugzryrmj` колонка `projects.stage`, тип `deal_stage`, триггеры `on_stage_change` / `trg_ab_null_internal_stage` и функции `log_stage_change` / `null_internal_stage` — **сняты в 047**. Клиентские типы (`supabase.gen.ts`) уже без `stage`.

Если CC «выполнит B1» вслепую (например, вернёт запись `stage:` в payload «как было в разведке») — post-DROP prod сломается на `column stage does not exist`.

### B3. Задача 6 конфликтует с post-B3 истиной

Handoff: «`DealStage`/`dealStages` — **ОСТАВИТЬ** (пока `projects.stage` в `supabase.gen.ts`)».

Сейчас:

- `projects.stage` / `deal_stage` **нет** в gen-типах
- `DealStage`/`dealStages` **уже сняты** в B3
- `STAGE_CONFIG` заменён на `LEGACY_STAGE_LABELS` (историческая лента `stage_change`) — не «просто удалить»

Слепое следование Задаче 6 (удалить Phase*/STAGE_CONFIG «если unused») без B3-pushback рискует снести `phases`/`PHASE_CONFIG` (живут в `FunnelWidget.tsx:6,47`) или `LEGACY_STAGE_LABELS`.

---

## Предупреждения (исторические gaps handoff; для архива)

### W1. Пропущен `StageBoard` в Задачах 2–3

Handoff явно чинит PipelineBoard + DeliveryPipelineBoard.  
`StageBoard.tsx` тоже звал `moveToStageId(…, legacyStage)` (restore/drag) — **не в списке задач**.

B1-commit это закрыл сам (`StageBoard.tsx` −`mapToLegacyStage`, 2-arg `moveToStageId`). При повторном прогоне без grep по всем callers residual 3-arg call мог бы остаться — в live-коде уже нет.

Текущие callers (все post-B1, без legacy):

| Файл | Паттерн |
|------|---------|
| `PipelineBoard.tsx` | `moveToStageId(id, stageId, { onError })` |
| `DeliveryPipelineBoard.tsx` | `moveToStageId(id, stageId)` |
| `StageBoard.tsx` | `moveToStageId(id, stageId)` |
| `ProjectDetail.tsx` | win/lost/chevron + `extra` |

### W2. Номера строк устарели

| Handoff | Было (pre-B1) | Сейчас |
|---------|---------------|--------|
| PipelineBoard ~491 + `mapToLegacyStage` | 3-arg | `:490` — 2-arg+opts, импорта нет |
| DeliveryPipelineBoard ~253 `…, null` | 3-arg null | `:252` — 2-arg |
| ProjectDetail ~466/574 `stage: mapToLegacy…` | write legacy | win ~453+, lost ~510 — только `stage_id` / `moveToStageId` |
| ProjectModal `mapToLegacy` ~25, ~255 | было | импорта нет; payload без `stage` |

### W3. Grep-разведка ловит ложные `stage:`

Паттерн handoff `stage:` в `components/projects/` матчит:

- `stage: PipelineStage` (props StageBoard/DealProgressBar/StackedPipeline/PipelineBoard)
- `stage: getStageName(...)` (export CSV ProjectsTable)
- droppable id `stage:${id}`

Это **не** запись `projects.stage`. Гейт «клиент stage не пишет» должен фильтровать payload/mutate (`stage:` рядом с `stage_id:` / `.update({`), а не любой identifier `stage`.

### W4. `architecture.md` слегка отстаёт

`architecture.md:227–229` ещё говорит: «часть читателей ещё на legacy stage… план в BACKLOG». Post-B1.5/B3 это неверно — единственный источник истины `stage_id` (исторические labels — `LEGACY_STAGE_LABELS`). Не блокер handoff B1, но crm-architect reference стоит освежить отдельным docs-pass.

### W5. Baseline SQL vs prod

`supabase/migrations/20260712230000_baseline.sql` всё ещё **CREATE** `deal_stage` / `log_stage_change` / `on_stage_change` / `null_internal_stage`. Файла `047_*.sql` в репо нет. Governance-долг (уже в review B3 / session handoff), не задача B1.

---

## Пропущенные места (на момент pre-B1; CC закрыл)

| Файл | Что | Действие в `044253a` |
|------|-----|----------------------|
| `StageBoard.tsx` | 3-arg `moveToStageId` + import `mapToLegacyStage` | ✅ обновлён |
| `use-projects.ts` `moveToStage` (legacy enum helper) | мёртвый API | ✅ удалён вместе с B1 |
| `tests/unit/stage-mapping.test.ts` | тесты маппинга | ✅ удалён (−16 tests) |

Текущих gaps по **записям** `projects.stage` в `src/` — **0**.

---

## Сверка с crm-architect checklist

| Пункт | Handoff B1 |
|-------|------------|
| РАЗВЕДКА в начале | ✅ |
| Реальные table/column (`projects.stage` → drop later; `stage_id`) | ✅ на момент; ❌ как «текущий» факт post-047 |
| Реальные file paths | ✅ (кроме устаревших line #) |
| learnings gotchas (flowType, SECURITY DEFINER, CASCADE) | ✅ N/A — клиент only |
| SQL migrations separate; not applied from CC | ✅ B2 вынесен в Cowork |
| org_id / RLS | N/A |
| CSS variables | N/A |
| schema.md after migration | N/A для B1; 047 отражён в skill schema post-B2 |

---

## Предлагаемые правки в спринт

**Не править для запуска.** Рекомендации:

1. **Пометить handoff архивом** в шапке, например:
   ```markdown
   > ⛔ ARCHIVED 2026-07-16 — исполнен `044253a`. Не запускать в CC.
   > Цепочка закрыта: B1.5 `f3ec081` → B2/047 MCP → B3 `d904172`.
   ```
2. Не открывать «доделать B1» — следующий work по stage-домену: **stage_id-логгер** (backlog, отдельный sprint; `use-projects.ts:436` уже помечает degraded/off) и **восстановить `047_*.sql` в репо** (governance).
3. При желании — один docs-pass: `architecture.md` legacy-абзац + baseline/047 file (вне scope этого handoff).

---

## Чеклист перед CC

- [x] ~~Выполнить Задачи 1–6~~ — **уже в `044253a`**
- [x] ~~`npx tsc` / build / vitest~~ — зелёные по message коммита B1; цепочка продолжена B1.5/B3
- [x] ~~Deploy + smoke перед B2~~ — B2/047 applied; B3 в `main`
- [ ] **Не** запускать `_analysis/handoff-legacy-stage-B1.md` в Claude Code
- [ ] Опционально: header `ARCHIVED` на handoff (руками / отдельным chore)
- [ ] Не коммитить «повторный B1»; не трогать `LEGACY_STAGE_LABELS` / FunnelWidget phases

---

## Итог одной строкой

**B1 сделан (`044253a`); весь S-LEGACY-STAGE-1 закрыт. Handoff — архивный артефакт, не runnable sprint.**
