# Ревью: handoff-legacy-stage-A (S-LEGACY-STAGE-1 · Фаза A)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, grep/read, git history, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/handoff-legacy-stage-A.md` — клиентские **читатели** `projects.stage` → `stage_id` (A0–A4)  
**Контекст:** цепочка S-LEGACY-STAGE-1. Handoff описывает pre-A мир (зеркало `stage` ещё есть, читатели в `components/projects/`). В репо уже: **A `9cc16c5`/`40aca3f`/`9ebc308`/`3875e96`** → B1 `044253a` → B1.5 `f3ec081` → B2 (047 DROP на prod) → B3 `d904172`. Ветка: `main` (ahead origin на 3, unrelated gantt).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Migration Safety Protocol (reads → writes → DROP) | ✅ Архитектурно верно (на момент написания) |
| Scope: только клиент, БД не трогаем | ✅ |
| РАЗВЕДКА + коммиты A1→A4 + `tsc` | ✅ |
| A0 `trackFromPhaseGroup` / 3-трек H2 | ✅ Исполнено в `stage-track.ts` |
| A2/A3/A4 (Card/Table/Peek) | ✅ Совпадают с живым кодом и сообщениями коммитов |
| A1 (chevron) — формулировка handoff | 🟡 Переоценил `handleAdvance`/`handleRevert`; CC удалил мёртвый код |
| Гейт post-A4 только `components/projects/` | 🟡 Пропущены читатели вне папки → B1.5 |
| `moveToStageId(..., legacyStage=null)` | 🟡 Актуально только pre-B1; сейчас сигнатура без legacy |
| **Актуальность handoff vs живой код** | ❌ **Уже исполнен + цепочка закрыта** |
| Контекст «колонка stage живёт / Фаза B дальше» | ❌ На prod 047 DROP + B3 уже сделаны |

**Оценка: 2/10 как runnable-промпт (полностью устарел); 8/10 как исторический техдизайн Фазы A.**  
**Рекомендация: не запускать в Claude Code.** Работа A0–A4 уже в `main` (2026-07-16 ~10:20–10:21 +0300). Повторный прогон — no-op, ложные «правки» поверх B1–B3 (`moveToStageId` без `legacyStage`, `LEGACY_STAGE_LABELS`, нет `stage-mapping.ts`/`STAGE_CONFIG`) или регресс. Цепочка S-LEGACY-STAGE-1 **закрыта**. Handoff оставить как архив.

---

## Статус цепочки S-LEGACY-STAGE-1

| Заход | Статус в репо | Факт |
|-------|---------------|------|
| **A — читатели в `components/projects/`** | ✅ **исполнен** | `9cc16c5` Detail · `40aca3f` Card · `9ebc308` Table+`stage-track.ts` · `3875e96` Peek |
| B1 — убрать клиентские записи `stage` | ✅ `044253a` | `moveToStageId` без legacy; формы не шлют `stage` |
| B1.5 — читатели + select (весь `src/`) | ✅ `f3ec081` | Хвост вне `components/projects/` |
| B2 — DROP `projects.stage` / `deal_stage` | ⚠️ вне репо | 047 applied via MCP 2026-07-16; файла `047_*.sql` нет |
| B3 — regen + снос символов | ✅ `d904172` | `LEGACY_STAGE_LABELS`; `DealStage`/`STAGE_CONFIG`/`deal_stage` сняты |

---

## С чем согласен полностью (дизайн handoff *на момент написания*)

### 1. Порядок «сначала reads, потом writes/DROP»

Контекст handoff верен: `projects.stage` — легаси-зеркало; истина — `stage_id`→`pipeline_stages`; семантический разъезд (order_index 9 vs `contract_review`) — реальный риск UI. Migration Safety Protocol (A reads → B writes → DROP) — правильный operational gate. Подтверждено фактической цепочкой A → B1 → B1.5 → B2 → B3.

### 2. Scope «БД не трогаем. Read-only по схеме»

Соответствует crm-architect: SQL/DROP — Cowork/MCP, не Claude Code. Handoff явно оставляет записи (ProjectModal / win-lost / `mapToLegacyStage`) на Фазу B — корректно для safe-interval.

### 3. Инфраструктура (переиспользовать, не изобретать)

| Утверждение handoff | Живой код |
|---------------------|-----------|
| `usePipelineStages` / `useStagesForPipeline` | `lib/hooks/use-pipelines.ts:29`, `:63` (+ `usePipelineStagesMap:51`) |
| `moveToStageId` | `use-projects.ts:488–503` — сейчас `(id, stageId, options?, extra?)`, payload только `stage_id` (post-B1) |
| StackedPipeline = эталон phase_group | `StackedPipeline.tsx` — треки `attraction/working/approval/closing`, `PHASE_COLOR` |

### 4. A0 / A2 / A3 / A4 — 1:1 с репо

| Подзадача | Handoff | Факт |
|-----------|---------|------|
| A0 `trackFromPhaseGroup` | 3-трек: attraction→Подготовка; working+approval→Эксперимент; closing→Проект | ✅ `lib/utils/stage-track.ts:11–25` (отдельный файл, как допускал handoff) |
| A2 ProjectCard | stage_id only, без `STAGE_CONFIG` | ✅ `ProjectCard.tsx:84–94` — `pipelineStage` из `usePipelineStages`, phase/progress из stage_id |
| A3 ProjectsTable | `trackFromPhaseGroup` + filters + export | ✅ `ProjectsTable.tsx:24–32, 69–71, 124, 303–304` |
| A4 ProjectPeek | `stages…stage_id…name` | ✅ `ProjectPeekContent.tsx:23–24` |
| Completeness stage | `filled: !!project.stage_id` | ✅ `ProjectDetail.tsx:87` |

Сообщения коммитов **совпадают** с handoff (A2/A3/A4 почти дословно; A1 — см. W1).

### 5. Проверочный гейт `tsc` + нативный build

Согласован с learnings/process (build через arm64-мост невозможен). Post-A4 grep «нет читателей `project.stage`» в `components/projects/` — на текущем `main` выполняется: `project.stage\b` / `STAGE_CONFIG[` в `src/components/projects/` = 0 (кроме комментариев).

### 6. Заметки гейта (3-трек H2, curIdx===-1, Фаза B)

- 3-трек через `phase_group` ради H2 — осознанный UX-компромисс; 4 phase_group — отдельно.  
- Internal `stage_id=null` → трек `—` — покрыто `trackFromPhaseGroup` default null.  
- Фаза B (writes → DROP → regen) — **уже сделана** (см. status table).

---

## Блокеры (критично — исправить до запуска)

### B1. Handoff полностью исполнен — повторный запуск в CC запрещён

Коммиты Фазы A уже в `main`:

| Коммит | Содержание |
|--------|------------|
| `9cc16c5` | ProjectDetail: удалён мёртвый legacy-reader (StageProgress, handleAdvance/Revert, STAGE_CONFIG-фолбэки) |
| `40aca3f` | ProjectCard на stage_id |
| `9ebc308` | ProjectsTable + **новый** `stage-track.ts` |
| `3875e96` | ProjectPeek на stage_id |

Дальше цепочка **закрыта**: B1 `044253a` → B1.5 `f3ec081` → B2 (047 DROP, schema.md) → B3 `d904172`.

Запуск handoff «как есть» приведёт к:

- попыткам ввести `legacyStage = null` в API, которого **нет** (`moveToStageId` 3–4 args: options/extra);  
- поиску `handleAdvance`/`getNextStage`/`STAGE_CONFIG`/`mapToLegacyStage`/`stage-mapping.ts` — символы сняты;  
- правкам «win/lost не трогать» при том, что win/lost уже на `moveToStageId`/`stage_id` (B1);  
- ложному «следующий шаг = DROP», хотя 047 + B3 уже применены.

**Действие:** не запускать. Архив. Активная работа — другие спринты (gantt/deps и т.д.).

### B2. Контекст «БД не трогаем / колонка stage живёт» — устарел относительно prod

`schema.md` (crm-architect): **047 DROP legacy `projects.stage`/`deal_stage`** applied via MCP 2026-07-16; сняты колонка, тип, `on_stage_change`/`log_stage_change`, `trg_ab_null_internal_stage`/`null_internal_stage`.  
`supabase.gen.ts` / `types/database.ts` — у projects только `stage_id` (nullable), bare `stage` / `deal_stage` нет.

Любая инструкция «Фаза B с DROP» из этого файла **не должна** исполняться повторно.

---

## Предупреждения (исторические / quality — не для повторного запуска)

### W1. A1: handoff описывал переписывание `handleAdvance`/`handleRevert` — в коде это уже было мёртвым

Handoff A1: «брать `getNextStage(project.stage)` → `useStagesForPipeline` + `moveToStageId(..., null)`».

Фактический `9cc16c5` (body): *«Живой чеврон (DealProgressBar/StackedPipeline) уже на stage_id. Удалён мёртвый код-читатель… handleAdvance/handleRevert…»* (−64/+4 строки).

Сейчас navigation: `DealProgressBar` / `StackedPipeline` + `onStageClick` → `moveToStageId(project.id, newStageId, { onError })` (`ProjectDetail.tsx:532–605`). Отдельных advance/revert-кнопок на legacy enum нет.

**Вывод:** диагностика handoff по строкам ~262–264 / `handleAdvance` была **stale** уже на момент исполнения; CC сделал правильный минимальный diff. При повторном запуске AI снова «восстановит» несуществующий API.

### W2. Post-A4 grep только `src/components/projects/` — неполный гейт

Handoff: после A4 grep в `components/projects/` → «ни одного читателя».  
Урок B1.5 (см. `review-handoff-legacy-stage-B15-readers.md`): остались читатели в `widgets/`, `analytics/`, `shared/`, `contacts/` + явный `PROJECT_COLUMNS` select `stage`.

Для **нового** handoff-шаблона: гейт `grep -rn "\.stage\b" src/` (весь src), не одна папка.

### W3. `moveToStageId(..., legacyStage=null)` — pre-B1 API

Handoff опирается на сигнатуру `moveToStageId(projectId, stageId, legacyStage, opts?)` и `legacyStage = null`.  
Post-B1 (`use-projects.ts:488–503`): legacy-параметра нет; комментарий *«B1: legacy stage больше НЕ пишем»*.  
Инструкции A1 про `null` **нельзя** применять к текущему коду.

### W4. Номера строк и инвентарь

| Handoff | Сейчас |
|---------|--------|
| `moveToStageId` use-projects ~509 | ~488 |
| ProjectCard ~95–105 | ~84–94 |
| ProjectPeek :25 | :23–24 |
| ProjectsTable getTrack 36, 72–74, 127, 307 | 25–26, 69–71, 124, 304 |
| Win/lost 466/574 + `mapToLegacyStage` «не трогать» | win/lost уже без legacy; mapToLegacyStage удалён в B1 |

### W5. A0: handoff допускал `stage-mapping.ts` **или** новый файл

Сделано правильно: отдельный `lib/utils/stage-track.ts` (не смешивать с `mapToLegacyStage`). `stage-mapping.ts` позже удалён в B1 — путь согласован.

### W6. ProjectCard progress: `order_index / totalActive`

Handoff: «как StackedPipeline, НЕ `STAGE_CONFIG.order/12`».  
Код: `Math.round((pipelineStage.order_index / totalActive) * 100)` с fallback `|| 12` (`ProjectCard.tsx:87–94`). Близко к intent; мелкий nuance: `order_index` — абсолютный индекс в пайплайне, не 0-based позиция среди siblings — pre-existing, не блокер handoff.

---

## Пропущенные места (относительно handoff-scope A)

В рамках **заявленного** scope A (`components/projects/` readers) gaps закрыты.  
Вне scope (осознанно / позже B1.5):

| Область | Действие (уже сделано в B1.5/B3) |
|---------|----------------------------------|
| widgets / analytics / company hub / … | Читатели → stage_id / phase_group / status |
| `PROJECT_COLUMNS` bare `stage` | Убран (B1.5) |
| Записи `stage` / `mapToLegacyStage` | B1 |
| DROP column/type | B2 (047 MCP) |
| Regen + `LEGACY_STAGE_LABELS` | B3 |

Текущий grep `src/`: `STAGE_CONFIG` / `getNextStage` / `getPrevStage` / `mapToLegacyStage` / `project.stage\b` как runtime-reader — **0** (только комментарии + `MigrationTool` old-import map + docs в `stage-track.ts`).

---

## Предлагаемые правки в спринт

1. **Не править для запуска** — handoff = archive. При желании шапка:  
   `> ARCHIVED 2026-07-16 — исполнено: 9cc16c5 / 40aca3f / 9ebc308 / 3875e96; цепочка A→B3 закрыта.`
2. Если нужен **исторический** diff для аудита: смотреть git show перечисленных SHA, не re-run.
3. Для будущих handoff'ов: (a) гейт-grep по всему `src/`; (b) РАЗВЕДКА с выводом «символ уже отсутствует → skip»; (c) не хардкодить line numbers без «verify after разведка».

---

## Чеклист перед CC

- [ ] ~~Запускать handoff-legacy-stage-A в Claude Code~~ → **НЕТ**
- [x] A0–A4 уже в `main` (проверить: `stage-track.ts`, Card/Table/Peek/Detail без `project.stage`)
- [x] B1–B3 + 047 DROP уже применены (не повторять DROP / не восстанавливать `stage` writes)
- [x] `npx tsc` / build — не требуются для «исполнения A»; только если идут **новые** правки
- [ ] Не пушить / не коммитить «повтор Фазы A»
- [ ] Handoff не редактировать без явной просьбы; review — stdout/архив рядом

---

## crm-architect checklist (condensed)

| Пункт | Оценка |
|-------|--------|
| Starts with РАЗВЕДКА | ✅ |
| Real table/column names | ✅ (`stage_id`, `pipeline_stages.phase_group`; legacy `stage` — на момент A ещё в схеме) |
| Real file paths | ✅ (`ProjectDetail`/`Card`/`Table`/`Peek`, hooks) |
| learnings.md gotchas | ✅ (нет SQL apply из CC; CASCADE/RLS N/A) |
| SQL migrations separate; not applied from CC | ✅ «БД не трогаем» |
| org_id / RLS | N/A (client display only) |
| SECURITY DEFINER / ACL | N/A |
| No `flowType: 'implicit'` | N/A |
| DELETE CASCADE | N/A |
| CSS variables / theme | ✅ phase colors через tokens (`PHASE_COLOR` / CSS vars) |
| schema.md after migration | N/A для A; 047 отражён в schema.md post-B2 |

**Итог:** handoff был **хорошим pre-flight** для Фазы A (safe reads-first, правильный 3-track helper, атомарные коммиты). На `main` **2026-07-16** он **исторический**: повторный запуск — блокер.
