# Ревью: handoff-gantt-view1 (S-GANTT-VIEW-1)

**Дата:** 2026-07-15  
**Ревьюер:** Grok (верификация по коду `main`, `GanttTimeline.tsx`, roadmap §9.2, `review-spike-gantt-lib-vs-custom.md`)  
**Объект:** `_analysis/handoff-gantt-view1.md` — read-only PM-Гант (фазы A→D)  
**Контекст:** v0 `685864d`, спайк «растить кастом», `useProjectColumns` / `isPhaseBoard` / `is_milestone` в схеме

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Контракт §9.2 (scope in/out) | ✅ |
| Согласованность со спайком (кастом, drag→VIEW-2) | ✅ |
| Фазирование A→D + коммиты по фазам | ✅ |
| `useProjectSchedule` / swimlane data-driven | ✅ |
| Бакет-математика UTC-полдень + MSK | ✅ |
| РАЗВЕДКА vs живой код | ✅ |
| Порядок фаз B/C (ссылка на swimlanes до C) | ❌ Блокер |
| Tooltip: исполнитель + lane на client | 🟡 Недоспецифицировано |
| Sticky + `overflow-x-auto` | 🟡 Риск без layout-контракта |

**Оценка: 8/10.** Архитектура и scope сильные, roadmap §9.2 закрыт. **Перед CC — исправить одну строку в Фазе B** (см. блокер). Остальное — уточнения в промпт, не переписывание.

---

## С чем согласен полностью

### 1. Продуктовый контракт §9.2 — сведён корректно

Сверка с `improvements/CRM-ROADMAP-projects-deals.md` §9.2:

| Требование roadmap | Handoff |
|--------------------|---------|
| Swimlane по фазе СДР | Фаза C + `useProjectSchedule` |
| Bar = task с датами | `effectiveSpan` (наследие v0) |
| Milestone-ромб | C2, `is_milestone` |
| Today line | C3 |
| Zoom week/month | B (+ day как наследие v0) |
| Tooltip | D1 |
| Фильтр open/all/milestones | D2 |
| Drag исключён | Явно → VIEW-2 |

Расхождение review-spike (drag в технике v1) **закрыто** — read-only, drag отложен. Оценка «~2–3 сессии CC» реалистична при фазовых коммитах.

### 2. Решения Cowork — уместны

- Таб **«Гант»** на всех типах проектов (`ProjectDetail.tsx:833` сейчас `Таймлайн`) — ок; `value: 'timeline'` не трогать — правильно (URL/bookmarks не ломаем).
- Fallback `end_date ?? mskDateKey(deadline)` вместо наивного `?? deadline` из §9.5 roadmap — **обязательно** для timestamptz.
- Фаза = `column_id` + `isPhaseBoard(columns)`, не `phase_group` пайплайна — совпадает с `delivery-phases.ts:85–88`.

### 3. РАЗВЕДКА подтверждена по коду

| Команда | Факт |
|---------|------|
| `isPhaseBoard` | `delivery-phases.ts:86–88` — `columns.every(c => c.category === 'phase')` |
| `useProjectColumns` | `use-project-columns.ts:16–34` — `useQuery`, `order position`, realtime |
| `ColumnCategory` `'phase'` | `database.ts:165` |
| `is_milestone` на tasks | `supabase.gen.ts` Row/Insert/Update |
| Таб timeline + `GanttTimeline` | `ProjectDetail.tsx:208, 833, 856–857` |
| v0 для расширения | `GanttTimeline.tsx` 153 строки, `taskSpan`/`buildDays`/`mskDateKey` |

### 4. `useProjectSchedule` — правильный слой

- Реюз `useProjectBoard` + `useProjectColumns`, без нового fetch — совпадает с паттерном хуков CRM.
- Сортировка задач внутри swimlane, orphan `__none__` / «Без фазы», плоский `__flat__` для non-phase досок — логично для client/internal (колонки `backlog|started|…` → `isPhaseBoard` = false).
- `effectiveSpan` дублирует v0 `taskSpan` — осознанно; после Фазы C дубль в `GanttTimeline` удалить.

### 5. Фаза A как безопасный первый коммит

Хук + переименование таба, **GanttTimeline ещё на `useProjectBoard`** — UI не ломается, `tsc` проходит. Соответствует гейту «коммить по фазам».

### 6. Заметки гейта Cowork

- UTC-полдень для бакетов — must (кейс 28–31 марта при month-zoom).
- Виртуализация отложена, плашка при `day && buckets > 180` — из review-spike, хорошо.
- Milestone = `rotate-45`, не картинка — согласуется с `TaskCard.tsx:125–132` (там Lucide `Diamond`, на Ганте CSS-ромб тоже ок).
- Read-only + клик → `TaskModal` — как v0.

---

## Блокер (исправить до запуска CC)

### Фаза B ссылается на `swimlanes` до Фазы C

В Фазе B (строка ~124):

> `min`/`max` диапазона — из всех `swimlanes[].tasks`

Но переход на `useProjectSchedule` — только в **Фазе C**. В B компонент ещё на `useProjectBoard` с плоским списком (как v0).

**Исправление (одна строка в handoff):**

```
min/max диапазона — из всех dated-задач (плоский список, как v0 taskSpan);
после Фазы C источник — schedule.swimlanes.flatMap(sl => sl.tasks).
```

Либо переставить порядок **A → C → B → D** (swimlane раньше zoom) — но тогда zoom придётся сразу считать по swimlanes; текущий порядок A→B→C→D логичнее, если поправить источник min/max в B.

---

## Рекомендации (не блокеры)

### 1. Tooltip D1 — назвать хук и lane-labels для non-delivery

`useProjectBoard` **не** джойнит `assigned_to → profiles` (`use-tasks.ts:75` — только project/company).

Для исполнителя без N+1:

```ts
// один раз в GanttTimeline
const { data: team = [] } = useTeamMembers();
const nameById = useMemo(() => new Map(team.map(m => [m.id, m.full_name])), [team]);
// tooltip: nameById.get(task.assigned_to ?? '') ?? '—'
```

`useTeamMembers` (`use-team-members.ts`) уже есть, staleTime 5 мин — подходит.

**Lane-статус:** в D1 указан только `DELIVERY_TASK_STATUS_LABELS`. На client/internal нужен fallback:

```ts
phaseMode
  ? DELIVERY_TASK_STATUS_LABELS[task.lane]
  : (LANE_CONFIG[task.lane]?.label ?? task.lane)  // validators/task.ts
```

Иначе tooltip на сделке покажет `undefined` для `next`/`now`.

### 2. Sticky labels + today line внутри `overflow-x-auto`

v0 оборачивает грид в `overflow-x-auto` (`GanttTimeline.tsx:82`). `position: sticky; left: 0` на колонке названий **часто не работает** при горизонтальном скролле в одном контейнере.

**Минимальный layout-контракт для C1/C3** (добавить в промпт):

- split: фиксированная левая колонка (`LABEL_W`) + отдельный scrollable timeline body;
- или wrapper `flex` с `shrink-0` labels и `overflow-x-auto` только на grid оси.

Без этого «липкая колонка названий» может не пройти смок на широком диапазоне.

### 3. Флеш `phaseMode` пока грузятся колонки

`isPhaseBoard([])` → `false` (`columns.length > 0` guard). Пока `useProjectColumns` loading, UI кратко в плоском режиме, потом переключится на swimlane.

Для v1 приемлемо; в смоке не считать багом. При желании: `isLoading` → не рендерить тело, только «Загрузка…» (уже есть в schedule).

### 4. Фильтр `milestones` и задачи без дат

`effectiveSpan === null` → `undated`. Веха без дат попадёт в «Без дат», не в фильтр milestones — для delivery-гейтов вехи обычно с deadline; ок. Одной строкой в гейте: «веха без дат — в секции „Без дат“, не в фильтре milestones».

### 5. Фаза B: вынести бакет-хелперы в `date-helpers.ts`

Промпт допускает «в компоненте или date-helpers». Рекомендую **`date-helpers.ts`** + unit-friendly pure functions — меньше дубля с `buildDays`, проще гейтить month/week off-by-one отдельным grep/тестом.

### 6. Дублирование `effectiveSpan` / `taskSpan`

После Фазы C удалить локальные `taskSpan`/`buildDays` из `GanttTimeline.tsx` — явная подзадача в C1, иначе CC оставит два источника правды.

### 7. Milestone-ромб и клик

C2: ромб `<div>` без `onClick` — клик по вехе не откроет TaskModal. v0 кликал по `<button>` бару. **Добавить:** ромб тоже `button` + `onClick={() => onEditTask(task)}` (как бар).

### 8. Пустые swimlane до фильтра

Сейчас колонки фаз рендерятся с `tasks: []`. Roadmap demo подразумевает «4 фазы» — показывать пустые дорожки **до** фильтра — плюс для PM; после фильтра D2 скрывать — согласовано.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА с реальными путями
- [x] Без миграций / без apply из CC
- [x] Типы из `supabase.gen` / derived `Task` — regen не нужен
- [x] CSS-токены, без hardcoded palette
- [x] Optimistic mutations — нет (read-only) ✅
- [x] `npx tsc --noEmit` + нативный build
- [x] Roadmap §9.2 интегрирован (gap из review-spike закрыт)
- [ ] Фаза B: источник min/max — **исправить**

---

## Сводка для гейта Cowork (после D)

1. `npx tsc --noEmit`
2. **Delivery:** 4 фазовые дорожки (data-driven, не хардкод «4»), веха → ромб, клик → TaskModal
3. **Client:** плоский режим, tooltip lane из `LANE_CONFIG`
4. **Zoom:** задача 28–31.03, month-zoom — один бакет марта; week-zoom — не съезжает на пн ISO
5. **Deadline MSK:** полуночный timestamptz → правильный бакет
6. **Фильтры:** open скрывает `lane === 'done'`; milestones — только `is_milestone` с датами
7. **Day-zoom >180 бакетов:** плашка-подсказка, не молчаливый кап
8. **Sticky labels** при горизонтальном скролле — проверить на проекте с длинным планом

---

## Итог

Handoff — **зрелый спринт-промпт**: закрывает review-spike (§9.2, read-only, кастом), хорошо декомпозирован на коммиты, data-layer (`useProjectSchedule`) отделён от view. **Единственный блокер** — противоречие Фазы B (`swimlanes` до C). После правки одной строки + 2–3 уточнения (tooltip/lane, sticky layout, milestone click) — **можно отдавать в Claude Code**.