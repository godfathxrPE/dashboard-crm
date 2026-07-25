# Ревью: S-PORTFOLIO-1 — Портфель внедрений (таб в /projects)

**Дата:** 2026-07-17  
**Ревьюер:** Grok (верификация по коду `main` @ `91fd2a0`, `delivery-health.ts`, `DeliveryPipelineBoard.tsx`, `DataTable.tsx`, `ProjectsSection.tsx`, crm-architect)  
**Объект:** `_analysis/sprint-S-PORTFOLIO-1.md` — management-вид: health-ранжирование, риск-чипы, aging-strip, таблица  
**Контекст:** `getDeliveryHealth` / `DeliveryHealthDot` (S-DLV-HEALTH-1); доска `DeliveryPipelineBoard`; score уже задокументирован «для сортировки портфеля»

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (health, хуки, DataTable string-sort) | ✅ |
| Scope: 2 файла, без БД / новых запросов | ✅ |
| healthOf 1:1 с `DeliveryPipelineBoard` | ✅ |
| Активные = `!isTerminal`; score asc | ✅ |
| Переиспользование `DeliveryHealthDot` / phases / projectHref | ✅ |
| DataTable: flat keys для sortable name/deadline | 🟡 **W1** |
| `STALE_STAGE_DAYS` не экспортирован | 🟡 **W2** |
| Aging-strip фаза `completed` у actives ≈ 0 | 🟡 **W3** |
| `DELIVERY_PHASE_TEXT` → `style.color`, не className | 🟡 **W4** |
| Edge cases / tokens / RBAC backlog | ✅ |
| crm-architect checklist | ✅ |

**Оценка: 9/10.** Спринт точный, узкий, опирается на уже готовый health-слой. Блокеров нет.  
**Рекомендация:** **запускать в CC**; в HOW учесть W1 (flat fields для sort) и W2 (dwell > 30 без import).

---

## Статус

| Заход | Репо |
|-------|------|
| `getDeliveryHealth` + `isDeliveryTerminal` | ✅ `src/lib/utils/delivery-health.ts` |
| `DeliveryHealthDot` CVD-safe | ✅ `DeliveryHealthDot.tsx` |
| `useDeliveryProjects` + board filter `type==='delivery'` | ✅ |
| `ProjectsSection` табы delivery / internal | ✅ L17, L123–141 |
| `PortfolioView` | ❌ этот спринт |
| Таб `portfolio` | ❌ этот спринт |

---

## Разведка (верификация)

| Утверждение спринта | Live |
|---------------------|------|
| `getDeliveryHealth` → status / reasons / score 0..100 | ✅ L54–106 |
| Терминал → score 100 healthy | ✅ L55–56 |
| `isDeliveryTerminal(stage, status)` | ✅ L115–122 |
| `useDeliveryProjects` = scope projects | ✅ `use-projects.ts` L242–244 |
| `Project`: progress_*, stage_entered_at, deadline, owner_id, company join | ✅ L54–93 |
| `usePipelineStages` / `PipelineStage.phase_group` | ✅ (board L186–190) |
| `useTeamMembers` → id, full_name, avatar, role | ✅ L9–15 |
| `DELIVERY_PHASE_ORDER` 4 фазы + LABELS + TEXT | ✅ `delivery-phases.ts` L8–37 |
| `hasTaskProgress` | ✅ L104–106 |
| `DeliveryHealthDot` health / size / showLabel | ✅ L19–26 |
| DataTable: `sortKey=null` default; sort = `String(item[key])` | ✅ L68, L93–100 |
| `projectHref` delivery → `/projects/[id]` | ✅ L10–14 |
| `healthOf` board: progress + dates + isTerminal | ✅ `DeliveryPipelineBoard` L213–222 |
| `SectionTab = 'delivery' \| 'internal'` | ✅ L17 |

---

## С чем согласен полностью

### 1. Scope и WHY

Management-портфель без SQL/N+1 — правильный следующий шаг после health-dot на карточках. Три существующих хука + client enrich; React Query кеш общий с доской (`['projects', …]`, stages, team) — «ноль новых запросов» соблюдается.

### 2. healthOf 1:1

Спринт требует дословно board-вход — совпадает с:

```213:222:src/components/projects/DeliveryPipelineBoard.tsx
  const healthOf = (p: Project): DeliveryHealth => {
    const st = p.stage_id ? stageById.get(p.stage_id) : null;
    return getDeliveryHealth({
      progress_done: p.progress_done,
      progress_total: p.progress_total,
      stage_entered_at: p.stage_entered_at,
      deadline: p.deadline,
      updated_at: p.updated_at,
      isTerminal: isDeliveryTerminal(st, p.status),
    });
  };
```

Не форкать пороги — learnings-совместимо.

### 3. Активные + pre-sort score asc

Терминалы (completed/lost / is_won/is_lost / phase completed) отфильтрованы — иначе score 100 засоряет «красные сверху».  
DataTable string-sort для числового score действительно ломает порядок (напр. `"100" < "40"`) — **не sortable + pre-sort** — верно.

### 4. UI-состав

Чипы-счётчики (фильтр) + aging-strip + segmented + таблица с reasons — закрывают роадмап «не видят красные до эскалации». Глифы = DeliveryHealthDot (●/◐/▲). Tokens only.

### 5. Integration

Один аддитивный таб + ветка в `ProjectsSection` — board/list не рефакторить. Коммит ровно 2 файла. RBAC manager-only — backlog S-PORTFOLIO-2.

### 6. Edge cases

progress_total 0, unknown stage, null owner, empty maps, empty/filtered empty — покрыты; согласованы с board («не теряем карточку» при unknown phase — здесь строка остаётся, phase=null).

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Sortable-колонки требуют **плоских** полей на row

`DataTable` сортирует только `item[col.key]` (L96–97), **не** `searchValue` и не nested `project.name`.

Если `PortfolioRow = { project, health, … }` и `key: 'name'` / `key: 'deadline'` без top-level строк — клик по заголовку даёт пустой/бессмысленный sort.

**HOW (рекомендуемая shape):**

```ts
type PortfolioTableRow = {
  id: string;                 // keyField
  name: string;               // sortable + search
  deadline: string | null;    // sortable ISO
  companyName: string;        // searchValue
  // … + project, health, stageName, phase, dwellDays, ownerName, isTerminal
};
```

`searchValue` для company — ок; score/dwell — **не** sortable (как в спринте).

### W2. `STALE_STAGE_DAYS` не экспортирован

В `delivery-health.ts` L27 константа **private**. Спринт: подсветка dwell `> STALE_STAGE_DAYS`.

**Не** импортировать несуществующий export. В `PortfolioView`: литерал `30` + комментарий `// = STALE_STAGE_DAYS в delivery-health`. Не менять `delivery-health.ts` (ЖЁСТКО: не форкать).

### W3. Aging-strip: фаза `completed`

Активные = `!isTerminal`, а `phase_group === 'completed'` → terminal → **карточка «Завершён» почти всегда 0**. Не баг (ORDER полный), но UX «пустая 4-я плитка». Опционально: strip только `initiated|planning|execution` — вне минимального scope; можно оставить 4 фазы как в board.

### W4. `DELIVERY_PHASE_TEXT` — CSS var strings

Значения вида `var(--accent-text, …)`, не Tailwind-классы. Паттерн board:

```ts
style={{ color: DELIVERY_PHASE_TEXT[phase] ?? '…' }}
```

Не `className={DELIVERY_PHASE_TEXT[phase]}`.

### W5. Default tab

Спринт: portfolio первым **или** после «Внедрение». Рекомендация спринта — после «Внедрение» — лучше для v1 (не ломает привычку sales/delivery). Default state оставить `'delivery'`, не `'portfolio'`.

### W6. `pageSize` DataTable = 20

При >20 активных — пагинация; pre-sort score сохраняется внутри filtered. Ок; при желании `pageSize={50}` — не обязательно.

### W7. Deadline overdue style

Согласовать с health: красный если `deadline < today` и `!(hasProgress && done >= total)` — как `getDeliveryHealth` (L65–74), не только «progress < 100%» при total=0 (total=0 → не complete → overdue красный — совпадает с health).

---

## Пропущенные места

| Файл | Действие |
|------|----------|
| `src/components/projects/PortfolioView.tsx` | **new** — весь UI |
| `src/components/projects/ProjectsSection.tsx` | + tab + branch |
| `delivery-health` / Dot / board / hooks | **не трогать** |

False positives: нет. Новых npm-deps: нет.

---

## Предлагаемые правки в спринт

1. **W1:** явно — flat `id`/`name`/`deadline`/`companyName` на table row.  
2. **W2:** dwell highlight: `dwellDays > 30` (mirror STALE_STAGE_DAYS), без import.  
3. **W4:** `style={{ color: DELIVERY_PHASE_TEXT[...] }}`.  
4. **W5:** default tab = `delivery`; portfolio после «Внедрение».

Не блокируют старт CC.

---

## Чеклист перед CC

- [ ] Только 2 файла (new PortfolioView + ProjectsSection)
- [ ] healthOf = board 1:1; filter `type==='delivery'` && `!isTerminal`
- [ ] pre-sort `score` ascending; score/dwell not sortable
- [ ] flat keys для name/deadline sort (W1)
- [ ] чипы ↔ filter state; empty messages (active vs filtered)
- [ ] `projectHref(r.project)` → `/projects/[id]`
- [ ] tokens only; CVD glyphs; tabular-nums
- [ ] `npx tsc --noEmit && npm run build`
- [ ] Smoke: counters = rows, aging, filter, row click, overdue red, 6 themes

---

## Итог одной строкой

Спринт **готов к CC**: чистый /code поверх health-утилит, inventory верен; единственный практический HOW-gap — **плоские поля строки для DataTable sort**.