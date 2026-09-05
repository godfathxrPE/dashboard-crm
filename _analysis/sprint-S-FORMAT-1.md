# Claude Code Prompt — S-FORMAT-1: форматтеры и числа в карточке сделки

**Ветка:** `fix/S-FORMAT-1` (создать через worktree-isolation от свежего `main`)
**Источник:** аудит страницы сделки 04.09.2026, находки F-01, F-02, F-03. Живёт в Claude Project (`claude/audit-deal-page-2026-09-04.md`), **в репозитории этого файла нет** — все нужные факты продублированы ниже, искать его на диске не надо.
**В `claude/decisions-lime-theme-2026-09-05.md` этот спринт назван `S-DEAL-FMT-1` — это он же.**
**Миграций нет. Схема не меняется. Перекомпоновки экрана нет** — только форматтеры, числа и две точечные правки видимости. Экран не перерисовывается, мокап не нужен.

## Почему этот спринт

Живой прод, тема `t-minimal`, viewport 1440×900, замеры через computed styles:

- В «Сводке» карточки сделки имя контакта печатается функцией `shortName()`, которая при пустом `last_name` (типовой импорт из К7) даёт « Н.» — имени человека на экране нет. Рядом «Стейкхолдеры» то же поле печатают правильно.
- В соседних строках одной карточки два формата дат: «30 сентября 2026 г.» и «04.09.2026».
- `formatBudget` печатает «2.8M ₽» — латинская M, точка как десятичный разделитель.
- `font-variant-numeric: tabular-nums` объявлен **в 2 CSS-правилах на весь продукт** — числа нигде не выровнены по разрядам.

---

## РАЗВЕДКА

Выполнить целиком, до любых правок. Если факт не совпал с ожиданием — остановиться и написать об этом, не «чинить по обстоятельствам».

```bash
# 1. Ветка чистая, baseline от main
git status --short && git log --oneline -1

# 2. Форматтер бюджета и парсер — текущее состояние
grep -n -A10 "export function formatBudget" src/lib/validators/project.ts
grep -n -A10 "export function parseBudgetInput" src/lib/validators/project.ts

# 3. Сколько мест показывают бюджет (blast radius правки формата)
grep -rl "formatBudget" --include=*.tsx --include=*.ts src | wc -l

# 4. shortName — определение и вызов
grep -n -B3 -A8 "function shortName" src/components/projects/DealSummaryCard.tsx
grep -rn "first_name" src/components/projects/DealStakeholders.tsx | head -3

# 5. Даты в рельсе сделки
grep -n "toLocaleDateString" src/components/projects/DealSummaryCard.tsx

# 6. Готовые date-форматтеры — НЕ писать новый, если подходит существующий
grep -n "^export function" src/lib/utils/dates.ts

# 7. Сигналы: рендер без вердикта (правый рельс)
grep -n -A20 "if (!showVerdict)" src/components/projects/DealSignals.tsx

# 8. Строка подсказки стадии
grep -n -B8 "Добавить подсказку для стадии" src/components/projects/ProjectStageCockpit.tsx

# 9. Что уже покрыто тестами
ls tests/unit | grep -iE "budget|format|contact|date"
```

Ожидания разведки: `formatBudget` возвращает `${(rub/1_000_000).toFixed(1)}M ₽`; `shortName` возвращает `` `${last} ${initial}.` ``; в `DealSummaryCard` два разных вызова `toLocaleDateString`; в `src/lib/utils/dates.ts` есть `formatDateShort` (d MMM, date-fns + locale ru); `formatBudget` импортируется примерно в 30 файлах.

---

## ЗАДАЧА 1: `formatBudget` — русский формат чисел

### Context

Латинская «M» и точка-разделитель в русском UI читаются как чужой формат и ломают сканирование колонок с суммами. Функция одна на продукт — правка автоматически чинит все места показа бюджета. **Это осознанно широкое изменение отображения: суммы поменяют вид на всех экранах.**

### Steps

Файл `src/lib/validators/project.ts`.

1. Заменить тело `formatBudget` (вход — копейки):
   - `>= 1 000 000 ₽` → `2,8 млн ₽` (один знак после запятой, разделитель — запятая; целое значение без дробной части: `3 млн ₽`, не `3,0 млн ₽`)
   - `>= 1 000 ₽` → `450 тыс. ₽` (без дробной части)
   - меньше → `840 ₽`
   - `null` → `—` (поведение сохранить)
   - Неразрывный пробел (` `) между числом и единицей и между единицей и `₽` — чтобы «2,8 млн ₽» не переносилось.
2. **`parseBudgetInput` научить читать то, что теперь показывается.** Сейчас он вырезает символы классом `[\s₽руб.rub]` и на вводе «2,8 млн» вернёт 280 копеек вместо 280 000 000 — то есть новый формат отображения создаёт ловушку на вводе. Добавить разбор суффиксов до `parseFloat`:
   - `млн` / `м` / `m` → ×1 000 000
   - `тыс` / `к` / `k` → ×1 000
   - суффикса нет → как раньше, рубли
   - регистр не важен, точка после `тыс` допустима
   - результат по-прежнему в копейках, `Math.round`

### Verification

```bash
npx tsc --noEmit
grep -n -A20 "export function formatBudget" src/lib/validators/project.ts
```

---

## ЗАДАЧА 2: один форматтер имени контакта

### Context

`shortName()` в `DealSummaryCard.tsx` собирает `` `${last} ${initial}.` `` и при пустом `last_name` возвращает « Н.» — фамилии нет, имя схлопнуто в инициал, на экране пусто. `DealStakeholders.tsx` то же поле печатает через `[first, last].filter(Boolean).join(' ')` и показывает «Наталья». Одни данные, два правила, одно из них теряет информацию.

### Steps

1. Создать `src/lib/utils/contact-name.ts` с двумя функциями:
   - `formatContactName(first, last)` — полное имя: `[first, last].filter(Boolean).join(' ')`, пустой результат → `'—'`
   - `formatContactNameShort(first, last)` — «Иванов И.» **только когда есть обе части**; если фамилии нет → возвращает `first` целиком; если нет имени → `last`; обе пустые → `'—'`
   - Оба принимают `string | null | undefined` и не падают на пробельных строках (`.trim()`).
2. В `src/components/projects/DealSummaryCard.tsx` удалить локальную `shortName` и звать `formatContactNameShort`. `title` у ссылки — через `formatContactName`.
3. `src/components/projects/DealStakeholders.tsx`: локальный `contactName` заменить вызовом `formatContactName` (поведение то же, но правило одно на продукт). `contactSortKey` не трогать — там своя семантика сортировки.

### Verification

```bash
npx tsc --noEmit
grep -rn "shortName" src/ || echo "OK: shortName удалён"
grep -rn "formatContactName" src/ | head
```

---

## ЗАДАЧА 3: даты и tabular-nums в рельсе сделки

### Context

В «Сводке» строка «Дедлайн» печатается длинным форматом («30 сентября 2026 г.»), а соседняя «Создана» — числовым («04.09.2026»). Плюс числа в рельсе не моноширинные: `tabular-nums` есть только в 2 правилах на весь продукт.

**Область правки — только `DealSummaryCard.tsx`.** Не трогать форматтеры срочности дедлайна: их три независимых (`deadlineUrgency` в `DashboardHome`, `getUrgency` в `DeadlineRadar`, IIFE в `ProjectCard.tsx`), они про «сколько дней осталось», а не про показ даты, и их синхронная правка — отдельная задача (`learnings.md`, раздел про форматтеры дней).

### Steps

1. В `src/components/projects/DealSummaryCard.tsx` оба показа даты привести к одному формату `dd.MM.yyyy` через `date-fns` (`format(d, 'dd.MM.yyyy')`, `locale: ru` уже используется в `src/lib/utils/dates.ts`). Если в `dates.ts` подходящего экспорта нет — добавить туда `formatDateNumeric(date)` и звать его из обоих мест, а не писать `toLocaleDateString` инлайном.
2. Добавить класс `tabular-nums` на значения строк «Бюджет», «Дедлайн», «Создана» (Tailwind-класс, в проекте уже используется в 10 файлах — новых CSS-правил не заводить).
3. Ленту активности **не** трогать: там короткий формат уместен, это не дубль.

### Verification

```bash
npx tsc --noEmit
grep -n "toLocaleDateString" src/components/projects/DealSummaryCard.tsx || echo "OK: инлайн-форматов не осталось"
grep -n "tabular-nums" src/components/projects/DealSummaryCard.tsx
```

---

## ЗАДАЧА 4: в «Здоровье» показывать только помехи

### Context

Виджет в правом рельсе перечисляет все сигналы, включая зелёные («Следующий шаг назначен», «Активность сегодня», «Срок не горит»). Цветным маркером подсвечена норма: список «что мешает» на две трети состоит из того, что не мешает. Замер живого прода — 11 цветных маркеров в рабочей зоне при разумном потолке 7–10.

### Steps

Файл `src/components/projects/DealSignals.tsx`, ветка `if (!showVerdict)` (её рендерит `DealContextRail`).

1. Разделить `signals` на проблемные (`state !== 'ok'`) и нормальные (`state === 'ok'`).
2. Рендерить списком только проблемные — с их `label`, `detail` и кнопкой `cta` (поля уже есть в типе `DealSignal`).
3. Нормальные свернуть в одну строку под списком: «N в норме» — раскрывается по клику в тот же список, что рисуется сейчас. Состояние раскрытия — локальный `useState`, ничего не персистить.
4. Если проблемных нет — показывать одну строку «Всё в норме» и свёрнутый список; `return null` при `signals.length === 0` оставить как есть.
5. Ветку `showVerdict = true` (полный виджет вне рельса) **не менять**.

### Verification

```bash
npx tsc --noEmit
npm run lint
```

Визуально в теме `minimal`: карточка «Здоровье» на сделке с просроченным дедлайном показывает 2–3 строки помех и «2 в норме» внизу.

---

## ЗАДАЧА 5: скрыть пустую подсказку стадии

### Context

Строка «Добавить подсказку для стадии «X»» висит на каждой сделке, где подсказка не заполнена, и занимает строку в самой дорогой зоне экрана — до первой строки данных сейчас уходит 623px при сгибе 900.

### Steps

Файл `src/components/projects/ProjectStageCockpit.tsx`, около строки 284.

1. Когда подсказка пустая — строку-приглашение не рендерить.
2. Возможность её добавить сохранить: пункт в меню «…» карточки сделки либо (если меню там нет) — приглашение показывать только при наведении на блок стадии. Выбрать вариант, который не требует новых компонентов; какой выбрал — написать в отчёте.
3. Заполненная подсказка отображается как сейчас, редактирование не ломать.

### Verification

```bash
npx tsc --noEmit
grep -n -B5 "Добавить подсказку для стадии" src/components/projects/ProjectStageCockpit.tsx
```

---

## ТЕСТЫ

Обязательны: задачи 1 и 2 добавляют/меняют чистые функции в `src/lib/`. Задачи 3–5 — разметка и видимость, своих тестов не требуют (но не должны ронять существующие).

**`tests/unit/format-budget.test.ts`** — поведением, не зеркалом реализации:

- `formatBudget(280_000_000)` → `2,8 млн ₽`
- `formatBudget(300_000_000)` → `3 млн ₽` (целое — без дробной части)
- `formatBudget(45_000_000)` → `450 тыс. ₽`
- `formatBudget(84_000)` → `840 ₽`
- `formatBudget(null)` → `—`
- `formatBudget(0)` → `0 ₽` (граница: ноль — не «не указано»)
- round-trip: `parseBudgetInput('2,8 млн')` → `280_000_000`; `parseBudgetInput('450 тыс.')` → `45_000_000`; `parseBudgetInput('2 800 000')` → `280_000_000`; `parseBudgetInput('2.8m')` → `280_000_000`
- `parseBudgetInput('')` → `null`; `parseBudgetInput('абв')` → `null`
- инвариант: `parseBudgetInput(formatBudget(x))` возвращает `x` для 280_000_000, 45_000_000, 84_000

**`tests/unit/contact-name.test.ts`**:

- `formatContactName('Наталья', '')` → `Наталья`
- `formatContactName('', 'Трубачев')` → `Трубачев`
- `formatContactName('Денис', 'Трубачев')` → `Денис Трубачев`
- `formatContactName('', '')` → `—`
- `formatContactNameShort('Денис', 'Трубачев')` → `Трубачев Д.`
- `formatContactNameShort('Наталья', '')` → `Наталья` (регресс F-01: раньше было « Н.»)
- `formatContactNameShort('', 'Трубачев')` → `Трубачев`
- `formatContactNameShort('  ', '  ')` → `—`

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npm run lint
python3 scripts/audit-tokens.py
npx tsc --noEmit
npm run test
npm run build
```

Плюс визуальный смок на живом деве в теме **`t-lime`** (с 05.09 это `DEFAULT_THEME`, PR #45) и беглый — в **`t-minimal`**: правки задевают общие форматтеры, а не одну тему.

1. Карточка сделки с контактом без фамилии — в «Сводке» видно имя, не « Н.».
2. Бюджет в «Сводке», в таблице сделок и на доске — «2,8 млн ₽», цифры выровнены по разрядам.
3. Дедлайн и «Создана» — один формат.
4. «Здоровье» — только помехи + строка «N в норме».
5. Сделка без подсказки стадии — строки-приглашения нет.

`crm-architect/STATUS.md` **не трогать**: его обновляет гейт при закрытии спринта.

---

## КОММИТ

Файлы перечислить явно: `git add -A` затянет чужие untracked-артефакты из `_analysis/`.

```bash
git add src/lib/validators/project.ts src/lib/utils/contact-name.ts \
        src/components/projects/DealSummaryCard.tsx \
        src/components/projects/DealStakeholders.tsx \
        src/components/projects/DealSignals.tsx \
        src/components/projects/ProjectStageCockpit.tsx \
        tests/unit/format-budget.test.ts tests/unit/contact-name.test.ts
# если ЗАДАЧА 3 добавила formatDateNumeric — добавить и src/lib/utils/dates.ts
git status --short   # в индексе только перечисленное

git commit -m "fix(deals): единые форматтеры имени, денег и дат в карточке сделки

- formatBudget: 2,8 млн ₽ вместо 2.8M ₽; parseBudgetInput понимает млн/тыс.
- formatContactName/Short: имя контакта больше не теряется при пустой фамилии (F-01)
- один формат даты в рельсе сделки + tabular-nums (F-02, F-03)
- Здоровье: только помехи, норма свёрнута
- пустая подсказка стадии не занимает строку

Тесты: format-budget (11 кейсов, включая round-trip), contact-name (8 кейсов)"
```

---

## Что НЕ входит в этот спринт

Осознанно отложено — чтобы не смешивать форматтеры с перекомпоновкой:

- Шкала кеглей. `learnings.md` прямо помечает `text-xs` (690 вхождений) и `text-sm` (302) как blast-зону — сплошной пересчёт шкалы отдельным спринтом, с мокапом.
- Вертикальный бюджет экрана (623px до первой строки данных), метрическая строка вместо KPI-карточек, линейка стадий с именами шагов, дайджест «с вашего визита», журнал с колонкой дат. Это перекомпоновка: сначала мокап `crm-ui-designer`, потом спринт.
- Touch targets < 32px (30 элементов) — вместе с токенами кнопок.
