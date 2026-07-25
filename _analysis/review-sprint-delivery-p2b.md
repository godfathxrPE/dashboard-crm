# Ревью: sprint-delivery-p2b (P2b — команда, прогресс, apply-шаблон, CRUD фаз)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, `git branch --show-current`; refs crm-architect: schema.md / architecture.md / learnings.md; live: `src/`, `supabase/migrations/`, `docs/schema.md`)  
**Объект:** `_analysis/sprint-delivery-p2b.md` — handoff v2: миграция 037 + UI delivery (команда / N·M / apply_template / CRUD фаз)  
**Контекст:** предыдущее ревью `_analysis/review-sprint-delivery-p2b.md` (2026-07-11, 8/10, блокеры B1–B3); дизайн `_analysis/architecture-delivery-p2.md` §14; P2a 036/036b; **P2b уже смержен в `main`** (коммиты `b04ba3a` → `c4cef1f`, оба ancestors of HEAD); далее 038–048 + baseline `20260712230000`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Качество промпта v2 (как design/handoff) | ✅ 9/10 |
| Закрытие блокеров прошлого ревью (B0/B1/B2/B3, W*) | ✅ подтверждено в коде |
| SQL / RLS / SECURITY DEFINER / schema truth | ✅ |
| РАЗВЕДКА vs **текущий** live codebase | ❌ устарела (P2b уже в дереве) |
| Можно запускать в Claude Code **сейчас** | ❌ **нельзя** — работа выполнена |
| Риск повторного прогона | ❌ высокий (дубль миграции, overwrite UI, конфликт с archive/baseline) |

**Оценка: 9/10 как документ-история; 0/10 как исполнимый спринт «с нуля».**  
**Рекомендация:** **не запускать в CC.** P2b закрыт. Файл оставить как audit trail / эталон; при необходимости — пометить статус DONE в шапке (отдельной правкой, не CC).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| A1–A4 миграция `037_delivery_members_progress.sql` | ✅ `supabase/migrations/archive/037_…sql` (197 строк); объекты в `20260712230000_baseline.sql` (`project_members`, `apply_delivery_template`, индексы, RLS-триггеры) |
| B0 `canManageDeliveryProject` | ✅ `src/lib/utils/project-permissions.ts` + unit `tests/unit/project-permissions.test.ts` |
| B1 типы / хук / константы | ✅ `database.ts` (`ProjectMemberRole`, Args RPC); `use-project-members.ts`; `delivery-phases.ts` (`PROJECT_MEMBER_*`, `hasTaskProgress`); `useRealtimeSync('project_members')` |
| B2 виджет «Команда» | ✅ `ProjectTeam.tsx` + вставка в `ProjectDetail.tsx:727` (`isDelivery && <ProjectTeam …/>`) |
| B3 прогресс N/M + invalidate | ✅ `DeliveryPipelineBoard` meta; `ProjectDetail` шапка; `use-tasks` invalidate `['projects']` (create/update/delete/move) |
| B4 apply_template empty state | ✅ `ProjectBoard.tsx` rpc + `canManageCols` |
| B5 CRUD фаз phase-aware | ✅ rename/add/delete через `canManageColumns`; category-select скрыт в phaseMode |
| B6 unit-тесты | ✅ `tests/unit/project-members.test.ts`, `project-permissions.test.ts` |
| `docs/schema.md` | ✅ синк в UI-коммите P2b; crm-architect `schema.md` — блок «Delivery-P2b (037, applied 2026-07-11)» |
| Ветка из шапки спринта `feat/aura-theme` | ❌ сейчас `main` |

---

## С чем согласен полностью (как с v2-спекой)

### 1. SQL A1 — `project_members` + RLS

Схема, 3 роли, `UNIQUE (project_id, profile_id)`, `trg_set_org_id`, раздельные INSERT/UPDATE/DELETE (урок 036b), initplan `( SELECT current_org_id() )` / `( SELECT auth.uid() )`, `WITH CHECK` на UPDATE против переноса в чужой project — **дословно в archive/037**, совпадает со спринтом. Паттерн ownership = `project_columns` 032/034.

### 2. SQL A2 — прогресс X/Y

`recalc_delivery_progress` + `sync_delivery_progress` + `trg_zz_delivery_progress` `AFTER … UPDATE OF lane, project_id`, guard `IS DISTINCT FROM`, REVOKE на definer-функциях — верно относительно цепочки AFTER UPDATE на `projects` и learnings по SECURITY DEFINER / search_path.

### 3. SQL A3 — `apply_delivery_template`

Гарды (NULL-safe org → 42501, type delivery, ownership, template org-match, explicit apply ≠ graceful spawn) + GRANT authenticated / REVOKE PUBLIC+anon — согласовано с `spawn_delivery_project` и schema.md.

### 4. SQL A4 — realtime publication

`ALTER PUBLICATION … ADD project_columns` + `project_members` — корректный фикс PCT-1; schema.md это фиксирует.

### 5. B0 / UI-права

Единый хелпер + `canManageColumns` prop без сужения task-level `canEdit` — закрывает B1 прошлого ревью. В live: `ProjectDetail:217` считает `canManage`, прокидывает в `ProjectTeam` и `ProjectBoard:787`.

### 6. B2–B5 точки вставки

- Команда full-width, не в 4-col grid — ✅  
- `AssigneeSelect` + `useTeamMembers`, `excludeIds={memberProfileIds}` — ✅  
- «N/M задач» / «Задачи: N/M» без слова «шаблон» — ✅  
- Empty state «Фазы не созданы» + CTA по `canManageCols` — ✅  
- phaseMode CRUD без category-select — ✅  

### 7. B3 инвалидация (реализация ≥ спецификации)

Спринт: условный invalidate при `lane` / `project_id` / `column_id`.  
Live (`use-tasks.ts`): то же + всегда на create (если `project_id`) / delete / board move column — правильно шире, чем snippet (move column → resolver lane).

### 8. Чеклист crm-architect (дизайн v2)

| Критерий | Статус |
|----------|--------|
| РАЗВЕДКА | ✅ (на момент написания) |
| Реальные table/column | ✅ |
| Миграция файлом, не apply из CC | ✅ |
| org + `current_org_role` / ownership | ✅ |
| SECURITY DEFINER + `search_path` + ACL | ✅ |
| Раздельные write-политики, не FOR ALL | ✅ |
| schema.md после миграции | ✅ (сделано) |
| CSS variables only | N/A (нет theme work) |
| no `flowType: 'implicit'` | N/A |

---

## Блокеры (критично — **не запускать** как новый спринт)

### B1. P2b уже реализован и в `main` — повторный прогон CC разрушителен

Доказательства:

| Артефакт | Путь / факт |
|----------|-------------|
| Миграция | `supabase/migrations/archive/037_delivery_members_progress.sql` |
| Baseline | `20260712230000_baseline.sql` содержит `project_members`, `apply_delivery_template`, FK/индексы |
| UI | `ProjectTeam.tsx`, `use-project-members.ts`, `project-permissions.ts`, правки `ProjectBoard` / `DeliveryPipelineBoard` / `ProjectDetail` / `use-tasks` |
| Тесты | `tests/unit/project-members.test.ts`, `project-permissions.test.ts` |
| Git | `b04ba3a`, `c4cef1f` — ancestors of `HEAD` на `main` |

Спринт всё ещё формулируется как «сделать A1…B6» + «создать файл 037». На текущем дереве это:

- попытка снова создать `supabase/migrations/037_…` при уже заархивированной 037 и активных 040–048 + baseline;
- переписывание рабочих UI-файлов;
- риск `CREATE POLICY` / `ADD TABLE` publication на уже существующих объектах при ошибочном apply.

**Действие:** не отдавать в CC. Статус: **DONE (historical prompt)**.

### B2. РАЗВЕДКА и якоря строк — ложные ожидания относительно live

| Команда / claim | Ожидание спринта | Факт 2026-07-16 |
|-----------------|------------------|-----------------|
| `progress` в `DeliveryPipelineBoard` | 0 совпадений, вставка ~:92 | **есть** P2b UI (~:104–113, 216–217) |
| `progress` в `ProjectDetail` | 0, шапка ~:395–421 | **есть** «Задачи: N/M» (~:300–303) |
| «Фазы не созданы» | ~:301 | `:352` |
| `useProjects` progress select | `:122` | `PROJECT_COLUMNS` ~:137–143 / delivery list ~:312 |
| ветка | `feat/aura-theme` | **`main`** |

Исполнитель по «ожидание: 0» либо «сломает» разведку, либо начнёт дублировать UI.

### B3. Нумерация миграций / layout репо изменились

Active `supabase/migrations/`: `040`…`048` + baseline; `001–039` в `archive/`. Инструкция «только файл `037_delivery_members_progress.sql`» в root migrations **конфликтует** с текущей конвенцией. Даже «только файл» без apply — шум и риск путаницы для гейта.

---

## Предупреждения (для документа / будущих handoff)

### W1. Снэпшот «живой БД 2026-07-11» — исторический

«4 delivery / 137 задач / progress 0/0» — валидно как pre-backfill факт на дату написания; **не** использовать как smoke-ожидание «сейчас» без пересчёта. После 037 бэкфилл + триггер должны были обнулить 0/0.

### W2. crm-architect `architecture.md` / `learnings.md` не упоминают P2b

`schema.md` (skill + `docs/`) — да; architecture/learnings skill — нет `project_members` / `apply_delivery_template`. Долг refs, не блокера спринта. Имеет смысл при следующем обновлении skill.

### W3. Заголовок archive/037: «⚠️ НЕ применена»

В файле миграции всё ещё комментарий «НЕ применена — применяет гейт», тогда как schema: «applied 2026-07-11» и baseline включает объекты. Косметика archive — не трогать без нужды; не копировать как truth.

### W4. Спринт B1 не фиксирует отдельный `ProjectTeam.tsx`

Спека размещает виджет в `ProjectDetail`; реализация вынесла `ProjectTeam.tsx` — лучше. Не баг; для handoff «как было» ок.

### W5. Snippet B3 vs live `useMoveTask` / `useDeleteTask`

Спека условная; delete в live всегда инвалидирует `['projects']` (variables = id only) — **правильнее**. При любом будущем diff-review не «сужать» до snippet.

### W6. Повторное ревью того же файла

Существует `_analysis/review-sprint-delivery-p2b.md` (v1, 2026-07-11). Текущий вывод **не отменяет** качество v2-спеки, а фиксирует **post-merge** состояние: «выполнять нельзя».

---

## Пропущенные места (если бы CC запускали «как новый»)

| Файл | Строки / символ | Действие |
|------|-----------------|----------|
| `supabase/migrations/archive/037_…` | весь файл | **не** пересоздавать |
| `src/components/projects/ProjectTeam.tsx` | 1–203 | уже B2 |
| `src/lib/hooks/use-project-members.ts` | весь | уже B1 |
| `src/lib/utils/project-permissions.ts` | весь | уже B0 |
| `src/lib/hooks/use-tasks.ts` | 142–150, 226–229, 278–283, 434–435 | уже B3 |
| `src/components/tasks/ProjectBoard.tsx` | `canManageColumns`, apply rpc, phase CRUD | уже B4/B5 |
| `src/components/projects/DeliveryPipelineBoard.tsx` | ~104–113 | уже B3 UI |
| `tests/unit/project-*.test.ts` | — | уже B6 |
| `docs/schema.md` / skill schema | Delivery-P2b block | уже |

**False positives спринта (как «ещё нет»):** progress UI, хук members, permissions helper, migration file.

**True negatives (осознанно out of scope — согласен):** default_enabled Эксперимента; редактор шаблонов; RLS visibility по membership; assigned_to ← project_members.

---

## Предлагаемые правки в спринт (только если обновляете документ; **не** для CC)

1. **Шапка:** статус `DONE / merged main (b04ba3a, c4cef1f)`; ветка `main`; «не запускать повторно».
2. **РАЗВЕДКА:** заменить «ожидание: 0» на «ожидание: P2b уже в дереве; команды = smoke существования».
3. **ЧАСТЬ A/B:** переименовать в «Спека (реализовано)» или ссылку на archive + ключевые файлы UI.
4. **Миграция:** путь `archive/037_…`, не root; apply — исторически гейтом, сейчас в baseline.
5. Опционально: one-liner «следующий delivery-scope — P3 (038) / gantt / …» чтобы CC не цеплялся за P2b.

---

## Чеклист перед CC

- [x] ~~Закрыть B0/B1/B3 прошлого ревью~~ — сделано в v2 **и** в коде  
- [x] ~~Написать 037 / UI / тесты / schema~~ — в `main`  
- [ ] **Не** запускать этот файл как новый Claude Code prompt  
- [ ] При «есть новый спринт» — смотреть **следующие** handoff (P3+, gantt, deps), не P2b  
- [ ] (Опц.) Пометить `sprint-delivery-p2b.md` как DONE вручную Олегом  
- [ ] (Опц.) Синк crm-architect architecture.md/learnings.md с P2b — отдельная doc-задача  

---

## Итог

| | |
|--|--|
| **Спека v2** | Зрелая, закрыла блокеры Grok 2026-07-11; SQL/UI-контракт production-ready |
| **Код** | P2b **выполнен и влит** в `main` |
| **В CC** | **Нет** — повтор = регрессия / конфликт миграций |
| **Риск «как новый»** | Высокий (baseline + archive + live UI) |
| **Риск «как reference»** | Низкий — отличный эталон паттернов RLS/RPC/permissions |

**Вердикт одной строкой:** спринт-документ v2 качественный, но **исторический**; Claude Code по нему **не гонять**.
