# Database Schema — dashboard-crm

> **Applied (в живой БД, ref `uoiavcabxgdjugzryrmj`):** миграции 001–022 (S23-мультитенантность применена).
> **Pending (ждёт применения через MCP `apply_migration` после security-review):** 023 — S24 org-scoped RLS.
>
> Разделы с пометкой **_(pending S24)_** описывают целевое состояние 023 и в БД **пока не существуют**. Собрано интроспекцией живой БД + `supabase/migrations`; актуально на 2026-07-05.

## Тенант-модель _(applied S23)_

С миграций 021–022 введена мультитенантность (в живой БД с 2026-07-05):

- **`organizations`** — корень тенанта.
- **`memberships`** — связь профиль ↔ организация с org-scoped ролью
  (`owner`/`admin`/`manager`/`viewer`). Глобальная `profiles.role`
  (`admin`/`pm`/`member`/`viewer`) **не тронута** — переезд ролей в
  memberships запланирован на Sprint 25.
- **`org_id`** добавлен во все tenant-таблицы. Заполняется автоматически
  BEFORE INSERT триггером `set_org_id()` → `current_org_id()`, поэтому
  клиентский код (хуки) не передаёт `org_id` явно.
- RLS-политики стали **org-scoped** с 023 _(pending S24)_ — перевод старой
  ролевой семантики 1:1 на org-модель (см. раздел «RLS-модель»).

| Класс | Таблицы |
|-------|---------|
| **Tenant, `org_id NOT NULL`** | companies, contacts, contact_company, projects, tasks, calls, meetings, leads |
| **Tenant, `org_id` nullable** (пишут SECURITY DEFINER триггеры / фон; ужесточение — Sprint 24) | activities, activity_log, project_files, kpi_entries, call_tracker_days, scheduled_calls |
| **Tenant через join** (без `org_id`) | meeting_attendees (тенантность наследуется от meetings) |
| **Глобальные / персональные** (вне тенант-модели) | profiles, user_settings, dashboard_sync, pipelines, pipeline_stages, organizations*, memberships* |

\* organizations/memberships сами являются корнем тенант-модели.

Столбец **`org_id` nullable** у activities/activity_log/project_files/kpi_entries/
call_tracker_days/scheduled_calls ужесточается до **NOT NULL** миграцией 023 _(pending S24)_.

---

## Глобальные таблицы

### profiles _(001)_
Глобальный профиль пользователя (1:1 с `auth.users`).

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | → `auth.users(id)` ON DELETE CASCADE |
| full_name | text | NOT NULL DEFAULT '' |
| avatar_url | text | |
| role | text | `admin`/`pm`/`member`/`viewer`, DEFAULT `member` — **глобальная роль** |
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

### pipelines / pipeline_stages _(Sprint 1 «Pipelines & Directions»)_
DDL введён вне нумерованных миграций; описан в `src/types/database.ts`
(`Pipeline`, `PipelineStage`). Глобальные справочники воронок.

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

---

## Tenant-таблицы (`org_id` nullable — ужесточение в Sprint 24)

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
| **org_id** | uuid | nullable |
| created_at | timestamptz | |

### activity_log _(008)_ — аудит; пишется SECURITY DEFINER триггерами удаления _(009/011)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| project_id | uuid | **nullable** → projects (в живой БД nullable, не CASCADE) |
| user_id | uuid | nullable → auth.users |
| event_type | text | NOT NULL |
| payload | jsonb | DEFAULT `{}` |
| **org_id** | uuid | nullable |
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
| **org_id** | uuid | nullable |
| created_at | timestamptz | |

### kpi_entries _(007)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| profile_id | uuid | NOT NULL → profiles |
| week_start | date | NOT NULL |
| metric | text | NOT NULL |
| plan / fact / points | int | NOT NULL DEFAULT 0 |
| **org_id** | uuid | nullable |

### call_tracker_days _(007)_

| Колонка | Тип | Заметки |
|---------|-----|---------|
| id | uuid PK | |
| profile_id | uuid | NOT NULL → profiles |
| date | date | NOT NULL DEFAULT CURRENT_DATE |
| plan | int | DEFAULT 40 |
| done / success / fail | int | DEFAULT 0 |
| hourly / fail_reasons | jsonb | DEFAULT `{}` |
| **org_id** | uuid | nullable |

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
| **org_id** | uuid | nullable |
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

### С S24 (023, _pending_) — org-scoped
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
- **Own-семантика** + org-граница: leads/activity_log/project_files (`user_id`),
  kpi_entries/call_tracker_days/scheduled_calls (`profile_id`).
- **meeting_attendees**: тенантность транзитивно через `meetings` (join),
  роль переписана на `current_org_role()`; своей `org_id`-колонки нет.
- **profiles**: SELECT → self ∨ `shares_org_with(id)` (со-org-члены);
  update — только self (не тронут).
- **organizations**: SELECT `is_org_member(id)` (021) + UPDATE `owner` (023).
- **memberships**: только SELECT (write — S26, invites).
- **вне скоупа S24**: user_settings, dashboard_sync, pipelines,
  pipeline_stages (`USING true` словари).

### RLS-helpers (SECURITY DEFINER STABLE, `search_path=public,pg_temp`)
| Функция | Введена | Назначение |
|---|---|---|
| `current_org_id()` | 021 | первая org пользователя из memberships |
| `is_org_member(uuid)` | 021 | членство в org (обход self-referencing recursion) |
| `current_org_role()` | 023 | роль пользователя в его текущей org |
| `shares_org_with(uuid)` | 023 | делят ли профиль и текущий юзер общую org |

`public.user_role()` — **DEPRECATED S24** (COMMENT в 023): политики переехали
на `current_org_role()`; удаление — S25 после переезда UI.

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
  не задан явно.

## Порядок применения

- **021, 022** _(S23, applied 2026-07-05)_ — применены вручную через Supabase
  SQL Editor.
- **023** _(S24, pending)_ — применяется через MCP `apply_migration`
  (атомарно, без BEGIN/COMMIT) **после security-review**. NOT NULL на
  activities/activity_log/project_files/kpi_entries/call_tracker_days/
  scheduled_calls — только после того как 022 гарантировал отсутствие нулей.
  Верификация: smoke под двумя юзерами разных org (изоляция), повтор advisors.
