# Claude Code Prompt — S-EXPORT-1: экспорт организации (JSON, владелец)

**Контекст.** Ось 5 роадмапа, пункт «экспорт org» — единственный из трёх швов
опциональности, который **проверяется целиком сегодня**: не зависит ни от внешних
сервисов, ни от накопления данных, ни от второго провайдера. Закрывает развилку Р1
(152-ФЗ, переносимость) и снимает аргумент «данные заперты в чужом Supabase».

**Разведка живой БД 21.08** (`uoiavcabxgdjugzryrmj`, read-only):

- **50 таблиц** с `org_id`, у всех `rowsecurity = true`
- Организация одна, `memberships`: `owner` — 1, `manager` — 4
- Объём крошечный: `activity_log` 1357, `companies` 261, `tasks` 184, `contacts` 87,
  `projects` 19, остальное — десятки или ноль. Весь экспорт — единицы мегабайт.
  **Пагинация и фоновая сборка не нужны**, но лимит-предохранитель заложить

## Ключевое архитектурное решение — прочитать до кода

Экспорт читает данные **через RLS от имени пользователя**, а не в обход неё.

**Почему `SECURITY INVOKER`, а не `DEFINER`.** У `DEFINER` изоляция организаций держится
на правильности фильтра внутри функции: одна ошибка в `where org_id = ...` — и владелец
одной org выгружает чужую. У `INVOKER` изоляция держится на RLS, которая уже написана,
уже проверена advisors и уже покрыта ролевыми смоками. Экспорт по определению отдаёт
пользователю то, что он и так вправе видеть, — значит совпадает с RLS один в один
и не нуждается в собственной копии правил.

Прецедент в проекте: `entity_timeline` сделана `SECURITY INVOKER` осознанно
(см. `journal.md`, раздел S-TL). Это второй такой случай, и по той же причине.

**Следствие, которое надо принять и записать:** экспорт у `owner` и у `manager` будет
разного объёма — ровно настолько, насколько различаются их права по RLS. Это не дефект,
а свойство: экспорт отдаёт данные организации в том объёме, в каком они доступны
запросившему. Кнопка при этом показывается **только владельцу** — чтобы не создавать
у manager ложного впечатления, что он выгрузил всю организацию.

## РАЗВЕДКА (обязательно)

```bash
grep -rn "SECURITY INVOKER" supabase/migrations/ | head
grep -n "memberships" supabase/migrations/*.sql | tail -5
ls src/components/settings/
grep -n "OrgSettingsSection\|export" src/components/settings/SettingsContent.tsx | head -20
grep -rn "is_owner\|role = 'owner'\|role='owner'" src/lib --include=*.ts | head
```

Номер следующей миграции — **запросом к `supabase_migrations.schema_migrations`**, не из
папки и не из CLAUDE.md (в папке номера теряются: 047 и 088a применены без файла).
Ориентир на 21.08 — применена 125, но **сверять ledger целиком**, не грепом по номеру.

## ЗАДАЧА 1: зафиксировать состав экспорта — контракт, не «все таблицы»

### Context
Из 50 org-таблиц в экспорт идут **бизнес-данные**, а не механика транспорта. Слепой дамп
всего вынесет наружу секреты и мусор очередей, а при восстановлении в другой системе
эти строки бесполезны.

### Steps
Создай `src/lib/domain/org-export.ts` с явным списком-контрактом:

```ts
/**
 * Состав экспорта организации — контракт, а не «всё подряд».
 * Три категории, решение по каждой принято в S-EXPORT-1.
 */
export const EXPORT_TABLES = [
  // Ядро CRM
  'companies', 'contacts', 'contact_company', 'leads', 'deal_stakeholders',
  'projects', 'project_members', 'project_columns', 'project_checklists',
  'project_baselines', 'baseline_tasks',
  'tasks', 'task_dependencies', 'recurring_task_templates',
  'calls', 'scheduled_calls', 'meetings', 'transcripts', 'quotes',
  'stage_transitions', 'stage_requirements', 'segments',
  'conversations', 'conversation_members', 'messages', 'message_reactions',
  'kpi_entries', 'call_tracker_days', 'activity_log',
  'delivery_templates', 'delivery_template_phases', 'delivery_template_tasks',
  'checklist_templates', 'automation_rules',
] as const;

/**
 * НЕ экспортируется. Причина у каждой — иначе следующий спринт вернёт их «до кучи».
 */
export const EXCLUDED_TABLES = {
  webhook_endpoints:       'secret_id ссылается на Vault — выгрузка секретов наружу',
  webhook_deliveries:      'журнал доставки, не данные организации',
  telegram_accounts:       'привязка к аккаунту Telegram — не переносится в другую систему',
  telegram_outbox:         'очередь транспорта',
  telegram_updates:        'журнал идемпотентности',
  telegram_link_tokens:    'одноразовые токены привязки',
  telegram_capture_drafts: 'черновики разбора, живут минуты',
  notifications:           'производное от задач и сделок',
  automation_runs:         'журнал прогонов, не данные',
  ai_runs:                 'журнал прогонов AI; токены и цены — внутренняя телеметрия',
  conversation_reads:      'состояние прочитанности, персональное',
  invitations:             'приглашения с токенами',
  memberships:             'состав организации выгружается отдельно, в meta',
  activities:              'мёртвая таблица, не пополняется с 15.07 (дубль activity_log)',
  project_files:           'метаданные без самих файлов вводят в заблуждение — S-EXPORT-2',
  project_videos:          'то же',
  message_attachments:     'то же',
} as const;
```

⚠️ **Сверить список с разведкой.** Если в БД появилась таблица, которой нет ни в одном
из двух списков — не угадывать: добавить в отчёт отдельной строкой, чтобы решение принял
владелец.

### Verification
```bash
npx tsc --noEmit
```

## ЗАДАЧА 2: миграция — RPC `export_org_data`

### Context
Один вызов вместо 34 запросов из браузера. `SECURITY INVOKER` — обоснование выше.

### Steps
Файл `supabase/migrations/<NNN>_org_export.sql` (номер из ledger):

```sql
-- S-EXPORT-1: выгрузка данных организации одним вызовом.
-- SECURITY INVOKER намеренно: изоляция org держится на RLS, а не на фильтре внутри
-- функции. Экспорт отдаёт ровно то, что вызывающий и так вправе прочитать.
-- Второй такой случай в проекте после entity_timeline, и по той же причине.
create or replace function public.export_org_data(p_org_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_table   text;
  v_rows    jsonb;
  v_tables  text[] := array[
    'companies','contacts','contact_company','leads','deal_stakeholders',
    'projects','project_members','project_columns','project_checklists',
    'project_baselines','baseline_tasks',
    'tasks','task_dependencies','recurring_task_templates',
    'calls','scheduled_calls','meetings','transcripts','quotes',
    'stage_transitions','stage_requirements','segments',
    'conversations','conversation_members','messages','message_reactions',
    'kpi_entries','call_tracker_days','activity_log',
    'delivery_templates','delivery_template_phases','delivery_template_tasks',
    'checklist_templates','automation_rules'
  ];
begin
  -- Членство проверяем явно: RLS не даст чужие строки, но без этой проверки
  -- посторонний получил бы объект с пустыми массивами вместо честной ошибки.
  if not exists (
    select 1 from memberships m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  ) then
    raise exception 'not a member of organization %', p_org_id
      using errcode = '42501';
  end if;

  foreach v_table in array v_tables loop
    -- Таблица берётся из массива-литерала выше, не из аргумента функции —
    -- пользовательский ввод в идентификатор не попадает.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select * from public.%I where org_id = $1 limit 50000
       ) t', v_table)
    into v_rows using p_org_id;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
  end loop;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'org_id',      p_org_id,
      'exported_at', now(),
      'exported_by', auth.uid(),
      'format',      'dashboard-crm/org-export@1',
      'tables',      to_jsonb(v_tables)
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role))
      from memberships m where m.org_id = p_org_id
    ), '[]'::jsonb),
    'data', v_result
  );
end;
$$;

revoke all on function public.export_org_data(uuid) from public, anon;
grant execute on function public.export_org_data(uuid) to authenticated;

comment on function public.export_org_data(uuid) is
  'S-EXPORT-1. Выгрузка данных организации в JSON. SECURITY INVOKER: объём определяется '
  'правами вызывающего по RLS. Состав таблиц — контракт из src/lib/domain/org-export.ts, '
  'исключения и причины там же в EXCLUDED_TABLES.';
```

⚠️ **Миграцию НЕ применять.** Написать файл и закоммитить — применяет гейт.

⚠️ Список таблиц продублирован в SQL и TS. Это осознанно: SQL-массив — исполняемый
контракт, TS — документированный с причинами исключений. **В отчёте отметить, что списки
сверены построчно.**

### Verification
```bash
ls supabase/migrations/ | tail -3
grep -c "'" supabase/migrations/<NNN>_org_export.sql
```

## ЗАДАЧА 3: хук `use-org-export`

### Context
Скачивание файла — побочный эффект, ему место в мутации, не в компоненте.

### Steps
`src/lib/hooks/use-org-export.ts`:
- `useMutation`, вызывает `supabase.rpc('export_org_data', { p_org_id: orgId })`
- Ошибку `42501` разбирать в понятный текст, а не показывать код
- Результат → `Blob` (`application/json`) → `URL.createObjectURL` → клик по временной
  `<a download>` → **обязательно** `URL.revokeObjectURL` в `finally`
- Имя файла: `dashboard-crm-export-YYYY-MM-DD.json` — дату брать локальную,
  не `toISOString()` (в проекте уже была правка off-by-one на UTC, см. `learnings.md`)
- Типизация: возврат RPC — `unknown`, сузить через guard; `any` запрещён контрактом

### Verification
```bash
npx tsc --noEmit && npx eslint src/lib/hooks/use-org-export.ts
```

## ЗАДАЧА 4: кнопка в настройках

### Context
Место — рядом с настройками организации, где уже живёт `OrgSettingsSection`.

### Steps
- Секция «Данные организации» в `src/components/settings/SettingsContent.tsx`
- Кнопка **видна только `owner`** (роль из membership; способ проверки взять из разведки —
  не изобретать новый)
- Состояния: idle → «Готовлю выгрузку…» с блокировкой повторного клика → успех (toast
  с числом строк) → ошибка (toast с текстом, не с кодом)
- Рядом одна строка мелким шрифтом: что входит в выгрузку и что не входит
  (секреты, очереди транспорта, файлы) — без этого пользователь решит, что выгрузил всё
- `window.confirm` запрещён; подтверждение здесь не нужно — операция читающая

### Verification
```bash
npm run lint && npx tsc --noEmit
```

## ЗАДАЧА 5: тесты

### Steps
`tests/unit/org-export.test.ts`:
1. `EXPORT_TABLES` и `EXCLUDED_TABLES` **не пересекаются**
2. Ни одна таблица из `EXCLUDED_TABLES` не попала в SQL-массив миграции
   (прочитать файл миграции, регуляркой достать список, сравнить с `EXPORT_TABLES`) —
   это защита от расхождения двух списков
3. Имя файла формируется по локальной дате: замокать дату на 23:30 MSK и проверить,
   что в имени сегодняшнее число, а не завтрашнее

### Verification
```bash
npm run test
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npm run lint && npx tsc --noEmit && npm run test
git status --short
```

## КОММИТ

Ветка `feat/org-export` **от свежего main** (ruleset требует up-to-date):

```bash
git checkout main && git pull
git checkout -b feat/org-export
git add src supabase/migrations tests
git commit -m "feat(export): выгрузка данных организации в JSON (S-EXPORT-1)"
```

**Не мержить, не пушить, миграцию не применять.**

## ОТЧЁТ

Отчёт: номер миграции и чем он подтверждён (вывод запроса к ledger); таблицы из БД,
не попавшие ни в один из двух списков; подтверждение построчной сверки SQL-массива
и `EXPORT_TABLES`; вывод финальной проверки.

---

## На гейте (не задача CC)

1. `apply_migration` → `list_migrations` → advisors
2. **Ролевые смоки:** прогон `export_org_data` под `owner` (полный объём) и под `manager`
   (объём по его RLS, меньше или равен); под пользователем не из org — ожидается ошибка
   `42501`, а не пустой объект
3. Открыть выгруженный JSON: `meta.format`, число строк по ключевым таблицам сверить
   с прямым `count(*)`

## Что НЕ входит

- **CSV** — S-EXPORT-2, вместе с выгрузкой файлов из Storage
- **Импорт** — обратная операция сложнее на порядок (конфликты id, порядок вставки,
  перенос владельцев). Экспорт ценен сам по себе: данные не заперты
- **Расписание/автобэкап** — сначала ручная кнопка, чтобы стало видно реальное время
