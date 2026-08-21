# Sprint — Minimal v2.1: лист как примитив

Продолжение `sprint-minimal-v2-depth.md`. Разбор, почему v2 не долетел до половины экранов:
`_analysis/review-sprint-minimal-v2-depth.md`.

Коротко: в проекте четыре паттерна «карточки», токены тени долетают до двух (`.shadow-card` —
12 мест, `.elevation-hover` — 16). Основная масса (≈300 мест) — голый
`bg-surface border border-border rounded-*` без тени, плюс пять экранов, где белого листа нет
вовсе. Спринт вводит примитив `.sheet` и применяет его в трёх точках, каждая из которых чинит
целый класс экранов.

⚠️ **Отличие от v2: правки НЕ под `.t-minimal`.** Задачи 2–4 меняют компоненты, общие для всех
тем. Регрессия по темам обязательна и вынесена в финальную проверку.

Объём — три точки правки, сознательно. Оставшиеся разделы (Настройки, Звонки, Встречи, Чат,
Аналитика) идут следующим спринтом, на устоявшемся примитиве.

---

## РАЗВЕДКА

```bash
# 1. Блок токенов Minimal v2 на месте (иначе примитив ляжет на другие значения)
grep -n "ECECEF\|D9D9E0\|shadow-card: var" src/app/globals.css | head

# 2. @layer components — куда класть .sheet. Ожидается блок с .elevation-1/2/3
grep -n "elevation-hover\|@layer components" src/app/globals.css

# 3. Обёртка таблицы в DataTable — анкор ЗАДАЧИ 2
grep -n "overflow-x-auto rounded-xl border border-border" src/components/shared/DataTable.tsx

# 4. Кто наследует эту правку
grep -rln "<DataTable" src --include=*.tsx

# 5. Section в Сегодня — анкор ЗАДАЧИ 3
grep -n -A 10 "^function Section" src/components/today/TodayView.tsx

# 6. Лист календаря — анкор ЗАДАЧИ 4
grep -n -A 5 "background: 'var(--surface)'" src/components/calendar/MonthGrid.tsx
```

Ожидания:
- п.1 — `--bg: #ECECEF`, `--shadow-card: var(--shadow-sm)`;
- п.3 — ровно одно вхождение;
- п.4 — 8 файлов: companies, contacts, tasks, transcripts, leads, projects ×3;
- п.6 — inline-объект с `background`, `border`, `borderRadius`, `overflow`, **без** `boxShadow`.

Если п.3 даёт не одно вхождение или п.6 уже содержит `boxShadow` — **остановиться и сообщить**:
файл правился, анкоры не совпадут.

---

## ЗАДАЧА 1: примитив `.sheet`

### Context
Единая точка для «это лист, лежащий на canvas». Все токены уже существуют во всех темах, класс
темонезависим. Дальнейшие спринты меняют elevation листов правкой одного места, а не трёхсот.

`--shadow-card`, а не `--elevation-1`: у `.elevation-hover` уже своя семантика (карточка, которая
реагирует на курсор). `.sheet` — статичная подложка, hover-подъём ей не нужен и на больших
контейнерах вреден.

### Steps
В `src/app/globals.css`, в существующий `@layer components` — **сразу после** блока
`.elevation-hover:hover { … }` и его закрывающей скобки, внутри того же слоя:

```css

  /* Лист — статичная белая подложка на canvas. Один примитив вместо
     повторения `bg-surface border border-border rounded-xl` по всему коду.
     Темонезависим: все четыре токена объявлены в каждой теме.
     Для карточек, реагирующих на курсор, — .elevation-hover, не .sheet. */
  .sheet {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-card);
  }
```

### Verification
```bash
grep -n -A 6 "^  \.sheet {" src/app/globals.css
# Класс внутри @layer components — иначе утилиты Tailwind не смогут его перебивать
```

---

## ЗАДАЧА 2: таблицы — лист вместо прозрачной рамки

### Context
Обёртка таблицы в `DataTable` несёт рамку и радиус, но **фон прозрачен**: замер на `/companies`
даёт `background-color: rgba(0, 0, 0, 0)`, `box-shadow: none`; строки `<tr>` тоже прозрачны.
Пока canvas был `#F6F6F7`, таблица читалась как почти белая. После v2 (`#ECECEF`) она ровно
цвета фона — лист исчез, осталась рамка на сером. Это регрессия v2, а не старый долг.

Одна правка наследуется восемью экранами: Компании, Контакты, Задачи-таблица, Транскрипты,
Лиды-таблица, Проекты ×3.

Радиус остаётся `rounded-xl` (12px), а не `--radius-l` из примитива: у таблицы `overflow-x-auto`
и подрезка углов уже настроена под эту величину, менять её здесь незачем.

### Steps
`src/components/shared/DataTable.tsx`.

str_replace #1 — фон и тень обёртке:
```
old:
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">

new:
      {/* v2.1: фон и тень — обёртка была прозрачной, на новом сером canvas таблица
          сливалась с фоном. Радиус оставлен rounded-xl: под него настроена подрезка. */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
```

str_replace #2 — шапка таблицы на тон темнее тела (макет 1d):
```
old:
          <thead>
            <tr className="border-b border-border">

new:
          <thead className="bg-surface2">
            <tr className="border-b border-border">
```

Если `<thead>` в файле уже несёт класс — не перезаписывать, а дописать `bg-surface2` к
существующему списку.

### Verification
```bash
npx tsc --noEmit
grep -n "bg-surface shadow-card" src/components/shared/DataTable.tsx   # 1 вхождение
grep -n "thead className" src/components/shared/DataTable.tsx
```

Визуально после `npm run dev`, тема Minimal: `/companies` и `/contacts` — таблица белым листом
с тенью, шапка серая, строки на белом. Проверить также `/transcripts` и вкладку «Таблица» на
`/tasks` — та же правка.

---

## ЗАДАЧА 3: «Сегодня» — секции в листы

### Context
Стартовый экран не имеет ни одной карточки: `Section` рендерит `<section className="mb-7">` без
фона, рамки и тени, `TodayFocus` — так же. Замер: 0 листов на странице, все контейнеры
`rgba(0,0,0,0)` / `box-shadow: none` / `border-width: 0`. Макет 1a рисует секции белыми листами
с шапкой на `--surface2`.

`QueueRow` внутри секции идёт с `-mx-2 … px-2`: hover-полоса намеренно выходит за края текста.
Тело листа поэтому получает `px-2 py-1`, а не `p-4` — иначе строки поедут внутрь и hover
оторвётся от края. Последняя строка несёт `border-b border-border/60` и без сброса нарисует
лишнюю линию у нижнего края листа.

### Steps
`src/components/today/TodayView.tsx`.

str_replace:
```
old:
  return (
    <section className="mb-7">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
        {icon}
        {title}
        <span className="text-text-mute">{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );

new:
  return (
    /* v2.1: секция — лист. Шапка на surface2, тело на surface.
       px-2 у тела: QueueRow несёт -mx-2 и без этого паддинга hover-полоса
       вылезет за край листа. Сброс border-b у последней строки — иначе
       её разделитель дублирует нижнюю рамку листа. */
    <section className="sheet mb-7 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface2 px-4 py-2
                      text-xs font-medium uppercase tracking-wider text-text-dim">
        {icon}
        {title}
        <span className="text-text-mute">{count}</span>
      </div>
      <div className="px-4 py-1 [&>*:last-child]:border-b-0">{children}</div>
    </section>
  );
```

`src/components/today/TodayFocus.tsx` — тот же приём, но инпут внутри листа получает явную
рамку вместо нижней линии (макет 1a):

str_replace:
```
old:
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
        <Target size={13} />
        Фокус дня
      </div>
      <input
        value={text}
        onChange={(e) => save(e.target.value)}
        placeholder="Одно главное дело на сегодня…"
        className="w-full border-0 border-b border-input bg-transparent pb-2 text-lg
                   text-text-main placeholder:text-text-mute
                   focus:border-accent focus:outline-none"
      />
    </section>

new:
    <section className="sheet mb-8 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface2 px-4 py-2
                      text-xs font-medium uppercase tracking-wider text-text-dim">
        <Target size={13} />
        Фокус дня
      </div>
      <div className="p-4">
        <input
          value={text}
          onChange={(e) => save(e.target.value)}
          placeholder="Одно главное дело на сегодня…"
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-lg
                     text-text-main placeholder:text-text-mute
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </section>
```

### Verification
```bash
npx tsc --noEmit
grep -n "sheet mb-7\|sheet mb-8" src/components/today/TodayView.tsx src/components/today/TodayFocus.tsx
```

Визуально на `/`: каждая секция — белый лист с серой шапкой и тенью; строки очереди на белом;
у нижней строки секции нет двойной линии; hover-полоса строки доходит до краёв листа, но не
вылезает за них. Проверить экран с одной секцией и пустое состояние (`EmptyState` — намеренно
без листа, остаётся как есть).

---

## ЗАДАЧА 4: календарь — тень листу сетки

### Context
Вопреки первому замеру, лист у месяца уже есть: `MonthGrid` задаёт
`background: var(--surface)`, рамку `--cal-line` и `borderRadius: var(--radius)` инлайном.
Не хватает единственного — тени, поэтому сетка выглядит наклейкой, а не листом (макет 2f:
«сетка на приподнятом листе»). Правка — одна строка в существующий объект стилей.

Рамку **не трогать**: комментарий в файле объясняет, почему периметр идёт `--cal-line`, а не
`--border` — с `--border` он бледнее внутренних линий и карточка читается незакрытой.

### Steps
`src/components/calendar/MonthGrid.tsx`.

str_replace:
```
old:
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--cal-line)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>

new:
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--cal-line)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        /* v2.1: лист сетки был без тени — читался наклейкой на canvas */
        boxShadow: 'var(--shadow-card)',
      }}>
```

### Verification
```bash
grep -n "shadow-card" src/components/calendar/MonthGrid.tsx
npx tsc --noEmit
```

Визуально на `/calendar`, вид «Месяц»: сетка приподнята над фоном, hairline внутри не
изменились, углы подрезаны как раньше. Виды «Неделя» и «Команда» — вне этой задачи, у них
своя обёртка; если они выглядят рассогласованно с месяцем, **не чинить здесь**, записать в
отчёт как находку для следующего спринта.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npm run build
```

**Регрессия по темам — обязательна и в этот раз шире, чем в v2.** Задачи 2–4 правят компоненты
вне `.t-minimal`, значит их видят все темы. Открыть `/companies`, `/` и `/calendar` в каждой:
Claude, Frost, Aura, Aurora, Washi, Fuji, Tidal, Consulting.

На что смотреть:
- тёмные темы (Frost, Aura, Aurora, Tidal) — у них `.shadow-card` идёт с `backdrop-filter`
  (globals.css, блок «Dark-theme glassmorphism»). Проверить, что обёртка таблицы с `bg-surface`
  не выглядит мутной и не режет производительность на длинных списках;
- `bg-surface2` у шапки таблицы — не сливается ли с `--surface` в темах, где эти токены близки;
- лист секций «Сегодня» — не двоится ли рамка там, где строки очереди несут свои разделители.

```bash
# Ни одна правка не должна была затронуть блоки других тем
git diff --stat
git diff src/app/globals.css | grep "^[+-]" | grep -c "t-frost\|t-aura\|t-washi\|t-fuji\|t-tidal"
# → 0
```

Если в какой-то теме результат заметно хуже прежнего — **не подгонять `.sheet` под неё**.
Записать в отчёт: примитив общий, подгонка под конкретную тему делается правилом
`.t-<тема> .sheet { … }` отдельным решением.

---

## КОММИТ

```bash
git add src/app/globals.css src/components/shared/DataTable.tsx \
        src/components/today/TodayView.tsx src/components/today/TodayFocus.tsx \
        src/components/calendar/MonthGrid.tsx
git commit -m "feat(ui): лист как примитив — .sheet и три точки применения

- .sheet в @layer components: surface + border + radius-l + shadow-card
- DataTable: обёртка таблицы была прозрачной — bg-surface + shadow-card,
  шапка на surface2. Наследуют 8 экранов (компании, контакты, задачи,
  транскрипты, лиды, проекты)
- Сегодня: секции очереди и фокус дня — листы с серой шапкой, инпут
  фокуса получил явную рамку вместо нижней линии
- Календарь: листу сетки месяца добавлена shadow-card

Правки вне .t-minimal — общие для всех тем, регрессия проверена.
Продолжение Minimal v2 (fcafc1f), разбор — в
_analysis/review-sprint-minimal-v2-depth.md"
```

---

## Что НЕ делать

- Не менять токены темы: `.t-minimal` в этом спринте не трогается вовсе.
- Не заменять `bg-surface border border-border rounded-*` на `.sheet` массово по проекту —
  Настройки, Звонки, Встречи, Чат и Аналитика идут следующим спринтом, отдельным диффом.
- Не вешать `.sheet` на вложенные контейнеры: тень на тени. Один лист — один уровень.
- Не трогать `.elevation-hover` и `.shadow-card` — они работают, у них своя семантика.
- Не менять рамку календаря с `--cal-line` на `--border`: причина в комментарии файла.
- Не чинить `borderRight` колонок в PipelineBoard/DeliveryPipelineBoard и не вычищать
  `border-border/50` — это F-06 и F-08 из отчёта, следующий спринт.
- Не править `ui/Card.tsx`: решение о судьбе компонента (оживить `elevated` или удалить)
  принимается отдельно, вслепую его трогать нельзя — 6 вызовов в коде.
