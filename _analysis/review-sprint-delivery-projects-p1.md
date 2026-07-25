# Ревью: sprint-delivery-projects-p1.md (v2)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `71c613f`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-delivery-projects-p1.md` — P1 «Лёгкая карточка» delivery + routing split B0  
**Контекст:** спринт датирован **2026-07-10** (ветка `feat/aura-theme`); handoff `_analysis/handoff-delivery-p1.md` (2026-07-11) фиксирует **P1 закрыт**; поверх — P2a/P2b/P3 (036–038), Волна 2, 047 DROP `projects.stage`, 048 deps, 050 workflow. Старое ревью v1: `_analysis/review-sprint-delivery-projects-p1.md` (2026-07-10).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Историческое качество v2 (B0, delivery-канбан, ownership RPC, schema.md) | ✅ Было сильным для 2026-07-10 |
| Актуальность «СВЕРЕННЫЕ ФАКТЫ» vs `main` @ `71c613f` | ❌ Полностью устарели |
| Миграция `035_delivery_projects.sql` «только файл» | ❌ Уже в archive + baseline + **applied** |
| B0 routing `/deals` ↔ `/projects` | ✅ Уже в коде (коммит `4c1f2ad`) |
| Frontend B1–B8 (фазы, канбан, spawn, hooks) | ✅ Уже в коде (`8706399`+) |
| Пути `Sidebar` / `ScandiSidebar` / `stage-mapping` | ❌ Файлов нет (TextNavSidebar, stage DROP) |
| `null_internal_stage` / `projects.stage` / `mapToLegacyStage` | ❌ Сняты в **047** |
| Scope «P2+ не трогаем» | ❌ P2a/P2b/P3 уже в проде (036–038) |
| Безопасность повторного запуска в CC | ❌ **Катастрофический регресс** |

**Оценка: 9/10** как **архивный исполненный промпт 2026-07-10**; **1/10** как executable-спринт на `main` 2026-07-16.  
**Рекомендация: не запускать в Claude Code.** P1 закрыт; повторный прогон перезапишет живую архитектуру и попытается воссоздать уже применённую миграцию/объекты.

---

## Статус (phased delivery)

| Заход | Статус в репо / проде |
|-------|------------------------|
| B0 routing split | ✅ `4c1f2ad` — `/deals` + `/projects`, redirect-бэкстопы, `projectHref` |
| 035 delivery P1 (SQL) | ✅ archive + baseline; applied 2026-07-10 (`docs/schema.md`) |
| P1 frontend (канбан, spawn, phases, hooks) | ✅ `8706399` + UX `005bf20` + тесты `9f43f26` |
| P1 UX-фиксы | ✅ `sprint-delivery-p1-ux-fixes.md` / handoff |
| P2a фазовая доска + шаблоны | ✅ 036, `ab3d870` / `079d98a` |
| P2b members + progress | ✅ 037, `b04ba3a` / `c4cef1f` |
| P3 completion gate | ✅ 038, `1481ead` / `b830121` |
| Post-P1: Win Wizard, Deal Hub, health, won notify | ✅ 043–045 и UI-коммиты |
| 047 DROP legacy `stage` | ✅ applied; `null_internal_stage` **нет** |
| Ветка `feat/aura-theme` | ❌ Текущая ветка **`main`**, ahead origin |

Handoff: `_analysis/handoff-delivery-p1.md` — «P1 закрыт полностью»; git: `4c1f2ad` → `8706399` → `005bf20`.

---

## С чем согласен полностью (как история v2)

### 1. v2 закрыл блокеры старого ревью (2026-07-10)

В v2 действительно были правильные решения, которые **уже исполнены**:

- B0: `/deals` = client, `/projects` = delivery+internal + type-redirects  
- отдельный `DeliveryPipelineBoard` + `delivery-phases.ts`  
- ownership-гард в `spawn_delivery_project` через `memberships`  
- фильтр `useProjects(scope)` / `useDeals` / `useDeliveryProjects`  
- `parent_deal_id ON DELETE RESTRICT`, delivery-стадии `is_won/is_lost = false`  
- миграция «только файл, не apply из CC» — контракт гейта соблюдён **тогда**

### 2. Модель §9 (состояние = `phase_group`)

`initiated/planning/execution/completed` + лейблы в `src/lib/constants/delivery-phases.ts` — совпадает с живым кодом и schema.

### 3. РАЗВЕДКА / двухкоммитный порядок

Исторически корректно: B0 отдельно, потом 035+UI. Это уже в истории git.

---

## Блокеры (критично — не запускать)

### B1. Спринт уже выполнен — повтор = rewrite работающей системы

Живой код **реализует весь scope P1**:

| Спринт-задача | Факт на `main` |
|---------------|----------------|
| `/deals`, `/deals/[id]` | `src/app/(dashboard)/deals/page.tsx`, `[id]/page.tsx` + redirect non-client → `/projects` |
| `/projects` = delivery+internal | `projects/page.tsx` → `ProjectsSection`; client → redirect `/deals` |
| Nav «Сделки»/«Проекты» | `TextNavSidebar.tsx:27–28` (`/deals`, `/projects`) |
| `projectHref` | `src/lib/utils/project-href.ts` |
| saved-views migrate `/projects`→`/deals` | `use-saved-views.ts:33–34` |
| `delivery-phases.ts` | существует |
| `DeliveryPipelineBoard.tsx` | существует, drag → `moveToStageId` |
| Spawn CTA + wizard | `ProjectDetail.tsx` ~386–392, 866–867 + `SpawnWizard.tsx` |
| `useDeals` / `useDeliveryProjects` | `use-projects.ts:238–244` |
| 035 SQL | `supabase/migrations/archive/035_delivery_projects.sql` (тело ≈ спринт) |

Коммиты: `4c1f2ad`, `8706399`. **Нечего имплементировать.**

### B2. Миграция 035 уже applied + archived — номер и DDL конфликтуют

- В `supabase/migrations/` **нет** активного `035_*.sql` — он в `archive/` и внутри `20260712230000_baseline.sql`.  
- Цепочка живых файлов: **040–050** (+ baseline).  
- `docs/schema.md` / skill schema: **035 applied 2026-07-10**; поверх 036–038, 044 (`p_owner_id`), 047 DROP stage.  

Повтор `CREATE`/`ADD COLUMN`/`reseed DELETE pipeline_stages` → падение гейта или **снос фаз**, на которые уже завязаны delivery-проекты/шаблоны P2.

### B3. SQL-тело спринта противоречит схеме **после 047**

Спринт требует:

```sql
-- null_internal_stage: NEW.stage := NULL для delivery
-- INSERT ... stage, status ...
```

После 047:

- колонки `projects.stage` **нет**  
- типа `deal_stage` **нет**  
- `null_internal_stage` / `trg_ab_null_internal_stage` **сняты**  
- `stage_id → pipeline_stages` — единственный источник истины  

Любой `CREATE OR REPLACE null_internal_stage` / запись в `stage` — **ошибка 42703 / мёртвый код**.

Также `moveToStageId(project.id, stageId, null, …)` и `mapToLegacyStage` — файла `lib/utils/stage-mapping.ts` **нет**; `useMoveProject().moveToStageId` — 2–arg (id + stageId), legacy stage не пишется (`044253a`).

### B4. Ложные пути и символы навигации

Спринт ссылается на удалённый/переименованный layout:

| Спринт | Реальность |
|--------|------------|
| `Sidebar.tsx`, `ScandiSidebar.tsx` | **нет**; `TextNavSidebar.tsx` |
| `ScandiContentHeader.tsx` | `ContentHeader.tsx` |
| «`/projects` = Сделки» | **нет**; `/projects` = «Проекты», `/deals` = «Сделки» |
| `Hotkeys p:'/projects'` → решить G D | **уже:** `l: '/deals'`, `p: '/projects'` (`Hotkeys.tsx:11–12`) |
| ветка `feat/aura-theme` | текущая **`main`** |

CC по «инвентарю» спринта будет править несуществующие файлы или дублировать nav.

### B5. RPC-контракт устарел (v1 vs v3)

Спринт: `spawn_delivery_project(p_deal_id, p_kind)`.

Прод/schema: **v3** — `(p_deal_id, p_kind, p_template_id, p_owner_id)` (036 шаблоны + 044 owner). UI — `SpawnWizard`, не «диалог kind» из B4.  
`CREATE OR REPLACE` из спринта **срежет** template/owner-контур Win Wizard.

### B6. «НЕ делаем P2+» — P2+ уже сделаны

Отложено в спринте, но в репо/проде:

- 036 phase board + templates  
- 037 `project_members`, progress X/Y  
- 038 completion gate + `DeliveryCompletionModal`  

Промпт ведёт исполнителя в **прошлую** фазу roadmap.

---

## Предупреждения (не блокеры запуска — запуск и так запрещён)

### W1. Часть deep-link residual всё ещё «упрощённая»

Спринт правильно требовал `projectHref` везде. Сейчас:

- ✅ `projectHref` + бэкстопы detail-роутов  
- 🟡 `TaskCard.tsx` ~166: хардкод `` `/deals/${task.project_id}` `` (для delivery сработает только через redirect с `/deals/[id]`, лишний round-trip)  
- 🟡 `NotificationBell` / timeline: часто `/deals/...` + серверный бэкстоп (осознанный компромисс в комментариях)

Это **не** scope для повторного P1; точечный follow-up, если нужен.

### W2. «Роли: только owner» — данные, не схема

CHECK memberships: `owner|admin|manager|viewer` (schema). RPC-гард `IN ('owner','admin')` корректен; формулировка «только owner» устарела как описание продукта.

### W3. Старое ревью v1 (7.5/10) не актуально как gate

`_analysis/review-sprint-delivery-projects-p1.md` от 2026-07-10 говорило «править B0 и запускать». v2 это учёл **и был выполнен**. Не использовать ни v1-review, ни v2-sprint как очередь работ.

### W4. `useProjects()` без scope в части consumers

`CallModal`, `TodayView`, `CalendarView`, `use-alerts` зовут `useProjects()` без scope (все типы). Для alerts фильтр `type==='client'` есть; для модалок — осознанно «все проекты». Не регрессия P1, но QUERY STRATEGY спринта шире, чем «везде scope».

---

## Пропущенные места (если бы исполняли «как написано»)

| Файл / объект | Строки / факт | Если CC пойдёт по спринту |
|---------------|---------------|---------------------------|
| `archive/035_delivery_projects.sql` | весь файл | Дубль миграции / конфликт имени |
| `TextNavSidebar.tsx` | 27–28 | Спринт не знает файл — промах nav |
| `moveToStageId` | `use-projects.ts` ~477+ | 3-й arg `stage:null` — API ушёл |
| `null_internal_stage` | DROP 047 | Пересоздание невозможно осмысленно |
| `SpawnWizard` / 044 | 4-arg RPC | Откат сигнатуры |
| `TaskCard.tsx` | ~166 | Спринт хотел `projectHref` — gap остаётся вне «done P1» |

Пропущенных **несделанных** задач P1 по design-intent **нет** — только post-P1 polish.

---

## Предлагаемые правки в спринт

**Не править и не «допиливать» этот файл под CC.** Он — архив.

1. В шапке (если нужен маркер для людей/watcher):  
   `> ⛔ SUPERSEDED 2026-07-11. P1 applied (035). Do not run. See handoff-delivery-p1.md + git 4c1f2ad/8706399.`  
2. Новые работы — **новые** sprint/handoff от текущего `main` + schema 048/050, не ревизия P1.  
3. Опциональный tiny-fix (отдельный мини-промпт, не этот спринт): `TaskCard` → `projectHref` / join type.

---

## Чеклист crm-architect (на документ как на **исторический** промпт)

| Пункт | На момент v2 (2026-07-10) | Сейчас как runnable |
|-------|---------------------------|---------------------|
| РАЗВЕДКА в начале | ✅ | 🟡 команды ок, выводы устарели |
| Реальные table/column | ✅ для pre-035 | ❌ stage / null_internal_stage |
| Реальные file paths | 🟡 (Sidebar/Scandi) | ❌ |
| learnings (DEFINER, search_path, ACL) | ✅ RPC-паттерн | ❌ тело RPC устарело vs 044 |
| SQL отдельным файлом, не apply из CC | ✅ | N/A (уже applied) |
| org_id / ownership | ✅ | ✅ (и расширено) |
| schema.md после миграции | ✅ требовалось | ✅ сделано + дальше 036–048 |
| CSS variables only | ✅ (delivery-phases) | ✅ |

---

## Чеклист перед CC

- [x] Подтвердить: P1 в git (`4c1f2ad`, `8706399`) и handoff «закрыт»  
- [x] Подтвердить: 035 в archive/baseline, не в pending  
- [x] Подтвердить: `/deals` + `/projects` + `DeliveryPipelineBoard` + `SpawnWizard`  
- [x] Подтвердить: 047 убрал `projects.stage` — SQL спринта мёртв  
- [ ] **Не** создавать `035_delivery_projects.sql` заново  
- [ ] **Не** отдавать этот файл в Claude Code  
- [ ] Для новой работы: свежий спринт от `main` + `docs/schema.md` (048/050), не P1 v2  

---

## Итог одной строкой

**P1 delivery + B0 routing — давно в `main` и в проде; `sprint-delivery-projects-p1.md` v2 — архивный промпт. Запуск в CC запрещён (дубль 035, DROP stage, откат spawn v3, ложные пути layout).**
