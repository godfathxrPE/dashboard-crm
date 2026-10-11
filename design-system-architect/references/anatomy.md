# Component Anatomy

Anatomy — внутренняя структура одного компонента: какие у него slots, какой
props API, как его расширять. Хороший anatomy = компонент гибкий и
консистентный одновременно.

---

## Modern shadcn pattern (React 19 + Tailwind v4)

Актуальный shadcn (после ребрендинга на Tailwind v4 / React 19) использует
**function components без `forwardRef`** и **`data-slot` атрибуты** для
compound parts.

### Что изменилось vs старого паттерна

| Что | Старый (React 18 / shadcn 2023) | Современный (React 19 / shadcn 2024+) |
|------|--------------------------------|----------------------------------------|
| Component declaration | `React.forwardRef<HTMLDivElement, Props>(...)` | `function Card({...}: React.ComponentProps<"div">)` |
| Ref handling | `ref` через 2-й аргумент `forwardRef` | `ref` — обычный prop (React 19 native) |
| Display name | `Card.displayName = 'Card'` обязателен | Не нужен — function name виден в DevTools |
| Slot identification | Имя компонента (`CardHeader`) | `data-slot="card-header"` атрибут |
| CSS targeting compound | Импорт всех частей и стиль через JSX | `[data-slot=card-action]` селектор |

### Почему `data-slot`

Позволяет писать **sibling-aware стили** в Tailwind без знания о структуре
снаружи. Например, у `CardHeader` может быть особый layout, если внутри
есть `CardAction`:

```tsx
<div
  data-slot="card-header"
  className="grid auto-rows-min gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]"
/>
```

Здесь `has-data-[slot=card-action]:grid-cols-[1fr_auto]` срабатывает только
когда внутри есть element с `data-slot="card-action"`. Без `data-slot`
такое было невозможно без runtime-проверок.

---

## Single-element vs Compound

Два подхода к API:

### Single-element (Button-style)

```tsx
<Button variant="default" size="md" disabled>
  <Mail className="h-4 w-4" />
  Send email
</Button>
```

- Один компонент, всё через props и children
- Подходит когда есть очевидный "main" element и максимум 1-2 "slots"
- shadcn Button, Input, Badge

### Compound (Card-style, Dialog-style)

```tsx
<Card>
  <CardHeader>
    <CardTitle>Заголовок</CardTitle>
    <CardDescription>Описание</CardDescription>
    <CardAction>
      <Button variant="ghost" size="icon">
        <MoreHorizontal />
      </Button>
    </CardAction>
  </CardHeader>
  <CardContent>
    <p>Контент карточки</p>
  </CardContent>
  <CardFooter>
    <Button>OK</Button>
  </CardFooter>
</Card>
```

- Несколько связанных компонентов, экспортируются вместе
- Подходит когда у компонента 3+ области с разной семантикой
- shadcn Card, Dialog, Tabs, Accordion, Sheet

### Когда какой выбрать

| Критерий | Single-element | Compound |
|----------|----------------|----------|
| Простой компонент с 1-2 областями | ✓ | |
| 3+ семантически разных области | | ✓ |
| Гибкость порядка/структуры важна | | ✓ |
| Просто стилизованная обёртка | ✓ | |
| Будет переиспользоваться часто, но в разных вариациях | | ✓ |

**Правило:** если приходится передавать `header`, `body`, `footer` как
отдельные пропсы — это compound по душе. Не делай это через пропсы.

---

## Compound Components Pattern (React 19 default)

```tsx
// src/components/ui/card.tsx
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6', className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
};
```

### Что важно в этом примере

1. **Function components без `forwardRef`** — в React 19 `ref` это обычный prop, а `React.ComponentProps<'div'>` уже включает `ref`. Никакого `displayName` тоже не нужно.
2. **`data-slot="..."` на каждом части** — позволяет sibling-aware стили (`has-data-[slot=card-action]:...`) и упрощает CSS-targeting.
3. **`cn(default, className)`** — снаружи можно переопределить любой класс.
4. **`{...props}`** — все нативные атрибуты прокидываются (для `aria-*`, `data-*`, обработчиков, в т.ч. `ref`).
5. **Семантика через div + data-slot, не разные теги** — современный shadcn чаще использует `<div>` с `data-slot` вместо `<h3>`/`<p>`. Если нужна именно семантика заголовка — добавь `as` через polymorphism или используй специализированный компонент `<Heading>`.

---

## Slot pattern (`asChild`)

Иногда нужно, чтобы компонент рендерил другой элемент (Link вместо button,
кастомный wrapper):

```tsx
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(/* ... */);

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
```

Использование:

```tsx
// Обычный button
<Button variant="default">Click</Button>

// Link, который выглядит как button (для Next.js)
<Button variant="default" asChild>
  <Link href="/dashboard">Dashboard</Link>
</Button>
```

`Slot` "снимает" внешний `<button>` и применяет все его пропсы и классы к
ребёнку (`<a>`).

**Когда использовать:**

- Кнопка-ссылка (Link)
- Trigger для Dialog/Tooltip/Dropdown (Radix использует это везде)
- Wrapper-компоненты, где главное — стили, а тег на усмотрение

---

## Props API Design

### Базовый набор (React 19 default)

```tsx
type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };
```

`React.ComponentProps<'button'>` включает все нативные атрибуты button +
`ref` + `className`. Не нужно ничего extends-ить вручную.

### Конвенции для имён пропсов

| Тип проп | Имя | Пример |
|---------|-----|--------|
| Boolean state | `is*` или просто слово | `loading`, `disabled`, `selected` |
| Boolean preference | `show*` / `hide*` | `showIcon`, `hideHeader` |
| Callback | `on*` | `onClick`, `onValueChange` |
| Async callback | `on*` (возвращает Promise) | `onSubmit` |
| Render prop / element | `*Element` | `iconElement`, `triggerElement` |
| Variant | имя оси | `variant`, `size`, `tone` |

### Чего НЕ делать

- **Не дублируй ComponentProps**: не добавляй `onClick`, `id`, `style` — они уже есть.
- **Не используй "magic" props**: `magic={true}` — что значит? Всегда ясные имена.
- **Не делай controlled-only без default value**: если `value` обязателен, компонент негибкий. Дай default или сделай controlled+uncontrolled.

### Controlled / Uncontrolled

Если компонент управляет состоянием (Tabs, Accordion, Dialog) — поддержи
оба режима:

```tsx
type DialogProps = {
  open?: boolean;                          // controlled
  defaultOpen?: boolean;                   // uncontrolled с default
  onOpenChange?: (open: boolean) => void;  // controlled callback
};
```

Radix делает это правильно — копируй паттерн.

---

## React 18 fallback (forwardRef pattern)

Если проект ещё на React 18 — используй `forwardRef` + `displayName`. В
React 18 `ref` НЕ является обычным prop, требуется специальный API:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card"
    className={cn(
      'rounded-xl border bg-card text-card-foreground shadow-sm',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card-header"
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// ... остальные части аналогично
```

**Почему `forwardRef` в React 18 обязателен для интерактивных
компонентов**:

- Любой компонент, который может быть target для focus
- Любой компонент, который встраивается в формы (RHF использует ref)
- Любой компонент, который оборачивается в Tooltip/Popover (нужен ref для positioning)

**Почему `displayName` в React 18 обязателен после `forwardRef`**:

Без него в DevTools отображается `_c12`, `Anonymous` — невозможно
дебажить.

`data-slot` — добавляй и в React 18, он не зависит от React-версии.

---

## Polymorphic Components

Если компонент должен принимать `as` prop (рендерить как `<a>`, `<button>`,
`<div>`):

**Простой случай — `asChild`** (Radix Slot):

```tsx
<Button asChild>
  <a href="/">Link</a>
</Button>
```

**Сложный случай — настоящий polymorphism**:

```tsx
type AsProps<C extends React.ElementType> = {
  as?: C;
} & React.ComponentPropsWithoutRef<C>;

function Heading<C extends React.ElementType = 'h2'>({
  as,
  children,
  ...props
}: AsProps<C>) {
  const Component = as || 'h2';
  return <Component {...props}>{children}</Component>;
}

<Heading as="h1">Title</Heading>
<Heading as="span">Inline title</Heading>
```

**Не делай polymorphism для всего**. Это сложно типизировать и поддерживать.
Для большинства случаев `asChild` достаточно.

---

## Часто забываемое

- **`data-slot="..."` на каждой части compound** — позволяет sibling-aware стили и упрощает CSS-targeting
- **React 19: function component без `forwardRef`** — `ref` через props, `displayName` не нужен
- **React 18: `forwardRef` + `displayName` обязательны** — иначе focus, RHF, Tooltip ломаются
- **Семантические теги или `data-slot`** — современный shadcn часто использует `<div>` + `data-slot` вместо `<h3>`/`<p>`. Если нужна именно семантика заголовка для screen reader — обеспечь её отдельно (через `as` или `<Heading>`)
- **`children` как самая гибкая prop** — позволь использовать любой контент
- **Не передавай контент через JSON-prop** — `<Card titleText="..." bodyText="...">` это плохо. Используй children или slots.
- **Проверь, что `className` снаружи переопределяет внутренние классы** — через `cn()` правильно, через прямую конкатенацию `+` плохо
- **Изолируй стили**: Card не должен задавать стили своему ребёнку через `[&>*]:p-4` без необходимости. Лучше использовать compound (CardContent с padding).
- **Документируй non-obvious prop combinations** — JSDoc для `asChild`, для обязательных combinations
- **Поддержи `data-state` для Radix-driven компонентов** — позволит снаружи подписаться на состояние через CSS (`[data-state=open]:rotate-180`)
- **`React.ComponentProps<'button'>`** vs `React.ButtonHTMLAttributes<HTMLButtonElement>` — первый короче и включает `ref` (React 19), используй его
