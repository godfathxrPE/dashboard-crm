# Ревью: M7 — донат «Задачи по статусу» hover (D1, v1.1)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (live `feat/deal-card` @ `3ebbb32`, post-M6)  
**Объект:** `_analysis/sprint-m7-donut-interactive.md` (v1.1) — hover-эмфаза SVG-сегментов + значение/имя в центре + опциональная легенда  
**Контекст:** M6 (`3ebbb32`) уже в коде: center `total` всем темам, empty-CTA, track phase palette. Предыдущее ревью v1 (9/10, без блокеров) → v1.1 встроил W1–W3 и N1. SQL/миграций нет.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА vs live post-M6 | ✅ якоря верны; 🟡 grep-токен `isAura && total` мёртв |
| Scope = только `TasksDistribution` | ✅ |
| Hover dim на path (декор, P0) | ✅ |
| Style order / isAura без `opacity:1` | ✅ (v1.1 закрыл W2) |
| Match by `lane` | ✅ (v1.1 закрыл N1) |
| Center dual-line + Unbounded only aura | ✅ |
| Label 11px (F-01) | ✅ (v1.1 закрыл W3) |
| useState в импорте | ✅ (v1.1 закрыл W1) |
| Legend sync | 🟡 optional — лучше сделать |
| SQL / deps / RLS | ✅ N/A |
| mouseLeave на path vs центр | 🟡 UX-риск (см. W1) |

**Оценка: 9/10.** Узкий UI-паритет с recharts-tooltip; v1.1 закрыл все замечания v1; блокеров нет.  
**Рекомендация:** запускать в CC as-is; желательно учесть W1 (leave на SVG) и Task 3 (легенда) в том же PR.

---

## Live-разведка (post-M6 @ `3ebbb32`)

Команда спринта:

```bash
grep -n "TasksDistribution\|arcPath\|arcs.map\|isAura && total\|dominantBaseline" src/components/analytics/Charts.tsx
```

| Claim спринта | Live |
|---------------|------|
| `TasksDistribution` SVG-донат | ✅ L50–161 |
| `arcPath` | ✅ L78–90 |
| `arcs.map` → `<path fill=…>` | ✅ L118–132 |
| Center `total > 0` **всем** темам | ✅ L135–140 (не `isAura && total`) |
| Unbounded только `isAura` | ✅ L137 |
| Legend снизу `chartData.map` | ✅ L144–158 |
| `dominantBaseline="central"` | ✅ L136 |
| Hover / `useState` / `onMouseEnter` | ❌ **нет** — работа ещё не сделана |
| Empty `total === 0` → CTA, SVG не монтируется | ✅ L95–99 — hover N/A |
| Import | L3: `import { useMemo } from 'react'` — только `useMemo` |
| isAura style | L126–129: `transition` + spread с **`opacity: 1`** |
| `PipelineChart` / recharts Tooltip | L164+ / L209 — отдельные export; CallsChart — другой файл |
| `AnalyticsPage` dynamic import | `TasksDistribution` из `./Charts` — scope одного файла достаточен |
| `tasks.lane` (`now`/`next`/`wait`/`done`) | schema + `useTasks` — матч по `lane` корректен |

`isAura && total` в grep **не матчится** (M6 снял условие). Текст подтверждения в спринте верный («после M6 — для всех тем»); только diagnostic pattern чуть устарел.

`@keyframes donutIn` (`globals.css` L964–967): `0% { opacity: 0 }` → `100% { opacity: 1 }`. Убрать `opacity: 1` из isAura-spread **безопасно**: после анимации (fill-mode default `none`) победит style-`opacity` из hover-логики.

---

## С чем согласен полностью

### 1. Проблема и scope

Донат — рукописный SVG, без recharts `Tooltip`. Hover-эмфаза + центр — правильный паритет без новых зависимостей. Один файл, один commit, без push/миграций — идеальный D1.

### 2. Task 1 — hover dim (v1.1)

Нормативный style-порядок верен:

```tsx
style={{
  cursor: 'default',
  transition: 'opacity 0.15s ease, fill 0.5s cubic-bezier(0.16,1,0.3,1)',
  opacity: hovered && hovered.lane !== arc.lane ? 0.45 : 1,
  ...(isAura
    ? { animation: 'donutIn …', transformOrigin: '100px 100px' }
    : {}),
}}
```

Live сейчас кладёт `opacity: 1` **внутрь** isAura-spread **после** transition — без правки v1.1 hover-dim в aura **сломался бы**. Комментарий в спринте («НЕ класть opacity») — must-follow для CC.

Матч по `lane` (не `name`) — надёжнее; `key={arc.lane}` уже на path.

Декор-эмфаза на path (не текст) — P0/контраст не нарушается.

### 3. Task 2 — центр

- idle: `total` 28/600 + `dominantBaseline="central"` + Unbounded only aura — как live M6.  
- hover: value 26/600 + name 11px `var(--text-mute)` — F-01 floor для читаемого лейбла; 11px согласован с `TT` fontSize: 11 в том же файле.  
- y=92 / y=114 вокруг cy=100 — адекватно для двух строк.

### 4. Task 3 — легенда

Дешёвый двусторонний hover (path ↔ legend item) на том же `setHovered` — стоит сделать в том же PR, иначе легенда останется «мёртвой» относительно сегментов.

### 5. Границы / commit

- Не трогать `PipelineChart`, `CallsChart`, `ExportPanel`, `PHASE_*`.  
- `git add` только `Charts.tsx`.  
- tsc 0 + smoke всех тем — достаточно.

### 6. crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА | ✅ |
| schema table/column | ✅ N/A (UI); `lane` реален |
| paths architecture | ✅ `src/components/analytics/Charts.tsx` |
| learnings gotchas | ✅ N/A (нет SQL/client/auth) |
| migrations not from CC | ✅ нет миграций |
| org_id / RLS / SECURITY DEFINER | ✅ N/A |
| no `flowType: 'implicit'` | ✅ N/A |
| CSS variables only | ✅ `var(--text)`, `var(--text-mute)` |
| schema.md update | ✅ N/A |

---

## Блокеры (критично — исправить до запуска)

**Нет.**

---

## Предупреждения (желательно)

### W1 — `onMouseLeave` на каждом path vs центр

Спринт вешает Enter/Leave на `<path>`. Центр-`<text>` лежит **в отверстии** кольца (после `<g>` в DOM). Переход курсора с сегмента в «дыру» (где как раз показывается value+name) → leave path → `hovered = null` → центр мигает обратно на `total`. Между сегментами (gap ~1.5) возможен короткий flicker.

**Рекомендация в код:**

```tsx
<svg … onMouseLeave={() => setHovered(null)}>
  …
  <path
    onMouseEnter={() => setHovered({ lane: arc.lane, name: arc.name, value: arc.value })}
    // без onMouseLeave на path
  />
</svg>
```

Leave только с SVG (или outer `div`) сохраняет hover при движении в центр и стабилизирует gap. Не блокер: базовый hover по дуге работает; без этого Task 2 частично «съедает» сам себя.

### W2 — Task 3 optional

«По желанию» → CC может пропустить. Рекомендовать **минимум** legend Enter/Leave + muted/bright в том же commit (дешево, паритет).

### W3 — touch / a11y

Только hover: на touch центр остаётся `total`. Для D1 acceptable. Sticky-click / focus — out of scope (как W4 в v1-ревью).

### W4 — РАЗВЕДКА pattern

Убрать `isAura && total` из grep (или заменить на `total > 0`) — иначе «пустой» match путает исполнителя post-M6.

### W5 — `prefers-reduced-motion` (nice)

`opacity 0.15s` + aura `donutIn` — optional `motion-safe` / media; out of scope D1.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `src/components/analytics/Charts.tsx` | L50–161 | **единственная** зона правок |
| `src/components/analytics/Charts.tsx` | L164–225 `PipelineChart` | **не трогать** |
| `src/components/analytics/CallsChart.tsx` | — | **не трогать** |
| `src/app/globals.css` | L964–967 `donutIn` | **не трогать**; opacity-from-keyframe ок |
| `src/components/analytics/AnalyticsPage.tsx` | dynamic import | **не трогать** |

Ложных файлов в спринте нет. Dead import `PieChart`/`Pie`/`Legend` в Charts.tsx — pre-existing, OOS.

---

## Предлагаемые правки в спринт (опционально, не блокируют CC)

1. **W1:** leave на `<svg>`, Enter на path; убрать Leave с path.  
2. **W2:** Task 3 → «сделать», не «по желанию».  
3. **W4:** grep: `total > 0` вместо `isAura && total`.  
4. Явно: «в isAura-spread не возвращать `opacity: 1`» — уже есть, оставить.

v1.1 по W1/W2/W3/N1 **уже полный** — дополнительных правок для GO не требуется.

---

## Чеклист перед CC

- [x] M6: center total всем темам, empty-CTA, track phases  
- [x] Live: path + legend + no hover  
- [x] v1.1: useState import, style order, lane match, name 11px  
- [ ] Реализовать hover + center (и желательно legend)  
- [ ] isAura-spread **без** `opacity: 1`  
- [ ] (жел.) mouseLeave на svg, не на path  
- [ ] Smoke: aura / minimal / frost — Unbounded только aura  
- [ ] Pipeline + Calls не изменены  
- [ ] tsc 0  
- [ ] Один commit, **не** push без confirm  

---

## Итог

| | |
|--|--|
| **Вердикт** | **9/10 GO** |
| **Blockers** | нет |
| **v1 → v1.1** | W1 useState, W2 style merge, W3 11px, N1 lane — **закрыты в промпте** |
| **Should in code** | W1 leave-на-svg; Task 3 legend sync |
| **Файлы** | только `src/components/analytics/Charts.tsx` |
| **В CC?** | **Да**, as-is |
