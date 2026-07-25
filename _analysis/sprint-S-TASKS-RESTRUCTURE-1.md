# Claude Code Prompt — Sprint S-TASKS-RESTRUCTURE-1: Пересборка раздела «Задачи»

> **Тип:** UI-only, **миграции НЕТ** (классификация источника — из существующей
> `projects.type`; дата-группировка — клиентский селектор; `tasks.lane` не трогаем).
> **Риск:** средний — вывод DnD-доски из дефолта. Откат = `git revert`.
> **Стек:** Next.js 15 + TS + Tailwind + Supabase. Тема-дефолт `t-aura`.
> **Ветка:** `feat/tasks-restructure`

## WHY
Ручные лейны now/next/wait/done не масштабируются (74 задачи в «Следующие» = свалка),
конфликтуют с дедлайнами (просрочка с апреля висит в «Сейчас»), и смешивают два типа
работы: sales-задачи и WBS-задачи проектов внедрения. Пересобираем по паттернам
Pipedrive (стрим по датам), HubSpot (таблица + saved views), Salesforce/Monday
(задача в контексте записи → WBS живёт в проекте, а не в общем списке).

## WHAT
1. Дефолтный вид «Список» = стрим, сгруппированный по дедлайну (Просрочено / Сегодня /
   Завтра / Эта неделя / Позже / Без даты).
2. Второй вид «Таблица» на существующем `DataTable` (j/k + peek бесплатно).
3. Фильтр источника: Сделки / Проекты / Личное — **Проекты выкл. по умолчанию**.
4. Фильтр Мои / Все — по умолчанию Мои.
5. Выполненные — отдельный чип-фильтр, а не вечный аккордеон.
6. DnD-доска лейнов выводится из дефолта (см. РАЗВЕДКА про судьбу файла).

---

## РАЗВЕДКА (выполнить ПЕРЕД любыми правками, вывод показать)

```bash
cd ~/Downloads/dashboard-crm

# 1. Текущая страница задач и её состав
find src -path '*tasks/page.tsx'
sed -n '1,80p' src/app/\(dashboard\)/tasks/page.tsx

# 2. Хук задач — что селектит (нужен projects.type в выборке)
sed -n '1,120p' src/lib/hooks/use-tasks.ts
grep -n "select" src/lib/hooks/use-tasks.ts

# 3. Модалка задачи — точный путь (НЕ доверять памяти)
find src -name "TaskModal.tsx"

# 4. Готовая инфраструктура, которую переиспользуем
sed -n '1,60p' src/lib/hooks/use-chip-filter.ts
sed -n '1,60p' src/lib/hooks/use-saved-views.ts
grep -n "export" src/components/shared/DataTable.tsx | head -40
grep -n "mskDateKey\|export function" src/lib/utils/date-helpers.ts

# 5. Как задаётся overdue у задач сегодня (переиспользуем логику)
grep -n "taskToEvent\|lane !== 'done'\|deadline" src/lib/timeline/adapters.ts

# 6. Текущий пользователь для фильтра «Мои» — какой хук/паттерн
grep -rn "auth.getUser\|useUser\|useProfile\|user?.id\|session?.user" src/lib/hooks | head

# 7. Что за правый сайдбар на странице задач (clock/focus/звонки/stats)?
#    Определить: он глобальный (ActivityDrawer в layout) или локальный на tasks/page?
grep -n "ActivityDrawer\|SidePanel\|aside\|Drawer" src/app/\(dashboard\)/tasks/page.tsx
grep -rn "ActivityDrawer" src/app/\(dashboard\)/layout.tsx

# 8. Как deals-страница делает переключатель Список/Таблица — копируем паттерн
grep -rn "view=table\|ProjectsView\|view === " src/app/\(dashboard\)/deals/page.tsx src/components/projects | head
```

**Правила по итогам разведки:**
- Если правый сайдбар (п.7) — **глобальный `ActivityDrawer` из layout** → НЕ трогать
  (вне scope, влияет на все страницы). Если **локальный на tasks/page** → удалить
  (его роль выполняет экран «Сегодня»).
- `use-tasks` уже селектит `projects(...)`? Если да — дописать в select `type`
  (и `name`). Если нет — добавить join `projects(id, name, type)`.
- Текущий user id брать тем же способом, что уже используется в проекте (п.6),
  не вводить новый паттерн.

---

## ЗАДАЧА 1: Классификатор источника + дата-бакеты (чистые хелперы)

**Файл (новый):** `src/lib/utils/task-view.ts`

Две **чистые** функции (без запросов, тестируемые):

```typescript
import type { Task } from '@/types/database'; // сверить точное имя типа в database.ts

export type TaskSource = 'deal' | 'project' | 'personal';

// projects.type: 'client' → сделка, 'internal'|'delivery' → проект внедрения,
// нет project_id → личное. Тип связанного проекта прилетает из join в use-tasks.
export function taskSource(task: TaskWithProject): TaskSource {
  if (!task.project_id || !task.projects) return 'personal';
  return task.projects.type === 'client' ? 'deal' : 'project';
}

export type DateBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_date';

// ВАЖНО (learnings): сравнение дней — по MSK через mskDateKey, НЕ browser-local/UTC,
// иначе пограничные часы уезжают на сутки. deadline — timestamptz.
// overdue = deadline < сегодня(MSK) И lane !== 'done' (та же логика, что в taskToEvent).
export function taskDateBucket(task: Task, now: Date): DateBucket {
  if (!task.deadline) return 'no_date';
  // ... сравнение mskDateKey(deadline) с сегодня/завтра/концом недели (MSK)
}
```

- `TaskWithProject` — расширить существующий Row-тип полем `projects?: { id, name, type }`
  (не плодить `any`; если реген типов даёт `Json` — точечный `as`, не глобально).
- Done-детекция везде: `task.lane === 'done'` (у `tasks` НЕТ колонки `status`).
- Хелпер дней недели — переиспользовать/дополнить `date-helpers.ts` (там уже MSK-логика).

---

## ЗАДАЧА 2: Стрим по датам — `TaskStream` (дефолтный вид)

**Файлы (новые):** `src/components/tasks/TaskStream.tsx`, `src/components/tasks/TaskStreamRow.tsx`

- Группы в порядке: **Просрочено → Сегодня → Завтра → Эта неделя → Позже → Без даты**.
  Пустые группы скрывать. «Просрочено» — заголовок акцентным `--danger`-токеном + счётчик.
- «Без даты» — визуально отдельная зона (dashed-рамка, `--surface`-подложка): это триаж
  бывших «Следующих». Подпись «Поставь дату, преврати в шаг сделки или закрой».
- `TaskStreamRow`: чекбокс-«Готово» (mutation `lane='done'`), текст задачи, дата (overdue —
  красным + «N дн.»), чип связи (проект/компания/контакт → `Link` на detail). Приоритет —
  точка `--danger`/`--warning`/нейтраль. Quick actions на hover: Готово / На завтра
  (сдвиг deadline +1 день) / Дата…
- Цвета — **только CSS-переменные** (`--danger`/`--warning`/`--text`/`--muted`/`--surface`),
  без Tailwind-color-классов и hex (learnings).
- Клик по телу строки → открыть `TaskModal` на редактирование (сигнатура — из разведки).
- Мутации — через существующий `use-tasks` (optimistic уже там). Новых мутаций не писать.
- По умолчанию НЕ показывать `lane === 'done'` (они уходят под чип «Выполнено», Задача 4).

---

## ЗАДАЧА 3: Табличный вид — `TasksTable` (второй вид)

**Файл (новый):** `src/components/tasks/TasksTable.tsx` — обёртка над `shared/DataTable.tsx`.

- Колонки: `[ ] · Задача · Связь · Срок · Приоритет · Исполнитель`.
- `Срок` — класс `tabular-nums`; overdue красным. `Приоритет` — бейдж (crit/high/norm).
- `Исполнитель` — аватар из `useTeamMembers` (как в `AssigneeSelect`).
- Группировка строк по тому же `taskDateBucket` (group-row разделители), сортировка внутри
  по дедлайну.
- Peek/j-k достаётся от `DataTable` бесплатно — прокинуть `onRowClick` (открыть модалку)
  и опционально `peek`.

---

## ЗАДАЧА 4: Фильтры + переключатель видов — контейнер `TasksView`

**Файл (новый):** `src/components/tasks/TasksView.tsx`; **правка:** `tasks/page.tsx` рендерит `<TasksView/>`.

Строка управления (по образцу deals-страницы из разведки, п.8):
- **Переключатель Список / Таблица** — тот же паттерн и URL-параметр (`?view=`), что в Сделках.
- **Мои / Все** — по умолчанию **Мои** (`assigned_to === currentUserId`). Счётчики в чипах.
- **Источник: Сделки / Проекты / Личное** — множественный выбор.
  **MUST: при отсутствии параметра в URL проекты СКРЫТЫ** (дефолт = `deal,personal`).
  `use-chip-filter` трактует «нет параметра = показать всё», поэтому источник вести
  **отдельным URL-параметром `?src=`** с явным дефолтом `deal,personal`, НЕ через generic `f=`.
  Подпись рядом: «WBS-задачи проектов скрыты — живут в досках проектов. Показать».
- **Выполнено** — чип-фильтр (показать `lane==='done'`), заменяет аккордеон «Выполнено 79».
- Saved views — прокинуть `SavedViewChips` (route `/tasks`), инфраструктура готова.
- Заголовок страницы: «Задачи · N моих активных» (динамический счётчик после фильтров).

**Фильтрация — в порядке:** источник (`?src`) → Мои/Все → done/active → группировка по бакету.
Всё клиентское, поверх данных `use-tasks`; каждый шаг — чистая функция над массивом.

---

## ЗАДАЧА 5: Судьба старой DnD-доски + правый сайдбар

- Старый лейн-борд (now/next/wait/done, `@dnd-kit`) **вывести из дефолта**. Не удалять код
  файла целиком в этом спринте — если это отдельный компонент, оставить его неиспользуемым
  (мертвый импорт убрать), чтобы откат был дешёвым; финальное удаление — отдельным PR после
  подтверждения. Если борд встроен прямо в `page.tsx` — вынести старую разметку в
  `tasks/_legacy/TaskLaneBoard.tsx` (не подключать), а не стирать.
- `tasks.lane` в БД и в `TaskModal` (поле «Столбец») **остаётся** — это истина для личных
  задач и вход для optimistic-хуков. Не трогать.
- Правый сайдбар — по правилу из РАЗВЕДКИ (п.7): локальный → удалить, глобальный → не трогать.

---

## VERIFY (прогнать до коммита)

```bash
npm run build            # tsc strict, без ignoreBuildErrors — должен пройти чисто
npm run lint
grep -rn "any\b" src/lib/utils/task-view.ts src/components/tasks/TaskStream.tsx  # пусто
grep -rn "bg-\|text-\[#\|#[0-9a-fA-F]\{6\}" src/components/tasks/TaskStream.tsx   # нет хардкод-цветов
```

Ручной смоук (описать в ответе, не автоматизировать):
1. Дефолт: вид Список, Мои, Проекты скрыты → в списке ~11 задач, просрочка сверху.
2. Включить «Проекты» → появляются WBS-задачи; URL получает `?src=deal,project,personal`.
3. Переключить на Таблица → те же данные, j/k навигация, peek по Space.
4. Чип «Выполнено» → показываются `lane='done'`, дефолт их прятал.
5. Пустой список источника → empty state (не голая таблица с заголовками).
6. Тема `t-aura` и одна dark-тема (`t-fuji`) — цвета из токенов, ничего не «протекает».

---

## КОММИТ

```bash
git checkout -b feat/tasks-restructure
git add .
git commit -m "feat(tasks): пересборка раздела — стрим по датам, фильтр источника, вид Таблица

- дефолтный Список группируется по дедлайну (Pipedrive-паттерн), лейны выведены из дефолта
- фильтр источника Сделки/Проекты/Личное из projects.type, проекты скрыты по умолчанию
- вид Таблица на DataTable (j/k + peek), Выполнено вынесено в чип-фильтр
- UI-only, без миграций; tasks.lane сохранён для личных задач"
```

---

## Verification Labels
```
Type Safety:            NOT_VERIFIED (типы прокинуть при реализации; any запрещён — grep в VERIFY)
RLS Coverage:           NOT_APPLICABLE (UI-only, читает через существующие RLS use-tasks)
Backward Compatibility: WARNING (lane/БД не тронуты; DnD-борд выведен из дефолта — откат git revert)
Runtime Tested:         NOT_VERIFIED (смоук-чеклист выше — прогнать вручную)
Regional Availability:  NOT_APPLICABLE (сторонних сервисов нет)
```

## Трудоёмкость
~10–14 ч. Задачи 1–2 (стрим + хелперы) — ядро (~5 ч); Задача 3 (таблица) дешевле за счёт
`DataTable` (~2 ч); Задача 4 (фильтры/URL) — самая кропотливая из-за дефолта «проекты скрыты»
(~3–4 ч); Задача 5 — по итогу разведки (~1 ч). Риск: средний, весь destructive-край в Задаче 5.
