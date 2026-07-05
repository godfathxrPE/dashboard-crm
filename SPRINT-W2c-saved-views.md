# Claude Code Prompt — Sprint W2c: Saved views (сохранённые виды)

## Контекст

Паттерн Close/Attio: именованные фильтры как навигация («Тихо >14 дней»,
«Ждёт КП», «ERP»). Два этапа: (1) фильтры переезжают в URL — это заявленная
конвенция проекта (architecture: «URL state: searchParams — filters»),
которая фактически не выполнена (useChipFilter держит useState);
(2) поверх URL — сохранённые виды.

**Правила:** обратная совместимость API useChipFilter (страницы не
переписывать массово); цвета через переменные; localStorage для видов
(таблица user_views — потом, не в этом спринте).

## РАЗВЕДКА

```bash
# Все потребители useChipFilter (каждый станет URL-backed автоматически)
grep -rln "useChipFilter" src/components

# Какие ещё локальные фильтры-стейты есть (search inputs)
grep -rn "useState.*[Ss]earch\|searchQuery" src/components/projects/ProjectsView.tsx src/components/companies/CompaniesView.tsx src/components/contacts/ContactsView.tsx 2>/dev/null | head
# (фактические имена View-компонентов уточни: ls src/components/*/)

# ProjectsView уже использует searchParams (view=table) — образец интеграции
grep -n "useSearchParams\|useRouter" src/components/projects/ProjectsView.tsx | head

# Палитра: секции (добавим «Виды»)
grep -n "section:" src/components/shared/CommandPalette.tsx | head
```

## ЗАДАЧА 1: useChipFilter → URL-backed

Перепиши `use-chip-filter.ts`: `activeFilters` хранится в searchParams
(`?f=key1,key2`), API прежний ({filtered, activeFilters, counts, toggle,
reset}) + новый параметр `paramKey` (default 'f') на случай двух фильтров
на странице.

- router.replace с scroll:false — без записей в history на каждый чип;
- SSR-safe: useSearchParams в client-компонентах уже (все View — 'use client');
- страницы-потребители менять НЕ нужно (API совместим) — проверь каждую
  из разведки на сборку;
- поисковую строку (q) в URL в этом спринте переносить НЕ надо — только чипы
  (меньше blast radius; q добавим при живой необходимости).

## ЗАДАЧА 2: Механика saved views

Новый `src/lib/hooks/use-saved-views.ts`:

```typescript
interface SavedView { id: string; label: string; route: string; query: string; }
// localStorage key: 'saved-views', массив, CRUD:
useSavedViews(route?: string) → { views, saveCurrent(label), remove(id), apply(view) }
```

- `saveCurrent`: снимок текущего location.search (включая view=table и f=...);
- `apply`: router.push(route + query);
- без ограничений количества, но UI показывает до ~8 на страницу.

## ЗАДАЧА 3: UI на страницах с фильтрами

В строке чипов (справа, после существующих):
- разделитель-точка, затем чипы сохранённых видов этого route
  (визуально отличить: иконка Bookmark 12px перед текстом);
- клик — apply; крестик на hover — remove (с confirm? нет: мгновенно,
  восстановить легко пересохранением);
- кнопка «Сохранить вид» (иконка BookmarkPlus) — видна только когда есть
  активные фильтры; клик → inline-инпут имени (Enter — сохранить,
  Esc — отмена), не модалка;
- активный вид (query совпадает) — чип подсвечен как активный чип-фильтр.

Начни с Projects и Companies; Contacts и Calls — если useChipFilter там
уже используется, получится бесплатно — добавь и туда.

## ЗАДАЧА 4: Виды в command palette

Секция «Виды» (после «Действия»): все сохранённые виды всех страниц,
label + route-подпись (например «Проекты»), выбор = apply. Динамически
из localStorage (useSavedViews без route-фильтра).

## ПРОВЕРКА

```bash
npx tsc --noEmit   # держим 0
npm run build      # SSR/CSR bailout: useSearchParams требует Suspense — проверь билдом!
npm run dev
```

Руками: включи чипы на /projects → URL содержит ?f=...; F5 — фильтры
пережили перезагрузку; «Сохранить вид» → имя → чип появился; переход
на другую страницу и клик по виду из палитры → вернулся с фильтрами;
back-button браузера не завален историей от кликов по чипам;
t-scandi (чипы там квадратные — Bookmark-иконка не сломала высоту) + тёмная.

Обнови references/architecture.md (URL-фильтры, saved views, палитра).

## КОММИТ

```bash
git add src/components src/lib
git commit -m "feat(views): Sprint W2c — фильтры в URL + saved views + секция Виды в палитре"
```
