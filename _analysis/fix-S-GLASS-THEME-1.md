# Claude Code Prompt — fix S-GLASS-THEME-1: CTA, поля и смысловой цвет на стекле

**Основание:** скриншоты владельца 05.10. Шапка фокуса «Сегодня» в `t-washi` и `t-fuji`: «Сделано» и «Перенести» — тёмный текст на тёмном стекле. Поле даты формы хода — светлый текст на белом поле.
**Ветка:** `fix/glass-theme-1` от свежего `main` (после #185).
**Схема:** миграций нет, БД не трогаем, типы не меняются. Правка — `src/app/globals.css` и один комментарий в TSX.
**Цель:** на стекле (`.glass-sheet`) CTA, поля ввода, вторичная кнопка и смысловой цвет текста читаются во всех 8 темах. Материал задаёт их сам — тема не может перебить их наполовину.

---

## ДИАГНОЗ (по коду `main`, 05.10)

**1. CTA в washi и fuji.** `Button variant="primary"` = `bg-accent text-white`. На стекле два правила делят одну кнопку:

| Свойство | Правило-победитель | Специфичность | Итог |
|---|---|---|---|
| `background` | `.t-washi button.bg-accent` / `.t-fuji button.bg-accent` — `transparent !important` (стр. ≈440, ≈562) | (0,2,1) | фон прозрачный |
| `color` | `.glass-sheet .bg-accent.text-white` — `var(--sheet-mark-ink) !important` (стр. ≈2205) | (0,3,0) | глиф тёмный: washi `#1E0000`, fuji `#000322` |

Темы делают CTA контурным. Стекло рассчитывает на заливку метки. Вместе — тёмное на тёмном. Остальные шесть тем CTA не обнуляют — у них заливка и глиф из одной пары.

**2. Поля формы хода — во всех тёмных стёклах** (aura, washi, fuji, minimal, cobalt). `FIELD` в `TodayStepComposer.tsx` = `bg-surface text-text-main border-input`. Стекло перекрашивает `--text` в `--sheet-text` (белый), но не трогает `--surface` и `--border-input`. Итог: белое поле, белый текст. Та же беда у `Button variant="secondary"` (`bg-surface text-text-main`) — «Записать без шага».

**3. Смысловой цвет.** `--danger-text` и `--success-text` вычислены на `:root` (стр. ≈2972) из `--red-text` / `--green-text` темы. Стекло перекрашивает `--red` и `--green`, но не эти четыре токена. Отсюда:
- `.today-focus .glass-sheet .text-red` — обход FOCUS-1 (стр. ≈2423), скоуп только фокус.
- `DealNextStep` и `LeadNextStep` красят просроченную дату `text-red` на стекле — обхода нет, в темах с `--red-text` дата тёмно-красная на тёмном.
- `text-danger-text` (ошибка формы хода) и `text-success-text` («шаг записан» в `TodayStepActions`) на стекле — тёмные.

Это третий случай «стекло перекрасило не всё» (после `--red-text` и `.glass-plate`). Чиним в материале, не в экранах.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull
git log --oneline -3                      # ожидание: верх — 96d0d3a docs: закрытие эпика S-TODAY-FOCUS (#185)

# 1. Контурные CTA тем — ожидание: washi 440/450/463/472/477, fuji 562/574/586/591/598 (±5)
grep -n "button.bg-accent" src/app/globals.css

# 2. Блок материала и правила метки — ожидание: по одной строке
grep -n "^\.glass-sheet,$" src/app/globals.css
grep -n "  --surface2:     var(--sheet-hover);" src/app/globals.css
grep -n "^\.glass-sheet \.bg-accent\.text-white" src/app/globals.css

# 3. Обход FOCUS-1 и глобальный .text-red — ожидание: две строки (≈2257 и ≈2423)
grep -n "\.text-red\b" src/app/globals.css

# 4. Литералы тем на смысловой цвет и поля — ожидание: пусто или только чекбоксы minimal
grep -nE "^\.t-[a-z]+[^{]*(\.text-(danger|success)-text|\.bg-surface\b|\binput\b|\btextarea\b)" src/app/globals.css

# 5. Кто читает var(--surface) и может оказаться ВНУТРИ или НА стекле
grep -n "var(--surface)" src/app/globals.css
grep -rn "bg-surface\b" src/components/today/TodayMoveTile.tsx src/components/today/TodayFocusPane.tsx \
  src/components/projects/DealNextStep.tsx src/components/projects/DealLastEvent.tsx src/components/projects/DealBriefButton.tsx \
  src/components/leads/LeadNextStep.tsx src/components/shared/NoteBody.tsx

# 6. Токены стекла по умолчанию и блок светлого стекла
grep -n "  --sheet-mark-ink:     #040406;" src/app/globals.css
grep -n "^\.t-frost, \.t-aurora, \.t-tidal {" src/app/globals.css

# 7. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

Стоп и вопрос в чат, если `grep` 2 или 6 дал не одну строку на запрос, или 5 нашёл `bg-surface` внутри стекла у всплывающего слоя (меню, поповер без портала): после задачи 1 он станет полупрозрачным. Известное и безопасное: `.today-tile { background: var(--surface) }` (стр. ≈2624) — у выбранной плитки фон перебит `.today-tile.glass-sheet`; `--popover: var(--surface)` и `--glass-bg: var(--surface)` вычислены на `:root` и переопределение на стекле до них не доходит.

**До правки** снять в браузере базу (тема — классом в своей вкладке, см. СМОКИ): `getComputedStyle` фона шапки фокуса и выбранной плитки в 8 темах. После правки фон стекла обязан совпасть.

---

## ЗАДАЧА 1 — токены материала: поля, вторичная кнопка, смысловой цвет

Файл `src/app/globals.css`.

**1.1.** В правиле `.glass-sheet, [data-card].glass-sheet` после строки `color: var(--sheet-text);` добавить:

```css
  /* Нативные контролы (иконка календаря у type="date", скроллбар) — по светлоте стекла. */
  color-scheme: var(--sheet-scheme);
```

**1.2.** Там же, после `--surface2:     var(--sheet-hover);`:

```css
  /* Поля и вторичная кнопка (`bg-surface`, `border-input`). Без этого поле на тёмном
     стекле белое, а текст в нём уже белый (`--text` перекрашен выше) — fix-S-GLASS-THEME-1. */
  --surface:      var(--sheet-plate-bg);
  --border-input: var(--sheet-btn-border);
  /* Смысловой текст. `--danger-text`/`--success-text` вычислены на :root из `--red-text`/
     `--green-text` темы — перекраска `--red`/`--green` выше до них не доходит. */
  --red-text:     var(--sheet-red);
  --danger-text:  var(--sheet-red);
  --green-text:   var(--sheet-green);
  --success-text: var(--sheet-green);
```

**1.3.** Токен светлоты. В блоке значений по умолчанию после `--sheet-mark-ink:     #040406;`:

```css
  --sheet-scheme:       dark;
```

В блоке `.t-frost, .t-aurora, .t-tidal { … }` после `--sheet-mark-ink:     #FFFFFF;`:

```css
  --sheet-scheme:       light;
```

**1.4.** Удалить обход FOCUS-1 целиком — комментарий `S-TODAY-FOCUS-1: красный кикера на стекле фокуса…` и правило `.today-focus .glass-sheet .text-red { color: var(--sheet-red); }`. Его заменяет `--red-text` из 1.2.

**1.5.** `src/components/today/TodayFocusPane.tsx`, комментарий у стр. ≈56: фраза о том, что `--danger-text` и `--success` стеклом не перекрашены, больше не верна. Переписать: «смысловой текст (`--red-text`, `--danger-text`, `--green-text`, `--success-text`) стекло перекрашивает само — fix-S-GLASS-THEME-1». Разметку не трогать.

## ЗАДАЧА 2 — CTA на стекле: всегда заливка метки

Файл `src/app/globals.css`, сразу ПОСЛЕ правила `.glass-sheet .bg-accent.text-white { … }`:

```css
/* fix-S-GLASS-THEME-1: CTA на стекле — заливка метки во всех темах.
   washi и fuji делают CTA контурным: `.t-washi/.t-fuji button.bg-accent
   { background: transparent !important }` (0,2,1). Глиф при этом брало правило выше
   ((0,3,0), тёмный `--sheet-mark-ink`) — тёмное на тёмном стекле. Пара заливка/глиф
   метки уже выверена на 4.5:1 (таблица S-DEAL-NEXTSTEP-1), контур под стекло не мерян.
   Специфичность равна тематической, решает порядок — правило обязано стоять ниже тем.
   Цена: в washi и fuji CTA на стекле — заливка, а не фирменный контур темы. */
.glass-sheet button.bg-accent,
.glass-sheet a.bg-accent,
.glass-sheet button.bg-accent:hover,
.glass-sheet a.bg-accent:hover {
  background: var(--sheet-mark-fill) !important;
  border-color: var(--sheet-mark-fill) !important;
  color: var(--sheet-mark-ink) !important;
}
.glass-sheet button.bg-accent:hover,
.glass-sheet a.bg-accent:hover { filter: brightness(.92); }
/* Подчёркивание washi (::after, белое) и золотой градиент fuji (::before) — не на стекле. */
.glass-sheet button.bg-accent::before,
.glass-sheet button.bg-accent::after,
.glass-sheet a.bg-accent::before,
.glass-sheet a.bg-accent::after { content: none; }
```

Проверка специфичности (в отчёт одной строкой): база (0,2,1) = тема; hover (0,3,1) = `.t-washi/.t-fuji … :hover`; псевдо (0,2,2) = тема. Везде побеждает порядок.

Во frost, aurora, tidal кнопка уже рисуется этой парой (правило `.glass-sheet .bg-accent` + глиф) — визуально меняется только рамка (в цвет заливки) и hover. В minimal, aura, cobalt — то же.

## ЗАДАЧА 3 — где ещё стекло и CTA

```bash
grep -rn "glass-sheet" src --include=*.tsx | grep -v "^\S*:\s*//" | cut -c1-120
```

Для каждого компонента со стеклом — есть ли внутри `button`/`a` с `bg-accent` или `bg-surface`. Список — в отчёт: компонент → что внутри → изменился ли вид. Если какой-то `bg-accent` на стекле НЕ CTA (квадрат иконки на `button`) и после правки выглядит иначе, чем до, — стоп и вопрос в чат.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
grep -n "\.today-focus \.glass-sheet \.text-red" src/app/globals.css     # ожидание: пусто
grep -c "sheet-scheme" src/app/globals.css                                # ожидание: 3
git diff --stat main
```

`npm run build` не запускать: владелец держит `next dev`, сборка ломает общую `.next` (`learnings.md`, «build vs dev»).

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `audit-tokens` без новых находок.
2. В диффе только `src/app/globals.css`, `src/components/today/TodayFocusPane.tsx` (комментарий) и отчёт.
3. Фон шапки фокуса и выбранной плитки — тот же, что до правки, во всех 8 темах.

## СМОКИ

Тема — только классом в своей вкладке: заменить `t-*` в `document.documentElement.className`, остальные классы оставить. `localStorage` не трогать, тему владельца не менять; в конце вернуть исходный класс. Запись в БД — никакой: форму хода открыть и закрыть `Esc`, не отправлять. Сделка — тестовая «Тест · смок ACT-1».

Значения — `getComputedStyle`. Для CTA посчитать контраст глифа к заливке (заливка непрозрачна).

| # | Где | Что снять, 8 тем | Ожидание |
|---|---|---|---|
| 1 | «Сделано» в шапке фокуса | `background-color`, `color`, контраст | фон = `--sheet-mark-fill`, цвет = `--sheet-mark-ink`, ≥ 4.5:1 |
| 2 | Порядок правил для `:hover` (наведение в скрытой вкладке не мерится) | `grep -n` строк hover-правил washi, fuji и нового правила | строка нового правила больше обеих тематических |
| 3 | «Перенести» → поле даты | `background-color`, `color`, `border-color`, `color-scheme` | фон = `--sheet-plate-bg`, текст = `--sheet-text`, `color-scheme` dark/light по теме |
| 4 | «Перенести» → кнопка «Перенести» формы | как в 1 | как в 1 (у disabled — с `opacity`) |
| 5 | «Сделано» → поле заметки и поле шага | как в 3 | как в 3 |
| 6 | Шапка фокуса, `getPropertyValue('--danger-text')` и `--success-text` на `.glass-sheet` | значения | = `--sheet-red` / `--sheet-green` темы |
| 7 | Карточка тестовой сделки, `.glass-sheet` «Следующего шага» | `--red-text` | = `--sheet-red` |

**Глазами владельца на гейте** (вкладка CC скрыта — `learnings.md`, «Однострочники смока»): washi и fuji — «Сделано» в покое и на наведении; «Перенести» → поле даты, кнопка «Перенести»; minimal и frost — поле даты и плейсхолдер.

## ЧЕГО В ЭТОМ ФИКСЕ НЕТ

- Плиток ходов на узкой колонке (перенос посреди слова, сумма за краем) и сгиба экрана — очередь, решение владельца 05.10: на рабочем экране не воспроизводится.
- Своего контура CTA для washi/fuji на стекле — только если владелец попросит; потребует замера контраста.
- Правок тематических блоков washi и fuji — их CTA вне стекла не меняется.

## STATUS

`crm-architect/STATUS.md` не правь. После мержа гейт пишет строку и поднимает ревизию. В «Дополнительно» отчёта предложи текст строки.

## КОММИТ

Перед коммитом сохрани отчёт (формат — секция ОТЧЁТ) в `_analysis/fix-S-GLASS-THEME-1-report.md`: фикс-файл уже в `main`, страж `sprint-file` требует файл `_analysis/` в диффе ветки. `git add` и `git commit` — отдельными вызовами.

```bash
git checkout -b fix/glass-theme-1
git add src/ _analysis/fix-S-GLASS-THEME-1-report.md
git commit -m "fix(glass): CTA, поля и смысловой цвет на стекле во всех темах

- CTA на стекле — заливка метки: контур washi/fuji давал тёмное на тёмном
- --surface и --border-input на стекле: поля и вторичная кнопка не белые
- --red-text, --danger-text, --green-text, --success-text перекрашены материалом
- снят обход .today-focus .glass-sheet .text-red из FOCUS-1
- --sheet-scheme: нативные контролы по светлоте стекла

Миграций нет.
Основание: _analysis/fix-S-GLASS-THEME-1.md"
```

Без `git push`.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время.
- Один термин = одно значение. Сущности — как в коде.
- Без оценок («отлично», «полностью», «успешно»). Вместо оценки — артефакт: число, вывод команды, exit code.
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на изменение.

Проверки
- `команда` → результат.

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от фикса
- Где сделал иначе и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».

Дополнительно приложи: таблицу смоков 1–7 по 8 темам (факт); фон стекла до/после; список задачи 3; строку специфичности из задачи 2.
