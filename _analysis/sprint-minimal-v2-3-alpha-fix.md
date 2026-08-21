# Sprint — Minimal v2.3: альфа-модификаторы, календарь, встречи, мёртвый Card

Продолжение `sprint-minimal-v2-2-sheet-rollout.md` (коммит `c38f378`, влит в main).

Спринт начинался как «подчистить долги F-06…F-08», но замер в живом приложении показал, что
F-08 — не гигиена, а **функциональный дефект**: цветовые классы с альфа-модификатором в проекте
не работают вообще. 309 таких мест. Часть из них — состояния ошибки и подсветка drop-зон,
то есть пользователь не видит того, что дизайн ему обещал.

Порядок задач значим: 1 перед 2, иначе после починки конфига 83 бордера станут бледнее, чем
их отладили в v2.

**F-06 из отчёта снят и в спринт не входит.** `borderRight` в PipelineBoard и
DeliveryPipelineBoard — не недоделка: комментарий в коде объясняет, что колонки этих досок
сплавлены в одну сетку с общей рамкой снаружи, и разделитель работает рамкой колонки. Доски
задач и лидов используют другой паттерн — раздельные контейнеры. Это два осознанных решения,
а не расхождение.

---

## РАЗВЕДКА

```bash
# 1. Масштаб дефекта: классы, которые Tailwind не генерирует
grep -rohE '\b(bg|border|text|ring|from|to|via)-[a-z0-9-]+/[0-9]+' src --include=*.tsx | wc -l
grep -rohE 'border-border2?/[0-9]+' src --include=*.tsx | wc -l

# 2. Как объявлены цвета — причина дефекта
sed -n '/colors: {/,/},/p' tailwind.config.ts | head -40

# 3. Версия Tailwind: функция-значение с opacityValue требует v3
grep -n '"tailwindcss"' package.json

# 4. Календарь: у каких видов лист уже есть
grep -n "background: 'var(--surface)'" src/components/calendar/MonthGrid.tsx \
  src/components/calendar/WeekLanes.tsx src/components/calendar/TeamDayGrid.tsx

# 5. Мёртвый ли Card
grep -rn "components/ui/Card" src --include=*.tsx --include=*.ts
grep -rn "<Card[ />]" src --include=*.tsx
```

Ожидания: п.1 — 309 и 83; п.2 — цвета вида `red: 'var(--red)'`, без `<alpha-value>`;
п.3 — `^3.4.16`; п.4 — MonthGrid и WeekLanes имеют, TeamDayGrid надо смотреть;
п.5 — **оба грепа пустые**.

Если п.5 хоть что-то нашёл — **остановиться и сообщить**: Задача 5 удаляет файл, и она верна
только если он мёртв.

---

## ЗАДАЧА 1: вычистить `border-border/NN` — 83 места

### Context
Сейчас эти классы Tailwind не генерирует, и рамка приходит из
`borderColor.DEFAULT = var(--border)` — то есть де-факто везде полный токен. Плотность
бордеров, отлаженная в Minimal v2 (`#E5E5E8 → #D9D9E0`), держится именно на этом.

После Задачи 2 модификатор заработает, и все 83 места станут вдвое бледнее — прямой откат
работы v2. Поэтому модификатор снимается **до** починки конфига: визуально это no-op,
computed-значение не меняется.

### Steps
```bash
# BSD sed (macOS): -i требует пустого аргумента
grep -rlE 'border-border2?/[0-9]+' src --include=*.tsx \
  | xargs sed -i '' -E 's/border-border2\/[0-9]+/border-border2/g; s/border-border\/[0-9]+/border-border/g'
```

### Verification
```bash
grep -rohE 'border-border2?/[0-9]+' src --include=*.tsx | wc -l   # → 0
npx tsc --noEmit
```

Визуально: до и после этой задачи страницы должны выглядеть **одинаково**. Если что-то
изменилось — значит какое-то из вхождений всё-таки генерировалось, остановиться и сообщить.

---

## ЗАДАЧА 2: цвета в Tailwind — поддержка альфы

### Context
Причина дефекта: цвета объявлены как `'var(--red)'`. Tailwind не умеет подмешать альфу в
готовую CSS-переменную и просто **не выдаёт класс** — ни фона, ни цвета рамки.

Замер в живом приложении (тема Minimal, dev):

| Класс | Ожидалось | Фактически |
|---|---|---|
| `bg-red/5` | розовая подложка | `rgba(0, 0, 0, 0)` — фона нет |
| `border-red/30` | красная рамка | `rgb(217, 217, 224)` — нейтральный `--border` |
| `bg-accent-l/20` | подсветка drop-зоны | `rgba(0, 0, 0, 0)` — фона нет |
| `border-red` (без модификатора) | красная рамка | `rgb(204, 59, 46)` — работает |

Что это ломает на практике: блоки ошибок (`rounded-xl border border-red/30 bg-red/5 p-6` —
CompaniesTable, CallLog, MeetingsList) выглядят как обычный текст в серой рамке; подсветка
колонки при перетаскивании карточки (`isOver ? 'bg-accent-l/20'` в PipelineBoard и
DeliveryPipelineBoard) не появляется вовсе — пользователь тащит вслепую.

Починка — функция-значение с `opacityValue`. Темы и токены не трогаются: `color-mix` берёт хром
из той же переменной. Синтаксис проверен в Chromium на живом приложении:
`color-mix(in srgb, var(--red) calc(0.05 * 100%), transparent)` → `color(srgb 0.8 0.23 0.18 / 0.05)`.

### Steps
`tailwind.config.ts`. Перед `module.exports` / `export default` добавить хелпер:

```ts
/* v2.3: цвета объявлялись как 'var(--x)', и Tailwind не мог сгенерировать
   вариант с альфой — классы вида bg-red/5 и border-red/30 просто не
   существовали (замер: фона нет, рамка падала на --border). Функция-значение
   отдаёт var() без модификатора и color-mix с ним. Токены тем не трогаются. */
const v = (name: string) => ({ opacityValue }: { opacityValue?: string }) =>
  opacityValue === undefined
    ? `var(${name})`
    : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`;
```

Затем в блоке `colors` заменить строковые значения на вызовы хелпера. Обязательные —
те, у которых модификаторы реально используются в коде:

```
bg, surface, surface2, surface3, popover, border, border2,
accent, accent-l, accent-l2,
red, red-l, green, green-l, blue, blue-l, yellow, yellow-l, purple, purple-l,
danger и остальные семантические из того же блока
```

Пример замены (применить ко всем перечисленным):
```
old:  red: 'var(--red)',
new:  red: v('--red'),
```

`text-main`, `text-dim`, `text-mute` — тоже перевести: модификаторы на тексте в коде есть.

⚠️ **Не трогать** `borderColor.DEFAULT` и `borderColor.input` — они ссылаются на
`var(--border)` напрямую и работают как фолбэк; менять их семантику этот спринт не должен.

### Verification
```bash
npx tsc --noEmit
npm run build     # конфиг ломается именно на сборке, не на типах
```

Проверка в браузере после `npm run dev`, DevTools console на любой странице:
```js
const p=c=>{const d=document.createElement('div');d.className=c;document.body.appendChild(d);
const s=getComputedStyle(d);const r=[c,s.backgroundColor,s.borderTopColor];d.remove();return r};
console.table([p('bg-red/5'),p('border border-red/30'),p('bg-accent-l/20'),p('border border-border')]);
```
Ожидается: у первых трёх появились значения с альфой (`… / 0.05`, `… / 0.3`), у последнего
осталось `rgb(217, 217, 224)`.

Визуально: открыть `/companies` и отключить сеть в DevTools, чтобы поймать блок ошибки —
он должен стать розовым с красной рамкой. На `/deals` начать перетаскивание карточки — колонка
под курсором подсвечивается.

---

## ЗАДАЧА 3: календарь — тень видам «Неделя» и «Команда»

### Context
В v2.1 тень получил только месяц. Виды «Неделя» и «Команда» рисуются своими компонентами и
остались плоскими — рядом с приподнятым месяцем читаются как другой уровень интерфейса.

У `WeekLanes` лист уже есть (`background: var(--surface)`, `borderRadius` — строки ~240–241),
не хватает тени, как было у `MonthGrid`. У `TeamDayGrid` корневой контейнер надо найти:
`background: 'var(--surface)'` на строке ~377 относится к вложенному блоку, не к корню.

### Steps
`src/components/calendar/WeekLanes.tsx` — в объект стилей корневого контейнера (тот, где
`borderRadius: 'var(--radius)'` и `background: 'var(--surface)'`) дописать:
```
        /* v2.3: тень — как у MonthGrid, иначе виды календаря на разных уровнях */
        boxShadow: 'var(--shadow-card)',
```

`src/components/calendar/TeamDayGrid.tsx` — найти корневой контейнер сетки:
```bash
grep -n "return (" src/components/calendar/TeamDayGrid.tsx | head -3
```
Если у него есть свой фон и рамка — дописать `boxShadow: 'var(--shadow-card)'` тем же приёмом.
Если корень прозрачный и лист там не предусмотрен — **не изобретать**: записать в отчёт и
оставить как есть.

### Verification
```bash
grep -n "shadow-card" src/components/calendar/*.tsx   # MonthGrid + WeekLanes (+ TeamDayGrid, если применимо)
npx tsc --noEmit
```

Визуально `/calendar`: переключение «Месяц → Неделя → Команда» не меняет уровень листа, тень
одинаковая.

---

## ЗАДАЧА 4: Встречи — секции в листы

### Context
Единственный раздел, который остался без листа после v2.2: контейнера-секции в
`MeetingsList.tsx` нет вовсе, разделы «Предстоящие» и «Прошедшие» — это `<div className="mb-6">`
с заголовком и списком строк внутри.

Приём — как в «Сегодня»: лист на секцию, строки внутри остаются плоскими.

### Steps
`src/components/meetings/MeetingsList.tsx`.

Секция «Upcoming» (~строка 93) и симметричная ей «Прошедшие» — обернуть содержимое в лист.
Заголовок секции (`<h2 className="mb-3 flex items-center gap-2 text-xs font-semibold …">`)
поставить шапкой на `bg-surface2`, как в `TodayView.Section`:

```
old:
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-yellow">

new:
        <div className="sheet mb-6 overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-border bg-surface2 px-4 py-2 text-xs font-semibold text-yellow">
```

Тело секции (обёртка вокруг строк) получает `px-4 py-1`, как в «Сегодня». Если строки несут
собственный `border-b`, добавить телу `[&>*:last-child]:border-b-0`.

**Не трогать**: строку списка (~222, `group flex items-start gap-3 rounded-xl border …`), тост
(~163, `bg-popover … elevation-3`) и блок ошибки (~74) — последний чинится Задачей 2, а не здесь.

### Verification
```bash
grep -n "sheet mb-6" src/components/meetings/MeetingsList.tsx   # 2 вхождения
npx tsc --noEmit
```

Визуально `/meetings`: две секции-листа, строки внутри плоские, тень не повторяется на каждой
строке.

---

## ЗАДАЧА 5: удалить мёртвый `ui/Card.tsx`

### Context
Компонент не импортируется нигде: ни `components/ui/Card`, ни `<Card` в коде не встречаются
(проверено грепом). Экспорты `Card`, `CardTitle`, `CardBody` не используются; `CardLabel` в
`ContactDetailHub.tsx:120` — это локальная функция того же файла, к `ui/Card.tsx` отношения не
имеет.

Пока файл лежит, он создаёт ложное впечатление, что примитив карточки в проекте — компонент.
Примитив — `.sheet`.

### Steps
```bash
# Ещё раз убедиться, что мёртв (Задача выполняется только при пустом выводе)
grep -rn "ui/Card\|<Card[ />]\|CardTitle\|CardBody" src --include=*.tsx --include=*.ts | grep -v "ContactDetailHub"

git rm src/components/ui/Card.tsx
```

### Verification
```bash
npx tsc --noEmit
npm run build
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint      # ожидается тот же предсуществующий набор из 14 — сверить состав, не только число
npm run build
```

⚠️ **Погасить dev перед билдом** либо перезапустить его после: в v2.2 `npm run build` затёр
`.next` под работающим `next dev`, и приложение отдавало 404 на CSS, оставаясь «живым» процессом.

Регрессия по семи темам (Аура, Washi, Fuji, Frost, Aurora, Tidal, Minimal) — **шире обычного**:
Задача 2 включает цвет там, где его два года не было.

Смотреть по всем темам:
- бейджи и чипы статусов — не стали ли кричащими там, где раньше были нейтральными;
- блоки ошибок — розовые с красной рамкой, но не агрессивные;
- drop-зоны досок `/deals`, `/projects`, `/tasks`, `/leads` — подсветка при перетаскивании
  появилась и не спорит с тинтом колонки;
- тёмные темы — `color-mix` с полупрозрачными токенами (`--accent-l` уже rgba) даёт двойную
  альфу: проверить, что подсветки не исчезли в ноль;
- плотность бордеров не изменилась (это гарантирует Задача 1).

```bash
# Токены тем не должны быть тронуты ни одной задачей
git diff src/app/globals.css | wc -l   # → 0
```

---

## КОММИТ

```bash
git add tailwind.config.ts src/components/ src/app/
git commit -m "fix(ui): альфа-модификаторы цветов не работали — 309 классов вхолостую

- tailwind.config: цвета через функцию-значение с opacityValue и color-mix.
  Было: red: 'var(--red)' — Tailwind не мог подмешать альфу и не выдавал
  класс вовсе. Замер: bg-red/5 → фона нет, border-red/30 → нейтральный
  --border, bg-accent-l/20 (подсветка drop-зоны) → фона нет
- border-border/NN → border-border (83 места): держали плотность v2 на
  фолбэке DEFAULT, после починки конфига стали бы вдвое бледнее
- календарь: тень видам «Неделя» и «Команда» — были на другом уровне,
  чем месяц
- встречи: секции «Предстоящие» и «Прошедшие» — листы
- удалён мёртвый ui/Card.tsx: не импортировался нигде, примитив — .sheet

F-06 (borderRight колонок в PipelineBoard/DeliveryPipelineBoard) снят:
это осознанный паттерн слитой сетки, а не недоделка."
```

---

## Что НЕ делать

- Не трогать `src/app/globals.css` и токены тем — весь спринт обходится без них.
- Не менять `borderColor.DEFAULT` и `borderColor.input` в конфиге.
- Не «чинить» `borderRight` колонок в PipelineBoard и DeliveryPipelineBoard.
- Не делать листами строки списков — ни во Встречах, ни где-либо ещё.
- Не подгонять значения альфы «на глаз» после того, как классы заработают: если конкретное
  место стало слишком ярким или бледным, это отдельное дизайн-решение — записать в отчёт,
  а не править молча.
- Не изобретать лист для `TeamDayGrid`, если его корень к этому не приспособлен.
