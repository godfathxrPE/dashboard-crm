# Claude Code — S-UI-POLISH-1: точечный polish (аудит F-06ч / F-12 / F-13 / F-14 / F-16 / F-15)

**База:** ветку `feat/ui-polish-1` от `main` (`4ce56ba`). **Client-only, миграций нет.** 7 тем.
**Финальный спринт design-волны.** Пёстрый — потому **три задачи по concern, три под-коммита** в ветке (для ревьюибельности гейта). Скелетоны (F-06) и ты/вы — вынесены в бэклог, НЕ здесь.

---

## ПОЧЕМУ ТАК

Собраны быстрые механические polish-правки с предсказуемым diff. Крупное и спорное вынесено: скелетоны loading (31 файл со спиннерами — отдельный проект), copy ты/вы (через copy-calm). F-12 — НЕ тупой откат в hover (в `QueueRow` стоит осознанный `W1b-5: secondary всегда видима — была на hover, терялась`), а компромисс: видима при **hover ИЛИ фокусе** (проп `focused` уже есть).

---

## РАЗВЕДКА (выполни ПЕРВОЙ)

```
git checkout main && git pull --ff-only && git checkout -b feat/ui-polish-1
sed -n '30,70p' src/components/today/QueueRow.tsx           # secondary render + focused
sed -n '10,55p' src/components/ui/ChipFilter.tsx             # count badge render
sed -n '50,62p' src/components/dashboard/DashboardHome.tsx   # deadlineUrgency (F-16 pill)
sed -n '64,80p;218,260p' src/components/projects/PipelineBoard.tsx  # PHASE_TINT_COLOR + application (F-14)
grep -n 'text-\[10px\]\|взвеш\|weighted\|sub' src/components/projects/PipelineBoard.tsx  # F-16 взвеш size
sed -n '95,115p' src/components/contacts/ContactsTable.tsx   # company tags span (truncate)
```

---

## ЗАДАЧА 1 — Состояния и интеракция → коммит 1

### 1a. ChipFilter — убрать ложный «0» при загрузке (F-06)
`src/components/ui/ChipFilter.tsx`: добавь проп `loading?: boolean`. Пока `loading` — НЕ рендерить count-бейджи (сейчас `{opt.count != null && ...}` показывает «0», т.к. при загрузке counts=0, не null). Легитимный `0` ПОСЛЕ загрузки — показывать (это валидный результат).
Потребители пробрасывают `loading` из своей query (`isLoading`/`isPending`): `ProjectsView`/`ProjectsTable`, `ContactsTable`, `CompaniesTable`, `LeadsView`. Найди, откуда каждый берёт данные, прокинь флаг загрузки. Если у потребителя данные уже есть синхронно — можно не прокидывать (там ложного 0 нет).

### 1b. QueueRow — F-12 компромисс (hover ИЛИ фокус)
`src/components/today/QueueRow.tsx` (~строка 63-72): сейчас `secondary` всегда видима. Сделай: скрыта в покое, видима при **hover строки ИЛИ `focused`**.
- На кнопку secondary: `opacity-0 transition-opacity group-hover:opacity-100 ${focused ? 'opacity-100' : ''}` (плюс `focus-within:opacity-100` для клавиатуры внутри кнопки).
- Убедись, что корневой элемент строки имеет `group` (для `group-hover`). Обнови коммент `W1b-5` → «F-12: hover|focus, не теряется при kbd-навигации (`focused`)».
- **primary** (главное действие) не трогай — остаётся видимым.

---

## ЗАДАЧА 2 — Визуал-точечные → коммит 2

### 2a. F-13 — KPI `tabular-nums`
`DashboardHome.tsx:268` (AnimatedNumber KPI-цифра, `text-3xl font-bold`) — добавь `tabular-nums` в className (шрифт уже Onest через `--font-app`, менять не нужно). Проверь, нет ли ещё KPI-цифр без tabular-nums рядом.

### 2b. F-16 — пилюля дедлайна: капнуть >90д
`DashboardHome.tsx:52-61` (`deadlineUrgency`) и `widgets/DeadlineRadar.tsx:68-70` — перед возвратом точного `Через ${days}д` для дальних дедлайнов добавь порог: `if (days > 90) return { label: '>90д', color: ... }` (сохрани текущий цвет ветки >30/>7). Убирает «Через 389д» как визуальный выброс.

### 2c. F-16 — «взвеш. N» пропорция
`PipelineBoard.tsx:138` — sub «взвеш. …». Проверь размер (если `text-[10px]` рядом с крупной KPI-цифрой) → подними до `text-meta` (11px, токен из typo-спринта). Если уже ≥11px — не трогай.

### 2d. F-14 — тинт колонок канбана → нейтральный
`PipelineBoard.tsx` `PHASE_TINT_COLOR` (~65-69) сейчас = `var(--track-*-current)` (фазовый цвет фона колонки). Переключи **фон колонки** (`tintColor`, ~222/232) на нейтральный `var(--surface2)`. `PHASE_HEADER_COLOR` (точка-маркер, ~255 `headerColor`) — **оставь цветным** (цвет живёт на маркере, не размывает данные). Правило волны: зона данных нейтральна, цвет — на акцентах.

### 2e. truncate тегов компаний (Контакты)
`ContactsTable.tsx:~105` — `<span>{cc.company?.name}</span>` без ограничения. Добавь `inline-block max-w-[140px] truncate align-bottom` (или подходящий max-w), + `title={cc.company?.name}` для полного имени на hover.

---

## ЗАДАЧА 3 — A11y F-15 (таргеты) → коммит 3 (разведочный)

Порог: WCAG 2.2 §2.5.8 AA = **24×24 CSS px минимум** (обязательно); цель волны — **≥32px** для основных действий. Fix через **hit-area, не раздувание иконки** (dense-таблицы не ломать).

Найди интерактив под порогом:
```
grep -rnE '<button[^>]*(h-[1-5]\b|w-[1-5]\b|size-[1-5]\b|p-0\.5|p-px)' src/components --include=*.tsx
grep -rn 'onClick' src/components/ui/ChipFilter.tsx src/components/ui/SavedViewChips.tsx  # чипы-крестики
```
Для каждого <24px интерактива (крестики чипов, close-иконки, мелкие icon-buttons): добавь `min-h-[32px] min-w-[32px] inline-flex items-center justify-center` ИЛИ hit-area через увеличенный padding с отрицательным margin (чтобы визуальный размер не менялся): напр. `p-2 -m-1`. Иконку внутри не увеличивай.
**Если под-24px интерактива нет** (grep пуст) — зафиксируй «F-15: соблюдено, нарушителей нет» в отчёте, коммит 3 пустой/пропущен. НЕ раздувай — правь только реальные <24px + очевидные <32px в частых действиях.

---

## СМОК / VERIFICATION

```
npx tsc --noEmit                                   # 0
rm -rf .next
```
Live-смок (dev):
- **F-14 тинт колонок** (тема-зависимо!) — `/deals` во всех 7 темах: фон колонок нейтральный (`--surface2`), точка-маркер фазы — цветная. Данные не размыты цветом.
- **F-12** — `/` (Сегодня): secondary-кнопки скрыты в покое, появляются на hover строки и при kbd-фокусе (j/k навигация).
- **F-06 чипы** — `/deals`, `/contacts`: при перезагрузке страницы счётчики чипов НЕ мигают ложным «0» (скрыты до загрузки).
- **F-13** KPI `/overview` — цифры выровнены (tabular-nums), особенно при анимации счётчика.
- **F-16** — `/overview` дедлайны: дальний срок = «>90д» (не «Через 389д»); `взвеш.` читаемо.
- **truncate** — `/contacts`: длинные названия компаний обрезаются, title на hover.
- **F-15** — крестики чипов / close-иконки кликабельны в ≥32px зоне (если правили).
- Прочее тема-независимо — aura достаточно, кроме F-14 (×7).

---

## VERIFICATION LABELS

```
Type Safety:            NOT_VERIFIED (tsc → ожидаем PASS)
Backward Compatibility: WARNING (F-12 меняет видимость secondary; F-14 меняет фон колонок; подтвердить смоком)
RLS Coverage:           NOT_APPLICABLE (client-only)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```

---

## КОММИТ (три под-коммита в ветке, НЕ `git add -A` — грязь `_analysis/`/`.grok/`)

```
# коммит 1 (Задача 1):
git add src/components/ui/ChipFilter.tsx src/components/today/QueueRow.tsx <потребители ChipFilter>
git commit -m "fix(ui): чипы без ложного 0 при загрузке + QueueRow secondary hover|focus (S-UI-POLISH-1, F-06/F-12)"
# коммит 2 (Задача 2):
git add src/components/dashboard/DashboardHome.tsx src/components/widgets/DeadlineRadar.tsx src/components/projects/PipelineBoard.tsx src/components/contacts/ContactsTable.tsx
git commit -m "fix(ui): KPI tabular-nums + пилюля >90д + нейтральный тинт колонок + truncate тегов (S-UI-POLISH-1, F-13/F-16/F-14)"
# коммит 3 (Задача 3, если были правки):
git add <файлы с hit-area правками>
git commit -m "fix(a11y): hit-area ≥32px для мелких таргетов (S-UI-POLISH-1, F-15)"

git push -u origin feat/ui-polish-1
```
Ветку НЕ мёржи — гейт Cowork (diff + live-смок ×7 для F-14 + merge-совет).
