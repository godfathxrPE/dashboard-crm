# Theming

Multi-theme — несколько визуальных тем в одном проекте. Default case — light
+ dark. Edge case — несколько брендовых тем (white-label, тематические
разделы внутри одного приложения).

---

## Theming Default — одна стратегия, не миксы

| Сценарий | Стратегия | Тулинг |
|----------|-----------|--------|
| **Light + Dark** (по умолчанию) | **`.dark` class на `<html>`** | `next-themes` для Next.js |
| **Multi-brand / white-label** | **`data-theme="..."` атрибут** | Свой ThemeProvider или next-themes с custom themes |
| **Тематический раздел внутри приложения** | **`data-theme` на корневом `<div>`** этого раздела | Локально, без global state |

**Не миксуй стратегии в одном проекте.** Если выбрал `.dark` для light/dark
— все темы поверх работают через тот же класс. Если нужен white-label с 5
темами — сразу `data-theme`, light/dark тоже становятся атрибутами.

Mix `.dark` + `[data-theme="dark"]` оправдан только когда мигрируешь
из одной стратегии в другую. В стабильном проекте — один путь.

---

## Strategy: CSS Variables Layering

Базовый принцип:

1. **Primitive tokens** — общие для всех тем (палитра цветов как факт)
2. **Semantic tokens** — переопределяются на уровне theme
3. **Components** — используют semantic tokens

```css
/* Layer 1: primitives (общие) */
:root {
  --gray-50: oklch(0.985 0 0);
  --gray-900: oklch(0.146 0 0);
  --blue-500: oklch(0.55 0.18 254);
}

/* Layer 2: light theme (default) */
:root {
  --background: var(--gray-50);
  --foreground: var(--gray-900);
  --primary: var(--blue-500);
}

/* Layer 2: dark theme (overrides light) */
.dark {
  --background: var(--gray-900);
  --foreground: var(--gray-50);
  --primary: var(--blue-400);  /* немного светлее для контраста */
}
```

Когда `<html class="dark">`, semantic токены переопределяются, компоненты
автоматически рендерятся в dark.

---

## Class-based default (light/dark)

### Tailwind v4

```css
/* src/app/globals.css */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root { /* light theme tokens */ }
.dark { /* dark theme overrides */ }

@theme inline {
  --color-background: var(--background);
  /* ... */
}
```

`@custom-variant dark (&:where(.dark, .dark *))` — это новый v4-способ
определить `dark:` модификатор. Tailwind будет генерировать классы
`dark:bg-card`, которые активируются под `.dark`.

### Tailwind v3 fallback

```ts
// tailwind.config.ts
darkMode: ['class'],
```

```css
/* globals.css */
.dark { /* dark theme overrides */ }
```

### `next-themes` integration

```bash
npm install next-themes
```

```tsx
// src/components/providers/ThemeProvider.tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

```tsx
// src/app/layout.tsx
<html lang="ru" suppressHydrationWarning>
  <body>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  </body>
</html>
```

Switcher:

```tsx
// src/components/ui/theme-toggle.tsx
'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

**`suppressHydrationWarning`** обязательно. Без него React ругается на
несоответствие server/client при первом рендере (сервер не знает тему
пользователя).

**`disableTransitionOnChange`** обязательно. Без него все элементы при
смене темы плавно "перекрашиваются", выглядит дёшево и тормозит.

---

## Complete Light + Dark Setup (v4 reference)

```css
/* src/app/globals.css */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  /* Primitives */
  --gray-50: oklch(0.985 0 0);
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

  --blue-400: oklch(0.65 0.18 254);
  --blue-500: oklch(0.55 0.18 254);
  --blue-600: oklch(0.49 0.18 254);

  --red-400: oklch(0.65 0.22 27);
  --red-500: oklch(0.55 0.22 27);

  /* Light theme semantic */
  --background: var(--gray-50);
  --foreground: var(--gray-900);
  --card: var(--gray-50);
  --card-foreground: var(--gray-900);
  --popover: var(--gray-50);
  --popover-foreground: var(--gray-900);
  --primary: var(--gray-900);
  --primary-foreground: var(--gray-50);
  --secondary: var(--gray-100);
  --secondary-foreground: var(--gray-900);
  --muted: var(--gray-100);
  --muted-foreground: var(--gray-500);
  --accent: var(--gray-100);
  --accent-foreground: var(--gray-900);
  --destructive: var(--red-500);
  --destructive-foreground: var(--gray-50);
  --border: var(--gray-200);
  --input: var(--gray-200);
  --ring: var(--gray-900);
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
  --muted: var(--gray-800);
  --muted-foreground: var(--gray-400);
  --accent: var(--gray-800);
  --accent-foreground: var(--gray-50);
  --destructive: var(--red-400);
  --destructive-foreground: var(--gray-50);
  --border: var(--gray-800);
  --input: var(--gray-800);
  --ring: var(--gray-300);
}

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

**Что важно**:
- В dark `--primary` светлее (контраст на тёмном фоне)
- `--destructive` тоже немного светлее — иначе плохо читается
- `--popover` отделён от `--background` (popover чуть светлее в dark)

---

## Multi-Brand Themes (через `data-theme`)

Используй когда тем **больше двух** или нужна тематизация **отдельных
разделов** одного приложения. Не используй для бинарной light/dark — там
`.dark` чище.

Пример: основная тема + альтернативная brand-тема (например, mono-CRT
эстетика для ретро-раздела):

```css
/* Default theme */
:root {
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.146 0 0);
  --primary: oklch(0.55 0.18 254);
  --radius: 0.625rem;
}

/* Custom brand theme (пример — mono-CRT) */
[data-theme="mono-crt"] {
  --background: oklch(0.07 0 0);
  --foreground: oklch(0.78 0.15 70);  /* amber */
  --primary: oklch(0.85 0.2 70);
  --primary-foreground: oklch(0.07 0 0);
  --border: oklch(0.78 0.15 70 / 0.2);  /* amber с прозрачностью */
  --radius: 0;  /* CRT не имеет скруглений */

  /* Тема может менять и шрифт */
  font-family: 'IBM Plex Mono', monospace;
}
```

В Next.js App Router — оборачиваешь раздел в `<div data-theme="...">`:

```tsx
// src/app/(retro-section)/layout.tsx
export default function RetroLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="mono-crt">
      {children}
    </div>
  );
}
```

Все вложенные shadcn-компоненты автоматически перерендерятся в новой теме.

### Можно ли совместить с Tailwind `dark:` модификатором

Да, но осторожно. В v4:

```css
@custom-variant dark (&:where(.dark, [data-theme="dark"], [data-theme="dark"] *, .dark *));
```

В v3:

```ts
darkMode: ['class', '[data-theme="dark"]'],
```

Только если у тебя **есть** `[data-theme="dark"]` в плане. Если темы
называются по-брендовому (`light`, `corporate`, `mono-crt`), `dark:`
модификатор не подходит — он привязан к слову "dark". Тогда не используй
`dark:` вообще, переопределяй токены через `[data-theme="..."]`.

---

## System Preference (auto)

```tsx
<ThemeProvider defaultTheme="system" enableSystem>
```

Это слушает `prefers-color-scheme` media query и переключает тему по
системным настройкам пользователя. Хороший дефолт.

**Не используй `@media (prefers-color-scheme)` напрямую в CSS** — это
ломает manual theme switch (пользователь хочет dark, а CSS переключается
обратно на light по системе).

---

## Часто забываемое

- **`suppressHydrationWarning`** — иначе React-ошибка при первом рендере
- **`disableTransitionOnChange`** — иначе при смене темы все элементы плавно "перекрашиваются", выглядит дёшево
- **Транзишн на корне** — `*, *::before, *::after { transition: background-color 0.2s, color 0.2s, border-color 0.2s }` создаёт smooth-переход. Но включай только когда `disableTransitionOnChange` уберёт его при switch.
- **Charts и SVG** — тоже должны использовать CSS vars (`stroke="var(--primary)"`), а не хардкоды. Если 5+ серий — заведи `--chart-1`..`--chart-5` (см. shadcn charts)
- **Images** — могут нуждаться в alt-версиях для dark (например, лого с тёмным цветом). Используй `<picture>` с `media="(prefers-color-scheme: dark)"`.
- **Скриншоты в документации** — захвати в обеих темах
- **Тестирование** — пройдись по приложению в обеих темах, многое ломается только в одной (низкий контраст текста, потерянные иконки, невидимые dividers)
- **Persistence** — `next-themes` сам сохраняет в localStorage, не пиши свою логику
- **Не используй `@media (prefers-color-scheme)` напрямую** — ломает manual theme switch
- **Не миксуй стратегии** — `.dark` для light/dark, `data-theme` для multi-brand. Не оба сразу
