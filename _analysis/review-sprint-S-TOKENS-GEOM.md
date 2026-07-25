# Ревью: S-TOKENS-GEOM v2 — радиусы + узкий канон elevation (F-08 / F-09)

**Дата:** 2026-07-21  
**Ревьюер:** Grok (верификация по коду `feat/tokens-geom` @ `74fd202` = `main`; live `src/`, `tailwind.config.ts`, `globals.css` + crm-architect `theme-system.md` / `architecture.md` / `learnings.md`; сверка с `_analysis/review-sprint-S-TOKENS-GEOM.md` v1)  
**Объект:** `_analysis/sprint-S-TOKENS-GEOM.md` (v2) — token-first геометрия: `xl` в шкалу (`calc(l+2px)`), `rounded-md`→`rounded`, floating-тени → elevation, fix `hover:elevation`  
**Контекст:** client-only, миграций нет; 7 тем; v2 закрывает W1–W4 из прошлого ревью; связанные: visual-audit F-08/F-09, theme-system tokens

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА vs live | ✅ `rounded-md`=55, `rounded-xl`=86, compound=0, `hover:elevation`=1, `rounded-lg`=328 |
| Schema / RLS / SQL | ✅ N/A (client-only) |
| File inventory (2a/2b/2c + НЕ ТРОГАТЬ) | ✅ все якоря и строки живые |
| Диагноз F-08 (дубль + инверсия xl) | ✅; таблица `--radius-l` по темам **исправлена** (W1 v1) |
| Диагноз F-09 + узкий канон A | ✅ floating only; card/inset tech-debt осознан |
| Inline chart `boxShadow` | ✅ вынесен в §2b (W2 v1) |
| Tailwind `extend` + снятие `md` | ✅ формулировка 6px, не 0 (W3 v1); порядок 1a→1b верный |
| Scope / НЕ трогать | ✅ globals vars, `.card`, card-shadows, `rounded-lg`/`full`/`sm` |
| v1 → v2 закрытие замечаний | ✅ W1–W4 |
| Готовность к CC | ✅ |

**Оценка: 9/10.** Промпт после v2 точный, evidence-based, узкий scope по теням — правильный. Оставшиеся риски — операционные (`git add -A` на грязном дереве, ветка уже существует), не архитектурные.  
**Рекомендация:** **запускать в CC** (правки желательны, но не блокеры).

---

## С чем согласен полностью

### 1. Слепой `rounded*` → `rounded-lg` отвергнут верно

`tailwind.config.ts` L48–53:

```ts
borderRadius: {
  DEFAULT: 'var(--radius)',
  sm: 'var(--radius-s)',
  md: 'var(--radius-m)',
  lg: 'var(--radius-l)',
},
```

`xl` в extend **нет** → default TW **12px**, тема-независимо. Инверсия `xl < lg` реальна там, где `--radius-l > 12` (aura/frost/fuji/minimal/:root).

### 2. Дубль `rounded` / `rounded-md`

Live `globals.css`: во **всех** 7 темах + `:root` `--radius == --radius-m`.  
`rounded-md` в `*.tsx`: **55** (25 файлов).  
`rounded-[tblr]+-md`: **0**.  
`rounded-lg`: **328** — не трогать — верно.

### 3. Таблица `--radius-l` (v2) совпадает с live

| Тема | Live `--radius-l` | xl сейчас | после `+2` | δ | Спринт |
|------|-------------------|-----------|------------|---|--------|
| **aura** | 18 | 12 | **20** | +8 | ✅ |
| **washi** | 8 | 12 | **10** | −2 | ✅ |
| frost | 16 | 12 | 18 | +6 | ✅ |
| fuji | 14 | 12 | 16 | +4 | ✅ |
| minimal | 14 | 12 | 16 | +4 | ✅ |
| aurora | 12 | 12 | 14 | +2 | ✅ |
| tidal | 12 | 12 | 14 | +2 | ✅ |

Smoke-фокус aura (макс. +8) и washi (единственное **уменьшение**) — корректен. `+2` гарантирует `xl > lg` во всех темах (в т.ч. washi 10>8).

### 4. Порядок 1a → 1b

Сначала вычистить `rounded-md` → `rounded`, потом снять `md` из extend.  
`theme.extend` deep-merge: без ключа `md` utility вернётся к default TW **`0.375rem` (6px)** — в промпте сформулировано верно (W3 v1 закрыт).

### 5. Узкий канон A по теням — правильный scope

Frost/aurora: `--shadow-card` = тяжёлый drop + **inset** блик; elevation = drop + ring — не взаимозаменяемы.  
Tidal: card без inset (`0 2px 12px…`), но всё равно ≠ elevation ring.  
Не трогать card-поверхности — верно; tech-debt `Card.tsx` (shadow-card) ↔ `.card` (elevation) — осознанно out of scope.

### 6. Инвентарь floating (2a) — полный и точный

Live `shadow-(lg|xl)` в `*.tsx` — **ровно 9** вхождений, все в таблице §2a:

| Якорь | Live | Роль |
|-------|------|------|
| `GanttTimeline.tsx:1254,1268` | `shadow-lg` | тултипы |
| `ContentHeader.tsx:111` | `shadow-lg` | тема-дропдаун |
| `ChatEmojiPicker.tsx:104` | `shadow-lg` | эмодзи-попап |
| `AssigneeSelect.tsx:128` | `shadow-lg` | дропдаун |
| `Combobox.tsx:147` | `shadow-lg` | дропдаун |
| `DataTable.tsx:352` | `shadow-lg` | bulk-bar portal |
| `StageBoard.tsx:122` | `shadow-lg` | drag-state карточки |
| `StageBoard.tsx:481` | `shadow-xl` | DragOverlay |

Консистентность с уже-`elevation-3` (KanbanBoard:265, PipelineBoard:660, DeliveryPipelineBoard:303, NotificationBell:113, Modal, …) — верна.

### 7. Chart style-props (2b)

| Файл | Строка | Сейчас |
|------|--------|--------|
| `OverviewCharts.tsx` | 103, 229 | `boxShadow: 'var(--shadow-md)'` |
| `Charts.tsx` | 44 (`TT`) | то же |
| `CallsChart.tsx` | 86 | то же |

→ `var(--elevation-2)` — правильная форма (не className). `PeekPanel.tsx:63` уже на `var(--elevation-3)` — не трогать, не в списке.

### 8. Fix `hover:elevation-1` (2c)

`DeliveryPipelineBoard.tsx:61`: `transition-shadow hover:elevation-1` — факт.  
`.elevation-0..3` — обычные CSS-классы (`globals.css` ~1406–1409), не TW utilities → variant `hover:` не генерируется.  
`hover:shadow-[var(--elevation-1)]` — корректен.

### 9. НЕ ТРОГАТЬ — якоря сверены

`Card.tsx:15`, `dashboard-content.tsx:103`, `LeadsView.tsx:100–101`, `StageBoard.tsx:120,205`, `SettingsContent.tsx:119`, `SpawnWizard.tsx:147`, `ProjectDetail.tsx:434`, `DealDeliveryHub.tsx:97`, `StatsWidget.tsx:26`, `KanbanBoard.tsx:248`, `ProjectChat.tsx:457` — все существуют с заявленными shadow-классами.

`var(--shadow…)` в globals L833, L840, L1133 — подтверждено; переменные **не** удалять — верно.  
`boxShadow` config (`xs/sm/md/lg/card`) **не** трогается — `hover:shadow-md` на dashboard-content останется рабочим.

### 10. crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА первой | ✅ |
| Реальные пути / символы | ✅ |
| SQL / migrations / RLS / `org_id` | ✅ N/A |
| CSS через variables / theme-scoped | ✅ (`calc(var(--radius-l) + 2px)`) |
| schema.md update | ✅ N/A |
| No `flowType: 'implicit'` | ✅ N/A |
| learnings (7 тем, CSS vars, no hardcode) | ✅ соблюдено |

---

## Блокеры (критично — исправить до запуска)

**Нет.**

---

## Предупреждения (желательно учесть)

### W1. Ветка `feat/tokens-geom` уже существует

Live: HEAD = `feat/tokens-geom` @ `74fd202` (= `main`).  
Команда `git checkout -b feat/tokens-geom` **упадёт**.  
**CC:** если ветка есть — `git checkout feat/tokens-geom` (или reset к main), не `-b`.

### W2. `git add -A` на грязном дереве

В рабочей копии dirty/untracked: куча `_analysis/*`, `scripts/audit-contrast-results.json`, `.grok/`, …  
`git add -A` + commit из спринта **затянет мусор**.  
**CC:** стейджить явно, например:

```
git add tailwind.config.ts src/
```

(плюс только реально изменённые tsx из §1–2).

### W3. Hardcoded floating-тени — out of scope (зафиксировать)

Не попадают в verification-grep, не в таблице 2a — ок, но в «НЕ ТРОГАТЬ» стоит одной строкой:

- `ExcelImport.tsx:285`, `PlanImport.tsx:225` — `boxShadow: '0 25px 50px…'`
- `EventReminder.tsx:150` — rgba multi-shadow

Отдельный пас, не этот спринт.

### W4. Формулировка «dark inset» чуть шире факта

Inset на `--shadow-card`: **frost + aurora**. **Tidal** — без inset (`0 2px 12px`). Решение «карточки не трогать» всё равно верное (elevation ring ≠ card). Smoke dark: frost/aurora (inset) + tidal (ring vs card).

### W5. После спринта две системы теней останутся (by design)

Карточки: `shadow-card` / TW `shadow-*`. Floating: `elevation-*`.  
Verification `shadow-(lg|xl) → 0` — ок; `shadow-md`/`sm`/`xs`/`card` **останутся** — это ожидаемо. Не «дочищать» card-слой в этом PR.

### W6. theme-system.md (docs, не код)

В `theme-system.md` перечислены CSS-токены `--radius*` / `--shadow*` / `--elevation-*`, но не TW-ключ `xl`. После спринта опционально одна строка в docs — **не блокер**, `schema.md` не нужен.

### W7. washi: xl 12→10 — единственный «минус»

Спринт это уже помечает. На смоке washi settings/login/boards: контейнеры станут **острее**, не мягче. Не регрессия инверсии (10>8=lg).

---

## Пропущенные места (grep)

| Файл | Строки | Действие |
|------|--------|----------|
| — | — | **Gaps по `shadow-(lg\|xl)` нет** — 9/9 в §2a |
| — | — | **Gaps по `boxShadow: 'var(--shadow` нет** — 4/4 в §2b |
| `ExcelImport` / `PlanImport` / `EventReminder` | hardcoded | Out of scope (W3) |
| `PeekPanel.tsx:63` | уже `elevation-3` | Не трогать |

---

## Закрытие замечаний v1

| v1 | v2 статус |
|----|-----------|
| W1 таблица `l` по темам | ✅ исправлена (aura 18, washi 8, …) |
| W2 style-props чартов | ✅ §2b |
| W3 «радиус 0» | ✅ «6px TW default» |
| W4 счётчики / ~90 tsx | ✅ 55 / 86 / 9 floating |
| W5 card→elevation dark | ✅ канон A — cards **не** трогаем |
| W6 verification grep | ✅ раздельно class `shadow-(lg\|xl)` и `boxShadow: 'var(--shadow` |
| δ xl | v1 предлагал +4; v2 **+2** — обоснованно (washi xl всегда > lg) |

---

## Предлагаемые правки в спринт (опционально)

1. **W1** — в РАЗВЕДКЕ: «если `feat/tokens-geom` уже есть — checkout без `-b`».  
2. **W2** — `git add` точечно, не `-A`.  
3. **W3** — одна строка «НЕ ТРОГАТЬ: ExcelImport/PlanImport/EventReminder hardcoded boxShadow».  
4. **W4** — «inset» уточнить: frost/aurora; tidal без inset.

Не блокируют запуск.

---

## Чеклист перед CC

- [x] v2 закрыл W1–W4 предыдущего ревью  
- [x] Live: `rounded-md`=55, `rounded-xl`=86, compound=0, `hover:elevation`=1  
- [x] Live: 9× `shadow-(lg|xl)`, 4× chart `boxShadow: var(--shadow-md)`  
- [x] Таблица `--radius-l` = globals  
- [ ] Ветка: использовать существующую `feat/tokens-geom` @ `74fd202` (не `checkout -b`)  
- [ ] Порядок: **1a** все `rounded-md`→`rounded`, **затем 1b** config (`md` out, `xl` in)  
- [ ] 2a floating class → `elevation-3`; 2b style → `var(--elevation-2)`; 2c hover fix  
- [ ] Карточки / `--shadow-*` vars / `.elevation-*` defs / `.card` — **не трогать**  
- [ ] Verification: `tsc`, `rounded-md`=0, `hover:elevation`=0, `shadow-(lg|xl)`=0, `boxShadow: 'var(--shadow`=0  
- [ ] Live-смок ×7: aura xl↑, washi xl↓, floating ring в dark, DeliveryPipelineBoard hover, cards без изменений  
- [ ] Commit: **не** `git add -A` — только token/tsx diff; ветку не мёржить
