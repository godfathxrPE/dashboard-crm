# Claude Code Prompt — Sprint W1b: экран «Сегодня» (action inbox)

## Контекст

Паттерн Close CRM: стартовый экран — не KPI-дашборд, а единая очередь того,
что требует действия. Утром открыл → разобрал сверху вниз. KPI-обзор
(DashboardHome) не удаляется — переезжает на отдельный route.

Sprint W1a уже дал `getDealHealth` (src/lib/utils/deal-health.ts) и
`focusNextAction` в ProjectModal — переиспользуй, не дублируй.

**Правила проекта:** цвета только CSS-переменные; тест t-scandi + одна тёмная;
существующие hooks (use-tasks, use-calls, use-meetings, use-projects) —
не создавать новые запросы, композировать из них.

## РАЗВЕДКА

```bash
# Точки, которые предстоит трогать
head -15 "src/app/(dashboard)/page.tsx"
grep -n "NAV_ITEMS" -A 14 src/components/layout/ScandiSidebar.tsx
grep -rn "NAV_ITEMS" src/components/layout/Sidebar.tsx | head -3   # второй sidebar?

# Focus-виджет (переедет на Сегодня): localStorage `focus-<dateKey>`
grep -n "focus-" src/components/layout/ActivityDrawer.tsx

# Статусы звонков и lanes задач (фактические enum-значения)
grep -n "callStatuses\s*=" src/lib/validators/call.ts
grep -n "taskLanes\s*=" src/lib/validators/task.ts

# Section-механика для [data-section] (нужен section «today»)
grep -n "SECTION_MAP" -A 14 src/lib/section-colors.ts
```

## ЗАДАЧА 1: Роутинг

1. Новый route `src/app/(dashboard)/overview/page.tsx` — перенести туда
   рендер `DashboardHome` (тот же auth-guard, что в текущем page.tsx).
2. `src/app/(dashboard)/page.tsx` — теперь рендерит новый `<TodayView />`.
3. Sidebar (оба, если их два — Scandi и обычный): пункт «Дашборд» (`/`)
   переименовать в «Сегодня»; после него добавить «Обзор» → `/overview`.
4. `section-colors.ts`: `/` → 'today', `/overview` → 'dashboard'.
   Проверь, что темам с section-накраской (aura орбы, если есть маппинг)
   не нужен новый ключ — если нужен, добавь 'today' по образцу 'dashboard'.

## ЗАДАЧА 2: TodayView — очередь действий

Новый `src/components/today/TodayView.tsx` (+ подкомпоненты в той же папке).

Секции сверху вниз (пустые секции скрываются целиком):

1. **Фокус дня** — инпут из ActivityDrawer (localStorage `focus-<dateKey>`),
   перенести логику как есть в компонент `TodayFocus`. Из ActivityDrawer
   виджет УБРАТЬ (не дублировать состояние).
2. **Просроченные звонки** — status pending и date < сегодня.
3. **Звонки на сегодня** — pending, date == сегодня.
4. **Задачи в работе** — lane 'now'; просроченные (deadline < сегодня,
   lane != done) поднимаются наверх секции с красной датой.
5. **Сделки без шага** — активные проекты, у которых
   `getDealHealth() !== 'ok'`; текст: «нет шага» / «шаг просрочен N дн.»
   (используй getNextActionOverdueDays).
6. **Встречи сегодня** — date == сегодня, сортировка по time.

Заголовок секции: название + счётчик. Общий заголовок экрана: «Сегодня»,
дата прописью, суммарный счётчик «N требуют действия».

**Каждая строка очереди — actionable, три зоны:**
- клик по телу строки → переход к сущности (звонок → /calls,
  задача → /tasks, сделка → /projects/[id], встреча → /meetings);
- primary-действие справа:
  - звонок: «Выполнен» → update status ('done') прямо из строки;
  - задача: «Готово» → lane 'done';
  - сделка: «Запланировать шаг» → ProjectModal с focusNextAction (W1a);
  - встреча: без primary (только переход);
- secondary «перенести на завтра» у звонков и задач (update date/deadline).

Optimistic updates уже в хуках — используй существующие мутации.

**Empty state**: если вся очередь пуста — большое спокойное «Всё разобрано»
+ ссылка «Открыть обзор» на /overview. Никакого конфетти.

## ЗАДАЧА 3: ActivityDrawer после переезда

Убрав focus-виджет и planned calls (секция 2-3 очереди дублирует его):
проверь, что drawer не остаётся полупустым. Оставь: часы, mini calendar,
stats grid, activity feed. Если что-то из убранного используется в других
местах — разведай перед удалением.

## ЗАДАЧА 4: Стили

- Строки очереди — существующий язык таблиц/карточек (border-b 0.5px,
  hover), НЕ карточки с тенями на каждую строку.
- Индикаторы статусов — формой + *-text цвета (как W1a).
- В t-scandi проверь: очередь монохромна, primary-действия — CTA-паттерн.
- Никаких новых hex — только var(--*).

## ПРОВЕРКА

```bash
npx tsc --noEmit   # MeetingModal 6 pre-existing — игнорируй только их
npm run dev
```

Руками: `/` открывает Сегодня со всеми секциями (создай тестовый просроченный
звонок); «Выполнен» убирает строку optimistic; «перенести на завтра» двигает
дату; переходы по клику работают; /overview показывает старый дашборд;
sidebar: Сегодня + Обзор; t-scandi и t-frost.

Обнови references/architecture.md в скилле crm-architect: новый route,
TodayView, изменения ActivityDrawer.

## КОММИТ

```bash
git add -A src/app src/components src/lib
git commit -m "feat(today): Sprint W1b — экран Сегодня (action inbox), обзор на /overview"
```
