# S-SEC-GRANTS-NARROW — сузить гранты `authenticated` и добить хвост 056b

**Ветка:** `chore/sec-grants-narrow` от `main`. Миграция — **080**. Один коммит.

Гигиена привилегий по итогам гейта `S-DOCS-SCHEMA-SYNC`. Не фича, поведения не меняет,
откат — обратный `grant`.

**Трудоёмкость: ~2–3 ч. Риск низкий.**

Контекст на момент выдачи (2026-07-27): **R2-P0 закрыт целиком**, `main` = `18988ca`,
в проде применены 076 (org_settings), 077 (segments), 078 (stage_transition_core),
079 (wf_dwell). **080 свободна** — занимать её.

---

## Зачем

Урок 075 («дефолтные привилегии Supabase дают `authenticated` ВСЕ права на новую таблицу в
`public`, поэтому `grant select, delete` ничего не сужает») применён **только** к
baseline-таблицам. По остальным — полный набор, включая `TRUNCATE` / `REFERENCES` /
`TRIGGER`, которые **RLS не покрывает вообще**.

Проверено по проду 2026-07-26:

| Таблица | Привилегии `authenticated` |
|---|---|
| `baseline_tasks` | `SELECT` ✅ |
| `project_baselines` | `DELETE, SELECT` ✅ |
| `message_reactions` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |
| `project_files` | то же |
| `project_messages` | то же |
| `project_videos` | то же |
| `quotes` | то же |
| `recurring_task_templates` | то же |
| `task_dependencies` | то же |

То есть это **не** дефект пяти миграций 062–075, как звучало в отчёте, а состояние
практически всех пользовательских таблиц проекта. Поэтому и правка — **сплошная**, по всем
таблицам с `org_id`, а не патч на пять имён.

**Перепроверено по проду 2026-07-27, после применения 076–079** — картина не ухудшилась,
новые таблицы R2 пришли уже суженными, урок 075 в них учтён:

| Таблица | Привилегии `authenticated` | |
|---|---|---|
| `segments` (077) | `DELETE, INSERT, SELECT, UPDATE` | ✅ чисто |
| `stage_transitions` (078) | `SELECT` | ✅ чисто |

Функции 078/079 (`check_stage_requirements_row`, `wf_apply_project_action`,
`run_dwell_automations`, `run_stage_automations`, `log_stage_transition`) — все DEFINER
с `EXECUTE` только у `service_role`, конвенция 056b соблюдена. Чинить в них нечего.
Хвост `stamp_task_completed_at` — **подтверждён живым** (`=X/postgres` + `authenticated`).

Почему это стоит миграции, хотя через PostgREST не выражается: `TRUNCATE` игнорирует RLS
целиком, а `TRIGGER` позволяет навесить свой триггер на таблицу. Обе привилегии не нужны
клиенту ни в одном сценарии; они становятся поверхностью атаки в момент, когда JWT
`authenticated` окажется в контексте с прямым SQL (скомпрометированная edge-функция на anon-
ключе, ручной прогон в SQL Editor под ролью, будущий сервис). Снять их дешевле, чем
рассуждать о достижимости.

---

## РАЗВЕДКА

```bash
git branch --show-current && git status --short
ls supabase/migrations/ | tail -3      # ожидание: …077, 078, 079 → берём 080
sed -n '1,20p' supabase/migrations/075_baseline_grants_narrow.sql   # эталон формулировок
grep -rn "revoke" supabase/migrations/056_revoke_anon_defaults.sql | head
```

Через Supabase MCP (read-only) — снять фактическую картину, **список таблиц не хардкодить**:

```sql
select table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
group by 1 having string_agg(privilege_type,',') like '%TRUNCATE%'
order by 1;
```

**STOP-условия:**

1. В выборке оказались таблицы **без** `org_id` (`profiles`, `user_settings`, `pipelines`,
   `pipeline_stages`, `dashboard_sync`) → их трогать в этом спринте **не** надо, вынести
   отдельным решением и сказать.
2. `ls supabase/migrations/` показал, что 080 уже занята → взять следующий свободный,
   доложить в отчёте.
3. 🔴 **`check_stage_requirements(uuid, uuid)` трогать запрещено.** Она DEFINER **и** с
   `EXECUTE` у `authenticated` — это выглядит как нарушение 056b, но так и задумано: её
   вызывает модалка перехода стадии, чтобы показать невыполненные требования до UPDATE.
   Защита внутри есть — `IF auth.uid() IS NOT NULL AND NOT is_org_member(v_project.org_id)
   THEN RAISE '42501'`, по чужому `project_id` она отдаёт отказ, а не данные. Снятие с неё
   `EXECUTE` сломает переход стадии из UI. Под фильтр раздела 2 (`prorettype = 'trigger'`)
   она не попадает, так как возвращает `jsonb` — но если возникнет соблазн «довести до
   конвенции» вручную, **не поддаваться** и написать об этом в отчёте.

---

## Работы

### 1. Сплошной revoke по таблицам с `org_id`

Не перечислять имена руками — собрать из каталога, чтобы новые таблицы не забылись:

```sql
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'org_id'
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke truncate, references, trigger on public.%I from authenticated', r.relname);
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;
```

**Только `TRUNCATE` / `REFERENCES` / `TRIGGER` (+ добить `anon`).** `SELECT` / `INSERT` /
`UPDATE` / `DELETE` **не трогать**: там работает RLS, и снятие DML сломает приложение.
Именно этим правка отличается от 075, где у baseline-таблиц DML не нужен вовсе.

В шапке миграции — перечислить, какие таблицы затронуты на момент написания (для читаемости
дифа), но исполнять через каталог.

### 2. Хвост 056b — `stamp_task_completed_at`

Проверено: `prosecdef = false` (ок, триггерная), но **`EXECUTE` остался у `anon` и
`authenticated`**. Для сравнения — `set_org_id`, `freeze_org_id`, `spawn_recurring_tasks`,
`run_overdue_automations`: у всех `anon`/`authenticated` = false. То есть 072 просто
проскочила мимо конвенции 056b.

```sql
revoke all on function public.stamp_task_completed_at() from public, anon, authenticated;
```

Практического вреда нет (вызов триггерной функции вне триггера падает), но это ровно тот
пункт, который всплывёт в следующем аудите. Заодно прогнать тем же запросом всю выборку
триггерных функций и добить остальные, если найдутся:

```sql
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.prorettype = 'trigger'::regtype
order by 2 desc, 1;
```

### 3. Что осознанно НЕ делаем

- **`create_project_baseline` исполним `service_role`** (074 грантовала только
  `authenticated`) — дефолтные привилегии, безвредно. Задокументировать, не править.
- **`{public}` vs `{authenticated}` в ролях политик.** По проду: **86 политик `{public}`,
  40 `{authenticated}`** — то есть `{public}` это доминирующая практика проекта, а не
  отклонение 062/069, как звучало в отчёте. Функционально почти безразлично: `anon` лишён
  табличных грантов (056), так что `TO public`-политика ему всё равно ничего не даёт.
  Переписывать 86 политик ради консистентности — не стоит миграции. Записать как принятое
  решение в `docs/schema.md`, чтобы вопрос не поднимался в третий раз.
- **`meetings_select` и `is_meeting_attendee(id)`.** Заявка «кандидат в initplan-WARN»
  верна, но предложенное лечение — **невозможно**: функция принимает `id` строки, поэтому
  обёртка `(select …)` даёт коррелированный подзапрос, который всё равно вычисляется
  построчно. InitPlan получается только для аргумент-независимых вызовов (`current_org_id()`,
  `auth.uid()` — они в этой политике уже обёрнуты). Настоящие варианты: (а) оставить как есть,
  (б) переписать предикат на `EXISTS` по `meeting_attendees` с собственной политикой — но
  `is_meeting_attendee` DEFINER именно чтобы обойти RLS вложенной таблицы, так что это
  редизайн видимости встреч, не микрооптимизация. **В этот спринт не входит**, отдельным
  решением при живой жалобе на скорость.

---

## VERIFY / коммит

Миграцию **не применять** — apply на гейте.

После apply (гейт):

```sql
-- 1. TRUNCATE/TRIGGER/REFERENCES не осталось ни у одной org-таблицы
select count(*) from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');     -- ожидание: 0

-- 2. DML на месте (иначе приложение встало)
select table_name, string_agg(privilege_type,',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated' and table_name in ('tasks','projects','quotes')
group by 1;                                                       -- ожидание: DELETE,INSERT,SELECT,UPDATE

-- 3. триггерные функции без EXECUTE у anon
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prorettype='trigger'::regtype
  and has_function_privilege('anon', p.oid, 'EXECUTE');            -- ожидание: 0

-- 4. модалка перехода не сломана: EXECUTE у authenticated НА МЕСТЕ
select has_function_privilege('authenticated',
  'public.check_stage_requirements(uuid,uuid)', 'EXECUTE');        -- ожидание: true
```

Плюс приложение: ролевой смок owner/manager/viewer по основным разделам (сделки, задачи,
файлы, чат, КП, повторяющиеся задачи, базовые планы) — **ни одна операция не должна
сломаться**; если сломалась, значит сняли лишнее, откат обратным grant. Отдельным пунктом
в смоук — **переход стадии через модалку на сделке с активным требованием** (это прямой
потребитель `check_stage_requirements`) и **создание личного сегмента** (077 — самая новая
таблица под сплошным revoke).

`advisors` — без новых WARN.

Коммит один:

```
chore(security): сузить гранты authenticated до RLS-покрываемых, добить хвост 056b
```

**Не пушить.** В отчёте: список затронутых таблиц (из каталога), результат трёх проверок,
результат ролевого смока и какие триггерные функции пришлось чистить помимо
`stamp_task_completed_at`.
