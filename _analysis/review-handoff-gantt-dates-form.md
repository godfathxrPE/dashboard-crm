# Ревью: handoff-gantt-dates-form (S-GANTT-DATES form v0)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `4ce54d7`, ahead of `origin/main` на 4; schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/handoff-gantt-dates-form.md` — поля `start_date`/`end_date` в TaskModal + Zod + optimistic + файл миграции 046 + regen типов  
**Контекст:** Волна 2 Gantt; миграция 046 (S-GANTT-DATES-1) применена на проде; клиентский слой — коммит `7b3172c`; поверх уже VIEW-1/2, S-DEPS-1, S-CRIT-PATH

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Историческое качество промпта (как handoff до CC) | ✅ Чёткий, с РАЗВЕДКОЙ, exact snippets, гейт-нотами |
| РАЗВЕДКА + реальные пути | ✅ |
| Schema truth (`tasks.start_date`/`end_date`, CHECK 046) | ✅ |
| Типы derived (regen only, entities/database не трогать) | ✅ |
| Zod + setValueAs `'' → null` + optimistic-литерал | ✅ |
| SQL-файл only, не apply из CC | ✅ |
| crm-architect checklist | ✅ |
| **Актуальность для запуска сейчас** | ❌ **Уже реализовано байт-в-байт** |
| Риск повторного запуска в CC | 🟡 noop / ложный «re-do» + риск лишнего `git add -A` |

**Оценка: 9/10** как handoff-спека (дизайн задач и learnings-гейт).  
**Рекомендация: не запускать в Claude Code.** Работа уже в `main` (`7b3172c` — commit message совпадает с блоком КОММИТ handoff). Повторный прогон не даст ценности и может затронуть dirty/untracked `_analysis/*` через `git add -A`.

---

## Статус

| Заход handoff | Статус в репо |
|---------------|---------------|
| ЗАДАЧА 1 — SQL `046_gantt_dates_on_tasks.sql` | ✅ `supabase/migrations/046_gantt_dates_on_tasks.sql` (592 B, SQL = snippet handoff) |
| ЗАДАЧА 2 — regen `supabase.gen.ts` | ✅ `tasks.Row/Insert/Update`: `start_date`/`end_date` (`supabase.gen.ts:1929–1980`) |
| ЗАДАЧА 2 — `docs/schema.md` | ✅ строки 490–491 + crm-architect `schema.md` блок 046 |
| ЗАДАЧА 3 — Zod `taskFormSchema` + refine | ✅ `src/lib/validators/task.ts:14–22` — идентично snippet |
| ЗАДАЧА 4 — TaskModal defaults / reset / UI | ✅ `TaskModal.tsx:60–61, 80–81, 94–95, 242–263` |
| ЗАДАЧА 5 — optimistic `useCreateTask` | ✅ `use-tasks.ts:188–189` |
| ПРОВЕРКА tsc/build (исторически) | ✅ ветка живёт поверх DEPS/CRIT-PATH; типы согласованы |
| Не пушить | ✅ (сейчас tip — другие gantt-коммиты; push отдельной политикой) |

Коммит-источник: **`7b3172c`** — `feat(gantt): даты задачи (start/end) в TaskModal + миграция 046 в репо`.

---

## С чем согласен полностью

### 1. Scope и порядок задач

Правильная декомпозиция: файл миграции (история) → regen типов → Zod → UI → optimistic-литерал. Без Gantt-рендера (это V0/VIEW-*) — граница соблюдена. Дальнейшие handoff (`handoff-gantt-v0`, VIEW-1/2, DEPS) опираются на эти колонки.

### 2. Schema truth (crm-architect `schema.md`)

- **046** _(S-GANTT-DATES-1)_: `tasks` += `start_date` / `end_date` (`date`, nullable) + CHECK `tasks_dates_order_chk` (`end_date ≥ start_date`) — в header applied 042–046 и в теле `tasks`.
- SQL snippet handoff **байт-в-байт** совпадает с файлом в репо.
- `deadline` остаётся `timestamptz`; handoff верно не смешивает типы и оставляет fallback на рендер (заметка про MSK — для V0).

### 3. Типы derived (learnings «аддитивная колонка = только regen»)

- `Task = Database[...]['tasks']['Row'] & {...}` в `entities.ts:10` — derived.
- Handoff: «`entities.ts`/`database.ts` НЕ трогать» — ✅ и так сделано.
- Контраст с hand-authored union `NotificationType` (045) в гейт-нотах — корректен.

### 4. Форма / Zod / empty date (learnings Волна 2)

| Правило handoff | Факт в коде |
|-----------------|-------------|
| `start_date`/`end_date` в schema | `task.ts:14–15` |
| refine `end ≥ start`, path `end_date` | `task.ts:20–22` |
| defaultValues + reset edit/create | `TaskModal.tsx:60–61, 80–81, 94–95` |
| без `.slice` (date, не datetime) | ✅ |
| `setValueAs '' → null` | `TaskModal.tsx:248, 256` |
| optimistic дописать поля | `use-tasks.ts:188–189` |
| CSS-токены (`border-input`, `bg-surface2`, `text-text-*`, `text-red`) | как в существующей модалке |

### 5. Пути architecture.md

| Путь handoff | architecture.md / репо |
|--------------|------------------------|
| `src/components/tasks/TaskModal.tsx` | ✅ |
| `src/lib/validators/task.ts` | ✅ |
| `src/lib/hooks/use-tasks.ts` | ✅ |
| `src/types/supabase.gen.ts` | ✅ |
| `supabase/migrations/…` | ✅ |
| `docs/schema.md` | ✅ (и crm-architect references) |

### 6. crm-architect checklist

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column names (`tasks.start_date`/`end_date`, CHECK name)  
- [x] Реальные file paths  
- [x] learnings: derived types, `''::date`, optimistic-литерал  
- [x] SQL-файл отдельно; **не** `db push` из CC  
- [x] org_id/RLS — не меняются (аддитивные nullable-колонки, покрытие существующими policy)  
- [x] Нет новых SECURITY DEFINER  
- [x] Нет `flowType: 'implicit'`  
- [x] DELETE/CASCADE — N/A  
- [x] CSS variables / theme tokens  
- [x] schema.md обновлён (уже в репо)

---

## Блокеры (для запуска **сейчас**)

### B1. Handoff уже исполнен — повторный прогон бессмысленен / рискован

РАЗВЕДКА **сегодня** даёт противоположные ответы относительно преамбулы handoff:

| Диагностика handoff (ожидание на момент написания) | Факт `main` сейчас |
|----------------------------------------------------|--------------------|
| `grep -i gantt` → «NO 046 FILE» | **`046_gantt_dates_on_tasks.sql`** |
| gen без дат → regen обязателен | gen **с** `start_date`/`end_date` |
| TaskModal только Deadline/remind | блок **«Gantt: план по датам»** уже вставлен |
| Zod только `deadline` | start/end + refine уже есть |
| optimistic без дат | поля уже в литерале |

Исполнение задач 1–5 заново = no-op rewrite или конфликт «создать файл, который есть».  
`git add -A` из блока КОММИТ зацепит посторонние untracked/modified (`_analysis/*`, `.grok/`) — **не делать**.

**Действие:** закрыть handoff как done; следующий Gantt-трек — уже post-DATES (VIEW/DEPS/CRIT-PATH в репо).

---

## Предупреждения (исторические / гигиена; не для re-run)

### W1. Паттерн имени миграции в handoff слегка вводит в заблуждение

Handoff: «если timestamp-префикс — `20260715192639_046_gantt_dates_on_tasks.sql`».  
Факт паттерна 040–049 (и фактический файл): **`046_gantt_dates_on_tasks.sql`** без полного timestamp (timestamp только у `20260712230000_baseline.sql`).  
В репо сделано правильно. Если бы CC следовал ветке «timestamp», получился бы дубль-файл рядом с `046_…`.

### W2. `deadline` input без `setValueAs`

Handoff чинит empty-string только для `start_date`/`end_date`.  
`deadline` (`datetime-local`, `TaskModal.tsx:236–238`) по-прежнему без коэрсии `'' → null` — **pre-existing**, не scope DATES; при желании — отдельный microfix.

### W3. Преамбула handoff устарела как «что делать»

Текст всё ещё звучит как executable sprint («создать», «добавить», «regen»). Для архива/CC-очереди стоит пометить **DONE `7b3172c`** (как в review gantt-v0), чтобы watcher/человек не отправил в CC повторно.

### W4. Заметка MSK про fallback `deadline::date`

Корректна и согласуется с learnings (`mskDateKey`, Europe/Moscow). Относится к **V0-рендеру**, не к form-спринту — в form-коде ничего не ломает. Live: `use-project-schedule.ts` / Gantt уже post-V0.

---

## Пропущенные места

Нет gaps относительно scope handoff. Дополнительно (вне scope, уже в репо post-DATES):

| Файл | Что есть сверх handoff |
|------|------------------------|
| `use-tasks.ts` ~304+ | `useUpdateTaskDates` (drag VIEW-2) |
| `use-project-schedule.ts` | `effectiveSpan` из start/end/deadline |
| `GanttTimeline.tsx` | bars, drag, deps, critical path |

---

## Предлагаемые правки в спринт

1. **Не править для запуска** — запуск не нужен.  
2. Опционально (архив): в шапку handoff добавить  
   `> STATUS: DONE · 7b3172c · 2026-07-15/16 — не запускать в CC`.  
3. При будущем «создать migration file for already-applied DDL»: фиксировать паттерн имени **после** `ls` (здесь `NNN_slug.sql`, не baseline-timestamp), и шаг «if file exists → skip».

---

## Чеклист перед CC

- [x] РАЗВЕДКА прогнана против live-репо  
- [x] 046 SQL в репо и совпадает со snippet  
- [x] gen types содержат start/end  
- [x] Zod + TaskModal + optimistic на месте  
- [x] docs/schema.md + crm-architect schema отражают 046  
- [x] entities/database не hand-edited  
- [ ] ~~Запускать в Claude Code~~ — **нет**  
- [ ] Не коммитить / не `git add -A` «ради этого handoff»

**Итог:** handoff качественный и был правильным executable-промптом; **сейчас это архив выполненной работы**, не backlog.
