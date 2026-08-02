# fix-S-R2-WEBHOOK-TRANSPORT-GATE — правки по итогам гейта

Ветка та же: `feat/r2-webhook-transport` (коммит `830c192`). Отдельная ветка не нужна,
изменения — доработка того же спринта. **Второй коммит в ту же ветку**, мерж после него.

Гейт прошёл: 088 применена в прод (`20260729143305`), все смоки зелёные —
Vault, RLS, ролевые отказы, захват очереди с лизингом, авто-отключение с уведомлением
`webhook_disabled`, ротация и удаление секрета. 089 **не применена**: ждёт деплоя edge.

Здесь две правки. Обе — следствие одной находки на гейте.

---

## 1. `pg_net` должен ставиться в схему `extensions`

**Что не так.** В `supabase/migrations/088_webhook_transport.sql` стоит:

```sql
create extension if not exists pg_net;
```

и комментарий над ним утверждает:

> pg_net объявлен relocatable = false со schema = 'net', поэтому схему создаёт сам:
> `with schema` писать НЕ нужно (и нельзя — упадёт).

**Факт из прода после apply.** Первая половина верна: `extrelocatable = false`, и объекты
расширения действительно легли в схему `net` — `net.http_post` существует, значит 089
функционально корректна и её править не нужно.

Вторая половина неверна. Расширение **зарегистрировалось в `public`**
(`pg_extension.extnamespace = public`), и advisor поднял `extension_in_public`:

> Extension `pg_net` is installed in the public schema. Move it to another schema.

`create extension pg_net with schema extensions` **не падает** — это проверено на проде:
я перерегистрировал расширение отдельной миграцией `088a`
(`20260729143728`, `webhook_transport_pgnet_schema_fix`), после чего
`extnamespace = extensions`, `net.http_post` на месте, WARN снят.

Перерегистрация была возможна ровно в тот момент: зависимостей ноль, потому что 089 ещё
не применена. После 089 `drop extension` потянул бы `dispatch_webhooks_tick` за собой.

**Что сделать в 088:**

```sql
create extension if not exists pg_net with schema extensions;
```

И переписать комментарий. Он должен говорить ровно то, что подтвердилось:

- объекты pg_net всегда живут в схеме `net` (`extrelocatable = false`), поэтому вызовы
  пишутся как `net.http_post` независимо от `with schema`;
- `with schema extensions` управляет **регистрацией** расширения, и без него запись
  уходит в `public`, что ловит advisor `extension_in_public`;
- перерегистрация после появления зависимостей (089) требует их пересоздания — ставить
  правильно с первого раза.

**Чего НЕ делать:** не переписывать `net.http_post` на `extensions.http_post` в 089 —
такой функции нет, вызов сломается. Проверено: `extensions.http_post` → 0 совпадений,
`net.http_post` → 1.

**На прод это не применяется повторно.** В БД уже нужное состояние: 088 + 088a.
Правка в файле нужна для чистого применения с нуля (новое окружение, локальная БД,
восстановление) — иначе там снова появится тот же WARN.

**Добавить в шапку 088 строку про фактическое состояние прода**, чтобы следующая сессия
не искала расхождение между файлом и БД:

> Применена в прод 2026-07-29 как `20260729143305`; следом
> `20260729143728 webhook_transport_pgnet_schema_fix` перерегистрировала pg_net из
> public в extensions (в файле это уже учтено через `with schema extensions`).

## 2. Реген типов — две новые таблицы

`webhook_endpoints` и `webhook_deliveries` в проде есть, а в `src/types/supabase.gen.ts`
их нет: спринт сдавался до apply, и типы стояли под стабом.

```bash
npm run db:gen-types
```

**Только CLI.** MCP для регена не использовать: он не отдаёт `graphql_public` и даёт 28
ложных удалений (грабля зафиксирована в handoff).

После регена:

- если в `src/types/database.ts` или в хуках были локальные заглушки под эти таблицы —
  снять их и перейти на сгенерированные типы;
- `npx tsc --noEmit` должен остаться чистым;
- `src/types/database.ts` руками не править, кроме снятия заглушек.

---

## VERIFY

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build      # последним, при остановленном next dev
```

Ожидание: 554/554 как в первом прогоне (правки не касаются логики), `git diff` по
`supabase/migrations/089_*.sql` и по `supabase/functions/**` — **пуст**.

Коммит в ту же ветку: `fix(webhooks): pg_net в схему extensions + реген типов (088)`

```
Type Safety:            [заполнить — после регена]
RLS Coverage:           NOT_APPLICABLE (политики не менялись)
Backward Compatibility: PASS (в проде состояние уже нужное: 088 + 088a)
Runtime Tested:         PASS для БД-части — смоки прогнаны на гейте; доставка на реальный
                        приёмник — после деплоя edge
Regional Availability:  NOT_APPLICABLE
```

## Что НЕ делает Claude Code

- Не применяет миграции (088 и 088a уже в проде, 089 применит Cowork после деплоя edge).
- Не заводит секреты в Vault и Function Secrets — это шаги Олега.
- Не деплоит edge-функции.
- Не мержит и не пушит.
- Не трогает 089 и `supabase/functions/webhook-dispatch/**` — они прошли гейт как есть.
- Отчёт — отчётом о сделанном.
