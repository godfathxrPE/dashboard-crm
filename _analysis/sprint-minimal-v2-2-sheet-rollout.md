# Sprint — Minimal v2.2: раскатка `.sheet` по оставшимся разделам

Продолжение `sprint-minimal-v2-1-sheet.md` (коммит `5afa4a1` + правки гейта).
Разбор, зачем это всё: `_analysis/review-sprint-minimal-v2-depth.md`.

v2.1 ввёл примитив и применил в трёх точках. v2.2 доводит до конца пять разделов, которые
остались плоскими: **Настройки, Чат, Аналитика, Звонки, Встречи**. Технические долги
(F-06 рамки колонок, F-07 судьба `ui/Card.tsx`, F-08 мёртвые `border-border/50`, тени видов
«Неделя»/«Команда» в календаре) — в v2.3, здесь не трогаются.

⚠️ Правки, как и в v2.1, **вне `.t-minimal`** — их видят все 7 тем. Регрессия обязательна.

⚠️ **Замена не механическая.** В каждом разделе есть контейнеры, которые листом быть не должны:
строки списков, скелетоны, вложенные блоки. Списки конкретных мест даны ниже — работать по ним,
а не по глобальному поиску.

---

## РАЗВЕДКА

```bash
# 1. Примитив на месте и правки гейта приняты
grep -n -A 6 "^  \.sheet {" src/app/globals.css
grep -n -B 2 -A 3 "t-tidal .sheet" src/app/globals.css

# 2. Сколько целей в каждом разделе — числа сверяются в Verification каждой задачи
grep -rc 'rounded-xl border border-border bg-surface' src/components/settings/*.tsx | grep -v ':0'
grep -rn 'rounded-xl border border-border bg-surface' src/components/chat/ChatView.tsx
grep -rn 'rounded-xl border border-border/50 bg-surface' src/components/analytics/*.tsx
grep -rn 'rounded-xl border border-border bg-surface' src/components/calls/*.tsx

# 3. Убедиться, что sed на этой машине — BSD (macOS): ключ -i требует пустого аргумента
sed --version 2>/dev/null | head -1 || echo "BSD sed — использовать sed -i ''"
```

Ожидания:
- п.1 — `.sheet` внутри `@layer components`, и он же присутствует в блоке
  Dark-theme glassmorphism рядом с `.t-tidal .shadow-card`. **Если `.t-tidal .sheet` не
  найден — остановиться и сообщить**: правки гейта не влиты, без них раскатка сломает
  стеклянные темы в пяти разделах сразу;
- п.2 — settings 11 вхождений в 8 файлах, ChatView 3, analytics 7, calls 3;
- п.3 — на macOS `sed -i` без аргумента съест следующий параметр как суффикс бэкапа.

---

## ЗАДАЧА 1: радиус примитива — `--radius-l` → `--radius-m`

### Context
Решение по находке гейта. `.sheet` взял самый крупный радиус темы: Washi `--radius-l: 8px`
при базовом `--radius: 4px`, Aura — 18px. Все места, которые примитив заменяет, сейчас несут
`rounded-xl` = 12px. `--radius-m` по темам — 4/8/10/10/10/12/12px, то есть ближе к факту и
не спорит с характером темы (острый Washi остаётся острым).

Менять до раскатки, а не после: иначе 25 мест переедут на радиус, который всё равно
поменяется, и визуальная проверка v2.2 обесценится.

### Steps
`src/app/globals.css`, внутри `.sheet`:

str_replace:
```
old:
  .sheet {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);

new:
  .sheet {
    background: var(--surface);
    border: 1px solid var(--border);
    /* v2.2: --radius-m, не -l. Заменяемые места несут rounded-xl (12px);
       --radius-l у Aura 18px, у Washi 8px при базовом 4px — примитив спорил
       бы с характером темы. --radius-m: 4…12px, совпадает с фактом. */
    border-radius: var(--radius-m);
```

### Verification
```bash
grep -n -A 8 "^  \.sheet {" src/app/globals.css   # должен показать --radius-m
grep -c "radius-l" src/app/globals.css            # значение справочное, важно что .sheet его не использует
```

Визуально на `/` (тема Minimal): радиус секций «Сегодня» стал 10px вместо 14px, разница
едва заметна — это ожидаемо. Настоящая проверка — Washi и Aura в финальном прогоне.

---

## ЗАДАЧА 2: Настройки — 11 панелей

### Context
Замер: 12 листов на `/settings`, все 12 без тени. Паттерн идентичен во всех восьми файлах
раздела — `rounded-xl border border-border bg-surface p-4`, всегда контейнер секции верхнего
уровня. Вложенных совпадений нет, поэтому здесь массовая замена безопасна.

`p-4` и прочие модификаторы остаются в классе: `.sheet` задаёт только поверхность.

### Steps
```bash
# macOS/BSD sed — ключ -i требует пустого аргумента
grep -rl 'rounded-xl border border-border bg-surface' src/components/settings/ \
  | xargs sed -i '' 's/rounded-xl border border-border bg-surface/sheet/g'
```

Затронутые файлы (сверить со списком после замены): `AutomationsSection.tsx`,
`ChecklistTemplatesSection.tsx`, `GatesSection.tsx`, `OrgSettingsSection.tsx`,
`SettingsContent.tsx` (4 места), `TeamSection.tsx`, `TelegramSection.tsx`,
`WebhooksSection.tsx`.

### Verification
```bash
grep -rc 'className="sheet p-4"' src/components/settings/*.tsx | grep -v ':0'
grep -rn 'rounded-xl border border-border bg-surface' src/components/settings/   # → пусто
npx tsc --noEmit
```

Визуально `/settings`, тема Minimal: секции — белые листы с тенью, интервалы между ними не
изменились, вложенных теней нет.

---

## ЗАДАЧА 3: Чат — три панели верхнего уровня

### Context
На `/chat` два листа рядом: список каналов и область треда. Оба сейчас плоские (замер: 2 из 2).

**`MessageThread.tsx:82` (`DEFAULT_ROOT_CLASS`) не трогать.** Это фолбэк для варианта `card` —
тред, вставленный вкладкой внутрь карточки сущности. Там он уже лежит внутри чужого контейнера,
и лист дал бы тень на тени. На `/chat` этот фолбэк не используется: `ChatView` передаёт свой
`className`.

### Steps
`src/components/chat/ChatView.tsx` — три места, все в одном файле:

str_replace #1 (список каналов, строка ~95):
```
old:
          'min-h-0 w-full shrink-0 rounded-xl border border-border bg-surface md:w-[18rem]',
new:
          'min-h-0 w-full shrink-0 sheet md:w-[18rem]',
```

str_replace #2 (область треда, строка ~123):
```
old:
              className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4"
new:
              className="sheet flex min-h-0 flex-1 flex-col p-4"
```

str_replace #3 (пустое состояние, строка ~163):
```
old:
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4">
new:
          <div className="sheet flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4">
```

### Verification
```bash
grep -n "sheet" src/components/chat/ChatView.tsx                    # 3 вхождения
grep -n "DEFAULT_ROOT_CLASS" src/components/chat/MessageThread.tsx  # не изменился
npx tsc --noEmit
```

Визуально `/chat`: два листа рядом, одинаковая высота и тень; при выборе канала тред остаётся
листом; пустое состояние «Выберите канал слева» — тоже лист, не провал в canvas. Открыть вкладку
«Чат» в карточке компании — там тред должен остаться как был, без второй тени.

---

## ЗАДАЧА 4: Аналитика — KPI и карточки-чарты

### Context
Экран расслоён: 5 карточек на `.elevation-hover` тень получили ещё в v2, 11 на голом
`bg-surface` — нет. Приводим вторые к первым.

**`.elevation-hover` не трогать** — это карточки, реагирующие на курсор, у них своя семантика.
**Скелетоны не трогать**: `animate-pulse` вместе с тенью читается как мигающая карточка;
скелетон повторяет геометрию, но не поверхность.

Заодно уходят четыре мёртвых `border-border/50` — модификатор альфы к `var(--border)` не
применяется, computed даёт полный токен (F-08 из отчёта). Остальные 84 места — в v2.3.

### Steps
Заменить **только** в этих местах, `border-border/50` уходит вместе с остальным классом:

| Файл | Строка | Что это |
|---|---|---|
| `LeadsAnalytics.tsx` | ~45 | KPI-плитка (`flex items-center gap-3 … px-4 py-3`) |
| `LeadsAnalytics.tsx` | ~131 | блок «нет данных» (`p-6 text-center`) |
| `LeadsAnalytics.tsx` | ~169 | карточка-чарт (`p-4`) |
| `LeadsAnalytics.tsx` | ~202 | карточка-чарт (`p-4`) |
| `TasksAnalytics.tsx` | ~42 | KPI-плитка (`flex items-center gap-3 … px-4 py-3`) |

В каждом: `rounded-xl border border-border/50 bg-surface` → `sheet`, остальные классы
сохранить в исходном порядке.

**Пропустить** `AnalyticsPage.tsx:16` и `LeadsAnalytics.tsx:129` — оба с `animate-pulse`.

Перед каждой заменой убедиться, что контейнер не лежит внутри другого `.sheet` или
`.elevation-hover`. Если лежит — **пропустить и записать в отчёт**, тень на тени хуже, чем
плоская вложенная карточка.

### Verification
```bash
grep -n "sheet" src/components/analytics/LeadsAnalytics.tsx src/components/analytics/TasksAnalytics.tsx
# → 4 и 1
grep -rn "animate-pulse" src/components/analytics/ | grep -c sheet   # → 0
npx tsc --noEmit
```

Визуально `/analytics`: все карточки одного уровня выглядят одинаково; KPI-ряд внизу — пять
листов с тенью; чарты — листы; скелетоны при загрузке остаются плоскими и не мигают тенью.

---

## ЗАДАЧА 5: Звонки и Встречи — контейнеры, но не строки списков

### Context
Замер: `/calls` — 15 листов, все плоские; `/meetings` — 1. Но в обоих разделах тем же классом
нарисованы **строки списка**, и лист им противопоказан: 15 теней подряд — это не глубина, а рябь.

Строки остаются как есть, лист получают только контейнеры-секции.

### Steps
`src/components/calls/CallLog.tsx`:

str_replace (контейнер секции, строка ~125):
```
old:
            <div className="rounded-xl border border-border bg-surface p-4">
new:
            <div className="sheet p-4">
```

**Не трогать** `CallLog.tsx:181` — там `border-border/50 … hover:border-border` и
`staggerClass(i)`: это строка лога звонка, элемент списка.

`src/components/calls/CallTracker.tsx`:

str_replace (строка ~52):
```
old:
    <div className="rounded-xl border border-border bg-surface p-4">
new:
    <div className="sheet p-4">
```

`src/components/meetings/MeetingsList.tsx`:

**Не трогать** строку ~222 (`group flex items-start gap-3 rounded-xl border px-4 py-3 … bg-surface`)
— элемент списка встреч, и строку ~163 (`bg-popover … elevation-3`) — это тост, у него своя
elevation.

Если в разделе «Встречи» после этого не остаётся ни одного контейнера-секции — так и записать
в отчёт: раздел рисуется списком без обёртки, лист для него — задача v2.3 вместе с
`ui/Card.tsx`.

### Verification
```bash
grep -n "sheet" src/components/calls/*.tsx        # → 2
grep -n "staggerClass" src/components/calls/CallLog.tsx  # строка лога не изменилась
npx tsc --noEmit
```

Визуально `/calls`: секции — листы, строки лога внутри них плоские, тень не повторяется на
каждой строке. `/meetings`: список без изменений либо одна секция-лист.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint      # ожидаются те же 4 no-explicit-any в src/lib/supabase/* — предсуществующий долг
npm run build
git diff --stat   # ожидается ~13 файлов
```

Регрессия по **семи** темам (Consulting не существует — ошибка спеки v2.1): Аура, Washi, Fuji,
Frost, Aurora, Tidal, Minimal. Страницы: `/settings`, `/chat`, `/analytics`, `/calls`.

На что смотреть:
- Frost, Aurora, Tidal — `.sheet` там идёт через блок глассморфизма: панели должны читаться
  стеклом, как соседние `.shadow-card`, а не мутной плёнкой. Если хоть где-то плёнка —
  **это блокер**, значит правка гейта не долетела до нового контекста;
- Washi (`--radius: 4px`) — листы после Задачи 1 должны быть 4px, не круглее интерфейса;
- Aura — 12px вместо прежних 18px, проверить, что не выбивается из карточек рядом;
- везде — нет теней внутри теней: в Настройках, где секция содержит подблоки, и в Аналитике.

```bash
# Никакой блок темы не должен быть задет
git diff src/app/globals.css | grep "^[+-]" | grep -c "t-frost\|t-aura\|t-washi\|t-fuji\|t-tidal\|t-aurora"
# → 0 (Задача 1 меняет только тело .sheet)
```

---

## КОММИТ

```bash
git add src/app/globals.css src/components/settings/ src/components/chat/ChatView.tsx \
        src/components/analytics/LeadsAnalytics.tsx src/components/analytics/TasksAnalytics.tsx \
        src/components/calls/
git commit -m "feat(ui): раскатка .sheet — настройки, чат, аналитика, звонки

- .sheet: --radius-l → --radius-m (Washi 4px, Aura 12px — примитив
  перестал спорить с характером темы)
- Настройки: 11 секций на .sheet
- Чат: список каналов, область треда и пустое состояние — листы;
  DEFAULT_ROOT_CLASS треда во вкладке сущности не тронут
- Аналитика: 5 KPI и карточек-чартов на .sheet, скелетоны и
  .elevation-hover оставлены как есть
- Звонки: контейнеры секций — листы, строки лога остались плоскими

Строки списков сознательно не листы: 15 теней подряд — рябь, не глубина.
Долги F-06/F-07/F-08 и тени видов «Неделя»/«Команда» — в v2.3."
```

---

## Что НЕ делать

- Не трогать `.elevation-hover` и `.shadow-card` — рабочие паттерны со своей семантикой.
- Не делать листами строки списков: `CallLog.tsx:181`, `MeetingsList.tsx:222`, строки очереди
  «Сегодня», строки таблиц.
- Не вешать `.sheet` на скелетоны (`animate-pulse`).
- Не трогать `MessageThread.tsx:82` — тред во вкладке сущности лежит внутри чужой карточки.
- Не чинить `borderRight` колонок в PipelineBoard/DeliveryPipelineBoard (F-06), не решать
  судьбу `ui/Card.tsx` (F-07), не вычищать оставшиеся 84 `border-border/NN` (F-08), не давать
  тень видам «Неделя» и «Команда» в календаре — всё это v2.3, отдельным диффом.
- Не подгонять `.sheet` под конкретную тему внутри примитива. Если тема требует иного —
  правило `.t-<тема> .sheet { … }` отдельным решением, с обоснованием в отчёте.
- Не менять токены тем и не трогать `.t-minimal`.
