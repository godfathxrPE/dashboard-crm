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

**Тем 7** (AUDIT C удалил `scandi`/`paper`/`sand`; **M1 добавил `t-minimal`**).
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
| `t-minimal` | «Minimal» | **`#0E7C86` (петроль)** | **Рабочая тема владельца** — визуальные правки смокать здесь первыми. M1 (2026-07-19), акцент заменён 2026-08-04. Light, **непрозрачная** (`--glass-blur: none`). Нейтральный canvas `#F6F6F7` / `#FFFFFF` (Linear/Attio class). Шрифт → Inter (`--font-app`, `font-feature-settings: 'cv11'`), заголовки 1.25rem/600 — крупного `aura-page-title` здесь нет. **Острые углы** (`--radius-l: 8px`, острее прочих ~12–14). Primary-кнопки — сплошной акцент (белый на `#0E7C86` = 4.95:1, AA). Текстовый токен `--accent-text: #0A6771` (6.58 / 6.09 / 5.48 на surface / bg / surface3). Без орбов / glass / watermark. Иконочный nav как washi/fuji |

**Удалённые темы (AUDIT C):** `scandi` / `paper` / `sand` больше не существуют.
В сторе — `LEGACY_THEMES = ['t-scandi','t-paper','t-sand']`: persisted-значение из этого
списка **или любое неизвестное → миграция на дефолт `t-aura`**.

**Дефолт — `t-aura`** (`DEFAULT_THEME`), НЕ scandi.

**Тёмные темы (glass):** `t-frost`, `t-aurora`, `t-tidal` — у них `--glass-blur` задан и
`--surface` полупрозрачный. `t-aura` — светлая, НЕ glass (`--glass-blur: none`, карточки
непрозрачны). `t-washi`/`t-fuji`/`t-minimal` — светлые непрозрачные (`--glass-blur: none`).

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

## FOUC-гард (`src/app/layout.tsx`)

1. `<html>` рендерится с дефолтным классом **`t-aura`** (+ font-variable классы).
2. Inline **parser-blocking** скрипт `id="theme-init"` до гидрации читает
   `JSON.parse(localStorage['dashboard-theme']).state.theme`; если тема входит в
   whitelist `['t-aura','t-washi','t-fuji','t-frost','t-aurora','t-tidal','t-minimal']` **и ≠ `t-aura`** —
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

**Заливка vs текст:** для текста/иконок на светлом фоне бери `*-text`-токен (тёмный вариант,
AA), для заливок (`.bg-accent`, орбы, кнопки) — базовый (яркий). В светлых темах есть
`.t-aura .bg-accent { background-color: var(--accent-text) !important }` и т.п. — заливка
солид-кнопок берёт контрастный тон.

---

## Геометрия, тени, type-токены (design-волна: S-TOKENS-GEOM + S-TYPO-TOKENS, 2026-07-21)

### Радиусы — Tailwind ↔ CSS-переменные
`--radius-s/-m/-l` задаются per-theme (`t-minimal` острее: `--radius-l: 8px` против ~12–14 у прочих). `tailwind.config.ts` → `borderRadius`:
- `rounded` = `var(--radius)` (== `--radius-m`).
- `rounded-md` **удалён** — был дублем `rounded`; в коде `rounded-md`→`rounded` (55 мест, 0 сдвига т.к. `--radius == --radius-m` во всех темах).
- `rounded-xl` = `calc(var(--radius-l) + 2px)` — **фикс инверсии** (раньше `rounded-xl` брал дефолтный TW 12px и оказывался меньше `rounded-lg`). Порядок extend-мержа с дефолтом TW важен.
- Прочие (`rounded-sm/-lg/-full`) — по CSS-переменным.

### Канон теней (elevation vs card)
- **Floating-слои** (тултипы, тема-дропдаун, emoji-picker, AssigneeSelect/Combobox, DataTable bulk-bar, drag-state/DragOverlay) → `var(--elevation-3)`; **чарт-тултипы** → `var(--elevation-2)`. `--elevation-0..3` — per-theme.
- **Карточки** → `--shadow-card` / `--shadow-card-hover` (**НЕ** elevation). Dark-inset у frost/aurora/tidal осмыслен — не трогать.
- **Грабля:** `hover:elevation-N` не работает (утилитный класс `.elevation-*` не реагирует на `hover:`-вариант) — нужен `hover:shadow-[var(--elevation-N)]`.

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
