# Ревью: sprint-delivery-p2a (фазовая доска + шаблоны + spawn v2)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect refs, archive-миграции)  
**Объект:** `_analysis/sprint-delivery-p2a.md` — P2a: `category='phase'`, шаблоны delivery, spawn v2, UI фазовой доски  
**Контекст:** спринт от 2026-07-11 (v2 после `review/review-delivery-p2a-and-architecture.md`). С тех пор в проде и репо уже закрыты **P2a (036+036b)**, **P2b (037)**, **P3 (038)**, **044** (spawn v3 + owner), baseline `20260712230000`, миграции до **048**. Ветка спринта `feat/aura-theme` — текущая `main`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Историческое качество промпта (на 2026-07-11) | ✅ сильный, фактологичный |
| Актуальность относительно живого репо (2026-07-16) | ❌ **полностью выполнен / устарел** |
| Безопасность повторного запуска в CC | ❌ **опасно — не запускать** |
| Соответствие schema.md / architecture.md | ✅ дизайн совпал с продом; номера/сигнатуры уже уехали дальше |
| РАЗВЕДКА / line numbers | 🟡 команды ок, строки/контекст UI устарели |
| SQL (036) как «новый» файл | ❌ уже в `archive/`, в baseline, на проде |
| Frontend (Часть B) | ❌ уже реализован (+ расширен P2b/P3) |
| Scope «НЕ делаем P2b» | 🟡 корректно *для P2a*, но P2b+P3 уже в коде |

**Оценка: 2/10 как runnable-спринт на сегодня; 8/10 как исторический handoff (архив).**  
**Рекомендация: не запускать в Claude Code.** Работы P2a закрыты. Повторный прогон миграции/UI разрушит более поздние дельты (038 `is_milestone` в copy, 044 4-arg spawn, P2b CRUD фаз / apply-template).

---

## Статус

| Заход | Статус в репо / проде |
|-------|----------------------|
| Миграция 036 (+036b gate-fix) | ✅ applied 2026-07-11; файл `supabase/migrations/archive/036_delivery_phase_board_templates.sql` (542 строки, включая хвост 036b) |
| UI P2a (phaseMode, badge, «План», lane=next) | ✅ в коде: `ProjectBoard.tsx`, `TaskCard.tsx`, `delivery-phases.ts`, `ProjectDetail.tsx` |
| Unit-тесты P2a | ✅ `tests/unit/delivery-phase-board.test.ts` (+ часть в `delivery-phases.test.ts`) |
| P2b (037) — «НЕ делаем» в спринте | ✅ уже сделан (команда, progress, apply_delivery_template, CRUD фаз) |
| P3 (038) — milestones / completion gate | ✅ уже сделан; `copy_delivery_template` пропатчен поверх 036 |
| spawn v3 (044) — `p_owner_id` | ✅ 4-arg: `(deal, kind, template?, owner?)` |
| Коммиты P2a | `079d98a` (миграция), `ab3d870` (UI) — в истории git |
| Baseline | `20260712230000_baseline.sql` уже содержит `delivery_templates`, `category … 'phase'`, phase-guard'ы резолвера |

---

## С чем согласен полностью (как с *историческим* дизайном)

### 1. Семантика phase-доски

Разделение «колонка = фаза, `lane` = статус» + phase-guard в `resolve_task_board` / `sync_lane_on_category_change` — верно. Подтверждено в:

- `schema.md` / `docs/schema.md` § Delivery-P2a;
- archive `036_…sql` (блоки resolve + A3b);
- live UI: `isPhaseBoard` + `phaseMode` в `ProjectBoard.tsx:207`, `TaskCard.tsx:74–78`.

### 2. `category_to_lane` ELSE → `'done'`

Спринт правильно требует ветвления **до** деривации lane. Без A3/A3b phase → lane=`done` на всех задачах. Это учтено в 036 и baseline.

### 3. seed-guard для delivery

`IF NEW.type = 'delivery' THEN RETURN NEW` — в archive 036 и baseline. Иначе spawn + default 4 колонки конфликтуют с `copy_delivery_template` («already has columns»).

### 4. Internal-only `copy_delivery_template`

`REVOKE` PUBLIC/anon/authenticated, org-match шаблона, guard «project already has columns» — правильный контракт (подтверждён schema + 036; клиентский RPC — `apply_delivery_template` в 037).

### 5. Graceful spawn без шаблона

`erp+experiment` → проект без колонок, UI empty state — осознанно (smoke #7). Сохранено в 044.

### 6. Frontend-точки

- Доска: `src/components/tasks/ProjectBoard.tsx` (не отдельный delivery-board).
- Рендер: `ProjectDetail.tsx` tab `board` → `<ProjectBoard />` (`:784–787`).
- `TaskQuickAdd` prop `lane` + передача `lane="next"` в phase-режиме (`ProjectBoard.tsx:170`).
- Константы: `src/lib/constants/delivery-phases.ts` (`DELIVERY_TASK_STATUS_*`, `isPhaseBoard`, `isDeliveryTaskOverdue`).
- Таб «План» для delivery (`ProjectDetail.tsx:766–767`).

### 7. Конвенции crm-architect

- Миграция только файлом, apply — гейт.
- `SECURITY DEFINER SET search_path = public, pg_temp`.
- REVOKE anon после GRANT authenticated.
- NULL-safe org в spawn.
- `docs/schema.md` после apply.
- Рукописный `database.ts` — не полный blind regen.

### 8. РАЗВЕДКА (диагностические grep)

Команды по-прежнему находят нужные символы (`useProjectColumns`, `ProjectBoard`, `lane` в tasks). Пригодны для аудита, не для «с нуля».

---

## Блокеры (критично — не запускать)

### B1. Спринт уже выполнен end-to-end

Живой код + схема + archive + baseline + git:

| Claim спринта | Факт 2026-07-16 |
|---------------|-----------------|
| «написать 036» | Файл в `archive/036_delivery_phase_board_templates.sql`, applied |
| «UI phase board» | `phaseMode`, cycle badge, overdue, «План» — в main |
| «типы + константы» | `ColumnCategory` + `'phase'` в `database.ts:159`; константы в `delivery-phases.ts` |
| «тесты B4» | `tests/unit/delivery-phase-board.test.ts` покрывает labels/order/cycle/overdue/`isPhaseBoard` |
| «036 не применена» | schema: «036+036b, applied 2026-07-11»; baseline содержит объекты |

Повторный CC-прогон = дублирование работы + риск регрессий поверх P2b/P3/044.

### B2. `DROP FUNCTION spawn_delivery_project(uuid, text)` + CREATE 3-arg — сломает прод-сигнатуру

Спринт A6:

```sql
DROP FUNCTION IF EXISTS public.spawn_delivery_project(uuid, text);
CREATE FUNCTION … (p_deal_id, p_kind, p_template_id DEFAULT NULL)  -- 3 arg
```

Факт (044 + `docs/schema.md` spawn v3):

```sql
spawn_delivery_project(p_deal_id, p_kind, p_template_id DEFAULT NULL, p_owner_id DEFAULT NULL)
-- ACL на (uuid, text, uuid, uuid)
```

Живой UI (`SpawnWizard.tsx`) зовёт RPC с owner/template. Пересоздание 3-arg без `p_owner_id` **откатит Win Wizard**. Даже CREATE OR REPLACE 3-arg при существующей 4-arg создаёт ambiguity/wrong overload.

### B3. A5 `copy_delivery_template` без `is_milestone` — регресс P3

Спринт INSERT tasks:

```text
(org_id, project_id, column_id, lane, text, sort_order, company_id, contact_id, created_by)
-- is_milestone нет
```

038 уже:

```text
…, created_by, is_milestone) … tt.is_milestone
```

OR REPLACE телом A5 **потеряет перенос вех** → сломает completion gate P3.

### B4. A4 RLS `FOR ALL` — известный advisor-баг, уже починен 036b

Спринт пишет `dt_write`/`dtp_write`/`dtt_write` **FOR ALL** (multiple_permissive_policies с SELECT).  
Archive 036 хвост (строки ~507–537) + schema: **036b** заменил на раздельные INSERT/UPDATE/DELETE.  
Повтор A4 как в спринте — откат hygiene.

### B5. A7 сиды + A8 бэкфилл на живых данных

- UNIQUE `(org_id, direction, kind)` — повторный INSERT IIoT launch/experiment / ERP launch упадёт или потребует cleanup.
- A8: `DELETE … category <> 'phase'` при 0 tasks — на проде давно есть delivery с фазами и задачами (P2b-ревью: «4 delivery / 137 tasks»). Бэкфилл «1 пустой проект» — **ложный precondition** 2026-07-16.
- Нумерация `036_…sql` в `supabase/migrations/` конфликтует с archive/baseline/history (следующий номер — 049+, 047 уже в истории DROP stage).

### B6. B2.2 «скрыть CRUD колонок» конфликтует с P2b

Спринт: в phase-режиме скрыть «+ Колонка», rename, delete.  
Факт P2b: CRUD фаз **возвращён** (`canManageColumns`, «+ Фаза», rename только имени, `apply_delivery_template` empty CTA).  
CC по B2.2 **вырежет P2b-UX**.

### B7. Неверная ветка и stale line numbers → CC правит «не туда»

| Claim | Спринт | Факт |
|-------|--------|------|
| Ветка | `feat/aura-theme` | `main` |
| Board render | `ProjectDetail` ~:840 | `:784–787` |
| CATEGORY_LABEL | `:37–47` | `:40–45` (+ filter phase) |
| «+ Колонка» | `:307–343` hide | `:401+` phase-aware add (P2b) |
| TaskQuickAdd lane | «не передаёт» `:149` | **передаёт** `lane={phaseMode ? 'next' : undefined}` `:170` |

---

## Предупреждения (если бы спринт ещё был «вперёд»)

### W1. A4 без 036b

Даже исторически: после apply гейт требовал 036b. В runnable-промпте стоило сразу писать раздельные политики.

### W2. `database.ts` vs `supabase.gen.ts`

Спринт: руками Row/Insert для templates. Сейчас gen-типы уже содержат `delivery_templates` (`supabase.gen.ts:808+`); рукописный `database.ts` имеет `ColumnCategory`+phase и `ApplyDeliveryTemplateArgs`, но не полный mirror tables — ок для проекта, но инструкция «полный regen запрещён» остаётся актуальной.

### W3. `docs/schema.md` body lag

crm-architect `schema.md` header: phase/templates applied; тело таблицы `project_columns.category` в одном месте всё ещё «4 значения» без `'phase'` (header/history согласованы). Не блокер запуска P2a *тогда*; долг документации, не спринта.

### W4. Коммиты / handoff-цепочка

P2a → p2b (`_analysis/sprint-delivery-p2b.md`, review 8/10) → p3 → 044. Этот файл — **архив**, не next-work.

### W5. Оговорка «живая БД 2026-07-11 — не перепроверять»

На 2026-07-16 precondition'ы (1 delivery, 0 tasks, 2-arg spawn) **устарели**. Любой handoff старше недели в delivery-контуре требует re-разведки.

---

## Пропущенные / изменившиеся места (если CC шёл бы по тексту)

| Файл | Факт | Действие при «run as-is» |
|------|------|--------------------------|
| `supabase/migrations/archive/036_…sql` | Полный P2a SQL (+036b) | Не создавать второй 036 |
| `supabase/migrations/044_spawn_delivery_owner.sql` | 4-arg spawn | Не DROP 2-arg / не CREATE 3-arg |
| `supabase/migrations/archive/038_…sql` | copy + `is_milestone` | Не OR REPLACE copy телом A5 |
| `src/components/tasks/ProjectBoard.tsx` | phaseMode + P2b CRUD | Не прятать add/rename/delete |
| `src/components/tasks/TaskCard.tsx` | cycle badge + milestone diamond | Уже есть |
| `src/lib/constants/delivery-phases.ts` | P2a+P2b константы | Уже есть |
| `src/components/projects/ProjectDetail.tsx` | «План», Gantt, completion | Уже сверх scope |
| `src/components/projects/SpawnWizard.tsx` | RPC с template/owner | Зависит от 044 |
| `tests/unit/delivery-phase-board.test.ts` | B4 unit | Уже есть |
| `supabase/migrations/20260712230000_baseline.sql` | Схема с phase/templates | Источник истины после AUDIT-B |

РАЗВЕДКА спринта **не** включает: `archive/036`, baseline, 044, 038, `apply_delivery_template`, `is_milestone` — критичный gap для 2026-07-16.

---

## Предлагаемые правки в спринт

**Не править для запуска** — закрыть/архивировать.

1. **Штамп в шапке:**  
   `СТАТУС: DONE (2026-07-11) · applied 036+036b · UI ab3d870 · superseded by P2b/P3/044 · DO NOT RE-RUN`.
2. **Ссылка на факты:** archive path, baseline, `docs/schema.md` § Delivery-P2a, коммиты `079d98a` / `ab3d870`.
3. **Если нужен «остаточный» work** — отдельный микро-спринт (не этот файл), например:
   - добить расхождения body `schema.md` (category union в таблице project_columns);
   - синхронизировать crm-architect `schema.md` spawn v3 (044) в одном месте с body;
   - **не** «ещё раз 036».
4. Для будущих delivery-спринтов: обязательная разведка  
   `ls supabase/migrations/archive/*delivery*` + `grep spawn_delivery_project supabase/migrations/*.sql` + signature в `044`.

---

## Чеклист crm-architect (condensed)

| Пункт | Оценка |
|-------|--------|
| Есть РАЗВЕДКА | ✅ (исторически) |
| Реальные table/column | ✅ (на момент P2a) |
| Реальные file paths | ✅ / 🟡 line drift |
| learnings (REVOKE, NULL-safe DEFINER, search_path) | ✅ |
| SQL file only, no apply from CC | ✅ в тексте |
| org_id / RLS org first + role | ✅ |
| DEFINER + search_path + ACL | ✅ |
| No `flowType: 'implicit'` | ✅ n/a |
| DELETE via CASCADE | ✅ templates FK |
| CSS variables only | ✅ (`var(--…)`, STATUS_BADGE) |
| schema.md after migration | ✅ сделано post-facto |
| **Runnable today without harm** | ❌ |

---

## Чеклист перед CC

- [x] ~~Исправить блокеры B1–B7~~ → **отменить запуск**
- [ ] **Не** создавать `supabase/migrations/036_*.sql` заново
- [ ] **Не** `DROP`/`CREATE` `spawn_delivery_project` по телу A6
- [ ] **Не** OR REPLACE `copy_delivery_template` без `is_milestone` (тело 038)
- [ ] **Не** откатывать P2b CRUD фаз / apply CTA
- [ ] При необходимости работы по delivery — новый спринт с разведкой `main` + migrations ≥044
- [ ] Этот файл пометить DONE/archive (опционально, руками Олега)

---

## Итог одной строкой

**P2a уже в проде и в `main`; промпт — качественный исторический handoff, но запуск в CC сегодня = регресс 038/044/P2b. Вердикт: не запускать.**
