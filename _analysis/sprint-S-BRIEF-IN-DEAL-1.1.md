# Спринт S-BRIEF-IN-DEAL-1.1 — автозапуск AI-брифа компании (сервер)

**03.10.2026.** **Вход:** `main` ≥ `ca10cfb` (#160). **Миграция 138** — пишется и коммитится, применяет гейт. Прод-БД из CC не трогать.
**Ветка:** `feat/brief-auto-1`, worktree по `worktree-isolation`. Файл лежит в основном чекауте (`_analysis/sprint-S-BRIEF-IN-DEAL-1.1.md`, untracked) — первым коммитом скопировать его в worktree.
**Решения:** проект Claude — `claude/decisions-ai-deal-review-2026-09-29.md` (автозапуск, 29.09), апрув мокапа и четыре решения 03.10 — `claude/mockup-brief-in-deal-2026-10-03.md`.
**Следом:** S-BRIEF-IN-DEAL-1.2 (кнопка и панель в шаге сделки) — после мержа этого спринта, apply 138 и регена типов.

## Зачем

Daily-ревью сделок (REVIEW-1) берёт зацепки для звонков из брифа компании, а бриф есть у 2 из 16 компаний с открытыми сделками. Последний бриф собран 04.09 — с тех пор кнопку в карточке компании не нажимали. Решение 29.09: бриф собирается сам по триггерам, с дневным лимитом, фоновой очередью. Этот спринт — серверная половина: кто в очереди, сколько можно сегодня, кто запускает. Видимый эффект ещё без UI: брифы появляются в карточке компании (`AiCompanyPanel`) и в ленте компании.

## Решения (владелец 29.09 и 03.10)

1. **Триггеры** — у компании есть открытая сделка (`projects.type = 'client' and status = 'open'`) и:
   - `no_brief` — нет ни одного `company_brief` со статусом `done`;
   - `stage` — сделка вошла в стадию с `phase_group = 'working'` позже, чем через 30 дн. после последнего брифа. Это ERP «Техническое задание» / «Расчёт проекта», IIoT Проект «Подготовка КП», IIoT Эксперимент «Документы» / «Согл. ЧЗ». **Имён стадий и id воронок в коде нет**;
   - `stale` — последний бриф старше 90 дн.
2. **Лимит — 10 автопрогонов в сутки (МСК) на организацию.** Переопределение — `organizations.settings.brief_auto_daily_limit` (целое; `0` — автозапуск выключен). Ручные запуски вне лимита: их путь не меняется.
3. **Не чаще:** одна активная попытка на компанию (`ux_ai_runs_active_entity`); после ошибки — пауза 45 мин; не больше 2 автопопыток на компанию за сутки.
4. **Порядок очереди:** `stage` → `no_brief` → `stale`; внутри — ближайшая `next_action_date` открытой сделки компании (бриф нужнее перед ближайшим касанием).
5. **Автор автопрогона** (`ai_runs.created_by`, NOT NULL → `profiles`) — владелец сделки (`owner_id`, запасной — `created_by` сделки).

## Архитектура — почему так

- **Очередь вычисляемая, не таблица.** Кандидаты — функция от состояния (`company_brief_candidates()`), одна на тик и на UI (RPC для 1.2). Таблица очереди стала бы вторым источником правды рядом с `ai_runs`.
- **Резерв лимита — INSERT строки `ai_runs` в SQL**, в одной транзакции с подсчётом. Тики не пересекаются (pg_cron не запускает второй экземпляр джобы, плюс `pg_advisory_xact_lock` на ручной вызов), дубль по компании отсекает уникальный индекс.
- **Исполнитель — существующий `ai-run`.** Новая ветка «диспетчер» по заголовку `X-Dispatch-Key` берёт уже созданную строку по `run_id` и гонит её тем же `processRun` сервисным клиентом. Новая функция с выносом ядра — больше дифф и второй деплой; ветка — около 60 строк. Шлюз `ai-run` (`verify_jwt = true`) не трогаем: pg_net проходит его легаси-anon JWT из Vault (механизм `EDGE_INVOKE_JWT` / легаси-anon, журнал «FIX tg-capture-401»), доступ к ветке решает только ключ.
- **Узкая способность ключа.** Ветка не создаёт прогонов и не берёт из тела ни org, ни автора, ни сущность — только `run_id` строки, которую создал тик (`company_brief`, `entity_type = 'company'`, `auto_reason is not null`, `pending`). Утечка ключа даёт запуск обработки уже поставленной строки, не больше.
- **`auto_reason` — колонка, а не ключ в `result`** (прецедент 127 «`source` в `result`» тут не подходит): признак нужен в момент INSERT — для подсчёта лимита и текста «запущено автоматически» в 1.2, — а `result` до `done` пуст и затем перезаписывается. Ставить признак может только сервер: триггер-страж.
- **Крон раз в час, `40 5-16 * * *` UTC (08:40–19:40 МСК):** 12 запусков в сутки, не больше 2 прогонов за тик (не залпом: лимит провайдера по токенам в минуту; прогон ≈ 49k входных). Холостой тик — один запрос и выход (бюджет I-1, `133_cron_io_budget.sql`). Минута :40 не пересекается с суточными уборками 06:00–06:25 UTC и пятиминутными джобами.
- **Ошибки тика не глотаем** (в отличие от `telegram_send_tick`): сбой должен лечь в `cron.job_run_details`, иначе очередь молча встанет.

## Что НЕ меняется

- Ручной путь брифа (`AiCompanyPanel` → `useStartRun` → `ai-run` под JWT пользователя) — байт-в-байт.
- RLS `ai_runs_*` не переписываются: автопрогон — обычная строка `entity_type = 'company'`, его видимость даёт существующая ветка `companies` в `ai_runs_select`.
- `supabase/config.toml` — `verify_jwt` у `ai-run` остаётся `true`.
- UI — ни одного файла в `src/components` (кнопка и панель — 1.2).
- `crm-architect/STATUS.md`, `learnings.md`, `journal.md` — правит гейт.
- Три локальные копии `timingSafeEqual` (`webhook-dispatch`, `telegram-send`, `telegram-webhook`) не трогаем, чтобы не редеплоить чужие функции; новая общая копия — в `_shared/`, сведение — долг.

## Факты прода (сверено гейтом 03.10 через Supabase MCP)

- Последняя применённая — `20261003200000 iiot_delivery_stages` (137) → следующий номер **138**. STATUS упоминает «миграцию 138» для авто-вида внедрения — это бэклог без файла; номер занимает этот спринт, STATUS поправит гейт.
- `ai_runs`: `model`, `prompt_version` nullable; `created_by` NOT NULL DEFAULT `auth.uid()` → `profiles(id)`; `org_id` NOT NULL, `trg_set_org_id` подставляет `current_org_id()` **только при NULL** — явный `org_id` сохраняется. `projects.owner_id` → `profiles(id)`; у открытых сделок `owner_id` заполнен везде.
- `ux_ai_runs_active_entity (entity_type, entity_id, preset_key) WHERE transcript_id IS NULL AND status IN ('pending','running')`; индекс `idx_ai_runs_org_created (org_id, created_at desc)` закрывает подсчёт за сутки.
- Расширения: `pg_cron 1.6.4`, `pg_net 0.20.0`, `supabase_vault 0.3.1`. Крон-джобов 9, имени `brief-auto` нет.
- Открытых сделок 17 в 16 компаниях (+1 без компании); бриф есть у 2. Ожидаемый первый список кандидатов — **14 строк `no_brief`**.
- `company_brief`: 24 `done` / 6 `error` (все ошибки 18–26.08), в среднем ~49k / 2.9k токенов, 46 с (макс. 89 с).
- `organizations.settings` уже держит `reconnect_days`, `stage_target_days` — новый ключ ложится рядом.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
ls supabase/migrations | tail -4
sed -n 1,80p supabase/migrations/133_cron_io_budget.sql
grep -n "create or replace function public.telegram_send_tick" -A 50 supabase/migrations/107_telegram_core.sql
sed -n 1100,1130p supabase/functions/ai-run/index.ts
sed -n 1461,1545p supabase/functions/ai-run/index.ts
grep -n "company_brief: {" -A 20 supabase/functions/ai-run/index.ts
grep -n "function timingSafeEqual" -A 12 supabase/functions/telegram-send/index.ts
grep -n "requireEnv\|SUPABASE_SERVICE_ROLE_KEY" supabase/functions/telegram-send/index.ts supabase/functions/_shared/env.ts
sed -n 1,30p supabase/functions/ai-run/in-flight.ts
sed -n 1,25p tests/unit/edge-env.test.ts
grep -n "export type AiRunRow" -A 30 src/types/database.ts
grep -n "^### transcripts / ai_runs\|^## .*Edge\|^### .*ai-run" docs/schema.md
command -v deno || echo "deno нет"
```

Ответить до кода:
- что `processRun` пишет в строку на старте (`status: 'running'`) и где берёт `model` / `prompt_version` — ветка диспетчера не должна дублировать или затирать его записи;
- как тесты импортируют чистые модули edge (`in-flight.ts`, `_shared/env.ts`) — по тому же образцу пойдут `ai-run/auto-dispatch.ts` и `_shared/timing-safe.ts`;
- как `telegram-send` создаёт сервисный клиент (`requireEnv`) — тем же способом в ветке диспетчера.

---

## ЗАДАЧА 1: Миграция 138 `brief_auto`

Файл `supabase/migrations/138_brief_auto.sql`. Шапка — по форме 107/133: что и зачем, статус «НАПИСАНА, НЕ ПРИМЕНЕНА», ручные шаги владельца (Vault — ниже, в «Вне CC»), обратимость. **DO-блоков нет** (MCP `apply_migration` на них виснет — learnings, #158); `cron.schedule` по имени идемпотентен в pg_cron ≥ 1.4.

Тексты ниже — целевые. Отступать только по итогам РАЗВЕДКИ и с пометкой в отчёте.

**1) Колонка и CHECK**

```sql
alter table public.ai_runs add column if not exists auto_reason text;

alter table public.ai_runs drop constraint if exists ai_runs_auto_reason_check;
alter table public.ai_runs add constraint ai_runs_auto_reason_check check (
  auto_reason is null
  or (auto_reason in ('no_brief', 'stale', 'stage')
      and preset_key = 'company_brief' and entity_type = 'company')
);

comment on column public.ai_runs.auto_reason is
  'S-BRIEF-IN-DEAL-1.1 (138): причина автозапуска брифа (no_brief | stage | stale). NULL — ручной '
  'прогон. Ставит только brief_auto_tick(); пользовательский контекст отсекает trg_ai_runs_auto_reason_guard.';
```

**2) Страж признака**

```sql
create or replace function public.ai_runs_auto_reason_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Пользовательский контекст (есть auth.uid()) не ставит и не меняет признак автозапуска:
  -- иначе участник org съел бы дневной лимит или выдал ручной прогон за автоматический.
  -- В cron и под service_role auth.uid() пуст — там признак ставит тик.
  if auth.uid() is not null and (
       (tg_op = 'INSERT' and new.auto_reason is not null)
    or (tg_op = 'UPDATE' and new.auto_reason is distinct from old.auto_reason)
  ) then
    raise exception 'auto_reason ставит только автозапуск брифа' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.ai_runs_auto_reason_guard() from public, anon, authenticated;
grant execute on function public.ai_runs_auto_reason_guard() to service_role;

drop trigger if exists trg_ai_runs_auto_reason_guard on public.ai_runs;
create trigger trg_ai_runs_auto_reason_guard
  before insert or update of auto_reason on public.ai_runs
  for each row execute function public.ai_runs_auto_reason_guard();
```

**3) Два внутренних помощника — один источник для границы суток и лимита**

```sql
-- Начало суток по Москве. Одна функция на тик, кандидатов и RPC: три копии выражения
-- разошлись бы на первой правке.
create or replace function public.brief_auto_day_start()
returns timestamptz
language sql stable security definer set search_path = public, pg_temp
as $$ select (date_trunc('day', now() at time zone 'Europe/Moscow')) at time zone 'Europe/Moscow' $$;

-- Дневной лимит org: organizations.settings.brief_auto_daily_limit, иначе 10.
-- Нецелое значение в настройке — дефолт, а не ошибка тика.
create or replace function public.brief_auto_daily_limit(p_org uuid)
returns int
language sql stable security definer set search_path = public, pg_temp
as $$
  select case when (o.settings->>'brief_auto_daily_limit') ~ '^\d+$'
              then (o.settings->>'brief_auto_daily_limit')::int else 10 end
    from public.organizations o where o.id = p_org
$$;

revoke all on function public.brief_auto_day_start()       from public, anon, authenticated;
revoke all on function public.brief_auto_daily_limit(uuid) from public, anon, authenticated;
grant execute on function public.brief_auto_day_start()       to service_role;
grant execute on function public.brief_auto_daily_limit(uuid) to service_role;
```

**4) Кандидаты — внутренняя функция, видит все org, клиенту закрыта**

```sql
create or replace function public.company_brief_candidates()
returns table (org_id uuid, company_id uuid, reason text, author_id uuid, next_action_date date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with open_deals as (
    select p.id, p.org_id, p.company_id,
           coalesce(p.owner_id, p.created_by) as author_id,
           p.next_action_date
      from public.projects p
      join public.companies co on co.id = p.company_id and co.org_id = p.org_id
     where p.type = 'client' and p.status = 'open'
  ),
  per_company as (
    -- автор и срок — от сделки компании с ближайшим шагом
    select distinct on (d.company_id) d.org_id, d.company_id, d.author_id, d.next_action_date
      from open_deals d
     order by d.company_id, d.next_action_date asc nulls last, d.id
  ),
  last_done as (
    select r.entity_id as company_id, max(r.created_at) as brief_at
      from public.ai_runs r
     where r.preset_key = 'company_brief' and r.entity_type = 'company' and r.status = 'done'
     group by r.entity_id
  ),
  working_entry as (
    -- вход открытой сделки в рабочую фазу; FK stage_transitions → pipeline_stages снят
    -- сознательно (комментарий таблицы), поэтому inner join отбрасывает удалённые стадии
    select d.company_id, max(st.changed_at) as entered_at
      from public.stage_transitions st
      join open_deals d on d.id = st.project_id
      join public.pipeline_stages ps on ps.id = st.to_stage_id
     where ps.phase_group = 'working'
     group by d.company_id
  ),
  scored as (
    select c.org_id, c.company_id, c.author_id, c.next_action_date,
           case
             when lb.brief_at is null                              then 'no_brief'
             when we.entered_at > lb.brief_at + interval '30 days' then 'stage'
             when lb.brief_at < now() - interval '90 days'         then 'stale'
           end as reason
      from per_company c
      left join last_done lb     on lb.company_id = c.company_id
      left join working_entry we on we.company_id = c.company_id
  )
  select s.org_id, s.company_id, s.reason, s.author_id, s.next_action_date
    from scored s
   where s.reason is not null
     and s.author_id is not null
     -- уже идёт прогон (ручной или авто)
     and not exists (
       select 1 from public.ai_runs a
        where a.entity_type = 'company' and a.entity_id = s.company_id
          and a.preset_key = 'company_brief' and a.status in ('pending', 'running'))
     -- пауза после сбоя: 45 мин (тик раз в час → повтор следующим тиком)
     and not exists (
       select 1 from public.ai_runs e
        where e.entity_type = 'company' and e.entity_id = s.company_id
          and e.preset_key = 'company_brief' and e.status = 'error'
          and e.finished_at > now() - interval '45 minutes')
     -- не больше двух автопопыток на компанию за сутки МСК
     and (select count(*) from public.ai_runs t
           where t.entity_type = 'company' and t.entity_id = s.company_id
             and t.auto_reason is not null
             and t.created_at >= public.brief_auto_day_start()) < 2
$$;

revoke all on function public.company_brief_candidates() from public, anon, authenticated;
grant execute on function public.company_brief_candidates() to service_role;
```

Пороги 30 / 90 дн. зеркалит TS-константа в 1.2 (`BRIEF_STALE_DAYS`) — в комментарии функции назвать это место.

**5) Состояние автосбора для UI (1.2) — org-first, одна компания**

```sql
create or replace function public.company_brief_auto_state(p_company_id uuid)
returns table (reason text, used_today int, daily_limit int, attempts_today int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with org as (
    select c.org_id from public.companies c
     where c.id = p_company_id and c.org_id = (select public.current_org_id())
  )
  select
    (select k.reason from public.company_brief_candidates() k where k.company_id = p_company_id),
    (select count(*)::int from public.ai_runs r
      where r.org_id = org.org_id and r.auto_reason is not null
        and r.created_at >= public.brief_auto_day_start()),
    public.brief_auto_daily_limit(org.org_id),
    (select count(*)::int from public.ai_runs t
      where t.entity_type = 'company' and t.entity_id = p_company_id
        and t.auto_reason is not null
        and t.created_at >= public.brief_auto_day_start())
  from org
$$;

revoke all on function public.company_brief_auto_state(uuid) from public, anon;
grant execute on function public.company_brief_auto_state(uuid) to authenticated, service_role;
```

Чужая или несуществующая компания → 0 строк (не ошибка). `reason = NULL` при живой компании — «сейчас не в очереди»: есть активный прогон, пауза после сбоя, исчерпаны попытки или триггера нет.

**6) Тик**

```sql
create or replace function public.brief_auto_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_per_tick constant int := 2;
  v_day0  timestamptz := public.brief_auto_day_start();
  v_key   text;
  v_url   text;
  v_jwt   text;
  v_org   uuid;
  v_limit int;
  v_used  int;
  v_take  int;
  v_c     record;
  v_run   uuid;
begin
  perform pg_advisory_xact_lock(hashtext('brief_auto_tick'));

  -- 1. Реклейм: автопрогон pending/running старше 15 мин — pg_net не доставил или воркер
  --    снят по wall clock. CAS по статусу, как в ai-run: завершённое не трогаем.
  update public.ai_runs
     set status = 'error', error = 'upstream|Прогон прерван по таймауту.', finished_at = now()
   where auto_reason is not null and status in ('pending', 'running')
     and created_at < now() - interval '15 minutes';

  -- 2. Дешёвый выход: кандидатов нет — ни секретов, ни HTTP.
  if not exists (select 1 from public.company_brief_candidates()) then
    return;
  end if;

  -- 3. Окружение не настроено — молча выходим: apply 138 безопасен до деплоя ai-run и Vault.
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'brief_auto_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'brief_auto_url';
  select decrypted_secret into v_jwt from vault.decrypted_secrets where name = 'brief_auto_jwt';
  if v_key is null or v_url is null or v_jwt is null then
    return;
  end if;

  -- 4. По организациям: остаток дневного лимита, не больше c_per_tick за тик.
  for v_org in select distinct k.org_id from public.company_brief_candidates() k loop
    v_limit := coalesce(public.brief_auto_daily_limit(v_org), 10);
    select count(*) into v_used from public.ai_runs r
     where r.org_id = v_org and r.auto_reason is not null and r.created_at >= v_day0;
    v_take := least(c_per_tick, v_limit - v_used);
    continue when v_take <= 0;

    for v_c in
      select * from public.company_brief_candidates() k
       where k.org_id = v_org
       order by case k.reason when 'stage' then 1 when 'no_brief' then 2 else 3 end,
                k.next_action_date asc nulls last
       limit v_take
    loop
      begin
        insert into public.ai_runs
          (org_id, preset_key, entity_type, entity_id, status, created_by, auto_reason)
        values
          (v_c.org_id, 'company_brief', 'company', v_c.company_id, 'pending', v_c.author_id, v_c.reason)
        returning id into v_run;
      exception when unique_violation then
        continue;  -- активный прогон появился между выборкой и вставкой (ручной клик)
      end;

      -- pg_net шлёт после коммита: строка к приходу запроса уже видна ai-run.
      perform net.http_post(
        url                  := v_url,
        headers              := jsonb_build_object(
                                  'content-type',   'application/json',
                                  'Authorization',  'Bearer ' || v_jwt,
                                  'X-Dispatch-Key', v_key),
        body                 := jsonb_build_object('run_id', v_run),
        timeout_milliseconds := 10000
      );
    end loop;
  end loop;
end $$;

comment on function public.brief_auto_tick() is
  'S-BRIEF-IN-DEAL-1.1 (138): автозапуск брифа компании. Реклейм зависших автопрогонов → '
  'кандидаты company_brief_candidates() → не больше 2 за тик в пределах дневного лимита org → '
  'INSERT ai_runs (auto_reason) + pg_net в ai-run (X-Dispatch-Key). Секреты — Vault '
  'brief_auto_key / brief_auto_url / brief_auto_jwt. Ошибки не глотаются: их видно в cron.job_run_details.';

revoke all on function public.brief_auto_tick() from public, anon, authenticated;
grant execute on function public.brief_auto_tick() to service_role;
```

**7) Крон**

```sql
select cron.schedule('brief-auto', '40 5-16 * * *', $cmd$select public.brief_auto_tick()$cmd$);
```

**Обратимость** (в шапку, порядок важен):
```sql
select cron.unschedule('brief-auto');
drop function if exists public.brief_auto_tick();
drop function if exists public.company_brief_auto_state(uuid);
drop function if exists public.company_brief_candidates();
drop function if exists public.brief_auto_daily_limit(uuid);
drop function if exists public.brief_auto_day_start();
drop trigger if exists trg_ai_runs_auto_reason_guard on public.ai_runs;
drop function if exists public.ai_runs_auto_reason_guard();
alter table public.ai_runs drop constraint if exists ai_runs_auto_reason_check;
-- колонку auto_reason — только по явному «да» владельца: в ней журнал автозапусков
```

**Проверка:** `grep -c "create or replace function" supabase/migrations/138_brief_auto.sql` → 6; `grep -n "^do \$\$" supabase/migrations/138_brief_auto.sql` → пусто.

SQL этой задачи прогнан гейтом 03.10 на локальном Postgres 16 с заглушками Supabase (`auth.uid`, Vault, `net.http_post`, `cron.schedule`): миграция идемпотентна (повторный прогон чистый); кандидаты — `no_brief` / `stale` / `stage` и все шесть исключений (свежий бриф, активный прогон, пауза после сбоя, две попытки за сутки, закрытая сделка, переход раньше «бриф + 30 дн.»); тик — реклейм, тихий выход без секретов, порядок `stage` → ближайший шаг, лимит org и `≤ 2` за тик, повтор после паузы и стоп после второй попытки; страж — 42501 на INSERT и UPDATE `auto_reason` под пользователем, `rating` и ручной INSERT проходят; гранты — `authenticated` получает permission denied на кандидатах и тике, RPC отвечает. Отступления от текста — только с причиной в отчёте.

---

## ЗАДАЧА 2: `ai-run` — ветка диспетчера автозапуска

**1) `supabase/functions/_shared/timing-safe.ts`** — `export function timingSafeEqual(a: string, b: string): boolean`. Тело — как в `telegram-send` (сравнение без ранней остановки). Без импортов и без `Deno` — его импортирует тест.

**2) `supabase/functions/ai-run/auto-dispatch.ts`** — чистый модуль без импортов и без `Deno` (по образцу `in-flight.ts`):

```ts
export type AutoRunRow = {
  id: string;
  preset_key: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  auto_reason: string | null;
};

/** Тело запроса тика: ровно `{ run_id: uuid }`; лишние ключи игнорируются. */
export function parseAutoDispatchBody(raw: unknown): { runId: string } | { error: string };

/** Можно ли диспетчеру брать строку. Порядок проверок = порядок кодов ответа. */
export function checkAutoRun(
  row: AutoRunRow | null,
): 'ok' | 'not_found' | 'not_auto' | 'not_pending';
```

`not_auto` — `preset_key !== 'company_brief'`, или `entity_type !== 'company'`, или нет `entity_id`, или `auto_reason` пуст. `not_pending` — статус не `pending`. UUID — тем же регэкспом, что `UUID_RE` в `index.ts` (перенести в модуль и импортировать из него в `index.ts`, чтобы копии не было).

**3) `supabase/functions/ai-run/index.ts`**

- В `Deno.serve` сразу после проверок `OPTIONS` / метода, **до** разбора тела:
  ```ts
  // S-BRIEF-IN-DEAL-1.1 (138): вход автозапуска брифа — только от brief_auto_tick() (pg_cron → pg_net).
  if (req.headers.has('X-Dispatch-Key')) return handleAutoDispatch(req);
  ```
- `handleAutoDispatch(req)`:
  1. `BRIEF_AUTO_KEY` из env; пусто или `!timingSafeEqual(заголовок, ключ)` → 401 «Требуется авторизация».
  2. Тело → `parseAutoDispatchBody`; ошибка → 400.
  3. Тот же гард ключа провайдера, что в пользовательском пути (`resolveApiKey(resolveProvider('AI_RUN_PROVIDER'))`) → 500. Строка остаётся `pending`, её реклеймит тик через 15 мин.
  4. Сервисный клиент — как в `telegram-send` (`requireEnv('SUPABASE_SERVICE_ROLE_KEY', …)`, `persistSession: false`). **Создаётся только внутри этой ветки.**
  5. `select('id, preset_key, entity_type, entity_id, status, auto_reason')` по `run_id` → `checkAutoRun`: `not_found` → 404, `not_auto` / `not_pending` → 409.
  6. CAS-захват: `update({ status: 'running', model: preset.model, prompt_version: preset.promptVersion }).eq('id', …).eq('status', 'pending').select('id').maybeSingle()`; пусто → 409 (двойная доставка pg_net не запустит второй `processRun`).
  7. `EdgeRuntime.waitUntil(processRun(service, PRESETS.company_brief, runId, null, 'company', entityId))` → `json({ run_id }, 202)`.
- Шапку файла дополнить: Security №2 («клиент под JWT юзера») имеет одно исключение — ветка диспетчера; почему она безопасна (абзац «Узкая способность ключа» выше, двумя фразами).
- Пользовательский путь — без изменений, кроме импорта `UUID_RE` из `auto-dispatch.ts`.

**Проверка:** `grep -n "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/ai-run/index.ts` — только внутри `handleAutoDispatch`; `grep -c "X-Dispatch-Key" supabase/functions/ai-run/index.ts` ≥ 1; `deno check supabase/functions/ai-run/index.ts`, если `deno` есть (нет — строкой в отчёте).

---

## ЗАДАЧА 3: Типы и документация

- `src/types/database.ts`, рукописный `AiRunRow`: `auto_reason: 'no_brief' | 'stale' | 'stage' | null;` с комментарием `// 138: причина автозапуска брифа; NULL — ручной прогон`. `supabase.gen.ts` руками не трогать — реген после apply.
- `docs/schema.md`:
  - таблица `ai_runs` — строка `auto_reason`, CHECK и страж;
  - раздел **«138 (S-BRIEF-IN-DEAL-1.1) — НАПИСАНА, НЕ ПРИМЕНЕНА»**: триггеры и пороги, лимит и `settings.brief_auto_daily_limit`, пять функций и их ACL, крон `brief-auto`, три имени Vault, порядок включения, обратимость;
  - раздел Edge Functions, `ai-run`: ветка диспетчера, секрет `BRIEF_AUTO_KEY`, `verify_jwt` не менялся.

---

## ТЕСТЫ

`tests/unit/timing-safe.test.ts`:
- равные строки → `true`; та же длина, другое содержимое → `false`; разная длина → `false`;
- пустая и пустая → `true` — кейс фиксирует, что пустой ожидаемый ключ отсекает вызывающий (`handleAutoDispatch`, шаг 1), а не функция.

`tests/unit/ai-run-auto-dispatch.test.ts`:
- `parseAutoDispatchBody`: `{ run_id: <uuid> }` → `{ runId }`; нет поля, `null`, число, строка не-uuid, не объект → `{ error }`; лишний ключ рядом с валидным `run_id` → `{ runId }`;
- `checkAutoRun`: `null` → `not_found`; `preset_key = 'deal_summary'` → `not_auto`; `entity_type = 'project'` → `not_auto`; `auto_reason = null` → `not_auto`; `status` `running` / `done` / `error` → `not_pending`; валидная строка → `ok`; строка и не-авто, и не-pending → `not_auto` (порядок проверок).

SQL-логику vitest не покрывает — её проверяют ролевые смоки гейта (раздел «Вне CC»).

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -8
grep -c "create or replace function" supabase/migrations/138_brief_auto.sql
grep -n "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/ai-run/index.ts
grep -rn "auto_reason" src/types/database.ts docs/schema.md | head -5
npm run build 2>&1 | tail -5
```

## КОММИТ

Явным списком, не `git add -A`.

```
git add _analysis/sprint-S-BRIEF-IN-DEAL-1.1.md supabase/migrations/138_brief_auto.sql supabase/functions/_shared/timing-safe.ts supabase/functions/ai-run/auto-dispatch.ts supabase/functions/ai-run/index.ts src/types/database.ts docs/schema.md tests/unit/timing-safe.test.ts tests/unit/ai-run-auto-dispatch.test.ts
git commit -m "feat(ai): автозапуск AI-брифа компании — очередь, дневной лимит, крон (S-BRIEF-IN-DEAL-1.1)" -m "Миграция 138 (не применена): ai_runs.auto_reason + страж; company_brief_candidates() — нет брифа / вход в рабочую стадию при брифе старше 30 дн. / старше 90 дн.; company_brief_auto_state() для UI; brief_auto_tick() — до 10 в сутки на org, до 2 за тик, реклейм зависших; крон brief-auto 40 5-16 * * * UTC. ai-run: ветка диспетчера по X-Dispatch-Key гонит строку тика тем же processRun сервисным клиентом; ручной путь не изменён."
```

Без push.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, таблицы, функции.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд. Без цепочек «осуществление проведения проверки».
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · 42 теста passed · build exit 0).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».

---

## Вне CC — порядок включения (гейт и владелец)

Для гейта, не для исполнения в CC. Блоки владельцу выдаёт гейт по одному, следующий — после факта.

1. **Гейт:** дифф + линзы (базовая, security — миграция / `SECURITY DEFINER` / сервисный ключ в edge, api — edge-вход). **Cold review обязателен:** миграция, роли, деньги.
2. **Гейт:** `apply_migration` 138 → advisors (новых WARN нет) → смоки:
   - под `postgres`: `select count(*), string_agg(distinct reason, ',') from public.company_brief_candidates();` → 14, `no_brief`;
   - под JWT участника: `company_brief_candidates()` → permission denied; `company_brief_auto_state` по любой компании из списка кандидатов → `no_brief · 0 · 10 · 0`; случайный uuid → 0 строк;
   - страж: под JWT участника INSERT в `ai_runs` с `auto_reason` (транзакция с rollback) → 42501;
   - `select public.brief_auto_tick();` до Vault → новых строк в `ai_runs` нет;
   - перевести раздел 138 в `docs/schema.md` в `applied` + версия — тем же заходом.
3. **Владелец:** реген типов (`scripts/gen-types.sh`).
4. **Владелец:** деплой `ai-run`.
5. **Владелец:** секреты — Function Secret `BRIEF_AUTO_KEY` и Vault `brief_auto_key` (то же значение), `brief_auto_url` (`https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/ai-run`), `brief_auto_jwt` (легаси-anon JWT).
6. **Гейт:** ближайший тик :40 → 2 строки `auto_reason = 'no_brief'` → `done` за 1–2 мин; `net._http_response` — 202; бриф виден в карточке компании.
7. **Владелец:** мерж через PR.

Порядок 2 → 4 → 5 безопасен в любой точке остановки: без секретов тик выходит молча, без деплоя pg_net-вызовов нет.

**Долги в STATUS (гейт):** номер «миграции 138» у авто-вида внедрения → следующий свободный; свести три копии `timingSafeEqual` к `_shared/timing-safe.ts` при следующем касании функций; автор автопрогона в ленте компании — владелец сделки, подпись «автоматически» требует правки `entity_timeline`.
