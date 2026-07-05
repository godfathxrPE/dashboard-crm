# Claude Code Prompt — Sprint: Scandi selector hardening (data-атрибуты)

## Контекст

Тема Scandi (`.t-scandi` в `src/app/globals.css`) содержит ~20 правил, привязанных
к структурным Tailwind-классам разметки (`.grid.grid-cols-4`, `.fixed.inset-0.z-50`,
`.max-h-\[480px\]`, `.space-y-0`, `.rounded-xl.border.border-border\/50.bg-surface`).
Любой рефакторинг разметки молча ломает тему. Цель — заменить структурные селекторы
на семантические data-атрибуты. Паттерн уже используется: `data-kpi`,
`data-search-input`, `data-meetings-past`.

**Правила проекта:** все цвета через CSS-переменные; изменения CSS скоупить внутри
`.t-scandi {}`; тестировать на scandi + одной тёмной теме; не трогать `.env` и секреты.

## РАЗВЕДКА

```bash
# Полный список структурных селекторов scandi
grep -n "t-scandi \.\(grid\|fixed\|rounded\|max-h\|space-y\|flex\.h-20\)" src/app/globals.css

# Где живут целевые компоненты
grep -rln "grid-cols-4" src/components | head
grep -rln "fixed inset-0 z-50" src/components | head
grep -rln "max-h-\[480px\]" src/components | head
grep -rln "space-y-0" src/components | head
grep -rln "h-20 items-center justify-center" src/components | head
```

## ЗАДАЧА 1: Ввести data-атрибуты в компонентах

Найди по результатам разведки компоненты и добавь атрибуты:

| Атрибут | Что помечает | Текущий селектор-якорь |
|---|---|---|
| `data-modal-overlay` | Оверлей модалок | `.fixed.inset-0.z-50`, `.fixed.inset-0.z-\[60\]` |
| `data-modal` | Контейнер диалога | `> [role="dialog"]`, `> div:not([role])` |
| `data-stats-grid` | Сетка KPI 4 колонки | `.grid.grid-cols-4` |
| `data-card` | Карточки с bracket-уголками (Calls, Contact 360) | `.rounded-xl.border.border-border\/50.bg-surface` и пара ему |
| `data-timeline-scroll` | Скролл-зоны таймлайнов | `.space-y-0`, `.max-h-\[480px\]` |
| `data-kanban-empty` | Пустая колонка Kanban | `.flex.h-20.items-center.justify-center` |
| `data-tag` | Мелкие теги | `.rounded.bg-accent-l` |

Не меняй существующие Tailwind-классы — только добавь атрибуты.

## ЗАДАЧА 2: Переписать селекторы в globals.css

Для каждого правила из таблицы замени структурный селектор на data-атрибут.
Пример:

```css
/* Было */
.t-scandi .space-y-0 { max-height: 320px; overflow-y: auto; ... }
/* Стало */
.t-scandi [data-timeline-scroll] { max-height: 320px; overflow-y: auto; ... }
```

Особое внимание: `.t-scandi .space-y-0` сейчас перехватывает ЛЮБОЙ элемент
с этой утилитой — после миграции это исправится само.

## ЗАДАЧА 3: Выровнять z-index по документированной иерархии

Сейчас scandi-оверлей: `z-index: 200 !important`. Документированная иерархия:
overlay 999, modal 1000, dropdown 50, drawer 30.

1. Найди все z-index в scandi-правилах и в компонентах модалок
2. Приведи к иерархии: `[data-modal-overlay] { z-index: 999 }`, `[data-modal] { z-index: 1000 }`
3. Проверь dropdown'ы (z-50) — должны быть ПОД оверлеем

## ПРОВЕРКА

```bash
npx tsc --noEmit
npm run dev
```

Руками: открой Companies (модалка + таблица), Calls (bracket-карточки), Tasks
(Kanban пустая колонка), Contact detail (timeline scroll) — в теме Scandi и Frost.
Проверь: оверлей перекрывает sticky-заголовки, dropdown тем не торчит над модалкой.

## КОММИТ

```bash
git add -A && git commit -m "refactor(scandi): структурные селекторы -> data-атрибуты, z-index по иерархии"
```
