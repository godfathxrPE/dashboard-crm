# S-R2-WEBHOOK-TRANSPORT — транспорт исходящих вебхуков

**Ветка:** `feat/r2-webhook-transport` от `main`. **Миграции 088, 089.** **Новая edge-функция.**
Порядок деплоя: миграция 088 → edge `webhook-dispatch` → миграция 089 (cron, зовёт edge) → фронт.

R2-P2, спринт 3. Эпик **B2**, первый из трёх. Архитектура и обоснование решений —
`_analysis/arch-webhooks-2026-07-29.md` (лежит рядом в репозитории); прочитать перед этим файлом.

**Трудоёмкость: 10–14 ч. Риск высокий** — три вещи, которых в проекте не было ни разу:
расширение `pg_net`, Supabase Vault, edge-функция под `service_role` с `verify_jwt = false`.

**Ревью Грока нет** (лимиты) — секция «Самопроверка» обязательна.

---

## Границы спринта

**В этом спринте вебхук НЕ подключён к движку автоматизаций.** Единственный вход — ручная
тестовая отправка (`event: webhook.test`) из RPC. `action_type='webhook'` и UI правил — спринт 2.

Почему так: отлаживать «почему не доехало» одновременно в транспорте и в движке правил дороже,
чем последовательно. Транспорт проверяется целиком до того, как к нему подключён генератор
событий.

**Приёмник для проверки** — публичный тестовый (`https://webhook.site/<uuid>` или
`https://requestbin.com`). Первый рабочий получатель по плану — **n8n → Telegram**: это заодно
самый дешёвый путь к уведомлениям из бэклога интеграций, без своего кода.

---

## SSRF-защита: два уровня в одном коде, без предварительной проверки

Архитектура требует резолвить DNS и отбивать приватные диапазоны перед каждым запросом (§4.1
арх-дока). В обычном Deno это `Deno.resolveDns(host, 'A')`.

⚠️ **Доступен ли `Deno.resolveDns` в Supabase Edge Runtime — неизвестно.** Обе существующие
функции только дёргают `api.anthropic.com`, прецедента нет.

**Проверять заранее не нужно и нельзя** (деплой edge — не задача CC). Вместо предварительной
проверки — **feature-detection в рантайме**: dispatcher реализует оба уровня и сам определяет,
какой доступен. Порядок:

**Уровень 1 — работает всегда, независимо от рантайма (обязателен):**

1. только `https://`;
2. хост не является IP-литералом (regex на IPv4 и IPv6, включая формы в квадратных скобках);
3. порт только 443 (или отсутствует);
4. `redirect: 'manual'` — **критично**: без него любой публичный хост редиректит на
   `127.0.0.1`, и вся остальная защита рассыпается;
5. **allowlist хостов** — `organizations.settings.webhook_allowed_hosts`, массив строк, точное
   совпадение хоста. Пустой массив = разрешено всё, что прошло 1–4 (иначе фича не заработает
   «из коробки» и первый тест упрётся в пустой список).

**Уровень 2 — если рантайм даёт резолв (дополнительно):**

```ts
let ips: string[] | null = null;
try {
  ips = await Deno.resolveDns(host, 'A');   // и 'AAAA'
} catch {
  ips = null;                               // резолв недоступен — работаем на уровне 1
}
if (ips) { /* отбить 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, ::1, fc00::/7, fe80::/10, 0/8 */ }
```

Недоступность резолва **не считается ошибкой доставки** — только потерей второго уровня.
В `webhook_deliveries.error` при этом ничего не пишем, но **один раз за холодный старт**
логируем `console.warn('resolveDns unavailable — SSRF guard level 1 only')`, чтобы факт был виден
в логах функции. Я прочитаю его на гейте после деплоя и зафиксирую в отчёте, какой уровень
фактически активен.

Почему так, а не «сначала выясним»: результат проверки не меняет ни схему, ни контракт, ни
структуру кода — только одну ветку внутри функции валидации. Блокировать из-за неё спринт незачем,
а деплой пробной функции ради одной строки в логах — лишний шаг, который вдобавок запрещён ниже
в «Что НЕ делает Claude Code».

---

## Миграция 088 — схема, секреты, RPC

### 1. Расширение

```sql
create extension if not exists pg_net;
```

Ставится в схему `net` (не `extensions`). Если упадёт по правам — включить через Dashboard →
Database → Extensions руками; прецедент задокументирован для `pg_cron` (`051:128-129`).
Проверка после apply: `select count(*) from pg_extension where extname = 'pg_net'` → 1.

### 2. `webhook_endpoints`

Колонки — §2.1 арх-дока. Обязательно:

- `org_id uuid not null references organizations(id) on delete cascade`;
- `secret_id uuid not null` — **id секрета в Vault, не сам секрет**;
- CHECK на URL: `url ~ '^https://'` — схему проверяем и в БД, а не только в TS. Остальные
  проверки (порт, IP-литерал, allowlist) — в dispatcher'е, они требуют разбора URL;
- `consecutive_failures int not null default 0`, `disabled_reason text`;
- `last_delivery_at`, `last_status_code`;
- аудит: `created_at`, `updated_at` (триггер `update_updated_at`, имя триггера
  `trg_set_updated_at` — образец `083:104-113`), `created_by`;
- `trg_aa_freeze_org_id` на `org_id` — как в 083:95-100.

RLS (образец `automation_rules`, baseline 3258-3270):

```
select : org_id = (select public.current_org_id())
insert : org_id = (select public.current_org_id()) and (select public.current_org_role()) in ('owner','admin')
update : то же
delete : то же
```

`current_org_*()` строго в обёртке `(select ...)` — initplan-оптимизация (083:114-115).

Гранты: `revoke insert, update, delete, truncate, references, trigger on webhook_endpoints from
authenticated` — **запись только через RPC** (секрет генерируется в БД, клиент не должен уметь
вставить строку с чужим `secret_id`). `grant select` оставить.

### 3. `webhook_deliveries`

Колонки — §2.2 арх-дока. Обязательно:

- `id uuid primary key default gen_random_uuid()` — он же `X-Torii-Delivery` и ключ
  идемпотентности на приёмнике;
- `status text not null default 'pending'` + CHECK `in ('pending','delivered','failed','dropped')`;
- `attempt int not null default 0`, `next_retry_at timestamptz`;
- `payload jsonb not null`, `response_status int`, `response_body text`, `error text`;
- `endpoint_id ... on delete cascade`, `rule_id ... on delete set null` (null у тестовых);
- индекс очереди: `create index ... on webhook_deliveries (next_retry_at) where status = 'pending'`
  — **partial**, чтобы минутная джоба читала только живую очередь, а не весь журнал;
- индекс журнала: `(endpoint_id, created_at desc)`.

RLS: **SELECT только `owner`/`admin`** — в `payload` бюджеты и имена контактов (§4.3 арх-дока).
INSERT/UPDATE/DELETE для `authenticated` — `revoke` полностью: пишет только SECURITY DEFINER.

Soft delete не нужен — технический журнал, исключение из правила по тому же классу, что
`notifications` и `automation_runs`. Записать это в комментарий таблицы.

### 4. Секрет через Vault

```sql
create or replace function public.create_webhook_endpoint(p_name text, p_url text)
returns table (endpoint_id uuid, secret text)
  language plpgsql security definer set search_path = public, pg_temp, vault
```

Логика:

1. гейт роли: `if (select public.current_org_role()) not in ('owner','admin') then raise
   exception 'forbidden'; end if;` — RPC под DEFINER обходит RLS, поэтому проверка руками;
2. валидация `p_url ~ '^https://'`, иначе `raise exception 'url_must_be_https'`;
3. секрет: `v_secret := encode(extensions.gen_random_bytes(32), 'hex')`;
4. `v_secret_id := vault.create_secret(v_secret, 'webhook_' || gen_random_uuid()::text,
   'HMAC secret для webhook_endpoints')`;
5. insert строки с `secret_id = v_secret_id`, `created_by = auth.uid()`;
6. `return query select v_endpoint_id, v_secret` — **единственное место, где секрет покидает БД**.

Плюс `rotate_webhook_secret(p_endpoint_id uuid) returns text` — тот же гейт роли, новый секрет,
`vault.update_secret`, возврат нового значения один раз.

Гранты обеих RPC: `revoke all from public, anon; grant execute to authenticated`
(гейт роли внутри).

⚠️ **`NOT_VERIFIED`: доступность `vault.create_secret` из миграции.** Vault 0.3.1 установлен
(схема `vault`), но в проекте не использован ни разу. Проверить **первым делом после apply**:

```sql
select vault.create_secret('probe-value', 'probe_' || gen_random_uuid()::text, 'проба');
select name, decrypted_secret from vault.decrypted_secrets where name like 'probe_%';
-- убрать: delete from vault.secrets where name like 'probe_%';
```

Если недоступно — **план Б**: колонка `secret_ciphertext bytea`, шифрование
`extensions.pgp_sym_encrypt(secret, key)` ключом из Supabase Function Secret, расшифровка только
в edge. Это свой крипто-код и своя ротация ключа, поэтому путь второй, а не первый.

### 5. Тестовая отправка

```sql
create or replace function public.send_test_webhook(p_endpoint_id uuid)
returns uuid   -- delivery_id
  language plpgsql security definer set search_path = public, pg_temp
```

Гейт роли `owner/admin`; проверка, что endpoint в текущей org и `is_active`; вставка
`webhook_deliveries` с `event = 'webhook.test'`, `rule_id = null`, `next_retry_at = now()`,
payload:

```json
{ "version": 1, "id": "<delivery_id>", "event": "webhook.test",
  "occurred_at": "...", "org_id": "...", "data": { "message": "Тестовая доставка из Torii CRM" } }
```

Затем `perform public.dispatch_webhooks_tick();` — доставка немедленная, без ожидания минутной
джобы. Возврат — `delivery_id`, чтобы UI показал результат.

---

## Edge-функция `webhook-dispatch`

`supabase/functions/webhook-dispatch/index.ts`. **Отличается от двух существующих принципиально:**
работает под `service_role`, а не под JWT вызывающего. Значит своя авторизация.

### Авторизация вызывающего

- `supabase/config.toml`: для этой функции `verify_jwt = false` (JWT нет — её зовёт БД);
- вместо JWT — заголовок `X-Dispatch-Key`, сверяется constant-time с `Deno.env.get('WEBHOOK_DISPATCH_KEY')`;
- функция **не принимает никаких данных** — только `POST` без тела. Очередь читает сама из БД.
  Это снимает целый класс атак: даже с валидным ключом нельзя заставить её отправить произвольный
  payload на произвольный URL;
- ответ всегда `{ processed: N }` без деталей — наружу не течёт ничего о содержимом очереди.

### Клиент БД

```ts
createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
```

Первое использование service-ключа в проекте. Он доступен в edge-рантайме как переменная
окружения автоматически; в код и в репозиторий не попадает.

### Цикл обработки

1. батч: `select` из `webhook_deliveries` где `status='pending' and next_retry_at <= now()`,
   `order by next_retry_at`, `limit 50`;
2. **захват строки** перед отправкой: `update ... set attempt = attempt + 1, next_retry_at = null
   where id = ? and status = 'pending'` с проверкой затронутых строк — защита от двойной отправки,
   если минутная джоба и немедленный тик пересеклись;
3. endpoint: если `is_active = false` → `status='dropped'`, причина в `error`;
4. **SSRF-проверка** (уровень 1 + уровень 2, если резолв доступен) → провал = `status='dropped'`,
   ретраев нет; в `error` — какая именно проверка не прошла;
5. секрет из `vault.decrypted_secrets` по `secret_id`;
6. body — **строка, сформированная один раз**: `const raw = JSON.stringify(payload)`. Подпись
   считается от `${t}.${raw}`, в `fetch` уходит **тот же** `raw`. Пересобирать объект перед
   отправкой запрещено — любая разница в порядке ключей ломает подпись у получателя;
7. подпись: HMAC-SHA256 через WebCrypto (`crypto.subtle.importKey` + `sign`), hex;
8. `fetch(url, { method:'POST', headers: {...}, body: raw, redirect: 'manual',
   signal: AbortSignal.timeout(5000) })`;
9. результат:
   - 2xx → `delivered`, `delivered_at = now()`, `consecutive_failures = 0` у endpoint'а;
   - 3xx (при `redirect:'manual'`) → трактовать как **ошибку**, не успех: получатель просит
     редирект, мы его не выполняем;
   - 4xx кроме 408/429 → `failed`, без ретраев;
   - 429 → ретрай, уважая `Retry-After` в разумных пределах (≤ 24 ч);
   - 5xx / таймаут / сеть → ретрай по таблице §5 арх-дока (1 м, 5 м, 30 м, 2 ч, 6 ч, 24 ч; после
     7-й попытки `failed`);
   - в любом исходе: `response_status`, `response_body` (**усечь до 8 КБ**), `error`;
10. счётчик провалов endpoint'а: при неуспехе `consecutive_failures + 1`; при `>= 20` →
    `is_active = false`, `disabled_reason`, и `notifications` типа **`webhook_disabled`** владельцу
    (⇒ расширить `notifications_type_check` шестым значением в 088 + `NotificationType` в
    `src/types/database.ts:528`).

Функция **никогда не бросает наружу**: любая необработанная ошибка внутри обработки одной доставки
пишется в `error` этой доставки и не роняет батч. Тот же контракт, что у `processRun` в `ai-run`
(`:868-877`).

---

## Миграция 089 — тик и cron

Отдельная миграция **после деплоя edge-функции**: она содержит URL функции, вызывать
несуществующую бессмысленно.

```sql
create or replace function public.dispatch_webhooks_tick()
returns void language plpgsql security definer set search_path = public, pg_temp, vault, net
```

Тело: один `net.http_post` на `<project-url>/functions/v1/webhook-dispatch` с заголовком
`X-Dispatch-Key`, значение — **из Vault**, не литералом:

```sql
select decrypted_secret into v_key from vault.decrypted_secrets where name = 'webhook_dispatch_key';
perform net.http_post(
  url := v_url,
  headers := jsonb_build_object('content-type','application/json','X-Dispatch-Key', v_key),
  body := '{}'::jsonb
);
```

⚠️ **Ключ не должен попасть ни в `cron.job.command`, ни в текст миграции.** `cron.job.command`
читается любым, у кого есть доступ к БД, и хранится в открытом виде. Поэтому cron зовёт функцию,
а функция достаёт ключ из Vault. Секрет `webhook_dispatch_key` заводится **вручную** (`vault.create_secret`)
и то же значение прописывается в Supabase Function Secrets как `WEBHOOK_DISPATCH_KEY` — это шаг
Олега, не CC, и не в миграции.

URL проекта — тоже не литерал в миграции: положить в `organizations.settings` нельзя (он общий,
не per-org), поэтому вторым секретом Vault `webhook_dispatch_url`.

Cron (продолжает ряд 06:00 / 06:05 / 06:10 / 06:15):

```sql
do $$ begin perform cron.unschedule('webhook-retry'); exception when others then null; end $$;
select cron.schedule('webhook-retry', '* * * * *', 'select public.dispatch_webhooks_tick();');
```

**Первая минутная джоба в проекте** — остальные суточные. Тело обязано быть дешёвым: один
индексный скан по partial-индексу + один `net.http_post`. Если очередь пуста, edge отвечает
`{processed: 0}` мгновенно.

`webhook-cleanup` (ретеншн 30 дней) — **спринт 3**, здесь не заводить: пока нечего чистить.

---

## Фронт — минимум

Полноценная секция «Вебхуки» — спринт 3. Здесь только то, без чего нельзя создать endpoint и
увидеть результат:

1. `src/lib/hooks/use-webhook-endpoints.ts` — список (`select`), создание через RPC
   `create_webhook_endpoint`, ротация, удаление.
2. Модалка создания: имя, URL (валидация Zod: `https://` + не IP-литерал), после успеха —
   **экран с секретом один раз**, текст «сохраните сейчас, показать снова нельзя», кнопка
   «Скопировать». Образец подхода — GitHub/Stripe.
3. Кнопка «Отправить тест» → RPC `send_test_webhook` → через 2–3 с показать
   `last_status_code` из обновлённой строки.
4. Точка входа — новая секция в `SettingsContent.tsx` (рядом с `AutomationsSection`, гейт по роли
   `owner/admin` — там уже есть механика).

Типы: `WebhookEndpoint`, `WebhookDelivery`, `WebhookDeliveryStatus` в `src/types/database.ts` рядом
с блоком Workflow (297–414). `NotificationType` + `webhook_disabled`.

---

## Тесты

**Юнит (чистые функции, без сети):**

1. валидатор URL (уровень 1): `https://example.com` и `https://example.com:443` проходят;
   `http://`, `ftp://`, `https://10.0.0.5`, `https://127.0.0.1`, `https://[::1]`,
   `https://example.com:22` — отбиваются. Плюс allowlist: хост вне непустого списка отбивается,
   при пустом списке проходит;
1a. уровень 2 с замоканным `resolveDns`: возвращает `10.0.0.5` → отбито; бросает исключение →
   доставка **продолжается** (деградация до уровня 1), а не падает;
2. расчёт `next_retry_at` по номеру попытки: 1 м / 5 м / 30 м / 2 ч / 6 ч / 24 ч, после 7-й — null
   и `failed`;
3. классификация ответа: 200/204 → delivered; 301 → ошибка (не успех); 400/403/404 → failed без
   ретрая; 408/429 → ретрай; 500/502/504 → ретрай;
4. HMAC: на фиксированных `secret`, `t`, `raw` — известный ожидаемый hex (вектор посчитать один
   раз и зафиксировать в тесте);
5. усечение `response_body` до 8 КБ.

**Интеграционный (руками, на гейте):** тестовая отправка на `https://webhook.site/<uuid>` —
проверить, что пришли все заголовки, `X-Torii-Signature` сверяется, тело валидный JSON.

Полный e2e не писать.

---

## Самопроверка

1. **Оба уровня SSRF-защиты в коде:** уровень 1 работает безусловно, уровень 2 обёрнут в
   `try/catch` и его отсутствие не ломает доставку. Проверено юнит-тестом с замоканным
   `resolveDns`, который бросает.
2. **Секрет не в открытом виде** нигде: в `webhook_endpoints` нет колонки с секретом; ключ
   диспетчера не в `cron.job.command`, не в тексте миграции, не в репозитории.
3. **Подпись от сырого тела:** в коде ровно один `JSON.stringify`, его результат идёт и в подпись,
   и в `body`.
4. **`redirect: 'manual'`** стоит; 3xx считается ошибкой.
5. **Таймаут** 5 с через `AbortSignal.timeout`, не «надеемся на дефолт».
6. **Двойная отправка невозможна:** захват строки атомарным UPDATE с проверкой затронутых строк.
7. **Функция не принимает данных** — только POST без тела; произвольный payload/URL через неё не
   отправить даже с валидным ключом.
8. **Гейты роли в RPC руками** — DEFINER обходит RLS, `current_org_role()` проверяется в теле.
9. **`revoke` на обеих таблицах:** `authenticated` не может писать напрямую ни в
   `webhook_endpoints`, ни в `webhook_deliveries`.
10. **CHECK `notifications.type`** расширен и синхронен с `NotificationType` в TS.
11. **`supabase.gen.ts`** — новые таблицы появятся, реген **только CLI** (`npm run db:gen-types`),
    руками не править.
12. **Ничего не подключено к движку:** `automation_rules` и `wf_apply_project_action` в этом
    спринте не трогаются вовсе. `git diff` по миграциям 050/079 пуст.

---

## VERIFY / коммит

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build      # последним, при остановленном next dev
```

Миграции **не применять**, edge **не деплоить** — apply и деплой на гейте Cowork.

Коммит: `feat(webhooks): транспорт исходящих вебхуков — очередь, подпись, доставка (088, 089)`

```
Type Safety:            [заполнить]
RLS Coverage:           [заполнить — политики обеих таблиц + revoke; описать, кто что видит]
Backward Compatibility: [заполнить — движок автоматизаций не тронут; новые таблицы аддитивны]
Runtime Tested:         [заполнить — юниты 1–5; доставка на webhook.site за гейтом]
Regional Availability:  webhook.site / requestbin — только для теста, в код не попадают.
                        pg_net, Vault, pg_cron — внутри Supabase: VERIFIED
```

## Что НЕ делает Claude Code

- Не применяет миграции, не деплоит edge-функции.
- Не заводит секреты в Vault и в Function Secrets — это шаг Олега (`webhook_dispatch_key`,
  `webhook_dispatch_url`, `WEBHOOK_DISPATCH_KEY`).
- Не правит `supabase.gen.ts` / `database.ts` руками; реген — CLI.
- Не читает `.env`.
- Не трогает `automation_rules`, `wf_apply_project_action`, `run_stage_automations`.
- Не пишет секцию журнала доставок и авто-отключение UI — спринт 3.
- Отчёт — отчётом о сделанном.
