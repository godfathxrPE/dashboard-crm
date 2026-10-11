# Governance

Поддержание DS живой — соглашения, документация, ADR, что делать когда DS
расходится с реальностью.

DS без governance быстро превращается в legacy, разработчики начинают писать
"в обход" — копировать стили, делать свои варианты вместо использования
существующих.

---

## Decision Records (ADR)

ADR (Architecture Decision Record) — короткий документ для каждого
существенного решения в DS. Формат:

```markdown
# ADR-001: Использовать CVA для variants

**Дата**: 2025-04-15
**Статус**: Принято

## Контекст
Нужно стандартизировать организацию вариантов компонентов. Альтернативы:
ручные cn() с условиями, отдельные компоненты, CSS-in-JS, CVA.

## Решение
Используем CVA как стандарт shadcn-экосистемы.

## Последствия
+ Типобезопасные варианты
+ Согласованность с shadcn-обновлениями
+ Нет тяжёлой runtime CSS-in-JS
- Дополнительная зависимость
- Crew должен изучить CVA API
```

**Где хранить**: `docs/adr/001-use-cva-for-variants.md` или в Notion
(твой стек).

**Когда писать ADR**:
- Выбор библиотеки (CVA vs Stitches vs vanilla)
- Изменение naming conventions
- Принципиальное решение по архитектуре (composition vs configuration)
- Отход от shadcn-defaults

**Когда НЕ писать ADR**:
- Добавление нового компонента
- Кастомизация цвета
- Bugfix
- Косметика

---

## Living Documentation

Документация в коде — лучше, чем в Notion (она не устаревает).

### 1. JSDoc для компонентов

```tsx
/**
 * Primary button component.
 *
 * @example
 * <Button variant="default" size="md">Save</Button>
 *
 * @example
 * // As a link
 * <Button asChild>
 *   <Link href="/dashboard">Dashboard</Link>
 * </Button>
 */
const Button = React.forwardRef<...>(...)
```

JSDoc показывается в IDE на hover — DX-улучшение.

### 2. Storybook (опционально)

Для DS с 20+ компонентами Storybook оправдан. Для маленьких проектов —
overkill.

```tsx
// button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'icon'],
    },
  },
};

export default meta;

export const Default: StoryObj<typeof Button> = {
  args: { children: 'Click me' },
};

export const Loading: StoryObj<typeof Button> = {
  args: { children: 'Submitting...', loading: true },
};
```

**Альтернатива Storybook** — простая `app/playground/page.tsx` с примерами
всех компонентов. Дешевле, чем Storybook, для маленьких команд достаточно.

### 3. README в компоненте

Если компонент сложный — README рядом:

```
src/components/ui/data-table/
├── DataTable.tsx
├── DataTableHeader.tsx
├── DataTablePagination.tsx
└── README.md            ← устройство, примеры, пропсы
```

---

## Conventions (что зафиксировать)

### Naming

- **CSS variables**: `--{slot}-{role}` (semantic), `--{color}-{shade}` (primitive)
- **Component files**: `kebab-case.tsx` (`button.tsx`, `data-table.tsx`)
- **Component exports**: `PascalCase` (`Button`, `DataTable`)
- **CVA exports**: `{component}Variants` (`buttonVariants`, `cardVariants`)
- **Type exports**: `{Component}Props` (`ButtonProps`)

### Folder structure

```
src/
├── components/
│   ├── ui/              ← shadcn primitives (Tier 1)
│   ├── patterns/        ← собственные composition (Tier 2)
│   ├── layouts/         ← page-level layouts
│   └── features/        ← business components (Tier 3)
└── lib/
    └── utils.ts         ← cn() utility, стандарт shadcn (НЕ @/lib/cn)
```

### Imports

```tsx
// Внутри ui/ — не импортируй из patterns/
// Внутри patterns/ — не импортируй из features/
// Однонаправленность: features → patterns → ui
```

### Component file structure (React 19 default)

```tsx
'use client';  // если нужно

// 1. Imports (внешние)
import { cva, type VariantProps } from 'class-variance-authority';

// 2. Imports (внутренние)
import { cn } from '@/lib/utils';

// 3. Variants (CVA)
const componentVariants = cva(...);

// 4. Types
type ComponentProps = React.ComponentProps<'div'> &
  VariantProps<typeof componentVariants> & {
    // дополнительные props
  };

// 5. Component (function component, без forwardRef для React 19)
function Component({ className, ...props }: ComponentProps) {
  return (
    <div
      data-slot="component"
      className={cn(componentVariants({ ...props, className }))}
      {...props}
    />
  );
}

// 6. Exports
export { Component, componentVariants };
export type { ComponentProps };
```

### React 18 fallback

В проектах на React 18 — `React.forwardRef<...>` + `Component.displayName = 'Component'` обязательны. См. `anatomy.md` секция "React 18 fallback".

---

## Process: добавление нового компонента

```
1. Нужен новый компонент.
   ├── Есть в shadcn? → npx shadcn add ...
   └── Нет?
       ├── Существует в библиотеках (Radix, Headless UI)?
       │   → Обернуть в свой компонент
       └── Нет?
           → Написать с нуля (используя Radix primitives при возможности)

2. Подбор имени
   ├── Используется уже подобное? → consistent naming
   └── Нет → описательное (DataTable, не SuperGrid)

3. API
   ├── Single-element? → один компонент с props
   └── Compound? → несколько exports + Context

4. Variants
   ├── Несколько визуальных вариантов? → CVA
   └── Нет → без variants

5. States
   ├── focus-visible
   ├── disabled (pointer-events-none + opacity-50)
   ├── hover
   └── loading (если applicable)

6. forwardRef + displayName

7. JSDoc + один example

8. Использовать в реальной фиче (не складывать "впрок")

9. Если использовалось 2+ раза успешно → официально часть DS
```

---

## Process: при росте DS

### Сигналы что DS требует "уборки"

- 🚨 **Найдены 3+ варианта одного компонента** в разных частях приложения
  (`Modal` в одном месте, `Dialog` в другом, `Popup` в третьем — всё одно
  и то же)
- 🚨 **Регулярно копируют стили вместо использования компонентов** —
  значит компонента нет или его API неудобен
- 🚨 **PR-ревью часто включает "поправь стили"** — нет конвенций
- 🚨 **Дизайнер и разработчик расходятся в named** — token называется
  `--primary`, дизайнер говорит `accent`
- 🚨 **Новые разработчики долго ищут как сделать X** — нет examples

### Что делать

- **Audit раз в квартал** — пройти audit-checklist.md, отметить дрейф
- **Refactor sprint** — выделить время на DS-долг отдельно от фич
- **Component governance meeting** — раз в месяц обсуждать что добавить /
  убрать (для команды; для соло — записывать в TODO)

---

## Anti-patterns в governance

### 1. "Я придумал свой вариант, добавлю в проект"

Без обсуждения — это создаёт несогласованность. Любое решение по DS должно
быть обосновано (хотя бы перед собой).

### 2. Переименование без миграции

"Изменили `--accent` на `--brand`" — но не обновили компоненты. Ломаются
старые места.

### 3. DS как side-project

Если на DS не выделено времени, разработчики обходят его. DS должна быть
частью feature-разработки.

### 4. Документация в "ещё одном Notion-документе"

Если её никто не находит — её нет. Документация рядом с кодом
(JSDoc / README).

### 5. Нет owner

В команде должен быть один человек, ответственный за DS (даже если на 10%
времени). Иначе никто не следит за дрейфом.

---

## Часто забываемое

- **ADR пишутся коротко** — 1 страница максимум. Длиннее — никто не читает
- **Документация — обязанность того, кто меняет** — не оставляй на "потом"
- **Storybook не для всех** — оцени стоимость поддержки
- **Используй deprecation warnings** — `@deprecated use ... instead` в JSDoc,
  ESLint правило `deprecated/deprecated`
- **Версии DS** — для крупных команд packages с semver. Для маленьких — git history
- **Migration guides** — при breaking changes (изменение API компонента) —
  короткий guide "как обновиться"
- **Components inventory** — список всех компонентов в Notion / readme,
  обновляется при добавлении
- **Метрика — количество inline-overrides** — снижается со временем =
  DS улучшается
