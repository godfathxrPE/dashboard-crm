# S-DOCS-SCHEMA-SYNC — довести `docs/schema.md` до 075

**Ветка:** `chore/docs-schema-sync` от `main`. Кода не касаемся вообще, миграций нет.
Один коммит.

**Трудоёмкость: ~2–3 ч. Риск нулевой (только docs).**

## Зачем это первым

`docs/schema.md` объявлен «schema truth» в архитектуре R2, но **ledger миграций
заканчивается на 061**. Проверено грепом по номерам: `069`, `070`, `072`, `074`, `075` —
**ноль упоминаний**; `062`–`065`, `068` — тоже ноль; таблиц `recurring_task_templates`,
`project_baselines`, `baseline_tasks` в документе **нет как сущностей**. То есть вся волна
Ганта и половина волны W/T прошли мимо документа, хотя конвенция требует «schema.md тем же
PR, что миграция».

Спринты R2 будут читать этот файл. Пока он врёт умолчанием — каждый следующий спринт
начинается с повторной разведки по миграциям вручную.

## РАЗВЕДКА — выполнить целиком до первой правки

```bash
git branch --show-current                  # chore/docs-schema-sync
git status --short                         # чисто

ls supabase/migrations/                    # ожидание: до 075 + baseline + archive
for m in 062 063 064 065 066 067 068 069 070 071 072 073 074 075; do \
  printf "%s:%s " $m $(grep -c "\b$m\b" docs/schema.md); done; echo
grep -n "lag_days" docs/schema.md
grep -n "^## " docs/schema.md              # карта разделов — куда вставлять
grep -rn "cron.schedule" supabase/migrations/*.sql
```

**STOP-условия:**

1. Счётчики показывают, что 069/070/072/074/075 **уже** описаны → предпосылка спринта
   неверна, сказать и остановиться.
2. `git status` грязный.
3. В `supabase/migrations/` появились файлы **после 075** → сначала уточнить у Олега,
   входят ли они в скоуп.

## Работы

**Источник истины — файлы `supabase/migrations/0NN_*.sql` плюс живая БД через Supabase MCP
(read-only: `list_migrations`, `list_tables`, `execute_sql` по `information_schema` /
`pg_policies` / `pg_get_functiondef`).** Не пересказывать чужие handoff'ы — читать DDL.

### 1. Ledger 062–075

Дописать блок в том же формате, что существующие («**0NN** _(name, sprint)_ — что сделано,
ключевые constraints/триггеры/ACL, осознанные отклонения»). Обязательно отразить:

- **062** task_dep_update_policy — UPDATE-политика на `task_dependencies`; **DAG-валидатор
  048 стоит только на BEFORE INSERT** → концы ребра через UPDATE менять нельзя (это уже
  зафиксировано в комментарии хука, в схеме — нет).
- **063** project_member_roles_expand · **064** project_files_comment · **065**
  team_visibility (политика `tasks_select_member` через `is_project_member` — важно, её
  зеркалят RPC аналитики) · **066** project_videos · **067** project_messages ·
  **068** message_reactions.
- **069** recurring_tasks — таблица `recurring_task_templates` (`cadence` CHECK
  `daily`/`weekdays`/`weekly`/`monthly`, `next_run_date`, `is_active`, `created_by` DEFAULT
  `auth.uid()`), триггеры `trg_set_org_id` + `trg_aa_freeze_org_id` + `trg_set_updated_at`,
  RLS `rtt_*`, **pg_cron `recurring-daily` `5 6 * * *` → `spawn_recurring_tasks()`**
  (один открытый инстанс за раз).
- **070** task_scheduling_a1 — `tasks += scheduled_start / scheduled_end` (timestamptz,
  nullable) + `tasks_scheduled_order_chk`, индексы `idx_tasks_scheduled` /
  `idx_tasks_assignee_scheduled`; `recurring_task_templates` += время/длительность
  (`rtt_duration_pos_chk`, `rtt_duration_needs_time_chk`). **Ось «когда делаю» отдельна от
  `deadline` «сделать к»** — записать явно, это семантика, а не просто колонки.
- **071** meeting_attendee_visibility.
- **072** task_analytics — `tasks.completed_at` + триггер `trg_stamp_completed_at`
  (стемп на входе в done, очистка на реоткрытии), индекс `idx_tasks_org_completed`,
  RPC `task_analytics_summary(date,date)` / `task_throughput_series(date,date)` /
  `task_aging_buckets()`. **Ключевое:** RPC — DEFINER, обходят RLS, поэтому предикат
  видимости внутри собран вручную как зеркало `tasks_select` (baseline) OR
  `tasks_select_member` (065). Любая правка политик `tasks` требует правки RPC.
- **073** fix_spawn_delivery_project_stage — прод-баг: функция перечисляла колонку
  `stage`, снятую в 047 → «Создать внедрение» падало всегда. Записать как урок дрейфа
  DEFINER-функций после DROP колонки.
- **074** project_baselines — `project_baselines` + `baseline_tasks`, слепок **иммутабелен**
  (UPDATE-политик нет, переснять = новый baseline; `updated_at` сознательно отсутствует),
  запись только через RPC `create_project_baseline`, hard delete.
- **075** baseline_grants_narrow — **урок в общий раздел конвенций:** дефолтные привилегии
  Supabase дают `authenticated` ВСЕ права на новую таблицу в `public`, поэтому
  `grant select, delete` в 074 ничего не сузил; нужен явный `revoke insert, update,
  truncate, references, trigger`. Это касается каждой новой таблицы R2.

### 2. Разделы тела

- Новые разделы: `recurring_task_templates`, `project_baselines`, `baseline_tasks`
  (по формату существующих: таблица колонок + RLS + индексы + заметки).
- `tasks`: дописать `scheduled_start` / `scheduled_end` / `completed_at`.
- В сводку функций/триггеров: `spawn_recurring_tasks`, `stamp_task_completed_at`,
  `create_project_baseline`, три RPC аналитики.
- Раздел про cron: два задания — `wf-overdue-daily` (`0 6 * * *`, 051) и `recurring-daily`
  (`5 6 * * *`, 069).

### 3. Фикс неверной заметки

`docs/schema.md` про `task_dependencies.lag_days`: «`NOT NULL DEFAULT 0` (задел под
lag/critical path)» — **устарело**. Актуально: UI пишет и `lag_days`, и `dep_type`
(`use-task-dependencies.ts` → `updateDependency`); реализованы все четыре типа FS/SS/FF/SF,
каскадный сдвиг и CPM с критпутём (`src/lib/utils/gantt-schedule.ts`). Связи **не** enforced
в БД — это UX-слой над пользовательскими датами.

### 4. Шапка

Строку «Applied … миграции 001–061» привести к «001–075» с оговорками: 047 в
`schema_migrations` без файла, **060 зарезервирована и не занята** (идти вперёд, не
возвращаться), следующая свободная — 076.

## VERIFY / коммит

```bash
for m in 062 063 064 065 066 067 068 069 070 071 072 073 074 075; do \
  printf "%s:%s " $m $(grep -c "\b$m\b" docs/schema.md); done; echo   # все > 0
grep -c "recurring_task_templates\|project_baselines\|baseline_tasks" docs/schema.md
grep -n "001–075\|001-075" docs/schema.md
git --no-pager diff --stat            # ТОЛЬКО docs/schema.md, ни одного файла из src/
```

Коммит один:

```
chore(docs): schema.md доведён до 075 (ledger 062–075, baseline/recurring/scheduling)
```

**Не пушить.** В отчёте — явно: какие блоки дописаны, что взято из живой БД против файлов
миграций, и есть ли расхождения между `supabase/migrations/` и продом (если да — списком,
это отдельный хвост).

## Хвост после спринта

Копия схемы в скилле (`~/.claude/skills/crm-architect/references/schema.md`) синхронизируется
Олегом отдельно — в SKILL.md уже стоит предупреждение, что ledger там оканчивается на 061.
