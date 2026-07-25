# Claude Code — S-TOKENS-GEOM (v2): консолидация радиусов + теней (аудит F-08 / F-09)

**База:** ветку `feat/tokens-geom` от `main` (`74fd202`). **Client-only, миграций нет.** 7 тем: aura/washi/fuji/frost/aurora/tidal/minimal.
**v2 после Grok-ревью** (`review-sprint-S-TOKENS-GEOM.md`) + сверки по коду: исправлена таблица радиусов по темам (W1), тени сужены до узкого канона A (карточные `shadow-card` не трогаем), style-props чартов учтены (W2), md-fallback = 6px не 0 (W3), счётчики уточнены (W4).

---

## ПОЧЕМУ ТАК (контекст решений — прочитай до кода)

Аудит F-08 предлагал «`rounded`/`rounded-md` → `rounded-lg`» — **отвергнуто**: `tailwind.config` мапит утилиты на CSS-токены (`rounded`→`--radius`, `md`→`--radius-m`, `lg`→`--radius-l`), а токены осмысленно варьируются по темам. Слепая замена раздула бы радиусы и убила тема-вариативность.

Реальные дефекты:
- **Дубль:** во всех 7 темах + `:root` `--radius == --radius-m` → `rounded` и `rounded-md` визуально идентичны.
- **Инверсия:** `rounded-xl` НЕ в конфиге → дефолтный Tailwind 12px (тема-независим), а `--radius-l` в большинстве тем > 12 → «xl < lg».
- **Тени — две системы:** Tailwind `shadow-*` (→ `--shadow-*`) и классы `.elevation-0..3` (→ `--elevation-*`), пересекаются по ролям. Баг: `hover:elevation-1` (DeliveryPipelineBoard:61) молча не работает — `.elevation-N` не Tailwind-utility.

### Живые `--radius-l` по темам (сверено по globals — ВАЖНО для смока)

| Тема | `--radius-l` | `rounded-xl` сейчас (12px) → после `calc(l + 2px)` | δ |
|------|--------------|------------------|---|
| **aura** (дефолт) | 18 | 12 → **20** | +8 (крупнейший) |
| **washi** (острая) | 8 | 12 → **10** | −2 (станет острее) |
| frost | 16 | 12 → 18 | +6 |
| fuji | 14 | 12 → 16 | +4 |
| minimal | 14 | 12 → 16 | +4 |
| aurora | 12 | 12 → 14 | +2 |
| tidal | 12 | 12 → 14 | +2 |

δ=**+2px** (мягкий; xl всегда > lg, инверсия убита). Единственное намеренное визуальное изменение спринта: 86 контейнеров `rounded-xl`. Смок-фокус — **aura** (сильнее всего) и **washi** (единственная, где xl уменьшится).

### Тени — узкий канон (вариант A, согласовано)

Карточные `--shadow-card`/`--shadow-card-hover` в тёмных темах (frost/aurora/tidal) несут крупную тень + `inset`-блик (эффект стекла), которого у `--elevation-*` нет (у него ring-обводка). Поэтому **карточные тени НЕ трогаем** — сохраняем осмысленный dark-inset. На `elevation` переводим **только floating-слои** (дропдауны, тултипы, поповеры, модалки, drag-оверлеи, чарт-тултипы), где `shadow-lg`/`shadow-md` дублируют `elevation-3`/`elevation-2` — там и была реальная путаница (часть drag-оверлеев уже на `elevation-3`, часть на `shadow-lg`/`xl`). `--shadow-*` переменные остаются (нужны в globals: строки ~833/840/1133).

---

## РАЗВЕДКА (выполни ПЕРВОЙ, подтверди якоря)

```
git checkout main && git pull --ff-only && git checkout -b feat/tokens-geom

grep -rc 'rounded-md' src --include=*.tsx        # ожидаем 55; составных rounded-[tblr]-md быть не должно (grep 'rounded-[tblr]*-md' → 0)
grep -rc 'rounded-xl' src --include=*.tsx         # 86 — в tsx НЕ трогаем
grep -nE 'borderRadius' tailwind.config.ts

grep -rn 'hover:elevation' src --include=*.tsx     # ровно 1: DeliveryPipelineBoard:61
grep -rnE 'shadow-(lg|xl|md)' src --include=*.tsx   # floating-кандидаты — классифицируй по контексту
grep -rn "boxShadow: 'var(--shadow" src --include=*.tsx   # 4 style-prop чарт-тултипа
grep -nE 'var\(--shadow' src/app/globals.css        # ПОДТВЕРДИ: нужны globals → переменные НЕ удалять
```

Если числа разошлись — стоп, сверься со мной.

---

## ЗАДАЧА 1 — Радиусы (F-08)

**Concern:** убрать дубль + инверсию. НЕ трогать `rounded-lg` (328×), `rounded-full`, `rounded-sm`, тема-оверрайды формы в globals.

### 1a. `rounded-md` → `rounded` (55 мест) — ПЕРВЫМ

Каждое `rounded-md` → `rounded`. Значения идентичны (`--radius == --radius-m` во всех темах) → 0 визуального сдвига. Составные `rounded-t-md` и т.п. — если найдутся (ожидаем 0), оставь.

### 1b. `tailwind.config.ts` — borderRadius (ПОСЛЕ 1a)

Было:
```ts
borderRadius: { DEFAULT: 'var(--radius)', sm: 'var(--radius-s)', md: 'var(--radius-m)', lg: 'var(--radius-l)' },
```
Стало (убран `md`-дубль, добавлен `xl`):
```ts
borderRadius: { DEFAULT: 'var(--radius)', sm: 'var(--radius-s)', lg: 'var(--radius-l)', xl: 'calc(var(--radius-l) + 2px)' },
```

Порядок 1a→1b обязателен: `theme.extend` deep-мержится с дефолтом Tailwind, поэтому удаление `md` из extend НЕ обнуляет `rounded-md` — он вернётся к дефолтному TW `0.375rem` (6px, тема-независим). Не «радиус 0», но всё равно нежелательный сдвиг → сначала вычищаем использования, потом снимаем ключ.

---

## ЗАДАЧА 2 — Тени (F-09, узкий канон A)

**Concern:** floating-слои на единый `elevation`. **НЕ трогать:** `.elevation-*` определения в globals, `--shadow-*`/`--elevation-*` переменные, `.card`-класс, и все **карточные/поверхностные** тени (список ниже).

### 2a. Floating-оверлеи → `elevation-3` (9 мест)

Статичный класс (не hover) — голый `elevation-3`:

| Файл:строка | Роль | было → стало |
|---|---|---|
| `GanttTimeline.tsx:1254,1268` | Гант-тултипы | `shadow-lg` → `elevation-3` |
| `ContentHeader.tsx:111` | тема-дропдаун (`bg-popover z-9999`) | `shadow-lg` → `elevation-3` |
| `ChatEmojiPicker.tsx:104` | эмодзи-попап | `shadow-lg` → `elevation-3` |
| `AssigneeSelect.tsx:128` | дропдаун | `shadow-lg` → `elevation-3` |
| `Combobox.tsx:147` | дропдаун | `shadow-lg` → `elevation-3` |
| `DataTable.tsx:352` | bulk-bar (портал, fixed) | `shadow-lg` → `elevation-3` |
| `StageBoard.tsx:122` | drag-состояние карточки | `shadow-lg` → `elevation-3` |
| `StageBoard.tsx:481` | DragOverlay | `shadow-xl` → `elevation-3` |

(Консистентность: drag-оверлеи в KanbanBoard/ProjectBoard уже на `elevation-3` — StageBoard подтягиваем к ним.)

### 2b. Чарт-тултипы (inline `style`) → `var(--elevation-2)` (4 места)

Это JS style-объект, НЕ className:

| Файл:строка | было → стало |
|---|---|
| `OverviewCharts.tsx:103,229` | `boxShadow: 'var(--shadow-md)'` → `boxShadow: 'var(--elevation-2)'` |
| `Charts.tsx:44` (const `TT`) | то же |
| `CallsChart.tsx:86` | то же |

### 2c. Fix `hover:elevation-1` (DeliveryPipelineBoard.tsx:61)

`hover:elevation-1` → `hover:shadow-[var(--elevation-1)]` (сохрани соседний `transition-shadow`). `.elevation-N` не реагирует на `hover:` — arbitrary-форма работает и тема-зависима.

### НЕ ТРОГАТЬ (карточные/поверхностные — осмысленный dark-inset или не floating)

`Card.tsx:15` (`shadow-card`/`hover:shadow-card-hover`) · `dashboard-content.tsx:103` (`shadow-[var(--shadow-card)]`+`hover:shadow-md`) · `LeadsView.tsx:100,101` · `StageBoard.tsx:120,205` (карточки) · `SettingsContent.tsx:119` (`shadow-sm`, выделение свотча) · `SpawnWizard.tsx:147` · `ProjectDetail.tsx:434` · `DealDeliveryHub.tsx:97` (кнопка) · `StatsWidget.tsx:26` · `KanbanBoard.tsx:248` (`shadow-[var(--shadow-xs)]`, strip) · `ProjectChat.tsx:457` (chat-bubble). Рассогласование `Card.tsx` (shadow-card) ↔ `.card`-класс (elevation) — осознанный tech-debt, отдельный проход.

---

## СМОК / VERIFICATION (обязательно перед коммитом)

```
npx tsc --noEmit                                   # 0 ошибок
grep -rn 'rounded-md' src --include=*.tsx           # → 0
grep -rn 'hover:elevation' src --include=*.tsx      # → 0
grep -rnE 'shadow-(lg|xl)' src --include=*.tsx      # → 0 (все floating мигрированы; shadow-card/sm/xs ОСТАЮТСЯ — это ок)
grep -rn "boxShadow: 'var(--shadow" src --include=*.tsx  # → 0
rm -rf .next
```

Live-смок (dev, 7 тем, вернуть aura):
- **rounded-xl контейнеры** (settings-секции, `/login`, борды, dashboard-content): скругление ≥ карточек. Особо **aura** (12→20) и **washi** (12→10, острее).
- **Floating на `elevation-3`** во всех темах: тема-дропдаун (шапка), AssigneeSelect/Combobox, эмодзи-пикер чата, Гант-тултип, bulk-bar (выдели строки в таблице), drag карточки на `/projects` (StageBoard). В тёмных (frost/aurora/tidal) — ring-обводка на месте.
- **Чарт-тултипы** (`/overview`, `/analytics`): наведи на сегменты — тень тултипа.
- **hover DeliveryPipelineBoard** (`/projects`): hover карточки теперь поднимает тень (был битый).
- **Карточки НЕ изменились** (контроль): `/deals`, `/tasks`, тёмные темы — тень карточек прежняя (dark-inset сохранён).

---

## VERIFICATION LABELS

```
Type Safety:            NOT_VERIFIED (прогони tsc — ожидаем PASS)
Backward Compatibility: WARNING (намеренно: rounded-xl δ+2 на 86 контейнерах, floating shadow→elevation; карточки не тронуты — near-zero. Подтвердить смоком ×7)
RLS Coverage:           NOT_APPLICABLE (client-only)
Runtime Tested:         NOT_VERIFIED (смок обязателен)
Regional Availability:  NOT_APPLICABLE
```

---

## КОММИТ

```
git add -A && git commit -m "refactor(tokens): геометрия — xl в токен-шкалу (fix инверсии), rounded-md→rounded (дубль), floating-тени на канон elevation + fix hover (S-TOKENS-GEOM, аудит F-08/F-09)"
git push -u origin feat/tokens-geom
```

Ветку НЕ мёржи — мёрж через гейт Cowork (diff-ревью + live-смок ×7 тем + merge-совет).
