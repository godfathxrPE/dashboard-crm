# Claude Code Prompt — Sprint W1c: Focus panel в карточке сделки

## Контекст

Паттерн Pipedrive: вверху карточки сделки — рабочая панель «что дальше»,
а не пассивные атрибуты. Всё для этого уже есть: колонки `next_action_date`
и `pinned_note` (миграция 017, применена), `getDealHealth`/
`getNextActionOverdueDays` (W1a), `InlineEdit` (value/onSave/type),
`useUpdateProject`. Только UI-композиция, БД не трогаем.

**Правила:** цвета через CSS-переменные; inline-правки — optimistic через
существующую мутацию; тест t-scandi + тёмная.

## РАЗВЕДКА

```bash
# Текущий блок next_step в ProjectDetail (заменим на Focus panel)
grep -n "next_step" src/components/projects/ProjectDetail.tsx
sed -n '640,670p' src/components/projects/ProjectDetail.tsx

# Где в шапке HealthDot (панель встанет под шапку/пайплайн)
sed -n '500,560p' src/components/projects/ProjectDetail.tsx

# InlineEdit: поддерживает ли type="date" и пустое value
sed -n '1,60p' src/components/ui/InlineEdit.tsx
```

## ЗАДАЧА 1: Компонент DealFocusPanel

Новый `src/components/projects/DealFocusPanel.tsx`. Принимает project +
мутацию (или дергает useUpdateProject внутри). Три зоны в одной панели
(grid, на мобильном — стопка):

1. **Следующий шаг** (главная зона, визуально доминирует):
   - `next_step` через InlineEdit (placeholder «Какой следующий шаг?»);
   - `next_action_date` через InlineEdit type="date" рядом
     (formatDisplay — «7 июля», relative «завтра/сегодня» если близко);
   - состояние из getDealHealth: overdue → дата красным + «просрочен N дн.»,
     no-action → зона подсвечена жёлтой рамкой-меткой;
   - кнопка «Шаг сделан ✓»: очищает next_step и next_action_date одним
     update (сделка честно попадает в rotting, пока не назначен новый шаг) —
     подтверждения не нужно, действие обратимо через inline edit.
2. **Закреплено**: `pinned_note` через InlineEdit (multiline textarea, если
   InlineEdit не умеет — расширь пропом as="textarea", не форкай компонент).
   Пустое состояние: «Закрепить заметку…» муted-цветом.
3. **Здоровье**: существующий HealthDot + счётчик дней с последней
   активности, если это дёшево достать из activity-данных карточки
   (если нет — только HealthDot, не городи новый запрос).

Панель НЕ карточка с тенью — блок с верхней/нижней hairline-границей
(язык проекта), в t-scandi — bracket-уголки через существующий класс,
если он применяется к соседним блокам.

## ЗАДАЧА 2: Встройка в ProjectDetail

1. Убери старый пассивный блок вывода `project.next_step` (~строка 650).
2. DealFocusPanel — сразу под шапкой/пайплайном, НАД табами: панель видна
   при любом активном табе.
3. Для закрытых сделок (status !== 'open') панель не рендерится.

## ЗАДАЧА 3: Синхронизация с чек-листом шапки

В шапке есть чек-лист заполненности (`{ key: 'next_step', ... }`, ~строка 79).
Проверь, что он продолжает работать; добавь туда `next_action_date`
(«Дата шага») по образцу.

## ПРОВЕРКА

```bash
npx tsc --noEmit   # MeetingModal 6 pre-existing — игнорируй
npm run dev
```

Руками: открой сделку → панель под пайплайном; правка шага/даты inline
сохраняется optimistic; «Шаг сделан» очищает оба поля и Today-очередь
(`/`) сразу показывает сделку в «Сделки без шага»; pinned_note редактируется;
закрытая сделка — без панели; t-scandi + t-frost.

Обнови references/architecture.md (DealFocusPanel в структуре ProjectDetail).

## КОММИТ

```bash
git add src/components src/lib
git commit -m "feat(deals): Sprint W1c — Focus panel (next step + pinned note + health) в карточке сделки"
```
