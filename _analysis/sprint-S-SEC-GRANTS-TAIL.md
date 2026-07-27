# S-SEC-GRANTS-TAIL — семь таблиц вне охвата 080 + долг ledger 079

**Ветка:** `chore/sec-grants-tail` от `main`. Миграция — **081**. Один коммит.

Хвост спринта `S-SEC-GRANTS-NARROW`. 080 сузила гранты по каталогу — фильтром
`columns.column_name = 'org_id'`, — и поэтому **не тронула семь таблиц, у которых колонки
`org_id` нет**. У всех семи `authenticated` до сих пор держит полный набор, включая
`TRUNCATE` / `REFERENCES` / `TRIGGER`. Здесь их и добиваем — явным списком, потому что
каталожный фильтр их принципиально не берёт.

Плюс закрываем долг спринта WF-DWELL: ledger-записи по **079** в `docs/schema.md` нет.

**Трудоёмкость: ~1–1.5 ч. Риск низкий на разделе 1, средний на разделе 2** (там снимается
DML — читать STOP-условия внимательно).

Контекст на момент выдачи (2026-07-27): `main` = `e36e08a`, в проде применены 076–**080**
(`20260727191507 / 080_grants_narrow`). **081 свободна.**

---

## Состояние прода, снято на гейте 080 (не перепроверять, но сверить перед правкой)

| Таблица | RLS | Политики (cmd) | `authenticated` |
|---|---|---|---|
| `organizations` | on | SELECT, UPDATE | полный набор |
| `profiles` | on | SELECT, UPDATE | полный набор |
| `pipelines` | on | **только SELECT** | полный набор |
| `pipeline_stages` | on | **только SELECT** | полный набор |
| `user_settings` | on | ALL | полный набор |
| `meeting_attendees` | on | ALL + SELECT | полный набор |
| `dashboard_sync` | on | SELECT, INSERT, UPDATE, DELETE | полный набор |

«Полный набор» = `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`.
`anon` пуст на всех семи (056 держится).

Ключевое наблюдение, из которого растёт раздел 2: **у четырёх таблиц гранты шире, чем
политики**. Операция без политики и так блокируется RLS, но грант остаётся ложным
обещанием — и станет реальным доступом в тот день, когда кто-нибудь добавит политику
«чтобы починить» и не посмотрит на гранты.

---

## РАЗВЕДКА

```bash
git branch --show-current && git status --short
ls supabase/migrations/ | tail -3     # ожидание: 079, 080 → берём 081
sed -n '1,35p' supabase/migrations/080_grants_narrow.sql   # эталон формулировок и шапки
grep -n "079" docs/schema.md | head   # ожидание: заголовок обновлён, ledger-блока нет
```

Клиентский код — **это главная разведка спринта**, от неё зависит объём раздела 2:

```bash
grep -rn "from('pipelines')\|from(\"pipelines\")"           src/
grep -rn "from('pipeline_stages')\|from(\"pipeline_stages\")" src/
grep -rn "from('organizations')\|from(\"organizations\")"   src/
grep -rn "from('profiles')\|from(\"profiles\")"             src/
```

Для каждого попадания определить операцию: `.select()` — безразлично, а вот `.insert()`,
`.update()`, `.delete()`, `.upsert()` — значимо.

Через Supabase MCP (read-only) — сверить, что картина не поехала:

```sql
select c.relname, c.relrowsecurity as rls_on,
       (select string_agg(distinct p.cmd, ',' order by p.cmd)
          from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_cmds,
       (select string_agg(distinct g.privilege_type, ',' order by g.privilege_type)
          from information_schema.role_table_grants g
         where g.table_schema='public' and g.table_name=c.relname and g.grantee='authenticated') as privs
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('organizations','meeting_attendees','pipelines','pipeline_stages',
                    'profiles','user_settings','dashboard_sync')
order by 1;
```

**STOP-условия:**

1. 🔴 **Грепы нашли клиентскую запись** (`.insert` / `.update` / `.delete` / `.upsert`) в
   `pipelines`, `pipeline_stages` или `organizations` — **раздел 2 по этой таблице не
   делать**, оставить только раздел 1, и написать в отчёте, что именно найдено и где.
   Раздел 1 при этом безопасен всегда.
2. 🔴 **Появилась политика на INSERT/DELETE** у `organizations`, `profiles`, `pipelines`,
   `pipeline_stages` (то есть картина в таблице выше устарела) — значит операция задумана,
   грант снимать нельзя. Доложить и оставить только раздел 1.
3. 081 уже занята → взять следующий свободный, доложить.
4. `git status` грязный → разобраться до начала.

---

## Работы

### 1. Снять `TRUNCATE` / `REFERENCES` / `TRIGGER` у всех семи (обязательно, риск низкий)

Явным списком — каталожный фильтр 080 их не видит:

```sql
revoke truncate, references, trigger on
  public.organizations,
  public.profiles,
  public.pipelines,
  public.pipeline_stages,
  public.user_settings,
  public.meeting_attendees,
  public.dashboard_sync
from authenticated;

-- страховка, симметрично 080: anon уже пуст после 056
revoke all on
  public.organizations, public.profiles, public.pipelines, public.pipeline_stages,
  public.user_settings, public.meeting_attendees, public.dashboard_sync
from anon;
```

Почему это не косметика, а самый дорогой пункт всей темы грантов: у `organizations`
тенант живёт в `id`, и `TRUNCATE` там **игнорирует RLS целиком** — одна команда сносит
корень всех org. `TRIGGER` позволяет навесить собственный триггер на таблицу профилей и
организаций. Ни то, ни другое клиенту не нужно ни в одном сценарии.

### 2. Привести DML к политикам там, где грант шире (риск средний, под STOP-1 и STOP-2)

Делать **только по тем таблицам, которые прошли разведку**. По каждой — отдельная строка
`revoke`, чтобы при откате можно было вернуть точечно.

```sql
-- Словари: политика ровно одна, SELECT. Запись идёт миграциями, не клиентом.
revoke insert, update, delete on public.pipelines       from authenticated;
revoke insert, update, delete on public.pipeline_stages from authenticated;

-- organizations: политики SELECT + UPDATE(owner). INSERT/DELETE политик нет.
-- Организация создаётся в `complete_onboarding` — SECURITY DEFINER, грант клиента ей не нужен.
revoke insert, delete on public.organizations from authenticated;

-- profiles: политики SELECT + UPDATE(own). INSERT/DELETE политик нет.
-- Профиль заводится триггером на auth.users (DEFINER).
revoke insert, delete on public.profiles from authenticated;
```

**Не трогать DML** у `user_settings` (политика ALL), `meeting_attendees` (ALL + SELECT),
`dashboard_sync` (все четыре cmd) — там политики есть, значит операции задуманы.

Что меняется для пользователя: ничего. Операция и сейчас блокируется RLS — меняется только
текст ошибки: было «0 строк / RLS violation», станет «42501 permission denied». Если
где-то в UI на этом различии построена ветка — это найдётся в разведке и попадёт под STOP-1.

**Перед `revoke` проверить, что политики действительно нет** — прямо в миграции, чтобы она
не сработала вслепую на изменившейся схеме:

```sql
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname='public' and tablename='organizations'
               and cmd in ('INSERT','DELETE')) then
    raise exception '081: у organizations появилась политика INSERT/DELETE — revoke отменён, разобраться';
  end if;
end $$;
```

Такой guard — по каждой из четырёх таблиц раздела 2.

### 3. Долг WF-DWELL: ledger 079 в `docs/schema.md`

Записи по 079 нет, и это уже стоило одной ошибки: бриф 080 утверждал, что 079 не применена,
хотя `schema_migrations` содержит `20260727075948 / 079_wf_dwell`. Внести блок по образцу
соседних записей:

- `run_dwell_automations()` + cron `wf-dwell-daily 10 6 * * *`;
- вынос общей части действий в `wf_apply_project_action(uuid,uuid,uuid,text)`;
- расширение CHECK'ов: `automation_rules_trigger_type_check` + `days_in_stage`,
  `automation_rules_action_type_check` + `suggest_spawn` / `spawn_suggest`;
- индекс `idx_projects_dwell`;
- **грабля, которую стоит зафиксировать в схеме, а не только в отчёте:** ключ
  идемпотентности строится как
  `to_char(stage_entered_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US')`, а не `::text` —
  иначе session `TimeZone`/`DateStyle` разводит ключи cron-прогона и ручного вызова, и
  правило стреляет дважды за одно пребывание в стадии.

Плюс ledger-запись по 081 с планом смоуков гейта. Копию в
`crm-architect/references/schema.md` синхронизировать тем же заходом.

### 4. Что осознанно НЕ делаем

- **`check_stage_requirements(uuid, uuid)`** — DEFINER с `EXECUTE` у `authenticated`, и так
  и должно остаться: её зовёт модалка перехода стадии, защита внутри есть
  (`is_org_member` → 42501). Причина уже записана в 080, повторять не нужно, но и снимать
  нельзя.
- **20 WARN `authenticated_security_definer_function_executable`** в advisors — это RPC
  проекта (`convert_lead`, `spawn_delivery_project`, `reorder_tasks`, `current_org_id` и
  прочие). Они вызываются клиентом по назначению. Массово снимать `EXECUTE` — сломать
  приложение. Не входит в спринт; если когда-нибудь дойдут руки — это аудит каждой функции
  по отдельности, не сплошная правка.
- **`{public}` vs `{authenticated}` в ролях политик** — принятое решение, зафиксировано в
  `docs/schema.md` на 080 (87 против 44). Не переписывать.

---

## VERIFY / коммит

Миграцию **не применять** — apply на гейте.

После apply (гейт):

```sql
-- 1. широких привилегий у authenticated не осталось нигде
select count(*) from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');          -- ожидание: 0

-- 2. DML там, где политики есть, — на месте
select table_name, string_agg(privilege_type,',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and table_name in ('user_settings','meeting_attendees','dashboard_sync')
group by 1;                          -- ожидание: DELETE,INSERT,SELECT,UPDATE у всех трёх

-- 3. чтение словарей и профилей живо
select table_name, string_agg(privilege_type,',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and table_name in ('pipelines','pipeline_stages','profiles','organizations')
group by 1;                          -- ожидание: SELECT (+UPDATE у profiles/organizations)

-- 4. anon по-прежнему пуст
select count(*) from information_schema.role_table_grants
where table_schema='public' and grantee='anon';                       -- ожидание: 0
```

Ролевой смок под JWT (owner и manager) — **обязательно с записью, не только чтением**:

- профиль: `update profiles set full_name = full_name where id = <свой>` → 1 строка;
- настройки: чтение и запись `user_settings` своей строки → работает;
- организация: `select` видна; `update organizations set name = name` под owner → 1 строка,
  под manager → 0 строк (политика `org_update_owner`);
- воронки: `select` из `pipelines` / `pipeline_stages` возвращает словарь; попытка
  `insert` → **42501** (а не тихие 0 строк) — это и есть подтверждение раздела 2;
- встречи: чтение `meeting_attendees` и добавление участника на своей встрече → работает.

Плюс UI-смок на dev: вход в приложение, открытие настроек профиля и организации, доска
сделок (читает `pipeline_stages`), переход стадии через модалку. `advisors` — без новых WARN.

Коммит один:

```
chore(security): гранты семи таблиц без org_id, ledger 079/081 в schema.md
```

**Не пушить.** В отчёте: результат грепов по клиентскому коду (по каждой из четырёх таблиц
раздела 2 отдельно), какие таблицы вошли в раздел 2 фактически и какие отсеклись по STOP,
результат четырёх VERIFY-запросов, результат ролевого смока с записью, и — отдельным
пунктом — подтверждение, что ledger-блок по 079 внесён и копия в скилле синхронизирована.
