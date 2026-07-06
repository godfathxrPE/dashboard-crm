# Database Schema — dashboard-crm

> **Applied (в живой БД, ref `uoiavcabxgdjugzryrmj`):** миграции 001–026. Фаза 1 multi-user
> завершена: S23 мультитенантность (021/022), S24 org-scoped RLS (023), S25 командная
> видимость + hardening (024), S26 notifications + invitations + write-политики memberships
> (025/026 применены 2026-07-06, гейт пройден: FK SET NULL работает, инвайт-цикл
> идемпотентен, expiry соблюдается, notify-триггеры срабатывают, last-owner guard → 42501).
>
> **Pending:** **027** _(S27)_ — стадийные гейты (Blueprint v1): таблица
> `stage_requirements` (org-scoped конфиг), `check_stage_requirements()` +
> enforcement-триггер `trg_aa_enforce_stage_gate`. Написана и закоммичена, ждёт
> гейта Cowork (apply_migration → smoke → advisors). Флип pending→applied после гейта.
>
> Собрано интроспекцией живой БД + `supabase/migrations`; актуально на 2026-07-06.

## Тенант-модель _(applied S23)_

С миграций 021–022 введена мультитенантность (в живой БД с 2026-07-05):

- **`organizations`** — корень тенанта.
- **`memberships`** — связь профиль ↔ организация с org-scoped ролью
  (`owner`/`admin`/`manager`/`viewer`) — **единственный источник ролей**.
  Глобальная `profiles.role` и функция `user_role()` **удалены** миграцией
  024 _(applied S25)_; роли живут только в memberships.
- **`org_id`** добавлен во все tenant-таблицы. Заполняется автоматически
  BEFORE INSERT триггером `set_org_id()` → `current_org_id()`, поэтому
  клиентский код (хуки) не передаёт `org_id` явно.
- RLS-политики стали **org-scoped** с 023 _(applied S24)_ — перевод старой
  ролевой семантики 1:1 на org-модель (см. раздел «RLS-модель»).

| Класс | Таблицы |
|-------|---------|
| **Tenant, `org_id NOT NULL`** | companies, contacts, contact_company, projects, tasks, calls, meetings, leads |
| **Tenant, `org_id NOT NULL`** (пишут SECURITY DEFINER триггеры / фон; ужесточено до NOT NULL в 023, S24) | activities, activity_log, project_files, kpi_entries, call_tracker_days, scheduled_calls |
| **Tenant через join** (без `org_id`) | meeting_attendees (тенантность наследуется от meetings) |
| **Глобальные / персональные** (вне тенант-модели) | profiles, user_settings, dashboard_sync, pipelines, pipeline_stages, organizations*, memberships* |

\* organizations/memberships сами являются корнем тенант-модели.

Столбец **`org_id`** у activities/activity_log/project_files/kpi_entries/
call_tracker_days/scheduled_calls ужесточён до **NOT NULL** миграцией 023 _(applied S24)_.

---

## Глобальные таблицы

### profiles _(001)_
Глобальный профиль пользователя (1:1 с `auth.users`).

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | → `auth.users(id)` ON DELETE CASCADE |
| full_name | text | NOT NULL DEFAULT '' |
| avatar_url | text | |
| ~~role~~ | text | **удалена в 024** _(applied S25)_ — роли только в `memberships` |
| settings | jsonb | DEFAULT `{}` |
| created_at / updated_at | timestamptz | |

### user_settings _(007)_ — персональная, без `org_id`

| Колонка | Тип | Заметки |
|---------|-----|---------|
| profile_id | uuid PK | → profiles ON DELETE CASCADE |
| theme | text | DEFAULT `t-claude` |
| visible_widgets | jsonb | DEFAULT `[]` |
| focus_text / notes_text | text | |
| funnel_goals / plan_targets | jsonb | DEFAULT `{"calls":200,...}` |
| updated_at | timestamptz | |

### dashboard_sync — персональная кросс-девайс синхронизация (без `org_id`)
DDL вне нумерованных миграций — таблицы **нет в файлах `supabase/migrations`**, существует только в живой БД. Снапшот состояния дашборда per-user.

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | text | часть составного PK |
| user_id | uuid | часть составного PK → auth.users |
| data | jsonb | |
| updated_at | timestamptz | DEFAULT now() |

PK = (id, user_id). RLS: `auth.uid() = user_id`.

> **Решение S25:** `dashboard_sync` остаётся **персональной** таблицей вне
> тенант-модели (аналог `user_settings`) — `org_id` не добавляется. Снапшот
> дашборда привязан к пользователю, а не к организации.

### organizations _(021)_ — корень тенанта

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | DEFAULT gen_random_uuid() |
| name | text | NOT NULL |
| created_by | uuid | → profiles |
| created_at / updated_at | timestamptz | |

### memberships _(021)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| org_id | uuid | NOT NULL → organizations ON DELETE CASCADE |
| profile_id | uuid | NOT NULL → profiles ON DELETE CASCADE |
| role | text | `owner`/`admin`/`manager`/`viewer`, DEFAULT `manager` |
| created_at | timestamptz | |
| — | — | UNIQUE(org_id, profile_id) |

### invitations _(026, applied)_ — приглашения в org
Приглашение по email+роли; ссылка передаётся вручную (email-инфра — S30),
membership создаётся при signup по совпадению email (`apply_pending_invites`).

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid | NOT NULL → organizations ON DELETE CASCADE |
| email | text | NOT NULL |
| role | text | CHECK `admin`/`manager`/`viewer` (owner НЕ приглашается), DEFAULT `manager` |
| token | uuid | default gen_random_uuid() (не кладётся в ссылку — матчинг по email) |
| invited_by | uuid | → profiles(id), nullable |
| expires_at | timestamptz | NOT NULL, DEFAULT now() + 14 дней |
| accepted_at | timestamptz | nullable; ставится `apply_pending_invites` |
| created_at | timestamptz | default now() |
| — | — | UNIQUE(org_id, email); INDEX по `lower(email)` |

**Без `trg_set_org_id`** — `org_id` задаётся явно (UI под owner/admin).
**RLS**: `inv_select`/`inv_insert`/`inv_delete` — `org_id = current_org_id()` И
`current_org_role() IN ('owner','admin')`.

### notifications _(026, applied)_ — уведомления «тебе назначили»
v1: `task_assigned` (task.assigned_to) / `project_assigned` (project.owner_id).
Пишутся только definer-триггерами (INSERT-политики нет). Email-канал — S30.

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid | NOT NULL → organizations ON DELETE CASCADE |
| recipient_id | uuid | NOT NULL → profiles ON DELETE CASCADE (получатель) |
| actor_id | uuid | → profiles ON DELETE SET NULL (кто назначил) |
| type | text | CHECK `task_assigned`/`project_assigned` |
| entity_type | text | NOT NULL (`tasks`/`projects`) |
| entity_id | uuid | NOT NULL |
| payload | jsonb | DEFAULT `{}` (`{title}` — text задачи / name сделки) |
| read_at | timestamptz | nullable |
| created_at | timestamptz | default now() |
| — | — | INDEX (recipient_id, read_at, created_at DESC) |

**Без `trg_set_org_id`** — `org_id` пишет definer-триггер из `NEW.org_id`.
**RLS**: `notif_select`/`notif_update`/`notif_delete` — `org_id = current_org_id()`
И `recipient_id = auth.uid()`. **Realtime**: добавлена в `supabase_realtime`.

### pipelines / pipeline_stages _(Sprint 1 «Pipelines & Directions»)_
DDL введён вне нумерованных миграций; описан в `src/types/database.ts`
(`Pipeline`, `PipelineStage`). Глобальные справочники воронок.

### stage_requirements _(027, pending)_ — конфиг стадийных гейтов (Blueprint v1)
Org-scoped конфиг требований на **ВХОД** в стадию. Настраивается из UI
(Settings → Стадийные гейты, owner/admin). `org_id` задаётся **явно** из UI —
`trg_set_org_id` НЕ вешается (паттерн invitations/notifications).

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | default gen_random_uuid() |
| org_id | uuid | NOT NULL → organizations ON DELETE CASCADE |
| pipeline_id | uuid | NOT NULL → pipelines ON DELETE CASCADE |
| stage_id | uuid | NOT NULL → pipeline_stages ON DELETE CASCADE (гейт на вход в эту стадию) |
| requirement_type | text | CHECK `field`/`file` |
| config | jsonb | field: `{"column":"budget"}` · file: `{"min_count":1,"label":"КП"}` |
| error_hint | text | NOT NULL — человекочитаемое «что сделать» для toast/чек-листа |
| is_active | boolean | NOT NULL DEFAULT true (выкл → гейт молчит) |
| created_at | timestamptz | default now() |
| — | — | INDEX `idx_stage_req_org_stage`(org_id, stage_id) WHERE is_active |

**RLS**: `stage_req_select` — `org_id = current_org_id()` (все члены org, для
UI-чек-листа); `stage_req_insert`/`_update`/`_delete` — то же + `current_org_role()
IN ('owner','admin')`.

**Seed (027, best-effort, идемпотентный)**: для дефолтной org, стадии deal-воронок
матчатся по name («Подготовка КП» → budget + файл КП; «Эксперимент» → company_id +
contact_id; «Договор» → файл + next_step). Стадия не нашлась — пропуск.

---

## Tenant-таблицы (`org_id NOT NULL`)

### companies _(002)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| name | text | NOT NULL |
| inn / industry / website / phone / address / notes | text | |
| owner_id / created_by | uuid | → profiles (`created_by` DEFAULT auth.uid()) |
| **org_id** | uuid | **NOT NULL** → organizations _(021/022)_ |
| created_at / updated_at | timestamptz | |

### contacts _(002)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| first_name | text | NOT NULL |
| last_name / email / phone / position / notes | text | |
| owner_id / created_by | uuid | → profiles |
| **org_id** | uuid | **NOT NULL** |
| created_at / updated_at | timestamptz | |

### contact_company _(002)_ — M:N контакт↔компания

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| contact_id | uuid | NOT NULL → contacts ON DELETE CASCADE |
| company_id | uuid | NOT NULL → companies ON DELETE CASCADE |
| role | text | |
| is_primary | boolean | DEFAULT false |
| **org_id** | uuid | **NOT NULL** |

### projects _(003, +Sprint 1, +015 nullable stage, +017, +019)_ — «сделки/проекты»

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| name | text | NOT NULL |
| company_id / contact_id | uuid | → companies / contacts |
| stage | deal_stage enum | nullable с _015_ (ERP-проекты) |
| budget | bigint | |
| deadline | date | |
| next_step | text | |
| next_action_date | date | _017_ |
| pinned_note | text | _017_ |
| owner_id / created_by | uuid | → profiles |
| loss_reason / loss_detail / lost_reason | text | |
| direction | `direction_t` enum | Sprint 1 (`erp`/`iiot`), NOT NULL |
| pipeline_id / stage_id | uuid | Sprint 1 |
| probability | int | |
| status | text | `open`/`won`/`lost`/`on_hold` |
| actual_close_date | date | |
| stage_entered_at | timestamptz | _019_ DEFAULT now() |
| **org_id** | uuid | **NOT NULL** |
| created_at / updated_at | timestamptz | |

### tasks _(004, +013)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| text | text | NOT NULL |
| lane | `task_lane` enum | `now`/`next`/`wait`/`done` |
| priority | `task_priority` enum | `normal`/`important`/`critical` |
| project_id | uuid | → projects ON DELETE SET NULL |
| company_id / contact_id | uuid | _013_ → companies / contacts |
| deadline | timestamptz | |
| remind_min | int | |
| sort_order | int | DEFAULT 0 |
| assigned_to / created_by | uuid | → profiles |
| **org_id** | uuid | **NOT NULL** |
| created_at / updated_at | timestamptz | |

### calls _(005)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| company_id / contact_id / project_id | uuid | |
| date | timestamptz | NOT NULL DEFAULT now() |
| status | `call_status` enum | `done`/`pending`/`cancelled` |
| next_step / agreements | text | |
| duration_s | int | |
| created_by | uuid | → profiles |
| **org_id** | uuid | **NOT NULL** |
| created_at / updated_at | timestamptz | |

### meetings _(005, +012, +020)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| title | text | NOT NULL |
| date | date | NOT NULL |
| time | time | |
| location | text | |
| project_id | uuid | |
| company_id / contact_id | uuid | _012_ |
| notes | text | |
| next_step | text | _020_ |
| created_by | uuid | → profiles |
| **org_id** | uuid | **NOT NULL** |
| created_at / updated_at | timestamptz | |

### leads _(016, +018 dedupe)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| user_id | uuid | NOT NULL → auth.users |
| title | text | NOT NULL |
| source | text | `call`/`website`/`referral`/`cold`/`inbound`/`event` |
| status | text | NOT NULL DEFAULT `new` |
| direction | text | |
| company_name_raw / contact_name_raw / phone / email / notes / disqualify_reason | text | |
| converted_deal_id | uuid | → projects |
| converted_company_id / converted_contact_id | uuid | |
| converted_at | timestamptz | |
| **org_id** | uuid | **NOT NULL** |
| created_at / updated_at | timestamptz | |

> **Resolved (025, применена 2026-07-06):** было —  FK `converted_deal_id` / `converted_company_id`
> / `converted_contact_id` объявлены **без `ON DELETE SET NULL`** — нарушение
> конвенции проекта. Удаление сконвертированной сделки/компании/контакта падает
> с `23503` (foreign_key_violation), пока лид ссылается на строку.

---

## Tenant-таблицы (`org_id NOT NULL` — ужесточено в 023, S24)

### activities _(006)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| type | `activity_type` enum | `call`/`meeting`/`email`/`note`/`task_completed`/`stage_change`/`kp_sent` |
| title | text | NOT NULL |
| description | text | |
| company_id / contact_id / project_id | uuid | |
| metadata | jsonb | DEFAULT `{}` |
| created_by | uuid | → profiles |
| **org_id** | uuid | NOT NULL (023) |
| created_at | timestamptz | |

### activity_log _(008)_ — аудит; пишется SECURITY DEFINER триггерами удаления _(009/011)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| project_id | uuid | **nullable** → projects (в живой БД nullable, не CASCADE) |
| user_id | uuid | nullable → auth.users |
| event_type | text | NOT NULL |
| payload | jsonb | DEFAULT `{}` |
| **org_id** | uuid | NOT NULL (023) |
| created_at | timestamptz | |

### project_files _(014)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| project_id | uuid | NOT NULL → projects ON DELETE CASCADE |
| user_id | uuid | NOT NULL → auth.users ON DELETE CASCADE |
| file_name | text | NOT NULL |
| file_size | bigint | |
| file_type | text | |
| storage_path | text | NOT NULL |
| **org_id** | uuid | NOT NULL (023) |
| created_at | timestamptz | |

### kpi_entries _(007)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| profile_id | uuid | NOT NULL → profiles |
| week_start | date | NOT NULL |
| metric | text | NOT NULL |
| plan / fact / points | int | NOT NULL DEFAULT 0 |
| **org_id** | uuid | NOT NULL (023) |

### call_tracker_days _(007)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| profile_id | uuid | NOT NULL → profiles |
| date | date | NOT NULL DEFAULT CURRENT_DATE |
| plan | int | DEFAULT 40 |
| done / success / fail | int | DEFAULT 0 |
| hourly / fail_reasons | jsonb | DEFAULT `{}` |
| **org_id** | uuid | NOT NULL (023) |

### scheduled_calls _(007)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| profile_id | uuid | NOT NULL → profiles |
| time | time | NOT NULL |
| company_id / contact_id / project_id | uuid | |
| phone / note | text | |
| remind_min | int | DEFAULT 2 |
| done | boolean | DEFAULT false |
| date | date | NOT NULL DEFAULT CURRENT_DATE |
| **org_id** | uuid | NOT NULL (023) |
| created_at | timestamptz | |

---

## Tenant через join (без `org_id`)

### meeting_attendees _(005)_
Тенантность наследуется от `meetings` через `meeting_id`.

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| meeting_id | uuid | NOT NULL → meetings ON DELETE CASCADE |
| contact_id | uuid | → contacts |
| profile_id | uuid | → profiles |

---

## Enums (Postgres ENUM-типы, не `text`)

| Тип | Значения |
|-----|----------|
| `deal_stage` | new_lead, qualification, waiting_materials, preparing_kp, kp_sent, kp_review, preparing_docs, cz_approval, trilateral_meeting, experiment_setup, contract_review, contract_signing, won, lost |
| `task_lane` | now, next, wait, done |
| `task_priority` | normal, important, critical |
| `call_status` | done, pending, cancelled |
| `activity_type` | call, meeting, email, note, task_completed, stage_change, kp_sent |
| `direction_t` | erp, iiot |
| `pipeline_entity_t` | deal, project |

## RLS-модель

### До S24 (legacy, было в живой БД 001–022)
Ролевая через `public.user_role()` (SECURITY DEFINER, читает `profiles.role`),
**без** org-границы: `admin`/`pm` видели все строки таблицы глобально,
`contact_company` читался всеми (`USING true`).

### С S24 (023, _applied_) — org-scoped
Семантика переведена **1:1** на org-модель. Каждая бизнес-политика получает
org-границу первым конъюнктом и роль через `current_org_role()`:

```sql
org_id = ( SELECT public.current_org_id() )
AND ( ( SELECT public.current_org_role() ) IN (...)   -- роль
      OR <ownership-колонка> = ( SELECT auth.uid() ) )  -- владелец
```

Все выражения обёрнуты в `( SELECT ... )` (initplan-паттерн: планировщик
вычисляет один раз, не per-row). UPDATE-политики без WITH CHECK наследуют
USING — org-граница автоматически запрещает перенос строки в чужую org.

**Маппинг ролей** (зафиксирован backfill'ом 022):

| profiles.role (legacy) | memberships.role | в политиках |
|---|---|---|
| admin | owner | `IN ('owner','admin')` ← было `IN ('admin','pm')` |
| pm | admin | |
| member | manager | `IN ('owner','admin','manager')` ← было `+'member'` |
| viewer | viewer | read-only (нет в INSERT) |
| — | owner | `= 'owner'` ← было `user_role()='admin'` (projects_delete) |

**Классы политик после 023:**
- **CRM-ядро** (companies, contacts, projects, tasks, calls, meetings,
  activities): роль `('owner','admin')` видит/правит всё в своей org; иначе —
  ownership (`created_by`/`owner_id`/`assigned_to`). `activities` — только
  SELECT+INSERT. `projects` DELETE — только `owner` ∨ `owner_id`.
- **contact_company**: дыра `USING true` закрыта на `org_id = current_org_id()`.
- **Own-семантика** + org-граница: project_files (`user_id`),
  kpi_entries/call_tracker_days/scheduled_calls (`profile_id`).
  leads/activity_log переведены на **командную видимость** в 024 (см. ниже).
- **meeting_attendees**: тенантность транзитивно через `meetings` (join),
  роль переписана на `current_org_role()`; своей `org_id`-колонки нет.
- **profiles**: SELECT → self ∨ `shares_org_with(id)` (со-org-члены);
  update — только self (не тронут).
- **organizations**: SELECT `is_org_member(id)` (021) + UPDATE `owner` (023).
- **memberships**: только SELECT (write — S26, invites).
- **вне скоупа S24**: user_settings, dashboard_sync, pipelines,
  pipeline_stages (`USING true` словари).

### С S25 (024, _applied_) — командная видимость + hardening

- **Командная видимость `leads`** (паттерн CRM-ядра): `SELECT`/`UPDATE`/`DELETE`
  переписаны — роль `('owner','admin')` видит/правит все лиды своей org, иначе
  ownership по `user_id`. `INSERT` остаётся own (`leads_insert_own` не тронут):
  лид создаёт владелец.
- **Командный activity-фид** (`activity_log`): политика `SELECT` — та же модель
  (owner/admin всё, остальные — свои по `user_id`). `INSERT`/`DELETE` не тронуты
  (own).
- **Log-функции наследуют `org_id`**: `log_delete_{task,project,contact,company,`
  `call,meeting}` теперь пишут `org_id = COALESCE(OLD.org_id, current_org_id())`,
  `log_stage_change` — `COALESCE(NEW.org_id, current_org_id())`. Раньше `org_id`
  в INSERT не указывался; в service-контексте `current_org_id()` = NULL валил
  `NOT NULL` и лог **молча терялся** через `EXCEPTION WHEN OTHERS` (инцидент S24).
  `trg_set_org_id` (BEFORE INSERT) заполняет только при NULL, поэтому явное
  значение из OLD/NEW переживает.
- **Гард владения в `convert_lead`**: SECURITY DEFINER обходит RLS, поэтому в
  начало добавлена проверка `EXISTS(leads WHERE id=p_lead_id AND user_id=auth.uid()
  AND org_id=current_org_id())` — иначе `RAISE EXCEPTION ... ERRCODE '42501'`
  (закрыт IDOR: конверсия чужого лида). Возвращаемый контракт не изменён.
- **Фикс владения `convert_lead`** (на гейте применения): живое тело ссылалось на
  `companies/contacts/projects.user_id` — этих колонок нет (владение через
  `owner_id`/`created_by`), любая конверсия падала с `42703`. Три блока
  переписаны: SELECT-проверки на `(owner_id = v_user_id OR created_by = v_user_id)`,
  INSERT-ы пишут `owner_id` + `created_by` вместо `user_id`.

### С S26 (026, applied) — write-политики memberships + уведомления/инвайты

- **Write-политики `memberships`** (до 026 была только `membership_select_own_org`,
  INSERT/UPDATE/DELETE наглухо закрыты): `membership_insert`/`membership_update`/
  `membership_delete` — управляют owner/admin своей org. Роль `owner` назначает/
  снимает **только owner** (`role <> 'owner' OR current_org_role() = 'owner'`).
  DELETE разрешён также самому себе (`profile_id = auth.uid()` — выход из org).
- **Гард «последний owner»** `protect_last_owner()` — `BEFORE UPDATE OR DELETE`
  триггер `trg_protect_last_owner`: снятие/понижение единственного owner org →
  `RAISE EXCEPTION ... ERRCODE '42501'`.
- **notifications**: INSERT-политики нет — пишут только SECURITY DEFINER триггеры
  (bypass RLS, паттерн activity_log). `SELECT`/`UPDATE`/`DELETE` — свои по
  `recipient_id = auth.uid()` в рамках org.
- **invitations**: полный CRUD под owner/admin своей org (см. таблицу выше).

### С S27 (027, pending) — стадийные гейты

- **`stage_requirements`** (см. таблицу выше): SELECT — все члены org
  (`org_id = current_org_id()`), нужен для UI-чек-листа готовности;
  INSERT/UPDATE/DELETE — org + `current_org_role() IN ('owner','admin')`.
- **`check_stage_requirements(p_project_id, p_target_stage_id) → jsonb`**
  _(027, SECURITY DEFINER, `search_path=public,pg_temp`)_ — единая проверка для
  триггера и UI. **Гард входа**: проект существует И `is_org_member(project.org_id)`,
  иначе `RAISE 42501` (SECURITY DEFINER обходит RLS — гард обязателен, урок
  convert_lead). SECURITY DEFINER необходим: RLS `project_files` own-only
  (`user_id`), иначе менеджер не видит файлы админа → false negative. field-проверка —
  **жёсткий whitelist колонок в CASE** (budget, company_id, contact_id, next_step,
  deadline, probability, direction, next_action_date), **никакого динамического SQL**;
  неизвестная колонка = пункт не пройден. Возврат — jsonb-массив незакрытых
  требований `[{type,config,hint}]` (пустой = проход). ACL: REVOKE PUBLIC/anon,
  GRANT authenticated + service_role.
- **`aa_enforce_stage_gate()`** _(027, SECURITY DEFINER)_ + триггер
  **`trg_aa_enforce_stage_gate`** `BEFORE UPDATE ON projects`. При
  `NEW.stage_id IS DISTINCT FROM OLD.stage_id` зовёт `check_...`; непустой массив →
  `RAISE EXCEPTION 'stage_gate_failed' USING DETAIL = <jsonb::text>, ERRCODE 'P0001'`
  (UI парсит message + DETAIL). **Без EXCEPTION-глотания** — гейт обязан блокировать.
  ACL триггерной функции — только service_role.
  **Порядок BEFORE-триггеров projects** (по алфавиту имени):
  `set_updated_at` → **`trg_aa_enforce_stage_gate`** → `trg_set_org_id` (INSERT) →
  `trg_sync_deal_stage_fields` → `trg_sync_project_stage`. Префикс `trg_aa_`
  гарантирует срабатывание гейта ДО обоих `trg_sync_*`.

### RLS-helpers (SECURITY DEFINER STABLE, `search_path=public,pg_temp`)
| Функция | Введена | Назначение |
|---|---|---|
| `current_org_id()` | 021 | первая org пользователя из memberships |
| `is_org_member(uuid)` | 021 | членство в org (обход self-referencing recursion) |
| `current_org_role()` | 023 | роль пользователя в его текущей org |
| `shares_org_with(uuid)` | 023 | делят ли профиль и текущий юзер общую org |

`public.user_role()` и `profiles.role` — **удалены в 024** _(applied S25)_:
все политики переехали на `current_org_role()` ещё в 023, код/UI роль читает
через `useOrgRole()` (RPC `current_org_role`).

**Advisors-фиксы 023**: `convert_lead(...)` — REVOKE anon + `search_path`;
`sync_project_stage()` — `search_path`.

Прочие SECURITY DEFINER: `handle_new_user`, `handle_new_profile_settings`,
`convert_lead`, `set_org_id`, `log_delete_{call,company,contact,meeting,project,task}`,
`log_stage_change`. Не-DEFINER: `sync_deal_stage_fields`, `sync_project_stage`,
`update_updated_at`, `update_leads_updated_at`.

## Ключевые функции / триггеры (тенантность)

- `public.current_org_id()` / `is_org_member()` _(021)_, `current_org_role()` /
  `shares_org_with()` _(023)_ — см. таблицу helpers выше.
- `public.set_org_id()` — `BEFORE INSERT` триггер `trg_set_org_id` на всех
  14 tenant-таблицах; проставляет `NEW.org_id := current_org_id()`, если он
  не задан явно. **На invitations/notifications НЕ вешается** — org_id явный.
- `public.notify_task_assigned()` / `notify_project_assigned()` _(026, applied)_
  — SECURITY DEFINER, `AFTER INSERT OR UPDATE OF assigned_to`/`owner_id` на
  tasks/projects. При смене исполнителя на другого (не себя) пишут
  `notifications`. Идемпотентны (`NEW.x IS DISTINCT FROM OLD.x`, ветка INSERT
  через `TG_OP`), самоназначение не уведомляет, ошибка не блокирует запись
  (`EXCEPTION WHEN OTHERS → RETURN NEW`).
- `public.protect_last_owner()` _(026, applied)_ — гард последнего owner
  (см. RLS S26).
- `public.apply_pending_invites(uuid, text)` _(026, applied)_ — SECURITY DEFINER;
  матчит непринятые непросроченные `invitations` по email → создаёт
  `memberships` (`ON CONFLICT (org_id, profile_id) DO NOTHING`, идемпотентно),
  ставит `accepted_at`. Вызывается из `handle_new_user` (`PERFORM ...(NEW.id,
  NEW.email)`) в конце — остальное тело триггера не менялось.

## Порядок применения

- **021, 022** _(S23, applied 2026-07-05)_ — применены вручную через Supabase
  SQL Editor.
- **023** _(S24, applied)_ — применена через MCP `apply_migration` (атомарно,
  без BEGIN/COMMIT) после security-review. NOT NULL на activities/activity_log/
  project_files/kpi_entries/call_tracker_days/scheduled_calls — после того как
  022 гарантировал отсутствие нулей. Изоляция верифицирована (владелец / чужак /
  tamper), advisors чистые.
- **024** _(S25, applied 2026-07-05)_ — применена через MCP `apply_migration`
  (атомарно, без BEGIN/COMMIT). На гейте всплыл `42703` в живом теле convert_lead
  (ссылка на несуществующие `user_id` в companies/contacts/projects) — исправлено
  на `owner_id`/`created_by`. Smoke прошли: convert_lead чужого лида → `42501`;
  лог удаления из service-контекста получает `org_id` (инцидент S24 не
  воспроизводится); видимость leads под ролями owner/manager; advisors чистые.
- **025, 026** _(S26, applied 2026-07-06)_ — гейт Cowork пройден: FK SET NULL, инвайт-цикл (матч/идемпотентность/expiry), notify-триггеры, last-owner guard 42501.
  Smoke-план: удаление сконвертированной сделки больше не `23503`
  (`lead.converted_deal_id → NULL`); `apply_pending_invites` прямым вызовом
  создаёт membership, повторный вызов идемпотентен, просроченный инвайт не
  матчится; UPDATE `tasks.assigned_to` на другого → уведомление, самоназначение
  → нет; UPDATE роли единственного owner → `42501`; admin INSERT membership
  с `role='owner'` → отказ; advisors повторно.
- **027** _(S27, pending)_ — написана и закоммичена из Claude Code, **не применена**.
  План гейта Cowork: ревью (whitelist полей / нет динамического SQL / гард 42501 в
  check / отсутствие EXCEPTION-глотания в enforcement / ACL / имя триггера `aa_`
  раньше `sync`) → `apply_migration` 027 → smoke (переход без budget → P0001 с
  DETAIL-списком; заполнить budget + файл → проход; `is_active=false` → гейт молчит;
  чужак на `check_stage_requirements` → 42501; порядок триггеров подтверждён
  `pg_trigger`) → advisors повторно. Флип pending→applied в этом доке — после гейта.
