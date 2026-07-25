# Ревью: handoff-gantt-view1 (S-GANTT-VIEW-1)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, ahead 3; schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/handoff-gantt-view1.md` — read-only PM-Гант v1 (фазы A→D)  
**Контекст:** v0 `685864d` → A–D (`bbfdffd`…`aebdd48`) → tooltip fix `3c06735` → VIEW-2 drag `6d86d37` → S-DEPS-1 `0463596`/`4a5eeab` → uncommitted S-CRIT-PATH в `GanttTimeline.tsx`. Предыдущее ревью `_analysis/review-handoff-gantt-view1.md` (2026-07-16 00:09) — handoff новее (00:11), блокер B учтён.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Контракт §9.2 (scope in/out) | ✅ |
| РАЗВЕДКА vs живой код | ✅ |
| Схема (`is_milestone`, `start_date`/`end_date`) | ✅ |
| `useProjectSchedule` / phase = `column_id` | ✅ |
| Бакет-математика UTC-полдень + MSK deadline | ✅ |
| Фаза B min/max (после правки) | ✅ |
| Sticky C0 / tooltip / milestone-click | ✅ в промпте; ✅ в коде (+ fixed tooltip) |
| Миграции / RLS | ✅ нет DDL — ок |
| Актуальность для запуска CC сейчас | ❌ уже сделано; повтор ломает VIEW-2/DEPS/CRIT |

**Оценка: 9.5/10** как промпт (после правок гейта).  
**Рекомендация:** **не запускать в CC повторно** — S-GANTT-VIEW-1 закрыт на `main`. Handoff годится как исторический контракт / регрессионный чеклист, не как новый спринт.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| A — таб «Гант» + `useProjectSchedule` | ✅ `bbfdffd` |
| B — zoom day/week/month + бакеты | ✅ `0ea9f1d` (`date-helpers.ts`) |
| C — swimlane + milestone + today + C0 split | ✅ `17a7e1e` |
| D — tooltip + filter open/all/milestones | ✅ `aebdd48` |
| Post-D tooltip clip | ✅ `3c06735` (`position: fixed`) |
| VIEW-2 drag | ✅ `6d86d37` (вне scope VIEW-1) |
| S-DEPS-1 стрелки | ✅ `0463596` + loop fix `4a5eeab` |
| S-CRIT-PATH | 🟡 WIP uncommitted diff в `GanttTimeline.tsx` (+124/−8) |

---

## С чем согласен полностью

### 1. Продуктовый контракт §9.2

Включено: swimlane по фазе, bar=task, milestone-ромб, today line, zoom week/month (+ day), tooltip, фильтр open/all/milestones.  
Исключено: drag, critical path, histogram, baseline, export — корректно для v1; drag/deps/crit пришли отдельными спринтами.

### 2. РАЗВЕДКА — совпадает с кодом (2026-07-16)

| Утверждение handoff | Факт |
|---------------------|------|
| `isPhaseBoard` | `delivery-phases.ts:86–88` — `columns.every(c => c.category === 'phase')` |
| `useProjectColumns` | `use-project-columns.ts:16–31` — query + realtime + `order position` |
| `ColumnCategory` + `'phase'` | `database.ts:159` |
| `is_milestone` | `supabase.gen.ts` Row/Insert/Update (~1931+) |
| `start_date`/`end_date` | schema.md 046; gen types; `effectiveSpan` в хуке |
| Таб `value: 'timeline'`, label **«Гант»** | `ProjectDetail.tsx:768` |
| `<GanttTimeline` | `ProjectDetail.tsx:792–796` |
| Хук + бакеты | `use-project-schedule.ts` (73 строки ≈ сниппет A2); `bucketKeyOf`/`buildBuckets`/`bucketIndexOf` в `date-helpers.ts` |

Handoff честно помечает: **architecture.md мог устаревать** — сейчас architecture.md уже отражает VIEW-1 (таб «Гант», `use-project-schedule`, бакеты). На момент написания handoff разведка по `src/` была правильной тактикой.

### 3. Data-layer `useProjectSchedule`

Живой хук = сниппет handoff почти 1:1:
- реюз `useProjectBoard` + `useProjectColumns` (не новый fetch);
- `effectiveSpan`: `end = end_date ?? mskDateKey(deadline) ?? start_date` (не наивный `?? deadline`);
- phase → `column_id` / `__none__` / `__flat__`; orphan «Без фазы»;
- `isMilestone: task.is_milestone === true`.

Совпадает с learnings: **фаза = `column_id` + `isPhaseBoard`, не `phase_group`**.

### 4. Порядок A→B→C→D и правка B (бывший блокер)

Предыдущий блокер («min/max из swimlanes до C») **снят** в handoff L125:

> в Фазе B … `useProjectBoard` … После Фазы C — `schedule.swimlanes.flatMap…`

Заметка гейта L187 подтверждает. Можно было отдавать в CC — и **уже отдали**.

### 5. C0 sticky / D1 tooltip / C2 milestone — в промпте и в коде

- Split-layout: `LABEL_W` + `overflow-x-auto` только на timeline-body (`GanttTimeline.tsx:594–622`).
- `isLoading` → только «Загрузка…» (L498–499) — нет флеша плоского режима.
- Исполнитель: `useTeamMembers` + `nameById` (L264, 278); lane: `DELIVERY_TASK_STATUS_LABELS` / `LANE_CONFIG` fallback (L56–61).
- Milestone: `rotate-45` + клик → TaskModal (через GanttBar; `aria-label` с «(веха)»).
- Today: `bucketIndexOf(mskDateKey(new Date()), …)`; `todayIdx === -1` → не рисовать (L673–677).
- Wide day range: `zoom==='day' && buckets.length > 180` (L505–590).
- CSS: токены (`border-accent`, `text-text-mute`, `bg-surface`) — ок.

### 6. Процесс / crm-architect

- Нет миграций, нет apply из CC.
- `org_id`/RLS не трогаем — селектор поверх существующих хуков.
- DELETE/CASCADE N/A.
- Коммиты только `src/`; `_analysis` отдельно — грабля V0 учтена.
- «Не пушить — Волна 2 отдельным заходом» — процессный ок.

---

## Блокеры (критично — исправить до запуска)

### B1. Повторный запуск handoff в CC — **запрещён**

Все A–D уже в истории `main`. Повторное «наращивание v0» поверх текущего `GanttTimeline.tsx` (~756 строк: drag + deps + crit path) даст:

- откат/конфликт с VIEW-2 (`useUpdateTaskDates`, pointer drag);
- лом S-DEPS-1 (link-mode, SVG edges, `depSig`);
- лом WIP S-CRIT-PATH (uncommitted);
- дубли хука/хелперов.

**Не блокер качества промпта** — блокер **операционный**: статус = done, не todo.

*Блокеров к содержанию handoff (как к промпту до первого запуска) нет.*

---

## Предупреждения (желательно учесть)

### W1. Handoff D1: `group-hover` vs production `fixed`

Промпт: «`group-hover`-поповер, без либы».  
Реальность + learnings: `overflow-x-auto` клиппит tooltip → `position: fixed` (`3c06735`, L756–764). Для регрессии/копирования промпта лучше одна строка: **tooltip только `fixed`/портал, не CSS group-hover внутри scroll**.

### W2. «4 фазовые дорожки» в смоке

Handoff: «delivery → 4 фазовые дорожки». Код: data-driven от `project_columns`; `laneRows` **скрывает** swimlane с `tasks.length === 0` всегда (не только после фильтра). Пустая фаза без датированных задач не рисуется — «4» только если во всех фазах есть dated-задачи (или смотреть «Все» при задачах во всех фазах). Смок формулировать: «дорожки = фазы с видимыми dated-задачами, порядок = `position`».

### W3. `bucketIndexOf` — findIndex, не Map

Handoff: «индекс через Map». Реализация: `findIndex` по `bucketKeyOf` — корректно, O(n); Map — микрооптимизация. Не дефект.

### W4. День-лейбл месяца

Handoff: `day=DD(+месяц на 1-м)`. В `bucketLabel` только `DD`; месяц — отдельный span в шапке (`i===0 || day==='01'`). Эквивалентно по UX.

### W5. Документ не помечен «DONE»

Файл всё ещё читается как исполнимый спринт. Имеет смысл шапка-баннер:

`**STATUS: DONE** (bbfdffd…aebdd48). Не перезапускать. Регрессия — §ПРОВЕРКА.`

(Правка handoff — по запросу; в этом прогоне файл не меняем.)

### W6. Uncommitted S-CRIT-PATH

Не scope VIEW-1, но соседствует в том же файле. Ревью VIEW-1 не смешивать с WIP crit path; коммитить отдельно.

---

## Пропущенные места

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `src/lib/hooks/use-project-schedule.ts` | целиком = A2 | уже есть — не создавать заново |
| `src/lib/utils/date-helpers.ts` | L26–97 бакеты; + `shiftDateKeyByBuckets` (VIEW-2) | VIEW-1 API закрыт |
| `src/components/tasks/GanttTimeline.tsx` | 756 строк ≫ v1 | не «расширять v0» с нуля |
| `src/components/projects/ProjectDetail.tsx` | L768 label «Гант» | A1 done |
| `src/lib/hooks/use-team-members.ts` | export есть | D1 ok |
| `_analysis/spike-gantt-lib-vs-custom.md` | решение «кастом» | согласовано |
| `architecture.md` (skill) | PM-Гант, schedule, бакеты | post-factum актуален |

Пропущенных файлов для *исполнения* VIEW-1 нет — всё на месте.

---

## Предлагаемые правки в спринт

1. **Баннер STATUS: DONE** + хеши коммитов A–D (и ссылка: drag → VIEW-2, deps → S-DEPS-1).  
2. D1: заменить «group-hover» на **`position: fixed`** (learnings).  
3. Смоки: «N фаз data-driven», не хардкод «4».  
4. Опционально: «пустые фазы без задач не показываем» — зафиксировать как принятое UI-решение.  
5. Не открывать этот handoff в CC watcher как «новый спринт» без done-гейтa.

*(Пункты — для сопровождения доков; повторная имплементация не нужна.)*

---

## Чеклист crm-architect

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column (`tasks.is_milestone`, `start_date`/`end_date`, `project_columns.category='phase'`)  
- [x] Реальные пути (`GanttTimeline`, `ProjectDetail`, hooks, `date-helpers`)  
- [x] learnings: MSK deadline, UTC-полдень, phase≠phase_group, fixed tooltip  
- [x] SQL-миграций нет (046/is_milestone уже в схеме)  
- [x] org_id/RLS: без новых политик  
- [x] Нет `flowType: 'implicit'`  
- [x] CSS variables / theme tokens  
- [x] schema.md: миграций в спринте нет — обновление N/A  
- [x] Read-only scope для v1 (мутации дат — VIEW-2)  

---

## Чеклист перед CC

- [x] ~~Исправить B min/max~~ — уже в handoff  
- [x] ~~Реализовать A–D~~ — в `main`  
- [ ] **Не** запускать handoff повторно  
- [ ] Регрессия (при сомнениях): `npx tsc --noEmit`; delivery phase board + client flat + week/month + today + filter + tooltip + undated  
- [ ] WIP S-CRIT-PATH — отдельный гейт/коммит, не смешивать с «доделкой VIEW-1»  
- [ ] Опционально: пометить handoff DONE  

---

## Итог

Handoff **S-GANTT-VIEW-1** — сильный, гейтовый промпт: §9.2, кастом без либы, селектор-хук, фазы A→D, UTC/MSK, C0 sticky, D1 assignee/lane. Блокер прошлого ревью (min/max в B) **закрыт** в тексте. По live codebase **весь scope уже реализован** (и надстроен VIEW-2 / DEPS / crit).  

**Вердикт: в Claude Code не отправлять. Документ — архив контракта + регрессионный чеклист, оценка промпта 9.5/10.**
