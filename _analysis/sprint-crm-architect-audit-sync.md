# Claude Code Prompt — АУДИТ-СИНК скилла `crm-architect` (schema.md: дыры 039–065)

**Закрыть отставание `references/schema.md` одним заходом. Факты ниже — authoritative из живой БД (Cowork MCP @ прод `uoiavcabxgdjugzryrmj`, миграции по 067). Только документация скилла, кода/БД НЕ трогать.**

> Контекст: schema.md отставал — не задокументированы 039–065 (066/067 уже внесены прошлым синком). **Правило вставки:** для КАЖДОГО объекта ниже сначала `grep` в schema.md — если уже есть (маковская новее облачной: `task_dependencies`, возможно часть — на месте), НЕ дублируй, только дополни недостающее. Блоки — готовые, сверены по БД.

## РАЗВЕДКА
```bash
cd ~/.claude/skills/crm-architect
for k in "### quotes" "### task_dependencies" "### delivery_templates" "is_project_member" "projects_select_member" "project_files.*comment\|comment" "role = ANY" "storage.objects\|project-files" "conditions\|trigger_type" "check_delivery_completion" "accept_invitation" "complete_onboarding"; do
  echo "[$(grep -icE "$k" references/schema.md)] $k"
done
grep -nE "^### С S|^### .*applied" references/schema.md | tail -20   # где обрывается RLS-хронология
```

---

## ЗАДАЧА 1 — Недостающие таблицы (вставить, если грепа нет)

### quotes _(053, S-QUOTE-1)_
```markdown
### quotes _(053, S-QUOTE-1)_ — КП на сделке (`type='client'`)
Колонки: id, org_id (NOT NULL, FK org CASCADE, set_org_id), project_id (NOT NULL, FK projects CASCADE), status (`quote_status` enum: draft/sent/accepted/rejected/expired, default draft), amount (bigint КОПЕЙКИ, CHECK null or >=0; accepted → projects.budget=amount), currency (default 'RUB'), document_url, notes, valid_until (date), sent_at/accepted_at (стемпит trg_zz_stamp_quote_status), created_by (FK profiles SET NULL, default auth.uid()), created_at/updated_at.
Индексы: (org_id),(project_id),(status), partial-uniq `quotes_one_accepted_per_project (project_id) WHERE status='accepted'`. Триггеры: trg_set_org_id, set_updated_at, trg_zz_stamp_quote_status.
RLS (паттерн 048): SELECT org-wide; INSERT/UPDATE/DELETE = org AND role in (owner,admin,manager). viewer read-only. Hard-delete CASCADE. UI-гейт canEditQuotes.
```

### task_dependencies _(048/049, S-DEPS-1)_ — рёбра DAG Gantt-зависимостей
```markdown
### task_dependencies _(048, +049 created_by default)_ — рёбра DAG между задачами (FS v1)
Колонки: id, org_id (set_org_id), predecessor_id/successor_id (FK tasks CASCADE), dep_type (text, FS/SS/FF/SF — v1 FS), lag_days (int), created_by (default auth.uid(), 049), created_at. Uniq(pred,succ), no-self. Валидатор `check_task_dependency_valid` (trg_zz): self→23514, not-found→23503, cross-org→42501 (NULL-safe), cross-project→23514, цикл (recursive CTE)→P0001.
RLS: SELECT org-wide; INSERT/DELETE org + role(owner/admin/manager); **UPDATE — 062** (тот же гейт). Hard delete (junction).
```

### delivery_templates / _phases / _tasks _(036, Delivery-P2a)_ — шаблоны фазовой доски
```markdown
### delivery_templates / delivery_template_phases / delivery_template_tasks _(036)_ — шаблоны внедрения
- delivery_templates: id, org_id, direction (enum), kind (text), name, is_active, created_at/updated_at.
- delivery_template_phases: id, org_id, template_id (FK), name, position.
- delivery_template_tasks: id, org_id, template_id, phase_id (FK), wbs_code, title, default_enabled, is_milestone, sort_order.
Применяет RPC `apply_delivery_template(p_project_id, p_template_id)` / `spawn_delivery_project` → создаёт project_columns (фазы) + tasks (`lane='next'`). RLS: org-scoped read; write owner/admin. Индексы org_id/template_id/phase_id.
```

---

## ЗАДАЧА 2 — Изменения существующих таблиц (дополнить строки колонок)

- **project_files** += `comment` (text, nullable, **064** S-PROJECT-WORKSPACE-1 — коммент при загрузке файла).
- **project_members.role** — расширить CHECK до **8 проектных ролей (063)**: `pm, manager, analyst, architect, developer, implementer, installer, launch_lead` (аддитивный CHECK-суперсет; UI фильтрует по типу проекта ERP/IIoT/internal). project_members = (id, org_id, project_id, profile_id, role, created_at).
- **automation_rules / automation_runs** — **обобщены в 050 (S-WF-2A)**: automation_rules = (id, org_id, name, trigger_type, trigger_config jsonb, action_type, action_config jsonb, is_active, conditions jsonb, created_at); automation_runs = (id, rule_id, org_id, project_id, stage_id, task_id, fired_at, trigger_key). +051 task_overdue trigger_type. (Заголовок секции 029 → «029, обобщены 050, +051».)
- **profiles** += `job_title`, `onboarded_at` (**061 onboarding**), `phone` (если нет).
- **tasks** — подтвердить, что уже есть (прошлый синк): is_milestone (038), wbs_code/parent_task_id (052), start_date/end_date (046), lane предупреждение 'next'.

---

## ЗАДАЧА 3 — Team-visibility 065 (КРИТИЧНО — отсутствует) + storage 055

### RLS-helper is_project_member (065)
```markdown
### is_project_member _(065, team-visibility)_ — helper видимости команды
`is_project_member(p_project_id uuid) → bool` — SQL STABLE SECURITY DEFINER, search_path public/pg_temp; `EXISTS project_members WHERE project_id=p AND profile_id=auth.uid()`. GRANT authenticated+service_role.
```

### Team-visibility SELECT-политики (065)
```markdown
### С S-TEAM-VISIBILITY-1 (065, applied) — рядовой участник видит проект/доску/файлы
Аддитивные SELECT-политики (permissive, OR к базовым): `projects_select_member` (org AND is_project_member(id)), `tasks_select_member` (org AND is_project_member(project_id)), `project_files_select_member` (org AND is_project_member(project_id)). Базовые (owner/admin OR ownership) не тронуты. Смок JWT: участник proj 0→1, tasks 0→40; посторонний 0/0/0. Fast-follow: storage download по membership (VISIBILITY-2, открыт).
```

### Storage project-files (055)
```markdown
### storage.objects — bucket `project-files` _(055)_
Приватный bucket. Политики own-path: SELECT/DELETE `bucket_id='project-files' AND (storage.foldername(name))[1] = auth.uid()::text` (путь `{uid}/{projectId}/…`); INSERT with_check own-path. **Команда чужой файл пока не скачивает** (VISIBILITY-2 — открытый fast-follow: storage SELECT по is_project_member((foldername)[2])).
```

---

## ЗАДАЧА 4 — RLS-хронология + функции (дописать в конец разделов)
RLS-раздел обрывается на 038. Добавить краткие пометки применённых миграций (по одной строке, факт «что сделала»):
```
- 039 reorder_tasks (RPC + sort_order). 040 rls_hardening. 042 activity_log entity-links (contact_id/company_id +042). 043 won_reason. 044/044b spawn_delivery_owner. 045 notify_deal_won.
- 047 DROP legacy projects.stage (+ триггеры on_stage_change). 048/049 task_dependencies. 050 workflow-engine (обобщение automation). 051 task_overdue.
- 052 task WBS (wbs_code/parent_task_id). 053 quotes. 054 rls_update_with_check (WITH CHECK на UPDATE-политики). 055 storage project-files. 056/056b revoke_anon defaults + trigger-fn execute. 057 backfill_datetime_tz.
- 058 accept_invitation (RPC jsonb). 059 membership_role_guard (protect_last_owner — нельзя убрать последнего owner). 061 onboarding (complete_onboarding + profiles.job_title/onboarded_at). 062 task_dep UPDATE-policy. 063 project_member 8 ролей. 064 project_files.comment. 065 team_visibility. 066 project_videos. 067 project_messages.
```
В RLS-helpers добавить сигнатуры: `accept_invitation(p_token uuid)→jsonb` (058, DEFINER), `complete_onboarding(full_name,phone,job_title)→void` (061), `protect_last_owner()→trigger` (059), `check_delivery_completion(p_project_id)→jsonb` (038), `is_project_member(p_project_id)→bool` (065).

---

## ВЕРИФИКАЦИЯ
```bash
cd ~/.claude/skills/crm-architect
for k in quotes task_dependencies delivery_templates is_project_member projects_select_member "project-files" "role = ANY\|8 ролей\|launch_lead" comment; do
  echo "[$(grep -icE "$k" references/schema.md)] $k"
done
grep -cE "06[0-7]|05[0-9]|04[0-9]" references/schema.md   # хронология 039–067 покрыта
```
Каталог скилла не под git (по прошлому синку) — коммит не нужен. Чистое обновление памяти проекта. Если якорь блока уже есть в маковской (task_dependencies и пр.) — только дополни отсутствующие детали, не плоди дубли.
