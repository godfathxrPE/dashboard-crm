# Sprint — Minimal v2: глубина и контраст темы

Тема `.t-minimal` в `src/app/globals.css`. Задача: усилить видимость, контраст,
глубину и тени, **не меняя концепцию** — нейтральный canvas, один петроль-акцент
(`#0E7C86`), дисциплина, никакого декора. Палитра акцента и семантика цветов
НЕ трогаются: меняются поверхности, бордеры, тени, и добавляются рамки тинтам.

Дизайн-решения приняты в чате и утверждены. Не переизобретать значения —
применить как указано.

---

## РАЗВЕДКА

```bash
# 1. Убедиться, что блок темы на месте и не переписан
grep -n "t-minimal" src/app/globals.css | head -30

# 2. Текущие значения токенов, которые будем менять
sed -n '/^\.t-minimal {/,/^}/p' src/app/globals.css

# 3. Проверить, что правило .nav-active существует в ожидаемом виде
grep -n -A 8 "t-minimal aside\[data-app-nav\] .nav-active" src/app/globals.css

# 4. Где используется shadow-card в компонентах (за это цепляется hover-подъём)
grep -rn "shadow-\[var(--shadow-card)\]" src/ | wc -l

# 5. Найти доски с инлайновым тинтом колонок — ЗАДАЧА 5
grep -rln "PipelineBoard\|StageBoard\|LeadsView" src/components/
```

Ожидания: блок `.t-minimal` содержит `--bg: #F6F6F7`, `--shadow-card: var(--shadow-xs)`,
`--sidebar-indicator: rgba(26,26,30,0.06)`. Если значения другие — **остановиться и
сообщить**: тема уже правилась, анкоры ниже не совпадут.

---

## ЗАДАЧА 1: Токены поверхностей, бордеров, текста

### Context
Фон `#F6F6F7` отличался от белой карточки на 1.04:1 — карточки визуально сливались
с canvas. Бордер `#E5E5E8` не читался. Сдвигаем фон в серый, бордеры на тон плотнее.
`--text-dim`/`--text-mute` затемняем: на новом фоне прежние значения теряли запас AA.

### Steps
В `src/app/globals.css`, внутри блока `.t-minimal {`:

str_replace:
```
old:
  --bg: #F6F6F7;  --surface: #FFFFFF;  --surface2: #F3F3F4;  --surface3: #EAEAEC;
  --popover: var(--surface);
  --border: #E5E5E8;  --border2: #D6D6DB;  --border-input: #8A8A93;  /* 3.42:1 к surface */
  --text: #1A1A1E;  --text-dim: #5A5A64;  --text-mute: #66666F;  /* mute 4.73:1 на surface3, тише dim (5.67:1) */
  --sidebar-indicator: rgba(26,26,30,0.06);  --sidebar-active-text: var(--text);

new:
  /* v2: фон темнее — белые карточки отделяются без тяжёлых теней */
  --bg: #ECECEF;  --surface: #FFFFFF;  --surface2: #F4F4F6;  --surface3: #E7E7EB;
  --popover: var(--surface);
  /* v2: бордеры на тон плотнее (карточка/инпут/таблица читаются) */
  --border: #D9D9E0;  --border2: #C4C4CE;  --border-input: #82828C;  /* 3.71:1 к surface */
  /* v2: dim/mute темнее — на новом сером фоне держат AA с запасом */
  --text: #17171C;  --text-dim: #4E4E59;  --text-mute: #5F5F6A;  /* dim 7.24:1, mute 6.11:1 на surface */
  /* v2: активный пункт нава — белая пилюля на сером рельсе */
  --sidebar-indicator: #FFFFFF;  --sidebar-active-text: var(--text);
```

### Verification
```bash
grep -n "ECECEF\|D9D9E0\|4E4E59" src/app/globals.css
# Должно найтись по одному вхождению каждого, внутри .t-minimal
```

---

## ЗАДАЧА 2: Слоистые тени и elevation

### Context
`--shadow-card` был `var(--shadow-xs)` — одна тень 4% на 1px. Плоско. Ставим
двухслойную тень (близкая контактная + широкая мягкая) — приём Stripe/Attio.

### Steps
str_replace #1:
```
old:
  --shadow-xs: 0 1px 2px rgba(20,20,25,0.04);
  --shadow-sm: 0 1px 3px rgba(20,20,25,0.05), 0 1px 2px rgba(20,20,25,0.04);
  --shadow-md: 0 4px 12px rgba(20,20,25,0.06), 0 1px 3px rgba(20,20,25,0.04);
  --shadow-lg: 0 10px 32px rgba(20,20,25,0.08), 0 2px 8px rgba(20,20,25,0.04);
  --shadow-card: var(--shadow-xs);  --shadow-card-hover: var(--shadow-sm);

new:
  /* v2: слоистые тени (Stripe/Attio) вместо одиночного xs — карточки были плоские */
  --shadow-xs: 0 1px 2px rgba(18,18,24,0.05);
  --shadow-sm: 0 1px 2px rgba(18,18,24,0.06), 0 2px 8px rgba(18,18,24,0.05);
  --shadow-md: 0 2px 4px rgba(18,18,24,0.06), 0 10px 24px rgba(18,18,24,0.10);
  --shadow-lg: 0 4px 8px rgba(18,18,24,0.06), 0 18px 48px rgba(18,18,24,0.14);
  --shadow-card: var(--shadow-sm);  --shadow-card-hover: var(--shadow-md);
```

str_replace #2:
```
old:
  --elevation-1: 0 1px 3px rgba(20,20,25,0.05), 0 1px 2px rgba(20,20,25,0.04);
  --elevation-2: 0 4px 12px rgba(20,20,25,0.07), 0 2px 4px rgba(20,20,25,0.04);
  --elevation-3: 0 12px 40px rgba(20,20,25,0.11), 0 4px 8px rgba(20,20,25,0.05);

new:
  --elevation-1: 0 1px 2px rgba(18,18,24,0.06), 0 2px 8px rgba(18,18,24,0.05);
  --elevation-2: 0 2px 4px rgba(18,18,24,0.06), 0 10px 24px rgba(18,18,24,0.10);
  --elevation-3: 0 4px 8px rgba(18,18,24,0.07), 0 20px 56px rgba(18,18,24,0.16);
```

### Verification
```bash
grep -c "rgba(20,20,25" src/app/globals.css
# Должно стать 0 внутри .t-minimal — проверить, что остальные темы не задеты:
sed -n '/^\.t-minimal {/,/^}/p' src/app/globals.css | grep -c "rgba(20,20,25"
# → 0
```

---

## ЗАДАЧА 3: Сайдбар — серый рельс, актив = белая пилюля

### Context
Сайдбар шёл `bg-surface` (белый), контент тоже белый — границы рабочей зоны не
было. Делаем рельс на тон темнее (`--surface2`), активный пункт — белая пилюля
с бордером и тенью: она «всплывает» из рельса, а не подкрашивается тинтом 6%.

`!important` на `aside` обязателен: `bg-surface` стоит классом в
`components/layout/TextNavSidebar.tsx` и выигрывает по специфичности.

### Steps
str_replace:
```
old:
.t-minimal aside[data-app-nav] .nav-active {
  border-left-color: transparent;
  background: var(--sidebar-indicator);
  color: var(--sidebar-active-text);
  box-shadow: none;
}
.t-minimal aside[data-app-nav] .nav-active .lucide {
  color: var(--sidebar-active-text);
}

new:
/* v2: сайдбар — серый рельс на тон темнее контента (рамка вокруг рабочей зоны).
   bg-surface класса на aside перебиваем: карточки внутри контента остаются белыми. */
.t-minimal aside[data-app-nav] {
  background: var(--surface2) !important;
  border-right-color: var(--border) !important;
}
/* v2: актив нава — белая пилюля с бордером и тенью (было: тинт 6% без границы) */
.t-minimal aside[data-app-nav] .nav-active {
  border-left-color: transparent;
  background: var(--sidebar-indicator);
  color: var(--sidebar-active-text);
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(18,18,24,0.06);
}
.t-minimal aside[data-app-nav] .nav-active .lucide {
  color: var(--accent-text);
}
```

### Verification
```bash
grep -n -A 4 "t-minimal aside\[data-app-nav\] {" src/app/globals.css
# Должно показать background: var(--surface2) !important
```

Визуально после `npm run dev`, тема Minimal: рельс серый, активный пункт белый с
тенью, иконка активного пункта петроль, логотип TC на месте.

---

## ЗАДАЧА 4: Бейджи с рамкой + hover-подъём + primary-кнопка

### Context
Тинты `.bg-*-l` (9-10% альфа) шли без границы — статусы «просрочено», «Важный»,
«Чемпион» читались как подложка, а не как чип. Даём каждому inset-ring того же
хрома через `color-mix` — без новых токенов и без сдвига геометрии (border
добавил бы 1px и сломал бы вертикальные ритмы).

Hover-подъём цепляется за уже существующий в коде паттерн
`shadow-[var(--shadow-card)]` — он стоит на KPI-карточках дашборда, ProjectCard,
карточках сделок. Отдельный класс не нужен.

### Steps
Вставить блок **сразу после** строки:
```css
.t-minimal input[type="checkbox"]:hover { border-color: var(--text); }
```

Вставляемый блок:
```css

/* ═══ Minimal v2: глубина и контраст ═══════════════════════════════════
   Бейджи и статусы: тинт + бордер того же хрома. inset ring, а не border —
   .bg-*-l висит на элементах с уже заданной геометрией, добавленный border
   сдвинул бы их на 1px. color-mix берёт хром из самого токена. */
.t-minimal .bg-accent-l { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent); }
.t-minimal .bg-green-l  { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--green) 28%, transparent); }
.t-minimal .bg-red-l    { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--red) 25%, transparent); }
.t-minimal .bg-blue-l   { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 25%, transparent); }
.t-minimal .bg-yellow-l { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--yellow) 25%, transparent); }
.t-minimal .bg-purple-l { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--purple) 25%, transparent); }

/* Hover-подъём: цепляется за существующий паттерн shadow-[var(--shadow-card)]. */
.t-minimal [class*="shadow-[var(--shadow-card)]"] {
  transition: box-shadow var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}
.t-minimal [class*="shadow-[var(--shadow-card)]"]:hover {
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
  border-color: var(--border2);
}
@media (prefers-reduced-motion: reduce) {
  .t-minimal [class*="shadow-[var(--shadow-card)]"]:hover { transform: none; }
}

/* Primary-кнопка: внутренняя подсветка сверху — читается как приподнятая. */
.t-minimal .bg-accent {
  box-shadow: 0 1px 2px rgba(18,18,24,0.15), inset 0 1px 0 rgba(255,255,255,0.12);
}
.t-minimal .bg-accent:disabled { box-shadow: none; }
```

### Verification
```bash
grep -n "Minimal v2: глубина" src/app/globals.css
grep -c "color-mix(in srgb, var(--" src/app/globals.css   # ≥ 6
```

⚠️ **Порядок значим.** Новый блок обязан идти **ниже** существующего ремапа
`.t-minimal .bg-accent { background-color: var(--accent) !important; }` —
иначе тень кнопки перекроется. И ниже `.t-minimal .bg-accent:disabled`, чтобы
disabled-кнопки остались тихими. Проверить порядок:
```bash
grep -n "t-minimal .bg-accent" src/app/globals.css
# Номер строки нового правила должен быть БОЛЬШЕ номеров существующих
```

---

## ЗАДАЧА 5: Рамки Kanban-колонкам (в компонентах)

### Context
Колонки досок красятся тинтом инлайном — CSS темы до них не достаёт. Тинт без
рамки на новом сером фоне читается как пятно, а не как контейнер.

### Steps
Найти места, где колонке задаётся фон-тинт:
```bash
grep -rn "backgroundColor\|background:" src/components/projects/PipelineBoard.tsx \
  src/components/projects/DeliveryPipelineBoard.tsx \
  src/components/projects/StageBoard.tsx \
  src/components/leads/LeadsView.tsx | grep -i "rgba\|track-\|-l)"
```

Плюс доска задач — найти файл:
```bash
grep -rln "Просрочено" src/components/ | head
```

В каждом найденном месте к контейнеру колонки добавить границу того же хрома,
что и её фон:
```
border: 1px solid color-mix(in srgb, <цвет колонки> 18%, transparent)
```
Если цвет колонки уже приходит из переменной (`var(--red)`, `var(--track-*-current)`) —
подставить её. Если это литеральная rgba — взять её же hue с альфой 0.18.

Пустые drop-зоны («Перетащи сюда»): пунктир поднять с 1px до 1.5px и взять цвет
колонки вместо `--border`.

### Verification
```bash
npx tsc --noEmit
```
Визуально: у каждой колонки на `/tasks` (доска), `/deals`, `/leads`, `/projects`
видна тонкая рамка своего цвета; пустые зоны — заметный пунктир.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Контраст — токены считались под новый `--bg: #ECECEF`, пересчитать:
```bash
python scripts/contrast.py 2>/dev/null || echo "скрипт не найден — проверить вручную"
```
Ожидаемые минимумы в Minimal: `--text-dim` ≥ 5.5:1 на `--surface3`,
`--text-mute` ≥ 4.5:1 на `--surface3` и тише dim, `--border-input` ≥ 3:1 к `--surface`.

Регрессия по темам — **обязательно**: правки под `.t-minimal`, но
`--shadow-*` и `--elevation-*` объявлены и в других темах. Открыть по одной
странице в Claude, Frost, Aura, Washi, Fuji, Tidal — тени и фоны не должны
измениться.

```bash
# Проверить, что ни одно новое правило не утекло за пределы .t-minimal
grep -n "rgba(18,18,24" src/app/globals.css
# Все вхождения должны быть внутри .t-minimal или в правилах с префиксом .t-minimal
```

---

## КОММИТ

```bash
git add src/app/globals.css src/components/
git commit -m "feat(theme): Minimal v2 — глубина и контраст

- фон #F6F6F7 → #ECECEF: белые карточки отделяются от canvas
- бордеры на тон плотнее (#E5E5E8 → #D9D9E0, input 3.42 → 3.71:1)
- text-dim/mute затемнены под новый фон (AA с запасом)
- слоистые тени вместо одиночного xs, shadow-card = sm
- сайдбар: серый рельс + активный пункт белой пилюлей с тенью
- бейджи .bg-*-l получили inset-ring своего хрома через color-mix
- hover-подъём карточек: тень + translateY(-1px), с reduced-motion
- Kanban-колонки: рамка хрома колонки, пунктир пустых зон заметнее

Концепция темы не менялась: нейтральный canvas, один петроль-акцент,
никакого декора. Палитра и семантика цветов не тронуты."
```

---

## Что НЕ делать

- Не менять `--accent`, `--accent-text`, семантические цвета и их `*-text` варианты.
- Не добавлять градиенты, скругления больше `--radius-l`, декоративные элементы.
- Не трогать блоки других тем (`.t-frost`, `.t-aura`, `.t-washi`, `.t-fuji`, `.t-tidal`, `:root`).
- Не менять шрифт (`--font-inter`) и `font-feature-settings: 'cv11'`.
- Не переписывать `.t-minimal .bg-accent { background-color: … }` — там сознательно
  ровная заливка без градиента, комментарий в файле объясняет почему.
