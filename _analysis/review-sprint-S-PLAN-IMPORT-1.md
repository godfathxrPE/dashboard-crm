# Ревью: S-PLAN-IMPORT-1 v2 (импорт плана Excel → фазы + задачи)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду ветки `feat/plan-import` @ `a28b2bc` = `origin/main`; crm-architect `schema.md` / `architecture.md` / `learnings.md`; живые `ExcelImport`, hooks, RLS baseline/065)  
**Объект:** `_analysis/sprint-S-PLAN-IMPORT-1.md` — **v2** (после ревью Grok 7.5/10): клиентский импорт Excel-плана внедрения (фазы + даты + вехи), **без миграций**  
**Контекст:** v1 review (`_analysis/review-sprint-S-PLAN-IMPORT-1.md`, 7.5/10, блокер B1 lane); handoff-волна 2026-07-18; образец `companies/ExcelImport.tsx`; доска «План» + Гант; миграции в репо **по 065**; DDL не требуется

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА перед правками | ✅ |
| Scope: клиент only, миграций нет | ✅ |
| `origin/main = a28b2bc`, миграции по **065** | ✅ |
| Якоря: `ExcelImport`, `import-helpers`, hooks, типы, строки | ✅ |
| Схема `tasks` / `project_columns` (даты, milestone, wbs, set_org_id, CHECK) | ✅ |
| Гейт `canManage` = `canManageDeliveryProject` vs RLS | ✅ |
| Best-effort skip-and-continue (AUDIT 1.6) | ✅ |
| **B1 v1: `lane: 'next'` (delivery-канон)** | ✅ **закрыт в v2** |
| W1–W2, W4–W6, W8 из v1 | ✅ вписаны в шаги/AC |
| Гочи: cellDates, `localDateKey`, CHECK dates, CSS, RQ v5 object-form | ✅ |
| Монтаж board-таб ~L858–861, flex-row **над** `ProjectBoard` | ✅ |
| Out-of-scope | ✅ |
| `position = columns.length + i` vs канон `maxPos+1` | 🟡 W1 |
| W3 temp-id: инструкция про optimistic id **вне** PlanImport | 🟡 W2 |
| Опечатки / garbled (`мm`, `оптимистик使`) | 🟡 W3 |
| `git switch -c feat/plan-import` на уже существующей ветке | 🟡 W4 |
| Bulk N× invalidate через `mutateAsync` (принято v1) | 🟡 W5 (не блокер) |
| Excel-serial conversion underspec | 🟡 W6 (минор) |

**Оценка: 9/10.** v2 закрыла единственный блокер (lane) и почти все warnings v1; якоря и RLS-гейт живые; scope чистый. Остались качественные оговорки (position, temp-id wording, мелочи в тексте) — **не стоп-кран**.

**Рекомендация:** **запускать в CC as-is** (желательно поправить W1 position одной строкой в спринте/при реализации). Правки W2–W6 — на усмотрение, не блокируют.

---

## Статус (живой код)

| Заход | Статус в репо |
|-------|---------------|
| `ExcelImport.tsx` (portal zIndex 999/1000, steps, lazy xlsx **без** cellDates, skip-and-continue) | ✅ ~426 строк; `ExcelImportButton` L76; lazy L107–110; skip L171–205; portal L279+ |
| `import-helpers.ts` (`autoDetectMapping`, `parseFullName`) | ✅ |
| `useCreateTask()` | ✅ `use-tasks.ts:184` → `.insert(TaskInsert)`; optimistic `temp-${Date.now()}` L205; `is_milestone`/`wbs_code` в optimistic L224–227 |
| `useProjectColumns` / `useCreateColumn` | ✅ L16 / L37; key `['project_columns', projectId]`; onSettled invalidate object-form |
| `TaskInsert` / `ColumnCategory` + `'phase'` | ✅ `entities.ts:25` (alias gen); `database.ts:159` |
| Gen types: `start_date`/`end_date`/`is_milestone`/`wbs_code`/`lane` | ✅ `supabase.gen.ts` tasks Insert |
| `canManage` = `canManageDeliveryProject` | ✅ `ProjectDetail.tsx:248`; impl `project-permissions.ts:10–18` |
| Board-таб «План» + `<ProjectBoard canManageColumns={canManage} />` | ✅ L858–861; label L839 |
| Delivery default lane **`'next'`** | ✅ `ProjectDetail:927`; `ProjectBoard:169–170`; `copy_delivery_template` baseline INSERT `'next'::task_lane`; labels `delivery-phases.ts` next=«Не начата», now=«В работе» |
| `localDateKey` (не `toISOString`) | ✅ `date-helpers.ts:3–8` |
| `xlsx` ^0.18.5; RQ ^5.62; vitest `tests/unit/parseFullName.test.ts` | ✅ |
| CHECK `tasks_dates_order_chk` | ✅ 046: `start IS NULL OR end IS NULL OR end >= start` |
| RLS `tasks_insert` = owner/admin/**manager**; `project_columns_insert` = owner/admin ∨ project owner/created_by | ✅ baseline |
| `PlanImport.tsx` / `plan-import-helpers.ts` | ❌ ещё нет (ожидаемо) |
| Миграции …065; next free **066** | ✅; спринт DDL не трогает |
| Ветка `feat/plan-import` | ✅ **уже** checkout @ `a28b2bc` (не только в РАЗВЕДКЕ «создать») |

---

## С чем согласен полностью

### 1. v2 закрыла B1 (критичный lane)

В executeImport явно: `lane: 'next'`. Якоря и блок «B1» ссылаются на `ProjectBoard:169–170` / `ProjectDetail:926–927` / template SQL — **подтверждено grep’ом**. CallLog/TaskModal больше не выдаются за delivery-истину. Смок AC: статус **«Не начата»**, не «В работе».

### 2. Контекст и якоря разведки — точны

| Утверждение спринта | Факт |
|---------------------|------|
| `origin/main = a28b2bc`, миграции по 065 | ✅ HEAD/`origin/main` = `a28b2bc`; last = `065_team_visibility.sql` |
| ExcelImport lazy / skip / portal | ✅ L107–110, L171–205, L279+ (zIndex 999/1000 inline style) |
| ExcelImport **без** `cellDates` | ✅ `XLSX.read(buffer, { type: 'array' })` — для плана `cellDates:true` обязателен |
| `useCreateTask` 184, columns 16/37 | ✅ |
| `TaskInsert` 25, `ColumnCategory` 159, `canManage` 248 | ✅ |
| Board mount 858–861 | ✅ |

### 3. Схема — без DDL, поля есть

| Поле / правило | Факт |
|----------------|------|
| `start_date`/`end_date` + CHECK null-стороны валидны | 046 |
| `is_milestone` bool NN default false | baseline/038; gen types |
| `wbs_code`, `parent_task_id` | 052; v1 плоско — верно |
| `lane` NN default `'now'` в БД; delivery UI → `'next'` | baseline + B1 |
| `org_id` через `set_org_id` — не передавать | schema/learnings |
| `project_columns.category = 'phase'` | 036; `ColumnCategory` |
| Phase-guard: в phase-колонках **lane — истина** | schema + sprint B1 |

Скилл-долг `schema.md` body tasks (нет строк `is_milestone`/`wbs_code` в основной таблице, хотя history/gen types есть) — sprint честно выносит **вне CC**. Ок.

### 4. Гейт `canManage` vs RLS — корректный

| Политика | Кто пишет |
|----------|-----------|
| `tasks_insert` | org + owner/admin/**manager** |
| `project_columns_insert` | org + (owner/admin **∨** `projects.owner_id`/`created_by`) |

`canManageDeliveryProject` уже, чем `tasks_insert`. Импорт создаёт фазы → гейт по `canManage` правильный; org-manager-не-владелец кнопку не видит. Согласовано с `canManageColumns` на `ProjectBoard` / Gantt.

### 5. Паттерн импорта, scope, гочи

- Клиентский best-effort без RPC/транзакции — как ExcelImport; фазы match/create → задачи; дедуп фаз lower; задачи не дедупятся + warning — здраво для v1.  
- W1 autoDetect: includes для stems, **exact** для `с`/`по`/`№`/`код`, end-before-start + vitest кейсы — закрывает false-positive v1.  
- W2: hooks top-level + `mutateAsync` в execute — правильный HOW (`TaskQuickAdd` L19/L27).  
- W4: error text + AC «Гант „Без фазы“, доска без колонки» — **верно** (`use-project-schedule` `__none__` «Без фазы»; `ProjectBoard` рендерит только `columns.map`, `__unassigned__` не рисуется).  
- W5/W6/W8: `localDateKey`, object-form invalidate, flex-row **над** board — канон RQ v5 и живой ExcelImport.  
- Не трогать ExcelImport / company import-helpers / ProjectBoard internals / parent tree / templates — границы чистые.

### 6. crm-architect checklist

| Пункт | |
|-------|--|
| РАЗВЕДКА | ✅ |
| Имена таблиц/колонок | ✅ |
| Пути файлов | ✅ |
| learnings (org_id, TZ/`toISOString`) | ✅ |
| SQL/migrations from CC | ✅ нет |
| org_id / RLS | ✅ |
| Новые DEFINER | N/A |
| flowType implicit | N/A |
| CSS variables + portal | ✅ |
| schema.md update after migration | N/A (нет DDL); skill-debt отмечен |

---

## Блокеры (критично — исправить до запуска)

**Нет.** B1 v1 (`lane: 'now'`) в v2 исправлен; иных стоп-кранов по schema/RLS/путям/скоупу не найдено.

---

## Предупреждения (желательно исправить)

### W1. `position = columns.length + i` ≠ канон доски

`ProjectBoard.handleAddColumn` (L291–294):

```ts
const maxPos = columns.reduce((m, c) => Math.max(m, c.position), 0);
// … position: maxPos + 1
```

Спринт: `position = columns.length + i`. При неплотных `position` (удалённая средняя фаза, позиции 0,1,3) новый `position=3` **коллидирует** с существующей колонкой → непредсказуемый порядок.

**HOW в executeImport:**

```ts
let nextPos = columns.reduce((m, c) => Math.max(m, c.position), -1) + 1;
// на каждую создаваемую фазу: position: nextPos++
```

Желательно вписать в ЗАДАЧУ 2 до/во время CC.

### W2. «temp-id (W3)» — не контролируется из `PlanImport`

Optimistic id живёт **внутри** `useCreateTask.onMutate` (`temp-${Date.now()}`, L205). `PlanImport` через `mutateAsync` **не** задаёт id. Фраза «если оптимистик使 — id `temp-${i}`» (ещё и garbled) либо:

- требует правки `use-tasks.ts` (вне scope / риск), либо  
- вводит CC в заблуждение.

**Рекомендация:** вычеркнуть/смягчить: «v1: thrash N invalidations + Date.now temp id в хуке — accepted; raw bulk insert + один invalidate — follow-up». Не править `use-tasks` в этом спринте.

### W3. Текстовые опечатки

| Место | Проблема |
|-------|----------|
| ГОЧИ / parsePlanDate | `гггг-мm-дд` → **`гггг-мм-дд`** (латинская `m`) |
| executeImport temp-id | `оптимистик使` — битый символ |

Не ломает исполнение, если CC читает смысл; лучше почистить.

### W4. РАЗВЕДКА: `git switch -c feat/plan-import`

В живом workspace ветка **уже** есть (`feat/plan-import` @ `a28b2bc`). `switch -c` упадёт. HOW: `git switch feat/plan-import` или `git switch -c …` только если ветки нет.

### W5. Bulk через `mutateAsync` = N invalidations (принято)

Каждый `useCreateTask`/`useCreateColumn` в `onSettled` инвалидирует кеши; 80 строк → десятки refetch. ExcelImport для сравнения: raw `supabase.from().insert` + один invalidate. v1/v2 осознанно переиспользуют хуки — **ок для v1**, не блокер. Follow-up: batch insert.

Доп. invalidate в конце шага 8 — избыточен, но безвреден (object-form правильный).

### W6. Excel-serial `number` — алгоритм не зафиксирован

«конверсия эпохи или `null`» — на усмотрение CC. Достаточно для v1:  
- `Date` → `localDateKey`  
- string dd.mm / yyyy-mm-dd  
- number → **либо** простой Excel serial (epoch 1899-12-30) **либо** `null` + error  

Зафиксировать один путь в тесте (например number→null+документация, или serial→date) — меньше сюрпризов на смешанных xlsx.

### W7. (минор) Пустой flex-row для non-canManage

Монтаж: `{isDelivery && <div className="flex …"><PlanImportButton canImport={canManage} />`. У viewer/manager-не-владельца — пустой `div` с `mb-2`. Косметика: `isDelivery && canManage && …`.

### W8. (минор) Пустая/незамапленная фаза

Если phase → skip или ячейка пустая → `column_id: null` (тот же edge, что W4). AC смока это покрывает для ошибки create; для «фаза не замаплена» — достаточно preview-warning «без фазы».

---

## Пропущенные места (grep)

| Файл | Строки / символ | Действие |
|------|-----------------|----------|
| `src/components/tasks/ProjectBoard.tsx` | 169–170, 291–294 | lane `'next'`; **maxPos+1** — зеркало position |
| `src/components/projects/ProjectDetail.tsx` | 858–861, 927 | mount + defaultLane |
| `src/lib/utils/date-helpers.ts` | `localDateKey` | reuse в `parsePlanDate` |
| `src/lib/constants/delivery-phases.ts` | status labels | «Не начата»/«В работе» после импорта |
| `src/lib/hooks/use-project-schedule.ts` | `__none__` / «Без фазы» | AC W4 |
| `src/lib/hooks/use-tasks.ts` | 112–115, 184–250 | `__unassigned__` не рендерится; не править temp-id в v1 |
| `src/components/tasks/index.ts` | barrel | PlanImport **не** обязан в barrel; прямой import ок |
| `src/types/supabase.gen.ts` | tasks Insert | поля есть |
| skill `schema.md` body tasks | is_milestone/wbs | skill-долг, не CC |

Ложных путей в спринте нет. Пропущенных обязательных файлов для скоупа нет. `architecture.md` не перечисляет `ExcelImport.tsx` явно — образец живой, не блокер.

---

## Предлагаемые правки в спринт (опционально, не блокируют GO)

1. **W1:** `position` = `max(columns.position)+1+i`, как `ProjectBoard`.  
2. **W2:** убрать/смягчить temp-id HOW (не трогать `use-tasks`).  
3. **W3:** опечатки `мм`, garbled `使`.  
4. **W4:** `git switch feat/plan-import` (ветка может существовать).  
5. **W7:** mount `isDelivery && canManage`.  
6. (опц.) W6: один явный путь для Excel serial в тесте.

Минимальный дифф для идеального GO: **только W1**.

---

## Чеклист перед CC

- [x] B1: `lane: 'next'` в спринте  
- [ ] Желательно: position = maxPos+1 (W1)  
- [ ] Ветка `feat/plan-import` от `main` @ `a28b2bc` (уже есть — не `-c` вслепую)  
- [ ] Прочитаны `ExcelImport.tsx`, `import-helpers.ts`, `use-tasks` create, `use-project-columns`, `ProjectDetail` board-таб  
- [ ] Не передавать `org_id`; `cellDates: true`; даты через `localDateKey`  
- [ ] Hooks top-level; `mutateAsync` в execute  
- [ ] `invalidateQueries({ queryKey: … })` object-form  
- [ ] `canImport={canManage}` только delivery board-таб; кнопка **над** `ProjectBoard`  
- [ ] vitest: `plan-import-helpers` (окончание≠start, «С»/«По» exact, dates, milestone)  
- [ ] `npx tsc --noEmit` · `npx vitest run plan-import-helpers` · `npm run build`  
- [ ] Ручной смок: mapping → preview → import → swimlanes + lane «Не начата» + Gantt dates + веха; re-import phases match; bad dates in report; phase fail → Гант «Без фазы»; без canManage кнопки нет  
- [ ] Миграций/advisors/apply — **нет**  
- [ ] Не рефакторить ExcelImport / company import-helpers / ProjectBoard / WBS parent / templates  

---

## Итог одной строкой

**v2 готова к CC (9/10):** блокер lane закрыт, якоря и RLS сверены; перед/во время реализации желательно выровнять `position` на `maxPos+1` как в `ProjectBoard`.
