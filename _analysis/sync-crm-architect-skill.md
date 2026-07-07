# Claude Code Prompt — Синхронизация референсов скилла crm-architect

## Контекст

Фаза 1 multi-user завершена: миграции 021–026 применены к живой БД
(ref `uoiavcabxgdjugzryrmj`), это тенанты (organizations/memberships/org_id),
org-scoped RLS, RBAC (current_org_role), владение, командная видимость,
уведомления, приглашения. Референсы скилла `~/.claude/skills/crm-architect/references/`
отстали катастрофически: schema.md описывает миграцию 013 (реальность — 026),
learnings.md не знает ни одной гочи фазы, architecture.md не знает новых хуков.

Скилл — production-инструмент (память проекта для будущих спринтов).
Обновляй дифференциально: сохраняй структуру и стиль файлов, не переписывай
разделы, которые не устарели.

## РАЗВЕДКА

```bash
# Текущее состояние референсов
ls ~/.claude/skills/crm-architect/references/
wc -l ~/.claude/skills/crm-architect/references/*.md
# Репо: актуальный schema-док (уже ведётся из живой БД) и структура
sed -n '1,40p' docs/schema.md
ls src/lib/hooks/ src/components/shared/ src/components/layout/
git log --oneline -25
# Темы: aura появилась вне S23–S26 — проверить состав тем
grep -n "^\.t-" src/app/globals.css | head -20
```

Через Supabase MCP (живая БД — источник истины для схемы):
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;
SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public' GROUP BY 1 ORDER BY 1;
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosecdef ORDER BY 1;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
```

## ЗАДАЧА 1: references/schema.md — полная замена

Правило (навсегда): **schema.md генерится из живой БД, не из папки миграций**
(миграции теряли dashboard_sync, ENUM-типы, hardening-правки). База — репо
`docs/schema.md` (он уже отражает живую БД) + сверка интроспекцией.

Обязательные разделы:
- Header: applied-состояние (001–026 + hardening-миграции 2026-06-14 вне репо),
  дата синхронизации, project ref.
- Полный список таблиц с колонками и реальными типами (ENUM: deal_stage, task_lane,
  task_priority, call_status, activity_type, direction_t, pipeline_entity_t).
  Реальные имена колонок: tasks.text/assigned_to/created_by, projects.owner_id/
  pipeline_id/stage_id/probability/status, БЕЗ user_id (кроме leads/activity_log/
  project_files/dashboard_sync).
- Тенант-модель: org_id NOT NULL на 14 таблицах; глобальные: profiles,
  user_settings, dashboard_sync, pipelines, pipeline_stages; meeting_attendees —
  транзитивно через meetings.
- RLS-модель: шаблон org-конъюнкта, ролевые сеты (owner/admin全 | manager своё |
  viewer read-only), командная видимость leads/activity_log, own-таблицы.
- SECURITY DEFINER функции таблицей: current_org_id, is_org_member,
  current_org_role, shares_org_with, set_org_id, apply_pending_invites,
  protect_last_owner, notify_task_assigned, notify_project_assigned,
  log_delete_* (6), log_stage_change, convert_lead (гард 42501), handle_new_user,
  sync_project_stage — с ACL-паттерном каждой.
- Триггеры по таблицам (trg_set_org_id ×14, notify ×2, protect_last_owner,
  delete-логи, stage-sync).
- FK-конвенция: SET NULL везде кроме junction/owned (CASCADE); converted_* — SET NULL с 025.
- Migration history: 001–026 одной таблицей + пометка про внерепозиторные.

## ЗАДАЧА 2: references/learnings.md — дописать секции фазы 1

Сохрани существующие записи. Добавь (со ссылками на миграции):

**Supabase / RLS:**
- Self-referencing policy на своей же таблице → `infinite recursion detected` (42P17).
  Только SECURITY DEFINER helper (is_org_member) — RLS применяется и к подзапросам
  внутри политик (021).
- Initplan-паттерн: `( SELECT auth.uid() )`, `( SELECT public.current_org_role() )` —
  no-arg STABLE helpers вычисляются один раз, параметризованные — per-row (023).
- Hardening-конвенция для КАЖДОЙ новой функции: `SECURITY DEFINER SET search_path =
  public, pg_temp` + адресный ACL: RLS/RPC-helpers → authenticated+service_role;
  триггерные → только service_role (EXECUTE проверяется при CREATE TRIGGER, не при fire).
- Service-контекст (SQL Editor, MCP, фон): auth.uid() = NULL → current_org_id() = NULL.
  Триггеры обязаны наследовать org_id из OLD/NEW (COALESCE), иначе NOT NULL ловит
  или логи теряются (инцидент S24, фикс 024).
- trg_set_org_id заполняет org_id только при NULL — явное значение переживает.
- CREATE OR REPLACE FUNCTION по живому телу: брать из pg_get_functiondef (включает
  SECURITY DEFINER/search_path), менять минимально. Живое тело ≠ файл миграции в репо
  (convert_lead ссылался на user_id-колонки, которых нет — прод был сломан, фикс 024).
- Volatile-функция с side effects: изменения НЕ видны подзапросам того же statement
  (snapshot). Проверочные SELECT — отдельным запросом.
- projects: NOT NULL direction + pipeline_id — тестовые вставки падают без них.

**Процесс спринтов (контракт фазы 1, работает — сохранить):**
- Миграции ≠ источник истины. РАЗВЕДКА живой БД через Supabase MCP (read-only)
  обязательна перед каждым спринтом с DB-изменениями.
- CC пишет миграции и код, коммитит, НЕ применяет. Гейт Cowork: ревью →
  apply_migration (без BEGIN/COMMIT, атомарно, пишется в history) → smoke
  (симуляция ролей через set_config('request.jwt.claims',...) + SET LOCAL ROLE
  authenticated; чужак = random uuid; tamper = явный чужой org_id) → get_advisors.
- schema.md (docs/ и skill) обновляется тем же заходом, что применение миграции.

## ЗАДАЧА 3: references/architecture.md — дописать

- Хуки: use-org-role, use-team-members, use-notifications, use-invitations
  (+ realtime notifications), обновлённые use-leads/use-tasks (org_id в optimistic).
- Компоненты: AssigneeSelect (shared), NotificationBell (оба хедера),
  TeamSection (Settings, only owner/admin).
- Инвентаризируй сам по git log/файлам фичи вне S23–S26 (aura theme, PeekPanel,
  command palette, keyboard nav, лиды/воронка) — и дополни разделы, где они видны
  в структуре. Не выдумывай: только то, что подтверждается кодом.
- Data Flow: добавь org-слой (membership → current_org_id → RLS) и путь
  уведомления (UPDATE assigned_to → AFTER-триггер → notifications → realtime → колокольчик).

## ЗАДАЧА 4: references/theme-system.md + sprint-example.md — точечно

- theme-system.md: сверь список тем с globals.css (aura?), обнови таблицу тем.
  Правила scandi не трогай, если не менялись.
- sprint-example.md: добавь в конец короткий блок «Контракт DB-спринтов» —
  разведка через Supabase MCP, НЕ применять, гейт Cowork (см. learnings).

## ЗАДАЧА 5: SKILL.md — актуализация шапки

- Project Identity: multi-tenant (organizations/memberships, роли
  owner/admin/manager/viewer), applied 001–026.
- Sprint Prompt Quality Checklist добавить: [ ] org_id/RLS-паттерн соблюдён,
  [ ] новые функции по hardening-конвенции, [ ] разведка живой БД через MCP,
  [ ] миграции не применяются из CC, [ ] schema.md обновлён тем же заходом.
- Строку «Schema version: migration 013» и всё, что противоречит — убрать.

## ПРОВЕРКА

```bash
grep -c "migration 013\|user_id uuid FK → auth.users" ~/.claude/skills/crm-architect/references/schema.md  # 0
grep -c "42P17\|current_org_role\|apply_pending_invites" ~/.claude/skills/crm-architect/references/learnings.md  # ≥3
grep -c "use-org-role\|AssigneeSelect\|NotificationBell" ~/.claude/skills/crm-architect/references/architecture.md  # ≥3
```

## КОММИТ

Скилл вне git-репо проекта (~/.claude/skills/) — если у тебя ~/.claude под git,
закоммить там: `chore(crm-architect): sync references — фаза 1 multi-user (миграции 021–026)`.
Если нет — просто сохрани файлы и покажи краткий summary изменений по каждому.
```
