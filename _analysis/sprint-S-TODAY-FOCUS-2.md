# Claude Code Prompt — S-TODAY-FOCUS-2: список — листы групп и язычок выбора

**Основание:** `_analysis/today-focus-spec.md` (§5; решения F-12, F-13, F-14, F-15, F-18, F-19), макет `_analysis/mockup-S-TODAY-FOCUS.html` (кадры 1, 2, 4, 5 — анимация кликабельна).
**Эпик:** S-TODAY-FOCUS, спринт 2 из 4. **Зависимость:** `S-TODAY-FOCUS-1` в `main`.
**Схема:** миграций нет, БД не трогаем, типы не меняются.
**Цель:** список «Сделки в работе» читается быстрее: каждая группа — свой лист, строка без шеврона и второй линии, выбор строки — язычок, выходящий из-под листа.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. FOCUS-1 в main — ожидание: фокус и модель выбора на месте, панели нет
ls src/components/today/TodayFocusPane.tsx src/lib/domain/today-selection.ts
grep -rn "TodayDealPanel" src | head
grep -n "aria-current\|accent-l2" src/components/today/*.tsx src/app/globals.css | head

# 2. Список сейчас — один лист, заголовок группы, свёрнутая сводка
grep -n "function GroupHeading\|function collapsedSummary\|overflow-hidden\|today-row-head" src/components/today/TodayGroups.tsx
sed -n 1,97p src/components/today/TodayDealRow.tsx

# 3. Лист и стеклянные темы — `.sheet` (radius-m) и `.t-frost/.t-aurora/.t-tidal .sheet` с blur
grep -n "^  \.sheet {" -A 10 src/app/globals.css
grep -n "^\.t-frost \.sheet," -A 6 src/app/globals.css
grep -n "DARK THEME BORDER SAFETY NET" -A 12 src/app/globals.css

# 4. Тексты: правила групп, «ещё N в ходах», сигналы, срок
cat src/lib/constants/today-groups.ts
grep -n "export function inMovesText\|export function signalsText\|export function dueText\|export function planItemText" -A 10 src/lib/utils/today-text.ts

# 5. CSS строки V3 — кто ещё использует
grep -rn "today-row-grid\|today-row-head\|today-row-sub\|today-row-amount" src | head

# 6. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

---

## ЗАДАЧА 1 — шапка книги и листы групп: `TodayGroups.tsx`

**1.1. Шапка книги** — над листами, без подложки: «Сделки в работе» 14/600 · счёт `total` 12/600 `text-text-dim` · «у **{noStepAhead}** из {total} нет шага впереди» · справа «у **{noAmount}** не указана сумма» (`title` прежний). Под ней — **полоса состава**: пять сегментов `flex: {g.total} 1 0; min-width: max-content`, полоска 0.5rem радиус 999px, под ней «**{n}** {подпись}» 12/400. Подписи: сорвано · риск · обновить · решить судьбу · план. Цвет — оттенки `--text` через `color-mix(in srgb, var(--text) {доля}, transparent)`: 62% · 46% · 32% · штриховка · 14%. «Решить судьбу» — штриховка `repeating-linear-gradient(135deg, …30% 0 2px, …8% 2px 5px)`. Группа с `total = 0` — сегмента нет. Полоса — `role="img"`, `aria-label="Состав списка: …"`.

**1.2. Лист группы.** Каждая видимая группа — `<section class="sheet today-grp" aria-label="{название}">`, отступ между листами 0.625rem. Общего листа и шапки колонок (`today-row-head`) больше нет.

**1.3. Заголовок группы** (`GroupHeading`): `flex items-center gap-2`, отступы `0.625rem 1rem 0.375rem`, мин. высота 2.625rem.

- Иконка lucide 1rem без подложки: `fresh` — `AlarmClock` `text-danger-text`; `risk` — `TriangleAlert` `text-warning-text`; `stale` — `Pencil`; `decide` — `Scale`; `plan` — `CalendarDays`; три последние — `text-text-mute`.
- Название 14/600 `text-text-main`, `title` = `TODAY_GROUP_RULES[key]` + (если `inMoves > 0`) «. Ещё {inMovesText} — в ходах наверху». Курсор `help`.
- Счёт 13/500 `text-text-mute` tabular, без плашки.
- Строки правила под заголовком нет (F-13 частично отменяет C-07 — так решено на ревью 04.10).
- Свёрнутая группа: справа шеврон `ChevronRight` (поворот 90° у раскрытой) — кнопка раскрытия на весь заголовок, как сейчас. У «Решить судьбу» правее шеврона — «Разобрать по одной» (кнопка-текст, прежний `onSweep`).

**1.4. CSS** (`globals.css`, блок `S-TODAY-FOCUS-2` после блока FOCUS-1):

```css
/* Лист группы — БЕЗ своего контекста наложения: язычок выбора (z-index: -1 в строке)
   рисуется под листом и выходит из-под левого края. transform, filter,
   backdrop-filter, opacity < 1 или overflow: hidden на этом листе спрячут язычок
   целиком. Спека S-TODAY-FOCUS §5, решение F-18. */
.today-grp { position: relative; overflow: visible; margin-bottom: 0.625rem; }
.sheet.today-grp { backdrop-filter: none; -webkit-backdrop-filter: none; }
```

Специфичность `.sheet.today-grp` (0,2,0) равна `.t-frost .sheet` — правило должно стоять **ниже** него по файлу. Проверь порядком строк.

**Стеклянные темы** (frost, aurora, tidal): лист без blur читается плёнкой (комментарий у `.t-frost .sheet`). Blur переносится на подложку под листом — она не создаёт контекст наложения у самого листа:

```css
.t-frost .sheet.today-grp::before,
.t-aurora .sheet.today-grp::before,
.t-tidal .sheet.today-grp::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  border-radius: inherit; pointer-events: none;
  backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
}
```

Если в смоке 7 blur подложки не виден или язычок пропал — убрать эти три правила, оставить лист без blur и записать в «Отклонения» со скриншотом.

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 2 — строка: `TodayDealRow.tsx` и `rowPill`

**2.1. `src/lib/utils/today-text.ts`** — новая функция, чистая:

```ts
export function rowPill(
  view: TodayDealView,
  todayKey: string,
  written: { nextDateKey: string | null } | null,
): { text: string; tone: 'hot' | 'risk' | 'plain' | 'done'; title: string | null };
```

Проверки сверху вниз, первая подошедшая побеждает:

| Условие | `text` | `tone` | `title` |
|---|---|---|---|
| `written` не `null`, есть дата | `шаг {dayWeekdayText(дата)}` | `done` | `null` |
| `written` не `null`, даты нет | `шага нет` | `done` | `null` |
| `cls.group === 'fresh'` | `{overdueDays} дн.` | `hot` | `null` |
| `cls.group === 'risk'` | дней до шага 0 → `сегодня`; иначе `через {N} дн.` | `risk` | `signalsText(view.signals)` |
| `overdueDays !== null` | `{overdueDays} дн.` | `plain` | `null` |
| шаг впереди | `{dayWeekdayText(next_action_date)}` | `plain` | `null` |
| встреча или звонок впереди (`view.planned`) | `{dayWeekdayText(planned.dateKey)}`, есть время — `, {time}` (как `planItemText`, без названия сделки) | `plain` | `null` |
| иначе | `шага нет` | `plain` | `null` |

Дни до шага — разница ключей дня (`diffDaysKey` — импорт как в `today-deals.ts`). «дн.» — с неразрывным пробелом.

**2.2. Строка** (`TodayDealRow`), макет — кадр 2:

- Корень — `<button type="button" class="today-row" aria-current={selected ? 'true' : undefined} data-row-index={kbdIndex}>`; клик и ⌘/Ctrl+клик — прежний `onSelect(id, e)` из FOCUS-1.
- Сетка `minmax(0, 1fr) 7rem`, `column-gap: 0.875rem`, отступы `0.5625rem 1rem`, разделитель сверху — `::before` от `left: 1rem` до `right: 1rem`, `border-top: 1px solid var(--border)` (у первой строки после заголовка — тоже есть).
- Слева: название 14/600 `line-height 1.35`; шаг 13/400 `line-clamp-2`, у `stale` и `decide` и без шага — `text-text-dim`. Стадии, «срок · после срока» и шеврона нет — это теперь в фокусе.
- Справа, по правому краю, колонкой с `gap: 0.25rem`: сумма 13/500 tabular или «без суммы» 12/400 `text-text-mute`; плашка `rowPill` — высота 1.25rem, `padding: 0 0.4375rem`, радиус 999px, 12/500:
  - `hot` — `bg-danger-l text-danger-text`;
  - `risk` — прозрачный фон, граница `--border2`, значок `TriangleAlert` 0.75rem `text-warning-text`, `title` из `rowPill`;
  - `plain` — `bg-surface2 text-text-dim`;
  - `done` — `bg-success-l text-success-text`, под плашкой «записано сегодня» 11/400 `text-success-text`.
- Наведение — `--surface2`. Последняя строка листа — радиус низа как у `.sheet` (`border-radius: 0 0 var(--radius-m) var(--radius-m)`): лист без `overflow: hidden`, иначе подсветка вылезет за скругление.

**2.3. Снять CSS V3:** `.today-row-grid`, `.today-row-head`, `.today-row-sub`, `.today-row-amount`, если `grep` из разведки 5 других потребителей не показал. Временный маркер строки из FOCUS-1 (`--accent-l2`) снять — его заменяет язычок (задача 4). Маркер — правило `.today-cq [data-today-pick][aria-current='true']` в `globals.css`: у строки сделки снять атрибут `data-today-pick`, у карточки хода он остаётся до S3.

**Проверка:** `npx vitest run tests/unit/today-text.test.ts`.

---

## ЗАДАЧА 3 — свёрнутые группы: чипы сделок

- Свёрнутая группа (`decide`, `plan` и любая с `layout.collapsed`) вместо сводки `collapsedSummary` показывает чипы — по одному на строку группы: `<button class="today-chip">` высота 1.75rem, `padding: 0 0.625rem`, радиус 999px, граница `--border`, фон `--surface`; внутри «**{название}**» 13/500 и `rowPill(...).text` 12/400 `text-text-mute` tabular. Обёртка — `flex flex-wrap gap-1.5`, отступы `0.125rem 1rem 0.875rem`.
- `inMoves > 0` → последним чип-подпись «ещё {inMovesText} — в ходах наверху», пунктирная граница, `text-text-mute`, не кнопка.
- Клик по чипу: группа раскрывается (`onToggleGroup`), сделка выбирается (`onSelect`). ⌘/Ctrl+клик — новая вкладка, группа не раскрывается.
- `collapsedSummary` и импорт `namesText`, ставшие ненужными, — удалить.

Почему чипы, а не сводка: клик по сводке раскрывал группу целиком, чип сразу ведёт в фокус нужной сделки (F-12).

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 4 — язычок выбора и анимация

**4.1. Разметка.** В **каждой** строке сделки — `<span class="today-tab" aria-hidden="true" />` первым ребёнком. Язычок есть у всех строк, видимость задаёт CSS по `aria-current`: так уходящий язычок успевает доиграть анимацию. Условный рендер одного язычка уберёт старый мгновенно.

**4.2. CSS** (блок `S-TODAY-FOCUS-2`):

```css
/* Левая колонка — свой контекст наложения: язычок с z-index: -1 рисуется над фоном
   страницы, но под листом группы. */
.today-split > .min-w-0 { isolation: isolate; }

.today-tab {
  position: absolute; z-index: -1;
  left: -0.5625rem; top: 0.3125rem; bottom: 0.3125rem; width: 0.8125rem;
  border-radius: 0.375rem 0 0 0.375rem;
  background: var(--accent);
  box-shadow: -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--text)),
              0 1px 2px color-mix(in srgb, var(--text) 18%, transparent);
  transform: translateX(0.75rem); opacity: 0;
  transition: transform 140ms ease-in, opacity 0s linear 140ms;
}
.today-row[aria-current='true'] .today-tab {
  transform: translateX(0); opacity: 1;
  transition: transform 260ms cubic-bezier(0.3, 1.35, 0.5, 1) 110ms, opacity 0s linear 110ms;
}
[data-tab-fast='true'] .today-tab { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .today-tab, .today-row[aria-current='true'] .today-tab { transition: none; }
}
```

`.today-row` — `position: relative`; своего `z-index` у строки нет.

**4.3. Быстрый J/K.** В `TodayView` — ref с временем последней смены `focusId`. Смена через < 150 мс после предыдущей → `data-tab-fast="true"` на левой колонке; через 150 мс без смен → атрибут снимается. Анимации не накладываются.

**4.4. Значения.** Язычок выходит на 9 px (`-0.5625rem`), под листом — ещё 4 px запаса: пружина 1.35 не отрывает его от края. Цвет — `--accent`: язычок про выбор, не про смысл. Фон строки при выборе не меняется: один факт — один маркер (уточнение Олега 04.10).

**Проверка:** `npx tsc --noEmit`.

---

## ТЕСТЫ

**`tests/unit/today-text.test.ts`** — дописать `rowPill`:

- `fresh`, 4 дня → «4 дн.», `hot`.
- `risk`, шаг через 3 дня, сигналы «КП истекло» и «задача просрочена» → «через 3 дн.», `risk`, `title` — текст `signalsText`.
- `risk`, шаг сегодня → «сегодня».
- `stale`, 26 дней → «26 дн.», `plain`.
- Шаг впереди без сигналов → день недели и дата.
- Без шага, встречи нет → «шага нет».
- `written` с датой → «шаг пн 5 окт», `done`; `written` без даты → «шага нет», `done`.

Полоса состава, чипы и язычок — тестов нет: разметка и CSS; ветвление вынесено в `rowPill` и покрыто.

```bash
npx vitest run tests/unit/today-text.test.ts 2>&1 | tail -10
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
grep -rn "today-row-grid\|today-row-head\|collapsedSummary" src | head
grep -n "ChevronRight" src/components/today/TodayDealRow.tsx | head
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `build` проходит; `audit-tokens` без новых находок.
2. Два последних `grep` — пусто.
3. Домен V3 и `today-selection.ts` не тронуты: `git diff --stat main -- src/lib/domain/` — пусто.

## СМОКИ

Только чтение и выбор, записи нет. Темы: `t-minimal`, `t-aura`, `t-washi`, `t-frost`, для язычка ещё `t-aurora`, `t-tidal`. Ширины 1440 и 1280.

| # | Что | Ожидание |
|---|---|---|
| 1 | Открыть экран | Шапка книги и полоса состава; группы — отдельные листы; строк правила под заголовками нет |
| 2 | Навести на название «Сорвано недавно» | Подсказка: правило и «ещё 2 — в ходах наверху» (по данным дня) |
| 3 | Клик по строке | Язычок вышел из-под левого края листа; фон строки не изменился; фокус показывает сделку |
| 4 | Клик по строке другого листа | Старый язычок ушёл под свой лист, новый вышел с лёгкой пружиной; по вертикали ничего не ехало |
| 5 | Зажать J на 2 секунды | Язычок без пружины, без «хвоста» анимаций; после отпускания — на выбранной строке |
| 6 | Чип в свёрнутой «Решить судьбу» | Группа раскрылась, у строки этой сделки — язычок, фокус на ней |
| 7 | `t-frost`, `t-aurora`, `t-tidal` | Листы с blur подложки (`getComputedStyle(grp, '::before').backdropFilter` ≠ `none`); язычок виден; просвет сквозь край листа — не больше 4 px |
| 8 | `t-washi` | Язычок красный (акцент темы); плашка «Сорвано» отличима от язычка формой и местом |
| 9 | Системная настройка «уменьшить движение» | Язычок появляется без анимации |
| 10 | Строка с сигналом риска | ⚠ в плашке «через N дн.»; подсказка — текст сигналов |
| 11 | Наведение на последнюю строку листа | Подсветка не выходит за скругление листа |

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Плиток с кольцом, полосы ходов и переноса прогресса дня (S3).
- Активности в фокусе (S4).
- Своей всплывающей подсказки: подсказки — атрибутом `title`, как в остальном проекте.
- Правок `TodayOffDeals` и «Отложено на завтра».

## STATUS

`crm-architect/STATUS.md` не правь. После мержа гейт пишет строку `| #<PR> | S-TODAY-FOCUS-2 | … |` и поднимает ревизию — протокол закрытия спринта в `crm-architect/SKILL.md`. Без этой строки `scripts/status-check.sh` краснеет после мержа (урок эпика S-TODAY-V3). В «Дополнительно» отчёта предложи текст строки: что изменилось для пользователя, число тестов, «Миграций нет».

## КОММИТ

Перед коммитом сохрани отчёт (формат — секция ОТЧЁТ ниже) в `_analysis/sprint-S-TODAY-FOCUS-2-report.md`: спринт-файл уже в `main`, а страж `sprint-file` требует файл `_analysis/` в диффе ветки (урок FOCUS-1). `git add` и `git commit` — отдельными вызовами.

```bash
git checkout -b feat/today-focus-2
git add src/ tests/ _analysis/sprint-S-TODAY-FOCUS-2-report.md
git commit -m "feat(today): список — листы групп, строка без шеврона, язычок выбора

- каждая группа — свой лист; заголовок: иконка, название с правилом в подсказке, тихий счёт
- полоса состава книги по группам
- строка: название и шаг слева, сумма и плашка дней справа (rowPill); риск — ⚠ с подсказкой
- свёрнутые группы — чипы сделок: клик раскрывает группу и ведёт в фокус
- выбор — язычок из-под листа, пружина 260 мс, без анимации при быстром J/K и reduced-motion

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

Дополнительно приложи: результат смоков 5 и 7 по каждой из трёх стеклянных тем (значение `backdropFilter` подложки, виден ли язычок); число полных строк списка выше сгиба на 1440×900 и 1280×800.
