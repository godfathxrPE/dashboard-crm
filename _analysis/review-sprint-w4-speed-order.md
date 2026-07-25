# Ревью: Sprint W4 — Скорость и порядок (post-W4a)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `999a538`; разведка sprint-команд + schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/sprint-w4-speed-order.md` — W4a (dynamic + fonts) · W4b (ProjectDetail, user-storage, focus-trap, Today, «Остывают», hygiene) · prefetch out  
**Контекст:** предыдущее ревью 8.5/10 @ `f9a9bbb` (2026-07-18); **W4a уже влит** (`a8096d4`, 2026-07-18); после W4a: chat/video/plan-import/Gantt-delete; W3 (`sprint-w3-scale.md`) **не merged**; миграции `contact_last_touch` **нет** (060 зарезервирована в `061_onboarding.sql`)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope: pure client, no SQL/RLS | ✅ |
| РАЗВЕДКА в начале | ✅ (но **ожидания разведки устарели**) |
| W4a (задачи 1–2) | ✅ **уже сделано** @ `a8096d4` |
| Поправки: prefetch out of W4a | ✅ (и верно; prefetch по-прежнему 0) |
| Тело промпта vs live-репо | ❌ **B0** — описывает pre-W4a мир |
| W4b §7.3 «потребители не меняются» | ❌ **B1** (по-прежнему ложно) |
| Gate W4b → после W3 | ✅ (W3 not ready; view нет) |
| ProjectDetail / localStorage / Modal / snooze | ✅ задачи W4b ещё актуальны |
| Dead code + lint stop-rule | ✅ |
| crm-architect (no SQL) | ✅ |

**Оценка: 5.5/10** как **исполняемый промпт «как есть»** (тело + шапка разведки противоречат `main`; повторный прогон W4a опасен/бессмыслен).  
Как **описание остатка W4b** (задачи 4–8 + B1) — содержание всё ещё полезно, но **нельзя скармливать CC без обновления статуса**.  

**Рекомендация:** **не запускать в CC как есть.**  
1) Зафиксировать в спринте: **W4a DONE** (`a8096d4`) — не переделывать.  
2) **Prefetch** — не в W4a/W4b, пакет post-W3.  
3) **W4b** — только после успешного merge W3 + перепись §7.3 (consumers) + recut LOC/tabs.

---

## Статус (репо @ `999a538`)

| Заход | Статус в репо |
|-------|---------------|
| **W4a commit** | ✅ `a8096d4` — «Sprint W4a: … dynamic import … шрифты»; chunk wins зафиксированы в сообщении |
| `next/dynamic(` | ✅ **есть** (layout, ProjectDetail/Gantt, DashboardHome charts, AnalyticsPage) — разведка «ожидаем: ни одного» **ложь** |
| `xlsx` | ✅ lazy: `ExcelImport.tsx:107`, `PlanImport.tsx:80` (top-level import **нет**) |
| `GanttTimeline` | ✅ `dynamic` + loading spinner `ProjectDetail.tsx:81–91`; файл **1312** LOC (не 849) |
| Shell modals | ✅ `QuickActionModals.tsx` extract + `dynamic`; `GlobalModals` `dynamic`; `CommandPalette` static |
| Charts | ✅ `OverviewCharts.tsx` (244) + dynamic в `DashboardHome`; Analytics dynamic на `CallsChart`/`Charts` |
| Шрифты | ✅ Geist **убран**; Manrope + IBM Plex + Onest + Unbounded(`400`/`700`); tailwind mono → `ui-monospace` |
| Prefetch / `HydrationBoundary` | ✅ **нет** в `src/` (исключение из W4a подтверждено) |
| ProjectDetail | ⚠️ **1001** LOC; `useState` ×16; `src/components/projects/detail/` **нет**; tabs: `activity\|board\|timeline\|quotes\|chat` |
| `?tab=` на detail | ❌ local `useState` L194; deals/projects `[id]/page.tsx` без Suspense/searchParams |
| `user-storage.ts` | ❌ нет |
| dual focus | ✅ `TodayFocus` `focus-<date>`; `TasksSidebar` `focus-day-<date>` |
| `saved-views` | unscoped `STORAGE_KEY` **L15** `'saved-views'` |
| persist | `dashboard-ui` (ui-store), `dashboard-theme` (theme, global — ок), `drawer-state` |
| Modal focus-trap / `aria-labelledby` | ❌ `role="dialog"` L83–84; Esc + scroll-lock + isDirty; **нет** trap/restore/`aria-labelledby` |
| «На завтра» | только `TodayView` L234/252/302; `QueueRow.secondary` — одна кнопка |
| `touchLevel(null)` | → `'cooling'` (`use-last-touch.ts` L32–33) |
| Today «Остывают» | `days === null \|\| days > T` (~L119) |
| ContactsTable `cooling` | `!last_touch \|\| days > T` L29; chip «Без касаний» **нет** |
| W3 `contact_last_touch` | **нет** миграции/view; 060 reserved |
| dead code | файлы есть; **0 importers** |
| `ignoreDuringBuilds` | `true` (`next.config.ts` L27–28); lint **Errors > 0** (any + no-html-link) |
| Deploy | Vercel (по sprint); W4a platform-agnostic |

---

## Разведка (верификация утверждений)

| Утверждение спринта | Live @ 999a538 |
|---------------------|----------------|
| `dynamic(` — ни одного | ❌ **ложь** — W4a уже добавил |
| xlsx top-import ExcelImport | ❌ уже `await import('xlsx')` |
| Gantt 849 static | ⚠️ dynamic ✅; LOC **1312** |
| ProjectDetail ~912 / 16 useState | ⚠️ **1001** / 16 (поправки: 932 — тоже устарело) |
| DashboardHome 802, recharts top-level | ❌ **568** LOC; recharts только в `OverviewCharts` |
| «чарты уже в подкомпонентах» (тело) / HOW extract | HOW выполнен |
| QuickActionModals inline | ❌ файл `shared/QuickActionModals.tsx` + dynamic |
| Unbounded «можно убрать» (тело §2) | ❌ **оставлен** (правильно) |
| Geist mono / kbd | ✅ `font-mono` → `ui-monospace` (W4a path) |
| Prefetch в W4a (тело/commit-msg) | ❌ поправки + live: out |
| Modal без trap | ✅ |
| dual focus / unscoped storage | ✅ |
| «На завтра» в QueueRow | ⚠️ label/onClick в **TodayView**; QueueRow generic |
| chip `?f=cooling` | ✅ `use-chip-filter` param `f` |
| date-helpers snooze | ⚠️ есть `localDateKey`/`mskDateKey`; **нет** `addLocalDays` / `nextMonday`; `bumpCall` ad-hoc L126–129 |
| dead code | ✅ 0 importers |
| W4a = only 1–2 | ✅ и **уже merged** |

**Chunk evidence из `a8096d4` (before → after):**  
`/companies` 358→247 · `/overview` 316→209 · `/analytics` 318→209 · `/projects/[id]` 315→307 КБ.

---

## С чем согласен полностью

### 1. W4a как идея — верная и **закрыта**
Dynamic xlsx/Gantt/shell-modals/charts + fonts-by-theme — дешёвый win. HOW из поправок (extract charts → dynamic; extract QuickActionModals; Unbounded leave; Geist→system mono) **реализованы** в `a8096d4`. Prefetch до W3 scale **правильно** исключён.

### 2. Prefetch (задача 3) — не сейчас
`prefetchQuery`/`HydrationBoundary` в `src/` нет. До W3 (смена query keys / infinite) префетч org-fetch ключей бессмыслен. Пакет post-W3 / вместе с W3 — ок.

### 3. Задачи W4b 4–6, 7.1–7.2, 8 — по-прежнему нужны
- ProjectDetail 1001 LOC, 16× useState, tabs + chat — оркестратор раздут.  
- localStorage unscoped + dual focus — баг multi-user browser.  
- Modal a11y gap (trap / restore / `aria-labelledby`) реален.  
- Snooze/bulk на «Задачи в работе» с просроченными — UX-gap.  
- Dead files + lint stop-rule — верны.

### 4. Gate W4b §7.3 → после W3
architecture.md: last_touch **клиентский** Map. W3 переводит на view `contact_last_touch` + realtime invalidate. Семантику «без касаний ≠ остывают» менять **один раз** поверх view — верно. W3 review **не ready as-is** (B1 cold-entry / B2 infinite blast) — gate = успешный merge, не файл спринта.

### 5. Нет миграций / schema.md
Pure-client → schema-update N/A. RLS/DEFINER/`flowType`/CASCADE не затрагиваются.

### 6. Lint stop-rule
Live: multiple `no-explicit-any` Errors + `@next/next/no-html-link-for-pages`. Flip `ignoreDuringBuilds: false` **сломает** `next build`. Оставить `true`; lint optional CI.

---

## Блокеры (критично — исправить до запуска)

### B0. W4a уже в `main` — тело/разведка ведут к повторной работе

Разведка ожидает `dynamic(` = 0, top-level xlsx, static Gantt, Geist в layout, inline QuickActionModals. **Всё это уже не так.**

Если CC выполнить спринт «с шапки»:
- перепишет уже правильный dynamic-layer;
- риск регрессий (Gantt loading, CommandPalette static, Unbounded weights);
- конфликт с post-W4a (chat tab, PlanImport lazy xlsx, ProjectDetail growth).

**Правка (док):** в шапке сразу:

```text
СТАТУС 2026-07-19: W4a DONE @ a8096d4. НЕ выполнять задачи 1–2.
Остаток: W4b (4–8) после W3. Prefetch — out (post-W3).
SoT: этот статус + §ПОПРАВКИ + B1 consumers.
```

Переписать/зачеркнуть §1–2, intro «PR A = 1–3», commit-msg с prefetch.

### B1. §7.3 «логика только в `touchLevel`, потребители не меняются» — **ложно**

Семантика «без касаний ≠ остывают» **продублирована**:

| Место | Сейчас | Нужно |
|-------|--------|--------|
| `touchLevel(null)` L32–33 | `'cooling'` | не «остывают» (`'ok'` **или** `'untouched'`) |
| `TodayView` filter ~L119 | `days === null \|\| days > T` | **исключить** `days === null` |
| `ContactsTable` CHIP L29 | `!last_touch \|\| days > T` | `!!last_touch && days > T` |
| новый chip | — | `no_touch` / «Без касаний» (`!last_touch`) |
| `Section` L401–414 | только title/count/icon | «все N» → `/contacts?f=cooling` |
| copy «касаний не было» в секции | — | убрать из «Остывают» |

Поправки спринта B1 **признают**, тело §7.3 **не переписано**.  
`last_touch_kind` — не колонка; сейчас `LastTouch.kind` / post-W3 view field. Формулировка: «есть last_touch», не `last_touch_kind`.

---

## Предупреждения (желательно исправить)

### W1. Двойной source of truth (тело vs ПОПРАВКИ vs reality)
Тело: PR A = 1–3, «чарты уже выделены», «убрать семейства целиком», prefetch, commit с Hydration.  
Поправки: W4a = 1–2, HOW extract, Unbounded leave.  
**Reality:** W4a done.  
Риск максимальный: CC стартует с §РАЗВЕДКА/§1.

### W2. ProjectDetail — дрейф scope распила
| Было в спринте | Live |
|----------------|------|
| 912 / поправки 932 | **1001** |
| tabs activity/board/timeline/quotes | + **`chat`** (`ProjectChat`) |
| Gantt 849 | **1312** (dynamic уже есть — W4b **не** трогает import) |
| info grid | + video section / pinned note / team (post-W4a) |

Целевые `DealHeader` / `StagePanel` / `DealInfoGrid` + tab switcher — ок, но:
- бюджет ≤250 пересчитать;
- `?tab=` values: `activity|board|timeline|quotes|chat`;
- Suspense на **обоих** `deals/[id]` и `projects/[id]` page;
- `activeTab` derived (delivery→board) сохранить 1:1 при URL.

### W3. Snooze: QueueRow API + date math
- `secondary?: {label,onClick}` — одна кнопка; нужен `secondaryMenu[]` или dropdown.
- `date-helpers`: `addLocalDays(key,n)`, `nextMonday(key)` (local TZ / `localDateKey`, не UTC).
- `bumpCall` / `tomorrowKey` — заменить на helpers.
- Bulk: цикл `useUpdateTask` (`deadline` / `lane: 'next'`); RPC reorder не обязателен.

### W4. Focus-trap: AiWorkspace ≠ shared Modal
`AiWorkspaceModal` — свой overlay (`role="dialog"`), не `shared/Modal`.  
Nested test: GlobalModals + page modal / `SpawnWizard` / `QuoteModal` / `DeliveryCompletionModal`.  
`GlobalModals` Esc L24–31 (комментарий «модалки Escape не слушают» — **устарел**: Modal L56–66 слушает + `stopPropagation`). При trap не сломать isDirty; проверить double-close.

### W5. Порядок волны / file conflicts

| Файл | W3 | W4b | Правило |
|------|----|-----|---------|
| `use-last-touch.ts` | → view | touchLevel + filters | **W3 first** |
| `TodayView` / QueueRow | scale/error | snooze/bulk/cooling | W3 first **или** disjoint commits |
| `(dashboard)/layout.tsx` | shell hooks | W4a already dynamic | W4b **не** трогает layout |
| `ProjectDetail` | — | split only | Gantt dynamic уже есть |

```text
W3 (scale + last_touch view) ──► W4b (4–8 + B1 consumers)
W4a ── DONE a8096d4
prefetch ── post-W3
```

### W6. Мелочи
- `use-saved-views` STORAGE_KEY **L15**, не :16.  
- `userKey(base,userId)` vs `focus:userId:date` — один helper API (`scopedKey(base, userId, ...parts)`).  
- `drawer-state` unscoped — optional.  
- `useAuth()` → `{ user, loading, signOut }` — «не читать storage до auth» обязательно.  
- Task 8: перед delete grep zero (уже 0); пустую `src/hooks/` удалить.  
- architecture.md dual-focus / Modal custom — W4b в правильную сторону.

### W7. learnings / architecture
- CSS: fonts через `--font-*` ✅ (W4a).  
- schema: `contact_last_touch` нет — W4 не invent'ит SQL ✅.  
- last_touch client Map (architecture) — W4b не ломает до W3.

---

## Пропущенные места (grep gaps для **остатка** W4b)

| Файл | Факт | Действие |
|------|------|----------|
| `TodayView.tsx` | ~L105–121, L340+, Section L401–414 | filter cooling + copy + link «все N» |
| `ContactsTable.tsx` | L25–29, L69–72 | CHIP cooling + chip `no_touch` |
| `use-last-touch.ts` | L32–33 | `touchLevel(null)` semantics |
| `ProjectDetail.tsx` | 1001 LOC; tab L194; chat tab | split → `detail/*`; `?tab=` |
| `deals/[id]/page.tsx`, `projects/[id]/page.tsx` | no Suspense | wrapper для searchParams |
| `QueueRow.tsx` | secondary single | menu/dropdown API |
| `date-helpers.ts` | нет snooze helpers | `addLocalDays` / `nextMonday` |
| `TodayFocus.tsx`, `TasksSidebar.tsx`, `use-saved-views.ts`, `ui-store` | unscoped / dual keys | `user-storage` + `useDayFocus` |
| `Modal.tsx` | L56–84, L92–94 title | trap + restore + `aria-labelledby` |
| `GlobalModals.tsx` | Esc L24–31 | согласовать с Modal Esc |
| `dashboard-content.tsx`, `useWatermark*`, `use-watermark-hover` | 0 imports | delete |
| `next.config.ts` | ignoreDuringBuilds true | **не** flip |
| спринт §1–2 / РАЗВЕДКА / КОММИТ | pre-W4a | пометить DONE / вычистить |

**Не в scope повторно (уже W4a):** ExcelImport xlsx, OverviewCharts, Analytics dynamic, QuickActionModals extract, layout dynamic, fonts/Geist, Gantt dynamic.

---

## Предлагаемые правки в спринт (док, не код)

1. **Шапка-статус:** `W4a DONE a8096d4; do not re-run §1–2; prefetch out; W4b after W3`.  
2. **§РАЗВЕДКА:** обновить expected output под post-W4a (или «только W4b-символы»).  
3. **§1–2:** зачеркнуть / «DONE» + ссылка на commit + chunk table.  
4. **§3 / КОММИТ W4a:** убрать prefetch; commit-msg W4a не использовать.  
5. **§4:** LOC **1001**; tabs + `chat`; Suspense both detail pages; Gantt dynamic already.  
6. **§7.3:** убрать «потребители не меняются»; таблица B1 (TodayView + ContactsTable + chip + Section).  
7. **§6:** nested example → shared Modal stack, не AiWorkspace.  
8. **§7.1:** QueueRow `secondaryMenu` + date-helpers.  
9. **§5:** STORAGE_KEY L15; optional drawer-state.  
10. **КОММИТ:** только W4b message; file list explicit (не `add -A`).

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА в начале (команды ок; **ожидания** устарели — B0)  
- [x] Реальные пути/символы (с дрейфом LOC/lines)  
- [x] Нет SQL/migrations → schema.md N/A  
- [x] org_id / RLS / DEFINER N/A  
- [x] no `flowType: implicit`  
- [x] DELETE/CASCADE N/A  
- [x] CSS variables only (`--font-*`) — W4a already  
- [x] learnings: dual focus / Modal a11y / theme cascade  
- [x] W3 view semantics — не дублировать дважды (gate after W3)

---

## Чеклист перед CC

### W4a
- [x] **Уже в main** — **не запускать**  
- [x] dynamic xlsx / Gantt / modals / charts  
- [x] fonts: Geist out, Unbounded 400+700, mono system  
- [x] prefetch **не** делали  

### Prefetch (задача 3)
- [ ] **Не в W4** — post-W3 / с пакетом scale  

### W4b (только после W3 + правки дока)
- [ ] W3 merged (`contact_last_touch` + realtime keys stable)  
- [ ] §7.3: `touchLevel` + TodayView + ContactsTable + chip `no_touch` + Section link  
- [ ] ProjectDetail split ≤~250 orchestrator; `?tab=` + Suspense both pages; tab=`chat`  
- [ ] `user-storage` + merge focus + cleanup 30d; no read until auth  
- [ ] Modal focus-trap + `aria-labelledby`; nested = shared Modal  
- [ ] snooze menu + bulk overdue; date-helpers  
- [ ] dead code delete; lint **не** gate build while Errors > 0  
- [ ] `npx tsc --noEmit && npx vitest run`; smoke Today/Modal/storage switch-user  

---

## Итог

Предыдущее ревью (8.5/10) **корректно открыло W4a** — и W4a **успешно влит** (`a8096d4`) с измеренным выигрышем чанков.  

**Сейчас** документ `_analysis/sprint-w4-speed-order.md` **отстаёт от `main`**: разведка и тело всё ещё описывают pre-W4a состояние. Повторный запуск в CC **противопоказан**.  

**Остаток ценности** — W4b (порядок UX) + hygiene, с прежними условиями: **после W3**, с переписью §7.3 consumers (B1), актуальными LOC/tabs (1001, `chat`), без prefetch и без flip lint.  

**Оценка 5.5/10** (как executable as-is). После B0-статуса + B1-переписи тела — снова ~8/10 для W4b-only handoff.
