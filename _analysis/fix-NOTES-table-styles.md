# Claude Code Prompt — fix-NOTES-table-styles: таблица заметки без стилей DataTable

Фикс после S-NOTES-2.2 (#155). Ветка `fix/notes-table-styles`, worktree
`.claude/worktrees/fix+notes-table-styles` от свежего `origin/main`. Этот файл лежит untracked в
основном чекауте — перенеси его в worktree **через `mv`**, не `cp`. Миграций нет.

## Зачем

Таблица в заметке (`NoteTable` в `src/components/shared/NoteBody.tsx`) на проде работает, но на неё
легли глобальные стили таблиц данных из `src/app/globals.css` — их писали для `DataTable`, а
селекторы `table …` бьют по любой `<table>`:

- `@layer components`, блок `/* Tables */` (~стр. 1737):
  - зебра `tbody tr:nth-child(even)` — на скриншоте владельца строки 2022 и 2024 темнее;
  - `tbody tr { border-left: 2px solid transparent }` и на hover — `background: var(--accent-l) !important`,
    `border-left-color: var(--accent)`, inset-тень. **Это боковой маркер на акценте** — запрещено
    владельцем, и в `t-washi` акцент красный;
  - `thead th` — `position: sticky`, `background: var(--bg)`, свой padding. На бумажной карточке
    шапка — полоса другого тона со скруглённым углом.
- Вне слоя: `.t-aura table thead th` / `.t-aura table tbody` — белый фон `--surface`;
  `.t-frost|.t-aurora|.t-tidal table thead th` — тёмное стекло `rgba(…,0.85)` + blur. На бумажной
  заметке в этих темах шапка таблицы — тёмная плашка.
- `table tbody tr[data-kbd-focused]` (~стр. 2343, вне слоя) — та же метка слева.

Второе: в таблице владельца колонки «Выручка», «Чистая прибыль», «Капитал» выровнены влево, а
«Активы» — вправо. Причина — строка 2025: `721 105 (×8,5)`, `16 355 (−9%)`, `19 074 (−25%)`.
Пометка в скобках делает ячейку «не числом», и колонка уходит влево. Так пишет любой отчёт —
`isNumericCell` должен это понимать.

Третье: кнопка «Свернуть/Показать полностью» в `NoteBody` после клавиатуры получает синюю обводку
браузера — своего `focus-visible` у неё нет.

## ЗАДАЧА 1: сброс стилей DataTable для таблицы заметки

### Steps
1. `NoteTable`: `<table>` получает класс `note-table` (рядом с текущими утилитами).
2. `src/app/globals.css`, **внутри того же `@layer components`, сразу после блока `/* Tables */`** —
   блок сброса. Почему в слое и с `!important`: hover-фон в слое объявлен `!important`, а
   важные объявления из слоя бьют любые неслойные — перебить его можно только в том же слое
   бо́льшей специфичностью; а слойное `!important` в свою очередь бьёт неслойные правила тем
   (`.t-aura …`, `.t-frost …`) и `[data-kbd-focused]`.

   ```css
   /* Таблица в заметке (NoteBody) — документ, а не таблица данных: без зебры, hover,
      метки слева и липкой шапки. Темы (.t-aura/.t-frost/.t-aurora/.t-tidal) красят
      thead/tbody вне слоя — слойное !important их перекрывает. Боковых маркеров
      в ленте нет (решение владельца 03.10). */
   table.note-table tbody,
   table.note-table tbody tr,
   table.note-table tbody tr:nth-child(even),
   table.note-table tbody tr:hover,
   table.note-table tbody tr[data-kbd-focused] {
     background: transparent !important;
     border-left: 0 !important;
     box-shadow: none !important;
   }
   table.note-table thead th {
     position: static !important;
     background: transparent !important;
     backdrop-filter: none !important;
     -webkit-backdrop-filter: none !important;
     border-radius: 0 !important;
     padding: 0.25rem 0.5rem;
   }
   table.note-table thead th:first-child { padding-left: 0; }
   table.note-table thead th::after { content: none; }
   ```

   Регистр и кегль заголовков (`uppercase`, 0.6875rem, `--text-mute`) остаются от глобального
   правила — так шапка совпадает с таблицами приложения. Нижняя граница шапки и строк — из утилит
   `NoteTable` (`border-b border-border`), они уже есть.
3. Проверить, что глобальные правила таблиц для `DataTable` и остальных 6 мест с `<table>` не
   изменились: сброс адресован только `table.note-table`.

### Verification
```bash
grep -n "note-table" src/components/shared/NoteBody.tsx src/app/globals.css
grep -rn "<table" src/components --include=*.tsx
```

## ЗАДАЧА 2: число с пометкой в скобках — число

### Steps
`src/lib/text/note-table.ts`, `isNumericCell`: после снятия разметки отрезать одну хвостовую
пометку в скобках длиной до 16 символов (`\s*\([^()]{1,16}\)$`) и проверять остаток прежним
регулярным выражением. Пометка без числа (`(н/д)`) — не число. Только скобки — не число.

### Verification
```bash
npx vitest run tests/unit/note-table.test.ts tests/unit/note-blocks.test.ts
```

## ЗАДАЧА 3: фокус кнопки свёртки

`NoteBody`, кнопка «Развернуть/Свернуть»: `rounded-sm focus-visible:outline-none focus-visible:ring-2
focus-visible:ring-accent` — тот же приём, что у обёртки `NoteTable`.

## ТЕСТЫ

`tests/unit/note-table.test.ts` (дописать):
- `isNumericCell`: `'721 105 (×8,5)'`, `'16 355 (−9%)'`, `'**19 074** (−25%)'` → true;
  `'(н/д)'`, `'2025 год (оценка)'`, `'100 (очень длинная пометка в скобках)'` → false.

`tests/unit/note-blocks.test.ts` (дописать): таблица владельца целиком (5 колонок, строки
2021–2025, в 2025 пометки в скобках) → у всех пяти колонок `align = 'right'`.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Визуальная проверка — на превью Vercel владельцем: заметка с таблицей в темах `t-minimal`, `t-washi`,
`t-aura`, `t-frost`. Ожидание: зебры нет, на hover строка не меняется, слева метки нет, шапка в тон
карточки, все числовые колонки вправо. Заодно — таблица в разделе «Компании» (DataTable) выглядит как
до фикса.

## КОММИТ

```bash
git add src tests _analysis/fix-NOTES-table-styles.md
git commit -m "fix(notes): таблица заметки без стилей DataTable (зебра, hover-метка, липкая шапка), число с пометкой в скобках — число"
```
Без push.

## ОТЧЁТ

Формат и стиль — как в `_analysis/fix-S-NOTES-2.2-tables.md` (STE-lite: Сделано / Проверки /
Не сделано / Отклонения от спринта / Вопросы и риски).
