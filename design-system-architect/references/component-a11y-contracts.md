# Component A11y Contracts

Поведенческие a11y-контракты компонентов на этапе проектирования anatomy +
variants. Это **не** глубокий a11y-аудит (для него — `a11y-auditor`).

Здесь только: **что компонент должен уметь по части keyboard, focus и ARIA,
чтобы быть пригодным для использования.** Дизайн-система отвечает за
поведение, не только за внешний вид.

---

## Принципы

1. **Reuse, don't reinvent**: для интерактивных компонентов используй Radix
   primitives или `react-aria` / `cmdk`. Они закрывают a11y-контракты из
   коробки. Реализация руками почти всегда что-то упустит.
2. **`focus-visible:` для focus ring**: не `focus:`. См. `variants.md`.
3. **`ref` достижим извне** для интерактивных компонентов: на React 19 — это обычный prop в function component (через `React.ComponentProps<...>`), на React 18 — через `forwardRef`. Без этого focus-management извне не работает.
4. **Семантические HTML-теги**: `<button>` для button, `<a>` для links,
   `<h3>` для заголовков. `<div onClick>` — не альтернатива.

---

## Per-component contracts

### Button

| Контракт | Реализация |
|----------|------------|
| Keyboard activation | `<button>` тег. `Enter` и `Space` срабатывают по нативу |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` |
| Disabled | `disabled` + `disabled:pointer-events-none disabled:opacity-50` |
| Loading | `disabled` пока loading, чтобы не было double-submit |
| Icon-only | обязательно `aria-label` или `<span className="sr-only">` |

```tsx
<Button size="icon" aria-label="Удалить">
  <Trash className="h-4 w-4" />
</Button>
```

### Input / Textarea

| Контракт | Реализация |
|----------|------------|
| Label | `<Label htmlFor={id}>` или `aria-label` (last resort) |
| Error state | `aria-invalid={hasError}` + `aria-describedby={errorId}` |
| Required | `required` атрибут + визуальная индикация (`*` рядом с label) |
| Placeholder ≠ label | placeholder исчезает при вводе, label остаётся |

```tsx
<div>
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    aria-invalid={!!error}
    aria-describedby={error ? 'email-error' : undefined}
  />
  {error && <span id="email-error" className="text-destructive">{error}</span>}
</div>
```

### Dialog / Modal

| Контракт | Реализация |
|----------|------------|
| Focus trap | Tab не уводит фокус за модалку | Используй Radix Dialog |
| Initial focus | при открытии — на первый interactive или close button | Radix делает |
| Return focus | при закрытии — на trigger | Radix делает |
| Escape closes | `Esc` закрывает | Radix делает |
| Click outside | overlay close по клику (опционально) | Radix делает |
| Title required | `<DialogTitle>` обязателен для screen reader | shadcn enforces |
| Description | `<DialogDescription>` если есть body |

**Не пиши Dialog с нуля.** shadcn Dialog (на Radix) покрывает весь
контракт. Если нужна кастомизация — на уровне стилей, не структуры.

### Popover / Tooltip

| Контракт | Реализация |
|----------|------------|
| Keyboard accessible | trigger фокусируется, `Enter`/`Space` открывает | Radix |
| Escape closes | `Esc` закрывает | Radix |
| Hover + focus parity | tooltip открывается и на hover, и на focus | Radix |
| Critical info NOT in tooltip | tooltip может быть не доступен на touch — не клади туда важное |
| `aria-describedby` linking | trigger связан с tooltip | Radix |

### Select / Combobox / Listbox

| Контракт | Реализация |
|----------|------------|
| Arrow keys navigation | ↑/↓ перемещают активный item | используй Radix Select или `cmdk` |
| Enter selects | `Enter` выбирает активный | Radix/cmdk |
| Escape closes | `Esc` закрывает | Radix/cmdk |
| Type-ahead | начало печати фокусирует matching item | Radix Select делает |
| `aria-activedescendant` или `aria-selected` | для отметки активного | Radix/cmdk |
| Search input focus | при открытии Combobox — фокус на search | shadcn Command делает |

**Combobox с server-side search** — используй `cmdk` для базы, добавь
дебаунс и loading state. Не пиши listbox-логику сам.

### Tabs

| Контракт | Реализация |
|----------|------------|
| Arrow keys между табами | `→` / `←` (или `↑` / `↓` для вертикальных) | Radix Tabs |
| `Home` / `End` — первый / последний | Radix Tabs |
| Activation — automatic vs manual | `automatic` (default): focus = active. `manual`: focus, потом Enter | Radix позволяет выбрать |
| `role="tablist"`, `role="tab"`, `role="tabpanel"` | Radix |
| `aria-selected` / `aria-controls` | Radix |

```tsx
<Tabs defaultValue="overview" activationMode="manual">
  <TabsList>...</TabsList>
  <TabsContent value="overview">...</TabsContent>
</Tabs>
```

`activationMode="manual"` лучше для табов с тяжёлым контентом — пользователь
может перейти к нужному, не загружая каждый промежуточный.

### DropdownMenu / ContextMenu

| Контракт | Реализация |
|----------|------------|
| Arrow keys между items | Radix DropdownMenu |
| Type-ahead | начало печати фокусирует matching item | Radix |
| Submenu — `→` открывает, `←` закрывает | Radix |
| Keyboard shortcuts отображаются | через `<DropdownMenuShortcut>` (визуально), реальные shortcuts — отдельно |

### Accordion / Disclosure

| Контракт | Реализация |
|----------|------------|
| `<button>` как trigger (не `<div>`) | Radix |
| `aria-expanded` на trigger | Radix |
| `aria-controls` на trigger | Radix |
| `Enter` / `Space` toggles | по нативу |

### Switch / Checkbox / Radio

| Контракт | Реализация |
|----------|------------|
| Keyboard: `Space` toggles (Switch, Checkbox), arrow keys между Radio | Radix |
| `role="switch"` для Switch | Radix |
| Связан с `<Label>` через `htmlFor` или wrapping | shadcn делает |
| `aria-checked` (для custom-control) | Radix |

---

## Universal contracts (для всех)

### Touch targets

- Минимум **44×44px** для primary actions на mobile (Apple HIG)
- В CRM/desktop-only можно меньше (32-36px), но в mobile-friendly app — 44px
- Используй `h-10 min-w-10` или больше для кнопок и icon-кнопок

### `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Или для конкретных компонентов в Tailwind:

```tsx
<div className="transition-all motion-reduce:transition-none">
```

### Skip links

Для длинных страниц добавь skip-link в начало layout:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-skipLink"
>
  Перейти к основному контенту
</a>
```

### Live regions для async updates

Toasts, инлайн-валидация, прогресс — должны озвучиваться screen reader:

```tsx
<div role="status" aria-live="polite">
  {message}
</div>
```

`aria-live="polite"` — для не-критичных обновлений. `aria-live="assertive"`
— только для критичных (error, blocking issue).

---

## Что в этом скилле НЕ покрывается

Эти задачи — за `a11y-auditor`:

- WCAG compliance audit (A / AA / AAA targets)
- Color contrast ratios (APCA / WCAG)
- Screen reader testing (NVDA, VoiceOver, JAWS)
- Полный keyboard navigation traversal страницы
- Reduced-motion deep audit
- Локализация ARIA-меток

**Когда пользователь спрашивает "проверь моё приложение на WCAG AA"** —
маршрутизируй к `a11y-auditor`. Этот файл — про contracts на этапе
проектирования компонента, не про compliance audit.

---

## Часто забываемое

- **`<button>` тег для button** — `<div onClick>` ломает keyboard, focus, screen reader
- **`<Label htmlFor>` для inputs** — без этого click on label не фокусирует input
- **`aria-label` для icon-only buttons** — иначе screen reader скажет "button" без контекста
- **Не используй `outline: none` без замены** — focus-visible ring должен остаться
- **`tabindex` только когда нужно** — `-1` для скрытия из tab order, `0` для включения, остальное обычно неправильно
- **Радио-группа должна иметь `<RadioGroup>` обёртку** — иначе arrow keys не работают между опциями
- **Modal должен содержать `<DialogTitle>`** — даже если визуально не показан (`<VisuallyHidden>`)
- **Toast не блокирует interaction** — должен исчезать или быть закрываем
- **Dropdown не делается через `onMouseEnter`** — используй click/keyboard, иначе touch-users не доберутся
- **Проверь компонент с keyboard** — пройди табом через все интерактивы перед тем как считать готовым
