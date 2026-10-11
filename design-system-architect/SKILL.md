---
name: design-system-architect
description: >
  Архитектор дизайн-систем для shadcn/ui + Tailwind v4 + CSS variables. Используй
  при работе с design tokens, spacing/typography/radius scale, вариантами
  компонентов (CVA, size/variant/state), anatomy одного компонента, composition
  patterns (как собирать сложные UI из простых), кастомизацией shadcn,
  multi-theme (dark mode, brand themes). Триггеры: "design system",
  "дизайн-система", "tokens", "токены", "CSS variables", "spacing scale",
  "typography scale", "radius", "variants", "CVA", "shadcn", "кастомизация
  shadcn", "anatomy компонента", "composition", "theming",
  "dark mode", "тема", "naming conventions", "аудит дизайн-системы",
  "как организовать компоненты". Также триггерь при работе над библиотекой
  компонентов или борьбе с консистентностью UI.
  Dark mode: токены и переключение — здесь; значения цветов — color-architect.
  Не используй для палитры (color-architect), анимации (animation-cookbook),
  лендингов (web-design-studio), генерации форм (forms-architect),
  глубокого a11y-аудита (a11y-auditor).
---

# Design System Architect

Version: 2026-10-11

Архитектор дизайн-систем для shadcn/ui + Tailwind v4 + CSS variables. Скилл
закрывает системное мышление о компонентах: токены, scale, варианты, anatomy,
composition, theming, governance.

**Опорная референс-система** — shadcn/ui. Когда возникает вопрос "как делают
лучшие" — смотри как сделано в shadcn (он построен поверх Radix + Tailwind +
CVA, минималистичный, без opinionated-решений).

**Главное правило:** всегда читай нужные reference-файлы перед генерацией
кода или аудитом. Глубина в references — поверхностный SKILL.md без них не
даст качественного результата.

---

## Version Defaults

| Слой | Default | Когда отступать |
|------|---------|-----------------|
| Tailwind | **v4 (CSS-first через `@theme`)** | Если в проекте уже `tailwind.config.ts` без `@theme` — следуй v3-паттернам |
| Tokens layer | **`@theme inline` + CSS vars в `:root`** | Если проект на старом shadcn/v3 — `tailwind.config.ts theme.extend` |
| Color space | **OKLCH** | Если палитра уже зафиксирована в HSL/hex и менять её вне scope — оставляй как есть |
| Dark mode | **class-based (`.dark`) + `next-themes`** для light/dark | `data-theme` — только для multi-brand / white-label, не для бинарной light/dark |
| Готовая multi-theme стратегия проекта | **Следовать ей**, не дефолту выше | dashboard-crm: семь тем классами `.t-aura`/`.t-minimal`/…, правила — `crm-architect/references/theme-system.md`. Предлагать `.dark`/next-themes такому проекту — регресс |
| React pattern | **React 19+: function components, `ref` как обычный prop, `data-slot` для compound parts** | React 18 — `forwardRef` + `displayName` всё ещё нужны |
| Component path | **`@/components/ui/*`** | Следуй `tsconfig.json` paths проекта |
| Utils path | **`@/lib/utils`** (`src/lib/utils.ts`) | Не путать с `@/lib/cn` — стандарт shadcn это `utils` |

**Если проект ещё на Tailwind v3 или React 18** — все паттерны из references
переносимы, но синтаксис отличается. Не предлагай миграцию, если не
спросили — это вне scope этого скилла.

---

## Default Stack

| Слой | Выбор | Почему |
|------|-------|--------|
| UI primitives | **shadcn/ui** (Radix-based) | Копи-пейст в проект, полный контроль, доступность из коробки |
| Стили | **Tailwind CSS v4** | Utility-first, CSS-first config, native CSS vars |
| Tokens | **CSS variables в `:root` + `@theme inline`** | Theming, multi-theme, runtime-смена темы |
| Variants | **CVA** (class-variance-authority) | Стандарт shadcn, типобезопасные варианты |
| Composition | **Radix primitives** + slots (`asChild`) | Гибкость без переписывания |
| Theming | **`.dark` class** через next-themes для light/dark; `data-theme` для multi-brand | Не миксуй стратегии в одном проекте |

**Если проект на другом стеке** (Mantine, MUI, Chakra) — следуй стеку
проекта. Принципы переносимы, синтаксис будет другой. Не предлагай миграцию,
если не спросили.

---

## Reference Files

| Файл | Читать когда | Содержит |
|------|--------------|----------|
| `references/tokens.md` | Создание/ревью токенов, naming conventions | Primitive vs semantic tokens, CSS vars, OKLCH, naming, Tailwind v4 `@theme inline` |
| `references/scale.md` | Установка scale-систем для нового проекта или ревью существующих | Spacing, typography, radius, shadow, z-index scales |
| `references/variants.md` | Проектирование вариантов компонента (size/variant/state) | CVA, organization patterns, states (hover/focus-visible/disabled/loading) |
| `references/anatomy.md` | Проектирование структуры одного компонента | Slots, compound components, props API design |
| `references/composition.md` | Сборка сложных UI из простых | Primitives → patterns → templates, asChild |
| `references/shadcn-customization.md` | Кастомизация готовых shadcn-компонентов | Как менять без потери future updates, common patterns |
| `references/theming.md` | Multi-theme, dark mode, brand themes | CSS vars layering, class-based default, data-theme для multi-brand |
| `references/component-a11y-contracts.md` | Проектирование Dialog/Combobox/Tabs/DropdownMenu/Form fields | Per-component a11y contracts (focus, keyboard, ARIA) |
| `references/audit-checklist.md` | **Режим аудита существующей DS** | 25+ проверок по категориям |
| `references/governance.md` | Поддержание DS живой, соглашения | Conventions, что документировать, ADR для DS |

**Глубокий a11y-аудит** (WCAG, contrast ratios, screen reader testing) — это
скилл `a11y-auditor`. `component-a11y-contracts.md` здесь — только про
поведенческие контракты компонентов на этапе anatomy/variants.

---

## Output Format Decision

| Запрос пользователя | Режим вывода |
|---------------------|--------------|
| "сделай токены для Y", "напиши Button с вариантами", "spacing scale" | **Готовый код** + краткое объяснение решений |
| "ревью моей DS", "что улучшить", скриншот компонентов или код | **Аудит через checklist** + конкретные правки |
| "как кастомизировать shadcn Button", "как добавить вариант в Card" | **Точечный how-to** на конкретный shadcn-компонент |
| "primitive или semantic токены", "stick с дефолтным scale или свой" | **Decision discussion** с trade-offs → рекомендация |
| "как организовать компоненты в проекте", "архитектура DS" | **Архитектурный план** → структура папок, конвенции |

---

## Workflow по типам задач

### 1. Создание новой DS / новых токенов

**Триггер**: "сделай токены", "spacing scale", "напиши вариант Y", "стартую DS с нуля".

**Шаги**:

1. **Уточни контекст** (если не очевидно): новый проект или дополнение; одна тема или несколько; визуальная идентичность (минимализм / премиум / playful / технический CRT-стиль / etc.).
2. **Прочитай reference** под задачу — см. таблицу:

| Задача | Какие references читать |
|--------|-------------------------|
| Токены с нуля | `tokens.md` (+ `theming.md` если многотемный) |
| Scale (spacing/typography/radius) | `scale.md` |
| Один вариант одного компонента | `variants.md` |
| Компонент целиком (структура + варианты) | `anatomy.md` + `variants.md` |
| Интерактивный компонент (Dialog/Combobox/Tabs) | `anatomy.md` + `variants.md` + `component-a11y-contracts.md` |

3. **Сгенерируй**: CSS variables в `globals.css` (с `@theme inline` для Tailwind v4), CVA-варианты, пример использования.
4. **В конце ответа** — короткое объяснение решений + 2-3 пункта "что важно не забыть".

### 2. Аудит существующей дизайн-системы

**Триггер**: пользователь делится кодом / скриншотами и спрашивает "что не так", "ревью DS", "почему это выглядит несогласованно".

**Шаги**:

1. Прочитай `references/audit-checklist.md` целиком.
2. Прогони код / скриншоты по категориям checklist: Tokens → Scale → Variants → States → Theming → Composition → Code quality.
3. Структурируй ответ: **Критично** (ломает консистентность) → **Стоит исправить** (DX, поддерживаемость) → **Опционально** (улучшения).
4. Для каждого пункта: симптом → код "до" → код "после" → причина.

### 3. Кастомизация shadcn-компонента

**Триггер**: "как добавить вариант в shadcn Button", "хочу другой outline стиль для Card".

**Шаги**:

1. Прочитай `references/shadcn-customization.md` и `references/variants.md`.
2. Уточни сценарий — какой компонент, что нужно изменить.
3. Покажи **минимальное изменение** на нужном уровне (token / className / новый CVA-variant / правка base classes / правка JSX). Используй наименьший достаточный уровень.
4. Предупреди о trade-offs (отход от shadcn-defaults усложнит future updates).

### 4. Архитектурное решение

**Триггер**: "primitive или semantic токены", "как организовать components в монорепе", "stick с shadcn defaults или свой scale".

**Шаги**:

1. Прочитай `tokens.md` (для tokens) или `governance.md` (для архитектурных вопросов).
2. Уточни контекст: размер проекта (одно приложение / несколько / white-label), команда (соло / несколько разработчиков), время на DS.
3. Дай рекомендацию с trade-offs (А vs Б vs В), укажи default.

---

## Conventions

### Структура файлов в проекте

```
src/
├── app/
│   └── globals.css                    — CSS variables (tokens) + @theme inline (v4)
├── components/
│   ├── ui/                            — shadcn-компоненты (примитивы, Tier 1)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── ...
│   ├── patterns/                      — собственные composition patterns (Tier 2)
│   │   ├── DataTable.tsx
│   │   └── EntityCard.tsx
│   └── layouts/                       — page-level layouts
└── lib/
    └── utils.ts                       — cn() utility (clsx + tailwind-merge), стандарт shadcn

tailwind.config.ts                     — только для v3-проектов; в v4 — конфиг в CSS
```

**`@/lib/utils`** — канонический путь к `cn()`. Не делай `@/lib/cn` — это
расходится с shadcn-defaults и ломает auto-import.

### Three Layers of Design Tokens

| Слой | Что | Пример | Кто использует |
|------|-----|--------|----------------|
| **1. Primitive tokens** | Палитра, raw values | `--blue-500: oklch(0.55 0.18 254)` | Только semantic слой (исключения — charts, isolated viz) |
| **2. Semantic tokens** | Роли | `--primary: var(--blue-500)` | Компоненты |
| **3. Component implementation** | Использование semantic в коде | `<Button className="bg-primary">` | Приложение |

**Optional Layer 4 — component-specific tokens** (`--button-bg`,
`--button-radius`): вводи только когда один компонент требует
кастомизации в 3+ независимых местах. Преждевременный Layer 4 = шум.
См. `tokens.md` для полного объяснения.

### Naming

- **CSS variables**: `--{slot}-{role}` для семантических, `--{color}-{shade}` для primitive. Примеры: `--background`, `--foreground`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--blue-500`.
- **Tailwind classes**: используют семантические токены — `bg-background`, `text-foreground`, не `bg-blue-500` напрямую (исключения — charts, isolated visualizations, см. `tokens.md`).
- **CVA variants**: `size`, `variant`, `state` — стандартные имена. Значения: `default`, `outline`, `ghost`, `destructive` (как в shadcn).

### Semantic Token Naming (из shadcn)

Стандартный набор semantic tokens — следуй ему по умолчанию:

```
background      foreground
card            card-foreground
popover         popover-foreground
primary         primary-foreground
secondary       secondary-foreground
muted           muted-foreground
accent          accent-foreground
destructive     destructive-foreground
border          input            ring
```

Этот набор достаточен для 90% компонентов. Расширяй только когда реально
нужно (например, `--success`, `--warning` для статусов).

---

## Quality Checklist

Перед тем как отдать код, пройдись:

- [ ] Tokens определены через CSS variables, не хардкод цветов
- [ ] Используются semantic tokens (`--primary`), не primitive (`--blue-500`) в reusable-компонентах
- [ ] Spacing/typography/radius используют scale, не magic numbers
- [ ] Варианты компонента организованы через CVA, не цепочкой `cn()` с условиями
- [ ] Все интерактивные состояния покрыты (hover, focus-visible, active, disabled, loading)
- [ ] `focus-visible:ring-*` используется вместо `focus:` для лучшего keyboard UX
- [ ] Dark mode работает через `.dark` class strategy (не `data-theme="dark"`, если только проект не multi-brand)
- [ ] Component anatomy документирована (или очевидна из props)
- [ ] Compound components используют slot-паттерн / `asChild` где уместно
- [ ] Compound parts помечены `data-slot="..."` для CSS targeting (актуальный shadcn-паттерн)
- [ ] Naming следует semantic conventions (`--card-foreground`, не `--text-on-card`)
- [ ] `@/lib/utils` для cn(), не `@/lib/cn`
- [ ] Если проект на v4 — токены через `@theme inline`, не `tailwind.config.ts`
- [ ] Если проект на React 19 — function components без `forwardRef`; на React 18 — `forwardRef` + `displayName`

См. `audit-checklist.md` для полного списка (25+ пунктов).

---

## Что скилл НЕ делает

- **Не выбирает палитру цветов** — это `color-architect`. Палитра приходит на вход, скилл организует её в semantic tokens.
- **Не пишет анимации** — это `animation-cookbook`. Скилл может упомянуть transition-токены, но не motion design.
- **Не делает уникальные лендинги** — это `web-design-studio`. Скилл — про систему повторяемых компонентов, не про unique creative work.
- **Не пишет конкретную форму** — это `forms-architect`. Скилл — про компоненты, из которых форма собирается.
- **Не делает глубокий a11y-аудит** — это `a11y-auditor`. `component-a11y-contracts.md` здесь покрывает только поведенческие контракты на уровне компонента (focus trap в Dialog, keyboard в Combobox); WCAG, contrast ratios, screen reader testing — в `a11y-auditor`.

Если запрос задевает эти области — упомяни границу и предложи комбинацию
скиллов.
