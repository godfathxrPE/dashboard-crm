# Claude Code Prompt — Sprint E: S-PLAN-IMPORT-1 (v2, после ревью Grok 7.5/10)

**Импорт плана проекта из Excel (фазы + этапы + даты + вехи) → задачи**

> **Что поправлено против v1 (ревью Grok, сверка по коду @`a28b2bc`):**
> **B1** `lane: 'next'` (НЕ `'now'`) — delivery-канон, иначе весь план = «В работе»; W1 autoDetect exact для коротких токенов; W2 хуки только top-level; W4 column_id=null edge; W5 `parsePlanDate` reuse `localDateKey`; W6 `invalidateQueries({queryKey})` (RQ v5); W8 монтаж flex-row над ProjectBoard.

## Контекст
- `dashboard-crm` (Next.js 15 + TS + Tailwind + Supabase, Vercel auto из `main`). `origin/main = a28b2bc`, миграции по **065**.
- **КЛИЕНТСКИЙ спринт — миграций НЕТ.** Строим на паттерне `companies/ExcelImport.tsx`: клиентский best-effort **skip-and-continue** (AUDIT 1.6 — ошибка строки в отчёт, импорт не рвётся), без RPC/транзакции.
- Цель (фидбек Олега, п.12): PM грузит Excel-план внедрения → строки становятся задачами проекта по фазам-свимлейнам, с датами и вехами (видно в доске «План» и в Ганте).

### Образец и якоря (живой код @a28b2bc)
| Что | Файл / строка |
|---|---|
| Образец импорта (portal z-999/1000, шаги, lazy xlsx, skip-and-continue) | `src/components/companies/ExcelImport.tsx` (`ExcelImportButton` L76; lazy L107-110; skip-and-continue L171-205; portal L279-290) |
| Образец чистых хелперов + автодетект | `src/lib/utils/import-helpers.ts` (`autoDetectMapping`) |
| Создать задачу | `useCreateTask()` — `use-tasks.ts:184` (`.insert(TaskInsert)`) |
| Создать фазу-колонку | `useCreateColumn(projectId)` — `use-project-columns.ts:37` (`{name, category:'phase', position?}`) |
| Прочитать фазы | `useProjectColumns(projectId)` — `use-project-columns.ts:16` |
| Типы | `TaskInsert` — `types/entities.ts:25`; `ColumnCategory` — `types/database.ts:159` |
| Локальный date-ключ (reuse!) | `localDateKey(d)` — `src/lib/utils/date-helpers.ts:3-8` |
| **delivery lane** | **`'next'`** — `ProjectBoard.tsx:169-170` (`phaseMode?'next'`), `ProjectDetail.tsx:926-927` (`isDelivery?'next'`), шаблон `copy_delivery_template` (036) |
| Гейт + монтаж | `ProjectDetail.tsx:248` `canManage`; board-таб «План» L858-861 рядом с `<ProjectBoard canManageColumns={canManage}/>` |
| vitest-образец | `tests/unit/parseFullName.test.ts` |

### Схема (факт из БД)
- `tasks`: `text`(NN), `project_id`, `column_id`(→фаза, nullable), `start_date`/`end_date`(date, nullable), `is_milestone`(bool NN default false), `wbs_code`(nullable), `parent_task_id`(nullable), `lane`(NN default `'now'` — **но delivery UI передаёт `'next'`, см. B1**), `org_id`(NN — **проставит `set_org_id`, НЕ передавать**). CHECK `tasks_dates_order_chk`: `start IS NULL OR end IS NULL OR end >= start` (null-стороны валидны).
- `project_columns`: `name`(NN), `category`(NN; фаза `'phase'`), `position`(NN default 0), `org_id`(set_org_id).

### 🔴 B1 — lane для delivery = `'next'`, НЕ `'now'`
Фазовая доска/шаблоны создают задачи с `lane: 'next'` («Не начата»); `'now'` = «В работе»; progress (037) считает по lane. Импорт плана обязан ставить **`'next'`** — иначе весь залитый план мгновенно «В работе» и progress искажён. Источник истины — `ProjectBoard:169-170` / `ProjectDetail:926-927` / template SQL (НЕ `TaskModal`/`CallLog` — там личные/сделочные задачи). В phase-колонках lane — истина (`resolve_task_board` phase-guard колонку в lane не деривит).

### Решения (зафиксированы)
- **Гейт = `canManageDeliveryProject`** (`canManage`). Согласован с RLS: `tasks_insert`=owner/admin/manager, `project_columns_insert`=owner/admin ИЛИ владелец. Импорт создаёт фазы → гейтим по `canManage` (уже, чем tasks_insert; org-manager-не-владелец импорт не видит — правильно).
- **Best-effort skip-and-continue**: фазы (match/create) → задачи; per-row try/catch → отчёт.
- **Фазы дедупятся** по имени (lower); **задачи — нет** (v1 добавляет; warning в preview). **v1 плоский** (`wbs_code` если замаплен; `parent_task_id`-дерево — follow-up). Веха — явная колонка; не замаплена → `false`.

## ⚠️ ГОЧИ
1. **lane `'next'`** — см. B1 (критично).
2. **Даты Excel:** `XLSX.read(buffer, { type:'array', cellDates:true })` (у образца ExcelImport `cellDates` НЕТ — для плана добавить, иначе serial-числа). `parsePlanDate` для `Date` → **reuse `localDateKey(d)`** (`date-helpers.ts`, не дублировать y/m/d); строки `дд.мм.гггг`/`гггг-мm-дд` нормализовать; Excel-serial `number` (если cellDates не сработал) → конверсия или `null`+error; мусор → `null`. **Без `toISOString()`** (TZ-сдвиг).
3. **CHECK end≥start:** строка с `end<start` → в `errors[]` (не insert). null-стороны валидны (задача без дат → «Без дат» в Ганте).
4. **`org_id` не передавать** (`set_org_id`); `created_by`=`auth.uid()` default.
5. **xlsx lazy:** `const XLSX = await import('xlsx')`.
6. **CSS-канон:** `text-red`/`text-text-mute`/`bg-surface`/`bg-accent`/`var(--border)`. Portal z-999/1000 (не `shared/Modal`).
7. **Invalidate — object-form (RQ v5, проект ^5.62):** `queryClient.invalidateQueries({ queryKey: ['tasks'] })` + `{ queryKey: ['project_columns', projectId] }`. НЕ shorthand `invalidateQueries(['tasks'])`.
8. **Rules of Hooks:** `useCreateTask`/`useCreateColumn`/`useProjectColumns`/`useQueryClient` — только на top-level компонента; в `executeImport` дёргать `createTask.mutateAsync(...)` (паттерн `TaskQuickAdd`/`CallLog`), НЕ звать хук внутри async/цикла.

## РАЗВЕДКА (ПЕРЕД правками)
```bash
cd ~/Downloads/dashboard-crm && git switch -c feat/plan-import && git log --oneline -1

sed -n '76,266p' src/components/companies/ExcelImport.tsx    # шаги, lazy xlsx (NB: cellDates НЕТ — добавим), skip-and-continue
cat src/lib/utils/import-helpers.ts                          # autoDetectMapping паттерн
sed -n '184,205p' src/lib/hooks/use-tasks.ts                 # useCreateTask(TaskInsert)
sed -n '16,56p'  src/lib/hooks/use-project-columns.ts        # useProjectColumns / useCreateColumn
sed -n '1,10p'   src/lib/utils/date-helpers.ts               # localDateKey (reuse в parsePlanDate)

# B1 — delivery lane = 'next' (НЕ 'now'): подтвердить
grep -n "next\|now\|defaultLane\|phaseMode" src/components/tasks/ProjectBoard.tsx | head
grep -n "defaultLane\|isDelivery" src/components/projects/ProjectDetail.tsx | head

# монтаж + гейт
grep -n "canManage\|activeTab === 'board'\|ProjectBoard\|isDelivery" src/components/projects/ProjectDetail.tsx | head
sed -n '1,40p' tests/unit/parseFullName.test.ts              # vitest-образец
```
**Свод:** сигнатуры хуков; delivery lane `'next'` подтверждён; как ExcelImport делает skip-and-continue; куда встанет кнопка (flex-row НАД `<ProjectBoard>`, только `isDelivery && canManage`).

---

## ЗАДАЧА 1 — Хелперы плана (чистые, тестируемые)  [риск: низкий]
**Context.** Парсинг в чистые функции (как `import-helpers.ts`) — под vitest.

**Steps.** Создать `src/lib/utils/plan-import-helpers.ts`:
- `export type PlanFieldKey = 'phase'|'taskText'|'start'|'end'|'milestone'|'wbs'|'skip'`.
- `autoDetectPlanMapping(header): PlanFieldKey` — **W1: длинные stems через `includes`, короткие/неоднозначные — только `exact`**:
  - `includes`: `фаза`/`этап`/`раздел`→`phase`; `задач`/`работа`/`наименован`/`операци`→`taskText`; `начал`/`старт`→`start`; `оконч`/`конец`/`финиш`/`завершен`→`end`; `веха`/`milestone`/`контрольн`→`milestone`; `wbs`/`иерарх`→`wbs`.
  - `exact` (после trim/lower, только точное равенство): `'с'`→`start`; `'по'`→`end`; `'№'`/`'код'`→`wbs`.
  - **Порядок: `end`-правила ДО `start`** (чтобы «Окончание»/«Дата окончания» не поймалось как start). `начал` матчит только «начало/дата начала», не «Описание».
  - иначе → `skip`.
- `parsePlanDate(cell: unknown): string | null` — `Date`(из cellDates) → **`localDateKey(cell)`** (reuse); `number`(Excel-serial) → конверсия эпохи или `null`; строка `дд.мм.гггг`/`гггг-мm-дд` → нормализовать; пусто/мусор → `null`.
- `parseMilestone(cell: unknown): boolean` — `да`/`yes`/`true`/`1`/`x`/`✓`/`веха` → `true`; иначе `false`.
- `applyPlanMapping(row, mapping)` → `{ phase, taskText, start, end, milestone, wbs }`.

**Verification.** `tests/unit/plan-import-helpers.test.ts` (образец `parseFullName.test.ts`): autoDetect — «Окончание»≠start, «Описание»≠start, «С»/«По» **exact** (а «Список»≠start), «Фаза»/«Этап работ»→phase; parsePlanDate — `Date`→ключ, `31.12.2026`→`2026-12-31`, `2026-07-20`→как есть, мусор→`null`; parseMilestone — да/нет/1/x. `npx vitest run plan-import-helpers`.

### КОММИТ 1
```bash
npx tsc --noEmit && npx vitest run plan-import-helpers && git add -A && git commit -m "feat(plan-import): чистые хелперы парсинга плана + vitest"
```

---

## ЗАДАЧА 2 — Компонент импорта плана  [риск: средний]
**Context.** По образцу `ExcelImportButton`: portal-модалка, шаги `mapping → preview → importing → result`, lazy xlsx, best-effort.

**Steps.** Создать `src/components/tasks/PlanImport.tsx` → `PlanImportButton({ projectId, canImport }: { projectId: string; canImport: boolean })`:
1. **Хуки top-level (W2):** `const createColumn = useCreateColumn(projectId); const createTask = useCreateTask(); const queryClient = useQueryClient(); const { data: columns = [] } = useProjectColumns(projectId);`.
2. Кнопка `<Upload/> Импорт плана` (только при `canImport`) + скрытый `input[type=file] accept=".xlsx,.xls"`.
3. `handleFile`: `const XLSX = await import('xlsx'); XLSX.read(buffer, { type:'array', cellDates:true })`; `sheet_to_json({header:1, defval:''})`; headers+dataRows; `autoDetectPlanMapping`. Шаг `mapping`.
4. **mapping**: заголовки → `<select>` из `PlanFieldKey` (рус. лейблы: Фаза/Этап, Задача, Дата начала, Дата окончания, Веха, WBS-код, — Пропустить —). «Далее» требует замапленного `taskText`.
5. **preview**: `applyPlanMapping` (фильтр непустой `taskText`). Показать: N задач; уникальные фазы с пометкой exist/create (сверить с `columns` category `'phase'` по lower name); warning «Задачи будут добавлены (существующие не заменяются)»; строки `end<start` подсветить.
6. **executeImport** (skip-and-continue):
   - a. Уникальные фазы (порядок появления). `existing = Map(columns.filter(phase).map(c => [c.name.toLowerCase(), c.id]))`.
   - b. Недостающие фазы → `await createColumn.mutateAsync({ name, category:'phase', position })` (position = `columns.length + i`). Успех → в map. **Ошибка (W4)** → `errors.push('Фаза «X» не создана: '+msg+' — её задачи будут без колонки')`, `phaseId=null`.
   - c. Каждая строка → `await createTask.mutateAsync({ text: taskText, project_id: projectId, column_id: phaseMap.get(lowerPhase) ?? null, start_date: start, end_date: end, is_milestone: milestone, lane: 'next', wbs_code: wbs || null })`. Pre-check `start && end && end < start` → `errors`, НЕ insert. Per-row try/catch → `errors`. progress bump.
   - d. Отчёт `{ phasesCreated, tasksCreated, errors[] }`; `toast`; шаг `result`.
   - **temp-id (W3):** если оптимистик使 — id `temp-${i}` (индекс), не только `Date.now()` (коллизии в одном ms при быстром цикле).
7. **result**: как ExcelImport (Check/AlertTriangle + счётчики + список ошибок + «Готово»).
8. Завершение: `queryClient.invalidateQueries({ queryKey: ['tasks'] })` + `queryClient.invalidateQueries({ queryKey: ['project_columns', projectId] })` (**object-form, W6**).

**Verification.** `npx tsc --noEmit`.

---

## ЗАДАЧА 3 — Монтаж на ProjectDetail  [риск: низкий]
**Steps.**
1. **W8:** в board-табе ProjectDetail (~L858-861) — обёртка `flex-row` **НАД** `<ProjectBoard>` с кнопкой (не внутрь ProjectBoard — board не рефакторить): `{isDelivery && <div className="flex justify-end mb-2"><PlanImportButton projectId={projectId} canImport={canManage} /></div>}`. Кнопка сама скрыта при `!canImport`.
2. Portal-модалка z-999/1000 (как ExcelImport) — конфликта с доской нет.

**Verification.**
```bash
npx tsc --noEmit
npm run build
```
Ручной смок (dev): .xlsx (Фаза, Задача, Дата начала, Дата окончания, Веха) → «Импорт плана» на доске «План» → mapping (автодетект; «Окончание» не поймалось как start) → preview (фазы exist/create, warning) → импорт → задачи в своих фазах-свимлейнах со статусом **«Не начата»** (lane='next', НЕ «В работе»!) + даты в Ганте + веха-ромб; повтор того же файла НЕ дублирует фазы; `end<start`/битая дата → в отчёте, остальное залилось; **если фаза не создалась — задачи видны в Ганте (swimlane «Без фазы»), на доске появятся после назначения колонки (W4)**; без `canManage` кнопки нет.

### КОММИТ 2
```bash
npx tsc --noEmit && npm run build && git add -A && git commit -m "feat(plan-import): модалка импорта плана (фазы+даты+вехи, lane=next, skip-and-continue) + монтаж на доске «План»"
git push -u origin feat/plan-import
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА
`npx tsc --noEmit` (0) · `npx vitest run` (зелёные) · `npm run build` (не при живом dev) · push → PR/мёрж `main` → Vercel.

## Для гейта Cowork (справочно)
Миграций нет → advisors/apply N/A. Смок: (1) vitest plan-import-helpers; (2) RLS-смок симуляцией JWT участника — `INSERT tasks`/`INSERT project_columns` под ним → `42501`/deny (гейт `canManage` бэкапится RLS, как в D); (3) ручной UI-смок (вкл. проверку lane='next' → «Не начата»).

## Не выходить за скоуп
Только импорт плана. НЕ трогать: `companies/ExcelImport` + `import-helpers.ts` компаний (образец, не рефакторить), `ProjectBoard` (кнопка НАД ним, не внутри), `parent_task_id`-дерево (v1 плоско), экспорт, `delivery_templates`. `plan-import-helpers` — новый файл.
Скилл-долг (не CC): `crm-architect/schema.md` — в тело tasks добавить `is_milestone`/`wbs_code` (в БД/gen types есть, в доке нет).
