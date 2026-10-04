# Claude Code Prompt — S-TODAY-FOCUS-1: фокус и выбор

**Основание:** `_analysis/today-focus-spec.md` (§2–§4, §8; решения F-01, F-02, F-03, F-05, F-09, F-11), макет `_analysis/mockup-S-TODAY-FOCUS.html` (кадры 1, 2, 3, 6).
**Эпик:** S-TODAY-FOCUS, спринт 1 из 4. **Зависимость:** S-TODAY-V3 в `main` (`f952d4d`).
**Схема:** миграций нет, БД не трогаем, типы не меняются.
**Цель:** у экрана «Сегодня» один детальный вид сделки — фокус справа. Сделку в него загружает выбор: клик, J/K, Enter. Раскрытие под строкой и под ходами уходит, действия хода живут в шапке фокуса.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. V3 в main — ожидание: f952d4d или новее, компоненты на месте
git log --oneline -3
ls src/components/today/

# 2. Детальный вид, который заменяем — ожидание: TodayDealPanel импортирует только TodayView
grep -rn "TodayDealPanel" src --include=*.tsx | grep -v "^src/components/today/TodayDealPanel.tsx"
grep -n "openPanel\|togglePanel\|panel(" src/components/today/TodayView.tsx | head -30

# 3. Навигация — прочитай целиком: сброс activeIndex при смене itemCount, Enter с preventDefault
sed -n 1,140p src/lib/hooks/use-keyboard-nav.ts

# 4. Форма хода и её место — ожидание: composer.place 'card' | 'panel'
grep -n "composer\|place" src/components/today/TodayView.tsx | head -40
grep -n "interface TodayStepActionsProps" -A 14 src/components/today/TodayStepActions.tsx

# 5. Данные фокуса — суммы, КП, срок действия КП
grep -n "export function dealHeaderAmount" -B 12 src/lib/domain/deal-amount.ts | head -30
grep -n "export function pickActiveQuote" -B 6 -A 10 src/lib/domain/quote-version.ts
grep -n "export function quoteValidity" -B 10 -A 6 src/lib/domain/quote-validity.ts
grep -n "quotesQ" src/components/today/TodayView.tsx | head

# 6. Стекло и тема — ожидание: пара `.glass-sheet, [data-card].glass-sheet`, перекраска --red и --warning-text
grep -n "^\.glass-sheet,$" -A 24 src/app/globals.css
grep -n "today-cq\|today-panel-cols" src/app/globals.css src/components -r | head

# 7. Образец панели поверх списка — PeekPanel (z-40, без оверлея)
sed -n 1,40p src/components/shared/PeekPanel.tsx

# 8. Тексты экрана и группы
grep -n "^export\|SLOT_LEADS" src/lib/utils/today-text.ts
cat src/lib/constants/today-groups.ts | head -12

# 9. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

---

## ЗАДАЧА 1 — домен и тексты фокуса

**1.1. `src/lib/domain/today-selection.ts`** — новый модуль, чистый.

```ts
export interface SelectionScreen {
  /** Id ходов в порядке показа. */
  moves: readonly string[];
  /** Сделанные сегодня ходы. */
  doneMoves: ReadonlySet<string>;
  /** Id строк групп в порядке показа, включая строки свёрнутых групп. */
  rows: readonly string[];
}

/**
 * Какая сделка в фокусе. Выбранная, если она есть на экране; иначе первый несделанный
 * ход → первый ход → первая строка → null.
 */
export function resolveSelection(selectedId: string | null, screen: SelectionScreen): string | null;

/** «Разобрать по одной»: следующая строка после `id` в списке `rows`; последней нет — null. */
export function nextInSweep(id: string, rows: readonly string[]): string | null;
```

**1.2. `src/lib/utils/today-text.ts`** — дописать.

```ts
/** Короткий вид слота — кикер фокуса (S1) и плитка хода (S3). */
export const SLOT_KINDS: Record<MoveSlot, string>;
// assigned → 'На сегодня', fresh → 'Свежий срыв', biggest → 'Сумма без шага', fill → 'Добор'

/** Кикер шапки фокуса: «почему эта сделка здесь». */
export function focusKicker(
  view: TodayDealView,
  move: { n: number; of: number } | null,
): { lead: string; days: string | null; hot: boolean };

/** Источник суммы под суммой в шапке. */
export function amountSourceText(
  source: 'quote' | 'budget' | 'none',
  activeStatus: QuoteStatus | null,
): string;

/** Строка секции «КП». */
export function quoteLineText(
  quote: Pick<Quote, 'status' | 'amount' | 'created_at' | 'sent_at' | 'accepted_at' | 'valid_until' | 'updated_at'> | null,
  amountSource: 'quote' | 'budget' | 'none',
  now: Date,
): { text: string; warn: boolean; action: 'open' | 'create' };
```

`focusKicker`:

| Вход | `lead` | `days` |
|---|---|---|
| ход | `Ход {n} из {of} · {SLOT_KINDS[slot]}` | `overdueDays !== null` → `{N} дн.` |
| строка | `TODAY_GROUP_LABELS[group]` | `overdueDays !== null` → `{N} дн. после срока` |
| шага нет, дней нет | как выше | `шага нет` |

`hot` — `cls.group === 'fresh'`. Пробел перед «дн.» — неразрывный, как в остальных текстах экрана (проверь `today-text.ts`).

`amountSourceText`: `quote` + `draft` → «черновик КП»; `sent` → «КП отправлено»; `accepted` → «КП принято»; `quote` с другим статусом или без него → «по КП»; `budget` → «бюджет сделки»; `none` → «суммы нет».

`quoteLineText` (даты — `dayText`, сумма — `formatBudget`, сегмент без значения пропускается вместе с « · »):

| КП | `text` | `warn` | `action` |
|---|---|---|---|
| нет, `amountSource === 'budget'` | «КП не заведено · сумма — из бюджета сделки» | нет | `create` |
| нет, иначе | «КП не заведено · суммы нет» | нет | `create` |
| `draft` | «Черновик от {created_at} · {amount} · не отправлено» | нет | `open` |
| `sent`, `quoteValidity(valid_until, now).level === 'expired'` | «Отправлено {sent_at} · истекло {valid_until}» | да | `open` |
| `sent`, иначе | «Отправлено {sent_at} · действует до {valid_until}» | `level === 'soon'` | `open` |
| `accepted` | «Принято {accepted_at} · {amount}» | нет | `open` |
| `rejected` | «Отклонено {updated_at}» | нет | `open` |
| `expired` | «Истекло {valid_until ?? updated_at}» | да | `open` |

**Проверка:** `npx vitest run tests/unit/today-selection.test.ts tests/unit/today-text.test.ts`.

---

## ЗАДАЧА 2 — компонент фокуса

**2.1. `src/components/today/TodayFocusPane.tsx`** — контейнер и шапка. Имя `TodayFocus` не занимать: так назывался удалённый в V3 компонент «Фокус дня», и в истории он есть.

Шапка — `.glass-sheet` (макет, кадр 1, доска «действия в фокусе»):

1. Строка: кикер 11/600 uppercase слева (`focusKicker`; `days` при `hot` — `text-red`, иначе `text-text-dim`) · справа сумма 18/600 tabular и под ней `amountSourceText` 11/400. Суммы нет — «—» и «суммы нет».
2. Шаг 18/600, `line-clamp-3`; шага нет — «Шаг не задан», `text-text-dim`.
3. Контекст 12/400: «{название ↗} · {юрлицо} · {стадия} · перенесён N раз». Название — `<Link href={projectHref(project)}>` со значком `ArrowUpRight` 0.75rem. «Перенесён» — при N ≥ 2, N — `useFieldMoves(id).data?.step.count`.
4. Слот действий — проп `actions: ReactNode` (контейнер отдаёт `TodayStepActions` или `TodayStepDone`).

⚠️ Внутри стекла: `--red` и `--warning-text` перекрашены, `--danger`, `--danger-text`, `--success` — нет. Цвет смысла в шапке — `text-red`, `text-warning-text`. Иначе красный на чёрном стекле теряет контраст в светлых темах.

**2.2. `src/components/today/TodayFocusBody.tsx`** — тело, `bg-surface`, секции через `border-t`, заголовки секций 11/600 uppercase `text-text-mute`. Пропсы простые — `project`, `stage`, `touches`, `tasks`, `calls`, `planned`, `quotes`, `now`, — **не** `TodayDealView`: тело потом заменит `ProjectPeekContent` в «Сделках» (спека, §4).

Порядок и содержимое — из `TodayDealPanel.tsx`, без новой логики:

1. «Было · 30 дней»: `PulseDayStrip` и подпись «За 30 дней по сделке не было ни одного касания».
2. «Лента»: `useEntityTimeline('project', id, undefined, 10)`, события не позже `now`, до 8 (`FOCUS_FEED_EVENTS = 8`); дата 3.25rem tabular + текст `line-clamp-2`; ссылка «Вся лента сделки». Загрузка — три полоски-скелетона; ошибка — «Ленту не загрузили» и кнопка «Повторить» (`refetch`).
3. «Задачи и звонки» — блок из «Сейчас» панели с «Готово» и «Выполнен». Пусто — секции нет.
4. «КП»: `quoteLineText(pickActiveQuote(quotes), …)`; `warn` → `text-warning-text`; справа ссылка «Открыть КП» / «Создать КП» → карточка сделки. Если карточка принимает вкладку через параметр (`grep -rn "searchParams.get('tab')" src/app src/components/projects | head`), веди на вкладку КП; нет — на карточку.
5. «Сделка»: стадия и норма (`useStageTimeGauge`), `deadlineText`, `plannedText` (бывший «Впереди»), `ContactCallChip` или «Контакт не указан».

**2.3. Контейнер** `TodayFocusPane`: `<aside aria-label="Фокус: {сделка}" class="today-focus">` → шапка (не прокручивается) → тело (`overflow-y: auto`, `min-h-0`, флекс-колонка). `headRef` — на шапку: в неё уходит DOM-фокус по Enter (задача 5). Проп `overlay?: boolean` — узкий режим: класс `today-focus-overlay` и кнопка ✕ «Закрыть фокус» в шапке (`onClose`).

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 3 — раскладка: `globals.css` и `TodayView.tsx`

⚠️ **Панель узкого режима — порталом в `document.body`.** У обёртки страницы `PageTransition` при смене маршрута 0,4 с висит класс `.page-entering` с `transform: scale(...)` (`globals.css`, `@keyframes pageSlideIn`): пока он есть, `position: fixed` потомка считается от обёртки, а не от окна. Портал не зависит ни от этой анимации, ни от будущих `transform` у предков. Режим (широкий / узкий) выбирает JS-замер ширины — он же нужен Esc, чтобы отличить «закрыть панель» от «к плану дня». Сам `container-type` на `fixed` не влияет: проверено в Chromium 141 (`position: fixed` внутри `container-type: inline-size` встаёт от окна).

**3.1. `src/lib/hooks/use-container-wide.ts`** — `useContainerWide(ref, minRem = 56): boolean`. `ResizeObserver` на элементе; порог — `minRem × font-size` корня (`getComputedStyle(document.documentElement).fontSize`). До первого замера — `true` (широкий режим, без вспышки панели). Отписка в cleanup.

**3.2. CSS** — в блоке `S-TODAY-V3-SCREEN-1` рядом с `.today-cq`, комментарий `S-TODAY-FOCUS-1` со ссылкой на спеку:

```css
.today-split { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
.today-focus {
  display: flex; flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  position: sticky; top: 1rem;
  max-height: calc(100vh - 2rem);
}
/* Узкий режим: портал в body — вне обёртки PageTransition с её transform. */
.today-focus.today-focus-overlay {
  position: fixed; top: 0; right: 0; z-index: 40;
  height: 100vh; max-height: none; width: min(28rem, 92vw);
  border-radius: 0;
}
@container (min-width: 56rem) {
  .today-split { grid-template-columns: minmax(0, 1fr) 25rem; }
}
@container (min-width: 66rem) {
  .today-split { grid-template-columns: minmax(0, 1fr) 28rem; }
}
```

Порог 56rem в CSS и в `useContainerWide` — одно число; вынеси его комментарием в оба места. Граница — классом в `globals.css`, не утилитой `border-*`: safety-net `.t-frost *` перекрашивает утилиту при равной специфичности. Токены `--radius-l`, `--shadow-card` — проверь объявление (`grep -n "\-\-radius-l:\|\-\-shadow-card:" src/app/globals.css | head -3`).

**3.3. `TodayView.tsx`.** Корень `.today-cq` (ref для `useContainerWide`) → шапка страницы → `<div class="today-split">` → левая колонка `<div class="min-w-0">` (ходы, группы, чипы вне сделок, строка клавиш) + фокус. Широкий режим — `TodayFocusPane` в сетке. Узкий — `createPortal(<TodayFocusPane overlay … />, document.body)`, только пока `narrowOpen`; кнопка ✕ «Закрыть фокус» — только в этом режиме. «Отложено на завтра» — под сеткой. Сделок на экране нет (`!model || model.moves.length + model.groups.reduce((n, g) => n + g.rows.length, 0) === 0`) — фокуса нет.

**3.4. Снять раскрытие.**

- `TodayDealPanel.tsx` — удалить; CSS `.today-panel-cols` — удалить.
- `TodayView`: состояние `openPanel`, `togglePanel`, `panel()`, `panelView`, `panelActions` — убрать.
- `TodayMoves`, `TodayGroups`, `TodayMoveCard`, `TodayDealRow`: пропсы `panel`, `openId`/`openRowId`, `expanded`, `onToggle`/`onToggleRow` → `selectedId: string | null` и `onSelect(id, e: React.MouseEvent)`.
- `TodayMoveCard`: кнопки «Подробнее» и ряда действий нет. Корень — `<button type="button">` на всю карточку; сделанный ход показывает подпись итога без «Вернуть» («Вернуть» — в шапке фокуса). Проп `renderActions` уходит.
- `TodayDealRow`: шеврон пока остаётся — его снимает S2 вместе с новой сеткой строки.

**Проверка:** `grep -rn "TodayDealPanel\|openPanel\|togglePanel\|today-panel-cols" src | head` — пусто.

---

## ЗАДАЧА 4 — модель выбора и форма хода в фокусе

**4.1. Состояние.** `const [selectedId, setSelectedId] = useState<string | null>(null)`. Сделка в фокусе — `focusId = resolveSelection(selectedId, screen)`, где `screen` собран из `model.moves`, `dayDone`, `model.groups.flatMap((g) => g.rows)` (все строки, и свёрнутые). Вид — из модели по `focusId`; `project` — `projectsById`; КП — `quotesQ.data?.get(focusId) ?? []` (проверь форму `useDealsQuotes`).

**4.2. Связь с клавиатурой.** Подсветка сделки и выбор — один факт.

- `activeIndex` встал на сделку → `setSelectedId(её id)`.
- Изменились `focusId` или состав очереди → `setActiveIndex(dealKbdIndex(focusId))`. Эффект **не** зависит от `activeIndex`: иначе J на строку лида вернёт подсветку на сделку. Текущий индекс читай из ref.
- `useKeyboardNav` сбрасывает `activeIndex` в −1, когда меняется `itemCount` (раскрыли группу). Эффект выше возвращает индекс выбранной сделки; проверь смоком 4.
- Класс `kbd-focus-row` у карточек и строк сделок не ставится — это второй маркер выбора. У строк вне сделок (`TodayOffDeals`) — прежний.

**4.3. Маркер выбора — временный.** Карточка хода и строка с `aria-current="true"` — фон `--accent-l2` (конвенция «выбрано» в `theme-system.md`). S2 заменяет его у строк язычком, S3 — у плиток стеклом. Комментарий об этом — в CSS.

**4.4. Клик.** `onSelect(id, e)`: `e.metaKey || e.ctrlKey` → `window.open(href, '_blank', 'noopener,noreferrer')`, выбор не меняется; средняя кнопка (`onAuxClick`, `e.button === 1`) — то же. Иначе — `setSelectedId(id)`; в узком режиме — ещё и `setNarrowOpen(true)`.

**4.5. Форма хода — только в фокусе.** `composer` теряет `place`: `{ id, mode, wasPicked }`. `composeFor(q, mode)` → `setSelectedId(id)` и `openComposer(id, mode)`; D/U/T работают по выбранной сделке, как сейчас по подсвеченной. В шапку фокуса уходит `TodayStepActions` с `primary` = true (рядов действий на экране больше нет) или `TodayStepDone`. `handleWritten` и `doneOf`: аргумент места снять, если он больше ничего не различает; иначе — в «Отклонения».

**4.6. `TodayStepActions`** — новый необязательный проп `keyHints?: boolean`. При `true`: у кнопок — `<kbd>` с клавишей (D у главной, T у «Перенести», S у «Отложить»), `ml-auto` переезжает с «Отложить» на `extra`. Стиль `kbd` — как в `Hotkeys.tsx`, внутри стекла цвет наследуется. В фокусе `extra` — ссылка «Открыть сделку ↗ O» (`ArrowUpRight`). Слово «сделку» — в `<span class="today-open-long">`, который скрыт правилом `@container (max-width: 66rem)` контейнера `.today-cq`: там фокус 25rem, и на 1280 ряд читается «Открыть ↗ O». Ширина фокуса однозначно следует из ширины контента, поэтому второй контейнер не нужен.

**4.7. «Разобрать по одной».** `startSweep` раскрывает «Решить судьбу» и выбирает первую строку. После записи по сделке группы — `nextInSweep`; `null` → `setSelectedId(null)` (фокус уходит на выбор по умолчанию) и `setSweep(false)`.

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 5 — клавиши

| Клавиша | Действие |
|---|---|
| J / K | выбор следует подсветке (задача 4.2) |
| Enter по сделке | узкий режим — `setNarrowOpen(true)`; затем DOM-фокус в первую кнопку шапки (`headRef.current?.querySelector('button, a')?.focus()`, после рендера) |
| Enter по строке вне сделок | прежний `onOpen` |
| Esc | `onEscape`: узкий режим и панель открыта → закрыть; иначе `setSelectedId(null)` — выбор по умолчанию |
| O | карточка выбранной сделки (прежний `openDealPage`) |
| D · U · T · S | как в ACT-1 |

⚠️ **Enter на кнопке шапки.** `useKeyboardNav` ловит Enter на `window` и зовёт `preventDefault`: нажатая Enter на кнопке «Сделано» в шапке не сработает. Поэтому `isActive` дополняется: `composer === null && !focusRef.current?.contains(document.activeElement)`. Пока DOM-фокус в шапке, клавиши экрана молчат. Фокус ловит Esc сам (`onKeyDown` на `<aside>`, форма хода закрыта): в узком режиме закрывает панель; затем возвращает DOM-фокус на элемент `[data-row-index="{activeIndex}"]`, и J/K снова работают. `focusRef` стоит на самом `<aside>` — `contains` работает и для портала.

Строка подсказки под списком: «J / K — выбор сделки · Enter — в фокус · D — главное действие · U — обновить шаг · T — перенести · S — отложить · O — открыть сделку · Esc — к плану дня».

**Проверка:** `npx tsc --noEmit`.

---

## ТЕСТЫ

**`tests/unit/today-selection.test.ts`** — новый.

- Выбранная сделка среди ходов → она.
- Выбранная сделка среди строк свёрнутой группы → она.
- Выбранной нет на экране (отложили) → первый несделанный ход.
- `selectedId = null`, первые два хода сделаны → третий ход.
- Все ходы сделаны → первый ход.
- Ходов нет → первая строка; строк нет → `null`.
- `nextInSweep`: середина списка → следующая; последняя → `null`; id нет в списке → `null`.

**`tests/unit/today-text.test.ts`** — дописать.

- `focusKicker`: ход 1 из 3, `fresh`, 4 дня → `lead` «Ход 1 из 3 · Свежий срыв», `days` «4 дн.», `hot` true.
- Строка `stale`, 26 дней → «Обновить шаг», «26 дн. после срока», `hot` false.
- Строка без шага → `days` «шага нет».
- `amountSourceText`: пять случаев из таблицы задачи 1.
- `quoteLineText`: нет КП и бюджет → `create` и текст про бюджет; `draft` с суммой 14 300 000 → «Черновик от 7 сен · 14,3 млн ₽ · не отправлено» (формат суммы сверь с `formatBudget`); `sent` с `valid_until` вчера → `warn`, «истекло»; `sent` без `valid_until` → сегмента «действует до» нет; `expired` без `valid_until` → дата из `updated_at`.

`now` — аргументом, фиксированная дата 04.10.2026. Компоненты — тестов нет: разметка; выбор, кикер и строки КП вынесены в чистые функции и покрыты.

```bash
npx vitest run tests/unit/today-selection.test.ts tests/unit/today-text.test.ts 2>&1 | tail -15
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
grep -rn "TodayDealPanel\|openPanel\|today-panel-cols" src | head
grep -rn "window.confirm\|window.alert\|window.prompt" src/components/today | head
grep -n "#[0-9a-fA-F]\{3,6\}\b" src/components/today/TodayFocusPane.tsx src/components/today/TodayFocusBody.tsx | head
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `build` проходит; `audit-tokens` без новых находок.
2. Три последних `grep` — пусто.
3. Домен V3 не тронут: `git diff --stat main -- src/lib/domain/today-deals.ts src/lib/domain/today-model.ts src/lib/domain/step-flow.ts src/lib/domain/day-moves.ts` — пусто.

## СМОКИ

Запись — только на **тестовой сделке** тестовой компании. Живые сделки клиентов — только чтение и выбор. Темы: `t-minimal`, затем `t-aura`, `t-washi`, `t-frost`. Ширины: 1440×900, 1280×800, окно уже 1100 px (узкий режим).

| # | Что | Ожидание |
|---|---|---|
| 1 | Открыть экран | В фокусе первый несделанный ход; плитка с маркером `--accent-l2`; шапка на стекле, тело на `--surface` |
| 2 | Клик по строке «Обновить шаг» | Фокус показывает эту сделку; список не сдвинулся; маркер переехал |
| 3 | J/K пять раз подряд | Фокус следует; у сделок нет второй рамки `kbd-focus-row` |
| 4 | Раскрыть «Решить судьбу», затем J | Выбор не сбросился; J идёт от выбранной сделки |
| 5 | Enter → Tab → Enter на «Сделано» | Форма хода открылась в шапке; Esc в форме — «Отмена»; Esc ещё раз — DOM-фокус на строке |
| 6 | D, U, T на тестовой сделке | Форма в шапке в нужном режиме; запись — итог в шапке, «Вернуть» работает |
| 7 | ⌘/Ctrl+клик по строке | Карточка сделки в новой вкладке; выбор прежний |
| 8 | «Открыть сделку ↗», название ↗, клавиша O | Карточка выбранной сделки |
| 9 | Прокрутить страницу до «Решить судьбу» | Фокус прилип к верху; длинная лента прокручивается внутри тела |
| 10 | Окно уже 1100 px | Фокуса справа нет; клик по строке открывает панель поверх; Esc и ✕ закрывают; J/K панель не открывают |
| 11 | «Разобрать по одной» и запись на тестовой сделке | Выбор перешёл на следующую строку группы |
| 12 | `getComputedStyle` шапки в aura | `backgroundColor` — не `rgb(255, 255, 255)` (стекло не перебито `.t-aura [data-card]`) |
| 13 | Сделка без КП и с черновиком КП | «КП не заведено · …» / «Черновик от …» |

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Нового вида строк, листов групп, чипов и язычка (S2).
- Колец и полосы ходов, переноса прогресса дня (S3).
- Строки заметки, фильтра ленты, интерактивного пульса, префетча (S4).
- Правок домена V3, `PulseDayStrip`, `useKeyboardNav`, `PeekPanel`.
- AI-сводки сделки.

## STATUS

`crm-architect/STATUS.md` не правь. После мержа гейт пишет строку `| #<PR> | S-TODAY-FOCUS-1 | … |` и поднимает ревизию — протокол закрытия спринта в `crm-architect/SKILL.md`. Без этой строки `scripts/status-check.sh` краснеет после мержа (урок эпика S-TODAY-V3). В «Дополнительно» отчёта предложи текст строки: что изменилось для пользователя, число тестов, «Миграций нет».

## КОММИТ

```bash
git checkout -b feat/today-focus-1
git add src/ tests/ _analysis/sprint-S-TODAY-FOCUS-1.md _analysis/today-focus-spec.md _analysis/mockup-S-TODAY-FOCUS.html
git commit -m "feat(today): фокус сделки справа — один детальный вид, выбор кликом и J/K

- today-selection: выбор по умолчанию и «Разобрать по одной»
- TodayFocusPane: шапка на стекле (почему здесь, шаг, действия), тело на surface
- раскрытие под строкой и под ходами снято, TodayDealPanel удалён
- форма хода живёт в шапке фокуса; Enter — в фокус, Esc — к плану дня
- узкий экран: фокус панелью поверх списка

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

Дополнительно приложи: результат смоков 3, 4, 5 и 12 (факт, не «работает»); ширину списка и фокуса в px на 1440 и 1280 (`getBoundingClientRect`).
