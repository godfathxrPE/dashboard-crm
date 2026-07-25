# Ревью: sprint-audit-A2-data-reliability — «Данные не врут»

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-audit-A2-data-reliability.md` — realtime refcount, bulk `reorder_tasks`, ExcelImport error-handling, EditableCell/CallModal UTC/инвалидации  
**Контекст:** AUDIT-2026-07-12 (1.5, 1.6, 2.2, 2.9, 3.5, 3.9). После A1 (toast). На `main` уже лежат коммиты с **теми же** сообщениями, что в разделе «КОММИТЫ» спринта; 039 **применена** и заархивирована; follow-up debounce realtime тоже влит.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз аудита (1.5 / 1.6 / 2.2 / 2.9 / 3.5 / 3.9) | ✅ верный на момент написания |
| Архитектурные решения (refcount Map, bulk RPC, skip-and-continue import) | ✅ зрелые, совпадают с schema/learnings |
| Пути / РАЗВЕДКА (актуальность на `main`) | ❌ устарели: работа **уже влита** |
| Schema / RLS / миграция 039 | ❌ статус «pending / НЕ применять» **лжет** — 039 Applied + archive |
| learnings.md (SECURITY DEFINER + REVOKE anon, CASCADE, no flowType) | ✅ учтено в реализованном RPC |
| Безопасность повторного запуска в CC | ❌ **не запускать** — дублирование/конфликт с archive+продом |

**Оценка: 4/10 как handoff «запусти сейчас».**  
Как *исторический* дизайн-спек до реализации — было ~8.5/10 (чёткие задачи, тест-сценарии, два коммита, гейт Cowork); как живой промпт для Claude Code на текущем `main` — **непригоден**.

**Рекомендация:** **не запускать в CC.** Спринт закрыт в коде и в БД. При необходимости — отдельный микро-спринт на residual (ProjectBoard multi-mutate), не переигрывать A2 целиком.

---

## Статус реализации (факт репо)

| Задача спринта | Статус на `main` | Доказательство |
|----------------|------------------|----------------|
| 1. realtime refcount + reconnect | ✅ сделано | `src/lib/hooks/use-realtime.ts` — `registry` Map, refs, callbacks Set, CHANNEL_ERROR/TIMED_OUT backoff; `queryKey` задействован |
| 1+. debounce bulk-инвалидаций | ✅ сверх спринта | `f4488aa` — 150ms debounce в binding |
| 2. миграция `reorder_tasks` | ✅ сделано **и применено** | `archive/039_reorder_tasks.sql`; в baseline; schema.md: Applied 2026-07-12; RPC в `supabase.gen.ts` |
| 2. KanbanBoard → `useReorderTasks` | ✅ сделано | `KanbanBoard.tsx:48,166–189`; `use-tasks.ts:360–399` |
| 3. ExcelImport error-handling | ✅ сделано | `src/components/companies/ExcelImport.tsx` (не `migration/`); per-row try, toast, finally reset progress |
| 4. EditableCell double-PATCH | ✅ сделано | `EditableCell.tsx` — `committedRef` (AUDIT 3.5) |
| 4. CallModal UTC | ✅ сделано | `CallModal.tsx:118–121` — `localDateTimeKey` / `localDateKey` |
| 4. `dashboard-stats` + `timeline` | ✅ сделано | calls/meetings/tasks/projects invalidate оба ключа; prefix `['timeline']` бьёт ключи `use-entity-timeline` |
| Коммиты из спринта | ✅ уже есть | `a11f17f`, `b01919d` (+ follow-up `f4488aa`) |

Коммиты (все ancestors of `HEAD` / `main`):

- `a11f17f` — `feat(tasks): bulk reorder_tasks RPC (039, pending) (AUDIT A2.2)`
- `b01919d` — `fix(data): realtime refcount-менеджер, ExcelImport error-handling, kanban bulk-мутация, UTC/EditableCell/инвалидации (AUDIT A2)`
- `f4488aa` — `fix(realtime): дебаунс рассылки инвалидаций — bulk-операции не штормят рефетчами (AUDIT A2.2 follow-up)`

`schema.md` (crm-architect + `docs/schema.md`): **039 Applied 2026-07-12**, смоки empty/ghost/auth, advisors 1 WARN; цепочка 001–039 в `archive/`; prod до 046+.

---

## С чем согласен полностью (как с планом до реализации)

### 1. Realtime: module-level registry с refcount

Диагноз 1.5 точный: отдельный канал на каждый mount + `removeChannel` при unmount одного подписчика убивал realtime для layout. Решение (один `realtime-${table}`, Set колбэков, remove только при refs===0, reconnect на ERROR/TIMED_OUT) — правильное. В коде реализовано 1:1, плюс debounce 150ms (follow-up).

### 2. Kanban drop = одна RPC-мутация

Массовый `updateTask.mutate` в forEach — классический optimistic-race. `reorder_tasks(p_moves jsonb)` + один snapshot rollback — верный контракт. SQL: `SECURITY DEFINER SET search_path = public, pg_temp`, org-гард через `is_org_member` (count + WHERE), `REVOKE … PUBLIC, anon`, `GRANT authenticated, service_role` — совпадает с learnings (урок 033).

### 3. ExcelImport skip-and-continue

Запрет `newCo!.id` без проверки error, try/catch, отчёт + toast, progress в finally — корректный контракт надёжности импорта (1.6).

### 4. Мелочи 3.5 / 3.9 / 2.9

- Enter+blur → double PATCH — `committedRef` guard.  
- UTC в CallModal — `localDateKey` / `localDateTimeKey` (не `toISOString`).  
- Invalidation prefix `['timeline']` и `['dashboard-stats']` — согласовано с React Query prefix matching (`use-entity-timeline` keys: `['timeline', kind, entityType, entityId]`).

### 5. Процесс: миграция не из CC, два коммита

«039 — НЕ применять, гейт у Cowork» + SQL-файл отдельно от `src/` — правильный контракт фазы 1 (learnings: CC пишет, Cowork применяет). На момент написания спринта это было верно; **сейчас 039 уже applied**.

### 6. Тест-сценарии

Семь сценариев (две вкладки realtime, один Network-запрос drop, битая 3-я строка Excel, один PATCH Enter, 00:30 МСК, KPI без reload, tsc) — хорошие acceptance criteria.

---

## Блокеры (критично — до «запуска» в CC)

### B1. Спринт уже выполнен на `main` — повторный прогон опасен

Все четыре задачи и оба коммита из «КОММИТЫ» уже в истории `main`. Повтор:

- перепишет рабочий `use-realtime.ts` (refcount + debounce);
- попытается создать `supabase/migrations/039_reorder_tasks.sql` при том, что файл в **`archive/`**, а функция уже в baseline/проде;
- дублирует `useReorderTasks` / правки ExcelImport / EditableCell / CallModal.

**Не запускать.**

### B2. Миграция 039 — статус в спринте ложный

Спринт: «одна миграция (039) — НЕ применять, pending».

Факт:

| Источник | Статус |
|----------|--------|
| crm-architect `schema.md` | Applied 2026-07-12, гейт Cowork, смоки |
| `docs/schema.md` | 039 в цепочке applied 001–046 |
| ФС | `supabase/migrations/archive/039_reorder_tasks.sql` (не active path) |
| baseline | `CREATE … reorder_tasks` + REVOKE/GRANT |

CC по тексту спринта снова положит 039 в active migrations и/или «добавит» RPC, который уже есть — drift/конфликт history.

### B3. РАЗВЕДКА описывает pre-A2 мир

Команды спринта как **диагноз «что чинить»** устарели:

| Команда / claim | Факт на `main` |
|-----------------|----------------|
| `cat use-realtime.ts` → naive per-hook channel | Уже refcount-менеджер (AUDIT 1.5 header + registry) |
| `sed … migration/ExcelImport.tsx` | Файла нет; живой путь: `src/components/companies/ExcelImport.tsx` (fallback `find` спас бы) |
| `039_reorder_tasks.sql` в `supabase/migrations/` | Только `archive/` + baseline |
| `_queryKey` «мёртвый» | Сигнатура `queryKey?: readonly string[]`, ключ используется |
| CallModal «~117,119 UTC-баг» | Уже `localDateTimeKey` / `localDateKey` (строки 118–121) |
| ProjectDetail:186 для timeline key | `EntityTimeline` в `ProjectDetail.tsx` ~827; ключи в `use-entity-timeline.ts:230+` |

---

## Предупреждения (не блокируют «не запускать», полезны как residual)

### W1. ProjectBoard всё ещё multi-mutate (вне scope A2)

`src/components/tasks/ProjectBoard.tsx:275–282` — drop по-прежнему `forEach` → `moveTask.mutate` / `updateTask.mutate` (N запросов). A2 чинил **личный** Kanban (`KanbanBoard` + lanes), не project-column board. Симптом 2.2 частично жив на delivery/phase-доске. Отдельный follow-up: тот же `reorder_tasks` (lane+sort_order) или RPC под `column_id`.

### W2. ExcelImport: отчёт по имени, не по номеру строки

Спринт/тест: «N ok / 1 fail (стр. 3)». Реализация: сообщения вида `Компания «…»: …` / `Контакт «…»: …` без row index. Функционально skip-and-continue есть; формулировка acceptance слегка разошлась с UX.

### W3. Ссылка на `docs/schema.md` в первом коммите

Коммит A2.2 уже обновлял schema; сейчас источник истины — applied 039 + archive. Повторное «обновить schema.md под pending 039» создаст регресс статуса.

### W4. `is_org_member` vs service-контекст (информационно)

Гард в 039 через `is_org_member(t.org_id)` при `auth.uid() IS NULL` → deny (безопаснее дырявого `<> current_org_id()` из PCT-1). `GRANT service_role` есть, но service-вызов RPC без JWT-эмуляции member’а получит 42501 / no-op UPDATE — ожидаемо для RPC-поверхности; не баг A2, но помнить при фоновых job’ах.

---

## Пропущенные места (если бы спринт ещё был «к запуску»)

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `src/components/companies/ExcelImport.tsx` | живой импорт | правильный путь (не `migration/`) |
| `src/components/migration/MigrationTool.tsx` | другой tool | **не** Excel-компании |
| `src/components/tasks/ProjectBoard.tsx` | 275–282 multi-mutate | вне A2; future sprint |
| `src/lib/hooks/use-entity-timeline.ts` | 230–265 keys | инвалидация `['timeline']` уже ок |
| `src/app/(dashboard)/dashboard-content.tsx` | `['dashboard-stats']` | consumer ключа — инвалидации на месте |

Ложных «пропущенных» подписчиков `useRealtimeSync` нет: tasks/calls/meetings/projects/companies/activity_log/notifications/ai_runs/project_columns/project_members уже на общем менеджере.

---

## Предлагаемые правки в спринт

**Не править для запуска** — спринт archive-кандидат. Если оставлять файл как историю:

1. В шапке: **STATUS: DONE** (`a11f17f` + `b01919d` + `f4488aa`; 039 Applied 2026-07-12).  
2. Заменить «НЕ применять 039» → «applied, файл в `archive/039_…`».  
3. Исправить путь ExcelImport → `src/components/companies/ExcelImport.tsx`.  
4. Добавить residual note: ProjectBoard multi-mutate (не в scope A2).  
5. Не включать в очередь watch-sprints / CC.

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА в начале (но команды сейчас описывают pre-fix state)
- [x] Реальные table/column/RPC (`tasks.lane/sort_order`, `reorder_tasks`)
- [x] Реальные пути hooks/components (частично: ExcelImport path был неверным)
- [x] learnings: DEFINER + search_path + REVOKE anon
- [x] SQL отдельным файлом; apply не из CC (на момент написания)
- [x] org boundary в RPC через `is_org_member`
- [x] Нет `flowType: 'implicit'`
- [x] schema.md после 039 (уже синхронизирован post-gate)
- [ ] **Живой handoff для CC** — нет, работа сделана

---

## Чеклист перед CC

- [ ] ~~Запускать A2 в Claude Code~~ → **нет**
- [x] Убедиться, что 039 не «pending» в голове / в очереди миграций
- [x] Не трогать рабочий realtime-менеджер
- [ ] При желании: завести **отдельный** sprint residual ProjectBoard bulk-reorder (не этот файл)
- [ ] При желании: пометить `_analysis/sprint-audit-A2-data-reliability.md` как DONE / archive

---

**Итог:** AUDIT-A2 полностью реализован и влит в `main`; 039 в проде. Промпт — исторический snapshot pre-fix, не executable handoff. **Не запускать в CC.**
