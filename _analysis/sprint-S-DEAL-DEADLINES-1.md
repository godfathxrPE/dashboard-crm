# Спринт S-DEAL-DEADLINES-1 — таймлайн дедлайнов (W3)

**Вход:** `main` = `cc231c0` (PR #86), STATUS ревизия 44. S-DEAL-LAYOUT-1 влит (#80):
доска задач стоит `ProjectBoardSection` → `CollapsibleSection`, свёрнута по умолчанию.
**Миграций НЕТ.** **Ветка:** `feat/deal-deadlines-1`. **Спека:** W3.

---

## Зачем

Смысл виджета — ответить «что горит» **до** того, как человек открыл списки. Поэтому
спека держит таймлайн видимым ВСЕГДА, а колонки задач прячет за кнопку.

Спека W3, дословно по геометрии:

> Окно 14 дней: сегодня−2 … сегодня+12. Колонка «сегодня»: `left = todayPct%`,
> width 34, r12, `lime .22`, на всю высоту дорожек и оси.
> Норма стадии: пунктир 2px amber .7 на `normPct%` + подпись 9.5 «норма стадии · {date}»
> — **общая ось с Кокпитом**.
> Дорожки: h18, точка 12 на `pct%`, подпись 11 со сдвигом 12px.
> Состояния точки: просрочена — red + кольцо red .18, 600 · сегодня — lime + кольцо 2 ink
> + 6 lime .5 · впереди — white + inset 2 ink-2 · ожидание — amber-soft + inset 2 amber.
> Ось дней: h22, 15 меток 9.5 tabular в кругах 18; «сегодня» — lime 700 + свечение.
> `pct(d) = d / 14 × 100`. При > 6 задачах в окне дорожки объединяются по дню («+N»).

Цвета — по токенам проекта, не по hex спеки (она под `minimal`). Семантика состояний —
`--danger` / `--warning` / нейтраль; **лайм только у колонки «сегодня»** (лайм-бюджет, Р2).

---

## Разведка УЖЕ СДЕЛАНА (08.09, сверено с `cc231c0`) — не переоткрывать

Расхождение с этим списком — сигнал, что `main` уехал: остановиться и сказать.

**Колонки `due_date` НЕ СУЩЕСТВУЕТ.** Срок задачи — `tasks.deadline`, и это
**`timestamptz`**, а не `date` (004; ось обязательства, отдельная от `scheduled_start`/
`scheduled_end` — оси расписания, 070). Прежняя редакция спринта грепала несуществующее
имя и называла неверный тип. Урок про `mskDateKey` от этого не отменяется, а
переворачивается: ключ дня нужен именно потому, что это МОМЕНТ ВРЕМЕНИ — его приводят к
календарному дню МСК, иначе вечерний дедлайн уедет на сутки.

**У задач нет поля `status`.** Есть `lane` (`now`/`next`/`wait`/`done`), и для задач с
`project_id` он **деривативен** от `column_id` (пишет `trg_aa_resolve_board`, 032;
биекция категорий backlog↔next, started↔now, paused↔wait, done↔done). Значит:
`waiting` ⇔ `lane === 'wait'`, «готова» ⇔ `lane === 'done'`.

**Хук.** `useProjectBoard(projectId)` (`lib/hooks/use-tasks.ts:95`) отдаёт `tasks` и
`tasksByColumn` одним запросом со `select('*')` — `deadline` там уже есть, доп. запроса
не нужно. Ключ кэша общий с `ProjectBoard` и `ProjectBoardSection`.

**Норма стадии.** `lib/domain/stage-norm.ts` экспортирует `resolveStageNorm` (:33) и
`stageTimeGauge` (:51) плюс типы `StageTimeGauge`/`StageTimeState`. Задача 3 выполнима.

**`lib/domain/lane-packing.ts` НЕ ГОДИТСЯ — ответ на прежний вопрос разведки.** Его ось
в МИНУТАХ (`chipSpanMinutes`, `startMin`/`endMin`), а рядов жёстко два
(`rowEnds: [number, number]`, `laneRows` возвращает `0 | 1 | 2`). У таймлайна ось в днях
и объединение стеком «+N» по дню, а не укладка в ряды. Натянуть дни на минуты — значит
завести вторую семантику внутри чужого модуля календаря.

---

## ЗАДАЧА 0 — слот «видно и в свёрнутом виде» у `CollapsibleSection`

**Без неё спринт невыполним, и это главное расхождение с прежней редакцией.** Спека
требует, чтобы таймлайн был виден при свёрнутой доске. `CollapsibleSection`
(`components/shared/CollapsibleSection.tsx`, S-DEAL-LAYOUT-1) устроен так, что:

- `children` не монтируются вовсе до первого раскрытия (`hasBeenExpanded`) и прячутся
  `hidden` при сворачивании — то есть в `children` таймлайн жить НЕ МОЖЕТ;
- `summary` рендерится ВНУТРИ `<button>`-шапки — а метки таймлайна по задаче 2 сами
  `<button>` с `aria-label`. Кнопка внутри кнопки — невалидный HTML и реальный дефект
  доступности, не придирка.

Завести проп `alwaysVisible?: ReactNode`, который рендерится **после** кнопки-шапки и
**вне** `hidden`-контейнера, до `hasBeenExpanded`-гейта. Один потребитель — доска задач;
мёртвого пропа не заводим (урок `locked`, гейт #80).

⚠️ `container-type: inline-size` на `.deal-org-split` (S-DEAL-ORG-1) — соседний блок,
его не трогать.

## РАЗВЕДКА (короткая, только состояние дерева)

```bash
git log --oneline -1 && npm run lint 2>&1 | tail -3 && npx vitest run 2>&1 | tail -5
sed -n '1,80p' src/components/shared/CollapsibleSection.tsx
sed -n '1,60p' src/components/projects/ProjectBoardSection.tsx
sed -n '30,70p' src/lib/domain/stage-norm.ts
grep -n 'stageTimeGauge\|resolveStageNorm' -r src/components/projects/ProjectStageCockpit.tsx
```

## ЗАДАЧА 1 — домен

`src/lib/domain/deadline-track.ts`, чистая функция, `now` аргументом.

```ts
export type MarkState = 'overdue' | 'today' | 'ahead' | 'waiting';

export interface TrackMark {
  taskId: string;
  title: string;
  dateKey: string;     // 'YYYY-MM-DD'
  pct: number;         // 0..100, позиция на оси
  state: MarkState;
}

export interface DeadlineTrack {
  from: string; to: string;          // границы окна, ключи дней
  days: { key: string; pct: number; isToday: boolean }[];   // 15 меток оси
  marks: TrackMark[];
  /** Дни, где меток больше одной — рисуются стеком «+N». */
  stacks: { dateKey: string; pct: number; count: number }[];
  todayPct: number;
  /** null, если норма стадии не определена — пунктир не рисуется. */
  normPct: number | null;
  normDateKey: string | null;
  /** Задачи с дедлайном ВНЕ окна — в подпись «ещё N за окном». */
  outsideCount: number;
}

export function buildDeadlineTrack(
  tasks: readonly { id: string; text: string; deadline: string | null; lane: string }[],
  normDateKey: string | null,
  now: Date,
): DeadlineTrack
```

Правила:
- ключи дней — **`mskDateKey`** (`lib/utils/date-helpers.ts:102`), не `new Date(...)`:
  `deadline` — `timestamptz`, то есть МОМЕНТ, и вечерний дедлайн без приведения к
  календарному дню МСК уедет на сутки (тот же класс, что в PULSE-1);
- окно ровно 15 дней: `now−2 … now+12`; `pct(d) = d / 14 × 100`, где `d` — индекс дня;
- состояние метки: `dateKey < сегодня` и задача не готова ⇒ `overdue`;
  `== сегодня` ⇒ `today`; `lane === 'wait'` ⇒ `waiting`; иначе `ahead`.
  **Готовые (`lane === 'done'`) в таймлайн не попадают вовсе** — он про то, что
  впереди, а не про архив;
- `normPct` считается из `normDateKey`, пришедшего АРГУМЕНТОМ: сам таймлайн норму
  стадии не вычисляет, иначе появится вторая формула рядом с кокпитом;
- норма вне окна ⇒ `normPct: null`, пунктир не рисуется (не прижимать к краю: линия
  на границе читается как «норма сегодня»);
- задачи без `deadline` игнорируются молча, задачи за окном — только в `outsideCount`;
- > 1 метки в один день ⇒ строка уходит в `stacks`, из `marks` эти метки НЕ убираются
  (компонент решает, что рисовать) — но `stacks` считается всегда.

## ЗАДАЧА 2 — компонент

`src/components/projects/DealDeadlineTrack.tsx`, передаётся в `ProjectBoardSection`
пропом `alwaysVisible` (задача 0) — виден и в свёрнутом состоянии.

Разметка: контейнер `relative`, колонка «сегодня» абсолютом по `todayPct`, дорожки,
ось дней. Числа — `tabular-nums`. Ноль хардкод-цветов.

a11y: таймлайн — картинка данных, продублировать текстом. Под ним строка-сводка
«{N} просрочено · {M} сегодня · {K} впереди», она же легенда. Метки — `<button>`
с `aria-label` «{title}, {дата}, {состояние}», клик открывает задачу.

Пусто (ни одной задачи с дедлайном в окне) ⇒ таймлайн не рисуется, остаётся только
строка «дедлайнов в ближайшие две недели нет» — пустая ось на всю ширину хуже, чем
её отсутствие.

## ЗАДАЧА 3 — общая ось с кокпитом

Дата нормы стадии берётся из того же источника, что рисует заливку кокпита
(`stageTimeGauge` / `resolveStageNorm`). Поднять её в `ProjectDetail` и передать
пропом и в кокпит, и в таймлайн — ИЛИ вынести в маленький хук, если она уже
считается дважды. В отчёте написать, каким путём пошли и почему.

---

## ТЕСТЫ

`tests/unit/deadline-track.test.ts`, `now` аргументом:

| Вход | Ожидание |
|---|---|
| задача вчера, не готова | `overdue`, `pct` < `todayPct` |
| задача вчера, `lane: 'done'` | в `marks` НЕТ |
| задача сегодня | `today`, `pct === todayPct` |
| дедлайн `now+12` | попадает, `pct === 100` |
| дедлайн `now+13` | не попадает, `outsideCount` +1 |
| дедлайн `now−3` | не попадает, `outsideCount` +1 |
| три задачи в один день | `stacks` содержит запись `count: 3` |
| `deadline: null` | игнорируется, счётчики не растут |
| норма стадии вне окна | `normPct: null` |
| граница дня 23:59 МСК | день не уезжает (тот же класс, что в PULSE-1) |

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
grep -rn '#[0-9a-fA-F]\{6\}' src/components/projects/DealDeadlineTrack.tsx | wc -l
python3 scripts/audit-contrast.py 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

## КОММИТ

```
feat(deals): таймлайн дедлайнов на две недели

- deadline-track.ts: окно now−2…now+12, состояния меток, стеки по дню, норма
  стадии аргументом (общая ось с кокпитом, второй формулы нет)
- CollapsibleSection получил слот alwaysVisible: таймлайн виден и при свёрнутой доске: «что горит» до открытия списков
- готовые задачи в таймлайн не попадают; дедлайны за окном — счётчиком
```

**Не мержить.** Отчёт — на гейт.
