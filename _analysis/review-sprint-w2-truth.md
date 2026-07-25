# Ревью: Sprint W2 — Правда во времени и цифрах (stale / already shipped)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `999a538`, post-merge; W2-коммит `3cb80b5`)  
**Объект:** `_analysis/sprint-w2-truth.md` — TZ datetime-local · бэкфилл 057 · deal-metrics · один describeEvent · optimistic board-кеша  
**Контекст:** предыдущее ревью `_analysis/review-sprint-w2-truth.md` (2026-07-18) писалось **до** исполнения (статус «нет converters / нет deal-metrics / нет 057»). С тех пор W2 **уже влит и применён**. Повторный прогон CC по этому промпту опасен.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА в промпте (как чеклист) | 🟡 команды устарели относительно HEAD |
| Четыре бага (TZ / KPI / лента / optimistic) | ✅ **уже закрыты** в `3cb80b5` |
| Helpers + модалки datetime-local | ✅ `date-helpers.ts:23–35`, CallModal/TaskModal |
| Миграция 057 | ✅ файл есть, **APPLIED**, UPDATE закомментированы (no-op) |
| deal-metrics + подписи срезов | ✅ `selectors/deal-metrics.ts`, KpiCards + HeroMetrics |
| `currency.ts` | ✅ удалён; `formatBudget` только в `validators/project.ts` |
| describeEvent / FIELD_LABELS | ✅ единый `activity-events.ts`; DashboardHome-копии сняты |
| board optimistic | ✅ create/update/delete + dates → prefix `['tasks']` |
| Тесты unit (1e / 2.5 / 3.3) | ✅ `datetime-local` / `deal-metrics` / `activity-events` |
| Остаточный UTC day-key (`slice(0,10)` на timestamptz) | 🟡 **W1** — вне scope W2, ещё живёт в календаре/Today |
| crm-architect checklist (исторически) | ✅ (DDL только data-backfill; schema.md не менялся — ок) |

**Оценка: 2/10 как handoff «запусти в CC сейчас».** Промпт качественный как **архив реализованного** спринта, но как исполнимый handoff — **stale**: разведка, git add list и «создать 057» противоречат HEAD.  
**Рекомендация:** **не запускать в CC.** Повторная запись тех же файлов/миграции даст churn или (если кто-то раскомментирует UPDATE) **двойной −3ч**. Для остаточных day-key — отдельный micro-sprint, не этот файл.

---

## Статус (репо, 2026-07-19)

| Заход | Статус в репо |
|-------|----------------|
| Коммит W2 | ✅ `3cb80b5` — message совпадает с блоком КОММИТ спринта |
| `datetimeLocalToIso` / `isoToDatetimeLocal` | ✅ `src/lib/utils/date-helpers.ts:23–35` |
| CallModal / TaskModal | ✅ write ISO + read local |
| use-alerts / EventReminder day-key | ✅ `localDateKey(new Date(deadline))` |
| `deal-metrics.ts` | ✅ `src/lib/selectors/deal-metrics.ts` |
| DashboardHome.KpiCards | ✅ `dealMetrics(projects)` + sub «все направления» / «за всё время» |
| PipelineBoard.HeroMetrics | ✅ `dealMetrics(..., { pipelineId, stages })` + sub «по текущему пайплайну» |
| `currency.ts` | ✅ отсутствует |
| `describeEvent` / FIELD_LABELS / automation / entity_deleted | ✅ `activity-events.ts` |
| DashboardHome local describeEvent | ✅ импорт из activity-events (нет локальной копии) |
| useCreate/Update/DeleteTask + useUpdateTaskDates | ✅ `snapshotTaskCaches` / `patchTaskCaches` / `rollbackTaskCaches` |
| `057_backfill_datetime_tz.sql` | ✅ APPLIED `20260718085820`; body commented |
| Unit tests | ✅ 3 файла, ~276 строк |
| `slice(0,16)` в `src/components` | ✅ пусто (проверка спринта проходит) |
| `function describeEvent` count | ✅ 1 |

---

## Разведка (live vs утверждения спринта)

| Утверждение спринта | Live HEAD | Примечание |
|---------------------|-----------|------------|
| «Нужно добавить datetimeLocalToIso/iso…» | ❌ уже есть | Sprint describes *pre-fix* state |
| `slice(0,16)` prefill в components | ✅ **пусто** | Разведка спринта устарела |
| CallModal onSubmit raw date | ❌ | `:144` уже `datetimeLocalToIso` |
| TaskModal deadline slice prefill | ❌ | `:115/131` `isoToDatetimeLocal` |
| use-alerts `deadline.slice(0,10)` | ❌ | localDateKey + comment W2 |
| Dual formatBudget / currency import | ❌ | currency gone; 0 imports |
| KpiCards своя формула active≠won/lost | ❌ | `dealMetrics` @ `:130` |
| PipelineBoard своя формула | ❌ | `dealMetrics` @ HeroMetrics |
| Dual describeEvent DashboardHome ~690 | ❌ | import-only |
| create/update/delete патчат только `['tasks']` | ❌ | prefix helpers `:18–36`, create `:230–236` |
| useProjectBoard = `Task[]` | ✅ | `:97–107` — спринт верно предупреждал |
| automation payload 050 | ✅ | `rule_id, trigger, action, trigger_key` — **без name** |
| automation payload 051 | ✅ | `rule_id, trigger, action, task_id` — **без name** |
| `calls.date` / `tasks.deadline` timestamptz | ✅ | schema.md |
| meetings.date date-only | ✅ | не трогать — верно (и не тронуто) |
| Номер 057 «написать» | ❌ | файл есть, applied, no-op |

Диагностические `sed`-якоря спринта (`DashboardHome` 160–215, `PipelineBoard` 115–150) описывают **pre-W2** тело; сейчас на этих диапазонах — уже post-W2 код.

---

## С чем согласен полностью (как с **историческим** дизайном W2)

### 1. TZ write/read path (1a–1b)
Пара `datetimeLocalToIso` / `isoToDatetimeLocal` через `localDateTimeKey` — правильный фикс; `new Date('YYYY-MM-DDTHH:mm')` = local — ок. Реализация в HEAD совпадает со сниппетом спринта (с валидацией `isNaN` на iso→local).

### 2. Граница «не трогать»
meetings (date + time), scheduled_calls — date-only/time path. Верно; в W2-коммите не задеты.

### 3. Бэкфилл 057 + gate
−3h + `DEPLOY_TS` = published_at фронта (не merge) + SELECT-превью — корректный процесс. В файле зафиксировано: `DEPLOY_TS = 2026-07-18T08:41:05.247Z`, Netlify `rococo-quokka-4ae212`, commit `488f3af`. UPDATE закомментированы после apply — **идемпотентность/safety** (повторный −3ч невозможен без ручного uncomment).

### 4. dealMetrics + семантика active
`active = type=client AND status=open` (on_hold вне active) + подписи срезов — осознанная унификация KPI. Тесты покрывают exclusion / conversion 0 / weighted.

### 5. Один describeEvent + FIELD_LABELS
Сырые `stage_id`/`won_reason` убраны; legacy `stage` при `stage_id` фильтруется; default `Событие: <type>`; entity_deleted / ai_summary / automation_fired — в shared path. DashboardHome локальную копию снял.

### 6. Optimistic prefix
Board-кеш = `Task[]`; create фильтрует board по `project_id`; update/delete/dates — общий helper. Ровно то, что просил спринт.

### 7. Процесс
Миграция файлом, apply не из CC; типы не руками; unit-тесты; commit message/list — совпали с фактом `3cb80b5`.

---

## Блокеры (критично — до **повторного** запуска)

### B1. Спринт уже выполнен — re-run = антипаттерн
**Доказательство:** `git show 3cb80b5` (17 files, +563/−187), message идентичен блоку КОММИТ.  
**Риск CC:** переписать рабочие converters/metrics/optimistic; «создать» 057 поверх applied-маркера; `git rm currency.ts` (уже нет → fail); конфликт с post-W2 правками (WBS fields в optimistic task, Gantt, quotes и т.д.).  
**Действие:** не отдавать файл в CC as-is. Если нужен «хвост» — новый handoff только по residual day-key.

### B2. Миграция 057 нельзя «применять снова»
Файл помечен `APPLIED 2026-07-18`; UPDATE закомментированы **намеренно** (сдвиг не идемпотентен). Промпт говорит «пишем 057 / apply на гейте» — это pre-ship инструкция. Повторный apply по тексту спринта (раскомментированный UPDATE) **сдвинет данные ещё на −3ч**.

### B3. Разведка и «создать с нуля» вводят CC в заблуждение
Команды `grep slice(0,16)`, `sed KpiCards`, «новый файл deal-metrics», «удалить currency» — все дают **post-fix** картину. CC без чтения HEAD легко «переизобретёт» уже существующие API и сломает callers.

**Итого блокеры:** не исправлять текст спринта для «запуска» — **не запускать**. Опционально: пометить шапку файла `STATUS: SHIPPED 3cb80b5 / 057 applied` (по явной просьбе; сейчас файл не трогаем).

---

## Предупреждения (residual / качество, не блокируют «не запускать»)

### W1. UTC day-key на timestamptz всё ещё в UI (вне scope W2, но тот же класс бага)
Спринт чинил use-alerts + EventReminder (+ в коммите ещё DashboardHome urgent + TasksSidebar). **Остались** голые `slice(0,10)` / `dayPart` на `calls.date` / `tasks.deadline`:

| Файл | Строки | Поле |
|------|--------|------|
| `src/components/calendar/CalendarView.tsx` | 63, 87 | `c.date`, `t.deadline` |
| `src/components/today/TodayView.tsx` | 32, 66, 71 | `dayPart(c.date)` |
| `src/components/layout/ActivityDrawer.tsx` | 126, 128 | pending calls, task deadlines |
| `src/components/calls/CallTracker.tsx` | 21 | `c.date` |
| `src/components/widgets/StatsWidget.tsx` | 55 | `c.date` |
| `src/components/widgets/WeeklyHeatmap.tsx` | 29 | `c.date` |
| `src/components/dashboard/OverviewCharts.tsx` | 190 | `c.date` |

`meetings.date` / `next_action_date` / `projects.deadline` (date) — slice ок (date-only).  
**Смок спринта «15:00 в календаре»:** *время* в CalendarView через `getHours()` локально ✅; *день* для 00:00–02:59 МСК может уехать на вчера из-за UTC-ключа 🟡.

### W2. `relativeTime` — не «одна реализация»
Проверка спринта: `grep function relativeTime` → ожидалась 1. Факт:

- `activity-events.ts:109` (shared)
- `EntityTimeline.tsx:48` (своя, + future «вперёд»)
- `NotificationBell.tsx:45` (своя формулировка «мин/ч»)

DashboardHome-копия снята — scope задачи 3 выполнен частично; полный дедуп не сделан (и не критичен).

### W3. automation_fired — «имя правила» в payload нет
Как в pre-W2 ревью: 050/051 пишут `rule_id` + `trigger` (+ `action`/`task_id`), **не** name. Live: `Сработала автоматизация: просроченная задача` / `смена стадии` — разумно. Фраза спринта «имя правила/задачи» literal недостижима без join `automation_rules` или расширения payload (отдельный DDL/trigger change — **не** этот спринт).

### W4. useMoveTask / useReorderTasks не на общем helper
Задача 4: create/update/delete (+ dates).  
`useMoveTask` (`:151–161`) патчит только `['tasks','board',projectId]`; `useReorderTasks` — только `QUERY_KEY`. Для drag колонок с project_id это ок; личный борд/reorder lane — отдельный path. Не регресс W2, но «одна механика» не 100%.

### W5. Предыдущий review-файл stale
`_analysis/review-sprint-w2-truth.md` (2026-07-18) всё ещё говорит «запускать в CC / converters нет». Этот документ — **supersede**.

### W6. schema.md / skill schema
057 — data-only backfill, колонок/функций нет → обновление schema.md не требовалось (чеклист crm-architect ✅). Номер 057 в skill-header «Pending / applied chain» может отставать от 058+ — вне scope этого спринта.

---

## Пропущенные места (если бы W2 ещё писали)

| Файл | Строки | Действие |
|------|--------|----------|
| `CalendarView.tsx` | 63, 87 | `localDateKey(new Date(...))` для timestamptz |
| `TodayView.tsx` | 32 → callers 66/71 | `dayPart` для calls → localDateKey; meetings оставить date-string |
| `ActivityDrawer.tsx` | 126, 128 | то же для calls/tasks |
| `CallTracker` / `StatsWidget` / `WeeklyHeatmap` / `OverviewCharts` | см. W1 | day-key для `calls.date` |
| `use-tasks.ts` `useMoveTask` | 151+ | опционально: personal board patch (вне W2) |

Сейчас — backlog follow-up, **не** пункты для re-run sprint-w2-truth.

---

## Предлагаемые правки в спринт (если трогать файл)

1. В шапку: `STATUS: SHIPPED 2026-07-18 · commit 3cb80b5 · 057 applied (no-op body)`.
2. Заменить «ЗАДАЧА 1–4» на «DONE checklist» со ссылками на пути/строки HEAD.
3. Убрать инструкции «создать 057 / git rm currency / apply gate» или пометить ⛔ DO NOT RE-APPLY.
4. Вынести residual day-key (W1) в `_analysis/sprint-w2b-daykeys.md` (или handoff), не в этот промпт.
5. Уточнить automation: «лейбл trigger_type, не rule.name» — как сделано.

*(По правилам headless-ревью файл спринта не редактируем.)*

---

## Чеклист перед CC

- [x] ~~РАЗВЕДКА~~ — актуальна только как история; live уже post-W2  
- [x] ~~Реальные колонки calls.date / tasks.deadline~~ — timestamptz, ок  
- [x] ~~Миграция отдельным файлом, apply не из CC~~ — сделано; **не повторять**  
- [x] ~~Типы не руками~~ — соблюдено  
- [x] ~~Тесты converters / metrics / events~~ — есть  
- [ ] **Не запускать** этот handoff в Claude Code  
- [ ] При необходимости residual TZ day-key — **новый** короткий sprint, не W2  
- [ ] Не раскомментировать UPDATE в `057_backfill_datetime_tz.sql`  
- [ ] Обновить/архивировать stale pre-ship review при желании порядка в `_analysis/`

---

## crm-architect checklist (condensed)

| Пункт | Статус |
|-------|--------|
| Starts with РАЗВЕДКА | ✅ (в промпте; output сейчас stale) |
| Real table/column names | ✅ |
| Real file paths | ✅ (на момент написания) |
| learnings.md gotchas | ✅ gate apply, no CLI push |
| SQL separate; not applied from CC | ✅ |
| org_id / RLS | N/A (data UPDATE same rows) |
| New SECURITY DEFINER | N/A |
| No `flowType: 'implicit'` | N/A |
| DELETE CASCADE | N/A |
| CSS variables | N/A |
| schema.md after new migration | N/A (no DDL) |

---

**Итог одной строкой:** W2 «Правда во времени и цифрах» **уже в `main` (`3cb80b5`) + 057 applied**; `_analysis/sprint-w2-truth.md` — хороший архив scope, **плохой executable handoff**. CC не запускать; residual — UTC day-key в Calendar/Today/widgets (follow-up).
