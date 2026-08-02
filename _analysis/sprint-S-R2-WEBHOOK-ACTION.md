# S-R2-WEBHOOK-ACTION — вебхук как действие движка автоматизаций

**Ветка:** `feat/r2-webhook-action` от `main` (`16aaf93`). **Миграция 090.** Один коммит.
Порядок деплоя: миграция 090 → фронт. Edge-функцию **не трогаем** — она уже в проде и о
правилах ничего не знает.

R2-P2, спринт 4. Эпик **B2**, второй из трёх. Транспорт сдан и проверен в проде: доставка
на реальный приёмник прошла (200, `delivered`), подпись сверена независимым пересчётом HMAC,
SSRF отбил `localtest.me` → `127.0.0.1`. Архитектура — `_analysis/arch-webhooks-2026-07-29.md`.

**Трудоёмкость: 8–10 ч. Риск средний-высокий** — впервые с 079 правится **ядро движка
автоматизаций**: у `wf_apply_project_action` меняется сигнатура, а значит переписываются оба
её вызывающих планировщика.

**Ревью Грока нет** — секция «Самопроверка» обязательна.

---

## Что разведка изменила против плана

Два факта, найденных в живой БД и коде. Оба меняют scope, поэтому вынесены наверх.

### 1. `task_overdue` + webhook невозможен, и это не лень

`run_overdue_automations` (051) **не зовёт `wf_apply_project_action` вообще** — у неё своя
inline-логика с жёстким гейтом (тело функции прочитано в проде):

```sql
if r.action_type not in ('notify', 'create_activity') then
  continue;
end if;
```

То есть даже если добавить `'webhook'` в CHECK, правило с триггером «Просрочка задачи» и
действием «Вебхук» **молча не сработает никогда**. Молча — худший исход: пользователь настроил,
ждёт, ничего не приходит.

Хорошая новость: UI и Zod это уже запрещают —
`RuleEditorModal.tsx:228-230` фильтрует `actionOptions` до `notify`/`create_activity` при
`isOverdue`, а `automation-rule.ts:76-77` даёт ошибку валидации. **Ничего не сломано, но и
ничего не надо «доводить до единообразия»:** `webhook` в этот фильтр не добавляем.

Плюс к этому у задачи другая сущность: payload по контракту §3.2 — снимок **сделки**, а у
просроченной задачи сделки может не быть вовсе (`tasks.project_id` nullable). Событие
`task.overdue` из арх-дока остаётся на будущее и требует своего контракта.

⇒ **В спринте 2 webhook поддержан для четырёх триггеров:** `stage_entered`, `status_changed`,
`field_changed`, `days_in_stage`. Это должно быть написано в UI текстом, а не подразумеваться.

### 2. `changes` в payload требует правки сигнатуры ядра

Контракт §3.2 обещает получателю `changes` — что именно изменилось. Но
`wf_apply_project_action(p_rule_id, p_project_id, p_run_id, p_trigger_key)` **не получает ни
OLD, ни NEW**: она читает актуальную строку сделки заново из таблицы. Старого значения там
уже нет.

Диффы есть у вызывающих: `run_stage_automations` (079) держит `v_old`/`v_new` как
`to_jsonb(old)`/`to_jsonb(new)`. Значит `changes` надо **передать сверху**.

**Ловушка PostgreSQL, из-за которой это не однострочная правка.** `create or replace function`
с новым параметром создаёт **перегрузку**, а не заменяет функцию. После этого существующие
вызовы `perform public.wf_apply_project_action(a, b, c, d)` становятся неоднозначными
(подходят и 4-арная, и 5-арная с `default`) → `ERROR: function ... is not unique`, и движок
автоматизаций встаёт **целиком**, включая уже работающие create_task/notify/set_field.

Поэтому в 090 обязательно:

```sql
drop function if exists public.wf_apply_project_action(uuid, uuid, uuid, text);
create or replace function public.wf_apply_project_action(
  p_rule_id uuid, p_project_id uuid, p_run_id uuid, p_trigger_key text,
  p_changes jsonb default null
) ...
```

и **в той же миграции** переписать оба планировщика (`run_stage_automations`,
`run_dwell_automations`) — они содержат вызовы. Порядок в файле: сначала новая
`wf_apply_project_action`, потом планировщики, иначе между DROP и CREATE планировщика движок
ссылается в пустоту (внутри одной транзакции это неважно, но читаемость файла определяет,
что кто-то повторит порядок при откате).

**Откат 090:** обратный порядок — вернуть 4-арную версию функции из 079 и оба планировщика
дословно из 079. Текст 079 — единственный источник; не восстанавливать «по памяти».

---

## HOW — миграция 090

### 1. CHECK на шестое действие

```sql
alter table public.automation_rules drop constraint if exists automation_rules_action_type_check;
alter table public.automation_rules add constraint automation_rules_action_type_check
  check (action_type in ('create_task','notify','create_activity','set_field','suggest_spawn','webhook'));
```

Пять значений — дословно из `079:26-27`, не по памяти. `trigger_type` **не трогаем**.

### 2. Маппинг `trigger_type` → доменное имя события

Наружу уходит доменное имя, не имя триггера: набор `trigger_type` менялся четыре раза
(baseline → 050 → 051 → 079), получатель не должен от этого ломаться (§3.2).

| `trigger_type` | `event` |
|---|---|
| `stage_entered` | `deal.stage_changed` |
| `status_changed` | `deal.status_changed` |
| `field_changed` | `deal.field_changed` |
| `days_in_stage` | `deal.stuck_in_stage` |
| (тестовая отправка, 088) | `webhook.test` |

Реализовать функцией `public.webhook_event_name(p_trigger_type text) returns text`
(`language sql`, `immutable`) — чтобы имя было в одном месте, а не размазано по CASE внутри
большой функции. `else` → `'deal.updated'`: неизвестный триггер не должен ронять доставку,
но и врать конкретным именем не должен.

⚠️ **Точка синхронизации SQL↔TS**: та же карта нужна в TS для отображения в UI. Фиксируется
комментарием в обоих местах (конвенция проекта — `database.ts:370`, `ai-run/index.ts:24-31`).

### 3. Сборщик payload

`public.build_deal_webhook_payload(p_project_id uuid, p_event text, p_delivery_id uuid,
p_rule_id uuid, p_rule_name text, p_changes jsonb) returns jsonb`, `security definer`,
`search_path = public, pg_temp`.

Форма — §3.2 арх-дока, дословно:

```json
{
  "version": 1,
  "id": "<delivery_id>",
  "event": "deal.stage_changed",
  "occurred_at": "2026-07-30T19:48:21.716574Z",
  "org_id": "…",
  "rule": { "id": "…", "name": "Победа → n8n" },
  "entity": { "type": "deal", "id": "…" },
  "data": { … },
  "changes": { … }
}
```

**`occurred_at` — `to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, НЕ
`::text`.** Для `timestamptz` результат `::text` зависит от session `TimeZone`/`DateStyle`, и
значение из UI (MSK) не совпало бы со значением из cron (UTC). Та же грабля, что в 079/084 и в
`send_test_webhook` (088).

**Whitelist `data` — закрытый список:**

```
name, status, budget, probability, direction, deadline, next_action_date, next_step,
stage   → { id, name }        из pipeline_stages
owner   → { id, name }        из profiles.full_name
company → { id, name }        из companies.name
contact → { id, name }        из contacts, nullif(btrim(concat_ws(' ', first_name, last_name)), '')
```

Резолв имён — теми же таблицами и колонками, что в `087:112-132`. Не изобретать второй способ.

**Наружу НЕ уходят** (и это не забывчивость): `pinned_note`, `loss_detail`, `won_detail`,
`lost_reason`, `do_url`, `do_external_id`, `delivery_kind`, `progress_*`. Внутренние заметки,
формулировки причин проигрыша и ссылки на 1С:ДО — не дело внешней системы (§4.4).
При добавлении колонки в `projects` она **не** попадает в вебхук автоматически.

**`budget` в копейках**, как лежит в БД. Отдавать «удобные рубли» — значит завести второе
представление денег в системе, где уже есть путаница.

**`changes`** — то, что пришло параметром, без переформатирования; формат 087
(`{from, to, from_name, to_name}`). `null` → ключ в payload отсутствует вовсе (не `"changes": null`).

### 4. Ветка `webhook` в `wf_apply_project_action`

Добавляется шестой `elsif` перед хвостом (e) — аудит `automation_fired` не меняется:

```sql
elsif r.action_type = 'webhook' then
  -- endpoint_ids из action_config; каждый активный endpoint = отдельная строка очереди.
  for v_ep in
    select e.id from public.webhook_endpoints e
    where e.org_id = pr.org_id
      and e.is_active
      and e.id = any (
        select (jsonb_array_elements_text(coalesce(r.action_config->'endpoint_ids','[]'::jsonb)))::uuid
      )
  loop
    v_delivery_id := gen_random_uuid();
    insert into public.webhook_deliveries
      (id, org_id, endpoint_id, rule_id, event, payload, status, attempt, next_retry_at)
    values (
      v_delivery_id, pr.org_id, v_ep, r.id,
      public.webhook_event_name(r.trigger_type),
      public.build_deal_webhook_payload(
        pr.id, public.webhook_event_name(r.trigger_type), v_delivery_id,
        r.id, r.name, p_changes),
      'pending', 0, now()
    );
  end loop;
```

Четыре решения внутри, каждое обязательно:

1. **Удалённый или отключённый endpoint молча пропускается.** `action_config.endpoint_ids` —
   jsonb, FK на него не поставить; битая ссылка неизбежна. Пропуск лучше исключения: правило
   с двумя получателями не должно перестать работать целиком из-за одного удалённого.
2. **Кривой `endpoint_ids`** (не массив, не uuid) не роняет действие: `coalesce(...,'[]')` и
   каст внутри подзапроса. Вставки просто не будет.
3. **Тик НЕ вызывается.** `dispatch_webhooks_tick()` здесь не звать: одна массовая правка
   сделок дала бы столько же HTTP-вызовов диспетчера, сколько строк. Доставку подберёт минутный
   `webhook-retry` — задержка до 60 с для автоматизации приемлема, в отличие от кнопки «Отправить
   тест», где пользователь смотрит на экран (там тик остаётся).
4. **`next_retry_at = now()`** — строка сразу готова к отправке, иначе её не увидит ни один тик
   (условие очереди — `next_retry_at <= now()`).

### 5. Передача `changes` из планировщиков

`run_stage_automations` (079) — переписать целиком с новым вызовом. `changes` собирается по
типу триггера, **только для webhook-действия** (для остальных передаём `null`, чтобы не тратить
резолв имён на каждое срабатывание):

- `stage_entered` → `{ stage_id: { from, to, from_name, to_name } }`, имена из `pipeline_stages`;
- `status_changed` → `{ status: { from, to } }` из `v_old`/`v_new`;
- `field_changed` → `{ <field>: { from, to } }`, значения `v_old->>v_field` / `v_new->>v_field`.

`run_dwell_automations` (079) — переписать с вызовом, передающим **`null`**: «застряла на
стадии» это не изменение поля, дифф отсутствует по смыслу. В payload `changes` тогда просто нет.

Оба планировщика сохраняют существующие контракты дословно: re-entrancy guard `wf.ran`, дедуп
через `automation_runs` + `on conflict do nothing`, `exception when others then continue`
per-rule и `return new`/`return` снаружи, ACL `service_role`. **Ничего, кроме вызова
`wf_apply_project_action`, в них не меняется** — это проверяется дифом.

### 6. `delete_webhook_endpoint` чистит ссылки в правилах

Сейчас (088) функция удаляет строку и секрет. Теперь endpoint может быть упомянут в правилах,
и после удаления там останется мёртвый uuid. Дополнить:

```sql
-- убрать id из endpoint_ids всех правил org
update public.automation_rules r
set action_config = jsonb_set(
      r.action_config, '{endpoint_ids}',
      coalesce((select jsonb_agg(x) from jsonb_array_elements_text(r.action_config->'endpoint_ids') t(x)
                where x <> p_endpoint_id::text), '[]'::jsonb))
where r.org_id = v_org and r.action_type = 'webhook'
  and r.action_config->'endpoint_ids' ? p_endpoint_id::text;

-- правило без получателей деактивировать: активное правило, которое ничего не делает, хуже выключенного
update public.automation_rules
set is_active = false
where org_id = v_org and action_type = 'webhook'
  and coalesce(jsonb_array_length(action_config->'endpoint_ids'), 0) = 0
  and is_active;
```

Деактивация — осознанный выбор против «пусть висит»: правило, которое гарантированно ничего не
делает, в списке автоматизаций выглядит рабочим и вводит в заблуждение.

---

## HOW — фронт

### 1. Типы (`src/types/database.ts`)

- `AutomationActionType` — шестое значение `'webhook'` (строка ~306);
- `export interface AutomationWebhookConfig { endpoint_ids: string[] }`;
- добавить его в union `AutomationActionConfig`;
- `export const WEBHOOK_EVENT_BY_TRIGGER: Record<AutomationTriggerType, string>` — та же карта,
  что в SQL (`webhook_event_name`), с комментарием о точке синхронизации. `task_overdue` в
  карте присутствует ради полноты типа, но помечен как неподдерживаемый.

### 2. Константы (`src/lib/constants/automation.ts`)

- `AUTOMATION_ACTION_OPTIONS` (62–68) — `{ value: 'webhook', label: 'Отправить вебхук' }`;
- `AUTOMATION_ACTION_LABEL` подхватится сам (строится из OPTIONS).

### 3. Zod (`src/lib/validators/automation-rule.ts`)

- `action_type` enum (43–45) — добавить `'webhook'`;
- новое поле формы: `a_endpoint_ids: z.array(z.string().uuid()).optional()`;
- в `superRefine` — ветка: при `action_type === 'webhook'` требовать непустой массив, issue на
  path `['a_endpoint_ids']`, сообщение «Выберите хотя бы один получатель»;
- **не трогать** правило 76–77 (`task_overdue` → только notify/create_activity): оно и есть
  защита от факта №1.

### 4. `RuleEditorModal.tsx`

⚠️ **Ловушка в `toInput` (95–146): `set_field` собирается в `else`-ветке.** Добавление
`'webhook'` без явной ветки отправит webhook-правило в set_field-конфиг, и оно молча создастся
неработающим. Ветка `webhook` обязана быть **до** финального `else`:

```ts
} else if (v.action_type === 'webhook') {
  action_config = { endpoint_ids: v.a_endpoint_ids ?? [] };
} else {
  action_config = { field: v.a_set_field ?? 'next_step', value: v.a_set_value ?? '' };
}
```

Остальное:

- `emptyDefaults` (148–170) — `a_endpoint_ids: []`;
- `fromRule` (54–92) — `a_endpoint_ids: rule.action_type === 'webhook' ? (ac as AutomationWebhookConfig).endpoint_ids ?? [] : []`;
- данные: `useWebhookEndpoints()` из `src/lib/hooks/use-webhook-endpoints.ts` — уже готов, отдаёт
  `WebhookEndpoint[]` с `id`, `name`, `url`, `is_active`, есть параметр `enabled` для ленивой
  загрузки (грузить только когда `actionType === 'webhook'`);
- JSX-ветка `{actionType === 'webhook' && (...)}` рядом с остальными, классы те же
  (`labelCls`, `selectCls`, `inputCls`, `errCls` — 46–51). Мультивыбор чекбоксами, не
  `<select multiple>`: последний на macOS требует cmd-клика и в этом UI больше нигде не встречается.
  Неактивные endpoint'ы показывать с пометкой «отключён» и не давать выбрать;
- **пустой список endpoint'ов** — вместо чекбоксов текст со ссылкой в Настройки → Вебхуки
  («сначала добавьте получателя»), иначе форма выглядит сломанной;
- **текст про ограничение триггеров** — одной строкой под выбором: «Вебхук доступен для смены
  стадии, статуса, изменения поля и застревания на стадии. Для просрочки задачи — уведомление
  или заметка». Это факт №1, и пользователь должен видеть его до сохранения, а не в валидации.

### 5. `AutomationsSection.tsx`

Ярлыки правил (55–88) — показать для webhook-правила число получателей («Вебхук → 2 получателя»),
чтобы список читался без открытия модалки.

### 6. `WebhooksSection.tsx`

Убрать текст «Пока подключить вебхук к правилу автоматизации нельзя — это следующий спринт»
(115–119) — он станет ложью. Заменить на ссылку в Настройки → Автоматизации.

---

## Edge cases

| Случай | Ожидаемое поведение |
|---|---|
| Правило с двумя endpoint'ами | две строки очереди, два независимых ретрая, у каждой свой `X-Torii-Delivery` |
| Один из endpoint'ов удалён | доставка только на живой; правило работает |
| Все endpoint'ы удалены | `delete_webhook_endpoint` деактивировал правило; строк очереди нет |
| Endpoint `is_active = false` (авто-отключён после 20 провалов) | строк не создаётся вовсе — проверка `e.is_active` в цикле |
| `endpoint_ids` пуст или мусор | действие ничего не делает, исключения нет, `automation_fired` в аудите есть |
| Правило сработало дважды на одном переходе | невозможно: дедуп `automation_runs` + `on conflict (rule_id, project_id, trigger_key) do nothing` работает **до** вызова действия |
| Массовое изменение 50 сделок | 50 строк очереди, один минутный тик заберёт батч 50 — ровно `BATCH_LIMIT` |
| `days_in_stage` | `event: deal.stuck_in_stage`, `changes` отсутствует |
| Сделка без company/contact/owner | соответствующие ключи `data` — `null`, не падать |
| `task_overdue` + webhook | недостижимо: Zod и UI запрещают, 051 отфильтрует |
| Изменение, не прошедшее `wf_eval_conditions` | доставки нет — условия проверяются раньше действия |

---

## Тесты

**Юнит (чистые функции, TS):**

1. маппинг `WEBHOOK_EVENT_BY_TRIGGER` — все четыре поддержанных триггера дают ожидаемые
   доменные имена; значения совпадают со строками, которые пишет SQL (сверить руками при гейте);
2. `toInput` для `action_type === 'webhook'` даёт `{ endpoint_ids: [...] }`, а **не**
   set_field-конфиг — прямой регресс-тест на ловушку `else`-ветки;
3. `toInput` для `set_field` по-прежнему даёт `{ field, value }` (ветка не сломана);
4. Zod: webhook без endpoint'ов → ошибка на `a_endpoint_ids`; с одним uuid → валидно;
5. Zod: `task_overdue` + webhook → ошибка на `action_type` (правило 76–77 не сломано);
6. `fromRule` для webhook-правила возвращает `a_endpoint_ids` из конфига.

**SQL-смоки (гейт Cowork):**

7. правило `stage_entered` + webhook на живой endpoint → перевод сделки создаёт строку
   `pending` с `event = 'deal.stage_changed'`, `rule_id` заполнен, `payload.changes.stage_id`
   содержит `from_name`/`to_name`;
8. `payload.data` не содержит `pinned_note`, `loss_detail`, `won_detail`, `do_url`;
9. `payload.occurred_at` заканчивается на `Z` и совпадает с UTC-временем;
10. правило с двумя endpoint'ами → две строки, разные `id`, один `rule_id`;
11. endpoint отключён → строк нет; endpoint удалён → правило деактивировано, `endpoint_ids` пуст;
12. **регресс движка:** правило `create_task` по-прежнему создаёт задачу; `set_field` меняет
    поле; `notify` кладёт уведомление; `suggest_spawn` шлёт `spawn_suggest`. Это главный тест
    спринта — сигнатура ядра изменилась, и все пять старых действий обязаны работать;
13. дедуп: два UPDATE подряд на одну стадию → одна строка очереди.

---

## Самопроверка

1. **Перегрузки не осталось:** `select count(*) from pg_proc where proname = 'wf_apply_project_action'` → **1**. Если 2 — движок сломан для всех действий.
2. **Оба планировщика переписаны** и зовут 5-арную версию: `grep -c 'wf_apply_project_action' 090_*.sql` ≥ 3 (объявление + два вызова).
3. **Диф планировщиков против 079** содержит ровно одно смысловое изменение — вызов с `p_changes`. Никаких «попутных улучшений» в guard'ах, дедупе и обработке ошибок.
4. **`else`-ветка `toInput`** не поймала webhook — есть тест №2.
5. **`task_overdue`** не получил webhook ни в `actionOptions`, ни в Zod.
6. **Whitelist payload** закрытый; `pinned_note`, `loss_detail`, `won_detail`, `do_url` отсутствуют — есть смоук №8.
7. **`occurred_at`** через `to_char(... at time zone 'UTC', ...)`, не `::text`.
8. **Тик не вызывается** из `wf_apply_project_action`: `grep dispatch_webhooks_tick 090_*.sql` пуст.
9. **Точка синхронизации** карты событий помечена комментарием и в SQL, и в TS.
10. **ACL:** новые функции (`webhook_event_name`, `build_deal_webhook_payload`) — `revoke from public, anon, authenticated` + `grant execute to service_role`; вторая читает данные сделки, вызывать её из UI незачем.
11. **`supabase.gen.ts`** — новые функции появятся, реген **только CLI** (`npm run db:gen-types`, пишет в `supabase.gen.ts`; в `database.ts` руками не лезть).
12. **Edge-функция не тронута:** `git diff` по `supabase/functions/**` пуст.

---

## VERIFY / коммит

```bash
npx tsc --noEmit
npm test
npm run lint          # указать в отчёте команду и полную цифру: N problems (M errors, K warnings)
npm run build         # последним, при остановленном next dev
```

Миграцию **не применять** — apply на гейте Cowork, там же advisors, ролевые смоки и регресс
движка по пункту 12.

Коммит: `feat(webhooks): вебхук как действие движка автоматизаций (090)`

```
Type Safety:            [заполнить]
RLS Coverage:           [заполнить — политики не менялись; новые функции только service_role]
Backward Compatibility: [заполнить — ⚠️ сигнатура wf_apply_project_action изменена;
                        пять существующих действий обязаны работать, смоук 12]
Runtime Tested:         [заполнить — юниты 1–6; SQL-смоки 7–13 за гейтом]
Regional Availability:  NOT_APPLICABLE
```

## Что НЕ делает Claude Code

- Не применяет миграции и не деплоит edge-функции.
- Не правит `supabase.gen.ts` / `database.ts` руками (кроме добавления типов в `database.ts`);
  реген — CLI.
- Не читает `.env`.
- Не добавляет `webhook` в разрешённые действия для `task_overdue` и не правит `051`.
- Не трогает `supabase/functions/webhook-dispatch/**` — транспорт сдан.
- Не заводит журнал доставок в UI, ретеншн и «Повторить» — спринт 3.
- Отчёт — отчётом о сделанном; для lint указать команду и полную цифру.
