# Audit Checklist

Чек-лист для аудита существующей дизайн-системы. Прогоняй по категориям,
отмечай пропуски, формулируй конкретные правки.

Для каждого пункта: **симптом** (что искать) → **решение** → **критичность**.

---

## A. Tokens (10 пунктов)

### A1. Хардкод цветов в компонентах

- **Симптом**: `bg-blue-500`, `text-[#3b82f6]`, `style={{ color: '#fff' }}` в коде
- **Решение**: заменить на semantic tokens (`bg-primary`, `text-primary-foreground`)
- **Критичность**: 🔴 Высокая — ломает theming и dark mode

### A2. Используются primitive вместо semantic

- **Симптом**: компоненты используют `--blue-500` напрямую вместо `--primary`
- **Решение**: добавить semantic слой, переписать компоненты на него
- **Критичность**: 🔴 Высокая — без этого нет theming

### A3. Нет paired -foreground tokens

- **Симптом**: есть `--card`, нет `--card-foreground`. Каждый компонент
  выбирает цвет текста сам
- **Решение**: добавить -foreground ко всем surface tokens
- **Критичность**: 🟡 Средняя — приводит к рассинхрону цветов текста

### A4. Color space (OKLCH preferred)

- **Симптом**: `--background: 0 0% 100%;` (HSL space-separated, старый shadcn) или `#ffffff` (hex)
- **Решение**: миграция на OKLCH для perceptual uniformity и `color-mix()` совместимости. HSL допустим как промежуточный шаг, но OKLCH — целевой формат
- **Критичность**: 🟢 Низкая (если работает) → 🟡 Средняя при редизайне

### A5. Naming inconsistency

- **Симптом**: миксованы стили — `--text-primary`, `--bg-card`, `--card`
- **Решение**: унифицировать через semantic naming (`--card-foreground`, `--card`)
- **Критичность**: 🟡 Средняя — путает разработчиков

### A6. Token wiring рассинхронизирован с версией Tailwind

- **Симптом v4**: проект на v4, но токены настроены через `tailwind.config.ts` (extends.colors), нет `@theme inline` в `globals.css` — лишняя сложность, дублирование
- **Симптом v3**: проект на v3, но кто-то добавил `@theme` в CSS — не работает
- **Симптом mix**: `@theme` + `tailwind.config.ts` одновременно — конфликты, неочевидное поведение
- **Решение**: один путь. v4 → `@theme inline` в CSS. v3 → `tailwind.config.ts` `extend.colors` с `var(--*)`
- **Критичность**: 🔴 Высокая — без правильного wiring `bg-primary` может не применяться

### A7. Нет --ring отдельно от --primary

- **Симптом**: focus ring использует тот же цвет что primary, плохо видно
- **Решение**: отдельный `--ring` token, обычно нейтральный или с альфой
- **Критичность**: 🟡 Средняя — a11y / UX

### A8. Дубликаты в primitive shades

- **Симптом**: 10 оттенков серого вручную вместо ссылок на одну шкалу
- **Решение**: единая `--gray-{50..950}` шкала
- **Критичность**: 🟢 Низкая

### A9. Tokens только в JS

- **Симптом**: цвета определены в TypeScript-объекте, не в CSS
- **Решение**: первоисточник — CSS variables, JS только ссылается через `var(--name)`
- **Критичность**: 🔴 Высокая — без CSS vars не работает theming

### A10. Comments отсутствуют у важных токенов

- **Симптом**: `--accent: ...` без объяснения когда использовать
- **Решение**: одна строка комментария к каждому semantic токену
- **Критичность**: 🟢 Низкая — DX improvement

### A11. Импорт `cn` из неправильного пути

- **Симптом**: `import { cn } from '@/lib/cn'` (или другие варианты, не `@/lib/utils`)
- **Решение**: переименовать в `src/lib/utils.ts` (стандарт shadcn), обновить импорты
- **Критичность**: 🟡 Средняя — auto-import от shadcn-CLI ожидает `@/lib/utils`, рассинхрон ломает добавление новых компонентов

### A12. `@theme inline` отсутствует в v4-проекте

- **Симптом**: проект на Tailwind v4, в `globals.css` есть `:root` с CSS vars, но нет `@theme inline` — utility-классы `bg-primary` etc. не работают, либо Tailwind генерирует свои дублирующие vars через простой `@theme`
- **Решение**: использовать `@theme inline { --color-primary: var(--primary); ... }` для маппинга существующих vars в Tailwind utility namespace
- **Критичность**: 🔴 Высокая — без этого либо классы не работают, либо токены дублируются

---

## B. Scale (5 пунктов)

### B1. Magic numbers в spacing

- **Симптом**: `p-[14px]`, `mt-[7px]`, `gap-[18px]`
- **Решение**: использовать Tailwind scale (`p-4`, `mt-2`, `gap-5`). Если реально нужно — добавить в `tailwind.config.ts extend.spacing`
- **Критичность**: 🟡 Средняя — accumulated drift

### B2. Inconsistent typography

- **Симптом**: `text-[15px]` вместо `text-sm` или `text-base`
- **Решение**: придерживаться Tailwind scale, custom только через config
- **Критичность**: 🟡 Средняя

### B3. Random radius values

- **Симптом**: `rounded-[7px]`, `rounded-[10px]` — не из шкалы
- **Решение**: использовать `rounded-sm/md/lg/xl` или базовый `--radius`
- **Критичность**: 🟢 Низкая

### B4. Нет z-index системы

- **Симптом**: `z-[9999]`, `z-50`, `z-100` — случайные значения
- **Решение**: токены в config (`zIndex: { dropdown, modal, toast, ... }`)
- **Критичность**: 🟡 Средняя — z-index war при росте

### B5. Heights не согласованы

- **Симптом**: Button `h-9`, Input `h-10`, Select `h-9` — рядом ломаются
- **Решение**: единые heights для interactive controls по размерам (sm/md/lg)
- **Критичность**: 🟡 Средняя — визуальный рассинхрон

---

## C. Variants (5 пунктов)

### C1. Цепочки cn() с условиями вместо CVA

- **Симптом**: `cn(base, variant === 'primary' && '...', variant === 'outline' && '...')`
- **Решение**: переписать на CVA
- **Критичность**: 🔴 Высокая — невозможно поддерживать

### C2. Раздельные компоненты вместо variants

- **Симптом**: `PrimaryButton`, `OutlineButton`, `GhostButton` как разные файлы
- **Решение**: один Button с CVA-вариантами
- **Критичность**: 🔴 Высокая

### C3. Variants без defaultVariants

- **Симптом**: `<Button />` без переданных variant — undefined
- **Решение**: `defaultVariants: { variant: 'default' }`
- **Критичность**: 🟡 Средняя

### C4. Variant axes смешаны

- **Симптом**: `variant: { 'primary-sm', 'primary-md', 'outline-sm' }` (декартово произведение)
- **Решение**: разделить на две оси (`variant` + `size`)
- **Критичность**: 🔴 Высокая — комбинаторика растёт

### C5. Inline override через style

- **Симптом**: `<Button style={{ background: '#abc' }}>`
- **Решение**: создать variant или, для one-off, через `className`
- **Критичность**: 🟡 Средняя

---

## D. States (4 пункта)

### D1. focus вместо focus-visible

- **Симптом**: `focus:ring-2` без `-visible`
- **Решение**: `focus-visible:ring-2` — лучший keyboard UX, mouse не показывает ring
- **Критичность**: 🟡 Средняя — UX issue

### D2. Disabled без pointer-events-none

- **Симптом**: `disabled:opacity-50` без блокировки кликов
- **Решение**: добавить `disabled:pointer-events-none`
- **Критичность**: 🔴 Высокая — disabled кнопка кликается через ребёнка

### D3. Loading через external state

- **Симптом**: `<Spinner />` рядом с кнопкой, кнопка не disabled
- **Решение**: `loading` prop в Button, disable + spinner внутри
- **Критичность**: 🟡 Средняя — UX и race conditions

### D4. Active state отсутствует

- **Симптом**: ничего не происходит при нажатии (нет визуального feedback)
- **Решение**: `active:bg-primary/95` или transform-эффект
- **Критичность**: 🟢 Низкая — polish

---

## E. Theming (4 пункта)

### E1. Dark mode не работает или работает плохо

- **Симптом**: некоторые элементы остаются светлыми в dark, контраст потерян
- **Решение**: пройти по всем компонентам, проверить semantic tokens
- **Критичность**: 🔴 Высокая если dark mode требуется

### E2. transition при смене темы

- **Симптом**: при switch theme все элементы плавно перекрашиваются (выглядит дёшево)
- **Решение**: `disableTransitionOnChange` в next-themes
- **Критичность**: 🟢 Низкая — polish

### E3. Hardcoded цвета в SVG / charts

- **Симптом**: `<circle fill="#3b82f6" />` или Recharts с хардкодом
- **Решение**: использовать `var(--primary)`, переменные в JS через `tokens.colors.primary`
- **Критичность**: 🔴 Высокая для dark mode

### E4. prefers-color-scheme направно вместо theme-switcher

- **Симптом**: `@media (prefers-color-scheme: dark) { ... }` в CSS
- **Решение**: использовать `.dark` класс через next-themes (manual switch)
- **Критичность**: 🟡 Средняя — теряется user-preference

---

## F. Composition (4 пункта)

### F1. Бизнес-логика в Tier 1 (components/ui)

- **Симптом**: `Card.tsx` импортирует из `lib/api/clients`
- **Решение**: вынести в Tier 2 (`components/patterns/`)
- **Критичность**: 🔴 Высокая — нарушает separation

### F2. Конфигурация через JSON-props вместо children

- **Симптом**: `<Card title="..." headerActions={[...]} bodyContent={...}>`
- **Решение**: composition через children (`<CardHeader><CardTitle>...`)
- **Критичность**: 🟡 Средняя

### F3. Слишком ранняя абстракция

- **Симптом**: компонент `<UserCard>` используется один раз
- **Решение**: inline в страницу, абстрагировать с 3-го использования
- **Критичность**: 🟢 Низкая

### F4. Compound без Context

- **Симптом**: `<TabsTrigger>` snifs prop через `React.cloneElement`
- **Решение**: использовать React Context (как Radix)
- **Критичность**: 🟡 Средняя

---

## G. Code quality (3 пункта)

### G1. ref не передаётся (React 18) или антипаттерн (React 19)

- **React 18 симптом**: компонент не принимает ref, RHF / Tooltip не работают с ним. Решение — добавить `React.forwardRef`. Критичность: 🔴 Высокая
- **React 19 симптом**: `forwardRef` всё ещё используется, хотя `ref` уже native prop. Решение — переписать в function component. Критичность: 🟡 Средняя (работает, но deprecated)
- **Mixed симптом**: в одном проекте часть компонентов на `forwardRef`, часть на function. Решение — выбрать один паттерн в зависимости от React-версии и держаться его. Критичность: 🟡 Средняя — DX и onboarding

### G2. displayName не задан (React 18)

- **Симптом**: в DevTools видно `_c12`, `Anonymous` (только в React 18 + forwardRef)
- **Решение**: `Component.displayName = 'Component'` после forwardRef. На React 19 не нужен — function name виден из коробки
- **Критичность**: 🟢 Низкая — DX

### G3. cn() не используется или используется неправильно

- **Симптом**: `className={`${baseClass} ${propClass}`}` — конфликты не разрешаются
- **Решение**: `cn(baseClass, propClass)` через clsx + tailwind-merge
- **Критичность**: 🔴 Высокая — переопределения снаружи не работают

### G4. data-slot отсутствует на compound parts

- **Симптом**: `CardHeader`, `DialogContent`, etc. не имеют `data-slot="..."` атрибута
- **Решение**: добавить `data-slot` ко всем compound parts. Это позволяет sibling-aware Tailwind стили (`has-data-[slot=card-action]:...`) и упрощает CSS targeting
- **Критичность**: 🟡 Средняя — критично только если планируется использовать sibling-aware стили; для простых compound — DX

---

## H. Component a11y contracts (4 пункта)

Это **поведенческие контракты** компонентов, не глубокий a11y-аудит. Глубокая
проверка WCAG, contrast ratios, screen reader testing — отдельный скилл
`a11y-auditor`.

### H1. Dialog без focus trap

- **Симптом**: при открытии Dialog Tab продолжает фокусировать элементы за модалкой
- **Решение**: использовать Radix Dialog (он имеет focus trap из коробки) или `react-aria` `<Dialog>`. Не писать руками
- **Критичность**: 🔴 Высокая — keyboard users теряются

### H2. Combobox без keyboard navigation

- **Симптом**: список выпадает, но стрелки вверх/вниз не двигают активный пункт; Enter не выбирает
- **Решение**: использовать `cmdk` (это база shadcn Command/Combobox) или Radix Listbox. Реализация руками почти всегда неполная
- **Критичность**: 🔴 Высокая — компонент непригоден для клавиатуры

### H3. `disabled` vs `aria-disabled`

- **Симптом**: `<button disabled>` блокирует focus полностью — пользователь не понимает, почему элемент unreachable
- **Решение**: для action-кнопок где нужно объяснение почему disabled — использовать `aria-disabled="true"` (фокусируется, ридер читает) + игнорировать клик в обработчике. Для input/submit — обычный `disabled`
- **Критичность**: 🟡 Средняя — UX/a11y trade-off

### H4. Form fields без `aria-invalid` и `aria-describedby`

- **Симптом**: ошибка валидации показывается визуально, но screen reader не озвучивает
- **Решение**: `<Input aria-invalid={hasError} aria-describedby={hasError ? errorId : undefined}>` + `<span id={errorId}>{errorMessage}</span>`
- **Критичность**: 🟡 Средняя — для форм с пользовательским вводом обязательно

См. `component-a11y-contracts.md` для полного списка контрактов.

---

## Workflow аудита

1. **Категория за категорией** — проходи A → B → C → D → E → F → G → H. Не прыгай.
2. **Для каждого пункта** — найди примеры в коде. Без примеров не отчитывайся.
3. **Группируй по критичности** — сначала 🔴 Высокая, потом 🟡 Средняя.
4. **Для каждой проблемы**:
   - Где (файл и строка / скриншот)
   - Что (короткий симптом)
   - Почему критично (1-2 предложения)
   - Как исправить (конкретный код "до"/"после")
5. **В конце** — приоритизированный список действий: что сделать сейчас, что позже, что опционально.

**Если в ходе аудита выявлены глубокие a11y-проблемы** (низкий contrast,
нарушения WCAG, broken screen reader experience) — отметь их и предложи
запустить отдельный аудит через `a11y-auditor`. Этот checklist покрывает
только component-level contracts, не WCAG compliance.

---

## Output Template для аудита

```markdown
# Аудит дизайн-системы [project name]

## Критические проблемы (🔴)

### 1. [A1] Хардкод цветов в компонентах

**Где**: `src/components/Header.tsx:23`, `src/components/Sidebar.tsx:45`

**Сейчас**:
```tsx
<div className="bg-blue-500 text-white">
```

**Должно быть**:
```tsx
<div className="bg-primary text-primary-foreground">
```

**Почему**: dark mode переключит `--primary`, но `bg-blue-500` останется
синим — несогласованность.

---

## Важные (🟡)

[...]

## Опциональные (🟢)

[...]

## Приоритизация

**Спринт 1 (критическое)**: A1, A9, C2, D2
**Спринт 2 (важное)**: A3, A5, B1, C1, F1
**Backlog**: остальное
```

---

## Часто пропускаемое в аудитах

- **Не смотрят SVG / charts** — там хардкод цветов почти всегда
- **Не проверяют dark mode** — компоненты выглядят норм только в светлой теме
- **Не считают копипаст** — три похожих варианта Card в разных файлах = повод для CVA
- **Не смотрят tests / stories** — Storybook stories часто содержат старые
  паттерны
- **Не проверяют Tailwind config** — там бывает полно legacy
- **Не смотрят на `globals.css`** — иногда там магические инлайн-стили на
  селекторы
