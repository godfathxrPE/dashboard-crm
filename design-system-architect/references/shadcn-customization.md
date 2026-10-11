# shadcn Customization

shadcn/ui — копи-пейст архитектура: компоненты живут в твоём коде, ты
управляешь ими полностью. Но это и означает: **future updates не
приедут автоматически**. Поэтому подход к кастомизации важен.

---

## Уровни кастомизации (от меньшего к большему влиянию)

```
1. Через CSS variables (tokens)        ← минимальное влияние
   ↓
2. Через className снаружи (cn merge)
   ↓
3. Добавление variants в CVA
   ↓
4. Изменение base classes в CVA
   ↓
5. Изменение JSX структуры
   ↓
6. Полный переписывание компонента      ← максимальное влияние
```

**Правило**: используй наименьший возможный уровень для решения задачи.
Чем выше уровень — тем сложнее update от shadcn в будущем.

---

## Уровень 1: CSS Variables (предпочтительно)

Если нужно изменить цвет, радиус, шрифт — меняй tokens, не компонент.

### Tailwind v4

```css
/* src/app/globals.css */
:root {
  --primary: oklch(0.55 0.18 220);     /* свой цвет primary */
  --radius: 0.75rem;                    /* свой radius */
  --background: oklch(1 0 0);
}

@theme inline {
  --color-primary: var(--primary);
  --radius-lg: var(--radius);
}
```

### Tailwind v3 fallback

```css
/* globals.css */
:root {
  --primary: var(--blue-500);   /* через primitive */
  --radius: 0.75rem;
}
```

```ts
// tailwind.config.ts (v3)
extend: {
  colors: {
    primary: {
      DEFAULT: 'var(--primary)',
      foreground: 'var(--primary-foreground)',
    },
  },
}
```

**Все shadcn-компоненты автоматически подхватят** новые значения. Никаких
изменений в `button.tsx`, `card.tsx` и т.д. не нужно.

Это идеальная кастомизация: shadcn-update приедет без конфликтов.

---

## Уровень 2: className снаружи

Когда нужно нестандартное оформление в одном месте:

```tsx
<Button className="bg-amber-500 hover:bg-amber-600 shadow-lg">
  Special action
</Button>
```

`cn()` внутри компонента сделает merge — твои классы перебьют дефолтные
(благодаря `tailwind-merge`).

**Когда использовать**:
- One-off кастомизация
- A/B-тест визуала
- Особый случай в одном месте

**Когда НЕ использовать**:
- Если такая кастомизация повторяется в 3+ местах → создай variant в CVA

---

## Уровень 3: Добавление variants в CVA

Используется чаще всего. Добавляешь новый вариант, не трогая существующие.

```tsx
// До
const buttonVariants = cva(/* ... */, {
  variants: {
    variant: {
      default: '...',
      outline: '...',
      ghost: '...',
    },
  },
});

// После — добавили "premium"
const buttonVariants = cva(/* ... */, {
  variants: {
    variant: {
      default: '...',
      outline: '...',
      ghost: '...',
      premium: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md hover:shadow-lg',
    },
  },
});
```

Использование:

```tsx
<Button variant="premium">Upgrade</Button>
```

**Это безопасно**: shadcn-update меняет существующие variants, твои custom
variants остаются. Конфликт может быть только если shadcn добавит variant с
тем же именем — но тогда выбери другое имя при следующем upgrade.

### Когда отдельный CVA-блок vs новый variant

- **Новый variant** — если поведение похоже на существующие (новый цвет, стиль)
- **Новый компонент** (`PremiumButton`) — если поведение принципиально другое (например, требует pulse-animation, особой логики loading)

---

## Уровень 4: Изменение base classes

Когда нужно поменять что-то фундаментальное во всех вариантах кнопки:

```tsx
// Default base (shadcn)
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  { variants: ... }
);

// Кастомизация: убрали rounded-md, добавили tracking
const buttonVariants = cva(
  // CUSTOM: changed rounded-md → rounded-sm, added tracking-wide
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm tracking-wide text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  { variants: ... }
);
```

**Это поломает shadcn-updates** — при следующем `npx shadcn add button`
твои изменения перезапишутся. Помечай такие изменения комментарием
`CUSTOM:` для будущего diff.

---

## Уровень 5: Изменение JSX структуры

Когда нужно добавить новый внутренний элемент или slot.

**React 19 (актуальный shadcn)**:

```tsx
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Default shadcn Button
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

// Кастомизация: добавили loading state со spinner
function Button({
  className,
  variant,
  size,
  asChild = false,
  loading,
  children,
  disabled,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Comp>
  );
}
```

**React 18 fallback** — оберни в `React.forwardRef<HTMLButtonElement,
ButtonProps>` и добавь `Button.displayName = 'Button'`. См. `anatomy.md`.

Это разумная кастомизация — `loading` нужен почти всегда, shadcn почему-то
этого не даёт. Сделал один раз, используешь везде.

**Помечай** в комментарии:

```tsx
/**
 * CUSTOM: Added `loading` prop with spinner.
 * Differs from upstream shadcn — manual diff on update.
 */
function Button(...) { ... }
```

---

## Уровень 6: Полное переписывание

Когда компонент структурно не подходит. Например, тебе нужен Combobox
который умеет server-side search с дебаунсом, а shadcn Combobox только
client-side.

**В этом случае**:

1. Не переименовывай компонент — оставь `Combobox`
2. Удали все shadcn-зависимости в файле
3. Напиши свою реализацию (на Radix Primitives + Tailwind)
4. Сохрани тот же API (props), что в shadcn — для совместимости

Это даст возможность импортировать через тот же путь и не ломать
существующий код.

---

## Создание собственных variants — пошагово

Допустим, в проекте часто нужен Card с outlined-стилем (без shadow,
с border accent-цвета на hover). Шаги:

### 1. Открой `src/components/ui/card.tsx`

Найди компонент Card — он сейчас (React 19, актуальный shadcn):

```tsx
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
```

Здесь нет CVA вообще — Card простая.

### 2. Добавь CVA

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-xl border bg-card text-card-foreground',
  {
    variants: {
      variant: {
        default: 'shadow-sm',
        outlined: 'border-2 hover:border-primary transition-colors',
        elevated: 'shadow-lg',
        ghost: 'border-transparent shadow-none',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type CardProps = React.ComponentProps<'div'> & VariantProps<typeof cardVariants>;

function Card({ className, variant, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  );
}
```

### 3. Используй

```tsx
<Card variant="outlined">...</Card>
<Card variant="elevated">...</Card>
```

Default остался `default` — старый код не сломался.

---

## Anti-patterns

### 1. Переписывание ради косметики

```tsx
// Плохо: скопировал весь shadcn Button и поменял rounded-md на rounded-lg
```

Меняй через token (`--radius`) или через variant.

### 2. Дубликаты компонентов

```tsx
// Плохо: создал PrimaryButton, OutlineButton, GhostButton как отдельные файлы
```

Это обычные variants одной кнопки. Используй CVA.

### 3. Inline-стили вместо variants

```tsx
// Плохо
<Button style={{ background: 'linear-gradient(...)' }}>
```

Заведи variant `premium` и используй `bg-gradient-to-r`.

### 4. Магические class-комбинации в местах использования

```tsx
// Плохо
<Button className="bg-blue-500 hover:bg-blue-600 text-white shadow-md ring-2 ring-blue-300 ring-offset-2">
```

Если делаешь это в 5 местах — сделай variant.

### 5. Игнорирование `cn()`

```tsx
// Плохо — нельзя override снаружи
<button className="bg-primary px-4 py-2">{children}</button>

// Хорошо
<button className={cn('bg-primary px-4 py-2', className)}>{children}</button>
```

### 6. Импорт `cn` из неправильного пути

```tsx
// Плохо
import { cn } from '@/lib/cn';

// Хорошо (стандарт shadcn)
import { cn } from '@/lib/utils';
```

---

## Workflow при добавлении нового shadcn-компонента

```bash
npx shadcn@latest add dialog
```

После установки:

1. **Открой файл** — посмотри что внутри (могут быть сюрпризы)
2. **Проверь импорты** — иногда добавляются новые зависимости
3. **Протестируй** — компонент работает с твоей темой
4. **Если нужны изменения** — следуй уровням 1→6, минимально необходимый
5. **Закоммить чисто** — отдельный коммит "add Dialog from shadcn", потом "customize Dialog: add loading state". Так легче делать diff на upgrade.

---

## Часто забываемое

- **Token-first** — попробуй решить через CSS vars прежде чем трогать компонент
- **Variant-first vs class-first** — повторяющийся стиль = variant, one-off = className
- **Комментируй кастомизации** в shadcn-компонентах с тэгом `CUSTOM:` для будущего diff
- **Не переименовывай** shadcn-компоненты при кастомизации — путь остаётся тем же
- **Не миксуй уровни** — если ушёл в Уровень 5 (JSX), не пытайся одновременно сохранить совместимость с upstream через token-tweaks
- **Auto-import работает** — настрой VS Code, чтобы Button импортировался из `@/components/ui/button` автоматически
- **Tailwind v4 работает иначе при кастомизации цветов** — не правь `tailwind.config.ts`, правь `:root` и `@theme inline` в `globals.css`
- **`@/lib/utils`** — стандартный путь cn(). Если в проекте `@/lib/cn` — это рассинхрон с shadcn-defaults, перенеси
- **Tailwind-merge config** — если переопределил `colors`/`spacing`, проверь, что `tailwind-merge` знает о них (иначе `cn()` не сольёт правильно)
