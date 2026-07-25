# Ревью: M6 — аналитика (семантика цвета + утилита экспорта, D2)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (live `feat/deal-card` @ `3a43bb7`)  
**Объект:** `_analysis/sprint-m6-analytics.md` — фазы = track-токены, центр доната, empty-CTA, ExportPanel полосой  
**Контекст:** post M1–M1.1 + M2 + disabled-fix (`3a43bb7`); M3–M5 могут быть in-flight — M6 не зависит от их diff’ов (только analytics)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (anchors) | ✅ 1:1 с live |
| Task 1 PHASE_COLORS → track | ✅ |
| Task 2 center total all themes | ✅ + Unbounded only aura |
| Task 3 empty + CTA links | ✅ маршруты есть |
| Task 4 ExportPanel out of grid | ✅ layout + chips |
| SQL / RLS / theme store | ✅ N/A |
| Scope / commit files | ✅ 4 файла |
| Aura vs overview фазы | 🟡 by design (AURA_PHASE) |
| Loading → false empty | 🟡 |

**Оценка: 9/10.** Узкий UI-рефактор analytics, live-claims верны, блокеров нет.  
**Рекомендация:** запускать в CC as-is; учесть W1–W2 в DoD/смоке.

---

## Live-разведка

| Claim | Live | Notes |
|-------|------|-------|
| `PHASE_COLORS` accent/blue/yellow/green | **TRUE** L16 | `attract: blue, develop: accent, negotiate: yellow, close: green` |
| Overview track-токены | **TRUE** `OverviewCharts.tsx` L123–126 | exact same map as Task 1 snippet |
| `isAura && total > 0` center | **TRUE** L121 | Unbounded 30/700 |
| `LANE_COLORS` accent/blue/yellow/green | **TRUE** L15 | leave alone — correct |
| Grid 2×2 Pipeline + Export | **TRUE** `AnalyticsPage` L51–54 | |
| Calls empty «Нет звонков…» | **TRUE** L59–60 | no CTA link yet |
| `iconColor` on CSV items | **TRUE** ExportPanel L119–123, L139 | |
| `.t-minimal` track tokens | **TRUE** globals ~L668–671 | solid neutrals/orange/blue |
| Routes `/tasks` `/deals` `/calls` | **TRUE** app pages exist | |
| `text-text-mute` token | **TRUE** tailwind `text-mute` | |

---

## С чем согласен полностью

### 1. Task 1 — одна палитра фаз

Сейчас analytics и overview расходятся: overview уже на `--track-*-current`, analytics — на semantic accent/blue/yellow/green. Подмена `PHASE_COLORS` на track-map из OverviewCharts — правильный SSOT для **не-aura** баров (`isAura` → `AURA_PHASE` gradients, не трогать).

`LANE_COLORS` / AURA_DONUT оставить — статусы задач ≠ фазы сделок.

### 2. Task 2 — центр доната

Снятие `isAura &&` → `{total > 0 && (` — ок.  
`fontFamily: isAura ? 'var(--font-unbounded, …)' : 'inherit'` — обязательно: иначе minimal/frost наследуют display-шрифт в KPI-цифру (против языка minimal).  
fontSize 28 / weight 600 — разумный downshift от 30/700.

### 3. Task 3 — empty + CTA

| Chart | Условие | Copy + href | Маршрут |
|-------|---------|-------------|---------|
| TasksDistribution | `total === 0` | «Задач пока нет» → `/tasks` | ✅ |
| PipelineChart | all `count === 0` | «Нет активных сделок» → `/deals` | ✅ |
| CallsChart | `!hasCalls` | + «Записать звонок →» `/calls` | ✅ |

`h-48` сохранить — сетка не прыгает.  
Паттерн ссылки как в `DashboardHome` L512: `<a href="…" className="… text-xs text-accent hover:underline">`.

### 4. Task 4 — ExportPanel утилита

- Full-width `PipelineChart`, `ExportPanel` последним в `space-y-4` — верно (утилита ≠ peer-chart).  
- Горизонтальные чипы + muted icons + accent JSON — иерархия «главное действие = JSON» ок.  
- `exportCSV` / `exportJSON` / `downloadFile` не трогать — scope-safe.

### 5. Commit / scope

Только 4 analytics-файла, миграций нет, push без confirm — ок.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1 — false empty при loading

`useTasks` / `useProjects` без `isLoading` в charts:

```ts
// Charts.tsx TasksDistribution
if (!tasks) return []; // loading → total 0 → empty CTA flash
// PipelineChart
if (!projects) return []; // [] → every(count===0) === true в JS
```

**DoD-addendum:**

```tsx
// Tasks
const empty = tasks !== undefined && total === 0;

// Pipeline
const empty =
  projects !== undefined &&
  chartData.length > 0 &&
  chartData.every((d) => d.count === 0);
// при !projects chartData=[] — не empty; либо оставить skeleton/axes
```

Иначе на cold load мигает «Задач пока нет» / «Нет активных сделок».

### W2 — Aura: фазы analytics ≠ overview

Smoke: «Сделки по фазам = цвета воронки /overview» — **не-aura** после Task 1.  
На `t-aura` bars = `AURA_PHASE` gradients; overview = flat track tokens. Спринт явно: AURA_PHASE не трогать → **ожидаемое** расхождение. В смоке: «aura: градиенты на месте; parity фаз — non-aura themes».

### W3 — `iconColor` dead field

После mute icons поле `iconColor` в `csvItems` можно удалить (не оставлять unused prop).

### W4 — Pipeline empty vs 4 нулевых бара

Сейчас при нулях — оси + нулевые bars. Empty-CTA лучше UX; убедиться что заголовок «Сделки по фазам» остаётся над empty-блоком (как у Calls).

---

## Nice-to-have

- N1: вынести `PHASE_COLORS` track-map в shared const (OverviewCharts + Charts) — **не в этом спринте**, иначе scope creep  
- N2: `Link` from `next/link` вместо `<a>` — optional; dashboard уже на raw `<a>`  
- N3: Export strip `rounded-xl` vs charts `rounded-lg` — visual ok as utility bar  

---

## Пропущенные файлы

| Файл | Нужен? |
|------|--------|
| `OverviewCharts.tsx` | read-only reference — **не** в commit ✅ |
| `globals.css` | track tokens already per-theme — **не** трогать ✅ |
| `WeeklyReview.tsx` | вне scope ✅ |

---

## Предлагаемые правки в спринт (addendum, не стоп)

1. **W1** в Task 3: empty только при `data !== undefined` (+ `chartData.length > 0` для pipeline).  
2. **W2** в смоке: phase parity = minimal/frost/day/…; aura = gradients preserved.  
3. Task 4: drop `iconColor` from `csvItems` after mute.

---

## Чеклист перед CC

- [x] РАЗВЕДКА anchors verified  
- [x] No SQL / RLS  
- [x] CSS: only existing CSS vars in TS fill strings  
- [x] Routes `/tasks` `/deals` `/calls` exist  
- [x] Commit list = 4 files, no push  
- [ ] W1 empty-gating (рекомендуется в DoD)  
- [ ] Visual: minimal + aura + frost `/analytics` vs `/overview` phase colors  
- [ ] tsc 0  

---

## Итог

| | |
|--|--|
| **Вердикт** | **9/10 GO** |
| **Blockers** | нет |
| **Should** | W1 loading empty-gate; W2 smoke wording aura |
| **Файлы** | `Charts.tsx`, `CallsChart.tsx`, `AnalyticsPage.tsx`, `ExportPanel.tsx` |
| **В CC?** | Да, as-is (W1 желательно сразу в код) |
