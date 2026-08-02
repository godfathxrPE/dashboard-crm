# S-R2-WEBHOOK-JOURNAL — журнал доставок, «Повторить», ретеншн, контракт G3

**Ветка:** `feat/r2-webhook-journal` от `main` (после мержа `feat/r2-webhook-action`).
**Миграция 091.** Один коммит. Порядок деплоя: миграция 091 → фронт.
Edge-функцию **не трогаем**: `git diff` по `supabase/functions/**` обязан быть пуст.

R2-P2, спринт 5. Эпик **B2**, третий и последний. 088/089 (транспорт) и 090 (действие
движка) в проде и проверены: доставка 200/`delivered`, подпись сверена пересчётом HMAC,
SSRF отбил `localtest.me`, все шесть действий движка отработали на гейте 2026-07-31.

**Трудоёмкость: 9–12 ч. Риск средний.** 091 аддитивна — существующие функции не
переписываются, сигнатуры не меняются. Основной риск не в SQL, а в семантике «Повторить»:
неверный выбор там даёт кнопку, которая молча ничего не делает.

**Ревью Грока нет** — секция «Самопроверка» обязательна.

---

## Что разведка изменила против плана

### 1. «Повторить» обязан создавать НОВУЮ строку, а не оживлять старую

Очевидный вариант — `update webhook_deliveries set status='pending', attempt=0,
next_retry_at=now() where id=…` — **ломается о собственный контракт идемпотентности.**

`id` строки доставки уходит получателю в заголовке `X-Torii-Delivery`
(`index.ts:288-296`) и внутри тела как `payload.id`. Это ключ дедупликации: получателю
сказано игнорировать повтор с тем же `X-Torii-Delivery`. Значит корректно написанный
приёмник **отбросит ручной повтор** — кнопка отработает, статус станет `delivered`, а на
той стороне не появится ничего. Худший исход: ложноположительный результат.

Плюс исчезнет история: провалившаяся попытка перестанет быть видна в журнале, и понять,
что вообще происходило, будет нельзя.

⇒ `retry_webhook_delivery` **вставляет новую строку** с новым `id`, копируя `payload`
исходной. Так же устроен «Resend» у Stripe (новый `event delivery`) и HubSpot.

**Ловушка внутри ловушки:** `payload.id` в скопированном теле останется старым, и тогда
заголовок `X-Torii-Delivery` разойдётся с телом — получатель, дедуплицирующий по
`payload.id`, снова всё отбросит, а тот, кто дедуплицирует по заголовку, — нет. Два
поведения на одно событие. `payload` обязан быть переписан через `jsonb_set(…, '{id}', …)`.

**`occurred_at` при этом НЕ трогаем.** Это время, когда произошло событие в CRM, а не
время отправки. Перезапись превратила бы повтор старого события в «новое событие сегодня».

### 2. Повтор в отключённый endpoint гарантированно даёт `dropped`

`index.ts:370`: `if (!d.is_active) → record(dropped, 'Endpoint отключён')`. Захват очереди
(`claim_webhook_deliveries`) по `is_active` **не фильтрует** — решение принимает edge.

Значит повтор в выключенный endpoint не «подождёт включения», а немедленно станет второй
мёртвой строкой. ⇒ RPC поднимает `webhook_endpoint_inactive` (тот же errcode `22023`, что
у `send_test_webhook`), а кнопка в UI выключена с объясняющим `title`.

### 3. Повтор может добить endpoint до авто-отключения

`record_webhook_result` инкрементит `consecutive_failures` на любом неуспехе, и на пороге
(по умолчанию 20) гасит endpoint с уведомлением `webhook_disabled` владельцам. Ручной
повтор идёт по тому же пути.

Это правильное поведение — не чинить, — но пользователь должен понимать, что жмёт. ⇒ в
панели журнала под кнопкой видно `провалов подряд: N`, как уже сделано в строке endpoint'а
(`WebhooksSection.tsx:172-179`).

### 4. Серверной пагинации в проекте нет вообще

`useInfiniteQuery` — 0 совпадений по `src/`. `.range(` — 0 совпадений. `DataTable`
(`src/components/shared/DataTable.tsx:107-108`) пагинирует **клиентски**, поверх целиком
загруженного массива.

`webhook_deliveries` — единственная таблица в системе, растущая линейно по времени и
неограниченно. Тянуть её целиком в `DataTable` нельзя.

⇒ **Не заводим в проекте инфраструктуру пагинации ради одного экрана.** Берём конвенцию,
которая в проекте уже есть, — растущий `.limit()`, как в `use-activity-log.ts:27`
(`.order('created_at', {ascending:false}).limit(50)`) и `use-notifications.ts:28`.
Кнопка «Показать ещё» увеличивает лимит на 50 и перезапрашивает.

Честная цена: каждое нажатие перезапрашивает весь префикс (50 → 100 → 150 строк), а не
догружает хвост. При ретеншне 30 дней и текущем объёме это доли секунды и десятки
килобайт. **Это осознанный размен на отсутствие новой абстракции, и он должен быть
записан комментарием в хуке** — иначе следующая сессия примет его за недосмотр.

Порог пересмотра: если журнал одного endpoint'а начнёт регулярно уходить за ~500 строк —
пора за `.range()`, и тогда уже как общий примитив, а не локально.

### 5. Подпись в G3 документируется БЕЗ пробела

`transport.ts:310-314` фиксирует расхождение прямо в коде: в §3.3 арх-дока значение
отрендерено как `t=1769…, v1=…` с пробелом, но это проза, а не спецификация. Реальный
формат — `t=<unix>,v1=<hex>`, **без пробела**, и тест `webhook-transport.test.ts:222`
это закрепляет.

G3 берёт вариант из кода. Один пробел в примере из документа — это чужой верификатор,
который не сходится, и день переписки.

---

## Миграция 091 — `supabase/migrations/091_webhook_journal.sql`

Три вещи: RPC повтора, функция ретеншна, cron-джоба. Ничего существующего не
переписывается.

### 1. `retry_webhook_delivery(p_delivery_id uuid) returns uuid`

DEFINER, `set search_path = public, pg_temp`, гейт роли в теле (паттерн 088:
`send_test_webhook` / `delete_webhook_endpoint` — читать оттуда дословно, не по памяти).

Порядок проверок — ровно такой, каждая со своим сообщением:

1. `v_org`/`v_role` из `current_org_id()` / `current_org_role()`; null → `42501`
   `webhook_endpoint_denied: no active org`.
2. роль не в `('owner','admin')` → `42501` `webhook_endpoint_denied: owner or admin required`.
3. исходная строка: `select * from webhook_deliveries where id = p_delivery_id and org_id = v_org`.
   Не найдено → `42501` `webhook_delivery_denied: not found`. **`org_id = v_org` в WHERE
   обязателен и при DEFINER**: RLS внутри DEFINER не действует, граница арендатора здесь
   держится только этим предикатом.
4. `status not in ('failed','dropped')` → `22023` `webhook_delivery_not_retryable`.
   `pending` повторять нельзя: строка либо ждёт своей минуты, либо взята под лизинг на
   5 минут (`claim_webhook_deliveries`, `next_retry_at = now() + interval '5 minutes'`),
   и повтор дал бы двойную отправку. `delivered` повторять нечего.
5. endpoint: `select * from webhook_endpoints where id = v_src.endpoint_id and org_id = v_org`.
   Не найдено → `42501` `webhook_endpoint_denied: not found`.
   `not is_active` → `22023` `webhook_endpoint_inactive` (см. находку 2).

Дальше вставка:

```sql
v_new_id := gen_random_uuid();

insert into public.webhook_deliveries
  (id, org_id, endpoint_id, rule_id, event, payload, status, attempt, next_retry_at)
values (
  v_new_id, v_org, v_src.endpoint_id, v_src.rule_id, v_src.event,
  -- ⚠️ payload.id ОБЯЗАН совпасть с новым id: он уходит и в теле, и в заголовке
  --    X-Torii-Delivery. Расхождение = два разных ключа дедупликации на одно событие.
  -- ⚠️ occurred_at НЕ переписываем: это время события в CRM, не время отправки.
  case when jsonb_typeof(v_src.payload) = 'object'
       then jsonb_set(v_src.payload, '{id}', to_jsonb(v_new_id))
       else v_src.payload
  end,
  'pending', 0, now()
);
```

`jsonb_typeof` вокруг `jsonb_set` — не паранойя: `payload` объявлен просто `jsonb`, и на
не-объекте `jsonb_set` бросает `22023`, а исключение здесь съело бы кнопку целиком.

Немедленный тик — как в `send_test_webhook` (пользователь смотрит на экран), с той же
защитой на случай применения 091 раньше 089 в чистом окружении:

```sql
if to_regprocedure('public.dispatch_webhooks_tick()') is not null then
  perform public.dispatch_webhooks_tick();
end if;

return v_new_id;
```

Гранты: `revoke all … from public, anon`; `grant execute … to authenticated`
(гейт роли в теле — паттерн всех RPC 088). `comment on function` обязателен.

### 2. `cleanup_webhook_deliveries() returns integer`

DEFINER, `service_role` (зовёт cron, не пользователь). Возвращает число удалённых строк —
чтобы `cron.job_run_details` показывал работу, а не пустой успех.

```sql
delete from public.webhook_deliveries
where status in ('delivered','failed','dropped')
  and created_at < now() - interval '30 days';
get diagnostics v_deleted = row_count;
```

**`pending` не удаляем никогда, независимо от возраста.** Строка, висящая `pending` 31
день, — это симптом (лизинг не снялся, очередь не разбирается), и удалить её значит
стереть единственный след проблемы. Пусть накапливается и колет глаза.

Ретеншн 30 дней зашит константой в теле с комментарием. Параметром не делаем: единственный
вызывающий — cron, а «настраиваемый ретеншн» без UI — это мёртвый параметр.

Батчинга нет. При текущем объёме единичный DELETE отрабатывает мгновенно; **это записать
комментарием вместе с порогом**: если таблица дорастёт до сотен тысяч строк, DELETE надо
резать на пачки по 5 000 в цикле, иначе одна ночная транзакция подержит блокировку дольше,
чем нужно.

### 3. Cron `webhook-cleanup`

Пятая джоба проекта. Существующие (сверено с `cron.job` 2026-07-31):
`wf-overdue-daily 0 6`, `recurring-daily 5 6`, `wf-dwell-daily 10 6`, `webhook-retry * * * * *`.

```sql
select cron.schedule('webhook-cleanup', '15 6 * * *',
  $$select public.cleanup_webhook_deliveries();$$);
```

06:15 UTC — следующий свободный слот в утренней цепочке, шаг 5 минут, как у остальных.
Регистрация через тот же идемпотентный паттерн, что в 089 (`cron.unschedule` при
существующем имени → `cron.schedule`) — читать из 089 дословно.

⚠️ `pg_cron` живёт в Postgres, не в Vercel. Тариф Hobby с его «cron не чаще раза в сутки»
здесь ни при чём — ограничение относится к Vercel Cron, которым проект не пользуется.

---

## Фронт

### Новое в `src/lib/constants/webhooks.ts` (файл создать)

`DELIVERY_LABEL` сейчас лежит локально в `WebhooksSection.tsx:18-23`. Журналу он нужен
тоже. Вынести в константы вместе с картой цветов статуса:

```ts
export const DELIVERY_LABEL: Record<WebhookDeliveryStatus, string> = {
  pending: 'в очереди…', delivered: 'доставлено',
  failed: 'не доставлено', dropped: 'отброшено',
};
/** Цвет бейджа статуса. dropped ≠ failed: адрес отклонён проверкой, а не приёмником. */
export const DELIVERY_TONE: Record<WebhookDeliveryStatus, string> = { … };
```

`WebhooksSection.tsx` переходит на импорт; локальное определение удалить, а не оставить
дублем.

### `src/lib/hooks/use-webhook-endpoints.ts` — дополнить

Держим в том же файле: это один домен, а хуки эндпоинтов и доставок ходят в одни и те же
RPC-соседи.

```ts
export const webhookDeliveriesKey = (endpointId: string, limit: number) =>
  ['webhook-deliveries', endpointId, limit] as const;

export function useWebhookDeliveries(endpointId: string | null, limit: number)
```

- `enabled: !!endpointId` — журнал грузится только когда панель открыта.
- `.from('webhook_deliveries').select(DELIVERY_COLUMNS).eq('endpoint_id', endpointId!)
  .order('created_at', { ascending: false }).limit(limit)`.
- `DELIVERY_COLUMNS` — **одной литеральной строкой**, как `ENDPOINT_COLUMNS`
  (`use-webhook-endpoints.ts:41-47`): конкатенация ломает вывод типов postgrest. Грабля
  уже зафиксирована в этом файле — не наступать второй раз.
- `staleTime: 1000 * 10`.
- `refetchInterval` **функцией**, по образцу `useWebhookDelivery:96-99`: если в выдаче
  есть хоть одна строка `pending` → `2000`, иначе `false`. Без этого только что созданный
  повтор навсегда останется «в очереди…» на экране.
- `limit` в ключе кеша — обязателен, иначе «Показать ещё» отдаст закешированные 50.

```ts
export function useRetryWebhookDelivery()
```

`supabase.rpc('retry_webhook_delivery', { p_delivery_id })`, возвращает новый uuid.
`onSettled` инвалидирует **и** `['webhook-deliveries']` (префиксом, все лимиты), **и**
`webhookEndpointsKey()` — счётчик провалов и `last_status_code` у endpoint'а меняются.
Тост — в компоненте, не в хуке (конвенция файла).

### `src/components/settings/webhooks/WebhookDeliveriesModal.tsx` (новый)

Журнал **на один endpoint**, не общий. Под это уже существует индекс
`idx_webhook_deliveries_endpoint (endpoint_id, created_at desc)`, и комментарий в
`088:147` буквально говорит «журнал одного endpoint'а, спринт 3».

Общий по org журнал не делаем: на странице настроек шириной `max-w-2xl` ему негде жить, а
`idx_webhook_deliveries_org` остаётся под будущий раздел аналитики.

Через общий `Modal` (`src/components/shared/Modal.tsx`), `maxWidth="max-w-3xl"`,
`title={`Доставки — ${endpoint.name}`}`.

Строка журнала:

- бейдж статуса (`DELIVERY_LABEL` + `DELIVERY_TONE`, `rounded-full px-2 py-0.5 text-xs`);
- `event` моноширинно, `text-xs text-text-main`;
- время — **`formatRelative` из `src/lib/utils/dates.ts:21-24`**. Функция существует и
  сейчас не импортируется ни одним компонентом. В проекте уже три независимые реализации
  relative-time (`EntityTimeline.tsx:48-60`, `NotificationBell.tsx:55-63` и эта);
  **четвёртую не писать**, взять существующую. Полная дата — в `title`;
- `попытка N / 7` (`MAX_ATTEMPTS = 7`, `transport.ts:193`) — иначе `attempt: 3` ничего не
  говорит;
- `HTTP {response_status}` при наличии;
- `error` в `text-red`, если есть;
- кнопка «Повторить» — только при `status in ('failed','dropped')`;
- `<details>` «Тело» → `<pre>` с `JSON.stringify(payload, null, 2)`, `text-meta`,
  `max-h-64 overflow-auto`, `bg-surface2`, + кнопка «Копировать».

Про `<pre>`: **JSON-viewer'а в проекте нет и заводить его в этом спринте не надо** —
единственный потребитель. `response_body` рендерить тем же способом: он приходит от чужого
сервера, обрезан до 8 КБ (`RESPONSE_BODY_LIMIT_BYTES`) и может быть HTML — только текстом,
никакого `dangerouslySetInnerHTML`.

Копирование — дословно паттерн `WebhookSecretModal.tsx:23-30`
(`navigator.clipboard.writeText` в try/catch, `toast.success` / `toast.error('Буфер обмена
недоступен — скопируйте вручную')`). Отдельный хук не заводить: в проекте его нет, а
четвёртое место — не повод.

Состояния:

- loading → `<p className="text-meta text-text-mute">Загружаем журнал…</p>`;
- пусто → `EmptyState` (`src/components/ui/EmptyState.tsx`), текст «Доставок пока не было.
  Нажмите «Тест» или настройте правило с действием «Отправить вебхук»»;
- «Показать ещё» — показывать **только когда `data.length === limit`**, иначе кнопка
  висит на последней странице и обещает то, чего нет.

### `src/components/settings/WebhooksSection.tsx` — правки

1. Четвёртая кнопка-иконка в строке endpoint'а: `ScrollText size={13}` (lucide),
   `aria-label="Журнал доставок"`, тот же класс, что у трёх существующих
   (`shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main
   disabled:opacity-40`). Открывает `WebhookDeliveriesModal`.
2. Комментарий-шапка секции (стр. 45-55) прямо утверждает: «Здесь СОЗНАТЕЛЬНО нет журнала
   доставок, кнопки „Повторить“ и редактирования endpoint'а: это спринт 3». **Переписать.**
   Редактирование endpoint'а в этот спринт по-прежнему не входит — сказать это явно, чтобы
   следующая сессия не искала его в 091.
3. `DELIVERY_LABEL` — на импорт из констант.

Роль: секция целиком закрыта гейтом `canManage` (стр. 70-71) и RLS
`webhook_deliveries_select` (owner/admin). Отдельная проверка роли внутри модалки не нужна
и её не добавлять — второй источник правды.

---

## Контракт G3 — `docs/WEBHOOKS-CONTRACT.md`

В `docs/` сейчас только `TECH-STACK.md` и `schema.md`; документов для внешних потребителей
нет вовсе. G3 ложится в стиль `TECH-STACK.md`: `# Заголовок` → блок метаданных
(`**Проект:**`, `**Назначение:**`, `**Дата документа:**`, `**Источник правды:**`) → `---` →
нумерованные разделы. Русский текст, английские технические термины.

**Источник правды для каждого числа и строки — код, а не арх-док.** Арх-док писался до
реализации; там уже одно расхождение (пробел в подписи).

Разделы:

1. **Что это** — исходящие вебхуки Torii CRM, POST, JSON, подпись HMAC.
2. **Заголовки** — таблица, дословно из `index.ts:288-296`:
   `content-type`, `user-agent: torii-crm-webhooks/1`, `X-Torii-Delivery`,
   `X-Torii-Event`, `X-Torii-Event-Version: 1`, `X-Torii-Attempt`, `X-Torii-Signature`.
3. **Проверка подписи** — схема `t=<unix>,v1=<hex>`, **без пробела**;
   `hmac_sha256(secret, "<t>.<raw>")`, где `raw` — **сырое тело запроса побайтово**, не
   пересериализованный объект (тест `webhook-transport.test.ts:231` закрепляет именно это).
   Псевдокод на Node и на Python. Явно: сравнивать constant-time; проверять |now − t|
   и отвергать старое (защита от replay).
4. **Идемпотентность** — `X-Torii-Delivery` уникален на доставку и **одинаков у всех
   автоматических попыток**. Приёмник обязан дедуплицировать по нему.
   Отдельным абзацем: **ручной повтор из UI приходит с НОВЫМ `X-Torii-Delivery`** — это не
   баг, а намеренное решение (иначе повтор был бы неотличим от ретрая и отбрасывался).
   Событие можно опознать по совпадению `entity.id` + `event` + `occurred_at`.
5. **Ретраи** — 7 попыток максимум (`MAX_ATTEMPTS`), расписание 1 м / 5 м / 30 м / 2 ч /
   6 ч / 24 ч (`RETRY_DELAYS_MS`), `Retry-After` уважается и режется сутками
   (`RETRY_AFTER_CAP_MS`). Что считается успехом и провалом — из `classifyStatus`:
   2xx → успех; **3xx → провал без ретрая** (редирект трактуется как попытка обойти
   SSRF-проверку, `redirect: 'manual'`); 408 и 429 → ретрай; прочие 4xx → провал без
   ретрая; 5xx и сетевые ошибки → ретрай.
6. **Требования к приёмнику** — таймаут запроса 5 с (`REQUEST_TIMEOUT_MS`): отвечать 2xx
   сразу и обрабатывать асинхронно. Только `https`, только порт 443, IP-литералы и
   приватные диапазоны отклоняются на нашей стороне (доставка получает статус `dropped`).
   Тело ответа читается и хранится обрезанным до 8 КБ.
7. **Авто-отключение** — 20 провалов подряд гасят endpoint, владельцам уходит уведомление;
   счётчик обнуляется первой успешной доставкой.
8. **События** — таблица `event` → когда шлётся: `deal.stage_changed`,
   `deal.status_changed`, `deal.field_changed`, `deal.stuck_in_stage`, `webhook.test`.
   Явно: `task.overdue` **не поддержан** и в этой версии не отправляется.
9. **Схема payload** — верхний уровень (`version, id, event, occurred_at, org_id, rule,
   entity, data`, опционально `changes`) + таблица полей `data` дословно из
   `build_deal_webhook_payload` (090). Отдельно и жирным:
   - **`budget` в копейках**, целое;
   - `occurred_at` — UTC, ISO-8601 с микросекундами и `Z`;
   - `data` — **закрытый whitelist**: новые поля сделки в вебхук автоматически не
     попадают, добавление поля — изменение контракта;
   - `changes` присутствует **только когда дифф есть**; у `deal.stuck_in_stage` его нет
     вовсе (ключ отсутствует, а не `null`);
   - `stage/owner/company/contact` могут быть `null`.
10. **Версионирование** — `version: 1` в теле и `X-Torii-Event-Version`. Правило: добавление
    поля в `data` версию не поднимает, приёмник обязан игнорировать незнакомые ключи;
    удаление или смена смысла поля — новая версия.
11. **Пример** — полное тело `deal.stage_changed` с `changes`, скопированное из реальной
    доставки, а не сочинённое.

Файл упомянуть в `docs/schema.md` рядом с разделом `webhook_endpoints / webhook_deliveries`
одной строкой-ссылкой.

---

## Крайние случаи (проверить головой, отметить в отчёте)

1. Повтор `pending` — RPC отказывает (`22023`), кнопки в UI нет.
2. Повтор `delivered` — кнопки нет.
3. Повтор в отключённый endpoint — RPC отказывает, кнопка выключена с `title`.
4. Повтор чужой org — `not found`, не «нет прав» (не подтверждаем существование id).
5. Повтор менеджером/viewer — секция настроек для него не рендерится, но RPC обязан
   отказать сам (проверить прямым вызовом).
6. Повтор доставки, чьё правило удалено (`rule_id` → null по FK) — работает, `rule_id`
   копируется как есть.
7. `payload` не-объект (теоретически, колонка просто `jsonb`) — `jsonb_set` не зовётся,
   строка вставляется как есть.
8. Endpoint удалён между открытием модалки и нажатием «Повторить» — RPC `not found`,
   тост с сообщением, журнал перезапрашивается.
9. Два повтора подряд по одной строке — создаются две независимые доставки. Это
   допустимо и намеренно; кнопку блокировать на время `isPending`.
10. Журнал у endpoint'а с 0 доставок — `EmptyState`, «Показать ещё» не показывается.
11. Ровно 50 доставок — `data.length === limit`, кнопка показана; после нажатия придёт
    те же 50, кнопка исчезнет. Некрасиво, но честно; альтернатива — запрашивать `limit+1`
    и показывать `limit`. **Сделать через `limit+1`**, это дешевле объяснения.
12. Ретеншн-джоба при пустой таблице — возвращает 0, не падает.
13. Ретеншн и `pending` старше 30 дней — строка остаётся (проверить SQL-ом, это главное
    свойство функции).

---

## Тесты

`tests/unit/` — юниты чистой логики, без БД (конвенция: `webhook-transport.test.ts`,
`automation-webhook.test.ts`).

Новый файл `tests/unit/webhook-journal.test.ts`:

1. `DELIVERY_LABEL` покрывает все четыре значения `WebhookDeliveryStatus` — тест на
   полноту Record (защита от пятого статуса без ярлыка).
2. `DELIVERY_TONE` — то же.
3. Хелпер «показывать ли Повторить» (вынести чистой функцией
   `canRetryDelivery(status, endpointActive): boolean`, а не инлайном в JSX — иначе не
   тестируется): `failed`+active → true; `dropped`+active → true; `pending` → false;
   `delivered` → false; любой + `!active` → false.
4. Хелпер «показывать ли Показать ещё» на границе (получили `limit+1`).

Существующие 565 тестов обязаны остаться зелёными.

**Смоки в проде — за Cowork на гейте**, не за CC:
- повтор `failed` → новая строка, `payload.id` = новый `id`, `occurred_at` не изменился;
- повтор в выключенный endpoint → отказ;
- повтор менеджером → отказ;
- `cleanup_webhook_deliveries()` руками: терминальные старше 30 дней удаляются, `pending`
  любого возраста остаётся;
- `cron.job` = 5 джоб, `webhook-cleanup` активна.

---

## VERIFY

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build      # последним, при остановленном next dev
```

Ожидание: тестов 565 + новые; `npm run lint` — те же 15 errors / 34 warnings, что на
`main` (сверить `git stash`-ом, как в прошлый раз), **ни одной новой**; `git diff` по
`supabase/functions/**` и по `supabase/migrations/0[0-8]*.sql`, `090_*.sql` — **пуст**.

Коммит: `feat(webhooks): журнал доставок, повтор, ретеншн и контракт G3 (091)`

```
Type Safety:            [заполнить]
RLS Coverage:           [заполнить] — новых таблиц нет; проверить, что RPC гейтит роль сам,
                        а не полагается на то, что секция не отрендерится
Backward Compatibility: [заполнить] — 091 аддитивна, существующие функции не переписываются
Runtime Tested:         NOT_VERIFIED (091 применяет Cowork на гейте)
Regional Availability:  NOT_APPLICABLE
```

## Самопроверка перед сдачей

1. `grep -c "retry_webhook_delivery" supabase/migrations/091_*.sql` — объявление, гранты,
   comment; вызова из других SQL-функций быть не должно.
2. В 091 нет `create or replace` ни для одной функции из 088/089/090 — только новые имена.
3. `payload.id` переписывается; `occurred_at` — нет. Проверить глазами по тексту миграции.
4. `cleanup_webhook_deliveries` не трогает `pending` — предикат `status in
   ('delivered','failed','dropped')` присутствует буквально.
5. `cron.job` после 091 — пять джоб, имена не пересекаются.
6. `DELIVERY_COLUMNS` — одна литеральная строка, без конкатенации.
7. `formatRelative` импортирован из `@/lib/utils/dates`, четвёртой реализации
   relative-time в диффе нет: `grep -rn "мин назад\|м назад" src/` не должен дать новых
   мест.
8. `DELIVERY_LABEL` определён ровно один раз (в константах), в `WebhooksSection.tsx`
   локального определения не осталось.
9. Комментарий-шапка `WebhooksSection.tsx` про «это спринт 3» переписан.
10. В `docs/WEBHOOKS-CONTRACT.md` подпись без пробела; все числа (7 попыток, 5 с, 8 КБ,
    20 провалов, расписание ретраев) сверены с `transport.ts`, а не с арх-доком.
11. `dangerouslySetInnerHTML` в диффе отсутствует.
12. `window.confirm` в диффе отсутствует (грабля GanttTimeline, зафиксирована в
    `WebhooksSection.tsx:65-66`).

## Что НЕ делает Claude Code

- Не применяет 091 — применит Cowork на гейте.
- Не деплоит edge-функции и не трогает `supabase/functions/**`.
- Не мержит и не пушит.
- Не заводит редактирование endpoint'а — оно не входит в этот спринт.
- Не заводит общий по org журнал и не строит инфраструктуру пагинации.
- Не правит 090 и не возвращается к `task_overdue`.
- Отчёт — отчётом о сделанном: что сделано, что не сделано и почему, VERIFY, краткий diff.
