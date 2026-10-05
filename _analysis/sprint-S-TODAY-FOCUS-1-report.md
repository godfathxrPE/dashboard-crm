# Отчёт CC — S-TODAY-FOCUS-1: фокус и выбор

Ветка `feat/today-focus-1`. Спринт — `_analysis/sprint-S-TODAY-FOCUS-1.md` (в `main` с #165).
Файл заведён по правилу стража `sprint-file`: спринт-файл уже в `main` и не менялся.

## Сделано

- `src/lib/domain/today-selection.ts` — новый модуль: `resolveSelection`, `nextInSweep`.
- `src/lib/utils/today-text.ts` — добавил `SLOT_KINDS`, `focusKicker`, `amountSourceText`, `quoteLineText`.
- `src/lib/hooks/use-container-wide.ts` — новый хук `useContainerWide(ref, 56)` на `ResizeObserver`.
- `src/components/today/TodayFocusPane.tsx` — новый: `<aside>`, шапка на `.glass-sheet`, узкий режим с ✕.
- `src/components/today/TodayFocusBody.tsx` — новый: секции «Было», «Лента», «Задачи и звонки», «КП», «Сделка».
- `src/components/today/TodayDealPanel.tsx` — удалил.
- `src/components/today/TodayView.tsx` — снял `openPanel`/`togglePanel`/`panel()`; добавил `selectedId`, `focusId`, `narrowOpen`, сетку `.today-split`, портал узкого режима.
- `src/components/today/TodayView.tsx` — связал подсветку J/K и выбор двумя эффектами; Enter, Esc, клик и ⌘/Ctrl-клик — по таблице задачи 5.
- `src/components/today/TodayMoveCard.tsx` — корень стал `<button>`; убрал «Подробнее», ряд действий и «Вернуть».
- `src/components/today/TodayMoves.tsx`, `TodayGroups.tsx`, `TodayDealRow.tsx` — пропсы `selectedId` и `onSelect(id, e)` вместо раскрытия.
- `src/components/today/TodayStepActions.tsx` — проп `keyHints`, компонент `KeyHint`.
- `src/app/globals.css` — `.today-split`, `.today-focus`, `.today-focus-overlay`, `.today-open-long`; маркер выбора `--accent-l2`; удалил `.today-panel-cols`.
- `tests/unit/today-selection.test.ts` — новый, 9 тестов.
- `tests/unit/today-text.test.ts` — добавил 14 тестов.

## Проверки

- `npx tsc --noEmit` → 0 ошибок.
- `npm run lint` → 0 errors, 33 warnings (базовая линия — 33).
- `npx vitest run` → 2750 passed (база 2727, +23).
- `python3 scripts/audit-tokens.py` → 0 находок вне реестра.
- `next build` в отдельном worktree → `Compiled successfully`, типы проверены; пререндер `/chat` упал: в worktree нет `.env.local` (страж не дал симлинк).
- `grep TodayDealPanel|openPanel|today-panel-cols` → пусто. `grep window.confirm|alert|prompt` → пусто. `grep` hex в фокусе → пусто.
- `git diff --stat main --` по `today-deals.ts`, `today-model.ts`, `step-flow.ts`, `day-moves.ts` → пусто.

## Смоки

Вкладка Chrome скрыта (`visibilityState = hidden`), `resize_window` не менял вьюпорт (1703–1920 px). Ширины 1440/1280 эмулировал шириной `.today-cq`: 1154 и 994 px — ширина контента по спеке, §2.

| # | Факт |
|---|---|
| 1 | В фокусе «АР Системс» — ход 1, первый несделанный. Маркер карточки `rgba(14,124,134,0.16)`; шапка `rgba(0,10,12,0.84)`; тело `rgb(255,255,255)`. |
| 2 | Клик по «Глорус-норд»: фокус — «Глорус-норд»; сдвиг строки 0 px, `scrollY` не изменился. |
| 3 | J×5: Лоренц снек → Хлебпродукт-2 → За Родину → Акура-С → Сафонова; K×2 обратно. `.kbd-focus-row` у сделок — 0 на каждом шаге. |
| 4 | Выбор «За Родину» (индекс 9). Раскрыл «Решить судьбу»: выбор остался «За Родину». J → «Акура-С» (индекс 10). |
| 5 | Тестовая сделка. Enter → DOM-фокус на ссылке «Тест · смок ACT-1» в шапке, `:focus-visible` true. Tab → «Сделано D». Enter → форма в шапке, курсор в `textarea`. Esc → форма закрыта, фокус на ссылке шапки. Esc → фокус на `button[data-row-index=3]`; J → «Нытва». |
| 6 | Тестовая сделка: D, U, T открыли формы «done», «update», «move» в шапке. T → «Вт 6 окт» → «Перенести»: шапка «Перенесён на вт 6 окт · в сделке „перенесён 1 раз“ · Вернуть». «Вернуть» → шаг на сегодня, кнопки вернулись. |
| 7 | ⌘-клик и средняя кнопка по «Глорус-норд»: `window.open('/deals/d41074d3…', '_blank', 'noopener,noreferrer')` дважды; выбор остался «Нытва». |
| 8 | Ссылки шапки «Лоренц снек ↗» и «Открыть сделку ↗ O» → `/deals/617ee9d3…`. Клавиша O на «АР Системс» → `/deals/efaacf97…`. |
| 9 | `scrollY` 480: `aside.top` 16 px, высота 787 px ≤ `100vh − 2rem`; у тела `overflow-y: auto`. Длинной ленты на живых данных не нашлось — прокрутка внутри тела не проверена. |
| 10 | `.today-cq` 800 px: `aside` нет; J сменил выбор, панель не открыл. Клик по строке → `aside` в `body`, `position: fixed`, z 40, 448×891 у правого края, ✕ есть. Esc и ✕ закрыли; выбор остался. |
| 11 | Не выполнен: запись по живой сделке группы «Решить судьбу». «Разобрать по одной» раскрыл группу и выбрал первую строку «ЭЙЧ ЭНД ЭН». |
| 12 | Фон шапки: aura `rgba(3,6,10,0.84)`, minimal `rgba(0,10,12,0.84)`, washi `rgba(30,0,0,0.84)`, frost `rgba(221,232,255,0.88)` — нигде не `rgb(255,255,255)`. |
| 13 | «Глорус-норд»: «КП не заведено · сумма — из бюджета сделки», ссылка «Создать КП». «Лоренц снек»: «Черновик от 7 сент · 14,3 млн ₽ · не отправлено», ссылка «Открыть КП» → `?tab=quotes`. |

Ширина списка и фокуса (`getBoundingClientRect`): 1440 (контент 1154) — 690 / 448 px; 1280 (контент 994) — 578 / 400 px, ряд «Открыть ↗ O».

## Отклонения от спринта

- `globals.css`: добавил `.today-focus .glass-sheet .text-red { color: var(--sheet-red) }`. `.text-red` читает `var(--red-text, var(--red))`, стекло перекрашивает только `--red`. Замер в minimal: `#B02A24` на тёмном стекле. После правки — контраст 5.1–5.6 в minimal, aura, washi, frost.
- Пробел перед «дн.» — обычный. Тексты экрана (`dueText`, `moveWhy`) используют обычный пробел.
- Дата КП — «7 сент», не «7 сен»: формат `dayText` (`Intl`, `ru-RU`).
- `isActive` учитывает только `:focus-visible` внутри фокуса. Причина: после клика мышью по «Готово» в теле J/K не работали бы до Esc.
- D/U/T и «Разобрать по одной» в узком режиме открывают панель. Иначе форма открывалась бы невидимой.
- `doneOf` потерял аргумент места. Фильтр «только сделанный ход набора» для карточки стоит в вызове `TodayMoves`.
- Строка «N из N ходов сделано» (все ходы сделаны) сохранила «Вернуть».
- ✕ узкого режима стоит последней в DOM шапки (абсолютно). Причина: Enter ставит DOM-фокус в первую ссылку шапки, не в ✕.
- Лента без событий — «Событий по сделке нет». «Контакт не указан» — только при `contact_id = null`.

## Вопросы и риски

- `DealNextStep.tsx` и `LeadNextStep.tsx` рисуют `text-red` на стекле — тот же дефект, что выше. Правка общего `.glass-sheet` (`--red-text: var(--sheet-red)`) — отдельным фиксом.
- Полный `npm run build` не прошёл: в основном дереве живой `next dev`, в worktree нет `.env.local`.
- Смоки шли в скрытой вкладке: `ResizeObserver` срабатывал только после скриншота. В видимой вкладке переключение режима не проверено.

## Строка STATUS (предложение)

`| #<PR> | S-TODAY-FOCUS-1 | «Сегодня»: один детальный вид — фокус справа; выбор кликом и J/K, форма хода в шапке фокуса, узкий экран — панель поверх. 23 теста. Миграций нет. |`
