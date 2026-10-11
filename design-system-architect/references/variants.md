# Variants & States

Варианты компонента — способ сказать "у Button есть размеры (sm/md/lg) и
типы (primary/secondary/ghost/destructive)" без копипасты в десяти местах.

**Default tool — CVA (class-variance-authority)** — стандарт shadcn.

---

## CVA basics

```tsx
// src/components/ui/button.tsx
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base classes — применяются всегда
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 py-2',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
```

**Что важно:**

1. **Function component без `forwardRef`** (React 19 default — `ref` это обычный prop через `React.ComponentProps<'button'>`)
2. **`data-slot="button"`** — для CSS-targeting и идентификации
3. **Base classes** — всё что не зависит от вариантов (`inline-flex`, `rounded-md`, `transition-*`, focus styles)
4. **Variants** — независимые оси (variant, size — это две оси)
5. **`defaultVariants`** — что выбрать если не передали проп
6. **`VariantProps`** — типы автоматически
7. **`cn()` снаружи** — позволяет переопределить классы извне через `className` prop

**React 18 fallback** — если в проекте `forwardRef` обязателен (см.
`anatomy.md` секция "React 18 fallback"), оберни Button в
`React.forwardRef<HTMLButtonElement, ButtonProps>` и добавь `Button.displayName = 'Button'`.

---

## Стандартные variant names

Используй имена из shadcn — это convention, которую все знают:

| Вариант | Когда |
|---------|-------|
| `default` | Главное действие на форме / экране |
| `destructive` | Удаление, опасные действия |
| `outline` | Вторичные действия (Cancel, Edit) |
| `secondary` | Альтернатива default, менее заметная |
| `ghost` | Tooltips, icon-only кнопки в таблицах |
| `link` | Inline-ссылка стилизованная как текст |

**Не изобретай**: не делай `primary`, `success`, `info`, `warning` без
веских причин. shadcn-набор покрывает 90% случаев.

### Когда стоит расширить

- **Status badges**: добавь `success`, `warning` (но не для buttons — там
  destructive ближе)
- **Brand-specific accents**: если у проекта яркий брендовый цвет, отличный
  от primary

---

## Размерная шкала (size)

### Default 3-4 размера

- `sm` — для плотных интерфейсов (таблицы, фильтры)
- `md` (default) — стандарт для форм и кнопок действий
- `lg` — для CTA на лендингах и важных решений
- `icon` — квадратная для иконки без текста

**Не делай больше 4 размеров**. `xs` и `xl` редко нужны и создают шум.

### Высоты компонентов (для согласованности)

Согласуй высоты между связанными компонентами:

| Размер | Button | Input | Select |
|--------|--------|-------|--------|
| `sm` | `h-8` | `h-8` | `h-8` |
| `md` | `h-9` | `h-9` | `h-9` |
| `lg` | `h-10` | `h-10` | `h-10` |

Иначе при размещении рядом получишь визуальный рассинхрон (Button 36px,
Input 40px рядом — глаз цепляется).

### Mobile considerations

`md` (h-9 = 36px) — окей для desktop, но **меньше чем 44px touch target**
для mobile.

Решения:
- Везде `lg` на mobile: `<Button size={isMobile ? 'lg' : 'md'}>`
- Или больше padding по вертикали через `py-2.5`

---

## States — все интерактивные состояния

Это **самая частая зона ошибок**. Большинство компонентов покрывают только
hover. Полный набор состояний:

| State | Tailwind | Когда |
|-------|----------|-------|
| `default` | (без модификатора) | Всегда |
| `hover` | `hover:` | Cursor над элементом |
| `focus-visible` | `focus-visible:` | Keyboard navigation (НЕ `focus:`) |
| `active` | `active:` | Момент нажатия |
| `disabled` | `disabled:` или `aria-disabled:` | Недоступно для взаимодействия |
| `loading` | через prop / data-attribute | Идёт async-операция |
| `selected` / `checked` | `data-[state=checked]:` (Radix) | Активное состояние |
| `aria-invalid` | `aria-invalid:` | Ошибка валидации (formfield) |

### Пример полного покрытия (Button)

```tsx
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium',
    'transition-colors',
    // Base focus styles (важно — focus-visible, не focus)
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    // Disabled
    'disabled:pointer-events-none disabled:opacity-50',
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90',
          'active:bg-primary/95',
        ),
        outline: cn(
          'border border-input bg-background',
          'hover:bg-accent hover:text-accent-foreground',
          'active:bg-accent/80',
        ),
      },
    },
  },
);
```

### `focus` vs `focus-visible`

- `focus:` — срабатывает на любом фокусе (mouse click + keyboard + programmatic focus). Для button/link это означает кольцо при mouse click — выглядит избыточно.
- `focus-visible:` — срабатывает по эвристике браузера. Для button/link обычно не активируется при mouse click, но активируется при keyboard nav и programmatic focus. Для `<input>` срабатывает почти всегда (там focus ring уместен независимо от способа фокусировки).

**Правило**: используй `focus-visible:` для focus ring везде. На практике
это даёт правильное поведение для всех типов interactive-элементов:
inputs светятся при любом focus (нужно для UX), button/link — только при
keyboard (mouse users видят click feedback через `:active`).

### Loading state

Loading — не CSS-состояние, это prop:

```tsx
interface ButtonProps {
  loading?: boolean;
}

<Button disabled={loading || disabled}>
  {loading ? <Spinner className="h-4 w-4" /> : children}
</Button>
```

Или через `data-attribute` для CSS-styling:

```tsx
<button data-loading={loading ? 'true' : undefined}>
```

```css
[data-loading="true"] .button-text { opacity: 0; }
[data-loading="true"]::before {
  content: '';
  /* spinner */
}
```

---

## Compound Variants

Для случаев когда комбинация двух variants требует особого стиля:

```tsx
const buttonVariants = cva(/* ... */, {
  variants: {
    variant: { default: ..., destructive: ... },
    size: { sm: ..., md: ..., icon: ... },
  },
  compoundVariants: [
    {
      variant: 'destructive',
      size: 'icon',
      class: 'border border-destructive/20',  // только для destructive + icon
    },
  ],
});
```

Использовать редко. Если часто нужны compound — пересмотри organization,
возможно ось variants построена неправильно.

---

## Anti-patterns (что не делать)

### 1. Цепочка `cn()` с условиями

```tsx
// Плохо
<button className={cn(
  'rounded-md px-4',
  variant === 'primary' && 'bg-primary text-white',
  variant === 'outline' && 'border border-input',
  size === 'sm' && 'h-8 text-xs',
  size === 'md' && 'h-9',
)}>
```

Невозможно поддерживать. Используй CVA.

### 2. Объединение независимых осей в один variant

```tsx
// Плохо — variant и size в одной оси
variants: {
  type: {
    'primary-sm': '...',
    'primary-md': '...',
    'outline-sm': '...',
    'outline-md': '...',
  }
}
```

С 4 variants и 3 sizes получишь 12 значений. Делай две оси.

### 3. Inline-стили вместо variants

```tsx
// Плохо
<Button style={{ backgroundColor: 'red' }}>Delete</Button>

// Хорошо
<Button variant="destructive">Delete</Button>
```

### 4. State через props, а не через CSS

```tsx
// Плохо
<Button hover={isHovered}>Click</Button>

// Хорошо — CSS обрабатывает hover сам
<Button>Click</Button>
```

### 5. Variants для one-off случаев

Если вариант используется один раз — не добавляй его в CVA. Лучше
переопредели через `className`:

```tsx
<Button className="bg-amber-500 hover:bg-amber-600">Special</Button>
```

В CVA попадает только то, что используется хотя бы 3+ раз.

---

## Часто забываемое

- **`focus-visible:` вместо `focus:`** — лучший keyboard UX
- **`disabled:opacity-50` + `pointer-events-none`** — иначе на disabled
  кнопке всё ещё работает hover
- **transition только на нужных свойствах** — `transition-colors`, не
  `transition-all` (последнее тормозит)
- **`pointer-events-none` на disabled** — без него кнопка кликается через
  ребёнка
- **`whitespace-nowrap` на Button** — иначе длинный текст ломает высоту
- **`shrink-0` на иконках внутри Button** — иначе при длинном тексте
  иконка сожмётся
- **`gap-2` вместо `space-x-2`** — `gap` корректнее работает с flex и
  не ломается при reverse direction
- **`aria-invalid` styling в Inputs** — `aria-invalid:border-destructive`
- **Loading state блокирует двойной submit** — параллельно с `disabled`
