# Claude Code Prompt — S-DEPS-1 POLISH: created_by default + docs/schema дельта 047/048

> **Скоуп сжат осознанно.** Из первоначального полиша **убрано** `window.confirm → кастомный confirm`: в проекте `window.confirm`/`confirm()` — **сложившаяся конвенция (25+ сайтов**: calls/tasks/leads/projects/contacts/meetings/companies), кастомного `ConfirmDialog` нет. Точечная замена только в Гантте сделала бы одно место непоследовательным. Это отдельный app-wide UX-эпик (`useConfirm` + миграция всех сайтов), НЕ полиш S-DEPS-1. Здесь — только реально полезное: default для `created_by` + дока схемы.

Стек незыблем. Прод ref `uoiavcabxgdjugzryrmj`. Applied по 048.

---

## ЗАДАЧА 1 — Миграция `049_task_dep_created_by_default` (пишешь файл, НЕ применяешь)

### WHY
Ребро `task_dependencies` пишется хуком без `created_by` (колонка nullable, без DEFAULT) → всегда NULL, «кто связал» теряется. Конвенция проекта (`transcripts`/`ai_runs`) — `created_by … DEFAULT auth.uid()`. Приводим к ней: аудит связей без правки клиента.

### РАЗВЕДКА
```bash
ls supabase/migrations/ | tail -3          # 048 — последний файл; создаёшь 049
grep -n "created_by" supabase/migrations/048_task_dependencies.sql
```

### Файл `supabase/migrations/049_task_dep_created_by_default.sql`
```sql
-- 049: created_by у task_dependencies — DEFAULT auth.uid() (аудит «кто связал»)
-- auth.uid() под authenticated → id автора; под service/MCP (null) → NULL (ок, nullable).
alter table public.task_dependencies
  alter column created_by set default auth.uid();
```
> Клиентский хук НЕ меняем — insert без `created_by` теперь получит `auth.uid()` из DEFAULT. RLS insert-политику НЕ трогаем (она `created_by` не проверяет). Обратная совместимость: старые NULL-строки остаются NULL (их нет — таблица создана в этом спринте).

**НЕ применяй** — применит гейт Cowork через Supabase MCP.

---

## ЗАДАЧА 2 — `docs/schema.md`: дельты 047 + 048 (отдельный docs-коммит)

В тело `docs/schema.md` перенести две висящие дельты (сейчас есть только в handoff'ах):

**047 (B2 DROP legacy stage, applied via MCP, файла миграции нет):**
- Снесены: колонка `projects.stage` (индекс `idx_projects_stage` каскадом), тип `deal_stage`, триггеры `on_stage_change`+`log_stage_change`, `trg_ab_null_internal_stage`+`null_internal_stage`.
- **Backlog остаётся:** файла `047_*.sql` в репо нет (применялось MCP) — при желании восстановить реконструкцией из живого DDL; `stage_change`-события больше не пишутся (историч. лента — через `LEGACY_STAGE_LABELS`).

**048 (task_dependencies):** добавить в раздел «Таблицы»:
```
task_dependencies (048) — рёбра DAG между задачами (Gantt-зависимости, FS v1)
| id            | uuid PK | gen_random_uuid() |
| org_id        | uuid    | NOT NULL → organizations CASCADE (trg_set_org_id) |
| predecessor_id| uuid    | NOT NULL → tasks CASCADE |
| successor_id  | uuid    | NOT NULL → tasks CASCADE |
| dep_type      | text    | CHECK FS/SS/FF/SF, DEFAULT 'FS' (v1 — только FS) |
| lag_days      | int     | NOT NULL DEFAULT 0 (задел) |
| created_by    | uuid    | → profiles SET NULL; DEFAULT auth.uid() (049) |
| created_at    | timestamptz | DEFAULT now() |
Constraints: task_dep_no_self (pred<>succ), task_dep_uniq (pred,succ). Индексы: org, successor, predecessor.
Триггеры: trg_set_org_id; trg_zz_check_task_dependency → check_task_dependency_valid()
  (self→23514, task-not-found→23503, cross-org→42501 [B1 NULL-safe org-гард], cross-project→23514, цикл recursive CTE→P0001).
RLS: select org-wide (current_org_id); insert/delete org + role owner/admin/manager; no UPDATE (ребро иммутабельно). grant select/insert/delete authenticated, revoke anon.
```
Обнови «Migration history»: `048_task_dependencies`, `049_task_dep_created_by_default` (applied). Отметь: DAG-инвариант держит триггер (граф ацикличен by construction).

---

## ЗАДАЧА 3 — Скилл `~/.claude/skills/crm-architect/references/` (мосту недоступен → только CC)

**`references/schema.md`** — те же дельты 047/048/049, что в Задаче 2 (шапка «Applied» → до 049; раздел tasks-соседний блок `task_dependencies`).

**`references/learnings.md`** — добавить 2 урока (S-DEPS-1):
```
### ❌ Эффект с DOM-измерением + setState → рантайм-луп (tsc/build НЕ ловят)
useLayoutEffect, который меряет DOM (getBoundingClientRect) и делает setState(новый объект)
каждый прогон, + нестабильные deps (напр. filteredSwimlanes — новый ref каждый рендер) →
«Maximum update depth exceeded». tsc/build зелёные — ловится ТОЛЬКО рантайм-смоком.
Fix: (1) дедуп setState — функц. апдейт, возвращающий prev при идентичном результате
(React бейлит); (2) стабильная сигнатура в deps (строка depSig вместо объекта).
Поймано Chrome-смоком S-DEPS-1 (0463596 → фикс 4a5eeab). УРОК: Gantt/DOM-measure фичи —
обязателен рантайм-смок, не только tsc/build.

### ⚠️ Серия HMR-правок бьёт .next dev-cache
После нескольких быстрых правок dev-сервер может словить
«Cannot find module './vendor-chunks/*.js'» / «__webpack_modules__[id] is not a function».
Это не баг кода — рассинхрон .next. Fix: rm -rf .next && npm run dev. При странных
webpack/module-ошибках на dev — первым делом чистый ребилд, не диагностика кода.

### ℹ️ window.confirm — конвенция проекта (25+ сайтов), не дефект
Удаление везде через window.confirm/confirm() (нет кастомного ConfirmDialog). Замена на
кастомный confirm — отдельный app-wide эпик (useConfirm + миграция всех сайтов), не точечно.
```

---

## ГЕЙТЫ CC
```bash
npx tsc --noEmit && npm run build     # 049 — чистый DDL, кода не трогает; должно быть 0/0
git diff --stat                       # миграция 049 + docs/schema.md + (skill вне репо — отдельно)
```
Скилл (`~/.claude/skills/...`) вне git-репо — коммить только репо-файлы; скилл правится на месте.

## КОММИТ
```bash
git add supabase/migrations/049_task_dep_created_by_default.sql docs/schema.md
git commit -m "chore(gantt): S-DEPS-1 polish — created_by default (049) + docs/schema дельта 047/048"
```

## ПОСЛЕ ТЕБЯ — Cowork
apply_migration 049; проверка: `select column_default from information_schema.columns where table_name='task_dependencies' and column_name='created_by'` = `auth.uid()`; smoke-insert под owner → created_by заполнен; restore.

## VERIFICATION
```
Type Safety:            PASS (049 — DDL, типы не трогает)
RLS Coverage:           PASS (политики не меняются)
Backward Compatibility: PASS (только DEFAULT; существующие строки не затронуты)
Runtime Tested:         NOT_VERIFIED (apply+smoke — Cowork)
```
