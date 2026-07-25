# Ревью: handoff-legacy-stage-B15-readers (S-LEGACY-STAGE-1 · B1.5)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, grep/read, crm-architect `schema.md` / `architecture.md` / `learnings.md`, git history)  
**Объект:** `_analysis/handoff-legacy-stage-B15-readers.md` — миграция читателей `p.stage` → `stage_id` / `status` / `phase_group` + снятие `stage` из `PROJECT_COLUMNS` (перед DROP)  
**Контекст:** цепочка S-LEGACY-STAGE-1; handoff написан **до** исполнения. В репо уже: B1 `044253a` → **B1.5 `f3ec081`** → B3 `d904172`; B2 (миграция 047 DROP) — на проде через MCP (файла `047_*` в `supabase/migrations/` нет). Ветка: `main` (ahead origin на 2, unrelated gantt commits).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз «хвост Фазы A + явный select = блокер DROP» | ✅ Верно (на момент написания) |
| Список 4 label-читателей | ✅ Были реальными |
| FunnelWidget / phase_group 1:1 → 4 фазы | ✅ Маппинг верный для deal-пайплайнов |
| `PROJECT_COLUMNS` без bare `stage` | ✅ Критично для post-DROP |
| Гейт «гейт по всему `src/`, не только `components/projects/`» | ✅ Главный урок Фазы A |
| Scope: только клиент, БД не трогаем | ✅ |
| **Актуальность handoff vs живой код** | ❌ **Уже исполнен** |
| Имя хелпера `useStagesMap` | 🟡 В коде `usePipelineStagesMap` |
| `phaseFromPhaseGroup` в `stage-track.ts` | 🟡 Не вынесен; inline-map |
| Семантика WeeklyReview (как в handoff) | 🟡 Сделано иначе (и ок) |
| Инвентарь файлов (7 читателей) | 🟡 Неполный — CC нашёл больше |
| РАЗВЕДКА в начале промпта | 🟡 Есть только «ПРОВЕРКА» в конце |

**Оценка: 3/10 как runnable-промпт (устарел); 8/10 как исторический техдизайн.**  
**Рекомендация: не запускать в Claude Code.** Работа B1.5 уже в `main` (`f3ec081`). Повторный прогон даст no-op, конфликты переименований или регресс поверх B3. Следующий шаг цепочки — **не B1.5**, а уже сделанный B3 / другие спринты; handoff оставить как архив.

---

## Статус цепочки S-LEGACY-STAGE-1

| Заход | Статус в репо | Факт |
|-------|---------------|------|
| A — читатели в `components/projects/` | ✅ | ProjectCard/Detail/Peek/Table/StageBoard/… на `stage_id` |
| B1 — убрать клиентские **записи** `stage` | ✅ `044253a` | `moveToStageId` без legacy; формы не шлют `stage` |
| **B1.5 — читатели + select** | ✅ **`f3ec081`** | 13 файлов; `tsc`/`build`/`vitest` зелёные по сообщению коммита |
| B2 — DROP `projects.stage` / `deal_stage` | ⚠️ вне репо | `047` applied на prod; файла миграции в репо нет |
| B3 — regen + снос символов | ✅ `d904172` | `LEGACY_STAGE_LABELS`; `DealStage`/`STAGE_CONFIG` сняты |

---

## С чем согласен полностью (дизайн handoff)

### 1. Диагноз и гейт DROP

Handoff правильно фиксирует:

- Фаза A чистила только `components/projects/` → остались читатели в `widgets/` / `analytics/` / `shared/` / `contacts/`.
- `useProjects()` → **явный** `PROJECT_COLUMNS` с `stage` после DROP даёт **runtime 400**, не tsc-ошибку (тип `Project.stage` ещё жил в gen).
- Гейтить DROP нужно по **всему `src/`** + по явным select, не по одной папке.
- `select('*')` пережил бы DROP; **именованный список — нет**.

Это согласуется с `schema.md` (legacy `stage` / DROP 047) и learnings (nullable `stage_id` только для non-client; источник истины стадии — `stage_id` → `pipeline_stages`).

### 2. Маппинг deal `phase_group` → UI-фазы

```
attraction → attract
working    → develop
approval   → negotiate
closing    → close
```

Совпадает с `architecture.md` (StackedPipeline: attraction/working/approval/closing) и **не** путает с delivery-слагами `initiated`/`planning`/`execution`/`completed` (`schema.md` / 035). FunnelWidget фильтрует `type === 'client'` — delivery-пайплайны не смешиваются. ✅

### 3. Label-читатели (D)

На момент handoff цели были верны:

| Файл (handoff) | Сейчас в коде |
|----------------|---------------|
| `ContactDetailHub.tsx` | `usePipelineStagesMap` + `stagesMap.get(p.stage_id)?.name` (~519) |
| `CommandPalette.tsx` | то же, `sub:` с `?? undefined` (~188) |
| `ContactDetail.tsx` | то же (~221) |
| `DeadlineRadar.tsx` | то же (~49) |

Предупреждение про full `pipeline_stages.name` vs `shortLabel` — корректное UX-следствие.

### 4. `PROJECT_COLUMNS` (E)

Сейчас (`use-projects.ts:137–146`):

```
… contact_id, budget … stage_id, … status … actual_close_date, stage_entered_at …
```

Bare `stage,` **отсутствует**. Handoff-задача E выполнена.

### 5. Scope «БД не трогаем»

Правильный контракт: B1.5 = клиент + деплой; DROP = Cowork B2. Согласовано с процессом CC/Cowork в learnings.

---

## Блокеры (критично — **не запускать** этот handoff)

### B1. Handoff уже исполнен — промпт устарел

Коммит **`f3ec081`** (`fix(stage): убрать явный select projects.stage + мигрировать читателей (B1.5, перед DROP)`):

| Задача handoff | Реализация |
|----------------|------------|
| A. map-хук | `usePipelineStagesMap()` в `use-pipelines.ts:51–58` (не `useStagesMap`) |
| B. FunnelWidget | `FunnelWidget.tsx` — `PHASE_GROUP_TO_PHASE` + `phaseOf(p.stage_id)` |
| C. WeeklyReview | мигрирован, **другая** семантика (см. W2) |
| D. 4 label-ридера | все 4 на `stage_id`→`name` |
| E. `PROJECT_COLUMNS` | bare `stage` снят |

Дополнительно (вне списка handoff, но нужно для DROP-safe):

- `ExportPanel.tsx` — CSV стадия через map  
- `DashboardHome.tsx` — «Воронка по стадиям» на `stage_id`  
- `CompanyDetail.tsx` — убран legacy-фолбэк (handoff писал «НЕ трогать» — в живом коде **тронули правильно**)  
- `use-entity-timeline.ts` + `lib/timeline/adapters.ts` — select/адаптер без `stage`

После B1.5 уже прошли **B2 DROP** и **B3** (`d904172`: `LEGACY_STAGE_LABELS`, нет `STAGE_CONFIG`/`DealStage` в рантайме). Запускать B1.5 сейчас = работа против HEAD.

### B2. Инструкции handoff конфликтуют с текущим API

Если CC буквально выполнит handoff:

1. Добавит **второй** хук `useStagesMap` рядом с живым `usePipelineStagesMap` → дубль.  
2. Добавит `phaseFromPhaseGroup` в `stage-track.ts`, хотя Funnel/Dashboard уже на inline `PHASE_GROUP_TO_PHASE`.  
3. Перепишет WeeklyReview на `stage_entered_at` / `actual_close_date` — **намеренная** смена продуктовой семантики поверх уже задеплоенного поведения.  
4. Попытается убрать `STAGE_CONFIG` из импортов, которых **уже нет** (B3).

Это не «мелкие правки» — это конфликт с post-B3 деревом.

---

## Предупреждения (исторические / follow-up, не для запуска B1.5)

### W1. Нет блока «РАЗВЕДКА» в начале

Чеклист crm-architect: спринт должен стартовать с diagnostic commands **до** правок. Здесь только «ПРОВЕРКА» в конце. Для будущего handoff-шаблона — перенести grep вверх.

Grep из handoff сейчас (с фильтром) почти пуст по `p.stage`/`STAGE_CONFIG`/`getPhaseForStage` — ложные: CSS `.stage-progress`, `chartData[idx]?.stage` (это **UUID stage_id**, не enum).

### W2. WeeklyReview: handoff ≠ факт `f3ec081`

| Метрика | Handoff предлагал | Сделано в коде |
|---------|-------------------|----------------|
| `projectsWon` | `status === 'won'` + `inWeek(actual_close_date ?? updated_at)` | `status === 'won'` + `inWeek(updated_at)` только (`WeeklyReview.tsx:51`) |
| `projectsMoved` | `stage_entered_at` in week | `inWeek(updated_at) && !atEntryStage(stage_id)` — min `order_index` per pipeline (`:37–50`) |

Оба подхода уходят с legacy `new_lead`/`.stage`. Handoff-вариант **точнее** для «сменили стадию» / «выиграли» (поля уже в `PROJECT_COLUMNS`), но **не был** принят. Отдельный микро-спринт «WeeklyReview precision» возможен; **не** переоткрывать B1.5.

### W3. `phaseFromPhaseGroup` / `useStagesMap` — имена в комментариях

- Хук: **`usePipelineStagesMap`**.  
- Map phase_group→Phase: **inline** в `FunnelWidget.tsx:10–15` и дубль string-map в `DashboardHome.tsx:47+`.  
- `trackFromPhaseGroup` в `stage-track.ts` — 3-трек UI (Подготовка/Эксперимент/Проект), **не** 4-фазная воронка; handoff верно кладёт 4-фазный map отдельно, но в итоге map не в `stage-track.ts`.  
- Комментарий в `validators/project.ts:8` всё ещё пишет `useStagesMap` — косметика post-B3.

### W4. Неполный inventory «7 читателей»

Фактический diff B1.5 — **13 files**. Пропущенные в handoff, но нужные:

| Файл | Зачем |
|------|--------|
| `ExportPanel.tsx` | CSV колонка «Стадия» |
| `DashboardHome.tsx` | chart/drilldown по stage |
| `CompanyDetail.tsx` | legacy-фолбэк на `p.stage` |
| `use-entity-timeline.ts` / `adapters.ts` | явный select + row shape |

`Charts.tsx` уже был на `stage_id`→`phase_group` до/вне этого handoff — ок.

### W5. `MigrationTool.tsx` (вне scope B1.5)

`STAGE_MAP` → пишет `stage: 'new_lead'|…` в import payload (`MigrationTool.tsx:31,110,114`). После DROP 047 это **отдельный** риск (one-off migration UI), не блокер B1.5 и не задача handoff. Имеет смысл в backlog, не в этом ревью как «пропущенный файл B1.5».

### W6. Строки в handoff (~15, ~36–37, ~141, :517, :187, :219, :48)

После `f3ec081`/`d904172` номера сдвинуты. Для архива — ок; для повторного CC — нельзя опираться.

---

## Пропущенные места (относительно **исходного** handoff; в HEAD уже закрыты)

| Файл | Что было нужно | Статус HEAD |
|------|----------------|-------------|
| `lib/hooks/use-pipelines.ts` | map-хук | ✅ `usePipelineStagesMap` |
| `components/widgets/FunnelWidget.tsx` | phase_group | ✅ |
| `components/analytics/WeeklyReview.tsx` | won/moved без `.stage` | ✅ (иная семантика) |
| `ContactDetailHub` / `CommandPalette` / `ContactDetail` / `DeadlineRadar` | label | ✅ |
| `lib/hooks/use-projects.ts` `PROJECT_COLUMNS` | убрать `stage` | ✅ |
| `ExportPanel.tsx` | label в CSV | ✅ (не в handoff) |
| `DashboardHome.tsx` | chart stage | ✅ (не в handoff) |
| `CompanyDetail.tsx` | legacy fallback | ✅ (handoff «не трогать» — overriden) |
| `use-entity-timeline.ts` | select | ✅ |

**Живых `p.stage` / `STAGE_CONFIG` runtime-читателей проектов в `src/` нет** (кроме исторических `LEGACY_STAGE_LABELS` для `activity_log.stage_change`).

---

## Предлагаемые правки в спринт

**Не править для запуска** — handoff закрыт кодом. Если нужна гигиена документов:

1. В шапке handoff добавить:  
   `STATUS: DONE · f3ec081 · 2026-07-16 · не запускать в CC`.
2. В цепочке B3 / BACKLOG: опционально «WeeklyReview: `actual_close_date` + `stage_entered_at`» как product-уточнение.
3. Поправить комментарий `useStagesMap` → `usePipelineStagesMap` в `validators/project.ts` (мелочь, не блокер).
4. Не путать с `handoff-legacy-stage-B3.md` — B3 уже тоже в `d904172`; ревью B3 (`review-handoff-legacy-stage-B3.md`) писалось, когда B3 ещё не стартовал; **сейчас B3 тоже done**.

---

## Чеклист crm-architect (condensed)

- [x] Реальные имена колонок/таблиц (`stage_id`, `status`, `phase_group`, `actual_close_date`, `stage_entered_at`) — schema  
- [x] Реальные пути файлов (частично; inventory неполный)  
- [x] learnings: client `stage_id` NOT NULL; delivery `phase_group` не смешивать — handoff на deal-слагах  
- [x] SQL-миграций нет; CC БД не трогает  
- [x] org/RLS не затронуты  
- [x] CSS не затронут  
- [ ] Явная «РАЗВЕДКА» в начале — нет  
- [x] schema.md update — не требуется (нет DDL в B1.5)  
- [x] DELETE/CASCADE / SECURITY DEFINER — N/A  

---

## Чеклист перед CC

- [x] ~~Запускать B1.5 в CC~~ → **нет, уже в main**  
- [x] `PROJECT_COLUMNS` без bare `stage`  
- [x] Label/funnel/weekly/export/dashboard readers на `stage_id`  
- [x] B2 DROP на проде (по цепочке; файла 047 в репо нет — governance, не блокер клиента)  
- [x] B3 regen + `LEGACY_STAGE_LABELS`  
- [ ] (опц.) WeeklyReview precision на `stage_entered_at` / `actual_close_date` — новый мини-промпт  
- [ ] (опц.) `MigrationTool` post-DROP — backlog  

---

## Итог

Handoff B1.5 **был** правильным блокером-хвостом перед DROP и хорошо сформулировал гейт. На `main` **2026-07-16** он **уже выполнен** (`f3ec081`) с расширениями inventory и расхождениями имён/WeeklyReview; за ним прошли B2 и B3. **В Claude Code не отдавать.** Пометить документ как DONE / archive.
