# Ревью: S-SCHEDULE-1a — lag_days UI + soft-warn FS

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `a8096d4` + WIP untracked, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-SCHEDULE-1a.md` — lag-UI на рёбрах Gantt + UPDATE RLS + soft-warn FS (без cascade)  
**Контекст:** 048/049 `task_dependencies` applied; S-DEPS-1 / S-CRIT-PATH / S-WBS в `GanttTimeline.tsx`; эпик S-SCHEDULE-1b/c вне скоупа; предыдущее ревью 7.5/10 → в спринт вшит блок «ПОПРАВКИ ПО РЕВЬЮ»; следующая миграция **062** (054–059, 056b, 061 заняты, 060 нет)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (create/delete, no update, SVG edges, critical/measure) | ✅ |
| Нумерация миграции **062** | ✅ |
| Колонки `lag_days` / `DependencyEdge` / типы | ✅ |
| RLS UPDATE + WITH CHECK (054) + **GRANT UPDATE** (в приложении B1) | ✅ |
| Soft-warn формула, scope (нет cascade) | ✅ |
| `depSig`+lag / midY / `shiftDateKeyByBuckets` (приложение W1–W3) | ✅ |
| Gantt measure-loop / learnings | ✅ учтено |
| Line numbers в теле РАЗВЕДКИ | 🟡 drift; точные — в W4 |
| КОММИТ vs W1 (`date-helpers.ts`) | 🟡 противоречие |
| Soft-warn после drag дат (span не в effect-deps) | 🟡 риск |
| Процесс: CC не apply; deploy после gate | ✅ |
| schema.md после 062 | 🟡 W7, отдельный заход |

**Оценка: 8.5/10.** Продукт, схема и паттерны верны; прежний B1 (GRANT) закрыт в приложении и уже отражён в WIP-файле 062. Остаются процессные/UX-риски (не свёрнутое приложение, stale span после drag, tip-тип), не блокеры.  
**Рекомендация:** **запускать в CC** (или продолжать текущий WIP), строго с приложением «ПОПРАВКИ» и чеклистом ниже. Не apply 062 из CC.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| 048 `task_dependencies` + insert/select/delete | ✅ `supabase/migrations/048_task_dependencies.sql` |
| 049 `created_by` DEFAULT | ✅ |
| `useCreate` / `useDelete` / `parseDependencyError` | ✅ `use-task-dependencies.ts` |
| SVG edges + click→`window.confirm`→delete | ✅ `GanttTimeline.tsx` L794–807 |
| Critical path useMemo + measure/dedup | ✅ L405–559 |
| **062** policy + grant | 🟡 **WIP untracked** `supabase/migrations/062_task_dep_update_policy.sql` (policy `in (...)` + `grant update`) — SQL задачи 1+B1 уже написан |
| `useUpdateTaskDependency` | 🟡 **WIP** в `use-task-dependencies.ts` L116–158 (только `lag_days`, optimistic, silentError) |
| Lag-UI / soft-warn / badge / hit-path (задачи 3–4) | ❌ `GanttTimeline.tsx` без изменений (849 строк; edges `{id,d,critical}`) |
| 060 | ❌ файла нет (резерв W3) |

CC/агент уже начал спринт: миграция + хук. Остаётся Gantt (задачи 3–4) + коммит/пуш + gate.

---

## Разведка (факт vs спринт)

| Утверждение спринта | Live (`a8096d4` / WIP) |
|---------------------|------------------------|
| create/delete есть, update нет (на момент промпта) | ✅ было; **сейчас** update есть в WIP L120–158 |
| create шлёт только pred/succ; lag DEFAULT 0 | ✅ insert L85–86 без `lag_days`; optimistic `lag_days: 0` |
| 048: UPDATE-политики нет | ✅ L120–122; schema.md L614–616 «UPDATE нет — ребро иммутабельно» |
| 048 grant: select/insert/delete | ✅ L122 — без UPDATE privilege в DDL |
| link-mode / pendingPred | ✅ state L299–361; create L350–361 |
| тулбар «Связи» / «Крит. путь» | ✅ L600–633 (**не** 295–360 — W4 верен) |
| critical useMemo + nodes map | ✅ L405–477; `Map<id, GanttTask>` с `.start`/`.end` |
| measure → edges | ✅ L510–546; type `{id,d,critical}`; midX локально L529; **midY нет** |
| effect deps measure | ✅ L559: `depSig, zoom, filter, showCritical, critSig, collapsedSig` — **нет** span-дат |
| `depSig` | ✅ L332–335: `` `${id}:${pred}>${succ}` `` — **без** `lag_days` |
| SVG path + delete | ✅ L794–807: `pointerEvents:'stroke'`, `window.confirm('Удалить зависимость?')` |
| `shiftDateKeyByBuckets` | ✅ `date-helpers.ts` L83–89; уже import в Gantt L21 |
| `addLocalDays` | ❌ нет (W1: не создавать) |
| `effectiveSpan` | ✅ private `use-project-schedule.ts` L37–44; UI — `gt.start`/`gt.end` |
| next migration 062 | ✅ 061 есть, 060/до-WIP 062 не было; WIP 062 untracked |
| freeze_org_id | ✅ 054 loop на все public + `org_id`; 048 раньше 054 → `task_dependencies` должна быть покрыта (смок гейтом) |
| validator only BEFORE INSERT | ✅ 048 L93–95; UPDATE ends обходит DAG (W5) |
| `var(--red)` | ✅ themes в `globals.css`; `.text-red` = `color`, не `stroke` |
| Tip | ✅ L64: `{x,y,text,assignee,status}` — edge-тултип потребует dummy-полей или расширения типа |

---

## С чем согласен полностью

### 1. Scope слоя a

Lag-UI + soft-warn **без** cascade / CP v2 / working-calendar / lead / non-FS. Совпадает со schema («БД/UI НЕ enforce'ят FS») и комментарием Gantt L400–401. Не расползается в 1b/1c.

### 2. Диагноз

`lag_days` в DDL (048) и в select/типах, write-path = DEFAULT 0; update-мутации не было; FS-нарушение молчит. Корневая боль подтверждена.

### 3. Задача 1 — RLS UPDATE

Предикат = insert/delete (org + `owner|admin|manager`); WITH CHECK по 054 — верно. Стиль `in (...)` (как 048/053) лучше, чем `= any(array[...])` из черновика — WIP 062 уже так.

### 4. GRANT UPDATE (бывший B1)

048: `grant select, insert, delete`. Явный `grant update … to authenticated` (как quotes 053) — обязательно в 062. В приложении B1 и в WIP-файле — есть. На живой БД privilege мог быть дефолтом Supabase; явный grant = намерение + антидрейф.

### 5. Задача 2 — хук

Паттерн create/delete: `meta.silentError`, optimistic на `depsKey`, `parseDependencyError`, invalidate. Только `lag_days` в payload. WIP реализация соответствует.

### 6. Задачи 3–4 — UI / soft-warn

- Hit-area transparent path (~10px) нужен (stroke 1.5–2.5).  
- Delete свернуть в поповер + `window.confirm` (learnings).  
- `violated = succ.start < shiftDateKeyByBuckets(pred.end, 'day', lag)` — согласовано с EDGE CASES (lag=0, same-day start OK).  
- Undated skip; violation-цвет на стрелке, приоритет над critical; без авто-сдвига.

### 7. depSig / edges (learnings)

Measure+setState → runtime loop. Добавить `lag_days` в `depSig` и `violated`/`lag`/`mid*` в объект + comparison `setEdges` — критично для optimistic lag-update. Приложение W2/W3 верно.

### 8. Процесс

CC пишет миграцию, **не apply**; фронт после gate; role-smoke viewer→42501. schema-дельта после apply (W7).

---

## Блокеры (критично — исправить до запуска)

**Нет.** Прежний B1 закрыт приложением + WIP 062.  
*Условие:* при доработке Gantt **обязательно** применить W1–W3 из приложения (не только тело задач 3–4).

---

## Предупреждения (желательно исправить)

### W1. Приложение vs тело спринта не свёрнуто

ЗАДАЧА 1 SQL в теле **без** `grant update`; W1 говорит убрать `date-helpers` из коммита, а блок КОММИТ всё ещё:

```text
git add … src/lib/utils/date-helpers.ts
```

РАЗВЕДКА в теле: «тулбар 295–360» — фактически L600–616.  
Риск: CC/агент читает только «ЗАДАЧА 1–4» и пропускает grant / создаёт `addLocalDays` / ищет toolbar не там.  
**Рекомендация:** при следующем edit спринта влить B1/W1–W4 в тело; пока — явный пункт «сначала блок ПОПРАВКИ».

### W2. Soft-warn после drag дат (span не в deps measure)

Effect L559 **не** зависит от start/end задач. Pre-existing: геометрия стрелок после drag обновляется не всегда (только RO / zoom / filter / critSig / depSig).  
С soft-warn это заметнее: сдвинули successor раньше `pred.end+lag` → красная стрелка может появиться только после resize/zoom/смены рёбер.  
**Правка при имплементации:**

```ts
// spanSig visible dated tasks → в deps useLayoutEffect measure
// или: violated считать в useMemo(deps+spans), geometry — в measure
```

### W3. `setTip` для edge-тултипа

`Tip` требует `assignee` + `status` (L64, UI L842–844). Для стрелки — расширить `Tip` (optional fields / `kind: 'edge'`) или передавать заглушки. Иначе tsc/UX шум.

### W4. Нет shadcn Popover в `src/components/ui`

Поповер ребра — лёгкий absolute/fixed panel (как tip), не новый примитив. Esc/outside — вручную. Не раздувать scope.

### W5. Column-level «только lag_days» (долг)

Триггер `check_task_dependency_valid` — **только BEFORE INSERT**. UPDATE ends через API обходит DAG/cross-project. Клиент шлёт только lag — v1 OK. Hardening — отдельный заход (спринт это фиксирует — согласен).

### W6. CHECK `lag_days >= 0` в БД (опционально)

Клиент clamp `Math.max(0, floor)`; DDL CHECK нет. Negative lag API-only. Можно не тащить в 062.

### W7. schema.md / crm-architect после gate

После apply: RLS task_dependencies +UPDATE + grant; убрать «ребро иммутабельно». Отдельный коммит — ок, в чеклисте gate.

### W8. WIP-коллизия

Уже есть untracked 062 + modified hook. CC не должен создать второй `062_*.sql` и не откатывать hook без нужды. Продолжать с существующего WIP.

### W9. Hit-path vs `pointer-events-none` на svg

Корневой `<svg className="pointer-events-none">` + path `style={{ pointerEvents: 'stroke' }}` — уже работает для delete. Второй hit-path тоже с `pointerEvents: 'stroke'` (или `all`). Не снимать `pointer-events-none` с svg целиком (иначе блокирует бары).

---

## Пропущенные места

| Файл | Строки / символ | Действие |
|------|-----------------|----------|
| `supabase/migrations/062_task_dep_update_policy.sql` | WIP ✅ | не дублировать; коммитить как есть (+gate apply) |
| `src/lib/hooks/use-task-dependencies.ts` | WIP update L116–158 | подключить в Gantt; не переписывать без нужды |
| `src/components/tasks/GanttTimeline.tsx` | L305 edges type; L332 depSig; L524–544 measure; L794–807 paths | **основной объём:** mid*/lag/violated, hit-path, badge, popover, tip, depSig+=lag, setEdges compare, spanSig |
| `src/lib/utils/date-helpers.ts` | L83–89 | **reuse** `shiftDateKeyByBuckets`; **не** в git add, если файл не трогали |
| `src/types/database.ts` / gen | `lag_days` уже есть | не трогать без нужды |
| crm-architect / `docs/schema.md` | RLS task_dependencies | после apply 062 |

Лишних файлов спринт не тянет. `use-project-schedule.ts` для soft-warn **не обязателен** — spans на `GanttTask` в critical/visible map.

---

## Предлагаемые правки в спринт (косметика, не блокер)

1. В SQL ЗАДАЧА 1 влить `grant update on public.task_dependencies to authenticated;`.  
2. В задачу 4 явно: `shiftDateKeyByBuckets(pred.end, 'day', lag_days)` (не `addLocalDays`).  
3. edges: `{ id, d, critical, violated, lag_days, midX, midY }`; `depSig` += `:${lag_days}`; comparison + `violated`/lag.  
4. Effect-deps: + `spanSig` (или useMemo violated).  
5. РАЗВЕДКА: toolbar L600–616; measure L510–559; SVG L794–807.  
6. КОММИТ: убрать `date-helpers.ts` из `git add`, если helper не менялся.  
7. Заметка: «WIP 062 + useUpdate могут уже лежать untracked/modified — продолжить, не форкать».

---

## Чеклист crm-architect

- [x] РАЗВЕДКА до правок  
- [x] Реальные table/column (`task_dependencies.lag_days`, RLS helpers)  
- [x] Реальные пути (hook, Gantt, date-helpers)  
- [x] learnings: measure-loop / depSig / `window.confirm`  
- [x] Миграция отдельным файлом; CC не apply  
- [x] org_id + `current_org_role()` в policy + WITH CHECK  
- [x] GRANT UPDATE (в приложении / WIP)  
- [x] Нет новых DEFINER (N/A)  
- [ ] schema.md после миграции (W7, gate)  
- [x] CSS через variables (`var(--red)` для stroke)  
- [x] Cascade delete не требуется  

---

## Чеклист перед / во время CC

- [ ] Не плодить второй 062; использовать WIP SQL (policy + grant)  
- [ ] Gantt: `depSig` += lag; edges += violated/lag/mid*; setEdges compare  
- [ ] Soft-warn: `shiftDateKeyByBuckets(..., 'day', lag)`; undated → false  
- [ ] spanSig (или аналог) в deps measure — красная стрелка после drag дат  
- [ ] Поповер: lag ≥0 + delete через `window.confirm`; hit-path ~10px  
- [ ] Бейдж `+Nд` только при lag>0; stroke violation = `var(--red)`  
- [ ] Tip/edge: расширить `Tip` или заглушки assignee/status  
- [ ] Не apply 062 из CC; фронт после Cowork apply  
- [ ] Gate: manager UPDATE lag → 1 row; viewer → 42501; чужой org deny; advisors; freeze org_id  
- [ ] Chrome: бейдж, красная стрелка + tip, delete, link-mode/CP/свёртка без регресса  
- [ ] `git add` явным списком: `062_…sql`, `use-task-dependencies.ts`, `GanttTimeline.tsx` (± gen только если трогали); **без** date-helpers, если не меняли  
- [ ] После gate: schema.md UPDATE policy + grant  

**Итог:** спринт после приложения правок **готов к CC** (оценка 8.5/10). WIP уже закрыл DDL+хук; фокус исполнения — Gantt задачи 3–4 с W2/W3 (depSig, mid*, soft-warn + span после drag).
