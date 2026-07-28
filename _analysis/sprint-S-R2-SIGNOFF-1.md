# S-R2-SIGNOFF-1 — Sign-off чеклисты внедрения (`project_checklists`)

**Ветка:** `feat/r2-signoff` от `main`. **Миграции 083, 084.** Один коммит на спринт.

R2-P1-G. Первый спринт фазы P1. Единственный пункт роадмапа P1 с живыми пользователями:
в проде **3 открытых delivery-проекта и 618 задач**, при этом слова `checklist` в `src/`
нет ни одного — фича строится с нуля, не достраивается.

Паттерн: Accelo (Retainer sign-off) + 1С:ДО (согласование документов). Ближайший аналог в
западных CRM — Salesforce **Approval Process** и Zoho **Blueprint transitions**: переход в
терминальный статус блокируется до отметки обязательных пунктов, отметка **штампуется
сервером**, а не клиентом.

**Трудоёмкость: ~12–16 ч. Риск средний** — правится живой gate завершения внедрения
(`check_delivery_completion` + `enforce_delivery_completion`), через который сегодня уже
проходят реальные проекты.

Независим от `AI-HARDEN` и `DWELL-CFG`; катится первым.

---

## ⚠️ Открытые решения — ответить ДО начала

### 1. Тексты пунктов чеклистов (нужен вход от Олега)

Схема и движок в этом спринте — универсальные, но **сид-шаблоны требуют реальных
формулировок из 1С:ДО**. Пока их нет, сидируются два шаблона с рабочими заглушками:

- `doc_review` «Проверка документов перед сдачей» — 4 пункта;
- `handover_support` «Передача на сопровождение» — 4 пункта.

Черновые формулировки — в §Сид. **Если Олег даёт настоящие пункты — заменить дословно.**
Если нет — катить с заглушками: labels лежат в `jsonb`, правятся без миграции, это
осознанно дешёвый откат.

### 2. Существующие 3 внедрения чеклисты НЕ получают

Инстанцирование вешается только на `spawn_delivery_project` (новые внедрения) и на явную
кнопку «Добавить чеклист» в UI. **Бэкфилла нет.**

Причина — H2: gate завершения сегодня работает, и если сид навесит обязательные пункты на
уже идущие проекты, они моментально станут незавершаемыми без действия РП. Это regression,
даже если продуктово «правильно». Хочет Олег бэкфилл — отдельный шаг после того, как
формулировки утверждены.

**Если решения не подтверждены — начинать по варианту по умолчанию и сказать об этом в
отчёте.**

---

## РАЗВЕДКА

```bash
git branch --show-current && git status --short

# gate завершения как есть — ЧИТАТЬ ЦЕЛИКОМ, это единственная точка правки поведения
sed -n '224,270p' supabase/migrations/20260712230000_baseline.sql   # check_delivery_completion
sed -n '588,605p' supabase/migrations/20260712230000_baseline.sql   # enforce_delivery_completion
cat supabase/migrations/archive/038_delivery_completion_gate.sql    # исходный контекст гейта

# клиентская сторона гейта
cat src/lib/hooks/use-delivery-gate.ts
grep -n "parseDeliveryGateError" -A 20 src/lib/hooks/use-projects.ts
cat src/components/projects/DeliveryCompletionModal.tsx

# спавн внедрения — точка инстанцирования
sed -n '13,100p' supabase/migrations/073_fix_spawn_delivery_project_stage.sql
grep -n "copy_delivery_template" -A 30 supabase/migrations/20260712230000_baseline.sql | head -50

# эталон свежей org-таблицы: RLS, revoke, сид, идемпотентность
cat supabase/migrations/077_segments.sql

# куда встраивается UI
grep -n "DeliveryCompletionModal\|DeliveryHealthDot" src/components/projects/ProjectDetail.tsx
ls src/components/projects/
```

**Что подтвердить разведкой перед первой строкой кода:**

1. `check_delivery_completion` возвращает `{ready, open_milestones}` и вызывается **из двух
   мест**: клиентом (`useDeliveryGate`, превью) и триггером `enforce_delivery_completion`
   (BEFORE UPDATE, backstop). Обе поверхности ломаются при неаккуратном расширении.
2. `enforce_delivery_completion` кладёт в `DETAIL` **только** `open_milestones`, а
   `parseDeliveryGateError` на клиенте это парсит. Формат `DETAIL` — контракт, а не
   деталь реализации.
3. `spawn_delivery_project` (073, 4 параметра) в конце зовёт `copy_delivery_template`.
   Инстанцирование чеклистов встаёт **туда же**, тем же паттерном.

---

## Модель данных

Две таблицы: шаблон (org-уровень, редактируется админом) и экземпляр (project-уровень,
отмечается командой). Разделение — как `delivery_templates` → `tasks`, уже принятый в
проекте паттерн; дуального состояния не возникает, потому что экземпляр после создания
живёт своей жизнью и на шаблон не смотрит.

```
checklist_templates (org_id, direction?, delivery_kind?, checklist_type, title, items[labels])
        │ инстанцируется при spawn_delivery_project
        ▼
project_checklists  (org_id, project_id, checklist_type, title, items[+checked/by/at], completed_at)
        │ читается гейтом
        ▼
check_delivery_completion → { ready, open_milestones, open_checklist_items }
        │ backstop
        ▼
enforce_delivery_completion (BEFORE UPDATE ON projects)
```

### `items` — форма jsonb

```ts
// шаблон: только описание пункта
type ChecklistTemplateItem = {
  key: string;        // стабильный slug, по нему идёт toggle
  label: string;
  required: boolean;  // required=true блокирует завершение
};

// экземпляр: то же + отметка
type ChecklistItem = ChecklistTemplateItem & {
  checked: boolean;
  checked_by: string | null;   // uuid профиля, ставит СЕРВЕР
  checked_at: string | null;   // ISO, ставит СЕРВЕР
};
```

`key` уникален внутри одного чеклиста. Порядок пунктов = порядок в массиве, не поле
`order` — переставлять пункты в UI не планируется.

---

## Миграция 083 — таблицы, RLS, гранты, сид

```sql
-- 083: sign-off чеклисты внедрения (S-R2-SIGNOFF-1, R2-P1-G).
--
-- Две таблицы: checklist_templates (org-словарь) + project_checklists (экземпляр).
-- Гейт завершения и RPC отметки — в 084, чтобы откат делился на «данные» и «поведение».
--
-- ⚠️ ОБРАТИМОСТЬ: откат — drop обеих таблиц. Безопасен только ПОСЛЕ отката 084
--    (там функции ссылаются на project_checklists). Порядок отката: 084, затем 083.
--
-- ⚠️ CHECK на checklist_type сужать обратно нельзя, пока в таблицах есть строки с
--    новыми значениями — сначала delete, потом re-narrow.

create table if not exists public.checklist_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  direction      public.project_direction,          -- null = любое направление
  delivery_kind  text check (delivery_kind is null or delivery_kind in ('launch','experiment')),
  checklist_type text not null check (checklist_type in
                   ('doc_review','handover_support','erp_stage_accept','custom')),
  title          text not null,
  items          jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Один активный шаблон на (org, тип, направление, вид) — иначе инстанцирование
-- недетерминировано. NULL в direction/delivery_kind = «на всё», поэтому индекс
-- по coalesce, а не обычный unique (NULL != NULL ломает ограничение).
create unique index if not exists uq_checklist_templates_slot
  on public.checklist_templates (
    org_id, checklist_type,
    coalesce(direction::text, '*'),
    coalesce(delivery_kind,   '*')
  ) where is_active;

create table if not exists public.project_checklists (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  checklist_type text not null check (checklist_type in
                   ('doc_review','handover_support','erp_stage_accept','custom')),
  title          text not null,
  items          jsonb not null default '[]'::jsonb,
  completed_at   timestamptz,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, checklist_type)
);

-- Гейт на каждом завершении читает чеклисты проекта — индекс обязателен.
create index if not exists idx_project_checklists_project
  on public.project_checklists (project_id);
create index if not exists idx_project_checklists_org
  on public.project_checklists (org_id);

-- ── Триггеры новой таблицы — дословно паттерн 077 ──
-- `set_org_id` НЕ вешаем: org_id приходит ЯВНО (из UI при «Добавить чеклист», из
-- instantiate_project_checklists при спавне). Тот же выбор сделан в 077 для segments
-- и в stage_requirements/invitations. В DEFINER-контексте current_org_id() может
-- вернуть NULL, так что явная передача надёжнее подстановки.
--
-- Заморозка org_id обязательна: без неё строку можно перекинуть в чужую org апдейтом.
-- Узкий `before update of org_id` + `when` — копия автоцикла 054 (он покрывает только
-- таблицы, существовавшие на момент 054; новые выписываются руками).
drop trigger if exists trg_aa_freeze_org_id on public.checklist_templates;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.checklist_templates
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.project_checklists;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.project_checklists
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

-- updated_at. ⚠️ Функция называется `update_updated_at` (проверено по pg_trigger на
-- quotes/segments), НЕ `set_updated_at` — имена в проекте разъезжаются, не угадывать.
create trigger trg_set_updated_at
  before update on public.checklist_templates
  for each row execute function public.update_updated_at();
create trigger trg_set_updated_at
  before update on public.project_checklists
  for each row execute function public.update_updated_at();
```

> Префикс `aa_` в имени freeze-триггера не косметика: порядок исполнения триггеров в
> Postgres алфавитный, и проект на этом уже обжёгся (`trg_sync_deal_stage_fields` против
> `trg_sync_project_stage` — второй молча выигрывает).

> **CC: имя функции `set_updated_at` — проверить грепом по baseline и подставить фактическое.**
> В проекте она есть (updated_at держится триггером на всех таблицах), но имя не угадывать.

### RLS — шаблон 077, с одним отличием

```sql
alter table public.checklist_templates enable row level security;
alter table public.project_checklists  enable row level security;

-- ── checklist_templates: читают все члены org, правят owner/admin ──
create policy checklist_templates_select on public.checklist_templates
  for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

create policy checklist_templates_write on public.checklist_templates
  for all to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

-- ── project_checklists: читают все члены org ──
create policy project_checklists_select on public.project_checklists
  for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

-- ⚠️ ОТЛИЧИЕ ОТ 077, ЭТО НЕ ОПЕЧАТКА:
-- INSERT/UPDATE/DELETE на project_checklists — ТОЛЬКО owner/admin.
-- Рядовой участник отмечает пункты НЕ прямым UPDATE, а через DEFINER-RPC
-- toggle_checklist_item (084), которая штампует auth.uid()/now() серверно.
-- Если дать участнику прямой UPDATE на items — он перепишет чужие checked_by,
-- и sign-off перестаёт быть accountability (это F7 ревью архитектуры).
create policy project_checklists_write on public.project_checklists
  for all to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );
```

### Гранты — урок 075/082

С 082 дефолтные привилегии `postgres` в `public` уже сужены в корне: новая таблица из
миграции приходит с `authenticated = arwd` **без единого revoke в своей миграции**. Тем не
менее `grant` выписывается явно — конвенция проекта (CLAUDE.md, «даже если дефолтные
привилегии Supabase их и так дают, см. 069»): миграция должна читаться как самодостаточное
описание прав, а не как «доверься 082».

```sql
revoke all on public.checklist_templates from anon;
revoke all on public.project_checklists  from anon;

grant select, insert, update, delete on public.checklist_templates to authenticated;  -- поверх RLS
grant select, insert, update, delete on public.project_checklists  to authenticated;  -- поверх RLS
```

> **CC: `revoke truncate, references, trigger` НЕ писать** — 082 снял это в корне через
> `alter default privileges`. Это единственное отступление от «выписывать всё явно», и оно
> проверяемо: на гейте права разбираются поэлементно (`unnest(relacl)`, **не** `like` по
> склейке — грабля 080, склейка врёт из-за прав соседней роли).

### Сид (заглушки — заменить, если Олег дал реальные формулировки)

```sql
-- Идемпотентно: конфликт по uq_checklist_templates_slot → do nothing.
insert into public.checklist_templates (org_id, direction, delivery_kind, checklist_type, title, items)
select o.id, null, null, v.checklist_type, v.title, v.items
from public.organizations o,
     (values
       ('doc_review', 'Проверка документов перед сдачей', '[
          {"key":"tz_signed",     "label":"ТЗ подписано заказчиком",             "required":true},
          {"key":"acts_ready",    "label":"Акты сформированы",                   "required":true},
          {"key":"docs_uploaded", "label":"Документы приложены к проекту",       "required":true},
          {"key":"invoice_sent",  "label":"Счёт выставлен",                      "required":false}
        ]'::jsonb),
       ('handover_support', 'Передача на сопровождение', '[
          {"key":"instructions",  "label":"Инструкции переданы пользователям",   "required":true},
          {"key":"contacts",      "label":"Контакты сопровождения переданы",     "required":true},
          {"key":"kb_article",    "label":"Описание решения в базе знаний",      "required":false},
          {"key":"support_brief", "label":"Бриф для линии сопровождения",        "required":false}
        ]'::jsonb)
     ) as v(checklist_type, title, items)
on conflict do nothing;
```

---

## Миграция 084 — RPC отметки, гейт, инстанцирование

### 1. `toggle_checklist_item` — единственный путь отметки

```sql
-- DEFINER: штампует actor и время СЕРВЕРНО. Прямой UPDATE items рядовому участнику
-- закрыт политикой из 083 — это и есть смысл sign-off.
create or replace function public.toggle_checklist_item(
  p_checklist_id uuid,
  p_item_key     text,
  p_checked      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   public.project_checklists%rowtype;
  v_items jsonb;
  v_found boolean := false;
  v_actor uuid := auth.uid();
begin
  select * into v_row from public.project_checklists where id = p_checklist_id;
  if not found then
    raise exception 'checklist_toggle_denied: not found' using errcode = '42501';
  end if;

  -- Guard как в check_stage_requirements: DEFINER обязан проверять членство сам.
  if v_actor is null or not public.is_org_member(v_row.org_id) then
    raise exception 'checklist_toggle_denied: not a member of project org' using errcode = '42501';
  end if;

  select jsonb_agg(
           case when it->>'key' = p_item_key
             then it
                  || jsonb_build_object('checked', p_checked)
                  || case when p_checked
                       then jsonb_build_object('checked_by', v_actor,
                                               'checked_at', to_char(now() at time zone 'UTC',
                                                                     'YYYY-MM-DD"T"HH24:MI:SS.USZ'))
                       else jsonb_build_object('checked_by', null, 'checked_at', null)
                     end
             else it
           end
           order by ord
         ),
         bool_or(it->>'key' = p_item_key)
    into v_items, v_found
  from jsonb_array_elements(v_row.items) with ordinality as t(it, ord);

  if not coalesce(v_found, false) then
    raise exception 'checklist_toggle_denied: unknown item key %', p_item_key using errcode = '22023';
  end if;

  update public.project_checklists
     set items        = coalesce(v_items, '[]'::jsonb),
         completed_at = case
           when not exists (
             select 1 from jsonb_array_elements(coalesce(v_items,'[]'::jsonb)) x
             where (x->>'required')::boolean and not coalesce((x->>'checked')::boolean, false)
           ) then now()
           else null
         end
   where id = p_checklist_id;

  return (select items from public.project_checklists where id = p_checklist_id);
end $$;

revoke all on function public.toggle_checklist_item(uuid, text, boolean) from public, anon;
grant execute on function public.toggle_checklist_item(uuid, text, boolean) to authenticated;
```

**Почему `to_char(... at time zone 'UTC', ...)`, а не `now()::text`:** грабля из 079 —
`::text` для `timestamptz` зависит от session `TimeZone`/`DateStyle`, и значение,
записанное из UI (MSK), не совпадёт со значением из cron/скрипта (UTC). Здесь это не
идемпотентность, но тот же класс бага, и клиент парсит строку как ISO.

**`with ordinality` обязателен:** без него `jsonb_agg` не гарантирует порядок, и пункты
чеклиста будут переставляться на каждой отметке.

### 2. Расширение гейта

```sql
create or replace function public.check_delivery_completion(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project    public.projects%rowtype;
  v_open       jsonb;
  v_open_items jsonb;
begin
  -- ... блок guard'ов БЕЗ ИЗМЕНЕНИЙ (скопировать из baseline:229–244 дословно) ...
  -- ... блок v_open (открытые вехи) БЕЗ ИЗМЕНЕНИЙ ...

  -- НОВОЕ: незакрытые обязательные пункты чеклистов
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'checklist_id', c.id,
               'checklist',    c.title,
               'key',          x->>'key',
               'label',        x->>'label'
             ) order by c.title, x->>'label'
           ),
           '[]'::jsonb
         )
    into v_open_items
  from public.project_checklists c,
       lateral jsonb_array_elements(c.items) x
  where c.project_id = p_project_id
    and coalesce((x->>'required')::boolean, false)
    and not coalesce((x->>'checked')::boolean, false);

  return jsonb_build_object(
    'ready',               jsonb_array_length(v_open) = 0
                           and jsonb_array_length(v_open_items) = 0,
    'open_milestones',     v_open,
    'open_checklist_items', v_open_items
  );
end $$;
```

> ⚠️ **`open_milestones` остаётся в ответе с тем же именем и формой.** Ключ добавляется,
> существующий не переименовывается и не вкладывается — иначе `useDeliveryGate` и модалка
> сломаются молча (H2).

### 3. `enforce_delivery_completion` — DETAIL

Триггер читает `ready` и кладёт в `DETAIL` **только** `open_milestones`. Теперь `ready`
может быть `false` из-за чеклистов — и `DETAIL` придёт пустым массивом, а модалка покажет
«всё в порядке, но не сохраняется». Правится:

```sql
create or replace function public.enforce_delivery_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if NEW.type = 'delivery' and OLD.status = 'open' and NEW.status = 'completed' then
    v_result := public.check_delivery_completion(NEW.id);
    if not (v_result->>'ready')::boolean then
      -- DETAIL = ВЕСЬ результат, а не только вехи. Клиент разбирает по ключам.
      raise exception 'delivery_gate_failed'
        using DETAIL = v_result::text, ERRCODE = 'P0001';
    end if;
  end if;
  return NEW;
end $$;
```

**Это breaking change для `parseDeliveryGateError`** — раньше приходил голый массив вех,
теперь объект. Клиент правится в том же коммите (см. UI), парсер обязан пережить **оба**
формата: `Array.isArray(parsed) ? {open_milestones: parsed} : parsed`. Причина — между
apply миграции и деплоем фронта есть окно, и старый клиент не должен падать.

### 4. Инстанцирование при спавне

```sql
create or replace function public.instantiate_project_checklists(
  p_project_id uuid, p_direction public.project_direction, p_kind text
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid; v_count int := 0;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null then return 0; end if;

  insert into public.project_checklists (org_id, project_id, checklist_type, title, items)
  select v_org, p_project_id, t.checklist_type, t.title,
         -- пункты шаблона превращаются в пункты экземпляра: + checked/by/at
         (select coalesce(jsonb_agg(
                   x || jsonb_build_object('checked', false,
                                           'checked_by', null,
                                           'checked_at', null)
                   order by ord), '[]'::jsonb)
            from jsonb_array_elements(t.items) with ordinality as e(x, ord))
  from public.checklist_templates t
  where t.org_id = v_org and t.is_active
    and (t.direction is null or t.direction = p_direction)
    and (t.delivery_kind is null or t.delivery_kind = p_kind)
  on conflict (project_id, checklist_type) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
```

И вызов в конце `spawn_delivery_project` — **строго после** `copy_delivery_template`,
рядом с ним:

```sql
  if v_template_id is not null then
    perform public.copy_delivery_template(v_new_id, v_template_id);
  end if;

  -- НОВОЕ (084): чеклисты sign-off. Отсутствие шаблонов — не ошибка спавна.
  perform public.instantiate_project_checklists(v_new_id, v_deal.direction, p_kind);

  return v_new_id;
```

> **CC: `spawn_delivery_project` переписывается целиком через `create or replace`,
> взяв тело из 073 дословно и добавив одну строку.** Не редактировать 073 —
> миграции неизменяемы.

`instantiate_project_checklists` — служебная, клиент её не зовёт:

```sql
revoke all on function public.instantiate_project_checklists(uuid, public.project_direction, text)
  from public, anon, authenticated;
```

(Паттерн 056b: функции, которые зовут только другие функции, `EXECUTE` у `authenticated`
не получают. `spawn_delivery_project` — DEFINER, вызовет её от владельца.)

---

## UI

### 1. `use-project-checklists.ts` (новый хук)

```ts
useProjectChecklists(projectId: string)            // список чеклистов проекта
useToggleChecklistItem()                           // rpc('toggle_checklist_item', {...})
```

Ключ кэша — по конвенции §2.4 архдока: `['project-checklists', projectId]`.
После успешного toggle инвалидировать и `['delivery-gate', projectId]` — иначе модалка
покажет устаревший список.

Оптимистичного апдейта **не делать**: `checked_by`/`checked_at` приходят с сервера, а
подставлять их на клиенте — ровно та ложь, от которой уходим.

### 2. `ChecklistCard.tsx` (новый компонент)

Карточка одного чеклиста на вкладке внедрения: заголовок, пункты чекбоксами,
у отмеченных — «кто и когда» мелким текстом (имя из `useProfiles`, не uuid).
Обязательные пункты помечены визуально. При `completed_at != null` — заголовок с
зелёной галочкой.

A11y: каждый чекбокс — `<input type="checkbox">` с `<label htmlFor>`, не div с onClick;
состояние загрузки — `disabled` **настоящий**, не серый на вид (грабля SDP из хвостов P0).

### 3. `DeliveryCompletionModal.tsx` (правка)

- Под списком вех — второй блок «Не отмечены обязательные пункты» из
  `gate.data.open_checklist_items`.
- Пункты кликабельны прямо в модалке (тот же `useToggleChecklistItem`) — иначе РП
  вынужден закрывать модалку, идти на вкладку, возвращаться.
- Кнопка «Завершить» `disabled` пока `ready !== true` — сейчас это так и есть, проверить,
  что условие смотрит на `ready`, а не на `openMilestones.length`.
- `gateError` из backstop теперь может содержать оба списка — компонент рендерит оба.

### 4. `ProjectDetail.tsx` (правка)

Для `type === 'delivery'` — секция чеклистов рядом с вехами. Кнопка «Добавить чеклист»
(owner/admin) — открывает выбор из активных шаблонов org, зовёт insert. Это же покрывает
существующие три внедрения без бэкфилла.

### 5. Настройки (правка)

`ChecklistTemplatesSection` в Настройках, рядом с `AutomationsSection`: список шаблонов,
редактор пунктов (label + required), только owner/admin. Без этого labels правятся только
SQL'ем, и §Открытое решение 1 никогда не закроется.

---

## Границы

- **Не трогать** `stage_requirements` / `check_stage_requirements` — это hard-гейт стадий
  сделки, ортогонален sign-off внедрения. Смешение — прямой путь к неотлаживаемому гейту.
- **Не заводить** `playbook_checks` и любое второе состояние отметок на `projects`.
- **Не делать** бэкфилл на существующие проекты (см. Открытое решение 2).
- **Не делать** approval-flow (второй согласующий, статусы «на согласовании») — это P3-D,
  отдельное go/no-go.
- `checklist_type = 'erp_stage_accept'` заведён в CHECK, но **шаблон под него не сидируется**
  и UI под поэтапную приёмку ERP не делается — это P1-I (ERP parity).
- Уведомлений на отметку пунктов нет. Захочет Олег — через существующий `automation_rules`,
  не новым контуром.

---

## VERIFY / коммит

### Типы

```bash
# после apply миграций — только через MCP-реген на гейте, руками database.ts не править
npm run typecheck && npm run lint
```

### Смоки на гейте (Cowork, не CC)

**Ролевые, 4 роли × 3 действия** — по образцу 15 смоков `S-R2-SEGMENTS-1`:

| # | Роль | Действие | Ожидание |
|---|---|---|---|
| 1 | member | `select` чеклист своей org | видит |
| 2 | member | `select` чеклист чужой org | 0 строк |
| 3 | member | прямой `update items` | **42501** |
| 4 | member | `rpc toggle_checklist_item` на своей org | ok, `checked_by = auth.uid()` |
| 5 | member | `rpc toggle_checklist_item` на чужой org | 42501 |
| 6 | member | `rpc` с несуществующим `key` | 22023 |
| 7 | admin | `insert` чеклист | ok |
| 8 | admin | `update title` | ok |
| 9 | anon | любое | 0 строк / отказ |

**Гейт завершения, 4 сценария:**

| # | Состояние | `ready` | UPDATE status='completed' |
|---|---|---|---|
| 10 | вехи закрыты, чеклистов нет | `true` | проходит (**регресс-тест: старое поведение цело**) |
| 11 | вехи закрыты, обяз. пункт не отмечен | `false` | P0001, `DETAIL` содержит `open_checklist_items` |
| 12 | веха открыта, чеклисты закрыты | `false` | P0001, `DETAIL` содержит `open_milestones` |
| 13 | всё закрыто | `true` | проходит |

**Спавн, 2 сценария:**

| # | Проверка |
|---|---|
| 14 | `spawn_delivery_project` на won-сделке → создались 2 чеклиста с `checked=false` |
| 15 | повторный `instantiate` на том же проекте → 0 новых (`on conflict do nothing`) |

**Мультитенантность, 2 сценария (конвенция CLAUDE.md):**

| # | Проверка |
|---|---|
| 16 | `insert` с `org_id` чужой org → отказ по RLS `with check` |
| 17 | `update ... set org_id = <чужая org>` → отказ от `trg_aa_freeze_org_id` |

Смок №10 — самый важный во всём спринте: он доказывает, что три идущих внедрения
завершаются как раньше.

### Advisors

После apply — `get_advisors` security. Ожидаемая дельта: **+2 WARN**
`authenticated_security_definer_function_executable` (`toggle_checklist_item`;
`check_delivery_completion` уже в списке). Это RPC проекта, снимать EXECUTE нельзя —
пометить в отчёте как принятое, не «новая проблема».

### Билд

```bash
npm run build   # последним, при убитом next dev
```

### Коммит

```
feat(delivery): sign-off чеклисты внедрения (083, 084)
```

Один коммит. Ветка `feat/r2-signoff`. Мержит и пушит Олег.

### Верификация в отчёте

```
Type Safety:            [заполнить]
RLS Coverage:           [заполнить — 9 ролевых смоков]
Backward Compatibility: [заполнить — смок №10 обязателен]
Runtime Tested:         [заполнить]
Regional Availability:  NOT_APPLICABLE
```

---

## Что НЕ делает Claude Code

- Не применяет 083/084 — apply только через Cowork-гейт.
- Не правит `src/types/database.ts` и `supabase.gen.ts` руками.
- Не читает `.env`.
- Не трогает прод-БД никаким способом.
- Отчёт — отчётом о сделанном, не планом с распределением ответственности.
