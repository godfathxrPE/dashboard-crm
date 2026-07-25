# Ревью: S-DEPS-1 POLISH — created_by default + docs/schema 047/048

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `4a5eeab`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-DEPS-1-polish.md` — миграция 049 (`created_by` DEFAULT), дельты `docs/schema.md` 047/048, уроки в skill `learnings.md`  
**Контекст:** S-DEPS-1 в репо (`048` + хук + стрелки, `0463596`); runtime-loop закрыт (`4a5eeab`); B2 DROP legacy stage — MCP `047` без файла; skill/schema docs отстают от прода (до 046, без `task_dependencies`)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope-сжатие (без `window.confirm` → custom) | ✅ |
| WHY / конвенция `DEFAULT auth.uid()` | ✅ |
| SQL 049 (DDL only, CC не apply) | ✅ |
| Хук insert без `created_by` (live) | ✅ |
| RLS insert не трогать | ✅ |
| `docs/schema.md` реально без 047/048 | ✅ |
| Skill schema/learnings gaps | ✅ |
| Уроки learnings (loop / HMR / confirm) vs live | ✅ |
| РАЗВЕДКА-команды (`ls \| tail -3`) | 🟡 |
| Полнота правок 047 в `docs/schema.md` | 🟡 |
| `049 (applied)` в docs до Cowork apply | 🟡 |
| crm-architect checklist | ✅ |

**Оценка: 9/10.** Узкий, корректный полиш: DDL + документация, без UI-регрессий. Блокеров нет.  
**Рекомендация:** **запускать в CC** (W1–W3 — уточнить HOW одной-двумя строками, не блокируют старт).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| 046 Gantt dates | ✅ `supabase/migrations/046_gantt_dates_on_tasks.sql` |
| 047 DROP legacy `projects.stage` | ✅ applied via MCP; **файла `047_*` нет** (handoff B3 / `d904172`) |
| 048 `task_dependencies` | ✅ `048_task_dependencies.sql` @ `0463596`; prod header спринта: applied |
| Loop fix Gantt measure | ✅ `GanttTimeline.tsx` @ `4a5eeab` (`depSig`, dedupe `setEdges`) |
| 049 `created_by` DEFAULT | ❌ файла нет (ожидаемо) |
| `docs/schema.md` 047/048 | ❌ нет `task_dependencies`; `projects.stage` / `deal_stage` ещё в теле |
| skill `references/schema.md` 047/048/049 | ❌ Applied до 046; `task_dependencies` нет |
| skill `learnings.md` S-DEPS-1 уроки | ❌ ещё не добавлены |

---

## Разведка (факт vs спринт)

| Утверждение спринта | Live | Вердикт |
|---------------------|------|---------|
| «`ls … \| tail -3` → 048 последний» | `ls supabase/migrations/ \| tail -3` → `20260712230000_baseline.sql`, `README.md`, `archive` | 🟡 команда врёт (см. W1) |
| 048 — последний **numbered** SQL | ✅ `040`…`046`, `048` (нет `047`/`049`) | ✅ |
| `created_by` в 048 без DEFAULT | ✅ L10: `created_by uuid references public.profiles(id) on delete set null` | ✅ |
| Insert хука без `created_by` | ✅ `use-task-dependencies.ts` L85: `.insert({ predecessor_id, successor_id })` | ✅ |
| RLS insert не смотрит `created_by` | ✅ 048 L109–113: org + role only | ✅ |
| Конвенция `DEFAULT auth.uid()` | ✅ archive `030_ai_hub` / companies/tasks/…; docs: transcripts/ai_runs NOT NULL DEFAULT | ✅ (у dep — **nullable**, DEFAULT ок) |
| `window.confirm` 25+ сайтов | ✅ 25 совпадений `confirm(`/`window.confirm` в `src/**/*.{ts,tsx}` (вкл. 1–2 комментария) | ✅ |
| Нет `ConfirmDialog` / `useConfirm` | ✅ 0 вхождений | ✅ |
| Commits loop `0463596` → `4a5eeab` | ✅ git log; `depSig` L288–291, dedupe L382–388, deps `[depSig, zoom, filter]` L398 | ✅ |
| 047 снёс stage / deal_stage / триггеры | ✅ B3 handoff + код: `LEGACY_STAGE_LABELS`, gen без `deal_stage` / bare `stage` | ✅ (docs/skill ещё «до DROP») |
| `docs/schema.md` без task_dependencies | ✅ `rg task_dependencies docs/schema.md` → пусто | ✅ |
| Скилл вне git-репо | ✅ `~/.claude/skills/crm-architect/…` | ✅ |

---

## С чем согласен полностью

### 1. Сжатие scope: confirm — не этот спринт

25 call-sites `confirm`/`window.confirm` (Kanban, tables, ProjectDetail, Gantt L596, …), кастомного `ConfirmDialog` нет. Точечная замена только на Гантте дала бы inconsistency. Отдельный app-wide эпик — верное решение; в learnings как ℹ️-конвенция — уместно.

### 2. WHY миграции 049

Колонка nullable, без DEFAULT → каждый insert из `useCreateTaskDependency` оставляет `created_by = NULL`. Аудит «кто связал» теряется без правки клиента. `DEFAULT auth.uid()` — тот же паттерн, что у tenant-таблиц / AI Hub; под service/MCP (`auth.uid()` null) → NULL при nullable — корректно.

### 3. SQL 049 — минимальный и правильный

```sql
alter table public.task_dependencies
  alter column created_by set default auth.uid();
```

Не трогает RLS, CHECK, триггеры, типы. CC **не apply** — процесс crm-architect соблюдён. Backward compat: существующие строки не меняются; DEFAULT только на INSERT.

### 4. Задача 2 — docs реально отстают

- Applied-шапка `docs/schema.md`: **001–046**, без 047/048.  
- `projects.stage` + `deal_stage` enum + `null_internal_stage` / `log_stage_change` ещё в теле (L428, L677, triggers).  
- Таблицы: **нет** `task_dependencies`.  
Черновик блока 048 в спринте совпадает с live `048_task_dependencies.sql` (колонки, constraints, индексы, `trg_set_org_id` + `trg_zz_check_task_dependency`, errcodes, RLS, grants). Пометка `created_by … DEFAULT (049)` — осознанный end-state.

### 5. Задача 3 — skill gaps подтверждены

- `references/schema.md`: Applied до 046; `projects.stage` legacy; **нет** `task_dependencies`.  
- `learnings.md`: нет уроков про measure-loop / HMR / confirm-конвенцию.  
Тексты уроков совпадают с live-фиксом (`depSig`, functional `setEdges` bail-out) и с реальной HMR-практикой.

### 6. Гейты / коммит / Cowork

- `tsc`/`build` — 049 DDL-only, кода не трогает → 0/0 ожидаемо.  
- `git add` только репо-файлы; skill отдельно.  
- Post-CC: `apply_migration` + `column_default` + smoke-insert — достаточный гейт.

### 7. crm-architect checklist

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА перед правками | ✅ (команда ls — W1) |
| Реальные table/column | ✅ `task_dependencies.created_by` |
| Реальные пути | ✅ migrations / `docs/schema.md` / skill path |
| learnings gotchas | ✅ (добавляются; loop уже в коде) |
| SQL file, не apply из CC | ✅ |
| org_id / RLS | ✅ не меняются |
| DEFINER + search_path | N/A (ALTER DEFAULT) |
| schema.md после миграции | ✅ Задача 2 |

---

## Блокеры (критично — исправить до запуска)

**Нет.**

---

## Предупреждения (желательно исправить)

### W1. РАЗВЕДКА: `ls … | tail -3` не показывает 048

На live:

```text
20260712230000_baseline.sql
README.md
archive
```

`baseline`/`README`/`archive` лексикографически после `048`. Для CC лучше:

```bash
ls supabase/migrations/0*.sql | sort | tail -5
# ожидание: …046…, 048_task_dependencies.sql; 049 ещё нет
grep -n "created_by" supabase/migrations/048_task_dependencies.sql
```

### W2. Дельта 047 в `docs/schema.md` шире «добавить абзац»

Спринт перечисляет снесённое, но в теле docs **много** живых ссылок, не только строка `stage`:

| Место (docs/schema.md) | Что сделать |
|------------------------|-------------|
| L428 `stage \| deal_stage` | Убрать колонку / пометить DROPPED 047 |
| L457–459 `null_internal_stage` / `stage: null` | Вычистить legacy-stage контракт |
| L677 enum `deal_stage` | Удалить / «снят 047» |
| L745, L902, L1047–1048 | `log_stage_change` / `null_internal_stage` — отметить DROPPED |
| L1109–1129 migration history 032/035 | Исторический контекст ок; явно: **047 снял** |
| Applied header L8 | Поднять до **048** (и 049 — см. W3) |

Иначе docs останется полусогласованным («stage legacy кандидат» при живом DROP). Имеет смысл в спринте явно: «grep `deal_stage\|projects\.stage\|null_internal_stage\|log_stage_change\|on_stage_change` по `docs/schema.md` и skill schema — вычистить/пометить DROPPED».

### W3. «049 (applied)» в Migration history до apply

Процесс: CC коммитит файл 049 → Cowork `apply_migration`. В момент docs-коммита 049 ещё **не** applied. Варианты:

1. В docs: `048 … (applied)`, `049 … (pending Cowork / file in repo)`; после apply — одна строка.  
2. Либо docs-правка 049-status — хвост Cowork после smoke.

Для 048 пометка applied согласована с шапкой спринта («Applied по 048»).

### W4. (minor) architecture.md skill

Спринт не трогает `architecture.md`. Live: `use-task-dependencies.ts` есть, в architecture tree — нет. Не блокер полиша; backlog skill-sync.

### W5. (minor) NULL-строки «их нет»

Если после 048 уже создавали рёбра в UI — у них `created_by IS NULL` и DEFAULT их не починит. Спринт это признаёт; backfill не в scope — ок. На гейте Cowork: `select count(*) from task_dependencies where created_by is null` — info only.

---

## Пропущенные места

| Файл | Строки / факт | Действие |
|------|---------------|----------|
| `src/lib/hooks/use-task-dependencies.ts` | L85 insert без `created_by` | **Не менять** (049 закрывает) |
| `src/types/supabase.gen.ts` | `task_dependencies.Insert.created_by?` optional | **Не обязателен** regen (DEFAULT — DB-side) |
| `docs/schema.md` | много stage/deal_stage/null_internal_stage | Полная зачистка 047 (W2) |
| `~/.claude/skills/…/schema.md` | то же + нет task_dependencies | Задача 3 |
| `~/.claude/skills/…/learnings.md` | нет 3 уроков S-DEPS-1 | Задача 3 |
| `architecture.md` (skill) | нет `use-task-dependencies` | optional backlog |

Пропущенных **кодовых** сайтов для 049 нет — один insert path.

---

## Предлагаемые правки в спринт

1. **РАЗВЕДКА:** заменить `ls \| tail -3` на `ls supabase/migrations/0*.sql \| sort \| tail -5`.  
2. **Задача 2:** явный checklist grep-очистки 047 в `docs/schema.md` (не только add `task_dependencies`).  
3. **Migration history:** 049 не помечать `applied` до Cowork (или split status).  
4. *(optional)* Одна строка: «клиент/gen types не трогаем».

---

## Чеклист перед CC

- [ ] Ветка/контекст: `main` @ `4a5eeab` (loop fix уже в дереве)  
- [ ] Создать **только** `supabase/migrations/049_task_dep_created_by_default.sql` — **не** apply  
- [ ] `docs/schema.md`: блок `task_dependencies` + Applied/history 048; зачистка 047 (stage/enum/triggers)  
- [ ] skill `schema.md` — зеркало 047/048/049  
- [ ] skill `learnings.md` — 3 урока (loop, HMR, confirm)  
- [ ] `npx tsc --noEmit && npm run build`  
- [ ] `git add` только `049_…sql` + `docs/schema.md` (skill вне репо)  
- [ ] Коммит как в спринте  
- [ ] Cowork: apply 049 → `column_default` = `auth.uid()` → smoke-insert owner → `created_by` заполнен  

**Итог:** спринт готов к Claude Code as-is; W1–W3 повышают качество docs/разведки, но не блокируют запуск.
