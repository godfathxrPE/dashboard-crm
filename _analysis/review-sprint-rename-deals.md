# Ревью: sprint-rename-deals.md (v2) — UI «Проекты» → «Сделки»

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, `origin/main` ahead 5; schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/sprint-rename-deals.md` — v2 handoff: UI-лейблы «Проекты» → «Сделки» + conditional-by-type  
**Контекст:** предыдущее ревью `_analysis/review-sprint-rename-deals.md` (2026-07-10, ветка `feat/aura-theme`); коммиты `e3839ee` (rename labels) и `4c1f2ad` (nav split `/deals` vs `/projects`); delivery P1+ (`8706399` и далее)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Идея v1/v2 (только UI-лейблы, схема/ids не трогать) | ✅ Исторически верно |
| Conditional-by-type для per-record | ✅ Уже реализовано |
| Актуальный routing-контракт (`/deals` vs `/projects`) | ❌ Спринт устарел — моделирует pre-split мир |
| Файлы/строки Задач 1–5 | ❌ ~80% путей/номеров неверны или уже сделаны |
| РАЗВЕДКА (grep-инвентарь) | 🟡 Команды ок, ожидаемый результат другой |
| «ЖЁСТКО НЕ ТРОГАТЬ» | ❌ Неполное и частично перевёрнутое post-split |
| Риск запуска «как есть» в CC | ❌ **Регрессия**: переименует delivery-раздел «Проекты» в «Сделки» |

**Оценка: 2/10** как runnable handoff на текущем `main`. Как исторический снимок — полезен только для аудита.  
**Рекомендация:** **не запускать** в Claude Code. Работа **уже сделана** (`e3839ee`) и **архитектурно превзойдена** (`4c1f2ad` + delivery). Нужен новый sprint только на остаточные cosmetic-дыры (ниже), не v2 rename.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| v1 rename (лейблы) | ✅ Закоммичено `e3839ee` (2026-07-10 15:56) — **тот же commit message**, что в разделе КОММИТ спринта |
| v2 conditional-by-type | ✅ В `e3839ee` + доработки (ProjectModal/Detail/adapters) |
| Nav split: client → `/deals`, delivery+internal → `/projects` | ✅ `4c1f2ad` (2026-07-10 23:31); architecture.md отражает это |
| Delivery-модуль «Проекты» (P1+) | ✅ `ProjectsSection`, `DeliveryPipelineBoard`, SpawnWizard, type=`delivery` |
| Спринт v2 vs live code | ❌ **Stale** — описывает мир до split |

---

## С чем согласен полностью

### 1. Исходная семантика (pre-split)

`projects.type='client'` = пресейл-сделки; UI «Проекты» для них вводил в заблуждение. Это совпадает со schema.md (`projects` — «сделки/проекты», `type` client/internal/delivery) и gap-логикой HubSpot-like deals.

### 2. Conditional-by-type — правильное правило

Per-record строки: `client` → «сделка», `internal` → «проект». В live-коде уже так:

- `ProjectModal.tsx:268–290` — заголовок / submit / label name через `isInternal`
- `ProjectDetail.tsx:236` — confirm удаления conditional
- `lib/timeline/adapters.ts:107` — `` `Сделка:` / `Проект:` `` по `p.type`
- `lib/utils/activity-events.ts:24` — `'Сделка обновлена'`

### 3. Не трогать ids / PCT-1 / phase-track

Правильно не менять `project_id`, таблицу `projects`, `entity_type`, `project_columns`.  
Фаза-трек `'Проект'` в `stage-track.ts` / `ProjectsTable` (`track_proj`) — **не** лейбл раздела; в live `ProjectsTable.tsx:71,89` chip «Проект» для track — оставить.

### 4. Lookup-ключ KPI DashboardHome

Ключи `'Активные проекты'` в `FUJI_KPI_META` / `WASHI_KPI_META` — lookup; watermark/short уже «СДЕЛКИ»/«Сделки». Менять только display `label` карточки (и синхронно ключи meta, если переименовывать) — принцип верный.

### 5. Schema / SQL

Спринт не трогает миграции, RLS, RPC — корректно для UI-only.  
`schema.md`: `projects.type` ∈ `client`|`internal`|`delivery` — после P1 трёхзначный type, не только client/internal как в компромиссе спринта.

---

## Блокеры (критично — не запускать)

### B1. Работа уже выполнена — повторный прогон бессмысленен и опасен

Коммит `e3839ee` с **идентичным** message из спринта уже в истории. Повторный apply «Проекты»→«Сделки» по списку задач попадёт в **другой** nav-мир (см. B2).

### B2. Архитектура post-split противоречит модели спринта

| Спринт v2 (устарело) | Live (`architecture.md` + код) |
|----------------------|--------------------------------|
| Раздел продаж = `/projects`, лейбл «Сделки» | **Сделки** = `/deals` (`ProjectsView`, client only) |
| Delivery-«Проекты» — «позже, НЕ трогаем» | **Проекты** = `/projects` (`ProjectsSection`, delivery + internal) — **уже есть** |
| Internal временно в разделе «Сделки» | Internal в `/projects`, не в deals |
| G P → «Проекты» (как deals) | G L → «Сделки» (`/deals`), G P → «Проекты» (`/projects`) |

Доказательства:

- `src/app/(dashboard)/deals/page.tsx` → `ProjectsView`
- `src/app/(dashboard)/projects/page.tsx` → `ProjectsSection`
- `use-projects.ts:128–129,237–242` — срезы `'deals'` / `'projects'`
- `project-href.ts` — client→`/deals`, delivery/internal→`/projects`
- Sidebar live: `TextNavSidebar.tsx:27–28` — оба пункта уже корректны

Если CC выполнит Задачу 1 «`/projects` label → Сделки» — **сломает** delivery-nav.

### B3. Файлы из Задачи 1 не существуют

| Спринт | Live |
|--------|------|
| `layout/Sidebar.tsx` | **удалён** (architecture: AUDIT C) |
| `layout/ScandiSidebar.tsx` | **удалён** |
| `layout/ScandiContentHeader.tsx` | → `ContentHeader.tsx` |
| (нет) | `TextNavSidebar.tsx` — единый sidebar |

`rg` на эти пути: `No such file or directory`.

### B4. Номера строк и «ещё не сделано» — ложные

Выборочная сверка (live vs спринт):

| Утверждение спринта | Live |
|---------------------|------|
| ProjectsTable `:99` label `'Проект'` → Сделка | `:97` уже `label: 'Сделка'`; h1 `:233` «Сделки» |
| PipelineBoard «Перетащи проект» / watermark ПРОЕКТЫ | `:294` «Перетащи сделку»; h1 `:601` «Воронка сделок» |
| CallModal/MeetingModal «Проект» | уже «Сделка» (`:228` / `:177`) |
| EntityTimeline tab «Проекты» | `:45` уже `'Сделки'` |
| QuickActions «Проект» | `:8` уже `'Сделка'`, href `/deals` |
| activity-events «Проект обновлён» | уже «Сделка обновлена» |
| ProjectModal conditional | **уже** (см. выше) |
| adapters conditional | **уже** |
| CommandPalette `/projects`→Сделки | **неверно**: `/projects` остаётся «Проекты»; `/deals` уже «Сделки» (`:46–47,156–157`) |
| Hotkeys G P «Проекты»→«Сделки» | **неверно**: G L = Сделки, G P = Проекты (`Hotkeys.tsx:32–33`) |

### B5. Ветка в шапке спринта не совпадает

Спринт: `feat/aura-theme`.  
Текущая ветка: **`main`**.  
Старое ревью (2026-07-10) тоже на `feat/aura-theme` — не переносить вердикт «можно выполнять» без re-verify.

### B6. Компромисс «internal в разделе Сделки» — снят

Спринт документирует temporary: internal в «Сделки» с бейджем.  
Live: internal на `/projects` (`ProjectsSection`, empty «Нет внутренних проектов»).  
Правило спринта «раздел/агрегаты всегда Сделки» **не применяется** к `/projects`.

---

## Предупреждения (желательно учесть в новом scope, не в v2)

### W1. Единственный заметный residual на deals-KPI

`DashboardHome.tsx:223` display `label: 'Активные проекты'` (и lookup-ключи `:149,:157`) — при том что:

- watermark/short уже «СДЕЛКИ»/«Сделки»
- `StatsWidget` / `dashboard-content` / `TasksSidebar` / `ActivityDrawer` уже «Активных сделок» / «Сделок»
- `href` KPI уже `/deals`

Мелкий cosmetic; **не** требует v2 rename-спринта. Если править — синхронно ключи `FUJI_KPI_META`/`WASHI_KPI_META` и `cards[].label`.

### W2. TaskCard fallback + deep-link

`TaskCard.tsx:167,171`: всегда `router.push(\`/deals/${task.project_id}\`)`, fallback `'проект'`.  
Для delivery/internal корректнее `projectHref` + fallback «проект»/«сделка» по type. Бэкстоп на detail-роутах смягчает, но это не scope rename-v2.

### W3. Comments / non-user strings

- `Charts.tsx:148` comment «Проекты по фазам» (UI h3 уже «Сделки по фазам»)
- JSDoc/comments в hooks — не user-facing; grep спринта их может шуметь

### W4. Delivery UI должен **сохранять** «проект»

Корректно (не трогать как «остатки rename»):

- `ProjectsSection`, `DeliveryPipelineBoard`, `SpawnWizard`, `DeliveryCompletionModal`
- `ProjectDetail` «Завершить проект», «Создать проект внедрения»
- `stage-track` / phase chip «Проект»
- PCT-1 «Тип проекта», подсказки internal

Спринтовый post-check grep **без** exclude delivery-файлов будет «красным» — это false positive.

### W5. Трудоёмкость 1.5–2.5 ч

Для текущего `main` актуальна оценка **0 ч** (noop) или **0.5 ч** на residual KPI label + TaskCard `projectHref`, не 1.5–2.5 ч полного rename.

### W6. Предыдущий review-файл

`_analysis/review-sprint-rename-deals.md` (2026-07-10) говорит «можно выполнять» — **устарел** так же, как sprint v2. Не использовать как green light.

---

## Пропущенные места (относительно цели «сделки в UI»)

Не «пропуски спринта», а **что осталось** после e3839ee + split:

| Файл | Строки | Действие |
|------|--------|----------|
| `dashboard/DashboardHome.tsx` | 149, 157, 223 | Опционально: display «Активные сделки» (+ синхрон ключей meta) |
| `tasks/TaskCard.tsx` | 167, 171 | Опционально: `projectHref` + type-aware fallback |
| `projects/ProjectModal.tsx` | 333 | Косметика: «Клиентский проект — сделка…» → можно «Клиентская сделка…» (низкий приоритет) |
| Delivery / internal / phase-track | — | **Не менять** на «сделка» |

Задачи 1–5 спринта по deals-surface — **закрыты**.

---

## РАЗВЕДКА (факт 2026-07-16)

Команды спринта на live:

**Uppercase «Проект*» (после exclude спринта)** — в основном:

- nav `/projects` «Проекты» (правильно для delivery)
- delivery: SpawnWizard, ProjectsSection, WonDeals
- phase-track `stage-track.ts`, ProjectsTable `track_proj`
- adapters internal-ветка `Проект:`
- ProjectDetail backLabel non-client `'Проекты'`

**Lowercase «проект*»** — delivery errors, ProjectBoard phases, members hooks, TaskCard fallback, health-утилиты — **не** deals rename backlog.

Ожидаемый «длинный список Задач 1–4» **отсутствует** — уже переименовано.

---

## Предлагаемые правки в спринт

1. **Не править v2 — закрыть как DONE / SUPERSEDED** с ссылками на `e3839ee` + `4c1f2ad`.
2. Если нужен follow-up handoff — **новый** файл, например `_analysis/sprint-deals-copy-polish.md`:
   - scope: `DashboardHome` KPI label; `TaskCard` → `projectHref`; опционально copy ProjectModal client-hint
   - **жёстко не трогать** `/projects` labels, delivery UI, phase-track, identifiers
   - ветка: `main` (или актуальная feature-ветка)
3. Удалить/пометить obsolete: «internal в разделе Сделки», «роут `/projects` = продажи», файлы Sidebar/Scandi*.
4. CommandPalette / Hotkeys: документировать **два** раздела (G L / G P), не один rename.

---

## Чеклист перед CC

- [ ] **Не запускать** `_analysis/sprint-rename-deals.md` v2 as-is
- [x] Verify: rename commit `e3839ee` в истории
- [x] Verify: `/deals` + `/projects` split `4c1f2ad` + architecture.md
- [x] Verify: ProjectModal/Detail/adapters conditional уже есть
- [x] Verify: Sidebar.tsx / Scandi* отсутствуют; TextNavSidebar актуален
- [ ] Если residual polish — написать **новый** узкий sprint, не править v2 «вслепую»
- [ ] Не коммитить review/sprint без запроса; не edit sprint file (по инструкции)

---

## crm-architect checklist

| Пункт | Статус |
|-------|--------|
| Starts with РАЗВЕДКА | ✅ |
| Real table/column names | ✅ (SQL нет; type client/internal ок; delivery не учтён в компромиссе) |
| Real file paths from architecture.md | ❌ Sidebar/Scandi* / единый `/projects` |
| learnings.md gotchas | ✅ N/A для string-only (window.confirm convention ок) |
| SQL migrations separate / not applied from CC | ✅ N/A |
| org_id / RLS | ✅ N/A |
| SECURITY DEFINER | ✅ N/A |
| No flowType implicit | ✅ N/A |
| DELETE CASCADE | ✅ N/A |
| CSS variables | ✅ N/A |
| schema.md after migration | ✅ N/A |

---

## Итог одной строкой

**Спринт v2 — post-factum документ уже сделанной работы; на `main` 2026-07-16 запуск в CC даст ложные diffs и риск сломать delivery-«Проекты». Вердикт: не запускать; residual ≤1–2 cosmetic fix'а — отдельным mini-handoff.**
