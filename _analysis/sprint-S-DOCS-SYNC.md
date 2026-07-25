# Claude Code Prompt — S-DOCS-SYNC: дельта схемы 047–050 (docs/schema.md + skill)

> **Docs-only, кода нет.** Закрываем висящий долг: `docs/schema.md` (репо) + `~/.claude/skills/crm-architect/references/schema.md` и `learnings.md` (скилл, вне репо) отстали от живой БД на 4 миграции. Все факты ниже — из applied-состояния прода (Cowork верифицировал через MCP). **Ничего не выдумывай — вставляй как есть, вписывая в существующую структуру доков.**
>
> Applied в проде (ref `uoiavcabxgdjugzryrmj`, подтверждено `list_migrations`): цепочка **001–050**. 047 применён через MCP (файла в репо нет). 048/049/050 — файлы в репо.

## РАЗВЕДКА
```bash
grep -n "Applied\|applied\|001–0\|Migration history\|task_dependencies\|automation_runs" docs/schema.md | head
ls ~/.claude/skills/crm-architect/references/    # schema.md, learnings.md на месте?
```
Найди в `docs/schema.md`: строку «Applied», раздел «Таблицы», «Migration history» (или их аналоги). Вставляй дельты туда.

---

## ЗАДАЧА 1 — `docs/schema.md` (репо)

### 1.1 Заголовок «Applied»
Обнови до **001–050** (было ≤046/048). Пометь: 047 — applied via MCP, файла нет; 048/049/050 — файлы в репо.

### 1.2 Дельта 047 (DROP legacy stage — applied via MCP, файла нет)
```
047 (S-LEGACY-STAGE-1 B2, applied via MCP 2026-07-16 — файла в репо НЕТ):
DROP колонки projects.stage (индекс idx_projects_stage каскадом), тип deal_stage,
триггеры on_stage_change+log_stage_change, trg_ab_null_internal_stage+null_internal_stage.
stage_change-события больше НЕ пишутся (историч. лента — через LEGACY_STAGE_LABELS в коде).
Backlog: восстановить 047_*.sql реконструкцией из живого DDL по желанию.
```
Также в разделе «Таблицы» у **projects** пометь `stage` / enum `deal_stage` как **DROPped в 047** (были ошибочно живыми в доке).

### 1.3 Дельта 048 — таблица task_dependencies (в раздел «Таблицы»)
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
RLS: select org-wide (current_org_id); insert/delete org + role owner/admin/manager; NO UPDATE (ребро иммутабельно).
grant select/insert/delete authenticated, revoke anon. hard-delete (junction, как contact_company). DAG-инвариант by construction.
```

### 1.4 Дельта 049
```
049 (S-DEPS-1 polish, applied): task_dependencies.created_by SET DEFAULT auth.uid() — аудит «кто связал».
```

### 1.5 Дельта 050 — Workflow Engine (обобщение S29)
```
050 (S-WF-2A, applied): обобщение automation-движка.
- automation_rules: CHECK trigger_type → stage_entered|status_changed|field_changed;
  action_type → create_task|notify|create_activity|set_field; +conditions jsonb NOT NULL DEFAULT '[]'
  (массив AND-предикатов {field,op,value}, ops eq/neq/gt/lt/gte/lte/contains/is_null/not_null).
- automation_runs: +trigger_key text (идемпотентность обобщена со stage_id); stage_id → nullable;
  unique (rule_id,project_id,stage_id) → (rule_id,project_id,trigger_key).
- notifications_type_check += 'automation'.
- wf_eval_conditions(jsonb,jsonb) — IMMUTABLE, non-DEFINER, fail-closed; grant authenticated+service_role.
- run_stage_automations() обобщён (то же имя/триггер trg_zz_run_automations, DEFINER/search_path сохранены):
  re-entrancy guard wf.ran (set_field не зацикливает; v1 — один проход на txn) → матч 3 триггеров + trigger_key
  (COALESCE '__null__' sentinel) → conditions → идемпотентный run (ON CONFLICT trigger_key) → 4 действия
  → activity_log 'automation_fired'; двойной EXCEPTION-swallow + per-rule subtxn изоляция.
  ACL: revoke public/anon/authenticated, grant service_role. set_field whitelist: next_step/pinned_note/
  next_action_date/probability (НИКОГДА stage_id/status/type/org_id).
```
Обнови «Migration history»: 048/049/050 applied; 047 applied-via-MCP-no-file.

---

## ЗАДАЧА 2 — skill `~/.claude/skills/crm-architect/references/schema.md` (вне репо)
Те же дельты 047/048/049/050, что в Задаче 1, в стиле этого файла. **Фикс шапки:** сейчас «applied 001–048, 049 pending» — исправь на **applied 001–050** (049 и 050 применены Cowork'ом). Раздел tasks-соседний — добавь блок `task_dependencies`; automation-раздел (S29) — допиши обобщение 050.

## ЗАДАЧА 3 — skill `~/.claude/skills/crm-architect/references/learnings.md` (вне репо)
Добавь уроки Волны-2 (если ещё нет):
```
### ❌ Эффект с DOM-измерением + setState → рантайм-луп (tsc/build НЕ ловят)
useLayoutEffect, меряющий DOM (getBoundingClientRect) + setState(новый объект) каждый прогон + нестабильные
deps (напр. filteredSwimlanes) → «Maximum update depth exceeded». Ловится ТОЛЬКО рантайм-смоком.
Fix: (1) дедуп setState (функц. апдейт → prev при идентичном); (2) стабильная строка-сигнатура в deps.
(S-DEPS-1 0463596→фикс 4a5eeab; S-CRIT-PATH переиспользовал приём.)

### ⚠️ Серия HMR-правок бьёт .next dev-cache
«Cannot find module './vendor-chunks/*'» / «__webpack_modules__[id] is not a function» — не баг кода,
рассинхрон .next. Fix: rm -rf .next && npm run dev. Build при живом dev — изолированный distDir (env), конфиг откатить.

### ❌ SECURITY DEFINER + сравнение с current_org_id/role — только NULL-safe (обновление PCT-1)
S-DEPS-1 B1: DEFINER-валидатор читает tasks в обход RLS → обе задачи обязаны = current_org_id вызывающего,
под auth.uid() IS NOT NULL, NULL-safe. Иначе cross-tenant ребро по известным UUID.

### ℹ️ Триггер-функции: authenticated=X авто-грантится Supabase default privileges
revoke public/anon НЕ снимает authenticated. 0029-advisor шумит на всех definer-функциях. Trigger-returning
функции не вызываются напрямую (Postgres запрещает) → не эксплойт. Чтобы убрать из 0029 — revoke execute
FROM authenticated явно (как в run_stage_automations 050; check_task_dependency_valid 048 — оставлен с authenticated=X, как notify_deal_won).

### ℹ️ window.confirm — конвенция проекта (25+ сайтов)
Удаление везде через window.confirm/confirm(); кастомного ConfirmDialog нет. Замена — отдельный app-wide
useConfirm-эпик, не точечно.

### ✅ Ролевой смок через транзакцию + rollback
set_config('request.jwt.claims',...) + SET LOCAL ROLE authenticated + вставки/апдейты + верификация → ROLLBACK.
Для триггер-движков (S-WF-2A): правила и side-effects проверяются в одной txn без порчи данных.
```

## ГЕЙТЫ CC
```bash
git diff --stat        # только docs/schema.md (скилл вне репо — не в коммите)
```
(кода нет → tsc/build не нужны)

## КОММИТ
```bash
git add docs/schema.md
git commit -m "docs(schema): дельта 047–050 (legacy-stage DROP, task_dependencies, created_by default, workflow engine)"
```
Скилл (`~/.claude/skills/...`) — вне git-репо, правится на месте, в коммит НЕ входит.

## VERIFICATION
```
Backward Compatibility: PASS (docs-only)
Accuracy:               NOT_VERIFIED (Cowork сверит блоки со схемой на желании; факты из applied-прода)
```
