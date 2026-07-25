# Ревью: S-PORTFOLIO-2 — Risk-виджет на /overview

**Дата:** 2026-07-17  
**Ревьюер:** Grok (верификация по коду `main` @ `53f4b55`, `PortfolioView.tsx`, `ProjectsSection.tsx`, `DashboardHome.tsx`, `projects/page.tsx`, `ProjectsView.tsx`, crm-architect)  
**Объект:** `_analysis/sprint-S-PORTFOLIO-2.md` — `usePortfolioHealth` + URL-таб + `PortfolioRiskWidget`  
**Контекст:** S-PORTFOLIO-1 в `main` (таб «Портфель» на useState); health-пороги в `delivery-health.ts` не трогаем

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + 3 инварианта (не форкать health / reuse hooks / tokens) | ✅ |
| Extract `usePortfolioHealth` 1:1 из PortfolioView | ✅ |
| Owner только в PortfolioView | ✅ |
| URL `?tab=` + Suspense на page | ✅ (критично для Next 15) |
| Risk-виджет под KPI, deep-link, zero-state | ✅ |
| Nit direction-badge | ✅ (баг live L192) |
| `router.replace` vs claim «назад переключает таб» | 🟡 **W1** |
| «stages уже в кэше» — да; delivery-projects — нет | 🟡 **W2** |
| Scope ≠ RBAC (ожидание из PORTFOLIO-1 backlog) | 🟡 **W3** (не дефект) |
| `git add .` | 🟡 **W4** |
| crm-architect checklist | ✅ |

**Оценка: 9/10.** Зрелый follow-up: правильный extract хука, deep-link, management-signal на overview. Блокеров нет.  
**Рекомендация:** **запускать в CC**; в HOW — `router.push` (как `/deals`) или убрать acceptance «назад = таб».

---

## Статус

| Заход | Репо |
|-------|------|
| S-PORTFOLIO-1 `PortfolioView` + tab | ✅ `53f4b55` |
| `usePortfolioHealth` | ❌ |
| `?tab=portfolio` URL | ❌ (useState L113) |
| Suspense на `/projects` | ❌ page L11 — голый `ProjectsSection` |
| `PortfolioRiskWidget` на overview | ❌ |
| direction Badge guard | ❌ L192 всегда ERP/IIoT |

---

## Разведка (верификация)

| Утверждение спринта | Live |
|---------------------|------|
| PortfolioView: delivery + !terminal + score asc | ✅ L98–143 |
| counts / aging / STALE 30 / flat id·name·deadline | ✅ |
| ownerName в row + membersById | ✅ L136, L214–222 |
| Badge direction без guard → null = «ERP» blue | ✅ L192–194 **баг** |
| ProjectsSection: `useState<SectionTab>('delivery')` | ✅ L112–113 |
| Tabs: delivery · portfolio · internal | ✅ L124–127 |
| `projects/page.tsx` без Suspense | ✅ L11 |
| DashboardHome: KpiCards → charts | ✅ L824–837 |
| `usePipelineStages` на overview | ✅ DashboardHome L387 |
| `useDeliveryProjects` на overview | ❌ dashboard = `useProjects()` (scope `all`) |
| `stagger-5` / `elevation-hover` | ✅ globals + Charts pattern |
| Calendar Suspense + useSearchParams | ✅ `calendar/page.tsx` |
| Deals tabs: `router.push` + preserve params | ✅ `ProjectsView.tsx` L49–58 |

---

## С чем согласен полностью

### 1. Инвариант «не форкать health»

Вынос ранжирования в `usePortfolioHealth()` — правильный ответ на виджет + таблицу. SQL-пороги в `getDeliveryHealth` остаются single source. Скелет хука **дословно** совпадает с `PortfolioView` L85–163 (stageById, loop, sort, counts, aging).

### 2. Owner вне хука

Виджету `ownerName` не нужен; `useTeamMembers` только в PortfolioView — меньше запросов на /overview. Колонка owner → `membersById.get(r.project.owner_id)` — ок.

### 3. URL-таб + Suspense

Deep-link `/projects?tab=portfolio` невозможен на useState — обязателен.  
`projects/page.tsx` без Suspense — при `useSearchParams` в Next 15 build часто падает; calendar уже обёрнут. Задача 3b верна.

Default `delivery` + clean URL без `?tab=` — как deals pipeline.

### 4. Виджет

- Счётчик `at_risk` + топ-N по уже sorted `score asc`  
- Zero-state зелёный (не unmount) — нет layout jump  
- error → null — дашборд не краснеет  
- `projectHref` + footer portfolio — консистентно  
- Стили `rounded-lg bg-surface p-4 elevation-hover` — как `CallsChart` / KPI cards  

### 5. Nit direction (Задача 6)

```192:194:src/components/projects/PortfolioView.tsx
          <Badge color={r.project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
            {r.project.direction === 'iiot' ? 'IIoT' : 'ERP'}
          </Badge>
```

При `direction === null` → blue «ERP». Guard `r.project.direction &&` — нужный fix.

### 6. Scope / RLS

Read-only reuse; RBAC-гейта нет (явный выбор спринта) — RLS org-scope достаточно для v1 overview.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `router.replace` vs «кнопка назад переключает таб»

Спринт Verify: «кнопка «назад» переключает таб».  
Код: `router.replace(..., { scroll: false })` — **не кладёт** табы в history → Back уходит с `/projects`.

На `/deals` конвенция — **`router.push`** (`ProjectsView.tsx` L49–58).

**Правка (одна из):**
1. `router.push` — Back ходит по табам; или  
2. Оставить `replace` (меньше history spam) и **убрать** acceptance про Back.

Deep-link shareability не зависит от push/replace.

### W2. «Оба уже в кэше» — только stages

- `usePipelineStages` — да, overview уже зовёт.  
- `useDeliveryProjects` = `useProjects('projects')` → query key `['projects','projects']`.  
- Dashboard KPI: `useProjects()` → `['projects','all']` — **другой ключ**.

На cold /overview виджет **инициирует** fetch delivery+internal. Это ок (reuse hook, не новый API), но не «уже тёплый кэш». Не блокер.

### W3. Scope drift vs PORTFOLIO-1 backlog

PORTFOLIO-1 обещал S-PORTFOLIO-2 = **RBAC manager/admin** на таб.  
Фактический 2 = **Risk-виджет + URL + shared hook** (RBAC нет — «для всех ролей»).

Продуктово разумнее; RBAC — S-PORTFOLIO-3. В ревью/roadmap не путать.

### W4. `git add .`

Слишком широко. Явный список:

```
src/lib/hooks/use-portfolio-health.ts
src/components/projects/PortfolioView.tsx
src/components/projects/ProjectsSection.tsx
src/app/(dashboard)/projects/page.tsx
src/components/dashboard/PortfolioRiskWidget.tsx
src/components/dashboard/DashboardHome.tsx
```

### W5. `setTab` и чужие query-params

Сейчас на `/projects` других params нет. Если появятся — `new URLSearchParams(searchParams)` + set/delete `tab` (как ProjectsView). Не блокер v1.

### W6. «ноль px» vs Tailwind spacing

SELF-CHECK «ноль px» — не буквально: `p-4`, `text-3xl` в сниппете. Имеется в виду: no hex / no arbitrary `[Npx]` для цветов. Токены `text-red/green/yellow` — ок.

### W7. Backward-compat PortfolioView

После extract: `active` больше не зависит от `membersById` → owner «—» пока members loading (раньше ждал members в том же memo). UX: краткий flash «—» → имя. Приемлемо; при желании — не показывать owner column loading.

### W8. TOP_N = 4

Хардкод ок; при 0 risk список скрыт, счётчик 0 — layout stable.

---

## Пропущенные места

| Файл | Действие |
|------|----------|
| `src/lib/hooks/use-portfolio-health.ts` | **new** |
| `src/components/projects/PortfolioView.tsx` | refactor + Badge guard |
| `src/components/projects/ProjectsSection.tsx` | URL tab |
| `src/app/(dashboard)/projects/page.tsx` | Suspense |
| `src/components/dashboard/PortfolioRiskWidget.tsx` | **new** |
| `src/components/dashboard/DashboardHome.tsx` | insert after KpiCards |
| migrations / delivery-health | **не трогать** |

---

## Предлагаемые правки в спринт

1. **W1:** `router.push` как `/deals`, или скорректировать Verify (Back).  
2. **W4:** `git add` только 6 путей.  
3. Опционально W5: preserve searchParams.  
4. В шапке: «RBAC — out of scope (был backlog PORTFOLIO-1; перенос на 3)».

---

## Чеклист перед CC

- [ ] `usePortfolioHealth` 1:1 с current PortfolioView loop/sort/counts/aging
- [ ] PortfolioView: hook + members only; no local getDeliveryHealth
- [ ] `?tab=portfolio|internal`; default delivery без qs
- [ ] Suspense на `projects/page.tsx`
- [ ] Widget: at_risk + top 4 + attention line + zero green + footer link
- [ ] DashboardHome между KpiCards и charts (`stagger-5`)
- [ ] Badge direction only if truthy
- [ ] `npx tsc --noEmit && npm run build`
- [ ] Smoke: deep-link, widget click → detail, portfolio link, 6 themes

---

## Итог одной строкой

Спринт **готов к CC**: extract health-хука + deep-link + overview risk-signal закрывают боль роадмапа без SQL; единственный HOW-gap — **push vs replace** для history/Back.