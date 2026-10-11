# Scale Systems

Системы шкал — базовый порядок в дизайне. Без них компоненты используют
"magic numbers" (`mt-7`, `gap-3.5`, `rounded-[12px]`) и интерфейс выглядит
несогласованным даже с правильной палитрой.

---

## Spacing Scale

### Default (Tailwind 4-pixel base)

Tailwind по умолчанию использует **4px base unit** (`0.25rem`). Шкала:

| Token | Px | Использование |
|-------|----|----|
| `0` | 0px | reset |
| `0.5` | 2px | hairline gaps |
| `1` | 4px | внутри иконок, badge padding |
| `1.5` | 6px | очень редко |
| `2` | 8px | gap между связанными элементами (icon + text) |
| `3` | 12px | внутри маленьких кнопок |
| `4` | 16px | стандартный gap, padding кнопок |
| `5` | 20px | редко |
| `6` | 24px | между секциями карточки |
| `8` | 32px | section padding |
| `10` | 40px | редко |
| `12` | 48px | большой section break |
| `16` | 64px | hero section padding |
| `20` | 80px | редко |
| `24` | 96px | landing hero |

**Используй чётные числа**: 2, 4, 6, 8, 12, 16, 24, 32, 48, 64. Это покрывает
99% случаев.

### Когда отступать от Tailwind defaults

Не отступай. Tailwind scale продумана и проверена. Кастомизация почти всегда
ошибка. Единственный кейс — **dense UI** (CRM-таблицы, financial dashboards),
где нужна более плотная сетка.

**Tailwind v4** (CSS-first):

```css
/* globals.css */
@theme {
  --spacing-4_5: 1.125rem;  /* 18px — между 16 и 20 */
  --spacing-13: 3.25rem;    /* 52px */
}
```

Использование: `p-4_5`, `gap-13`.

**Tailwind v3 fallback**:

```ts
// tailwind.config.ts
extend: {
  spacing: {
    '4.5': '1.125rem',
    '13': '3.25rem',
  }
}
```

Но добавь это **только когда реально нужно** в существующем коде. Не на старте.

### Принципы использования

- **Внутри компонента**: маленькие значения (1-4)
- **Между компонентами**: средние (4-8)
- **Между секциями**: большие (8-16)
- **Между разделами страницы**: очень большие (16-24)

Скачки на одну ступень — норма. Скачок 2 → 8 без промежуточных = хаос.

---

## Typography Scale

### Default (1.250 ratio — Major Third)

**Tailwind v4** (CSS-first, default values уже встроены, override только при необходимости):

```css
/* globals.css */
@theme {
  /* Default v4 values, переопределяй только если нужно */
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;
  --text-base--line-height: 1.5rem;
  /* ... */
}
```

**Tailwind v3 fallback**:

```ts
// tailwind.config.ts
extend: {
  fontSize: {
    xs:   ['0.75rem', { lineHeight: '1rem' }],      // 12 / 16
    sm:   ['0.875rem', { lineHeight: '1.25rem' }],  // 14 / 20
    base: ['1rem', { lineHeight: '1.5rem' }],       // 16 / 24
    lg:   ['1.125rem', { lineHeight: '1.75rem' }],  // 18 / 28
    xl:   ['1.25rem', { lineHeight: '1.75rem' }],   // 20 / 28
    '2xl': ['1.5rem', { lineHeight: '2rem' }],      // 24 / 32
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30 / 36
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],   // 36 / 40
    '5xl': ['3rem', { lineHeight: '1' }],           // 48
    '6xl': ['3.75rem', { lineHeight: '1' }],        // 60
  }
}
```

Это **дефолт Tailwind**, не нужно переопределять.

### Type Scale Ratios

Какой ratio выбрать (если делаешь свой scale):

| Ratio | Имя | Когда |
|-------|-----|-------|
| 1.125 | Major Second | Очень компактные UI (financial dashboards) |
| 1.200 | Minor Third | Dense interfaces, tables-heavy |
| **1.250** | **Major Third** | **Default Tailwind, универсальный** |
| 1.333 | Perfect Fourth | Контентные сайты, статьи |
| 1.500 | Perfect Fifth | Лендинги с большим контрастом sizes |
| 1.618 | Golden Ratio | Editorial, premium-сайты |

Для CRM/dashboard — **1.200 или 1.250**. Не больше: интерфейс с большим
ratio выглядит как лендинг.

### Семантические token-роли (опционально)

Если нужен семантический слой над raw sizes:

```css
:root {
  --text-display: 3rem;       /* 48px — hero, marketing */
  --text-h1: 1.875rem;        /* 30px */
  --text-h2: 1.5rem;          /* 24px */
  --text-h3: 1.25rem;         /* 20px */
  --text-h4: 1.125rem;        /* 18px */
  --text-body: 1rem;          /* 16px */
  --text-caption: 0.875rem;   /* 14px */
  --text-micro: 0.75rem;      /* 12px */
}
```

Но обычно для CRM достаточно Tailwind sizes — `text-3xl` для заголовка
страницы, `text-xl` для секций, `text-base` для body.

### Line Height

Правило: **меньшие шрифты — пропорционально больший line-height**.

| Размер | Line-height ratio |
|--------|-------------------|
| 12px (xs) | 1.33 (16px) |
| 14px (sm) | 1.43 (20px) |
| 16px (base) | 1.5 (24px) |
| 24px (2xl) | 1.33 (32px) |
| 36px (4xl) | 1.11 (40px) |
| 60px+ | 1.0 (no extra leading) |

Для заголовков от 4xl и выше — `leading-tight` (1.25) или `leading-none` (1).

### Font Weight

Минимум — три веса: `400` (regular), `500` (medium), `700` (bold). Достаточно
для большинства UI.

Расширения:
- `300` (light) — только для display-размеров (60px+), иначе нечитабельно
- `600` (semibold) — между medium и bold, удобно для подзаголовков
- `800-900` — только для брендинга, не для UI

**Не используй weight для иерархии**. Для иерархии — размер. Weight =
акценты внутри одного размера.

---

## Radius Scale

```css
:root {
  --radius: 0.625rem;  /* 10px — base, как в новых shadcn-проектах */
}
```

**Tailwind v4**:

```css
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);   /* 6px */
  --radius-md: calc(var(--radius) - 2px);   /* 8px */
  --radius-lg: var(--radius);                /* 10px */
  --radius-xl: calc(var(--radius) + 4px);    /* 14px */
}
```

**Tailwind v3 fallback**:

```ts
borderRadius: {
  none: '0',
  sm: 'calc(var(--radius) - 4px)',
  DEFAULT: 'calc(var(--radius) - 2px)',
  md: 'calc(var(--radius) - 2px)',
  lg: 'var(--radius)',
  xl: 'calc(var(--radius) + 4px)',
  '2xl': 'calc(var(--radius) + 8px)',
  '3xl': 'calc(var(--radius) + 16px)',
  full: '9999px',
}
```

### Использование

| Token | Кейс |
|-------|------|
| `rounded-none` | Tables, full-width separators |
| `rounded-sm` | Tags, badges, маленькие inputs |
| `rounded-md` | Inputs, buttons, dropdowns |
| `rounded-lg` | Cards, modals, popovers |
| `rounded-xl` | Hero cards, premium feel |
| `rounded-2xl+` | Marketing, не для CRM |
| `rounded-full` | Pills, avatars, round buttons (icon only) |

**Правило проксимити**: вложенные элементы имеют меньший radius. Card с
`rounded-lg` — внутренний Button с `rounded-md`. Иначе уголки выглядят
странно.

### Подсказка для согласованности

Если меняешь `--radius` базу — все компоненты обновятся пропорционально.
Это сила single token подхода.

---

## Shadow Scale

Tailwind defaults — **не переопределяй без причины**.

**Tailwind v4** (override через `@theme`, если нужно):

```css
@theme {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  /* etc */
}
```

**Tailwind v3 fallback**:

```ts
boxShadow: {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
}
```

### Использование (elevation system)

| Token | Elevation | Кейс |
|-------|-----------|------|
| none | 0 | Plain surfaces |
| `shadow-sm` | 1 | Cards, list items |
| `shadow` | 2 | Elevated cards, hover state |
| `shadow-md` | 3 | Dropdowns, simple popovers |
| `shadow-lg` | 4 | Tooltips, popovers с контентом |
| `shadow-xl` | 5 | Modals, dialogs (вместе с overlay) |
| `shadow-2xl` | 6 | Featured cards, marketing |

**В dark mode** — shadows почти невидимы. Используй вместо этого `border` или
`bg-card` с большей яркостью.

---

## Z-Index Scale

**Tailwind v4**:

```css
@theme {
  --z-hide: -1;
  --z-base: 0;
  --z-docked: 10;          /* sticky headers, breadcrumbs */
  --z-dropdown: 1000;      /* dropdowns, comboboxes */
  --z-sticky: 1100;        /* sticky table headers */
  --z-banner: 1200;        /* notification banners */
  --z-overlay: 1300;       /* modal overlays */
  --z-modal: 1400;         /* modals, dialogs */
  --z-popover: 1500;       /* popovers, tooltips на модалке */
  --z-skipLink: 1600;      /* accessibility skip links */
  --z-toast: 1700;         /* toasts (поверх всего) */
  --z-tooltip: 1800;       /* tooltips (выше всего) */
}
```

Использование: `z-modal`, `z-toast`.

**Tailwind v3 fallback**:

```ts
zIndex: {
  hide: '-1',
  base: '0',
  docked: '10',
  dropdown: '1000',
  sticky: '1100',
  banner: '1200',
  overlay: '1300',
  modal: '1400',
  popover: '1500',
  skipLink: '1600',
  toast: '1700',
  tooltip: '1800',
}
```

**Не используй случайные z-index** в компонентах (`z-[9999]`). Это первый шаг
к z-index war. Только токены.

### Логика порядка

1. Содержимое (base)
2. Sticky elements (docked, sticky)
3. Inline overlays (dropdown)
4. Banners
5. Full-screen overlays (overlay → modal)
6. Above modals (popover, tooltip on modal)
7. System notifications (toast)
8. A11y (skipLink)

Toast выше modal — пользователь должен увидеть уведомление, даже если
модалка открыта.

---

## Часто забываемое

- **Не миксуй scale-системы** — если выбрал 4px base, не делай отдельные значения 5px, 7px, 13px
- **Документируй semantic роли** — `--text-h1` понятнее, чем `text-3xl` для дизайнера, который читает код
- **Не используй пиксели в коде** — всё через `rem`. Иначе a11y `font-size` пользователя сломается
- **Mobile vs desktop** — на mobile padding обычно на одну ступень меньше
  (`p-4 md:p-6`)
- **Touch targets** — кнопки минимум `h-10` (40px) для удобства касания. Меньше
  — только для desktop-only интерфейсов
- **Не дублируй z-index** — два слоя с одним значением создадут непредсказуемое
  поведение
- **Shadow + border одновременно** — обычно избыточно. Выбери одно.
