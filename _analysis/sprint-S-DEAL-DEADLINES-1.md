# Спринт S-DEAL-DEADLINES-1 — таймлайн дедлайнов (W3)

**Вход:** после мержа S-DEAL-LAYOUT-1 (доска задач должна уже стоять секцией в стопке).
**Миграций НЕТ.** **Ветка:** `feat/deal-deadlines-1`. **Спека:** W3.

---

## Зачем

Смысл виджета — ответить «что горит» **до** того, как человек открыл списки. Поэтому
спека держит таймлайн видимым ВСЕГДА, а колонки задач прячет за кнопку. После
LAYOUT-1 доска свёрнута в строку; таймлайн встаёт НАД её содержимым и остаётся
видимым в свёрнутом состоянии — то есть свёрнутая секция «Доска задач» показывает
строку-сводку и полосу таймлайна, а колонки появляются по развороту.

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

Цвета — по `decisions-lime-theme` и токенам проекта, не по hex спеки (она под `minimal`).
Семантика состояний — `--danger` / `--warning` / нейтраль; **лайм только у колонки
«сегодня»**: это один из пяти разрешённых лайм-пятен на экран (лайм-бюджет, Р2).

---

## РАЗВЕДКА

```bash
git log --oneline -1 && ls src/components/projects/ | grep -i 'board\|cockpit'
npm run lint 2>&1 | tail -3 && npx vitest run 2>&1 | tail -5

grep -n 'due_date\|dueDate' src/lib/hooks/use-tasks.ts | head -10
grep -n 'export function useTasks\|projectId' src/lib/hooks/use-tasks.ts | head -8
grep -n 'stageTimeGauge\|resolveStageNorm\|normDate\|norm' src/lib/domain/stage-norm.ts | head -12
sed -n '105,125p' src/components/projects/ProjectStageCockpit.tsx
grep -rn 'mskDateKey\|shiftDateKeyByBuckets' src/lib/utils/date-helpers.ts | head
grep -n 'lane-packing' -r src/lib/domain/lane-packing.ts | head -3
```

Ответить:
1. Какой хук отдаёт задачи сделки и есть ли в нём `due_date` без доп. запроса.
2. Что именно `stageTimeGauge` уже посчитал — дата нормы стадии обязана быть ОДНА
   на кокпит и таймлайн, второй расчёт разъедется.
3. Годится ли `lib/domain/lane-packing.ts` (S-CAL-LANES-1) для укладки дорожек, или
   там своя семантика недель.

---

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
  tasks: readonly { id: string; title: string; due_date: string | null; status: string }[],
  normDateKey: string | null,
  now: Date,
): DeadlineTrack
```

Правила:
- ключи дней — **`mskDateKey`** (`lib/utils/date-helpers.ts:102`), не `new Date(...)`:
  `due_date` — колонка `date`, и в отрицательных зонах день уедет (урок
  `formatCalendarDate`, S-DEAL-CHZ-1);
- окно ровно 15 дней: `now−2 … now+12`; `pct(d) = d / 14 × 100`, где `d` — индекс дня;
- состояние метки: `dateKey < сегодня` и задача не готова ⇒ `overdue`;
  `== сегодня` ⇒ `today`; статус ожидания ⇒ `waiting` (сверить имя статуса в разведке);
  иначе `ahead`. **Готовые задачи в таймлайн не попадают вовсе** — он про то, что
  впереди, а не про архив;
- `normPct` считается из `normDateKey`, пришедшего АРГУМЕНТОМ: сам таймлайн норму
  стадии не вычисляет, иначе появится вторая формула рядом с кокпитом;
- норма вне окна ⇒ `normPct: null`, пунктир не рисуется (не прижимать к краю: линия
  на границе читается как «норма сегодня»);
- задачи без `due_date` игнорируются молча, задачи за окном — только в `outsideCount`;
- > 1 метки в один день ⇒ строка уходит в `stacks`, из `marks` эти метки НЕ убираются
  (компонент решает, что рисовать) — но `stacks` считается всегда.

## ЗАДАЧА 2 — компонент

`src/components/projects/DealDeadlineTrack.tsx`, встаёт внутрь секции «Доска задач»
НАД её содержимым, видим и в свёрнутом состоянии.

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
| задача вчера, готова | в `marks` НЕТ |
| задача сегодня | `today`, `pct === todayPct` |
| дедлайн `now+12` | попадает, `pct === 100` |
| дедлайн `now+13` | не попадает, `outsideCount` +1 |
| дедлайн `now−3` | не попадает, `outsideCount` +1 |
| три задачи в один день | `stacks` содержит запись `count: 3` |
| `due_date: null` | игнорируется, счётчики не растут |
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
- DealDeadlineTrack виден и при свёрнутой доске: «что горит» до открытия списков
- готовые задачи в таймлайн не попадают; дедлайны за окном — счётчиком
```

**Не мержить.** Отчёт — на гейт.
