# Tokens

Design tokens — атомарные значения дизайна (цвет, размер, радиус, тень),
выраженные как переменные. Без них нет дизайн-системы — есть набор
несогласованных компонентов.

---

## Three Layers (+ Optional Layer 4)

```
Layer 1: Primitive tokens (raw values)
   └── --blue-500: oklch(0.55 0.18 254);

Layer 2: Semantic tokens (role-based aliases)
   └── --primary: var(--blue-500);

Layer 3: Component implementation (использование semantic tokens в коде)
   └── <Button className="bg-primary">

Layer 4 (optional): Component-specific tokens
   └── --button-bg, --button-radius, --button-h-md
       (только для зрелой DS, см. ниже)
```

**Default-правило**: в reusable-компонентах используй **только semantic
tokens**. Primitive — слой ниже, он не должен светиться в компонентах.

### Когда primitive tokens допустимы в коде

Не догматизируй. Есть легитимные исключения:

| Кейс | Почему ок |
|------|-----------|
| Charts, data visualization | `<Line stroke="var(--blue-500)">` — у диаграмм часто 5+ серий, semantic-набора не хватит. Используй `--chart-1`..`--chart-5` или primitive напрямую |
| Brand illustrations / SVG-арт | Иллюстрация привязана к брендовой палитре, а не к роли |
| Debug / prototype screens | Time-boxed, не идёт в production |
| One-off marketing surfaces | Лендинг с уникальным визуалом, не часть общей DS |
| Token-mapping слой | Где primitive → semantic переводится, primitive обязателен |

В остальном — semantic. Если ловишь себя на `bg-blue-500` в reusable
Button/Card/Input — это сигнал, что нужен semantic token.

### Почему три слоя

- **Primitive** — палитра. Меняется редко (раз в редизайн). Сейчас 250 шкала blue, потом 270 шкала indigo — поменяешь один файл.
- **Semantic** — роли. Меняются по теме (light/dark). `--primary` указывает на разные primitive в разных темах.
- **Component implementation** — приложение. Меняется по фичам. Не должно знать про конкретный цвет.

Если компонент использует `bg-blue-500` напрямую — добавление dark mode
требует переписать компонент. Если `bg-primary` — поменялись только токены.

### Layer 4: когда вводить component tokens

Не сразу. Сигналы, что Layer 4 оправдан:

- Компонент кастомизируется в **3+ независимых местах** одинаково (например, Button с другим radius на лендинге, в admin-панели и в widget'е)
- Компонент часть **DS-пакета**, который потребляют несколько проектов
- Дизайнер просит "давайте сделаем у Button свой fine-grained controls"

```css
/* Только для зрелой DS */
:root {
  --button-bg: var(--primary);
  --button-fg: var(--primary-foreground);
  --button-h-sm: 2rem;
  --button-h-md: 2.25rem;
  --button-h-lg: 2.5rem;
  --button-radius: var(--radius);
}
```

**Преждевременный Layer 4** хуже, чем его отсутствие — добавляет шум,
дублирует semantic слой, требует поддержки. Стартовая DS живёт на трёх
слоях.

---

## Primitive Tokens

Это полная палитра, из которой строится всё остальное.

```css
/* src/app/globals.css */

@import "tailwindcss";

:root {
  /* Neutral scale */
  --gray-50:  oklch(0.985 0 0);
  --gray-100: oklch(0.961 0 0);
  --gray-200: oklch(0.916 0 0);
  --gray-300: oklch(0.852 0 0);
  --gray-400: oklch(0.708 0 0);
  --gray-500: oklch(0.554 0 0);
  --gray-600: oklch(0.432 0 0);
  --gray-700: oklch(0.346 0 0);
  --gray-800: oklch(0.252 0 0);
  --gray-900: oklch(0.146 0 0);
  --gray-950: oklch(0.07 0 0);

  /* Brand scale */
  --blue-50:  oklch(0.97 0.014 254);
  --blue-400: oklch(0.65 0.18 254);
  --blue-500: oklch(0.55 0.18 254);
  --blue-600: oklch(0.49 0.18 254);
  --blue-700: oklch(0.42 0.18 254);

  /* Status scales */
  --red-400:   oklch(0.65 0.22 27);
  --red-500:   oklch(0.55 0.22 27);
  --green-500: oklch(0.6 0.14 145);
  --amber-500: oklch(0.78 0.15 70);
}
```

**OKLCH вместо HSL/RGB** — даёт perceptual uniformity (равные числовые
изменения = равные визуальные) и нативную поддержку в современных
браузерах. Если ну нет возможности OKLCH — HSL тоже окей, но поручи цвета
`color-architect`.

**Сколько shades нужно?** Минимум 50, 100, 300, 500, 700, 900 для
neutral-шкалы (6 точек). Полная Tailwind-шкала из 11 точек (50, 100, ..., 900,
950) — для кастомной DS обычно избыточно.

---

## Semantic Tokens

Стандартный набор из shadcn — **не изобретай велосипед**, начни с него:

```css
/* src/app/globals.css (продолжение) */

:root {
  /* Surfaces */
  --background: var(--gray-50);
  --foreground: var(--gray-900);

  --card: var(--gray-50);
  --card-foreground: var(--gray-900);

  --popover: var(--gray-50);
  --popover-foreground: var(--gray-900);

  /* Brand & actions */
  --primary: var(--gray-900);
  --primary-foreground: var(--gray-50);

  --secondary: var(--gray-100);
  --secondary-foreground: var(--gray-900);

  --accent: var(--gray-100);
  --accent-foreground: var(--gray-900);

  /* Muted (для второстепенного текста, фонов) */
  --muted: var(--gray-100);
  --muted-foreground: var(--gray-500);

  /* Status */
  --destructive: var(--red-500);
  --destructive-foreground: var(--gray-50);

  /* Borders & inputs */
  --border: var(--gray-200);
  --input: var(--gray-200);
  --ring: var(--gray-900);

  /* Radius */
  --radius: 0.625rem;
}

.dark {
  --background: var(--gray-950);
  --foreground: var(--gray-50);

  --card: var(--gray-950);
  --card-foreground: var(--gray-50);

  --popover: var(--gray-900);
  --popover-foreground: var(--gray-50);

  --primary: var(--gray-50);
  --primary-foreground: var(--gray-900);

  --secondary: var(--gray-800);
  --secondary-foreground: var(--gray-50);

  --accent: var(--gray-800);
  --accent-foreground: var(--gray-50);

  --muted: var(--gray-800);
  --muted-foreground: var(--gray-400);

  --destructive: var(--red-400);
  --destructive-foreground: var(--gray-50);

  --border: var(--gray-800);
  --input: var(--gray-800);
  --ring: var(--gray-300);
}
```

### Зачем foreground для каждого surface

`--card` и `--card-foreground` — пара. На карточке всегда нужен текст,
который читаем на её фоне. Если просто `--card`, разработчик каждый раз
сам решает цвет текста — это источник несогласованности.

Правило: **каждый surface-токен имеет paired -foreground**.

### Когда расширять стандартный набор

Расширяй только при реальной потребности:

| Кейс | Добавь |
|------|--------|
| Статусы (success, warning, info) | `--success` + `--success-foreground`, и т.д. |
| Несколько уровней surface (для shadow-less дизайна) | `--surface-1`, `--surface-2`, `--surface-3` |
| Brand-specific accents | `--brand`, `--brand-foreground` |
| Charts | `--chart-1`, `--chart-2`, ..., `--chart-5` (как в shadcn charts) |

**Не добавляй**: `--text-primary`, `--text-secondary`, `--bg-light`,
`--bg-dark`. Это путает (что primary — цвет текста или цвет акцента?). Лучше
явные роли.

---

## Tailwind v4: подключение через `@theme inline`

В v4 Tailwind подхватывает токены **через CSS-директиву `@theme`**, а не
через `tailwind.config.ts`. `@theme inline` — рекомендуемый shadcn-стиль:
он маппит существующие CSS vars в Tailwind utility namespace без их
дублирования.

```css
/* src/app/globals.css (продолжение) */

@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);

  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);

  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);

  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);

  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);

  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

После этого `bg-primary`, `text-card-foreground`, `border-border`,
`rounded-lg` работают автоматически.

**Почему `@theme inline`, а не просто `@theme`**: при просто `@theme`
Tailwind создаёт **свои** CSS vars (`--color-primary` появляется как
самостоятельная переменная), они дублируются с твоими `:root`-токенами.
`inline` говорит "не создавай новые vars, используй уже существующие
через `var()`".

---

## Tailwind v3 fallback (legacy projects)

Если проект ещё на v3, конфиг живёт в `tailwind.config.ts`:

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
};

export default config;
```

**Не миксуй v3 и v4 в одном проекте**: либо config файл, либо `@theme`.
Mix создаёт неочевидные конфликты.

---

## Naming Conventions

### Хорошее именование

- **Семантическое, не визуальное**: `--primary`, не `--blue` (что если потом brand станет красный?)
- **Слот + роль**: `--card-foreground`, `--popover-border`
- **Единый префикс для primitive**: `--gray-500`, `--blue-500`
- **Без венгерской нотации**: `--color-primary` — лишнее (понятно из контекста; и в v4 это зарезервированный namespace для `@theme`, не используй для `:root`-токенов)

### Плохое именование

| Плохо | Почему | Хорошо |
|-------|--------|--------|
| `--text-light` | Что значит light? | `--muted-foreground` |
| `--bg-1`, `--bg-2` | Не описывает роль | `--background`, `--muted` |
| `--blue-button` | Завязка на цвет и компонент | `--primary` |
| `--main-color` | Размытое значение | `--primary` или `--accent` |
| `--gray` | Какой именно? | `--gray-500` |
| `--card-bg` | bg избыточен (карточка всегда фон) | `--card` |

---

## TypeScript Constants (опционально)

Если нужно использовать токены в JS (например, для chart-библиотек):

```ts
// src/lib/design-tokens.ts
export const tokens = {
  colors: {
    background: 'var(--background)',
    foreground: 'var(--foreground)',
    primary: 'var(--primary)',
    muted: 'var(--muted)',
  },
  radius: {
    sm: 'calc(var(--radius) - 4px)',
    md: 'calc(var(--radius) - 2px)',
    lg: 'var(--radius)',
  },
} as const;
```

Используется например в Recharts:

```tsx
<LineChart>
  <Line stroke={tokens.colors.primary} />
</LineChart>
```

**Не дублируй raw values в TS** — только ссылки на CSS vars. Иначе будет
рассинхронизация.

---

## Часто забываемое

- **`-foreground` для каждого surface** — иначе разработчики выбирают цвет текста сами
- **OKLCH для современных проектов** — perceptual uniformity и `color-mix()` работают чище, чем с HSL/hex
- **`--ring` отдельно от `--primary`** — ring обычно отличается от primary (нейтральный или с альфой), это важно для focus visibility
- **Не миксуй primitive и semantic** в одном reusable-компоненте — выбери один уровень. В charts/SVG/isolated — primitive ок
- **Расширяй стандартный набор последним**, не первым делом — сначала убедись, что shadcn-defaults реально не хватает
- **Layer 4 — поздно, не рано** — старт на трёх слоях; component-specific tokens только когда они оправданы 3+ повторениями кастомизации
- **`@theme inline` в v4** — без `inline` Tailwind дублирует твои CSS vars
