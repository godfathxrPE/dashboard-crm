# Ревью: M8 — Excel-импорт плана на «Гант» + шаблон .xlsx (v1.1)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `84c9691`, live WT + HEAD)  
**Объект:** `_analysis/sprint-m8-gantt-import.md` — вынести `PlanImportButton` на таб «Гант» + «Скачать шаблон .xlsx» рядом с «Импорт плана»  
**Контекст:** S-PLAN-IMPORT-1 на доске «План» (`d59a7cc`); M5b/M6/M7 на ветке; v1.1 — ответ на предыдущее ревью (B1 placement, W1 RU-даты, W2 try/catch). Импортер не переписывать; «Без дат» out of scope. Миграций нет.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды + claims) | ✅ 1:1 с HEAD |
| Task 1 — кнопка на timeline | ✅ паттерн board, props Gantt не трогать |
| Task 2 — placement шаблона (toolbar, не модалка) | ✅ B1 v0 закрыт в v1.1 |
| Headers шаблона ↔ `autoDetectPlanMapping` | ✅ 6/6 + unit tests |
| Даты RU `дд.мм.гггг` / parsePlanDate | ✅ |
| try/catch + toast + `Download` lucide | ✅ |
| Scope / «Без дат» / importer rewrite | ✅ |
| SQL / RLS / schema.md | ✅ N/A (миграций нет) |
| Commit 2 files, no push | ✅ |
| learnings (lane=`next`, lazy xlsx) | ✅ не ломает; импортер не трогаем |

**Оценка: 9/10.** Узкий UI-спринт, якоря верные, v1.1 закрыл единственный блокер прошлого ревью.  
**Рекомендация:** **запускать в CC as-is** на чистом HEAD; если WT уже содержит diff M8 — **не переигрывать**, только смок + commit.

---

## Статус (в репо сейчас)

| Слой | Состояние |
|------|-----------|
| HEAD `84c9691` | Task 1/2 **не** закоммичены: timeline = только `<GanttTimeline />`; в `PlanImport` нет `Download` / `downloadTemplate` |
| Working tree | **M8 уже применён 1:1** (uncommitted): `ProjectDetail.tsx` +18/−10, `PlanImport.tsx` +36/−10; blame `Not Committed Yet` |
| Ветка | `feat/deal-card` (как в чекауте спринта) |

**Следствие для CC:** на грязном WT повторное «выполнить спринт» даст no-op/конфликт; разумный путь — `git diff` → смок → commit из секции КОММИТ. На чистом HEAD — полный прогон.

---

## Live-разведка (HEAD)

| Claim спринта | Live |
|---------------|------|
| `PlanImportButton` import в ProjectDetail | L57 |
| board: `isDelivery` + `PlanImportButton` `canImport={canManage}` | L889–896 |
| timeline: только `GanttTimeline` | L902–908 (HEAD) |
| `GanttTimeline` props | `projectId`, `canManage`, `onEditTask` — snippet спринта совпадает (`GanttTimeline.tsx` L29–35, L339) |
| `export function PlanImportButton` | `PlanImport.tsx` L46 |
| `if (!canImport) return null` | L64 |
| Поток: hidden `input type="file"` + внешний триггер → parse → `setOpen(true)` на mapping | L74–98, L187–191 (HEAD) |
| Экрана «выбор файла» в модалке | **нет** (v1.1 это явно фиксирует) |
| `autoDetectPlanMapping` / `parsePlanDate` | `plan-import-helpers.ts` L15–81 |
| lazy `import('xlsx')` | L80 |
| `xlsx` в package.json | `^0.18.5` |
| unit tests headers | `tests/unit/plan-import-helpers.test.ts` — 19/19 pass |
| Таб label «Гант» / value `timeline` | ProjectDetail L869 |
| UI undated | Gantt: «Без дат» (L1168), не «БЕЗ ДАТ» — только copy в смоке |

Проверка заголовков шаблона (логика helpers):

| Header | autoDetect |
|--------|------------|
| Фаза | `phase` |
| Задача | `taskText` |
| Дата начала | `start` |
| Дата окончания | `end` (end-rules **до** start) |
| Веха | `milestone` |
| WBS | `wbs` |

---

## С чем согласен полностью

### 1. Task 1 — монтаж на «Гант»

Тот же delivery-гейт и toolbar, что на доске:

```tsx
{isDelivery && (
  <div className="mb-2 flex justify-end">
    <PlanImportButton projectId={projectId} canImport={canManage} />
  </div>
)}
```

- `isDelivery = project.type === 'delivery'` (L253); client — кнопки нет.  
- `canManage = canManageDeliveryProject(...)` (L255) → `canImport`.  
- `activeTab` board | timeline — **один** mount, не двойная кнопка на экране.  
- Пропсы `GanttTimeline` не менять — верно.

### 2. Task 2 — шаблон **рядом** с «Импорт плана» (не в модалке)

v1.1 корректно: модалка открывается **после** файла на `mapping`. Шаблон в toolbar `PlanImportButton` → виден и на «План», и на «Гант».

Snippet: `flex gap-2` + `type="button"` + `Download` + lazy xlsx + `writeFile('план-шаблон.xlsx')` + try/catch `toast.error` — совпадает с паттернами проекта (`text-xs text-accent hover:underline` уже в UI).

### 3. Колонки / даты / веха

- 6 заголовков = канон autoDetect (есть unit-тесты).  
- Примеры `20.07.2026` — ветка `дд.мм.гггг` в `parsePlanDate` (L70–76).  
- `да` → `parseMilestone` (L84–89).  
- WBS example `1.1` / `1.8` / `2.2` — строки, ок.

### 4. Scope и commit

- Не трогать undated wall / pipeline mapping-preview-execute — ок.  
- 2 файла, без миграций, без push — ок.  
- Invalidate `['tasks']` + `['project_columns', projectId]` уже в импортере; Gantt читает `useProjectSchedule` → `useProjectBoard` (`['tasks','board',projectId]`) — prefix-инвалидация подтянет бары. Дублировать не нужно.

### 5. crm-architect / learnings

- lane=`next` уже в executeImport (learnings Волна 2: не `'now'`) — спринт не ломает.  
- CSS: только utility + semantic tokens (`text-accent`, `border-border`) — без raw hex.  
- SQL/SECURITY DEFINER/RLS — N/A.

---

## Блокеры (критично — исправить до запуска)

**Нет.** B1 предыдущего ревью (фантомный «экран выбора файла») закрыт в v1.1.

---

## Предупреждения (желательно учесть)

### W1 — dirty working tree

M8 **уже в WT** (uncommitted), diff = snippet спринта.  
CC: сначала `git status` / `git diff` на двух файлах. Если diff уже = задачам — **только смок + commit**, не re-apply.

### W2 — copy «БЕЗ ДАТ» vs UI «Без дат»

Смок-текст uppercase; в Gantt — «Без дат». Не код-баг.

### W3 — `canImport=false` прячет и шаблон

`if (!canImport) return null` скрывает и download, и import. Для viewer’ов формат колонок недоступен. Согласовано с reuse кнопки; менять gate не требуется.

### W4 — import-кнопка без `type="button"`

Пре-существующее; спринт: «существующая кнопка — БЕЗ изменений». Ок. Template с `type="button"` — правильно.

### W5 — architecture.md

Документ всё ещё описывает PlanImport в контексте S-PLAN-IMPORT-1 без явного «и на Ганте». Out of scope M8; опционально в DOCS-SYNC.

### W6 — checkout note

«после M5b/M6/M7» — на `feat/deal-card` это уже так; конфликтов с M8 нет.

---

## Пропущенные места

| Файл | Нужен? |
|------|--------|
| `GanttTimeline.tsx` | нет |
| `plan-import-helpers.ts` | нет (headers уже match) |
| `ProjectBoard.tsx` | нет |
| migrations / schema.md | нет |

---

## Предлагаемые правки в спринт

Не обязательны для GO. Nice-to-have:

1. В РАЗВЕДКУ: «если timeline уже с `PlanImportButton` — M8 done, только commit».  
2. N1 (опц.): `PLAN_TEMPLATE_HEADERS` + test round-trip в helpers.  
3. В смоке: «Без дат» как в UI.

---

## Чеклист перед CC

- [x] РАЗВЕДКА: board vs timeline на HEAD  
- [x] Task 1: wrap timeline + `isDelivery` + `canImport={canManage}`  
- [x] Task 2: template **toolbar** `PlanImportButton`, не modal step  
- [x] Headers 6 = autoDetect; даты RU; try/catch; `Download`  
- [x] Не трогать Gantt undated / importer pipeline  
- [x] Нет SQL / schema  
- [ ] WT: либо clean re-apply, либо diff=M8 → skip edit  
- [ ] Смоук delivery «Гант» + client no button + «План» без дубля  
- [ ] Re-import шаблона → все 6 колонок auto-mapped  
- [ ] tsc 0  
- [ ] Commit 2 files; **не push** без подтверждения  

---

## Итог

| | |
|--|--|
| **Вердикт** | **9/10 GO as-is** |
| **Blockers** | нет (v1.1) |
| **Файлы** | `src/components/projects/ProjectDetail.tsx`, `src/components/tasks/PlanImport.tsx` |
| **В CC?** | Да; на dirty WT — commit/smoke, не повторная реализация |
| **Риск** | низкий (UI-only, reuse, no migrations) |
