# Claude Code — Sprint: S-GANTT-VIEW-1 (read-only PM-Гант, строго roadmap §9.2)

Наращиваем v0 `GanttTimeline.tsx` до продуктового v1 по §9.2. **Read-only** (drag — VIEW-2/v2).
Решение спайка: **растить кастом, без либы** (`_analysis/spike-gantt-lib-vs-custom.md`).
Разбито на 4 коммит-фазы A→D — **коммить и присылай отчёт после каждой** (гейтим по фазам, не мега-коммитом).

## Контракт §9.2 (verified 2026-07-15)
Включено v1: swimlane по фазе СДР · bar=task с датами · milestone=ромб (`is_milestone`) · today line ·
zoom week/month · tooltip (название/исполнитель/lane) · фильтр (открытые/все/milestones).
Исключено v1: drag, critical path, resource histogram, baseline, export.

**Решения (уточнено с Cowork):** таб на **всех** типах проектов (не только delivery), переименовать «Таймлайн»→**«Гант»**.
Fallback конца — наш `end_date ?? mskDateKey(deadline)` (НЕ наивный §9.5 `?? deadline`).

## РАЗВЕДКА (architecture.md устарел — сверяем по факту)
```bash
cd ~/Downloads/dashboard-crm/src
grep -n "category === 'phase'\|isPhaseBoard" lib/constants/delivery-phases.ts
grep -n "export function useProjectColumns" -A15 lib/hooks/use-project-columns.ts
grep -n "ColumnCategory" types/database.ts            # ожидаем ...| 'phase'
grep -n "is_milestone" types/supabase.gen.ts          # поле на tasks (Row/Insert/Update)
grep -n "'activity' | 'board' | 'timeline'\|value: 'timeline'\|label: 'Таймлайн'\|<GanttTimeline" components/projects/ProjectDetail.tsx
sed -n '1,80p' components/tasks/GanttTimeline.tsx      # текущий v0 — расширяем его
```

---

## ФАЗА A — переименование таба + хук `useProjectSchedule` (спина данных)

### A1. Таб «Таймлайн» → «Гант» (`components/projects/ProjectDetail.tsx`)
- В массиве табов `label: 'Таймлайн'` → `label: 'Гант'`. Значение `value: 'timeline'` НЕ трогать (внутренний ключ). На всех типах — гейта по `type` НЕ добавляем.

### A2. Новый хук `src/lib/hooks/use-project-schedule.ts`
Селектор над `useProjectBoard` + `useProjectColumns` — фаза (swimlane) + effective span + milestone. Компонент не считает это сам.
```ts
'use client';

import { useMemo } from 'react';
import { useProjectBoard } from './use-tasks';
import { useProjectColumns } from './use-project-columns';
import { isPhaseBoard } from '@/lib/constants/delivery-phases';
import { mskDateKey } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

export interface GanttTask {
  task: Task;
  start: string;          // YYYY-MM-DD (MSK для deadline)
  end: string;            // YYYY-MM-DD; == start у однодневных
  isMilestone: boolean;   // is_milestone === true — рендерим ромбом на start
}
export interface GanttSwimlane {
  id: string;             // column.id | '__none__' | '__flat__'
  label: string | null;   // имя фазы; null → без заголовка (плоский режим)
  tasks: GanttTask[];
}
export interface ProjectSchedule {
  swimlanes: GanttSwimlane[];
  undated: Task[];        // ни start/end/deadline
  phaseMode: boolean;
  isLoading: boolean;
  isError: boolean;
}

// effective span: deadline (timestamptz) → MSK-дата; fallback + inversion-клэмп (как v0)
function effectiveSpan(task: Task): { start: string; end: string } | null {
  const dl = task.deadline ? mskDateKey(task.deadline) : null;
  const start = task.start_date ?? task.end_date ?? dl;
  let end = task.end_date ?? dl ?? task.start_date;
  if (!start || !end) return null;
  if (end < start) end = start;
  return { start, end };
}

export function useProjectSchedule(projectId: string): ProjectSchedule {
  const { tasks, isLoading: tL, isError: tE } = useProjectBoard(projectId);
  const { data: columns = [], isLoading: cL, isError: cE } = useProjectColumns(projectId);

  return useMemo(() => {
    const phaseMode = isPhaseBoard(columns);
    const undated: Task[] = [];
    const byLane = new Map<string, GanttTask[]>();

    for (const task of tasks ?? []) {
      const span = effectiveSpan(task);
      if (!span) { undated.push(task); continue; }
      const gt: GanttTask = { task, ...span, isMilestone: task.is_milestone === true };
      const laneId = phaseMode ? (task.column_id ?? '__none__') : '__flat__';
      const arr = byLane.get(laneId) ?? [];
      arr.push(gt);
      byLane.set(laneId, arr);
    }

    let swimlanes: GanttSwimlane[];
    if (phaseMode) {
      swimlanes = [...columns]
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, label: c.name, tasks: byLane.get(c.id) ?? [] }));
      const orphan = byLane.get('__none__');
      if (orphan?.length) swimlanes.push({ id: '__none__', label: 'Без фазы', tasks: orphan });
    } else {
      swimlanes = [{ id: '__flat__', label: null, tasks: byLane.get('__flat__') ?? [] }];
    }
    for (const sl of swimlanes) {
      sl.tasks.sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
    }
    return { swimlanes, undated, phaseMode, isLoading: tL || cL, isError: tE || cE };
  }, [tasks, columns, tL, cL, tE, cE]);
}
```
**Коммит A:** `feat(gantt): переименование таб «Гант» + useProjectSchedule (swimlane по фазе)`. GanttTimeline ещё на useProjectBoard — не ломается. tsc чисто.

---

## ФАЗА B — zoom day/week/month + ось на бакетах
GanttTimeline: заменить «ось из дней» на **бакеты**. Состояние `const [zoom, setZoom] = useState<'day'|'week'|'month'>('week')` (§9.2 — week/month; day = наследие v0). Переключатель — 3 кнопки над таймлайном (токены как у таб-кнопок).

**Бакет-хелперы — вынести в `src/lib/utils/date-helpers.ts`** (pure, тестируемые; меньше дубля с `buildDays`, off-by-one недели/месяца гейтится отдельно). **ВСЯ математика на UTC-полдне** (как v0 `buildDays`), иначе off-by-one на границе недели/месяца:
- `bucketKeyOf(dateKey, zoom)`:
  - day → сам `dateKey`;
  - week → понедельник недели (ISO, floor к Mon) как `YYYY-MM-DD`;
  - month → `YYYY-MM-01`.
- `buildBuckets(minKey, maxKey, zoom)` → `{ key, label }[]`: итерировать от `bucketKeyOf(min)` до `bucketKeyOf(max)` шагом (day=+1день / week=+7дней / month=+1месяц через UTC), label: day=`DD`(+месяц на 1-м/нулевом), week=`DD.MM`, month=`MMM YYYY` (ru).
- `bucketIndexOf(dateKey, zoom, buckets)` → индекс через Map по `bucketKeyOf`.
- Бар: `gridColumn: idx(start)+1 / idx(end)+2` (как v0, но idx — по бакетам).
- **Источник `min`/`max` диапазона:** в Фазе B компонент ещё на `useProjectBoard` (плоский dated-список, как v0) → min/max по нему. **После Фазы C** источник — `schedule.swimlanes.flatMap(sl => sl.tasks)`. (Не ссылаться на `swimlanes` в B — их ещё нет.)

**Виртуализация — числовой триггер (§10):** если `zoom==='day'` и `buckets.length > 180` → показать неблокирующую плашку «Широкий диапазон — переключи на неделю/месяц» (не резать молча). Реальную виртуализацию НЕ делаем (v1 долг: >365 дн / >200 задач).

**Коммит B:** `feat(gantt): zoom day/week/month на бакет-оси`. Смок: бар на 3 днях при week-zoom лежит в правильных неделях; месяц не съезжает на границе.

---

## ФАЗА C — swimlane (фазы) + milestone-ромб + today line
### C0. Layout-контракт (иначе sticky не работает — Grok-ревью)
v0 кладёт колонку названий и ось в ОДИН `overflow-x-auto` (`shrink-0`-колонка уедет при скролле → «липкая» не липнет). Переструктурировать:
**фиксированная левая колонка названий (`LABEL_W`, `shrink-0`, вне скролла) + ОТДЕЛЬНЫЙ scrollable timeline-body (`overflow-x-auto` только на оси)** — `flex`-обёртка. Шапка бакетов, ряды и today-оверлей живут внутри timeline-body, названия строк/фаз — в левой колонке (выровнены по высоте рядов). Это разблокирует C1/C3.

### C1. Swimlane
GanttTimeline перевести с `useProjectBoard` на **`useProjectSchedule(projectId)`**. **Удалить локальные `taskSpan`/`buildDays` из компонента** (span теперь в хуке, ось — бакет-хелперы из date-helpers) — не оставлять два источника правды. Рендер: для каждой `swimlane` — заголовок (`label`, если не null; `text-text-mute`, в ЛЕВОЙ колонке) + её `tasks` рядами. Плоский режим (`label===null`) — без заголовка. `isLoading` → рендерить только «Загрузка…» (из schedule), не тело (иначе флеш плоского режима, пока грузятся колонки).

### C2. Milestone
Если `gt.isMilestone` — вместо бара **ромб** на колонке `start`: **`<button>` (не `<div>` — клик по вехе должен открывать TaskModal, как бар)** `onClick={() => onEditTask(task)}`, внутри `rotate-45` ~10px, токен по приоритету (`barClass`), `gridColumn: idx(start)+1`. `aria-label` = `${task.text} (веха): ${start}`.

### C3. Today line
Вертикальная линия на колонке текущего бакета: `todayIdx = bucketIndexOf(mskDateKey(new Date()), zoom, buckets)`. Абсолютный оверлей **внутри timeline-body** (C0), тонкий `border-l border-accent`. `todayIdx === -1` (сегодня вне диапазона) → не рисовать.

**Коммит C:** `feat(gantt): swimlane по фазам + milestone-ромб + today line`. Смок: delivery-проект → 4 фазовые дорожки; задача-веха → ромб; client-проект → плоско; сегодня-колонка помечена.

---

## ФАЗА D — tooltip + фильтр
### D1. Tooltip (§9.2: название, исполнитель, lane-статус)
На баре/ромбе — hover-tooltip (`group-hover`-поповер, без либы). Поля:
- `task.text`;
- **исполнитель:** `useProjectBoard` НЕ джойнит `assigned_to→profiles` → взять `useTeamMembers()` (есть, `{id, full_name}`, staleTime 5м), один раз в компоненте: `const nameById = new Map(team.map(m => [m.id, m.full_name]))`; `nameById.get(task.assigned_to ?? '') ?? '—'`. Никаких N+1 на бар.
- **lane-статус с fallback** (иначе на client/internal `next`/`now` → `undefined`): `phaseMode ? DELIVERY_TASK_STATUS_LABELS[task.lane] : (LANE_CONFIG[task.lane]?.label ?? task.lane)` (`LANE_CONFIG` из `validators/task.ts`; `phaseMode` из schedule).

### D2. Фильтр (§9.2: только открытые / все / только milestones)
`const [filter, setFilter] = useState<'open'|'all'|'milestones'>('open')`, 3 кнопки рядом с zoom. Фильтрация НАД `schedule.swimlanes` (в компоненте, useMemo):
- `open` — `task.lane !== 'done'`;
- `all` — всё;
- `milestones` — `gt.isMilestone`.
Пустая дорожка после фильтра — скрыть заголовок. Всё пусто → empty-state «Нет задач под фильтр».

**Коммит D:** `feat(gantt): tooltip (исполнитель/lane) + фильтр open/all/milestones`.

---

## ПРОВЕРКА (каждая фаза)
```bash
npx tsc --noEmit        # главный гейт
# build — нативно на Маке (через мост SWC arm64 не грузится)
```
Итоговый ручной смок (после D): delivery-проект с фазами → дорожки по фазам, бары/вехи, zoom week↔month без съезда, today-линия, tooltip, фильтры; client-проект → плоско; задача только с deadline → бар на MSK-дне; без дат → «Без дат».

## КОММИТ / ПУШ
Коммиты A→D по мере готовности (только код в `src/`; `_analysis`/доки — отдельным `docs(analysis):`, НЕ в feature — грабля V0). НЕ пушить — пуш всей Волны 2 отдельным заходом.

---

## Заметки гейта (Cowork)
- **Фаза = `column_id`→фаза-колонка** (`category='phase'`, `isPhaseBoard`), НЕ `phase_group` пайплайна. Swimlane data-driven от `useProjectColumns`, «4» не хардкодить.
- **Вся бакет-математика на UTC-полдне** — иначе бар выпадает из недели/месяца на границе (та же дисциплина, что v0 `buildDays`). Гейтить кейс «задача 28–31 марта при month-zoom».
- **`useProjectSchedule` — селектор, не новый fetch:** реюзит `useProjectBoard`+`useProjectColumns` (оба уже с realtime/RLS). Не дублировать запрос.
- **Milestone** — `is_milestone` уже в схеме `tasks` (derived-тип, regen не нужен). Ромб = `rotate-45` `<button>` (кликабелен→TaskModal), не картинка/не `<div>`. Веха БЕЗ дат (нет start/end/deadline) → в секцию «Без дат», НЕ в фильтр milestones (для delivery-вех дедлайн обычно есть — ок).
- **Sticky-колонка требует split-layout** (C0): фикс.левая колонка вне скролла + отдельный `overflow-x-auto` на оси. В одном `overflow-x-auto` `sticky left:0` не держится.
- **Порядок фаз A→B→C→D:** min/max в B — по плоскому dated-списку (v0), НЕ по swimlanes (их вводит C). Правка учтена.
- **Read-only** — никаких мутаций дат в этом спринте (drag = VIEW-2). Клик по бару → существующий `onEditTask`→TaskModal (как v0).
- **Оценка ~2–3 сессии CC** (Grok); коммить по фазам, гейт после каждой.
- build через мост невозможен (SWC arm64) — нативно на Маке.
