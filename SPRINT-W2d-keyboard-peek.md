# Claude Code Prompt — Sprint W2d: Keyboard nav + Peek (последний спринт Волны 2)

## Контекст

Паттерн Linear: списки управляются с клавиатуры (j/k), запись смотрится
peek-панелью без ухода со списка. Всё централизуется в
`src/components/shared/DataTable.tsx` — общем компоненте таблиц
(ProjectsTable, ContactsTable, CompaniesTable и др. потребители).

**Правила:** цвета через переменные; z-index: peek-панель между drawer (30)
и dropdown (50) → z-40, оверлея у peek НЕТ (не модалка!); guard хоткеев
от инпутов — по образцу Hotkeys.tsx (проверка tagName/isContentEditable);
reduced-motion уважать (панель без transition при prefers-reduced-motion).

## РАЗВЕДКА

```bash
# DataTable: API, onRowClick, как рендерятся строки
sed -n '1,80p' src/components/shared/DataTable.tsx

# Все потребители DataTable (везде nav заработает бесплатно)
grep -rln "shared/DataTable" src/components

# Guard-паттерн хоткеев
sed -n '45,60p' src/components/shared/Hotkeys.tsx

# TodayView: структура QueueRow для j/k
grep -n "QueueRow" src/components/today/TodayView.tsx | head -5

# Чем наполнить peek сделки (переиспользуем готовое)
grep -n "export" src/components/projects/DealFocusPanel.tsx | head -3
```

## ЗАДАЧА 1: Keyboard nav в DataTable

Внутри DataTable (не в потребителях):

- состояние `focusedIndex` (roving); `j`/`ArrowDown` — вниз, `k`/`ArrowUp` —
  вверх (циклически НЕ заворачивать — стоп на краях);
- фокус-строка: визуально `background: var(--accent-l)` + левая метка
  2px var(--accent) (в t-scandi это уже язык hover-строк — проверь
  консистентность, там hover прозрачный с border-left var(--text));
- `Enter` — как клик по строке (существующий onRowClick);
- `Space` — peek (см. Задачу 2), если у таблицы передан проп `peek`;
- `Escape` — сброс фокуса (и закрытие peek, если открыт);
- слушатель на window, активен только когда таблица «активна»: таблица
  видима И нет открытых модалок/палитры (проверяй ui-store activeModal,
  commandPaletteOpen) И фокус не в инпуте (guard);
- если на странице ДВЕ DataTable — nav у той, над которой был последний
  hover/клик (простое правило: `data-kbd-active` через mouseenter);
- прокрутка: focused-строка scrollIntoView({ block: 'nearest' });
- a11y: строкам aria-selected, таблице роль уже есть от <table>.

## ЗАДАЧА 2: PeekPanel

Новый `src/components/shared/PeekPanel.tsx` — generic контейнер:

- fixed right, ширина 440px (max-w-[90vw]), высота 100vh, z-40,
  `border-left: 0.5px solid var(--border)`, background var(--surface)
  непрозрачный (в scandi возможно var(--bg)) + var(--elevation-3);
- В Scandi/Aura стили автоматически из переменных — БЕЗ theme-специфики
  в компоненте;
- появление: translateX c var(--duration-normal) var(--ease-out);
  reduced-motion — без анимации;
- закрытие: Escape, крестик, клик вне панели (click-outside, но НЕ на
  строки таблицы — иначе peek следующей строки закроется тут же:
  клик по строке = смена содержимого peek);
- шапка: заголовок + кнопка «Открыть полностью →» (переход на detail).

DataTable принимает опциональный проп:
`peek?: (row: T) => { title: string; href: string; content: ReactNode }`.

## ЗАДАЧА 3: Peek-контент для сделок (ProjectsTable)

`peekProject(project)`: композиция из СУЩЕСТВУЮЩИХ блоков:
- статус-строка: стадия + направление + бюджет + дедлайн (компактно);
- DealFocusPanel (уже самодостаточен — next step / pinned / health);
- компания + контакт со ссылками;
- последние 3 события таймлайна, если хук уже закеширован
  (useActivityLog по project id — только если данные уже есть в кеше
  или запрос дёшев; НЕ создавай тяжёлых запросов для peek).

Contacts peek — только если получается композицией существующих блоков
за ~50 строк; иначе пропусти и отметь в отчёте.

## ЗАДАЧА 4: j/k в TodayView

Очередь «Сегодня» — те же j/k/Enter (Enter = переход по телу строки),
`d` — primary-действие focused-строки («Выполнен»/«Готово»/
«Запланировать шаг/звонок»). Без peek. Реализация локальная в TodayView
(структура секций не DataTable), но guard и визуал фокуса — те же.

## ЗАДАЧА 5: Подсказки

В футер палитры и help-оверлей (?) добавить: «j/k — по списку,
Enter — открыть, Space — предпросмотр, d — действие (Сегодня)».

## ПРОВЕРКА

```bash
npx tsc --noEmit && npm run build   # держим 0 и чистый билд
npm run dev
```

Руками: /projects (таблица) — j/k ходит, стоп на краях, Enter открывает,
Space — peek с DealFocusPanel, inline-правка шага прямо в peek работает
(optimistic), Escape закрывает; ввод в поиске таблицы НЕ дёргает nav;
открытая палитра/модалка глушит nav; «Сегодня» — j/k + d выполняет звонок;
t-scandi + тёмная; reduced-motion (в devtools) — панель без слайда.

Обнови references/architecture.md + theme-system.md (peek в z-иерархию: 40).

## КОММИТ

```bash
git add src/components src/lib
git commit -m "feat(kbd): Sprint W2d — keyboard nav (j/k) в DataTable и Сегодня, PeekPanel сделки"
```
