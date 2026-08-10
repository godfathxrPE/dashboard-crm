# Claude Code Prompt — Sprint LEAD-CORE-1: Лид как рабочая сущность (ядро данных)

Первый из двух спринтов по согласованному варианту B (см. `leads-entity-design.md`).
Этот спринт — данные и связи: поля работы, ownership, вход лида в граф активностей,
конверсия с переносом истории. Страница `/leads/[id]`, серверный timeline для лида,
TodayView и Analytics — спринт LEAD-HUB-2, **не трогать здесь**.

## Контекст и границы

- Таблица `leads` (016/018) — плоский триаж: title/source/status/direction/raw-поля/
  конверсионные ссылки. Ownership — legacy `user_id → auth.users` (против конвенции проекта).
- Звонки и задачи к лиду не привязываются вообще — история до конверсии не существует.
- Миграции НЕ применять: написать в `supabase/migrations/` и закоммитить. Применяет гейт.
- `supabase.gen.ts` не трогать (реген на гейте). `docs/schema.md` — обновить этим же PR.
- Номера миграций ниже (117–119) — **рабочая гипотеза на 2026-08-09**
  (последняя применённая — `org_timeline` = 115, файл `116_cleanup_orphan_import_tasks.sql`
  написан и ждёт гейта). Сверить ledger'ом в РАЗВЕДКЕ; занято — сдвинуть.

## РАЗВЕДКА (перед любыми правками)

```sql
-- 1. Номер следующей миграции: ledger целиком (069–073 записаны без числового префикса!)
select version, name from supabase_migrations.schema_migrations order by version desc limit 10;
```

```bash
ls supabase/migrations/ | sort | tail -5
```

```sql
-- 2. Текущие политики и триггеры leads (зафиксировать «до»)
select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename='leads';
select tgname from pg_trigger where tgrelid='public.leads'::regclass and not tgisinternal;

-- 3. Живые тела функций, которые будем менять/копировать как образец (p.prokind='f'!)
select pg_get_functiondef(p.oid) from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f'
  and p.proname in ('convert_lead','log_delete_call','stamp_quote_status','update_leads_updated_at');
```

```bash
# 4. Клиентские потребители Lead-типов
grep -rn "LeadInsert\|user_id" src/lib/hooks/use-leads.ts src/components/leads/ | head -30
grep -rn "lead" src/components/calls/CallModal.tsx | head
```

Факты, уже проверенные по живой БД (2026-08-09), — сверить, что не изменились:

- Политики leads: `leads_select` (org, authenticated), `leads_insert_own`
  (org + `user_id = auth.uid()`, **роль НЕ проверяется** — комментарий в LeadsView
  «viewer не создаёт (RLS 42501)» живой политикой не подтверждается),
  `leads_update`/`leads_delete` (org + (owner/admin ∨ `user_id = auth.uid()`)).
- Триггеры leads: `trg_aa_freeze_org_id`, `trg_set_org_id`, `trg_leads_updated_at`
  (функция называется `update_leads_updated_at` — своя, не общий `update_updated_at`).
- `entity_timeline(p_entity_type, …)` (112–115) знает `project|company|contact|org` —
  ветку `lead` добавит спринт 2, здесь НЕ трогать.
- `calls`: есть `company_id/contact_id/project_id`, `created_by`; `tasks` — аналогично;
  `activity_log` — entity-links `project_id/contact_id/company_id` (042-паттерн:
  nullable FK + partial index).

---

## ЗАДАЧА 1 — Миграция 117: поля работы + ownership + RLS

`supabase/migrations/117_lead_work_fields.sql` (номер — из разведки):

```sql
-- ═══ 117: leads — поля работы, ownership на owner_id, RLS с ролью ═══

alter table public.leads
  add column owner_id           uuid default auth.uid() references public.profiles(id) on delete set null,
  add column next_step          text,
  add column next_action_date   date,
  add column temperature        text,
  add column estimated_value    bigint,
  add column pain               text,
  add column budget_status      text not null default 'unknown',
  add column decision_role      text,
  add column chz_groups         text[],
  add column regulatory_deadline date,
  add column first_contacted_at timestamptz,
  add column qualified_at       timestamptz;

alter table public.leads
  add constraint leads_temperature_check
    check (temperature is null or temperature in ('hot','warm','cold')),
  add constraint leads_budget_status_check
    check (budget_status in ('unknown','none','estimated','confirmed')),
  add constraint leads_estimated_value_check
    check (estimated_value is null or estimated_value >= 0);

comment on column public.leads.estimated_value is 'Оценка суммы, КОПЕЙКИ (как projects.budget / quotes.amount)';
comment on column public.leads.user_id is 'DEPRECATED c 117: ownership — owner_id. Держится default''ом до отдельной миграции удаления';

-- Бэкфилл владельца из legacy user_id (guard: profile может не существовать)
update public.leads l
   set owner_id = l.user_id
 where l.owner_id is null
   and exists (select 1 from public.profiles p where p.id = l.user_id);

-- user_id больше не пишется клиентом: default закрывает NOT NULL
alter table public.leads alter column user_id set default auth.uid();

-- ═══ RLS: ownership на owner_id, insert получает роль ═══
-- Семантика сохранена (manager правит свои, owner/admin — все) с одним осознанным
-- ужесточением: insert теперь требует роль owner/admin/manager — старая
-- leads_insert_own роль НЕ проверяла, viewer мог создать лид вопреки UI.

drop policy leads_insert_own on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

drop policy leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( ( select public.current_org_role() ) in ('owner','admin')
          or owner_id = ( select auth.uid() ) )
  )
  with check ( org_id = ( select public.current_org_id() ) );

drop policy leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( ( select public.current_org_role() ) in ('owner','admin')
          or owner_id = ( select auth.uid() ) )
  );

create index idx_leads_owner       on public.leads(owner_id)         where owner_id is not null;
create index idx_leads_next_action on public.leads(next_action_date) where next_action_date is not null;
```

Заметки:

- `revoke truncate/references/trigger` не нужен — 082 сузил дефолты в корне.
- Обе функции ролей — в initplan-обёртке `( select … )`, как во всём проекте.
- `owner_id → profiles`, НЕ `auth.users` (конвенция новых колонок).
- Старые политики висели на `to public` — новые на `to authenticated` (048-паттерн).

## ЗАДАЧА 2 — Миграция 118: лид входит в граф активностей

`supabase/migrations/118_lead_activity_links.sql`:

```sql
-- ═══ 118: calls/tasks/activity_log.lead_id + штампы статуса + журнал ═══

alter table public.calls
  add column lead_id uuid references public.leads(id) on delete set null;
alter table public.tasks
  add column lead_id uuid references public.leads(id) on delete set null;
alter table public.activity_log
  add column lead_id uuid references public.leads(id) on delete cascade;

create index idx_calls_lead        on public.calls(lead_id)        where lead_id is not null;
create index idx_tasks_lead        on public.tasks(lead_id)        where lead_id is not null;
create index idx_activity_log_lead on public.activity_log(lead_id) where lead_id is not null;

-- ═══ Штампы времени по смене статуса (образец — stamp_quote_status из 053) ═══
create or replace function public.stamp_lead_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'contacted' and old.status = 'new' and new.first_contacted_at is null then
    new.first_contacted_at := now();
  end if;
  if new.status = 'qualified' and new.qualified_at is null then
    new.qualified_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_lead_status() from public, anon, authenticated;

create trigger trg_zz_stamp_lead_status
  before update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.stamp_lead_status();

-- ═══ Журнал смены статуса (в activity_log, entity-link lead_id) ═══
create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_log (org_id, lead_id, user_id, event_type, payload)
  values (
    new.org_id, new.id, auth.uid(), 'lead_status_changed',
    jsonb_build_object(
      'from', old.status, 'to', new.status,
      'disqualify_reason', new.disqualify_reason,
      'title', new.title
    )
  );
  return null;
end;
$$;
revoke all on function public.log_lead_status_change() from public, anon, authenticated;

create trigger trg_zy_log_lead_status
  after update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_lead_status_change();

-- ═══ Журнал удаления (образец — log_delete_call из 009/011; тело взять из живой БД) ═══
-- log_delete_lead(): AFTER DELETE → activity_log(event_type 'entity_deleted',
-- payload {entity:'lead', title, status}). ВАЖНО: lead_id в запись НЕ писать —
-- FK ON DELETE CASCADE снёс бы её же; журнал удаления живёт без entity-link,
-- как у остальных сущностей.
```

Заметки:

- Порядок BEFORE-триггеров алфавитный: `trg_aa_freeze_org_id` → `trg_leads_updated_at` →
  `trg_zz_stamp_lead_status` — штамп видит уже вычищенный org_id, конфликтов нет.
- Каскадов статуса из триггеров НЕТ намеренно (грабля «два пересекающихся триггера»
  на projects не чинится до сих пор): статус меняет только клиент, триггеры лишь
  штампуют время и пишут журнал.
- `log_delete_lead` писать по живому телу `log_delete_call` (разведка §3), не по файлу
  миграции — живое тело короче файла (Postgres не хранит комментарии).

## ЗАДАЧА 3 — Миграция 119: convert_lead переносит историю

`supabase/migrations/119_convert_lead_history.sql`:

Взять живое тело `convert_lead` из разведки §3 и внести **минимальные** правки
(learning: DEFINER-функции меняем точечно, сохраняя search_path/ACL/гарды —
внутри есть гард владения, его не трогать). После существующего создания
company/contact/deal, перед финальным UPDATE лида, добавить:

```sql
  -- Перенос истории лида на созданные сущности
  update public.calls c
     set contact_id = coalesce(c.contact_id, v_contact_id),
         company_id = coalesce(c.company_id, v_company_id),
         project_id = coalesce(c.project_id, v_deal_id)
   where c.lead_id = p_lead_id;

  update public.tasks t
     set project_id = coalesce(t.project_id, v_deal_id),
         company_id = coalesce(t.company_id, v_company_id),
         contact_id = coalesce(t.contact_id, v_contact_id)
   where t.lead_id = p_lead_id;

  -- Квалификация лида → закреплённая заметка сделки (только если пусто)
  update public.projects p
     set pinned_note = concat_ws(e'\n',
           nullif('Боль: ' || v_lead.pain, 'Боль: '),
           case when v_lead.chz_groups is not null and array_length(v_lead.chz_groups,1) > 0
                then 'ЧЗ-группы: ' || array_to_string(v_lead.chz_groups, ', ') end,
           case when v_lead.regulatory_deadline is not null
                then 'Дедлайн маркировки: ' || to_char(v_lead.regulatory_deadline, 'DD.MM.YYYY') end)
   where p.id = v_deal_id
     and (p.pinned_note is null or p.pinned_note = '')
     and (v_lead.pain is not null
          or v_lead.chz_groups is not null
          or v_lead.regulatory_deadline is not null);
```

Имена переменных (`v_company_id`/`v_contact_id`/`v_deal_id`, запись лида) — свериться
с живым телом, не угадывать: на гейте однажды всплывал `42703` именно в convert_lead.
`lead_id` на звонках/задачах при этом НЕ зануляется — связь с лидом остаётся для
аналитики «жизни до конверсии».

## ЗАДАЧА 4 — Типы и валидаторы

`src/types/database.ts` (блок «Sprint 2: Leads»):

- `Lead` += `owner_id: string | null`, `next_step: string | null`,
  `next_action_date: string | null`, `temperature: LeadTemperature | null`,
  `estimated_value: number | null`, `pain: string | null`,
  `budget_status: LeadBudgetStatus`, `decision_role: string | null`,
  `chz_groups: string[] | null`, `regulatory_deadline: string | null`,
  `first_contacted_at: string | null`, `qualified_at: string | null`.
- Новые типы: `LeadTemperature = 'hot' | 'warm' | 'cold'`,
  `LeadBudgetStatus = 'unknown' | 'none' | 'estimated' | 'confirmed'`.
- `LeadInsert` += те же поля опционально; `user_id` в Insert НЕ добавлять.
- `Call`/`CallInsert`, `Task`/`TaskInsert` += `lead_id?: string | null`.

`src/lib/validators/lead.ts`:

- `leadFormSchema` += `owner_id`, `next_step`, `next_action_date`
  (`''` → null: `setValueAs`), `temperature`, `estimated_value_rub`
  (число в рублях, в мутации × 100 → копейки, как QuoteModal), `pain`,
  `budget_status` (default `'unknown'`), `decision_role`, `chz_groups`
  (массив кодов из `lib/data/chz-groups.ts`), `regulatory_deadline`.
- Конфиги: `LEAD_TEMPERATURE_CONFIG` (hot «Горячий» red / warm «Тёплый» yellow /
  cold «Холодный» blue), `LEAD_BUDGET_STATUS_CONFIG` (unknown «Не выяснен» /
  none «Нет бюджета» / estimated «Оценён» / confirmed «Подтверждён»).
  `decision_role` — словарь ролей из `lib/constants/stakeholders.ts`, не новый.

## ЗАДАЧА 5 — Хуки

`src/lib/hooks/use-leads.ts`:

- `createLead`: убрать ручной `{ ...lead, user_id: user.id }` и сам `getUser()` —
  `owner_id`/`user_id` теперь ставит БД default'ами. Если форма передала `owner_id`
  (назначение через AssigneeSelect) — он уходит как есть.
- Optimistic-объект в `useCreateLead` дополнить всеми новыми полями
  (`owner_id: null, next_step: null, …, budget_status: 'unknown'`).
- Смена статуса (useUpdateLead) не трогается — штампы и журнал делает БД.

`src/lib/hooks/use-calls.ts`:

- `CallInsert` с `lead_id`; в `useCreateCall` после успешного создания звонка
  со `lead_id` и `status='done'` — если лид в статусе `new`, домутировать
  `useUpdateLead`-логикой `status: 'contacted'` (авто-прогресс HubSpot-паттерна;
  решение клиентское НАМЕРЕННО — каскады статусов в триггерах в этом проекте
  признаны граблей). Инвалидация `['leads']` при звонке с `lead_id` — обязательна.

## ЗАДАЧА 6 — UI: модалка и карточка дорастают

`src/components/leads/LeadModal.tsx`:

- Секция «Работа»: ответственный (`AssigneeSelect`), следующий шаг (text),
  дата шага (date), температура (3 чипа-кнопки, паттерн «Направление»),
  оценка суммы (₽, как в QuoteModal).
- Секция «Квалификация» (свёрнутая по умолчанию, раскрыта для status='contacted'+):
  боль/задача (textarea), бюджет (4 чипа), роль контакта (select по stakeholders),
  ЧЗ-группы (мультиселект по `chz-groups.ts`), дедлайн маркировки (date).
- Никаких `window.confirm`/`alert`; disabled — настоящий `disabled`.

`src/components/leads/LeadsView.tsx` (LeadCard):

- Температура-бейдж рядом с source; сумма (если есть) — `tabular-nums`,
  формат как у сделок; просроченный `next_action_date` — красным
  («шаг просрочен N дн.», язык DealFocusPanel); бейдж дедлайна маркировки
  «ЧЗ через N мес.» при `regulatory_deadline` ≤ 12 мес.
- Колонки таблицы += Ответственный, Температура, Сумма, Шаг.
- CSV-экспорт += новые поля.

`src/components/calls/CallModal.tsx`:

- Проп `defaultLeadId?: string`; поле «Лид» (Combobox по не-конвертированным лидам)
  видно, когда звонок не привязан к contact/company/project — двойную привязку
  не городить: либо лид (до конверсии), либо CRM-сущности (после).

## ЗАДАЧА 7 — Документация тем же PR

- `docs/schema.md`: раздел `leads` — новые колонки, новые политики (старые пометить
  замещёнными), триггеры `trg_zz_stamp_lead_status`/`trg_zy_log_lead_status`/
  `log_delete_lead`, `calls.lead_id`/`tasks.lead_id`/`activity_log.lead_id`,
  правка convert_lead. Статус: «НАПИСАНА, НЕ ПРИМЕНЕНА» (переводит гейт).
- `crm-architect/references/architecture.md` (в репо): блок про лиды — ownership
  переехал на `owner_id`, лид вошёл в граф активностей.

## Смоки (прогнать до коммита)

```bash
npx tsc --noEmit
npm run lint
npm run build   # ПОСЛЕДНИМ — билд убивает живой next dev
```

Ручной смок: создать лид → назначить ответственного → перевести в «Контакт»
(проверить `first_contacted_at` не пуст после рефетча) → залогировать звонок
с lead_id → конвертировать → убедиться, что звонок виден на созданной сделке.

## КОММИТ

```bash
git checkout -b feat/lead-core
git add supabase/migrations/117_lead_work_fields.sql \
        supabase/migrations/118_lead_activity_links.sql \
        supabase/migrations/119_convert_lead_history.sql \
        src/ docs/schema.md crm-architect/
git commit -m "Sprint LEAD-CORE-1: лид как рабочая сущность — ownership, поля работы, связи с активностями, конверсия с историей"
```

Отчёт по факту — отчётом: что сделано, что проверено, что осталось гейту
(apply 117–119 → gen-types → advisors → ролевые смоки: viewer-insert теперь 42501,
manager правит только свои, чужой лид в convert_lead → 42501).
