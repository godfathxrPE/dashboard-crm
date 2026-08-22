# Sprint 6 — Integration Notes

## CommandPalette + Hotkeys

Эти два компонента нужно добавить в **существующий** `src/app/(dashboard)/layout.tsx`.

Открой файл и добавь два импорта в начало:

```tsx
import { CommandPalette } from '@/components/shared/CommandPalette';
import { Hotkeys } from '@/components/shared/Hotkeys';
```

Затем внутри JSX, рядом с `{children}`, добавь:

```tsx
<CommandPalette />
<Hotkeys />
```

Например, если layout выглядит так:

```tsx
return (
  <div className="flex h-screen">
    <Sidebar />
    <main className="flex-1 overflow-auto p-6">
      {children}
    </main>
  </div>
);
```

Сделай так:

```tsx
return (
  <div className="flex h-screen">
    <Sidebar />
    <main className="flex-1 overflow-auto p-6">
      {children}
    </main>
    <CommandPalette />
    <Hotkeys />
  </div>
);
```

## Recharts dependency

Recharts уже должен быть в package.json из Sprint 0. Если нет:

```bash
npm install recharts
```

## Hotkeys Reference

- `Cmd+K` / `Ctrl+K` — Command Palette
- `g` then `d` — Dashboard
- `g` then `t` — Tasks
- `g` then `p` — Projects
- `g` then `c` — Calls
- `g` then `m` — Meetings
- `g` then `o` — Companies
- `g` then `n` — Contacts
- `g` then `a` — Analytics
