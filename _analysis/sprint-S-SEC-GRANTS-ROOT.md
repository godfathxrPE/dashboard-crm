# S-SEC-GRANTS-ROOT — MAINTAIN и корень проблемы: default privileges

**Ветка:** `chore/sec-grants-root` от `main`. Миграция — **082**. Один коммит.

Третий и последний спринт по грантам. Первые два (080, 081) убирали **последствия**: снимали
широкие привилегии с уже существующих таблиц. Здесь снимается **причина** — из-за которой
эти привилегии там оказались и появятся снова на следующей же новой таблице.

**Трудоёмкость: ~1–1.5 ч. Риск низкий.** Поведения не меняет, откат — обратный `grant`.

Контекст на момент выдачи (2026-07-27): `main` = после мержа `chore/sec-grants-tail`,
в проде применены 076–**081**. **082 свободна.** Postgres **17.6**.

---

## Зачем: три спринта подряд лечили симптом

Проверено по проду 2026-07-27 (`pg_default_acl`) — вот что выдаётся **каждой новой таблице**
в схеме `public`:

| Грантор | Роли и права по умолчанию на таблицы |
|---|---|
| `postgres` | `postgres`, **`authenticated`**, `service_role` — `arwdDxtm` (всё, включая TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) |
| `supabase_admin` | `postgres`, **`anon`**, **`authenticated`**, `service_role` — `arwdDxtm` |

Отсюда всё и растёт. `grant select, insert … ` в шапке миграции ничего не сужает (урок 075),
`revoke` в 080/081 вычистил уже созданные таблицы — но **дефолты не тронуты**, поэтому
таблица №45 придёт ровно такой же широкой, как приходили 076 и 077. Именно так это и
работало: CC сужал `segments` и `stage_transitions` руками в их собственных миграциях.

Плюс невычищенный остаток: **`MAINTAIN` (`m`, новинка PG 17) держится у `authenticated` на
всех 44 таблицах** — её не снимали ни 075, ни 080, ни 081, потому что искали по трём именам.

### Про недостижимость MAINTAIN — обоснование в отчёте 081 надо поправить

Там записано «через PostgREST недостижима, потому что VACUUM/CLUSTER нельзя выполнить внутри
транзакции». Первая половина верна, вторая — нет: `ANALYZE` и `REINDEX` (без `CONCURRENTLY`)
**транзакционны** и под этот аргумент не подпадают.

Настоящая причина недостижимости надёжнее: **PostgREST не исполняет utility-команды вообще** —
только DML и вызовы функций. Ни `VACUUM`, ни `ANALYZE`, ни `REINDEX` через REST не отправить.
Риск от `MAINTAIN` — не эксплуатация, а то, что привилегия висит вне модели RLS и всплывёт
в следующем аудите. В схему записывать **эту** формулировку.

---

## РАЗВЕДКА

```bash
git branch --show-current && git status --short
ls supabase/migrations/ | tail -3     # ожидание: 080, 081 → берём 082
sed -n '1,30p' supabase/migrations/081_grants_tail.sql   # эталон шапки и формулировок
```

Через Supabase MCP (read-only):

```sql
-- 1. дефолты: кто и что раздаёт новым объектам в public
select pg_get_userbyid(d.defaclrole) as grantor, d.defaclobjtype as objtype, d.defaclacl::text
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' order by 1, 2;

-- 2. масштаб MAINTAIN
select count(*) filter (where array_to_string(relacl,',') like '%authenticated=%m%') as with_maintain,
       count(*) as total
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

-- 3. под какой ролью мы применяем и что нам доступно
select current_user,
       pg_has_role('postgres','supabase_admin','MEMBER') as can_touch_supabase_admin_defaults;
```

**STOP-условия:**

1. 🔴 `can_touch_supabase_admin_defaults` вернул `true` — картина изменилась, дефолты
   `supabase_admin` стали доступны. Тогда чинить **обе** строки, а не одну; доложить.
   (Ожидание на 2026-07-27 — `false`, см. «Ограничение» ниже.)
2. `pg_default_acl` для `postgres` в `public` пуст или уже сужен → значит кто-то правил
   дефолты помимо нас: не перезаписывать вслепую, показать текущее состояние и спросить.
3. В схеме появились **sequences или views** (сейчас их 0) → они под свои дефолты
   (`S` = `rwU` у `authenticated`) и требуют отдельного решения; в 082 не тащить, доложить.
4. 082 занята → следующий свободный, доложить.

---

## Работы

### 1. Починить дефолты для роли `postgres` (корень)

```sql
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;
```

После этого новая таблица, созданная **миграцией** (они применяются под `postgres`), приходит
с `arwd` у `authenticated` — DML под RLS и ничего сверх. Шапка миграции с `grant select …`
наконец начинает означать то, что написано.

`service_role` не трогаем — он ходит в обход RLS по назначению.
`anon` в дефолтах `postgres` нет — там его и не было.

### 2. Снять `MAINTAIN` с уже существующих таблиц (последствие)

```sql
revoke maintain on all tables in schema public from authenticated;
```

Одной строкой по всей схеме — точечно нельзя, иначе метрика «широких привилегий 0»
перестанет сходиться на половине таблиц. `ALL TABLES IN SCHEMA` разворачивается в момент
исполнения, новые таблицы под него не попадают — их закрывает раздел 1.

### 3. Ограничение, которое надо зафиксировать в схеме как конвенцию

Дефолты **`supabase_admin`** (вторая строка таблицы выше — та, что раздаёт полный набор
**включая `anon`**) починить нельзя: `postgres` не член `supabase_admin`
(`pg_has_role` = `false`), а `ALTER DEFAULT PRIVILEGES FOR ROLE` требует членства.

Практический вывод — и это конвенция, а не сноска:

> **Таблицы в `public` создаются только миграциями.** Миграция применяется под `postgres`
> и подчиняется его дефолтам, которые мы починили. Таблица, созданная через UI дашборда
> Supabase, идёт под `supabase_admin` и придёт с полным набором привилегий **у `anon` тоже** —
> то есть в обход всей работы 056/075/080/081/082.

Сейчас таблиц с грантами `anon` — 0, то есть конвенция де-факто соблюдалась. Записать, чтобы
соблюдалась и дальше.

### 4. Обновить метрику «широких привилегий» в `docs/schema.md`

Во всех VERIFY-запросах и в ledger 080/081 «широкие» = `TRUNCATE, REFERENCES, TRIGGER`.
С 082 в набор входит **`MAINTAIN`**. Привести формулировку к:

```sql
select count(*) from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');   -- ожидание: 0
```

⚠️ `information_schema.role_table_grants` — вью стандарта SQL, и `MAINTAIN` как
нестандартную привилегию она может не показывать. **Проверить это на гейте**; если не
показывает — метрику в схеме писать по `pg_class.relacl`:

```sql
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and array_to_string(c.relacl,',') like '%authenticated=%m%';            -- ожидание: 0
```

Второй вариант надёжнее в любом случае — он читает каталог напрямую.

### 5. Что осознанно НЕ делаем

- **Дефолты на функции** (`f` = `X` у `authenticated`): новая функция получает `EXECUTE`
  у `authenticated` автоматически. Это ровно то, из-за чего 056b и приходится повторять
  (072 и S29.1 проскочили). Но сужать дефолт нельзя: большинство функций проекта — RPC,
  которые клиент обязан вызывать, и каждая тогда потребует явного `grant`. Это смена
  конвенции на весь проект, отдельное решение, не в 082.
- **Дефолты на sequences** — в схеме 0 sequences (все ключи `uuid`), править нечего.
- **20 WARN `authenticated_security_definer_function_executable`** — RPC проекта, разбор
  каждой по отдельности, не сплошная правка. Не входит.

---

## VERIFY / коммит

Миграцию **не применять** — apply на гейте.

После apply (гейт):

```sql
-- 1. MAINTAIN не осталось ни у одной таблицы
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and array_to_string(c.relacl,',') like '%authenticated=%m%';            -- ожидание: 0

-- 2. дефолты postgres сужены
select d.defaclacl::text from pg_default_acl d
join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' and d.defaclobjtype='r'
  and pg_get_userbyid(d.defaclrole)='postgres';
-- ожидание: у authenticated осталось arwd, у postgres/service_role — без изменений

-- 3. DML не пострадал
select table_name, string_agg(privilege_type,',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and table_name in ('projects','tasks','ai_runs','segments')
group by 1;                          -- ожидание: DELETE,INSERT,SELECT,UPDATE

-- 4. три прежние привилегии по-прежнему на нуле (не откатились)
select count(*) from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated'
  and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');              -- ожидание: 0
```

**Проверка, ради которой спринт и делался** — создать временную таблицу тем же способом,
каким её создаст будущая миграция, и убедиться, что она приходит узкой:

```sql
create table public.__grants_root_probe (id uuid primary key default gen_random_uuid());
select array_to_string(relacl, ' | ') from pg_class
where relname='__grants_root_probe';
-- ожидание: authenticated=arwd (без D, x, t, m)
drop table public.__grants_root_probe;
```

Ролевой смок под JWT owner — чтение и запись по основным разделам (сделки, задачи, файлы,
сегменты, настройки профиля и организации): ничего не должно сломаться, `MAINTAIN` в
клиентских сценариях не участвует. `advisors` — без новых WARN.

Коммит один:

```
chore(security): default privileges сужены в корне, MAINTAIN снят со всех таблиц
```

**Не пушить.** В отчёте: вывод разведочного запроса по `pg_default_acl` до и после,
результат пробной таблицы (её `relacl`), показывает ли `information_schema` привилегию
`MAINTAIN` (от этого зависит формулировка метрики в схеме), и подтверждение, что конвенция
«таблицы только миграциями» записана в `docs/schema.md` и в копию скилла.
