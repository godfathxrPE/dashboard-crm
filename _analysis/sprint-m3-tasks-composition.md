# Claude Code Prompt — Sprint M3: /tasks — композиция по референсу (D2)

Закрывает расхождения live /tasks с референсом torii-redesign-concept (экран 02).
M2 починил дисциплину (цвета/маркеры); M3 — композиция: шапка, карточка списка,
один контекстный тег. Все правки тема-агностичные, кроме масштаба H1 (scoped minimal).

Чекаут: feat/deal-card (верхушка = M1.1/nav-icons фиксы).

---

## РАЗВЕДКА

```bash
git log --oneline -1
grep -n "Перетаскивай\|aura-page-title" src/components/tasks/KanbanBoard.tsx
grep -n "aura-page-title" src/app/globals.css | head -5   # scoped ли стиль только .t-aura
grep -n "w-80" src/components/widgets/TasksSidebar.tsx
grep -n "company_id &&" src/components/tasks/TaskCard.tsx
grep -n "weekNum\|Неделя" src/components/widgets/TasksSidebar.tsx
```

---

## ЗАДАЧА 1: Шапка страницы (KanbanBoard → TasksPageHeader)

Референс: `Задачи` + тихая мета в одну baseline-строку: «N активных · неделя W».

- Подзаголовок «Перетаскивай задачи между секциями» УДАЛИТЬ (обучающий текст
  на постоянной странице — шум; drag и так очевиден по ховеру).
- Рядом с h1 добавить мету `text-[13px] text-text-mute`:
  `{activeCount} активных · неделя {weekNum}` (activeCount = задачи с lane !== 'done';
  weekNum — та же формула, что в TasksSidebar ClockWidget: вынести в
  `lib/utils/date-helpers.ts` как `weekNumber(date)` и переиспользовать в обоих
  местах, дубль формулы не плодить).

## ЗАДАЧА 2: Список секций — в карточку

Стек AccordionLane на /tasks обернуть контейнером-карточкой (референс: список
лежит на surface-карточке, а не голым на bg):

```
rounded-xl border border-border/60 bg-surface px-2 py-1 shadow-[var(--shadow-xs)]
```

Обёртка в KanbanBoard вокруг ленты секций (НЕ вокруг правого rail). Проверить
на тёмных темах: surface полупрозрачный — выглядит как обычная карточка, ок.

## ЗАДАЧА 3: Один контекстный тег на строку (TaskCard)

Сейчас вне phaseMode рендерятся ОБА тега: проект + компания («Аграрная группа…»
+ «АО "АГРАРНАЯ Г…"» — дубль контекста, компания вытекает из проекта).
Правило: показывать компанию только если проекта нет:

```tsx
{!phaseMode && task.company_id && !task.project_id && ( ...company tag... )}
```

Тег проекта — без изменений.

## ЗАДАЧА 4: H1-масштаб для Minimal (scoped)

По РАЗВЕДКЕ: если `.aura-page-title` задаёт Unbounded/размер только внутри
`.t-aura`, то в остальных темах h1 идёт дефолтным крупным. Для рабочего
пространства Minimal шапка 20px/600 (аудит: workspace — не лендинг):

```css
.t-minimal .aura-page-title,
.t-minimal h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; }
```

Вставить в блок t-minimal-оверрайдов globals.css (unlayered). Aura с её
Unbounded НЕ трогать. Остальные темы — не в скоупе (их характер).

## ЗАДАЧА 5: Rail 320 → 288

`TasksSidebar` root: `w-80` → `w-72` (референс: правая колонка служебная,
список — главный герой).

## СМОК

/tasks в minimal: шапка 20/600 + мета, список в карточке, по одному тегу на
строку, rail уже. aura: Unbounded-шапка на месте, карточка списка не ломает
орбы. washi/frost: карточка списка на surface читается. tsc 0.

## КОММИТ

```bash
git add src/components/tasks/KanbanBoard.tsx src/components/tasks/TaskCard.tsx \
  src/components/widgets/TasksSidebar.tsx src/lib/utils/date-helpers.ts src/app/globals.css
git commit -m "refactor(tasks): композиция /tasks по референсу — шапка с метой, карточка списка, один контекст-тег"
```

НЕ пушить без подтверждения. Миграций нет.
