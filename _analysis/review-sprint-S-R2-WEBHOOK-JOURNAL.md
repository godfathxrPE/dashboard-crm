# Ревью: S-R2-WEBHOOK-JOURNAL — журнал, «Повторить», ретеншн, G3

**Дата:** 2026-07-31  
**Ревьюер:** Grok (верификация по коду `feat/r2-webhook-action` @ `624996b`; `main` ещё на `16aaf93` без 090; live `src/`, 088/089/090, edge `webhook-dispatch`, arch §3 / transport)  
**Объект:** `_analysis/sprint-S-R2-WEBHOOK-JOURNAL.md` — миграция **091**, UI журнала, retry-RPC, cleanup cron, `docs/WEBHOOKS-CONTRACT.md`  
**Контекст:** B2 спринт 5 (финал эпика). 088/089 транспорт; 090 webhook-action на ветке (docs: applied `20260731055734`). `npm test` → **565** passed — цифра спринта верна.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА: retry = новая строка + `payload.id` rewrite | ✅ |
| Не retry `pending`/`delivered`; inactive → `22023` | ✅ |
| claim не фильтрует `is_active` (edge drops) | ✅ `088` claim + `index.ts:369-371` |
| Подпись G3 без пробела (код, не арх) | ✅ `transport.ts:309-328`, тест :222 |
| Нет infinite/range в проекте; limit-паттерн | ✅ `useInfiniteQuery`/`.range` = 0 |
| `formatRelative` существует, 0 импортов в UI | ✅ `dates.ts:21` |
| Modal / EmptyState / clipboard / ScrollText | ✅ (EmptyState — API, см. W2) |
| 091 аддитивна; файл/имя заданы | ✅ `091_webhook_journal.sql` свободен |
| Самопроверка + gate smokes | ✅ |
| HOW `limit` vs edge-case `limit+1` | 🟡 |
| Ветка от `main` после merge action | 🟡 ops (090 ещё не в `main`) |
| `DELIVERY_TONE` / EmptyState props | 🟡 |

**Оценка: 92/100 (GO).** Семантика «Повторить» разобрана до уровня контракта идемпотентности — это главная ценность спринта; SQL/UI/G3 executable. Warnings не блокируют CC.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC **после** merge `feat/r2-webhook-action` → `main` (или ветвить journal от action, если merge задерживается — но спринт явно просит `main` post-merge). Миграцию 091 не apply из CC.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| 088/089 transport + edge | в репо; claim/dispatch live-паттерн |
| 090 webhook-action | файл + schema note applied; **ветка `feat/r2-webhook-action`**, не ancestor of `main` |
| 091 journal | **нет** — слот свободен |
| `retry_webhook_delivery` / cleanup / journal UI | отсутствуют (ожидаемо) |
| `docs/WEBHOOKS-CONTRACT.md` | нет |
| `src/lib/constants/webhooks.ts` | нет |
| Review | не было (этот документ) |
| Тесты | **565** passed |

---

## С чем согласен полностью

### 1. Retry ≠ revive строки

`X-Torii-Delivery` = `delivery_id` (`index.ts:291`) и `payload.id` — один ключ дедупа. UPDATE status на старый id = корректный приёмник отбросит повтор; журнал потеряет failed-след. **Новая строка** + `jsonb_set(payload, '{id}', to_jsonb(v_new_id))` + **не трогать `occurred_at`** — единственно верная семантика (Stripe/HubSpot-класс).

### 2. Не повторять `pending` / `delivered`

`pending` может быть в 5-min lease (`claim_webhook_deliveries` 088:531-547) → второй insert = двойная отправка. `delivered` бессмысленен. `failed`/`dropped` only.

### 3. Inactive endpoint

Edge: `if (!d.endpoint_active) → dropped` (`index.ts:369-371`); claim **не** фильтрует `is_active` (возвращает `endpoint_active`). RPC `webhook_endpoint_inactive` (`22023`, как `send_test_webhook`) + disabled button — правильно, иначе вечный dropped-спам.

### 4. Пагинация без новой инфраструктуры

Нет `useInfiniteQuery` / `.range` в `src/`. DataTable пагинирует in-memory (slice 107-109). Растущий `.limit()` как activity-log — осознанный размен; комментарий в хуке + порог ~500 — обязательно.

### 5. G3 из кода, не из арх-дока

Пробел в подписи (`t=…, v1=` vs `t=…,v1=`) зафиксирован в `transport.ts` и тесте. Числа: `MAX_ATTEMPTS=7`, `REQUEST_TIMEOUT_MS=5000`, `RESPONSE_BODY_LIMIT_BYTES=8KiB`, `RETRY_DELAYS_MS`, threshold 20 — всё сверяемо с transport.

### 6. Cleanup: не трогать `pending`

Терминальные >30d only. Висящий pending = симптом, не мусор. Returns `integer` для `cron.job_run_details` — полезно. Cron `15 6` + unschedule-pattern 089 — стыкуется с комментарием «webhook-cleanup — спринт 3» в 089/schema.

### 7. UI scope

Журнал **на endpoint** (индекс `idx_webhook_deliveries_endpoint`, 088:147). `ScrollText` в lucide есть. `canManage` + RLS deliveries SELECT owner/admin — без второго role-gate в модалке. Header-comment WebhooksSection (48-54) про «нет журнала / спринт 3» — переписать. `DELIVERY_LABEL` local → constants. Clipboard = SecretModal 23-30. `window.confirm` / `dangerouslySetInnerHTML` — out.

### 8. Тесты: canRetryDelivery pure + Record completeness

Вынос хелперов — правильно. 565 baseline зафиксирован.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `limit` в HOW vs `limit+1` в edge-case 11

HOW-хук: `.limit(limit)`, «Показать ещё» при `data.length === limit`.  
Edge 11: **сделать через `limit+1`**, показывать `limit`, hasMore = `rows.length > pageSize`.

Это разные UX на ровно 50 строках. **Побеждает edge-case 11.** В CC:  
`const pageSize = 50; fetch limit pageSize+1; items = data.slice(0, pageSize); hasMore = data.length > pageSize`.  
Ключ кеша — по `pageSize` (или displayed limit), не путать с fetch size.

### W2. `EmptyState` API

Компонент требует `icon`, `title`, `description` (`EmptyState.tsx:1-9`). Спринт даёт один текст — разложить: icon (`ScrollText`/`Webhook`), title «Доставок пока не было», description про Тест / правило webhook.

### W3. `DELIVERY_TONE` — только CSS-переменные / semantic classes

Сниппет `…`. По аналогии с секцией: `text-text-mute` / `text-text-dim` / `text-red` / `bg-accent-l text-accent` — **без hex**. `dropped ≠ failed` по смыслу тона — ок (mute vs red).

### W4. Порядок веток / 090 на `main`

Спринт: `feat/r2-webhook-journal` **от `main` после merge action**. Сейчас 090 и docs-схема — на `feat/r2-webhook-action` (`624996b`), `main` = transport merge.  
CC не стартовать «с чистого main» без 090: G3 §payload и empty-state copy ссылаются на action. Merge action first **или** base journal на action-ветку с последующим rebase.

### W5. Типы RPC до regen

`retry_webhook_delivery` появится в `supabase.gen.ts` только после apply+`db:gen-types` (gate). До этого `tsc` на `.rpc('retry_webhook_delivery')` может ругаться. Варианты: ветка после gate types, или узкий cast в хуке до регена — **не** править gen руками. В отчёте CC зафиксировать.

### W6. `docs/schema.md` + skill

Помимо ссылки на WEBHOOKS-CONTRACT: RPC `retry_webhook_delivery`, `cleanup_webhook_deliveries`, job `webhook-cleanup`. Конвенция «schema в том же PR».

### W7. G3 §11 «из реальной доставки»

CC может не иметь live payload. Допустимо: пример, **структурно** совпадающий с `build_deal_webhook_payload` (090:143-171) + реалистичные UUID/поля; в отчёте пометить «synthetic from 090 shape», если live нет. Не копировать арх-док с пробелом в signature.

### W8. Мелочи

- `useWebhookDeliveries`: `select` литерал `DELIVERY_COLUMNS` (не `*`) — payload/error нужны для `<details>`; размер OK при limit 50.  
- `refetchInterval` при any `pending` — да; после retry invalidation prefix `['webhook-deliveries']` + endpoints key.  
- `consecutive_failures` уже в строке endpoint (172-176); в модалке «под кнопкой» — продублировать из `endpoint` prop (не отдельный fetch).  
- Ретеншн только `created_at` (не `delivered_at`) — ок для terminal rows.  
- `jsonb_typeof = 'object'` guard — правильный.  
- Самопроверка grep «мин назад» — `formatRelative` = date-fns locale, не хардкод; новых реализаций не плодить.

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| `088` claim + `delete`/`send_test` ACL | паттерн RPC owner/admin | copy для retry |
| `088` `idx_webhook_deliveries_endpoint` | под журнал per-endpoint | использовать |
| `089` cron unschedule/schedule | idempotent job | `webhook-cleanup` |
| `090` `build_deal_webhook_payload` | whitelist data | G3 §9 |
| `index.ts:288-296` headers | G3 §2 | дословно |
| `transport.ts` MAX/RETRY/TIMEOUT/sign | G3 §3–6 | source of truth |
| `WebhooksSection.tsx:18-23, 45-55, 141-169` | label, comment, 3 buttons | +journal, import, rewrite comment |
| `use-webhook-endpoints.ts:41-47, 91-110` | literal select, refetchInterval | +deliveries list + retry mut |
| `dates.ts:21` `formatRelative` | unused | first consumer |
| `WebhookSecretModal.tsx:23-30` | clipboard | copy pattern |
| `Modal.tsx` `maxWidth` | default max-w-lg | `max-w-3xl` |
| `supabase/functions/**` | | **diff пуст** |
| `0[0-8]*`, `090_*` migrations | | **diff пуст** |

Пропусков scope нет. Редактирование endpoint / org-wide journal / infinite query — out, верно.

---

## Предлагаемые правки в спринт (необяз. до CC)

1. В HOW-хуке явно: fetch `limit+1`, display `limit` (согласовать с §edge 11).  
2. EmptyState: icon + title + description.  
3. Пример `DELIVERY_TONE` на semantic classes.  
4. VERIFY: schema.md + skill; note types after gate.  
5. Prerequisite: merge action → main (или base = action SHA).

---

## Чеклист crm-architect

- [x] РАЗВЕДКА / facts above plan  
- [x] Real tables/columns/RPC patterns from 088  
- [x] Real file paths  
- [x] learnings: no window.confirm; tenant in DEFINER WHERE; no hardcoded colors  
- [x] Migration file only; not apply from CC  
- [x] org_id in WHERE for DEFINER retry  
- [x] DEFINER + search_path + ACL (authenticated for retry, service_role for cleanup)  
- [x] No soft-delete; hard DELETE retention  
- [x] CSS variables for tones  
- [ ] schema.md explicit in VERIFY (W6)

---

## Чеклист перед CC

- [ ] 090 в базе ветки (merge action или base on action)  
- [ ] `feat/r2-webhook-journal`  
- [ ] 091: только `retry_*`, `cleanup_*`, cron — без replace 088/089/090  
- [ ] payload.id rewrite; occurred_at intact  
- [ ] cleanup `status in (delivered,failed,dropped)` only  
- [ ] Journal modal + limit+1 + canRetryDelivery  
- [ ] G3 signature **no space**; numbers from transport.ts  
- [ ] unit `webhook-journal.test.ts`; suite ≥ 565 + new  
- [ ] lint: no new errors vs baseline  
- [ ] `git diff` functions/** and old migrations empty  
- [ ] schema.md + contract link  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Разведка / семантика retry | 25 | 25 |
| SQL 091 design | 20 | 19 |
| Frontend journal / hooks | 20 | 18 |
| G3 contract accuracy | 15 | 14 |
| Tests / self-check / process | 20 | 16 |
| **Итого** | **100** | **92** |

**Итог: 92/100 GO** — можно в Claude Code (с учётом W4: база с 090).
