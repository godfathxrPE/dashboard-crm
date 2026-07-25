# Ревью: M2 — Widget discipline (v1.1)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `8b77540`, crm-architect `schema.md` / `architecture.md` / `learnings.md` / `theme-system.md`)  
**Объект:** `_analysis/sprint-m2-widget-discipline.md` (v1.1) — тема-агностичная дисциплина виджетов: анатомия KPI, тихий zero-risk, бюджет маркеров, нейтральные заголовки секций  
**Контекст:** UI-only, без миграций. Предыдущее ревью (v1) закрыло B1/B2 в тексте спринта. Параллельно в working tree лежит **незакоммиченный M1** (`t-minimal` в store/layout/globals/swatches). HEAD по-прежнему без M1 в git-коммитах.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (KPI / Clock / TrendBadge / fuji 48px) | ✅ greps совпали с live |
| РАЗВЕДКА задачи 6 (`LANE_CONFIG` / `config.color`) | ✅ v1.1 исправлена, false-negative снят |
| Пути файлов + commit-list | ✅ 5 обязательных файлов + optional LaneColumn |
| Разнос washi / fuji / default (B1 v1) | ✅ явный `if (fm)` / `if (wm)` / default |
| PortfolioRiskWidget zero-state | ✅ early-return + attention `text-yellow` |
| TasksSidebar / MiniKpi / TaskCard | ✅ точечно, оба header MiniKpi, data-tag company |
| AccordionLane (задача 6) | ✅ обязательная, override без мутации `LANE_CONFIG` |
| Smoke 6+minimal / dirty tree | 🟡 M1 WIP в дереве; git add точечный — критичен |
| SQL / RLS / migrations | ✅ N/A |
| theme-system P0 (opacity), tokens | ✅ учтены |

**Оценка: 9/10.** v1.1 закрывает оба блокера v1; симптомы, файлы, scope и commit-list сверяются с live-кодом.  
**Рекомендация:** **запускать в CC as-is.** Перед коммитом — только список из секции КОММИТ (не `git add -A`: в дереве M1 + `_analysis/*`).

---

## Live-разведка (команды спринта)

| Claim / команда | Live |
|-----------------|------|
| `font-extrabold` | ✅ `DashboardHome.tsx` L318; `TasksSidebar.tsx` L43 |
| `→ без изменений` TrendBadge | ✅ L91 `delta === 0` |
| `opacity-50` KPI | ✅ L306 (washi icon), L310 (default icon-circle), L319 (value shared) |
| `tracking-widest` TasksSidebar | ✅ L71 green, L147 yellow, L203 + L243 accent (×2 MiniKpi) |
| `fontSize: '48px'` fuji | ✅ L251; value `text-3xl` L266; **label в fuji нет** |
| `LANE_CONFIG` | ✅ `validators/task.ts` L30–34; `AccordionLane` import L12, use L38 |
| `config.color` / `config.bg` | ✅ title L81; count pill L93–94; overdue L86–87 `text-red` |
| `/tasks` wiring | ✅ `tasks/page.tsx` → `KanbanBoard` → **`AccordionLane`** (LaneColumn страницей не рендерится) |
| `text-yellow` utility | ✅ `globals.css` L1388: `.text-yellow { color: var(--yellow-text, var(--yellow)) }` — отдельного `text-yellow-text` нет |
| THEMES | 🟡 committed baseline = 6; **working tree** = 7 (`t-minimal` uncommitted: store, layout FOUC, globals L639+, Settings + ContentHeader) |

Структура `KpiCards` (подтверждение B1-фикса):

```
if (fm)  → fuji (L234–275), watermark 48px, без label
else     → shared washi+default (L278–327): ветвление только {wm ? iconA : iconB}
```

---

## С чем согласен полностью

### 1. Принципы
Анатомия KPI (label → value → delta), «сигнал только у исключения», категория без заливки, нейтральные заголовки, **не opacity на информативном тексте** — совпадает с `theme-system.md` Visual-audit P0.

### 2. Задача 1 — KPI default + split веток (бывший B1)
Shared non-fuji: icon-круг + `text-2xl font-extrabold` + label **снизу** (L314–325), empty value с `opacity-50`.  
v1.1 явно: вынести washi байт-в-байт в `if (wm)`, новую вертикальную анатомию — только default; `cards[].icon`/`iconBg` оставить (washi). TrendBadge `delta === 0` → `null`. Верно.

### 3. Задача 2 — fuji
`FUJI_KPI_META` + `if (fm)`: watermark 48px vs value 30px, label отсутствует. `48→30` + тихий label — правильная иерархия без убийства фичи.

### 4. Задача 3 — PortfolioRiskWidget
`hasRisk = counts.at_risk > 0` (L31). Zero-path: зелёный `text-3xl` (L55) + «Нет активных…» (L99–101) — шум.  
`rows` = активные delivery non-terminal (`usePortfolioHealth`) → `{rows.length} активных` корректно.  
`Link`/`ArrowRight` уже импортированы. Ветку `hasRisk` не трогать; attention при 0 red — `text-yellow` (утилита есть). Early-return до risk-JSX + вычистка мёртвого zero-state — ясный diff.

### 5. Задача 4 — TasksSidebar
Clock L43 `text-4xl font-extrabold`; цветные `tracking-widest` (PlannedCalls green, Focus yellow, MiniKpi accent ×2); default MiniKpi L194–197 всегда colorized (в т.ч. red при 0 due).  
Washi MiniKpi (kanji) не трогать; **оба** header «Сейчас в работе» (L203/L243) нейтрализовать — в v1.1 явно. `font-bold` → `font-semibold` на default values — ок.

### 6. Задача 5 — TaskCard
`phaseMode` + project/company без guard (L168–186); fills `bg-accent-l` / `bg-purple-l`; company **без** `data-tag` (project L172 есть).  
`STATUS_BADGE_CLS.next` L29 = `border-border2 bg-surface2 text-text-mute` — ещё «плашка»; transparent mute — согласовано с delivery default `lane='next'`.

### 7. Задача 6 — AccordionLane (бывший B2)
Заголовки цветные через `LANE_CONFIG` (`text-accent|blue|yellow|green` + `bg-*-l`), не литералами. Override title + count в AccordionLane; overdue-pill `text-red` оставить; **`LANE_CONFIG` не мутировать** (потребители: Gantt fallback, CommandPalette, TaskModal, LaneColumn) — обязательно и правильно. LaneColumn — optional.

### 8. Scope / commit / process
Только `src/components/*`. SQL/RLS/`flowType`/CASCADE — N/A. schema.md не трогаем. theme-system «тем 7» — зона M1, не M2. Не push без подтверждения. Точечный `git add` с AccordionLane — корректен.

---

## Блокеры (критично — исправить до запуска)

**Нет.** B1/B2 из ревью v1 закрыты в тексте v1.1; live-симптомы и файлы сходятся.

---

## Предупреждения (желательно учесть, не стопят CC)

### W1. Грязное дерево + M1 WIP
`git status`: uncommitted M1 (`theme-store`, `layout.tsx`, `globals.css` `.t-minimal`, Settings/ContentHeader swatches) + масса `_analysis/*`.  
Спринт правильно требует точечный `git add` пяти (или шести) файлов.  
**CC:** не `git add -A` / не stage M1 вместе с M2. Smoke: 6 тем минимум; **minimal уже в working tree** — можно (+нужно) прогнать 7-ю, если локальный M1 поднят.

### W2. TrendBadge `delta === 0` vs ветка sub
Целевая анатомия:

```tsx
{'trend' in c && c.trend != null
  ? <div><TrendBadge …/></div>
  : c.sub && …}
```

При `trend === 0` условие `!= null` истинно → рендер пустого `<div className="mt-0.5">` (TrendBadge → null), **sub не fallback**. Сейчас у trend-карточек (`Активные проекты`, `Звонки`) `sub` нет — визуально почти no-op. При желании: `c.trend` truthy check или не оборачивать null в div. Не блокер.

### W3. Счётчик AccordionLane без `config.bg`
Снять `config.bg` + `config.color`, оставить `rounded-full` без фона — пилюля может «схлопнуться» визуально. Достаточно нейтрального `text-text-mute` (можно без filled-pill) или `bg-surface2 text-text-mute`. Уточнять агенту не обязательно, если смок ок.

### W4. Docs drift (не scope M2)
`architecture.md` / theme-system: «тем 6»; M1 вносит 7-ю. Widgets-секция в architecture не описывает живой `TasksSidebar` (Clock + PlannedCalls + Focus + MiniKpi). На выполнение M2 не влияет.

### W5. Washi empty-value `opacity-50`
После split washi остаётся с opacity на value (byte-for-byte shared). P0-аудит формально про информативный текст; washi out of scope — ок, не расширять M2.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `DashboardHome.tsx` | 90–101 | TrendBadge: `delta === 0` → `null` |
| `DashboardHome.tsx` | 234–275 | fuji: watermark `30px` + label `text-xs text-text-dim` |
| `DashboardHome.tsx` | 278–327 | **split:** `if (wm)` = текущий shared as-is; default = новая анатомия |
| `PortfolioRiskWidget.tsx` | 30–104 | early `!hasRisk`; attention `text-yellow`; risk-ветку сохранить; убрать мёртвый zero-state |
| `TasksSidebar.tsx` | 41–50 | Clock compact |
| `TasksSidebar.tsx` | 71, 146–148, 203, 243 | headers → mute; Focus icon mute |
| `TasksSidebar.tsx` | 193–250 | default MiniKpi colors + `font-semibold`; washi cells не трогать |
| `TaskCard.tsx` | 29, 168–186 | `next` transparent; `!phaseMode` tags; outline + `data-tag` на company |
| `AccordionLane.tsx` | 81, 90–98 | title + count override; overdue L86–87 **не** трогать |
| `validators/task.ts` | 30–34 | **не** менять |
| `LaneColumn.tsx` | 16–21, 49–57 | optional |

Ложных файлов в commit-list нет. Aura orbs / washi scramble (`TextNavSidebar` + `use-text-scramble`) / fuji indigo CSS — корректно out of scope.

---

## Предлагаемые правки в спринт

Не обязательны для старта CC (v1.1 достаточен). Опционально:

1. В задаче 1: `trend != null && trend !== 0` (или не рендерить wrapper, если badge null) — снять W2.  
2. В задаче 7: «working tree может уже содержать M1 — smoke 7 тем, если `t-minimal` в `THEMES`».  
3. В КОММИТ: явный запрет stage `src/app/globals.css`, `theme-store.ts`, `layout.tsx` (M1).

---

## Чеклист crm-architect

- [x] Есть РАЗВЕДКА до правок  
- [x] Реальные пути (`DashboardHome`, `PortfolioRiskWidget`, `TasksSidebar`, `TaskCard`, `AccordionLane`)  
- [x] Задача 6: live-truth (`config.color` / `LANE_CONFIG`, не литералы)  
- [x] KPI: default не ломает washi (трёхветвевой split)  
- [x] Имена колонок/таблиц — N/A (нет SQL)  
- [x] Миграции / apply из CC — N/A  
- [x] org_id / RLS / SECURITY DEFINER — N/A  
- [x] Нет `flowType: 'implicit'`  
- [x] DELETE/CASCADE — N/A  
- [x] CSS: semantic tokens (`text-text-*`, `bg-surface`, `text-red` / `text-yellow`)  
- [x] schema.md — не требуется  
- [x] learnings / theme-system: opacity P0, theme class `t-*`, no raw palette  

---

## Чеклист перед CC

- [x] Split `if (fm)` / `if (wm)` / default вписан в промпт  
- [x] Задача 6 = `AccordionLane.tsx`, обязательная  
- [x] Attention color = `text-yellow`  
- [ ] `npm run build` после правок  
- [ ] Ручной /overview + /tasks: aura, washi, fuji, ≥1 dark (+ minimal, если в store)  
- [ ] washi: kanji KPI + MiniKpi + scramble sidebar  
- [ ] fuji: watermark ≤ value, label виден  
- [ ] aura: orbs / text-nav / `data-priority` без регресса  
- [ ] Portfolio zero-risk = одна строка; attention при 0 red виден  
- [ ] /tasks: компактные часы, однородные headers, «Не начата» не пестрит, секции mute  
- [ ] Commit: **только** 5 файлов (+ LaneColumn opt); **не** M1 / `_analysis`; **не push** без подтверждения  

**Итог:** v1.1 готов к Claude Code. Блокеров нет; главный операционный риск — случайный stage M1/грязного дерева, а не содержание промпта.
