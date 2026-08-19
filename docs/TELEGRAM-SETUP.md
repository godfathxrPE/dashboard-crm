# Telegram — подключение, ротация, диагностика

Операционный runbook эпика Telegram (S-TG-1, миграция **107**, применена 2026-08-08
`20260808130945`).

**Архитектуры здесь нет** — она в шапках `supabase/migrations/107_telegram_core.sql`,
`supabase/functions/telegram-send/index.ts` и `supabase/functions/telegram-webhook/index.ts`,
а схема таблиц — в [`docs/schema.md`](./schema.md). Этот файл про то, что делать руками:
подключить, поменять ключ, найти причину, когда «уведомления не приходят».

Прод: ref `uoiavcabxgdjugzryrmj`, бот **@torii_crm_bot** (id `8569873194`).

---

## 1. Что где живёт

| Секрет | Где хранится | Кто читает |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Supabase Function Secrets | `telegram-send`, `telegram-webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | Function Secrets **+ у Telegram** (`secret_token` в `setWebhook`) | `telegram-webhook` |
| `TELEGRAM_SEND_KEY` | Function Secrets **+ Vault** (`telegram_send_key`) | `telegram-send` ← `telegram_send_tick()` |
| — | Vault `telegram_send_url` | `telegram_send_tick()` |
| `EDGE_INVOKE_JWT` | Function Secrets | `telegram-webhook` → шлюз `ai-capture` / `company-lookup` |
| `NEXT_PUBLIC_TELEGRAM_BOT` | `.env.local` + Vercel | UI (`TelegramSection`) |

> ### ⚠️ Два секрета обязаны совпадать в двух местах каждый
>
> `TELEGRAM_WEBHOOK_SECRET` — в Function Secrets **и** у Telegram.
> `TELEGRAM_SEND_KEY` — в Function Secrets **и** в Vault.
>
> **Это единственная причина всех сбоев при первом запуске.** На гейте 2026-08-08 она
> сработала дважды подряд — по одному разу на каждый секрет. Симптом в обоих случаях
> одинаковый и неинформативный: `401`.
>
> Отсюда правило раздела 3: **ключ генерируется в переменную и подставляется в оба места
> одним скриптом.** Человек значение не набирает и не копирует. Сверять глазами
> бесполезно — 64 hex-символа с лишним пробелом на конце выглядят точно так же, как
> правильные.

Токен бота в БД не попадает никогда: ни в таблицы, ни в `cron.job.command` (он хранится и
читается открытым текстом), ни на клиент.

---

## 2. Подключение с нуля

1. **Бот.** [@BotFather](https://t.me/BotFather) → `/newbot` → имя и username → токен.
2. **Токен в secrets.**
   ```bash
   npx -y supabase@latest secrets set TELEGRAM_BOT_TOKEN='<токен от BotFather>' --project-ref uoiavcabxgdjugzryrmj
   ```
   Кавычки одинарные: в токене есть `:`.
3. **Деплой функций** (если ещё не сделан):
   ```bash
   npx -y supabase@latest functions deploy telegram-send    --project-ref uoiavcabxgdjugzryrmj
   npx -y supabase@latest functions deploy telegram-webhook --project-ref uoiavcabxgdjugzryrmj
   ```
   Обе с `verify_jwt = false` — это прописано в `supabase/config.toml` вместе с причиной.
4. **`TELEGRAM_WEBHOOK_SECRET` + `setWebhook`** — скриптом из § 3.1. Руками не делать.
5. **`TELEGRAM_SEND_KEY` + Vault** — скриптом из § 3.2. Руками не делать.
6. **`telegram_send_url` в Vault** (один раз, значение не секретное, но живёт там же):
   ```sql
   select vault.create_secret(
     'https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/telegram-send',
     'telegram_send_url', 'URL edge-функции telegram-send');
   ```
7. **`NEXT_PUBLIC_TELEGRAM_BOT`** (без `@`) в `.env.local` и в переменных Vercel. Без неё
   секция настроек честно скажет «Бот не настроен».
8. **Проверка:** Настройки → Telegram → «Подключить» → `/start` в боте → карточка в CRM
   меняется сама (realtime). Затем назначить себе задачу и дождаться сообщения —
   это проверяет уже исходящий контур целиком.

---

## 3. Ротация секретов — скриптами, не руками

> ### ⚠️ Почему через файл, а не вставкой в терминал
>
> `read` внутри многострочного блока, вставленного в терминал, **не ждёт человека**: на
> стандартном вводе уже лежит остаток вставленного текста, и переменной достаётся
> следующая строка скрипта.
>
> На гейте 2026-08-08 `read -s TG_TOKEN` съел строку `curl -s "https://api.telegram.org/…`,
> URL собрался из мусора, Telegram ответил `404 Not Found` — и симптом не имел ничего
> общего с причиной. Внутри файла, запущенного через `bash`, `read` читает терминал.
>
> **Кавычки в `<<'EOF'` обязательны**, иначе `$VAR` подставятся при записи файла и в
> скрипт приедут пустые строки.

### 3.1. Ротация `TELEGRAM_WEBHOOK_SECRET`

Одно значение уходит в Function Secrets и в `setWebhook`. Обе подстановки — из одной
переменной, поэтому разойтись им негде.

```bash
cat > /tmp/tg-rotate-webhook.sh <<'EOF'
set -euo pipefail
REF=uoiavcabxgdjugzryrmj

read -rsp 'TELEGRAM_BOT_TOKEN: ' TG_TOKEN; echo
[ -n "$TG_TOKEN" ] || { echo 'пустой токен — выходим'; exit 1; }

SECRET=$(openssl rand -hex 32)

npx -y supabase@latest secrets set "TELEGRAM_WEBHOOK_SECRET=$SECRET" --project-ref "$REF"

# Секрет доезжает до рантайма функции НЕ мгновенно. Без паузы получишь тот же 401
# и будешь искать его не там.
echo 'ждём распространения секрета (30 с)…'; sleep 30

curl -s "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
  -d "url=https://${REF}.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=${SECRET}" \
  -d 'allowed_updates=["message","callback_query"]'
echo
curl -s "https://api.telegram.org/bot${TG_TOKEN}/getWebhookInfo"; echo
EOF
bash /tmp/tg-rotate-webhook.sh; rm -f /tmp/tg-rotate-webhook.sh
```

Успех — `{"ok":true,"result":true,"description":"Webhook was set"}`, затем в
`getWebhookInfo` правильный `url` и пустой `last_error_message`.

### 3.2. Ротация `TELEGRAM_SEND_KEY`

Одно значение уходит в Function Secrets и в Vault. Vault правится SQL'ом, поэтому скрипт
кладёт ключ в secrets и **печатает готовый SQL** — его остаётся выполнить в SQL Editor.

```bash
cat > /tmp/tg-rotate-send.sh <<'EOF'
set -euo pipefail
REF=uoiavcabxgdjugzryrmj

KEY=$(openssl rand -hex 32)

npx -y supabase@latest secrets set "TELEGRAM_SEND_KEY=$KEY" --project-ref "$REF"

cat <<SQL

──────── выполнить в SQL Editor, целиком и сразу ────────
delete from vault.secrets where name = 'telegram_send_key';
select vault.create_secret('$KEY', 'telegram_send_key',
       'Shared secret диспетчера Telegram');
─────────────────────────────────────────────────────────

Пока SQL не выполнен, ключи РАЗЪЕХАЛИСЬ: тик шлёт старый, функция ждёт новый → 401.
Очередь при этом не портится (см. § 5) — сообщения полежат pending.
SQL
EOF
bash /tmp/tg-rotate-send.sh; rm -f /tmp/tg-rotate-send.sh
```

`delete` перед `create_secret` обязателен: `vault.create_secret` на существующем имени
падает, а `update` требует id.

---

## 4. Диагностика — три запроса, в этом порядке

Порядок не произвольный: он идёт по маршруту сообщения и на каждом шаге отсекает половину.

```sql
-- 1. Дошёл ли апдейт от Telegram вообще (входящий контур)
select count(*) from telegram_updates;

-- 2. Что ответила наша функция диспетчеру — тут 401 виден ДОСЛОВНО (исходящий контур)
select status_code, left(content, 120), created
from net._http_response
where created > now() - interval '10 minutes'
order by created desc limit 5;

-- 3. Состояние очереди
select status, attempts, last_error, created_at, sent_at
from telegram_outbox order by created_at desc limit 5;
```

`net._http_response` (pg_net) хранит ответ дословно, включая тело, и за секунду отличает
«функция не вызвана» от «вызвана и вернула 401». Логи edge для этого читать долго, и они
шумят. Приём общий для `webhook-dispatch` (089) и `telegram-send` (107).

Со стороны Telegram:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Смотреть `url`, `pending_update_count`, `last_error_message`.

### Симптом ⇒ причина

| Симптом | Причина |
|---|---|
| `telegram_updates` пуст, в логах edge ноль вызовов | `setWebhook` не сделан или указывает на другой URL |
| Бот отвечает на `/start`, но нажатие кнопки не даёт **ничего** — в логах edge ноль вызовов, `pending_update_count` = 0, `last_error_message` пуст | `allowed_updates` у Telegram не содержит `callback_query`. Апдейт отбрасывается на его стороне, следов нет нигде → § 3.1 (перерегистрация требует и `secret_token`, значит идёт вместе с ротацией) |
| `getWebhookInfo`: `last_error_message` = `401 Unauthorized` | `TELEGRAM_WEBHOOK_SECRET` ≠ `secret_token` у Telegram → § 3.1 |
| Бот отвечает «Разбор временно недоступен», в `function_logs` пусто | смотреть **`function_edge_logs`**: POST `/ai-capture` со статусом **401** и UA `Deno/… SupabaseEdgeRuntime`. Шлюзовая проверка `verify_jwt` принимает только JWT, а платформа отдаёт в `SUPABASE_SERVICE_ROLE_KEY` ключ новой схемы `sb_secret_…` → нужен секрет `EDGE_INVOKE_JWT` (легаси-JWT service_role). Диагностику функция печатает сама: имена и длины `SUPABASE_*` и то, чем авторизовалась |
| `net._http_response`: 401, очередь `pending`, `attempts = 0` | `TELEGRAM_SEND_KEY` ≠ Vault `telegram_send_key` → § 3.2 |
| Очередь `pending`, тик молчит, в `net._http_response` пусто | нет Vault-секретов — `telegram_send_tick()` выходит **молча, by design** (§ 6 миграции 107) |
| `setWebhook` вернул `404 Not Found` | токен бота пустой: `read` съел строку вставки → запускать через файл, § 3 |
| Строка `error`, `last_error` начинается с `403` | пользователь заблокировал бота. Ретраев нет **намеренно** — повторять нечего |
| Строка `error`, `last_error` = `400: can't parse entities` | баг экранирования в `telegram_notification_text()` / зеркале `telegram-message.ts` — это наша ошибка, не Telegram |
| Уведомление есть в колокольчике, в Telegram нет | у получателя нет привязки (`telegram_accounts`) — триггер молча пропускает, это штатный путь |

---

## 5. Свойство, которое надо знать

**Пока транспорт сломан, очередь не портится.** 401 приходит **до** `claim_telegram_outbox`,
поэтому `attempts` не растёт и строка не деградирует до `error`: сообщения лежат `pending`
и уезжают первым же исправным тиком.

Проверено на гейте 2026-08-08 — сообщение пролежало **412 секунд**, пока чинили ключ, и ушло
без потерь.

**Не «чинить» очередь руками.** Ни `update … set status='pending'`, ни удаление строк не
нужны: чинить надо ключ, очередь дождётся. Это же — главный аргумент за очередь против
fire-and-forget: при том же сбое `pg_net` без очереди сообщение было бы потеряно молча.

---

## 6. Состояние, которого нет в репозитории

Три инцидента за два дня — все одного рода: код верен, миграции применены, тесты зелёные, а работает не всё. Причина каждый раз жила **вне репозитория**, там, где ни git, ни CI её не видят:

| Где | Что | Как проверяется |
|---|---|---|
| Function Secrets | `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_SEND_KEY`, `TELEGRAM_BOT_TOKEN`, `EDGE_INVOKE_JWT` | только косвенно: 401 в логах edge / `net._http_response` |
| **Платформа Supabase** | под каким видом ключа приезжает `SUPABASE_SERVICE_ROLE_KEY` (легаси-JWT или `sb_secret_…`) | `function_edge_logs`, поле `request.sb.apikey.apikey.prefix` |
| Vault | `telegram_send_key`, `telegram_send_url` | `select name, updated_at from vault.secrets` |
| **У Telegram** | `url`, `secret_token`, **`allowed_updates`** | `getWebhookInfo` |

⚠️ **`getWebhookInfo` — обязательный шаг после КАЖДОГО `setWebhook`**, а не «если что-то не так». Скрипт § 3.1 его уже печатает; смотреть надо на все три поля, а не только на `ok: true`.

Отдельно про `allowed_updates`: **повторный `setWebhook` без этого параметра сохраняет прежний список**, а не открывает всё. Список задаётся явно каждый раз — иначе новый тип апдейта, добавленный следующим спринтом, молча не придёт.
