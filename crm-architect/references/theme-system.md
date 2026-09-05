# Theme System Reference

---

## Architecture

All colors defined via CSS Custom Properties inside theme selectors in `globals.css`.
Theme is applied as a **class on `<html>`** (documentElement): `<html class="t-aura">`
(проверено live 2026-07-12).
Zustand store (`src/lib/stores/theme-store.ts`, persist key `dashboard-theme`) persists
selection to localStorage. Экспорт: `THEMES` / `DEFAULT_THEME` / `LEGACY_THEMES`.
**(Раньше дока указывала `lib/hooks/use-theme.ts` — стор переехал в `lib/stores/theme-store.ts`.)**

**Rule**: never use Tailwind color classes (bg-gray-100, text-blue-500).
Always use `var(--token)`.

---

## Available Themes

**Тем 8** (AUDIT C удалил `scandi`/`paper`/`sand`; **M1 добавил `t-minimal`**; **S-LIME-TOKENS-1 (2026-09-05) добавил `t-lime` и сделал её дефолтом**).
Порядок = массив `THEMES` в `theme-store.ts` (он же порядок `cycleTheme`).
Свотчи/подписи — из `src/components/settings/SettingsContent.tsx`.

| Класс | Подпись пикера | Swatch | Заметка |
|-------|----------------|--------|---------|
| `t-aura` | «Аура» | `#E0A03A` | **Дефолт.** Light. Атмосферные орбы / gradient accents (`AuraOrbs`, только t-aura). Шрифт → Onest (`--font-app`) |
| `t-washi` | «和紙 Washi» | `#C23B3B` | Japanese paper, vermilion accent |
| `t-fuji` | «富士 Fuji» | `#2B5078` | Font override → IBM Plex Sans (`--font-app`); indigo Mt. Fuji palette |
| `t-frost` | «Frost» | `#6ba3be` | **Dark, glass** (полупрозрачный `--surface`) |
| `t-aurora` | «Aurora» | `#7c6bc4` | **Dark, glass** |
| `t-tidal` | «Tidal» | `#4a9e8e` | **Dark, glass** |
| `t-lime` | «Lime» | **`#C9F25A` (лайм)** | **Дефолт с 2026-09-05** (PR #45). Light, непрозрачная. **Единственная тема, где `--accent` непригоден как цвет текста**: лайм на белом = 1.29:1, поэтому `--on-accent: #14210A` (13.05:1) и `--accent-text: #336809` обязательны, а два правила в `globals.css` уводят туда 82 места с `bg-accent text-white` и 321 с `text-accent`. Фон `#FAF8F5` — **почти белый**: в этой теме карточку отделяют тень и цветные подложки зон, а не затемнённый фон, поэтому правило minimal «фон темнее белого» здесь неприменимо. `--surface2` УТОПЛЕН (темнее `--bg`), а не светлее — обратный порядок против остальных светлых тем. Материал «стекла» — сплошной `#17171C` без `backdrop-filter`. Радиусы 12/20. Шрифт → Inter, `cv11`. Актив нава — сплошная лаймовая пилюля без бокового маркера; рельс без разделителей, фон `transparent` (единое полотно с контентом). Полная выкладка решений — `claude/decisions-lime-theme-2026-09-05.md` |
| `t-minimal` | «Minimal» | **`#0E7C86` (петроль)** | **Рабочая тема владельца** — визуальные правки смокать здесь первыми. M1 (2026-07-19), акцент заменён 2026-08-04. Light, **непрозрачная** (`--glass-blur: none`). Нейтральный canvas `#ECECEF` / `#FFFFFF` (Linear/Attio class; v2 затемнил фон с `#F6F6F7` — белые карточки отделяются без тяжёлых теней). Шрифт → Inter (`--font-app`, `font-feature-settings: 'cv11'`), заголовки 1.25rem/600 — крупного `aura-page-title` здесь нет. Радиусы средние (`--radius: 10px`, `--radius-m: 10px`, `--radius-l: 14px`) — «острая» тема здесь washi (`--radius: 4px`). Primary-кнопки — сплошной акцент (белый на `#0E7C86` = 4.95:1, AA). Текстовый токен `--accent-text: #0A6771` (6.58 / 6.09 / 5.48 на surface / bg / surface3). Без орбов / glass / watermark. Иконочный nav как washi/fuji |

**Удалённые темы (AUDIT C):** `scandi` / `paper` / `sand` больше не существуют.
В сторе — `LEGACY_THEMES = ['t-scandi','t-paper','t-sand']`: persisted-значение из этого
списка **или любое неизвестное → миграция на дефолт `t-aura`**.

**Дефолт — `t-lime`** (`DEFAULT_THEME`) с 2026-09-05. До этого был `t-aura`; он остаётся валидной темой, persisted-значения всех семи прежних тем продолжают работать — миграции не было. Порядок `THEMES` = порядок `cycleTheme`, `t-lime` стоит первой.

**Тёмные темы (glass):** `t-frost`, `t-aurora`, `t-tidal` — у них `--glass-blur` задан и
`--surface` полупрозрачный. `t-aura` — светлая, НЕ glass (`--glass-blur: none`, карточки
непрозрачны). `t-washi`/`t-fuji`/`t-minimal`/`t-lime` — светлые непрозрачные (`--glass-blur: none`).

### Почему у minimal петроль, а не терракота (правило для любого нового акцента)

Терракота `#C05A2E` (hue **46°**) стояла в **15°** от семантического `--red` (hue 30°) —
интерфейс читался тревожным, а причина списывалась на вкусовщину. Фукси BIT.IIoT
(hue 1°) болела тем же: Δ30° до `--red`. Свободная зона палитры ровно одна — **175–235°**,
между `--green` (149°) и `--blue` (260°); петроль `#0E7C86` (hue **199°**) в неё попадает — Δ51° до ближайшего семантического цвета.

**Правило:** новый акцент любой темы проверять на **Δhue ≥ 30° до всех семантических
цветов** (`--red`/`--green`/`--yellow`/`--blue`), а контрасты считать
`scripts/audit-contrast.py`, не на глаз. Кандидаты и расчёты — `_analysis/minimal-accent-candidates.html`.

### `--accent` НЕ обязан быть отличим от семантики — в washi он и есть `--red`

Правило Δhue выше применимо только к **новым** акцентам. У живой темы акцент может
совпадать с семантическим цветом по замыслу: `t-washi` — `--accent: #C23B3B`, тот же
торий, что и её `--red` (Δhue = 0). Это не долг и не правится.

**Следствие: там, где цвет кодирует СМЫСЛ, берётся семантический токен, а не акцент
темы.** Доска задач (S-TASKS-BOARD-1) красит «Просрочено» и «Сегодня» — на `--accent-l`
для второй колонки в washi получалось два одинаково красных столбца подряд, и цветовое
кодирование переставало что-либо кодировать. Правильная пара — `--danger-l` / `--info-l`:
палитра каждой темы обязана держать `--red` и `--blue` раздельно, значит эти двое
различимы во всех семи.

Проверка любого нового цветового кодирования: **прогнать по всем 7 темам**, а не по
рабочей. `t-washi` (accent = red) и `t-aura` (accent = графит `#484D57`, то есть
акцент вообще не цветной) — две крайности, на которых ломаются противоположные
предположения: «акцент отличим от красного» и «акцент вообще цветной».

### Тема-селекторы целятся в data-атрибут, а не в тег

- **Навигация** — `aside[data-app-nav]` (атрибут на `layout/TextNavSidebar.tsx`).
- **Правый ящик** — `aside[data-drawer]` (атрибут на `layout/ActivityDrawer.tsx`,
  S-UI-CLARITY-1). До него drawer опознавался «от противного» —
  `.t-aura aside:not([aria-label])`: признак ломался от любого улучшения
  доступности и заодно цеплял `<aside>` списка каналов в `ChatView`.
- **PeekPanel** ни того ни другого атрибута не имеет и под тема-правила nav/drawer
  не попадает — это осознанно.

**Прецедент, из-за которого правило появилось:** голые `.t-washi aside` / `.t-fuji aside` /
`.t-aura aside` красили в sumi/индиго с `!important` ЛЮБОЙ `<aside>` — карточку компании,
чат и drawer вместе с текстом. Сузили до `[data-app-nav]` в S-FIX-CO360-1 (52 правила из
54; два оставшихся — про виджеты внутри ящика, `.t-aura aside:not([data-app-nav]) .bracket`,
и они работают верно).

**Text-nav shell:** только `t-aura` (`isAura` в `layout/TextNavSidebar.tsx` — иконки nav
прячутся CSS `.t-aura .nav-ico`, остаётся текстовый капс-нав + `layout/ContentHeader.tsx`).
Остальные 6 тем — icon-`TextNavSidebar` (иконки видны). *(Файлы переименованы:
`ScandiSidebar → TextNavSidebar`, `ScandiContentHeader → ContentHeader`; отдельные
`Sidebar.tsx`/`Header.tsx` удалены в AUDIT C — единый shell.)*

---

### Токены зон (`--zone-*`) — общие для всех тем

Введены S-LIME-TOKENS-1 под зонирование карточки сделки («Работа / Риски / Контекст»,
макет «Сделка v2»). Живут в `:root`, выводятся из семантики АКТИВНОЙ темы через `color-mix`,
поэтому пер-темных хардкодов не требуют:

```css
--zone-base:           color-mix(in srgb, var(--text) 2%, var(--bg));
--zone-work:           color-mix(in srgb, var(--accent) 14%, var(--zone-base));
--zone-ctx:            color-mix(in srgb, var(--text)    6%, var(--zone-base));
--zone-risk-{ok,attention,rotting}: те же 12 / 14 / 10 % от --green / --yellow / --red;
```

**База — `--bg` + 2% `--text`, а не поверхность.** `--surface` в glass-темах полупрозрачен
(`rgba(255,255,255,0.07)`) и `color-mix` отдал бы зоны с alpha ≈ 0.49. `--popover`
непрозрачен, но при почти белом `--bg` (как в `t-lime`) даёт базу СВЕТЛЕЕ фона — зона
перестаёт читаться как подложка. `--text` и `--bg` непрозрачны во всех восьми темах, и в
тёмных подмес светлых чернил в тёмный фон уводит зону в ту же сторону — «на тон глубже
фона». Сверка с макетом: `work #EFF4DC` против `#EDF1DC`, `ctx #E8E7E4` против `#ECE8E0`.

Состояние health переключается классом на контейнере зоны: `.h-attention` / `.h-rotting`
переопределяют `--h-zone` / `--h-ring` / `--h-chip-ink`. Потребителей у токенов пока нет —
появятся в S-DEAL-ZONES-1.

### ⚠️ Примитив `.entity-tile`

Плитка сущности в шапке карточки записи (компания, сделка, контакт). База в
`@layer components`: `--accent-l` + `--accent-text`. Тема может перевернуть приём — в
`t-lime` это тёмная плитка с лаймовой иконкой (`--glass-bg` + `--accent`, 13.89:1), как в
макете. **Цвет иконки не задаётся на самой иконке**: она наследует `color` плитки, поэтому
переворот делается одним правилом, а не обходом потребителей.

### ⛔ Актив нава: как он на самом деле собирается (и долг по тёмным темам)

Каскад, который надо держать в голове при любой правке навигации (закреплён в
`audit-contrast.py` после #49):

- **рельс** — `bg-surface` на `<aside data-app-nav>`; washi/fuji/minimal/lime перебивают;
- **пилюля** — layered-дефолт `.nav-active { background: var(--accent-l) }`.
  `--sidebar-indicator` **компонент не читает**: его разворачивают только собственные
  unlayered-правила `t-lime` и `t-minimal`. У остальных объявленный непрозрачный
  indicator просто не применяется;
- **текст и иконка** — утилита `text-[var(--sidebar-active-text)]` в разметке; она из
  `@layer utilities` и бьёт layered `.nav-active { color: var(--accent) }`. Исключение —
  washi/fuji: там цвет задан компонентным правилом с `!important`, токен не участвует,
  а фона нет вовсе (`background: transparent !important`).

**Носитель состояния у каждой темы свой — это и есть ответ на «как опознаётся актив»:**

| тема | border-left 3px | пилюля | текст актив/неактив | чем опознаётся |
|---|---|---|---|---|
| `t-lime` | `none` | `--sidebar-indicator`, сплошной лайм | 2.66 | пилюля + текст |
| `t-minimal` | `transparent` | белая пилюля + рамка + тень | 2.18 | пилюля + текст |
| `t-aura` | `none` | `--accent-l` | 1.72 | текст |
| `t-washi` | `none !important` | `transparent` | 1.77 | текст + скобки 「 」 |
| `t-fuji` | `none !important` | `transparent` | **1.09** | **только уголки ↙↗, 2.99:1** |
| `t-frost` | **есть, `--accent`** | `--accent-l` | 1.12 | **бордер, 4.96:1** |
| `t-aurora` | **есть, `--accent`** | `--accent-l` | 1.13 | **бордер, 4.59:1** |
| `t-tidal` | **есть, `--accent`** | `--accent-l` | 1.18 | **бордер, 9.97:1** |

**🟡 Долг в скрипте, не в темах.** `audit-contrast.py` считает носителем только подложку,
поэтому даёт три ложных FAIL у тёмных тем, где работает бордер. Условие должно быть
дизъюнкцией: текст различим по светлоте ИЛИ пилюля ≥3:1 ИЛИ бордер ≥3:1. Заготовка —
`_analysis/fix-NAV-CARRIER.md`. **В CI скрипт заводить после этой правки.**

**Подложка в тёмной теме носителем быть не может — это посчитано, а не мнение.** Чтобы
пилюля дала 3:1 к рельсу frost, нужна альфа ≈0.34; акцентный текст на такой пилюле падает
до 2.37. Требования взаимно исключаются, поэтому тёмные темы и решают состояние бордером.

**Настоящая слабость одна — `t-fuji`:** ни бордера, ни пилюли, текст 1.09, всё держится на
уголках `::before/::after` с 2.99:1. Отдельная задача, приоритет низкий.

## FOUC-гард (`src/app/layout.tsx`)

1. `<html>` рендерится с дефолтным классом **`t-lime`** (+ font-variable классы).
2. Inline **parser-blocking** скрипт `id="theme-init"` до гидрации читает
   `JSON.parse(localStorage['dashboard-theme']).state.theme`; если тема входит в
   whitelist `['t-lime','t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal','t-minimal']` **и ≠ `t-lime`** —
   свопает класс на `<html>`.
3. Неизвестное / legacy (`t-scandi`/`t-paper`/`t-sand`) значение → класс остаётся
   `t-aura` (миграция persisted-значения на дефолт).

`scandi-dark` вариант через `@media (prefers-color-scheme: dark)` **УДАЛЁН** — системного
dark-варианта у дефолта больше нет; тёмные темы — отдельные классы frost/aurora/tidal.

---

## CSS Variable Map

Token contexts: `:root` (общие дефолты, `--font-app: var(--font-manrope)`) + **7 тема-селекторов**
(scandi-dark-блока нет). Реальные имена токенов в `globals.css` (НЕ `--color-*`):

```css
/* Поверхности */
--bg            /* фон страницы */
--surface       /* карточки/виджеты */
--surface2      /* вложенные поверхности */
--surface3      /* ещё глубже / hover */

/* Текст (все *-text-варианты ≥4.5:1, проверено scripts/audit-contrast.py) */
--text          /* основной */
--text-dim      /* приглушённый */
--text-mute     /* самый тихий */

/* Границы */
--border
--border2
--border-input  /* ≥3:1 к surface (AUDIT P2) */

/* Акцент + семантика (заливка) и их *-text (для текста/иконок) */
--accent  --accent-l  --accent-l2  --accent-text
--green   --green-l   --green-text
--red     --red-l     --red-text
--blue    --blue-l    --blue-text
--yellow  --yellow-l  --yellow-text
--purple  --purple-l  --purple-text
--teal-text

/* Семантика состояния (S-UI-SEMANTIC-1) — alias на палитру, объявлены ОДНИМ блоком
   :root в конце globals.css. В темах их не переопределяют: тема правит палитру,
   семантика едет следом (класс темы на <html> = том же элементе, что :root). */
--danger   --danger-l   --danger-text    /* → --red   */
--success  --success-l  --success-text   /* → --green  */
--warning  --warning-l  --warning-text   /* → --yellow */
--info     --info-l     --info-text      /* → --blue   */

/* Радиусы / тени / стекло / анимация */
--radius --radius-s --radius-m --radius-l
--shadow-xs --shadow-sm --shadow-md --shadow-lg  --shadow-card --shadow-card-hover
--elevation-0..3
--glass-bg  --glass-border  --glass-blur  --glass-inset
--ease-out  --ease-spring  --duration-fast  --duration-normal
```

**Палитра vs семантика:** `--red` отвечает «какой цвет», `--danger` — «что это значит».
Цвет состояния операции (ошибка, успех, просрочка) берём семантическим токеном; красный
приоритет задачи или стадия сделки — палитровым, это домен, а не danger. Токен, на который
может сослаться `src/components/**`, **нельзя объявлять внутри `.t-*`**: в остальных шести
темах его не будет, и `color` тихо унаследует чужой цвет, а `border-*` исчезнет совсем
(learnings, S-UI-SEMANTIC-1).

**Альфа-модификаторы Tailwind.** Цвета в `tailwind.config.ts` отдаются функцией-значением с
`opacityValue` (v2.3): без модификатора — чистый `var(--x)`, с модификатором —
`color-mix(in srgb, var(--x) calc(N * 100%), transparent)`. До этой правки цвета объявлялись
строкой `'var(--x)'`, и Tailwind **не генерировал класс вовсе**: 309 мест в коде не давали ни
фона, ни цвета рамки — блоки ошибок читались как обычный текст в серой рамке, подсветка
drop-зон не появлялась. Два следствия, обязательны к соблюдению:

1. **`-l`-токен + модификатор альфы — запрещённый паттерн.** `--accent-l`, `--red-l` и прочие
   уже полупрозрачны (8–15%); модификатор даёт процент от процента — `bg-accent-l/20` в Minimal
   это альфа **0.0157**, не видно ни в одной из семи тем. Активное состояние (drag-over,
   выбранная опция, hover поверх выбранного) → **`--accent-l2`** (16–25%, объявлен во всех
   темах); спокойная подложка → `-l` без модификатора; нужна точная альфа → обычный токен
   (`bg-accent/10`). Модификаторы на обычных токенах работают правильно и трогать их не нужно.
2. **Функция обязана отдавать чистый `var()` не только при `opacityValue === undefined`.**
   Tailwind зовёт её и для базовой утилиты, подставляя `var(--tw-*-opacity)`; без проверки
   `opacityValue.startsWith('var(')` в `color-mix` уедут **все** цветовые утилиты, включая
   `.border-border`, на котором держится плотность бордеров v2.

**Заливка vs текст:** для текста/иконок на светлом фоне бери `*-text`-токен (тёмный вариант,
AA), для заливок (`.bg-accent`, орбы, кнопки) — базовый (яркий). В светлых темах есть
`.t-aura .bg-accent { background-color: var(--accent-text) !important }` и т.п. — заливка
солид-кнопок берёт контрастный тон.

---

## Контракт токенов (S-TOKENS-CONTRACT-1, 2026-08-23)

Правило «никаких хардкод-цветов» до этого спринта существовало только как текст памяти:
проверялось глазами и умирало вместе с вниманием. Дефект Fuji показал цену — позиционный
селектор `.t-fuji .flex.gap-1.border-b > button:nth-child(5)` прятал пятую вкладку ЛЮБОЙ
полосы с теми же классами, месяц никто не замечал, нашлось случайно. Теперь у контракта
есть сторож: **`scripts/audit-tokens.py`**, шаг `Token contract` в `.github/workflows/ci.yml`
(отдельным шагом, не внутри `npm run lint` — чтобы в CI было видно, что именно сломано).

### 1. Карта: что каким токеном красится

| Задача | Токен | Не брать |
|---|---|---|
| Фон страницы | `--bg` | |
| Карточка, виджет, лист | `--surface` (класс `.sheet`) | ручную сборку `bg-surface border border-border rounded-xl` |
| Вложенная поверхность | `--surface2` | |
| Ещё глубже / hover-подложка | `--surface3` | |
| Основной текст | `--text` | |
| Приглушённый / тихий | `--text-dim` / `--text-mute` | `opacity` на тексте |
| Обычная граница | `--border` | |
| Усиленная граница | `--border2` | |
| Граница поля ввода | `--border-input` (≥3:1 к surface) | |
| **Смысл** операции: ошибка / успех / просрочка | `--danger` / `--success` / `--warning` / `--info` | палитровый `--red` и т.п. |
| **Цвет** как домен: приоритет задачи, стадия сделки | `--red` / `--green` / `--yellow` / `--blue` / `--purple` | семантический алиас |
| Текст и иконки на светлом фоне | `*-text` (`--danger-text`, `--accent-text`) | базовый яркий тон |
| Заливка (`.bg-accent`, кнопки, орбы) | базовый тон | `*-text` |
| Спокойная подложка (уже полупрозрачна, 8–15%) | `-l` **без модификатора альфы** | `bg-accent-l/20` — процент от процента |
| Активное состояние (drag-over, выбранная опция) | `-l2` (16–25%, есть во всех семи темах) | |
| Точная альфа | модификатор на **обычном** токене: `bg-accent/10` | |
| Тень карточки | `--shadow-card` / `--shadow-card-hover` | |
| Floating-слой (поповер, модалка, дропдаун) | `--elevation-3` | |
| Тултип чарта | `--elevation-2` | |
| Шрифт темы | `--font-app` (объявляется в блоке темы) | прямой `font-family` на корне темы |

Токен, на который может сослаться `src/components/**`, **нельзя объявлять внутри `.t-*`** —
в остальных шести темах его не будет (S-UI-SEMANTIC-1).

### 2. Запреты и кто их проверяет

| # | Запрет | Проверяет |
|---|---|---|
| R1 | хардкод `#rrggbb`/`#rgb` в `src/**/*.{ts,tsx}` | `audit-tokens.py` в CI |
| R2 | Tailwind-палитра (`bg-gray-100`, `text-blue-600`, `from-rose-400`…) | `audit-tokens.py` в CI |
| R3 | альфа-модификатор на `-l`/`-l2`-токене | `audit-tokens.py` в CI |
| R4 | `hover:elevation-N` (утилита `elevation` на `hover:` не реагирует) | `audit-tokens.py` в CI |
| R5 | ручная сборка листа вместо `.sheet` | `audit-tokens.py` в CI |
| R6 | позиционный `:nth-child` в тема-фиксе без якоря `[data-*]` | `audit-tokens.py` в CI |
| R7 | прямой `font-family` на **корне** темы (`.t-fuji { font-family: … }`) | `audit-tokens.py` в CI |
| — | контраст ≥4.5:1 текста, ≥3:1 границы поля | `scripts/audit-contrast.py`, вручную |
| — | `opacity` на тексте вместо `*-dim`/`*-mute` | только глазами |
| — | объявление компонентного токена внутри `.t-*` | только глазами |
| — | `rgba()` вместо токена в тема-блоке | только глазами |

Границы двух CSS-правил, чтобы их не «доводили до идеала» и не отключали:

- **R6** ловит селектор, где есть `.t-`, есть `:nth-child(`/`:nth-of-type(` и **нет** `[data-`.
  Номер позиции законен только внутри именованного якоря: `.t-fuji [data-activity-tabs] >
  button:nth-child(5)` привязан к конкретной полосе, а тот же селектор по классам — к любой.
- **R7** проверяет именно **корень** темы (`.t-fuji`, `html.t-aura`), потому что там прямой
  `font-family` перебивает `html { font-family: var(--font-app) }` и ломает единственную точку
  смены шрифта. Скоупленное `.t-aura h1 { font-family: Unbounded }` — законный дисплейный
  шрифт заголовков, корень он не перебивает и не ловится намеренно.

Разбор CSS у сторожа **по скобкам, а не построчно**: селектор бывает многострочным
(`.t-aura h1,\n.t-aura .aura-page-title {`), и построчный греп такой случай разрывает.
Комментарии в `.ts/.tsx` гасятся перед сканом — hex, живущий только в комментарии
(`WeekLanes`, `BoardColumn`), в реестр вносить не нужно.

### 3. Реестр законных исключений

Тот же список — в `ALLOWLIST` внутри `scripts/audit-tokens.py`, **два места держать
синхронно**. Запись — не «отключить проверку», а обоснование: если цвет описывает
интерфейс, а не данные/чужую тему, его надо чинить, а не вносить сюда.

| Файл | Правило | Почему хардкод законный |
|---|---|---|
| `src/lib/constants/themes.ts` | R1 | свотчи тем: цвет ЧУЖОЙ темы токеном текущей не выразить, `getComputedStyle` отдаёт только активную |
| `src/components/layout/TextNavSidebar.tsx` | R1 | `sectionColor` — словарь цветов разделов, единый для всех семи тем |
| `src/components/projects/PipelineBoard.tsx` | R1 | канжи фаз Washi — тема-специфичный словарь |
| `src/components/dashboard/DashboardHome.tsx` | R1 | `WASHI_KPI_META` — тот же словарь канжи, рендерится только при `t-washi` |
| `src/components/widgets/TasksSidebar.tsx` | R1 | `WASHI_KPI` — то же |
| `src/components/analytics/Charts.tsx` | R1 | `AURA_DONUT`/`AURA_PHASE` — палитра **данных**; плюс `floodColor` aura-glow: SVG-фильтр, `var()` в presentation-атрибуте не гарантирован |
| `src/components/analytics/CallsChart.tsx` | R1 | `AURA_DONE`/`AURA_PENDING` — серии чарта |
| `src/components/shared/StageTimeRing.tsx` | R1 | `#000` — стоп CSS-маски, важен только альфой, цветом на экране не становится |
| `src/lib/constants/chat-avatars.ts` | R1 | цвет = ИДЕНТИЧНОСТЬ канала, аватар опознаётся одинаково в любой теме |
| `src/lib/watermark-gradients.ts` | R1 | градиенты водяных знаков виджетов — декоративная палитра |

### 4. Свотчи тем — один источник

`src/lib/constants/themes.ts` → `THEME_SWATCH: Record<Theme, string>`. Значение = `--accent`
блока темы в `globals.css`. Рантайм-чтение переменной невозможно: свотч рисуется для **не
активной** темы.

**Осознанное исключение — aura.** У неё `--accent: #484D57` (графит, акцент намеренно не
цветной) и `--accent-text: #343840` (тоже графит) — серый кружок в списке тем неразличим.
Свотч берётся из `--aura-orb-2` секций `leads`/`projects` (`224, 160, 58` = `#E0A03A`) —
янтарь атмосферы, которым аура реально светится.

До спринта цвет был описан дважды и **расходился**: frost `#5b8aff` против `#6ba3be`,
aurora `#a060ff` против `#7c6bc4`, tidal `#48b890` против `#4a9e8e` — три темы из семи
в настройках были показаны не тем цветом, которым красят интерфейс.

### 5. Ориентир: формула плотного спокойного UI (бенчмарк Twenty)

Из `improvements/CRMs/ai-native-deals-2026-08-23.md` §3. **Ориентир, не задача** — приведение
оппортуническое, спринтом, который зайдёт в соответствующий слой.

- **3–4 серых текстовых роли одной шкалы.** У нас три — `--text`/`--text-dim`/`--text-mute`,
  формуле соответствует.
- **Бейдж = фон шаг 3 / текст шаг 11 одной шкалы.** У нас бейджи собираются вручную и
  к формуле не приведены — открытый пункт.
- **Тени только на оверлеях**, карточки разделяются границей и фоном (перепад ~1% светлоты).
- **Иконки 14/16 со stroke 2** в рабочей зоне — у Twenty это токен, у нас соглашение.
- База 13px, ровно три веса (400/500/600), границы светлее любого текста.

### 6. Что спринт НЕ делал и почему

- **`globals.css` (2111 строк) не резан.** Швов нет; разрезание = проектирование
  тема-системы заново + проверка в семи темах глазами. Декомпозиция оппортуническая:
  спринт, заходящий в тему, выносит свой слой.
- **103 `!important` не сняты.** Сосредоточены в тема-блоках (Fuji 47, Aura 32, Washi 30) и
  держат перекрытие утилитарных классов Tailwind — это способ работы тем, а не мусор. Долг
  «токен `on-accent` вместо `!important` на кнопках» остаётся отдельной задачей.
- **Зачистки не было, потому что чистить нечего.** R2–R5 на момент внедрения сторожа дают
  ноль: закрыто волнами S-UI-SEMANTIC-1, S-TOKENS-GEOM, v2.1–v2.2. Обещанные STATUS-ом
  «309 классов вхолостую» — уже исправлены.

---

## Геометрия, тени, type-токены (design-волна: S-TOKENS-GEOM + S-TYPO-TOKENS, 2026-07-21)

### Радиусы — Tailwind ↔ CSS-переменные
`--radius-s/-m/-l` задаются per-theme. Разброс `--radius-l`: washi 8, tidal/aurora 12, fuji/minimal 14, frost 16, aura 18. Острая тема — washi (`--radius: 4px`), не minimal. `tailwind.config.ts` → `borderRadius`:
- `rounded` = `var(--radius)` (== `--radius-m`).
- `rounded-md` **удалён** — был дублем `rounded`; в коде `rounded-md`→`rounded` (55 мест, 0 сдвига т.к. `--radius == --radius-m` во всех темах).
- `rounded-xl` = `calc(var(--radius-l) + 2px)` — **фикс инверсии** (раньше `rounded-xl` брал дефолтный TW 12px и оказывался меньше `rounded-lg`). Порядок extend-мержа с дефолтом TW важен.
- Прочие (`rounded-sm/-lg/-full`) — по CSS-переменным.

### Канон теней (elevation vs card)
- **Floating-слои** (тултипы, тема-дропдаун, emoji-picker, AssigneeSelect/Combobox, DataTable bulk-bar, drag-state/DragOverlay) → `var(--elevation-3)`; **чарт-тултипы** → `var(--elevation-2)`. `--elevation-0..3` — per-theme.
- **Карточки** → `--shadow-card` / `--shadow-card-hover` (**НЕ** elevation). Dark-inset у frost/aurora/tidal осмыслен — не трогать.
- **Грабля:** `hover:elevation-N` не работает (утилитный класс `.elevation-*` не реагирует на `hover:`-вариант) — нужен `hover:shadow-[var(--elevation-N)]`.
- **Лист** → `.sheet` (`@layer components`): `--surface` + `--border` + `--radius-m` + `--shadow-card`.
  Единственный примитив подложки; `ui/Card.tsx` удалён 2026-08-21 как мёртвый (не импортировался нигде).
  **Не писать** `bg-surface border border-border rounded-xl` руками — ровно это чинили в v2.1–v2.2
  (≈300 мест мимо любых токенов тени; правка токенов темы доставала до 28 элементов из сотен).
  **В стеклянных темах** (`t-frost`/`t-aurora`/`t-tidal`) `.sheet` обязан стоять в блоке Dark-theme
  glassmorphism рядом с `.shadow-card`: там `--surface` полупрозрачен и лист держится на
  `backdrop-filter`, иначе читается грязным пятном.
  Иерархия: `.sheet` — статичная подложка · `.elevation-hover` — карточка под курсором ·
  `.shadow-card` — карточка доски.

### fontSize-токены (a11y-scalable, rem)
`tailwind.config.ts` → `fontSize`: `meta = 0.6875rem` (11px), `body = 0.8125rem` (13px). **Только size, без lineHeight** (leading наследуется как раньше → 0 вертикального сдвига).
- `text-meta` — подписи / мета / второстепенное (заменил `text-[11px]`, 84 места).
  **Грабля:** тема-контраст-фиксы washi/fuji в `globals.css` таргетят сам класс (`.t-washi aside .text-meta`, `.t-fuji …`) — при переименовании правь селекторы **синхронно**, иначе контраст нав-подписей молча откатывается к WCAG-fail.
- `text-body` — осознанный body **примитивов** (Card/Table/Button/Input + ProjectDetail и др.), заменил `text-[13px]` и `text-[0.8125rem]` (27 мест).
- **НЕ тронуты:** `text-[10px]` (badge ×5), массовые `text-xs` (12px, 690×) и `text-sm` (14px, 302×) — де-факто body/second.

---

## Fonts — только через `--font-app`

`:root` задаёт `--font-app: var(--font-manrope)`, `html { font-family: var(--font-app), … }`.
Темы **переопределяют переменную**, а не `font-family` напрямую:

- `t-aura` → Onest (`--font-app: var(--font-onest)`)
- `t-fuji` → IBM Plex Sans (`--font-app: var(--font-plex)`)
- `t-minimal` → Inter (`--font-app: var(--font-inter)`)
- остальные — наследуют дефолт (Manrope)

В `layout.tsx` теперь 5 next/font: Manrope, IBM Plex, Onest, Unbounded, **Inter**.

Прямой `font-family` на тема-селекторе перебивает `html` и ломает каскад — **запрещён**
(visual-audit P0, 2026-07-12). `body` шрифт не задаёт.

---

## Dark-glass модалки — `[data-modal]` оверрайды

У тёмных стеклянных тем `--surface` полупрозрачный, поэтому модалке нужна **сплошная**
приподнятая поверхность (иначе сквозь неё просвечивает фон/орбы). `[data-modal]` покрывает
и диалоги, и CommandPalette (тот же атрибут). `backdrop-filter` вешается на ОВЕРЛЕЙ, не на
`[data-modal]`:

```css
.t-frost  [data-modal] { background: #1e2233 !important; }
.t-aurora [data-modal] { background: #1a1e2c !important; }
.t-tidal  [data-modal] { background: #102119 !important; }
.t-frost  [data-modal-overlay],
.t-aurora [data-modal-overlay],
.t-tidal  [data-modal-overlay] { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
```

(Светлые темы aura/washi/fuji своих `[data-modal]`-оверрайдов не требуют — их surface
непрозрачен.)

---

## Semantic Data-Attributes (sprint 2026-06-12)

Тема-правила не привязаны к структурным Tailwind-классам — стили вешать на data-атрибуты:

| Атрибут | Помечает | Где |
|---|---|---|
| `data-modal-overlay` | Оверлей модалок (`="palette"` — CommandPalette/Hotkeys: blur 8px, rgba(0,0,0,.5)) | 11 оверлеев |
| `data-modal` | Контейнер диалога | все role="dialog" + Hotkeys panel |
| `data-stats-grid` | KPI-сетки 4 колонки | DashboardHome, PipelineBoard, ProjectDetail |
| `data-card` | Карточки-виджеты | CallLog, StatsWidget, mini-cards ProjectDetail, Migration*, WeeklyReview |
| `data-timeline-scroll` | Скролл-зоны таймлайнов (320px; `="compact"` — 280px) | ProjectDetail, DashboardHome |
| `data-kanban-empty` | Пустая колонка Kanban | PipelineBoard, LeadsView |
| `data-tag` | Мелкие теги | TaskCard, Contact/CompanyDetail, DeadlineRadar |

Гочта: легаси-селектор `.grid.grid-cols-4` умер молча, когда kanban перешёл на динамические
колонки (sprint 1.5) — правила удалены.

> **Декор-скобки `「 」` убраны глобально** (Sprint UI-D1, реликт удалённой scandi): класс
> `.bracket` и bracket-псевдоэлементы на карточках больше не используются.

---

## Z-Index Hierarchy

> **Источник истины — `docs/Z-INDEX.md` в репозитории** (заведён 2026-08-02, спринт
> `S-R2-ZINDEX-1`). Таблица там собрана перечислением по коду, а не по памяти, и
> дублируется комментарием в `src/app/globals.css` над правилами `[data-modal*]`.
> Ниже — краткая выжимка; при расхождении верен репозиторий.

**Прежняя версия этой таблицы врала в четырёх строках** (исправлено 2026-08-02, значения
сверены `getComputedStyle` и перечислением по коду):

| Было в этой доке | На самом деле |
|---|---|
| Sidebar 20 | **30** (`TextNavSidebar.tsx:170`) |
| ActivityDrawer 30 | **10**, и это inline `zIndex`, а не Tailwind-класс (`ActivityDrawer.tsx:40`) |
| ContentHeader «context z-[100]» | **35** — было `z-[100]`, чинилось как дефект, см. ниже |
| Toast (sonner) 1100 | 1100 — это **порталы `Combobox` / `ChatEmojiPicker`**; sonner держит свой слой, значение задаёт библиотека |

```
Слой                       z-index   Кто
──────────────────────────────────────────────────────────────────
Контент страниц            auto/0–2  карточки, таблицы, sticky-шапка таблицы
Ганта-слои, активный nav   10        + ActivityDrawer (inline zIndex, только t-aura)
Сайдбар                    30        TextNavSidebar
Шапка контента             35        ContentHeader  ← полоса 30–40 зарезервирована под неё
PeekPanel                  40        предпросмотр записи (Sprint W2d)
Поповеры/тултипы/тосты     50        меню внутри страниц, тултипы Ганта
Палитра, горячие клавиши   (60)      КЛАСС 60, ФАКТИЧЕСКИ 999/1000 — см. ниже
Оверлей модалки            999       [data-modal-overlay]
Тело модалки               1000      [data-modal]
Порталы Combobox/emoji     1100      use-anchored-rect (фикс клипа overflow модалки)
EventReminder              9000      layout/EventReminder.tsx
Дропдауны шапки, bulk-бар  9999      внутри своих stacking-контекстов
```

**Класс в JSX ≠ вычисленный слой.** Unscoped `[data-modal-overlay] { z-index: 999 }` /
`[data-modal] { z-index: 1000 }` в `globals.css` перебивают Tailwind `z-50`/`z-[60]` у тех же
элементов (равная специфичность, правило ниже по файлу). Поэтому `CommandPalette` и `Hotkeys`,
несущие `data-modal*`, лежат на 999/1000, а не на 60, хотя в JSX написано `z-[60]`.
**Проверять `getComputedStyle`, а не grep по классам** — на этом построен весь список выше.

**`relative z-*` создаёт stacking context.** Внутренние `z-[9999]` дропдаунов шапки работают
только внутри неё; наружу торчит число самой шапки. Поэтому дропдауну не нужно, чтобы шапка
была выше модалок — достаточно, чтобы она была выше контента.

**Панель без оверлея обязана быть выше всего, что ловит клики.** `PeekPanel` закрывается по
клику снаружи (`handlePointerDown`); любой элемент поверх её шапки превращает клик по ней в
клик «мимо» — панель закроется, а действие не выполнится. Обратная сторона осознанная: пока
панель открыта, кнопки шапки в её полосе (440 px у правого края) недоступны.

**Инцидент 2026-08-02.** `ContentHeader` стоял `z-[100]` и лежал поверх шапки `PeekPanel`
(`z-40`) на всех пяти страницах с peek (`/companies`, `/contacts`, `/deals`, `/leads`,
`/tasks`): кликабельны были верхние ~12 px, клик по «Открыть полностью» уходил в топбар,
`target` оказывался вне `panelRef` — и панель закрывалась вместо навигации. Диагностировано
`document.elementsFromPoint` по центру ссылки: стек элементов показал топбар выше `<a>`.
Приём годится для любого «клик не работает, но элемент видно»; парный приём — обёртка
`history.pushState`/`replaceState` логом: пустой лог означает, что навигации не было вовсе,
и искать надо не в реакции на URL. Модалки тем же `z-[100]` затронуты **не были** — вопреки
ожиданию от чтения JSX, потому что их слой задаётся правилами из `globals.css`.

**Каскад-грабли:** unlayered-правило бьёт `@layer` независимо от порядка/специфичности —
тема-оверрайды держать вне `@layer`, иначе layered-компонентные правила их перебьют.

---

## Chevron Pipeline Colors

Chevron-пайплайн на ProjectDetail использует **solid opaque hex** per theme (НЕ rgba).
**Почему solid:** rgba-прозрачность просвечивала фон на тёмных темах.
Токены `--track-*-done` / `--track-*-current` (пастельная заливка + насыщенный current)
задаются в каждом тема-селекторе. См. также StackedPipeline на `stage_id` (§ architecture).

---

## Visual-audit rules (P0/P1/P2, 2026-07-12)

1. **Информативный текст никогда не приглушать через opacity.** Opacity на контейнерах
   с текстом — только ≥0.75 (drag-состояния ок). Приглушение выражать токеном (`--text-mute`)
   и фоном (`--surface2/3`). Прецедент: StackedPipeline future-треки (`opacity-50` давал 1.7:1).

2. **`--border-input` ≥3:1 к surface** (AUDIT P2, 11 контекстов): сырые input/select/textarea
   переключены на element-driven границу; `--border`/`--border2` — только декоративные/
   info-only разделители.

3. **`--yellow-text` обязателен в тёмных темах** (frost/aurora/tidal), иначе наследуется
   тусклый `:root`-жёлтый (2.3–3.8:1 на тёмном).

4. **Known debt: `!important` на кнопках тёмных тем.** frost/aurora/tidal перекрашивают текст
   solid-кнопок в цвет фона темы через `!important` (прагматика, как в aura). В идеале —
   токен `on-accent`; отдельная задача.

5. **Шрифты — только через `--font-app`** (см. раздел «Fonts» выше). Прямой `font-family`
   на тема-селекторе запрещён.
