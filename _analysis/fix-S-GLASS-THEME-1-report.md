# Отчёт — fix S-GLASS-THEME-1: CTA, поля и смысловой цвет на стекле

Ветка `fix/glass-theme-1`. Основание — `_analysis/fix-S-GLASS-THEME-1.md`. Миграций нет.

## Сделано

- `src/app/globals.css:2159` — `.glass-sheet`: добавлен `color-scheme: var(--sheet-scheme)`.
- `src/app/globals.css:2178` — `.glass-sheet`: добавлены `--surface`, `--border-input`, `--red-text`, `--danger-text`, `--green-text`, `--success-text`.
- `src/app/globals.css:3076` — `:root`: добавлен `--sheet-scheme: dark`.
- `src/app/globals.css:3177` — `.t-frost, .t-aurora, .t-tidal`: добавлен `--sheet-scheme: light`.
- `src/app/globals.css:2228` — после `.glass-sheet .bg-accent.text-white` добавлены правила CTA на стекле: заливка, hover, снятие `::before`/`::after`.
- `src/app/globals.css` — удалён обход FOCUS-1 `.today-focus .glass-sheet .text-red` вместе с комментарием.
- `src/components/today/TodayFocusPane.tsx:56` — переписан комментарий о смысловом цвете. Разметка не менялась.

## Проверки

- `npx tsc --noEmit` → 0 ошибок, exit 0.
- `npm run lint` → 0 errors, 33 warnings (база — 33).
- `npx vitest run` → 166 файлов, 2823 теста passed (база — 2823).
- `python3 scripts/audit-tokens.py` → «0 находок вне реестра, 60 в реестре». Контракт соблюдён.
- `grep -n "\.today-focus \.glass-sheet \.text-red"` → пусто.
- `grep -c "sheet-scheme"` → 3.
- `git diff --stat main` → `globals.css`, `TodayFocusPane.tsx`, два файла `_analysis/`.
- Смоки 1–7 → сняты в браузере, `next dev` на :3000, 8 тем классом на `<html>`. Таблица ниже.

## Не сделано

- `npm run build` не запускался. Причина — запрет фикса («build vs dev»).
- Hover глазами не проверен: вкладка CC скрыта. Порядок правил проверен `grep` (смок 2).

## Отклонения от фикса

- В правило CTA добавлен селектор `.glass-sheet button.bg-accent:disabled`. Причина: `.t-minimal .bg-accent:disabled` (0,3,0) красил disabled-CTA в `--surface3` (`rgb(231,231,235)`) — смок 4 в minimal не проходил. Дефект был и до правки. (0,3,1) выигрывает счётом.
- Для замера переходы глушились временным `<style>` (`transition:none`). Причина: `transition-all` у `Button` давал промежуточные цвета. Стиль удалён после замера.

## Вопросы и риски

- В fuji CTA на стекле — пилюля: `border-radius: 20px !important` темы фикс не трогает. Заливка и глиф — метки.
- `InlineEdit` в `DealNextStep`/`LeadNextStep` (`border-input`) на стекле получил рамку `--sheet-btn-border` вместо рамки темы. Глазами не проверено.
- Фокус-рамка полей формы хода — `--sheet-mark-fill` (`focus:border-accent`). Это поведение прежнее, контраст рамки к стеклу не мерян.

## Дополнительно

### Специфичность (задача 2)

База `.glass-sheet button.bg-accent` (0,2,1) = `.t-washi/.t-fuji button.bg-accent`; hover (0,3,1) = тематический hover; псевдо (0,2,2) = тематическое; везде побеждает порядок. `:disabled` (0,3,1) > `.t-minimal .bg-accent:disabled` (0,3,0).

### Фон стекла до/после

| Тема | Шапка фокуса и выбранная плитка (до = после) |
|---|---|
| aura | `rgba(3, 6, 10, 0.84)` |
| washi | `rgba(30, 0, 0, 0.84)` |
| fuji | `rgba(0, 3, 34, 0.84)` |
| minimal | `rgba(0, 10, 12, 0.84)` |
| cobalt | `rgba(3, 8, 28, 0.84)` |
| frost | `rgba(221, 232, 255, 0.88)` |
| aurora | `rgba(235, 227, 255, 0.88)` |
| tidal | `rgba(204, 243, 221, 0.88)` |

Сравнение строк `getComputedStyle` до и после → `same=true` во всех 8 темах.

### CTA «Сделано» до правки (дефект)

| Тема | `background-color` | `color` |
|---|---|---|
| washi | `rgba(0, 0, 0, 0)` | `rgb(30, 0, 0)` |
| fuji | `rgba(0, 0, 0, 0)` | `rgb(0, 3, 34)` |

Остальные шесть тем — заливка метки и глиф метки, как после правки.

### Смоки 1–7, факт

| # | aura | washi | fuji | minimal | cobalt | frost | aurora | tidal |
|---|---|---|---|---|---|---|---|---|
| 1 «Сделано»: фон / глиф / контраст | `#ACB3B9` / `#03060A` / 9.57 | `#FE978E` / `#1E0000` / 9.51 | `#8DB3DA` / `#000322` / 9.26 | `#6AC1C6` / `#000A0C` / 9.59 | `#93B7FF` / `#050B1F` / 9.74 | `#4B70C6` / `#FFF` / 4.74 | `#8362BE` / `#FFF` / 4.71 | `#008758` / `#FFF` / 4.56 |
| 2 hover: строка правила | 2230 > washi 463, fuji 591 | ← | ← | ← | ← | ← | ← | ← |
| 3 поле даты: фон / текст / рамка / scheme | `.09` белый / `#FFF` / `.35` белый / dark | = | = | = | = | `.055` чёрный / `#0B152C` / `.22` чёрный / light | `.055` / `#191029` / `.22` / light | `.055` / `rgb(0,29,14)` / `.22` / light |
| 4 «Перенести» формы (disabled, `opacity .5`) | = смок 1 | = смок 1 | = смок 1 | = смок 1 (после `:disabled`) | = смок 1 | = смок 1 | = смок 1 | = смок 1 |
| 5 поле заметки, поле шага, «Оставить без шага» | = смок 3 | = смок 3 | = смок 3 | = смок 3 | = смок 3 | = смок 3 | = смок 3 | = смок 3 |
| 6 `--danger-text` / `--success-text` | `#FF7A68` / `#5CD98C` | ← | ← | ← | ← | `#8D3123` / `#00551D` | ← | ← |
| 7 `--red-text` «Следующего шага» | `#FF7A68` | `#FF7A68` | `#FF7A68` | `#FF7A68` | `#FF7A68` | `#8D3123` | `#8D3123` | `#8D3123` |

Ожидания совпали: фон = `--sheet-mark-fill`, цвет = `--sheet-mark-ink`, поле = `--sheet-plate-bg` / `--sheet-text` / `--sheet-btn-border`, смысловой цвет = `--sheet-red` / `--sheet-green` темы.
До правки `--danger-text` на стекле был цветом темы: aura `#C02B2D`, washi `#B33434`, fuji `#ba3939`, minimal `#B02A24`, cobalt `#A02620`.

### Задача 3 — компоненты со стеклом

- `TodayFocusPane` (шапка) → `Button primary` («Сделано»), текстовые кнопки, форма `TodayStepComposer` (поля `bg-surface`, `Button primary` и `secondary`). Вид изменился: CTA в washi/fuji, поля и secondary во всех темах, disabled-CTA в minimal.
- `TodayMoveTile` → стекло на самом `<button>`; `bg-accent`/`bg-surface` внутри нет. Вид не изменился.
- `DealNextStep` → `bg-accent` на `span` (квадрат иконки), `DealBriefButton` (точка `span.bg-accent`), `InlineEdit` (`bg-surface2`, `border-input`), `DealBriefPanel` (модалка порталом). Изменились рамка `InlineEdit` и `--red-text` просрочки.
- `LeadNextStep` → `span.bg-accent`, `InlineEdit`. Изменились рамка `InlineEdit` и `--red-text` просрочки.
- `DealLastEvent` → плитка иконки и тело события; `bg-accent`/`bg-surface` внутри нет. `text-success-text` следствий — вне стекла. Вид не изменился.
- `ActivityComposer` → стекло на самой кнопке-иконке; CTA `bg-accent` — сосед, не потомок. Вид не изменился.

`bg-accent` на `button`/`a` внутри стекла, кроме CTA, нет — стоп-условие не сработало.

### Строка для STATUS

`fix-S-GLASS-THEME-1` — CTA, поля и смысловой цвет на стекле во всех 8 темах: заливка метки у CTA (washi/fuji давали тёмное на тёмном), `--surface`/`--border-input`/`--*-text` и `color-scheme` в материале, снят обход FOCUS-1. Миграций нет.
