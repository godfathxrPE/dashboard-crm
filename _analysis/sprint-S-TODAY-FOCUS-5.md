# Claude Code Prompt — S-TODAY-FOCUS-5: шапка фокуса и секция «Риски»

**Основание:** `_analysis/today-focus-spec.md`, §12 (решения H-01…H-05, приняты владельцем 05.10); доска `_analysis/mockup-S-TODAY-FOCUS-5.html` — пары «сейчас / предложение» на живых данных 05.10 (cobalt, frost, 25rem).
**Эпик:** S-TODAY-FOCUS, спринт 5 из 5. **Зависимость:** `S-TODAY-FOCUS-4` в `main` (интерактивный пульс, строка заметки `TodayFocusNote`, фильтр ленты).
**Схема:** миграций нет, БД не трогаем, типы не меняются.
**Цель:** в шапке фокуса сразу видно, какая это сделка: название — заголовок, шаг — на подложке, как в «Следующем шаге» карточки сделки. У «Под риском» в шапке остаются значок и слово. Причины риска — секцией «Риски» в теле, сразу под пульсом, каждая с действием.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. FOCUS-4 в main — ожидание: строка заметки и фильтр ленты на месте
git log --oneline -5
ls src/components/today/TodayFocusNote.tsx src/lib/domain/focus-feed.ts

# 2. Шапка фокуса сейчас — кикер, сумма, шаг 18/600, строка контекста, слот действий
grep -n "focusKicker\|amountSourceText\|line-clamp-3\|text-lg\|ArrowUpRight\|context" src/components/today/TodayFocusPane.tsx
grep -n "export function focusKicker" -A 16 src/lib/utils/today-text.ts

# 3. Порядок секций тела после FOCUS-4 — ожидание: «Было» → строка заметки → «Лента» → «Задачи и звонки» → «КП» → «Сделка»
grep -n "<Section\|TodayFocusNote\|quoteLine\|overdue" src/components/today/TodayFocusBody.tsx

# 4. Сигналы риска — правило группы «Под риском» (ровно его повторяет секция «Риски»)
grep -n "export function riskSignals" -A 34 src/lib/domain/today-deals.ts
grep -n "signalsText" -A 9 src/lib/utils/today-text.ts | head -12

# 5. Задачи и звонки вида сделки — ожидание: просроченные открытые задачи и звонки входят, `overdue` — день срока < сегодня
grep -n "const tasks: TodayDealTask" -A 12 src/lib/domain/today-model.ts

# 6. Подложка шага карточки сделки — ожидание: `.glass-plate` в `@layer components`, угол «хвостик» (radius-l radius-l radius-l radius-s)
grep -n "\.glass-plate {" -A 5 src/app/globals.css
grep -n "glass-plate" src/components/projects/DealNextStep.tsx

# 7. Стекло перекрашивает --warning-text (значок и слово «Под риском» в шапке) — ожидание: строка есть
grep -n "\-\-warning-text: var(--sheet-warning)" src/app/globals.css

# 8. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

---

## ЗАДАЧА 1 — домен: `src/lib/domain/today-risks.ts` и кикер

**1.1. `src/lib/domain/today-risks.ts`** — новый модуль, чистый. Строки секции «Риски» из тех же данных и по тем же условиям, что `riskSignals`: секция обязана появляться ровно тогда, когда сделка «Под риском» по сигналам, и не спорить с группой.

```ts
import type { QuoteLike } from './quote-version';
import type { TodayDealCall, TodayDealTask } from './today-model';

export type FocusRiskRow =
  | { kind: 'quote_expired'; quoteId: string; validUntil: string; sentAt: string | null }
  | { kind: 'task_overdue'; taskId: string; text: string; deadline: string }
  | { kind: 'call_overdue'; callId: string; date: string };

/**
 * Строки секции «Риски» фокуса. Условия — как в `riskSignals` (`today-deals.ts`):
 * КП — активное (`pickActiveQuote`), статус `sent`, `quoteValidity(...).level === 'expired'`;
 * задача — `overdue` из вида сделки (день срока < сегодня, `lane !== 'done'`);
 * звонок — `overdue` из вида сделки (`pending`, день < сегодня).
 * Порядок: КП → задачи по сроку → звонки по дате.
 */
export function focusRiskRows(
  input: {
    quotes: readonly (QuoteLike & { id: string; valid_until: string | null; sent_at: string | null })[];
    tasks: readonly TodayDealTask[];
    calls: readonly TodayDealCall[];
  },
  now: Date,
): FocusRiskRow[];
```

Сверь тип `QuoteLike` и поля КП с `quote-version.ts` и `Quote` (`src/types/entities`); при расхождении возьми `Pick<Quote, …>` — в «Отклонения».

**1.2. `src/lib/utils/today-text.ts`** — две правки.

- `focusKicker` возвращает ещё `risk: boolean` = `cls.group === 'risk'`. У риска `days` — `null`: дней у «Под риском» нет, причина — в секции «Риски» (решение H-03). Остальные ветки не меняются.
- Новая `focusRiskText(row: FocusRiskRow): string`:

| `kind` | Текст |
|---|---|
| `quote_expired` | «КП истекло {dayText(validUntil)}», есть `sentAt` — « — отправлено {dayText(sentAt)}» |
| `task_overdue` | «Задача «{text}» — срок был {dayText(deadline)}» |
| `call_overdue` | «Звонок {dayText(date)}, {mskTime(date)} — не выполнен» |

Даты ключом дня — как в остальных текстах экрана (`mskDateKey`, где на входе timestamp).

**1.3. `stepPlateLabel(view, todayKey): string`** в `today-text.ts` — подпись подложки шага: шаг впереди — «Следующий шаг · {dayWeekdayText(next_action_date)}»; срок прошёл — «Следующий шаг · срок был {dayWeekdayText(next_action_date)}»; даты нет — «Следующий шаг». Цвета у подписи нет: красный у срыва уже стоит в кикере (один факт — один маркер).

**Проверка:** `npx vitest run tests/unit/today-risks.test.ts tests/unit/today-text.test.ts`.

---

## ЗАДАЧА 2 — шапка: `TodayFocusPane.tsx`

Макет — доска, пары 1–3 «предложение». Сверху вниз:

1. **Кикер и сумма** — строка как сейчас. Кикер: при `kicker.risk` — значок `TriangleAlert` 0.75rem и слово «Под риском» классом `text-warning-text` (стекло перекрашивает `--warning-text` в `--sheet-warning`), без причины и без дней. Свежий срыв — как сейчас: дни `text-red` (обход FOCUS-1 `.today-focus .glass-sheet .text-red` на месте). Сумма и её источник — без изменений (H-04).
2. **Название сделки — заголовок** (H-01): `<Link>` 16/600 (`text-base font-semibold leading-snug`), значок `ArrowUpRight` 0.75rem, `title="Открыть карточку сделки · O"`, `mt-1.5`. Длинное название — до двух строк (`line-clamp-2`).
3. **Строка контекста** 12/400 `text-text-dim`, `mt-0.5`: «{юрлицо} · {стадия} · перенесён N раз» (N ≥ 2, как сейчас). Название из этой строки уходит.
4. **Подложка шага** (H-02): `<div class="glass-plate mt-3 px-3.5 pb-3 pt-2.5">` — тот же класс, что у `DealNextStep`. Внутри: подпись `stepPlateLabel` 11/600 uppercase `tracking-wider text-text-dim`; текст шага 14/500 (`text-sm font-medium leading-[1.42]`), `line-clamp-3`, `mt-1`; шага нет — «Шаг не задан» `text-text-dim`.
5. **Ряд действий** — без изменений, `mt-3`; овальные подсказки клавиш оставить как есть (решение владельца 05.10). Форма хода открывается на месте ряда, подложка шага остаётся над формой.

`data-card` на шапку не ставить. Новых правил CSS не нужно: `.glass-plate` и стекло уже в `globals.css`. Нужна граница или фон вне токенов — классом в `globals.css`, не утилитой (safety-net `.t-frost *`).

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 3 — секция «Риски»: `TodayFocusBody.tsx`

**3.1. Место.** Второй секцией тела: сразу после «Было · 30 дней» (пульс — первым, решение владельца 05.10), перед строкой заметки FOCUS-4. Строки — `focusRiskRows({ quotes, tasks, calls }, now)`; строк нет — секции нет. Пропсы тела не меняются: всё уже приходит (`quotes`, `tasks`, `calls`, `now`) — тело по-прежнему не зависит от `TodayDealView`.

**3.2. Строка.** `flex items-start gap-2 text-xs`: `TriangleAlert` 0.8125rem `text-warning-text shrink-0 mt-0.5` → текст `focusRiskText(row)` `text-text-main min-w-0 flex-1` → действие справа, класс кнопки — прежний `ROW_BUTTON`:

| `kind` | Действие |
|---|---|
| `quote_expired` | ссылка «Открыть КП» → `quotesHref` (тот же, что у секции «КП») |
| `task_overdue` | «Готово» → `updateTask.mutate({ id, lane: 'done' })` |
| `call_overdue` | «Выполнен» → `updateCall.mutate({ id, status: 'done' })` |

Заголовок секции — «Риски», тем же `Section`, что у остальных.

**3.3. Один факт — один маркер.**
- «Задачи и звонки»: просроченные задачи и звонки уходят в «Риски», здесь — остальные (`!overdue`). Остальных нет — секции нет. Цвет `text-warning-text` у задач и звонков этой секции снять: просроченных здесь больше нет.
- «КП»: если среди строк есть `quote_expired`, строка КП — `text-text-main` (факт уже в «Рисках»). Предупреждение «скоро истекает» (`level === 'soon'`) — в «Риски» не входит и остаётся тёплым, как сейчас.

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 4 — темы и состояния

Проверить в браузере, итог — в отчёт. Темы: `t-cobalt` (на ней владелец смотрел доску), `t-minimal`, `t-aura`, `t-frost`.

| Что | Ожидание |
|---|---|
| Значок и «Под риском» в шапке | `getComputedStyle(...).color` = значение `--sheet-warning` темы (cobalt/minimal — `#FFC24D`, frost — `#764600`) |
| Подложка шага | фон = `--sheet-plate-bg`, граница = `--sheet-plate-border`; угол слева снизу меньше остальных |
| Значок в «Рисках» | `--warning-text` темы, не `--accent` (в washi акцент красный) |
| Шапка без `data-card` | в aura фон шапки ≠ `rgb(255, 255, 255)` |
| Высота шапки | `getBoundingClientRect().height` на 1440 и 1280 для сделки «Под риском» и для хода — в отчёт (доска: 261 / 279 px и 291 px) |

---

## ТЕСТЫ

**`tests/unit/today-risks.test.ts`** — новый. `now` — аргументом, 05.10.2026.

- Отправленное КП, `valid_until` 18.09 → строка `quote_expired` с датой и `sentAt`.
- Черновик КП с прошедшим `valid_until` → строки нет (как в `riskSignals`).
- Принятое КП → строки нет.
- Задача со сроком вчера → строка; со сроком сегодня 13:00 → строки нет.
- Две просроченные задачи → две строки, по сроку.
- Звонок `overdue` → строка `call_overdue`.
- Порядок: КП → задачи → звонки.
- **Сверка с группой:** на 8 входах (комбинации КП / задача / звонок, просрочено или нет) `focusRiskRows(...).length > 0` ⇔ `riskSignals(...).length > 0`. Тест строит оба входа из одних данных.

**`tests/unit/today-text.test.ts`** — дописать.

- `focusKicker`: строка группы `risk` → `risk: true`, `days: null`, `lead` «Под риском»; ход свежего срыва → `risk: false`, дни как раньше.
- `focusRiskText`: три вида; КП без `sentAt` — без хвоста « — отправлено».
- `stepPlateLabel`: шаг впереди, срок прошёл, даты нет.

Компоненты — тестов нет: разметка; ветвление вынесено в `focusRiskRows`, `focusRiskText`, `stepPlateLabel` и покрыто.

```bash
npx vitest run tests/unit/today-risks.test.ts tests/unit/today-text.test.ts 2>&1 | tail -12
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
grep -n "text-lg font-semibold" src/components/today/TodayFocusPane.tsx | head
grep -n "data-card" src/components/today/TodayFocusPane.tsx | head
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `build` проходит; `audit-tokens` без новых находок.
2. Шаг больше не 18/600: в шапке `text-lg font-semibold` остаётся только у суммы (первый `grep` — одна строка). `data-card` в шапке нет.
3. Домен V3 не тронут: `git diff --stat main -- src/lib/domain/today-deals.ts src/lib/domain/today-model.ts src/lib/domain/day-moves.ts src/lib/domain/decide-clock.ts` — пусто.

## СМОКИ

Запись — только на **тестовой сделке** «Тест · смок ACT-1». Живые сделки — только чтение и выбор.

| # | Что | Ожидание |
|---|---|---|
| 1 | Выбрать «Фитнес Десерты. WMS» (Под риском) | В шапке: «⚠ Под риском», название заголовком, юрлицо и стадия строкой ниже, шаг на подложке с «Следующий шаг · пт 9 окт». В теле под пульсом «Риски»: «КП истекло 18 сен — отправлено 9 сен» с «Открыть КП» и задача «Позвонить Александру…» с «Готово». В «Задачах и звонках» этой задачи нет |
| 2 | Выбрать «Лоренц снек» (ход, свежий срыв) | Кикер с днями красным; подпись подложки «Следующий шаг · срок был ср 30 сен» без цвета; секции «Риски» нет |
| 3 | Тестовой сделке — задача со сроком вчера | Секция «Риски» с задачей; «Готово» — строка ушла, секция исчезла |
| 4 | D на тестовой сделке | Форма хода на месте ряда действий, подложка шага над ней; Esc — ряд вернулся |
| 5 | Название в шапке, клавиша O, ⌘/Ctrl+клик | Карточка сделки (новая вкладка — при ⌘/Ctrl) |

**Глазами владельца на гейте** (в скрытой вкладке Chrome не проверяется — `learnings.md`, «Однострочники смока»): шапка против доски в cobalt и frost; ширина 1280 — ряд действий и кикер не обрезаны.

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Сгиба экрана (плитки, шапка страницы, полоса состава) — отдельный fix после замера владельцем в видимом окне.
- Набора «Здоровья» карточки сделки (`getDealSignals`) в фокусе: другие пять сигналов, решение H-05.
- Правок `riskSignals`, `classifyDeal`, `buildTodayModel`, `decideClock`.
- Своей всплывающей подсказки вместо `title`.

## STATUS

`crm-architect/STATUS.md` не правь. После мержа гейт пишет строку `| #<PR> | S-TODAY-FOCUS-5 | … |` и поднимает ревизию. В «Дополнительно» отчёта предложи текст строки.

## КОММИТ

Перед коммитом сохрани отчёт (формат — секция ОТЧЁТ ниже) в `_analysis/sprint-S-TODAY-FOCUS-5-report.md`: спринт-файл уже в `main`, а страж `sprint-file` требует файл `_analysis/` в диффе ветки (урок FOCUS-1). `git add` и `git commit` — отдельными вызовами.

```bash
git checkout -b feat/today-focus-5
git add src/ tests/ _analysis/sprint-S-TODAY-FOCUS-5-report.md
git commit -m "feat(today): шапка фокуса — название заголовком, шаг на подложке; секция «Риски»

- today-risks: строки «Рисков» по правилу riskSignals, сверка с группой тестом
- шапка: название сделки 16/600, шаг на .glass-plate с днём шага, «Под риском» — значок и слово
- «Риски» второй секцией тела: КП, просроченные задачи и звонки с действиями
- просроченные задачи и звонки ушли из «Задач и звонков»; цвет предупреждения — один раз

Миграций нет.
Основание: _analysis/today-focus-spec.md, §12"
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

Дополнительно приложи: таблицу задачи 4 (факт по темам); высоты шапки из задачи 4; результат смоков 1–3.
