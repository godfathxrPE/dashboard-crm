# Claude Code Prompt — S-TODAY-FOCUS-3: ходы — таймер остывания

**Основание:** `_analysis/today-focus-spec.md` (§6; решения F-16, F-17), макет `_analysis/mockup-S-TODAY-FOCUS.html` (кадры 1, 4, 6).
**Эпик:** S-TODAY-FOCUS, спринт 3 из 4. **Зависимость:** `S-TODAY-FOCUS-2` в `main`.
**Схема:** миграций нет, БД не трогаем, типы не меняются.
**Цель:** три хода дня — отдельная полоса над списком. В каждой плитке кольцо показывает, сколько из 14 дней свежего срыва уже прошло и когда сделка уйдёт в «Решить судьбу». Выбранная плитка — на стекле, как шапка фокуса.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. FOCUS-2 в main — ожидание: язычок и листы групп на месте
grep -n "today-tab\|today-grp" src/app/globals.css | head -5

# 2. Правило групп — прочитай classifyDeal целиком: оси дней, касание после срока, тишина без шага
grep -n "export function classifyDeal" -B 16 -A 60 src/lib/domain/today-deals.ts
grep -n "export function diffDaysKey" -A 10 src/lib/utils/date-helpers.ts
grep -n "export interface TodayDealSource\|export interface TodayDealInput" -A 16 src/lib/domain/*.ts | head -40

# 3. Ходы сейчас — карточка, полоса, свёрнутая строка «все сделаны», прогресс в шапке страницы
grep -n "interface TodayMovesProps" -A 24 src/components/today/TodayMoves.tsx
grep -n "allDone\|onTakeMore" src/components/today/TodayMoves.tsx src/components/today/TodayView.tsx | head
grep -n "Сколько ходов дня уже сделано" -B 2 -A 18 src/components/today/TodayView.tsx

# 4. Стекло, aura и слой: `.glass-sheet` без слоя, правила экрана — в каком @layer?
grep -n "^\.glass-sheet,$" -A 8 src/app/globals.css
grep -n "\.t-aura \[data-card\]" src/app/globals.css | head -3
awk 'NR<=1884' src/app/globals.css | grep -n "@layer" | tail -3

# 5. Подложка зоны «Работа» по темам
grep -n "\-\-zone-work" src/app/globals.css | head -10

# 6. Тексты: SLOT_KINDS из FOCUS-1, итог хода
grep -n "SLOT_KINDS\|export function doneText\|export function dayText\|export function dayWeekdayText\|export function plannedText" src/lib/utils/today-text.ts

# 7. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

---

## ЗАДАЧА 1 — домен: `src/lib/domain/decide-clock.ts`

**1.1. `src/lib/utils/date-helpers.ts`** — дописать `addDaysKey(key: string, days: number): string` — сдвиг ключа `'YYYY-MM-DD'` на N календарных дней, в той же арифметике, что `diffDaysKey` (прочитай её; `diffDaysKey(k, addDaysKey(k, n)) === n`).

**1.2. Модуль.**

```ts
export type ClockBasis = 'overdue' | 'silence' | 'none';
export type ClockState = 'calm' | 'warn' | 'over' | 'none' | 'done';

export interface DecideClock {
  basis: ClockBasis;
  /** Дней после срока (overdue) или тишины (silence); null — таймера нет. */
  days: number | null;
  /** Доля кольца, 0…1. */
  ratio: number;
  /** День перехода в «Решить судьбу», 'YYYY-MM-DD'; null — таймера нет. */
  tipKey: string | null;
  state: ClockState;
}

/** Остаток дней окна, с которого кольцо — `--warning`. */
export const DECIDE_WARN_DAYS = 5;

export function decideClock(
  view: Pick<TodayDealView, 'source' | 'cls' | 'planned'>,
  now: Date,
  done: boolean,
  thresholds: TodayThresholds = DEFAULT_TODAY_THRESHOLDS,
): DecideClock;
```

Основа — те же ветки, что в `classifyDeal`, проверки сверху вниз (`W = thresholds.decideDays`):

| Случай | `basis` | `days` | от какого дня `fromKey` | `tipKey` |
|---|---|---|---|---|
| `cls.stepAhead`, или шага нет и `view.planned` не `null` | `none` | `null` | — | `null` |
| `cls.overdueDays !== null` и `!cls.touchedAfterDue` | `overdue` | `cls.overdueDays` | день срока `next_action_date` | `addDaysKey(fromKey, W + 1)` |
| `cls.overdueDays !== null`, касание после срока было | `silence` | `diffDaysKey(fromKey, mskDateKey(now))` | `mskDateKey(cls.lastTouchAt)` | `addDaysKey(fromKey, W + 1)` |
| шага нет | `silence` | `diffDaysKey(fromKey, mskDateKey(now))` | поздний из `mskDateKey(lastTouchAt)` и `mskDateKey(source.created_at)` | `addDaysKey(fromKey, W + 1)` |

Состояние: `done` → `'done'`; `basis === 'none'` → `'none'`; `days > W` → `'over'`; `W − days ≤ DECIDE_WARN_DAYS` → `'warn'`; иначе `'calm'`. Доля: `over` и `done` → 1; `none` → 0; иначе `days / W`.

Таймер и группа обязаны совпадать: для основ `overdue` и `silence` `state === 'over'` тогда и только тогда, когда `classifyDeal` даёт `decide`. Если ветка `classifyDeal` устроена иначе, чем в таблице, — правило `classifyDeal` главнее: сделай как в нём и запиши расхождение в «Отклонения».

**1.3. `src/lib/utils/today-text.ts`** — подпись под кольцом:

```ts
export function clockCaption(clock: DecideClock, view: TodayDealView): string;
```

| `state` | Текст |
|---|---|
| `calm`, `warn` | `{dayText(tipKey)} — в «Решить судьбу»` |
| `over` | `с {dayText(tipKey)} — в «Решить судьбу»` |
| `none`, `cls.assignedToday` | `назначено на сегодня`; есть время — `назначено на сегодня, {time}` |
| `none`, шаг впереди | `шаг {dayWeekdayText(next_action_date)}` |
| `none`, встреча или звонок впереди | `plannedText(view.planned)` |
| `done` | не вызывается: плитка печатает `doneText` V3 |

**Проверка:** `npx vitest run tests/unit/decide-clock.test.ts tests/unit/today-text.test.ts`.

---

## ЗАДАЧА 2 — плитка хода: `src/components/today/TodayMoveTile.tsx`

Заменяет `TodayMoveCard.tsx` (удалить). Макет — кадр 1, ходы.

- Корень — `<button type="button" class="today-tile" aria-current={selected ? 'true' : undefined} data-row-index={kbdIndex}>`; клик и ⌘/Ctrl+клик — `onSelect(id, e)` из FOCUS-1. Выбранная плитка — ещё и класс `glass-sheet`. Временный маркер `--accent-l2` из FOCUS-1 — снять.
- Анатомия, колонкой с `gap: 0.5rem`, отступы `0.875rem 0.875rem 0.75rem`, радиус `--radius-l`, фон `--surface`, граница `--border`, тень `--shadow-card`:
  1. Ряд: кольцо 3.5rem · колонка «{номер} · {SLOT_KINDS[slot]}» 11/600 uppercase `text-text-dim` → название 14/600 → сумма 13/600 tabular или «без суммы» 12/400 `text-text-mute`.
  2. Шаг 12/400 `text-text-dim`, `line-clamp-2`, `min-height: 2.1em`; ход сделан — зачёркнут.
  3. Подпись 11/400 `text-text-mute` над разделителем `border-top --border`, `padding-top: 0.4375rem`: `clockCaption`; ход сделан — `doneText` V3, цвет `--success-text`.
- **Кольцо** — `<svg viewBox="0 0 56 56">`, повёрнуто на −90°: дорожка и дуга `r = 23`, `stroke-width = 5`, `fill: none`, `stroke-linecap: round`; `stroke-dasharray = {ratio × 2π·23} {2π·23}`. Центр: `days` 18/600 tabular и «дн.» 11/400; `none` — `CalendarClock` 1.25rem `text-text-dim`; `done` — `Check` 1.375rem `--success`, `stroke-width 2.5`.
- Цвета кольца: дорожка `color-mix(in srgb, var(--text) 11%, transparent)`; дуга `calm` — `--text-dim`, `warn` — `--warning`, `over` — `--danger` (число — `--danger-text`), `done` — `--success`.
- **На стекле** (выбранная плитка): дорожка `color-mix(in srgb, var(--sheet-text) 18%, transparent)`, дуга `--sheet-text`, `warn` — `--sheet-warning`, `over` — `--sheet-red`, `done` — `--sheet-green`; подписи и вид слота — `--sheet-dim`, разделитель — `--sheet-plate-border`. Внутри стекла `--danger`, `--success`, `--warning` **не** перекрашены — отсюда явные `--sheet-*`.
- `aria-label` кольца: `overdue` — «{N} дн. после срока из 14»; `silence` — «{N} дн. тишины из 14»; `none` — «шаг впереди, таймера нет»; `done` — «ход сделан».
- Наведение у невыбранной плитки — `translateY(-2px)` и `--shadow-card-hover`, переход `var(--duration-fast)`; у выбранной и при `prefers-reduced-motion: reduce` — без сдвига. Контейнер `.today-cq` < 66rem: кольцо 3rem, отступы `0.75rem 0.75rem 0.625rem`, вид слота переносится.

⚠️ **Стекло против фона плитки.** Правила экрана лежат в `@layer components`, `.glass-sheet` — вне слоя и ниже по файлу: без слоя побеждает слой при любой специфичности. Если разведка 4 показала, что `.today-tile` вне слоя, добавь явную пару `.today-tile.glass-sheet { background-color: var(--sheet-glass); background-image: var(--sheet-sheen); border-color: var(--sheet-hairline); box-shadow: var(--sheet-shadow); color: var(--sheet-text); }` ниже `.glass-sheet`. `data-card` на плитку не ставить: `.t-aura [data-card]` перебивает стекло (комментарий у `.glass-sheet`).

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 3 — полоса ходов: `TodayMoves.tsx` и шапка страницы

- `<section aria-label="Ходы на сегодня" class="today-band">`: фон `--zone-work`, радиус `--radius-l`, отступ 0.75rem, снизу 1.25rem до списка.
- Заголовок полосы, `flex items-center gap-2.5 flex-wrap`, отступы `0 0.25rem 0.625rem`: «Ходы на сегодня» 14/600 · прогресс — по отрезку на ход набора (1.25rem × 0.3125rem, радиус 999px; сделан — `--success`, иначе `color-mix(in srgb, var(--text) 18%, transparent)`), `aria-hidden` · «**{сделано}** из {в наборе} сделано» 12/400 · справа подсказка 12/400 `text-text-dim` «кольцо — 14 дней срыва до «Решить судьбу»» (при контейнере < 66rem — отдельной строкой). Все ходы сделаны и кандидаты есть — справа кнопка `Button size="sm" variant="secondary"` «Взять ещё ход» (прежний `onTakeMore`) вместо подсказки.
- Сетка плиток — **одна строка до четырёх плиток**: колонок столько, сколько ходов, но не больше четырёх; с пятой — перенос. Новый класс `.today-tiles`: `display: grid; gap: 0.5rem; grid-template-columns: repeat(var(--tiles, 3), minmax(0, 1fr))`; `--tiles` = `Math.min(moves.length, 4)` — инлайн-стилем на сетке (число, не цвет). Контейнер `.today-cq` < 40rem — одна колонка. `.today-cards` снять, если `grep` других потребителей не показал.
  Почему (решение владельца 05.10, гейт FOCUS-2): ходов бывает больше трёх — `pickMoves` берёт в ходы все сделки с шагом на сегодня, плюс «Взять ещё ход»; четыре карточки по три в ряд дали на 1280 ноль полных строк списка выше сгиба. Цена: при четырёх плитках и контейнере < 66rem (1280) плитка ≈ 9rem — шаг в ней `line-clamp-1` вместо двух строк.
- **Все ходы сделаны** — плитки остаются: кольца `done`, подписи итога. Свёрнутую строку «{n} из {n} ходов сделано» и проп `allDone` — убрать. Почему: плитка — переключатель фокуса; свёрнутый набор не даёт выбрать сделанный ход и нажать «Вернуть» в шапке (спека, §6).
- Загрузка — три скелетона по геометрии плитки (круг 3.5rem `--surface2`, три полоски); ходов нет — прежний текст внутри полосы.
- **Шапка страницы:** блок «точки и {сделано} из {в наборе} ходов сделано» уходит из `TodayView` — прогресс теперь в полосе (F-16).

**Проверка:** `grep -n "Сколько ходов дня уже сделано\|allDone" src/components/today/*.tsx` — пусто.

---

## ЗАДАЧА 4 — темы и состояния

Проверить в браузере и поправить, где нужно; итог — в отчёт.

Попутно (гейт FOCUS-2): чип свёрнутой группы `.today-chip` — `max-width: 100%`, название внутри — `min-width: 0; overflow: hidden; text-overflow: ellipsis`; иначе длинное название сделки вылезает за лист в колонке 578 px (1280).

| Тема | Что проверить |
|---|---|
| `t-minimal` | кольца `calm`/`warn`/`over` различимы; стекло выбранной плитки совпадает со стеклом шапки фокуса |
| `t-aura` | `getComputedStyle(плитка).backgroundColor` выбранной ≠ `rgb(255, 255, 255)` |
| `t-washi` | подложка `--zone-work` розоватая (акцент — красный) — это известная цена F-16; `over` (красный смысл) отличим от акцента: у `over` красное и кольцо, и число |
| `t-frost` | граница плитки не перекрашена safety-net; кольцо на стекле читается |

Состояние `none` (шаг впереди, ход назначен на сегодня) на холсте не нарисовано. Проверь на тестовой сделке: назначь ей шаг на сегодня (это запись — только тестовая сделка), убедись, что плитка показывает пустое кольцо, `CalendarClock` и «назначено на сегодня». Скриншот — в отчёт.

---

## ТЕСТЫ

**`tests/unit/decide-clock.test.ts`** — новый. `now` — 04.10.2026 12:00 МСК, `W = 14`.

- Срок 30.09, касаний после нет → `overdue`, 4 дня, `tipKey` '2026-10-15', `calm`, доля 4/14.
- Срок 25.09 → 9 дней, '2026-10-10', `warn` (остаток 5).
- Срок 20.09 → 14 дней, `warn`, доля 1 — ещё не `over`.
- Срок 19.09 → 15 дней, `over`, `tipKey` '2026-10-04'.
- Срок 10.09, касание 28.09 → `silence`, 6 дней от 28.09, '2026-10-13', `calm`.
- Шага нет, создана 18.09, касаний нет → `silence`, 16 дней, '2026-10-03', `over`.
- Шага нет, создана 01.08, касание 30.09 → отсчёт от 30.09.
- Шаг впереди → `none`, `days` null, доля 0.
- Шага нет, встреча впереди → `none`.
- `done = true` при любом входе → `done`, доля 1.
- **Согласованность:** для шести входов выше с основой `overdue`/`silence` прогнать `classifyDeal` с тем же `now`: `state === 'over'` ⇔ группа `decide`.

**`tests/unit/today-text.test.ts`** — дописать `clockCaption`: `calm` → «15 окт — в «Решить судьбу»»; `over` → «с 3 окт — в «Решить судьбу»»; `none` и назначено на сегодня с временем → «назначено на сегодня, 14:00»; `none` и шаг впереди → «шаг …».

**`tests/unit/date-helpers.test.ts`** (есть — дописать; нет — создать): `addDaysKey('2026-09-30', 15)` → '2026-10-15'; `addDaysKey('2026-12-25', 10)` → '2027-01-04'; `addDaysKey(k, -1)` — предыдущий день; `diffDaysKey(k, addDaysKey(k, 15)) === 15`.

Плитка, полоса, кольцо — тестов нет: разметка; формула и подписи вынесены в домен и покрыты.

```bash
npx vitest run tests/unit/decide-clock.test.ts tests/unit/today-text.test.ts tests/unit/date-helpers.test.ts 2>&1 | tail -15
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
grep -rn "TodayMoveCard" src | head
grep -n "#[0-9a-fA-F]\{3,6\}\b" src/components/today/TodayMoveTile.tsx | head
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `build` проходит; `audit-tokens` без новых находок.
2. Два последних `grep` — пусто.
3. `classifyDeal`, `buildTodayModel`, `day-moves` не тронуты: `git diff --stat main -- src/lib/domain/today-deals.ts src/lib/domain/today-model.ts src/lib/domain/day-moves.ts` — пусто.

## СМОКИ

Запись — только на **тестовой сделке**. Темы: `t-minimal`, `t-aura`, `t-washi`, `t-frost`. Ширины 1440 и 1280.

| # | Что | Ожидание |
|---|---|---|
| 1 | Открыть экран | Полоса на подложке; в шапке страницы прогресса нет; у трёх плиток кольца, числа дней и даты перехода совпадают с группой каждой сделки |
| 2 | Клик по второй плитке | Плитка на стекле, первая вернулась на `--surface`; фокус — эта сделка |
| 3 | Сделка с остатком ≤ 5 дней | Кольцо `--warning`; на стекле — `--sheet-warning` |
| 4 | «Сделано» на тестовой сделке-ходе | Кольцо полное зелёное с галочкой, шаг зачёркнут, подпись — итог; счёт в полосе +1 |
| 5 | Все три хода сделаны | Плитки на месте; «Взять ещё ход» в заголовке полосы добавляет четвёртую плитку |
| 6 | Высота плитки | 1440 — около 159 px, 1280 — около 162 px (`getBoundingClientRect`) |
| 7 | Системная настройка «уменьшить движение» | Наведение без сдвига |
| 8 | Строк списка выше сгиба — **видимое** окно 1440×900 и 1280×800, данные дня | Записать число строк и число ходов. Цель с досок — 5 и 4 при трёх ходах; при четырёх ходах плитки в одну строку. В скрытой вкладке не мерить: вьюпорт не меняется |
| 9 | Четыре хода (тестовой сделке шаг на сегодня или «Взять ещё ход») | Четыре плитки в одну строку на 1440 и 1280; шаг в одну строку на 1280 |

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Микропульса в плитке и крупного номера (F-16 заменён F-17).
- Активности в фокусе (S4).
- Изменения правил групп или порога 14 дней.
- Анимации заполнения кольца.

## STATUS

`crm-architect/STATUS.md` не правь. После мержа гейт пишет строку `| #<PR> | S-TODAY-FOCUS-3 | … |` и поднимает ревизию — протокол закрытия спринта в `crm-architect/SKILL.md`. Без этой строки `scripts/status-check.sh` краснеет после мержа (урок эпика S-TODAY-V3). В «Дополнительно» отчёта предложи текст строки: что изменилось для пользователя, число тестов, «Миграций нет».

## КОММИТ

Перед коммитом сохрани отчёт (формат — секция ОТЧЁТ ниже) в `_analysis/sprint-S-TODAY-FOCUS-3-report.md`: спринт-файл уже в `main`, а страж `sprint-file` требует файл `_analysis/` в диффе ветки (урок FOCUS-1). `git add` и `git commit` — отдельными вызовами.

```bash
git checkout -b feat/today-focus-3
git add src/ tests/ _analysis/sprint-S-TODAY-FOCUS-3-report.md
git commit -m "feat(today): ходы — полоса и таймер остывания до «Решить судьбу»

- decide-clock: дни срыва или тишины, день перехода, состояния calm/warn/over/none/done
- TodayMoveTile: кольцо, вид слота, шаг, подпись с датой перехода; выбранная — на стекле
- полоса ходов на --zone-work, прогресс дня переехал из шапки страницы в полосу
- все ходы сделаны: плитки остаются, «Взять ещё ход» в заголовке полосы
- addDaysKey в date-helpers

Миграций нет.
Основание: _analysis/today-focus-spec.md"
```

Без `git push`.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, таблицы, функции.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд. Без цепочек «осуществление проведения проверки».
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · 42 теста passed · build exit 0).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».

Дополнительно приложи: таблицу задачи 4 с результатом по каждой теме; для трёх ходов дня — дни, `tipKey` и `state` из `decideClock` рядом с группой из `classifyDeal`.
