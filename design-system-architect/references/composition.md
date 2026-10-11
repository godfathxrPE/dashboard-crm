# Composition Patterns

Composition — как из примитивов собирать сложные UI. Хорошая composition =
сложность инкапсулирована, переиспользуемые блоки видны.

---

## Three Tiers

```
Tier 1: Primitives (shadcn/ui)
   └── Button, Input, Card, Dialog, Select
       └── Низкоуровневые, не знают про твою бизнес-логику

Tier 2: Patterns (твои composition blocks)
   └── DataTable, EntityCard, ConfirmDialog, FilterBar
       └── Composed primitives, знают про шаблоны (но не про конкретные сущности)

Tier 3: Templates (page-level)
   └── ClientsPage, OrderDetailsPage
       └── Конкретные применения patterns
```

**Правило**: компонент в `components/ui/` (Tier 1) **не должен знать про
бизнес**. Он не импортирует из `lib/api/`, не имеет prop `clientId`, не
содержит русского текста кроме общих ("Закрыть", "Сохранить").

Компонент в `components/patterns/` (Tier 2) знает про шаблоны (как выглядит
DataTable вообще), но не про конкретные сущности.

Компонент в страницах / features (Tier 3) — тут уже бизнес.

---

## Tier 2 Examples (Patterns)

### ConfirmDialog

```tsx
// src/components/patterns/ConfirmDialog.tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-destructive hover:bg-destructive/90' : ''}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Использование:

```tsx
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Удалить клиента?"
  description="Это действие нельзя отменить."
  destructive
  confirmLabel="Удалить"
  onConfirm={() => deleteClient(id)}
/>
```

Один компонент покрывает 90% подтверждающих диалогов в проекте.

### EmptyState

```tsx
// src/components/patterns/EmptyState.tsx
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

### PageHeader

```tsx
// src/components/patterns/PageHeader.tsx
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-6', className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
```

---

## Composition vs Configuration

Два подхода к API:

### Configuration (через props)

```tsx
<DataTable
  columns={columns}
  data={data}
  showFilters
  filterableColumns={['status', 'date']}
  showPagination
  pageSize={20}
  emptyMessage="Нет данных"
/>
```

- Плюсы: декларативно, всё в одном месте
- Минусы: компонент быстро разрастается до 30+ props, негибко

### Composition (через children)

```tsx
<DataTable>
  <DataTableHeader>
    <DataTableFilters>
      <FilterByStatus />
      <FilterByDate />
    </DataTableFilters>
  </DataTableHeader>
  <DataTableBody columns={columns} data={data} />
  <DataTableFooter>
    <DataTablePagination pageSize={20} />
  </DataTableFooter>
</DataTable>
```

- Плюсы: гибкость, легко расширять
- Минусы: больше кода, больше impors

### Когда какой

| Критерий | Configuration | Composition |
|----------|---------------|-------------|
| 95% использований одинаковы | ✓ | |
| Регулярно нужны разные структуры | | ✓ |
| Маленькая команда, единый стиль | ✓ | |
| Несколько команд, разные нужды | | ✓ |
| Простой компонент (Button, Input) | ✓ | |
| Сложный layout (Card, Dialog, Table) | | ✓ |

**Гибрид (рекомендуется для сложных)**: composition внутри, преднастроенный
Configuration наружу:

```tsx
// Низкий уровень — composition
export { DataTable, DataTableHeader, DataTableBody, ... };

// Высокий уровень — convenience wrapper
export function StandardDataTable<T>({
  columns,
  data,
  filters,
  emptyMessage,
}: Props<T>) {
  return (
    <DataTable>
      <DataTableHeader>
        <DataTableFilters>{filters}</DataTableFilters>
      </DataTableHeader>
      <DataTableBody columns={columns} data={data} />
    </DataTable>
  );
}
```

90% случаев — `<StandardDataTable>`. 10% когда нужно нестандартно — собирай
из примитивов.

---

## React.cloneElement и Context API

Когда нужно передать данные между compound components без props:

### React Context (default для compound)

```tsx
// src/components/ui/tabs.tsx
const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

const Tabs = ({ value, onValueChange, children }) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div>{children}</div>
  </TabsContext.Provider>
);

const TabsTrigger = ({ value, children }) => {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('TabsTrigger must be inside Tabs');

  return (
    <button
      data-state={ctx.value === value ? 'active' : 'inactive'}
      onClick={() => ctx.onValueChange(value)}
    >
      {children}
    </button>
  );
};
```

**Это паттерн Radix** — посмотри как сделано в shadcn/ui компонентах,
они почти все используют Context.

### `cloneElement` (legacy)

```tsx
// Не рекомендуется
{React.Children.map(children, (child) =>
  React.cloneElement(child, { someProp: value })
)}
```

Не используй в новом коде. Context чище и не теряет рефы.

---

## When to extract a Pattern

Не каждое использование заслуживает отдельного компонента. Правило:

| Сигнал | Действие |
|--------|----------|
| Используется 1 раз | Inline в странице |
| Используется 2-3 раза с похожим shape | Inline + копипаста (DRY ещё не нужен) |
| Используется 3+ раз с одинаковым shape | **Extract to pattern** |
| Используется во многих местах с разнообразными вариациями | Extract + продумать API через variants |

**Преждевременное извлечение** хуже копипасты. Если выделил pattern на 2-м
использовании, на 3-м поймёшь, что shape другой и pattern не подходит —
придётся ломать.

---

## Часто забываемое

- **Tier boundary** — не импортируй бизнес-логику в Tier 1 (`components/ui/`)
- **Не передавай конкретные children через props** — `<Card title="..." bodyContent={<>}>` плохо. Используй composition.
- **`React.Children.map` сохраняет keys** — но не использует если children — fragment. Будь осторожен.
- **Context для compound components** — стандарт, не избегай его
- **Server vs Client Components** — compound с Context требуют `'use client'` целиком. Если нужен SSR — раздели на серверный wrapper и клиентскую интерактивную часть.
- **React 19: function component без `forwardRef`** в pattern-уровне — `ref` это обычный prop. На React 18 — оборачивай в `forwardRef` для DataTable, Form-обёрток, всего что встраивается в RHF
- **`displayName`** — нужен только для React 18 + `forwardRef`. Без него DevTools показывает `_c12`. На React 19 — function name виден автоматически
- **Минимизируй prop drilling** — больше 2 уровней передачи через props = время для context
- **Документируй обязательность parent** — `TabsTrigger` без `Tabs` снаружи — должно быть явно (через runtime error или TS)
