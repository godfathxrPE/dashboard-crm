# Claude Code Prompt — S-NOTES-2.2: редактор заметки с панелью markdown и вставка из буфера

Эпик S-NOTES, спринт 2.2 из 2. **Зависит от S-NOTES-2.1** — в `main` с #153 (`da638db`), плюс #154 (круглая плашка действий).

**Мокап:** `_analysis/mockup-S-NOTES-2.html` (в `main` с 2.1) — композер вверху ленты и состояние
«Правка заметки на месте». Решения: Claude Project `claude/decisions-S-NOTES-2-2026-10-03.md`.

Ветка: `feat/notes-2-2`, worktree `.claude/worktrees/feat+notes-2-2` от свежего `origin/main`.
Этот файл лежит untracked в основном чекауте — перенеси его в worktree **через `mv`**, не `cp`.

## Что решено (не пересматривать)

1. Формат хранения заметки — **markdown-текст** в `notes.body`. Не HTML, не JSON. AI читает текст как
   есть; XSS-контура нет, потому что рендер — свой парсер в React-узлы, без `dangerouslySetInnerHTML`.
2. Редактор — **многострочное поле с панелью кнопок**, не WYSIWYG: в поле видна разметка (`**жирный**`),
   кнопки и горячие клавиши вставляют её. WYSIWYG можно поставить позже без миграции данных.
3. Вставка из Word, Google Docs, почты и мессенджеров: если в буфере есть `text/html` — конвертировать
   в markdown (жирный, курсив, заголовки, списки, ссылки сохраняются; стили, шрифты, цвета, таблицы —
   нет). Иначе — обычная вставка текста.
4. Старые заметки — плоский текст без разметки (78 перенесённых + всё до 2.2). Рендер обязан показывать
   их так же, как сейчас: эвристики `parseNoteBlocks` (маркеры «- », «1. », короткая строка-заголовок)
   остаются. Markdown добавляется поверх, не вместо.
5. Один компонент редактора на три места: композер ленты, правка заметки на месте, правка «Сути
   сделки» (у неё — без панели, только поле со счётчиком: суть — 1–2 предложения, разметка ей не нужна).

## РАЗВЕДКА

```bash
git fetch origin && git log --oneline -3 origin/main | grep -i "S-NOTES-2.1"
grep -n "export\|type NoteBlock" src/lib/text/note-blocks.ts
grep -n "export function NoteBody\|parseNoteBlocks\|case\|type ===" src/components/shared/NoteBody.tsx
grep -n "textarea\|onKeyDown\|metaKey" src/components/shared/ActivityComposer.tsx src/components/projects/DealFeedParts.tsx src/components/projects/DealPinnedZone.tsx
ls tests/unit | grep -i note
grep -n "\"dependencies\"" -A 60 package.json | grep -i "markdown\|turndown\|remark\|marked"
```

Если `S-NOTES-2.1` нет в `origin/main` — стоп, отчёт.
Новых npm-зависимостей не добавлять: конвертер и парсер — свои, в `src/lib/text/`.

## ЗАДАЧА 1: инлайн-разметка и markdown-блоки в парсере

### Context
`parseNoteBlocks` (`src/lib/text/note-blocks.ts`) знает блоки: heading / paragraph / list. Нужно
поверх: заголовки `#`/`##`/`###`, нумерованный список отдельным типом, и инлайн — `**жирный**`,
`*курсив*` / `_курсив_`, `[текст](https://…)`.

### Steps
1. Блоки: строка `^#{1,3}\s+` → `{ type: 'heading', level, text }` (эвристика короткой строки остаётся
   для плоского текста, `level` у неё — 3). Маркеры `1.`/`1)` → `{ type: 'olist', items }`, остальные
   маркеры — `list`, как сейчас. Существующие поля типов не переименовывать — их читают
   `noteHeadline`, `noteToPlainLine`, плитки.
2. Инлайн: `parseInline(text): InlineNode[]`, где `InlineNode = { t: 'text' | 'strong' | 'em', v: string }
   | { t: 'link', v: string, href: string }`. Вложенность — один уровень (жирный внутри курсива не
   поддерживаем). Непарная звёздочка — обычный текст. `href` — только `http:`/`https:`/`mailto:`,
   иначе ссылка рендерится текстом (защита от `javascript:`).
3. `noteToPlainLine` и `noteHeadline` снимают разметку (`**x**` → `x`, `[a](b)` → `a`, `## ` → пусто),
   иначе превью и заголовки карточек покажут звёздочки.

### Verification
```bash
npx vitest run tests/unit/note-blocks.test.ts tests/unit/note-inline.test.ts
```

## ЗАДАЧА 2: рендер в `NoteBody`

### Steps
`src/components/shared/NoteBody.tsx`: рендерить `heading` по `level` (h-стиль ленты, не `<h1>`
страницы — семантика `<p role="heading" aria-level>` или `<h4>`/`<h5>`, по соседнему коду), `olist` —
`<ol>`, инлайн — `<strong>`, `<em>`, `<a target="_blank" rel="noopener noreferrer">`. Только
React-узлы; `dangerouslySetInnerHTML` запрещён. Сворачивание (`collapsedLines`) работает как раньше.

### Verification
```bash
grep -n "dangerouslySetInnerHTML" src/components/shared/NoteBody.tsx ; echo "exit=$?"
```
`exit=1`.

## ЗАДАЧА 3: конвертер HTML буфера → markdown

### Context
Word, Google Docs и почта кладут в буфер `text/html` с инлайн-стилями: Google Docs оборачивает всё в
`<b style="font-weight:normal" id="docs-internal-guid-…">`, жирный там — `<span style="font-weight:700">`,
курсив — `font-style:italic`. Word — классы `Mso*` и `<o:p>`.

### Steps
`src/lib/text/html-to-markdown.ts`, функция `htmlToMarkdown(html: string, parse: (html: string) =>
Document): string` — парсер DOM передаётся аргументом (в браузере `new DOMParser()`, в тестах —
`linkedom`/`jsdom`, что уже есть в devDependencies; если нет ни одного — проверь `vitest` environment
`happy-dom`/`jsdom` в конфиге и используй его).
- `b`, `strong`, `span[style*=font-weight:7|bold]` → `**…**`; Google-обёртка `b[style*=font-weight:normal]`
  — НЕ жирный.
- `i`, `em`, `span[style*=italic]` → `*…*`.
- `h1`–`h3` → `#`–`###`; `h4`–`h6` → `###`.
- `ul > li` → `- `; `ol > li` → `1. ` с номерами; вложенный список — отступ два пробела.
- `a[href]` с `http/https/mailto` → `[текст](href)`; прочие — текст.
- `p`, `div`, `br` → переводы строк; подряд больше двух пустых строк → одна пустая.
- `table` → строки ячеек через ` · `, строки таблицы — с новой строки.
- Всё остальное — текст. `script`, `style`, `o:p`, комментарии — выбросить.
- Результат обрезать до 20 000 символов (check `notes_body_len`).

### Verification
```bash
npx vitest run tests/unit/html-to-markdown.test.ts
```

## ЗАДАЧА 4: компонент `MarkdownEditor`

### Steps
`src/components/shared/MarkdownEditor.tsx` — управляемое поле (`value`, `onChange`, `onSubmit`,
`onCancel?`, `placeholder`, `toolbar?: boolean`, `maxLength?`, `autoFocus?`):
- Панель (по мокапу): Жирный (⌘B), Курсив (⌘I), Заголовок, Список, Нумерованный список, Ссылка (⌘K).
  Кнопка оборачивает выделение (`**выделение**`) или вставляет разметку в позицию курсора; строчные
  (заголовок, списки) ставят/снимают префикс у выделенных строк. Логика вставки — чистые функции в
  `src/lib/text/md-commands.ts` (`wrapSelection`, `toggleLinePrefix`), компонент только применяет
  результат и восстанавливает выделение.
- `aria-label` у каждой кнопки, `role="toolbar"`, подсказка с горячей клавишей в `title`; Tab
  переходит из панели в поле. ⌘/Ctrl+Enter — `onSubmit`, Esc — `onCancel`.
- Вставка: `onPaste` — если `clipboardData.types` содержит `text/html`, `preventDefault`, вставить
  `htmlToMarkdown(...)` в позицию курсора; иначе — браузер по умолчанию.
- Поле растёт до 12 строк (как сейчас в `ActivityComposer`), дальше — прокрутка. Моноширинный шрифт —
  только в режиме правки заметки (мокап), в композере — шрифт приложения.
- Плейсхолдер композера: «Заметка по сделке… Вставка из Word, Google Docs и почты сохранит списки и
  жирный.»

Подключить:
1. `ActivityComposer` — вместо нынешнего `textarea` (обе ветки: `variant="deal"` и обычная).
2. Правка заметки на месте — `NoteEditor` в `src/components/projects/DealFeedParts.tsx` (из 2.1, `<textarea>` ~стр. 346) — с панелью.
3. Правка «Сути сделки» в `DealPinnedZone` — `toolbar={false}`, `maxLength={500}`.

### Verification
```bash
grep -rn "<textarea" src/components/shared/ActivityComposer.tsx src/components/projects/DealFeedParts.tsx src/components/projects/DealPinnedZone.tsx ; echo "exit=$?"
npx tsc --noEmit
```

## ТЕСТЫ

- `tests/unit/note-inline.test.ts`: `**a** и *b*` → strong + text + em; непарная `*` → текст;
  `[сайт](https://x.ru)` → link; `[x](javascript:alert(1))` → текст; `_a_` → em.
- `tests/unit/note-blocks.test.ts` (дописать): `## Итоги` → heading level 2; `1. a\n2. b` → olist;
  плоский текст из заметки 02.10 (абзац + «Ситуация» + список с «- ») → те же блоки, что до спринта
  (регрессия на старые заметки); `noteToPlainLine('**Итог:** [КП](https://x)')` → `Итог: КП`.
- `tests/unit/html-to-markdown.test.ts`: фрагмент Google Docs (обёртка `b` с `font-weight:normal` +
  `span font-weight:700`) → жирный только у span; Word (`<p class=MsoNormal>` + `<o:p>`) → чистые
  абзацы; `<ul><li>a<ul><li>b</li></ul></li></ul>` → `- a\n  - b`; `<ol>` → нумерация 1., 2.; таблица 2×2 →
  две строки с ` · `; `<a href="javascript:…">` → текст; `<script>` выброшен; 25 000 символов → 20 000.
- `tests/unit/md-commands.test.ts`: `wrapSelection('abc', 1, 2, '**')` → `a**b**c` и новое выделение
  на `b`; без выделения — вставка `****` с курсором посередине; повторное оборачивание уже жирного —
  снимает разметку; `toggleLinePrefix` на трёх строках ставит `- ` каждой, повторно — снимает.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

## КОММИТ

```bash
git add src tests _analysis/sprint-S-NOTES-2.2.md
git commit -m "feat(notes): редактор заметки с панелью markdown, вставка HTML из буфера как markdown, рендер инлайн-разметки (S-NOTES-2.2)"
```
Без push.

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
