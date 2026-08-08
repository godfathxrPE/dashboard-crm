# Claude Code Prompt — FIX S-TL-1-RPC-THIS: лента пуста, потому что `supabase.rpc` оторван от объекта

Гейт S-TL-1 не принят. Миграция 112 применена и работает — дефект **только в клиенте**,
одна строка. Ветка: продолжить в `feat/entity-timeline`.

---

## Диагноз — подтверждён фактом

`src/lib/hooks/use-entity-timeline.ts`:

```ts
const rpc = supabase.rpc as unknown as UntypedRpc;   // ← метод ОТОРВАН от объекта
const { data, error } = await rpc('entity_timeline', { … });
```

`rpc` в supabase-js — обычный метод класса, внутри он читает `this.rest`. Присваивание
в переменную теряет `this`, и вызов бросает **синхронный TypeError ещё до сети**.

Воспроизведено на реальном пакете проекта (`node`, `@supabase/supabase-js` из
`node_modules`):

```
ОТОРВАННЫЙ вызов БРОСИЛ: TypeError: Cannot read properties of undefined (reading 'rest')
вызов методом:            ок -> object
```

**Почему это выглядело как «данных нет», а не как ошибка:** TypeError летит внутри
`queryFn`, React Query его ловит и по умолчанию **не пишет в консоль**. `timeline.data`
остаётся `undefined` → `events = []` → `<EntityTimeline>` рисует «Пока нет активности».
Ни одной ошибки ни в консоли, ни в логах Postgres, ни в API-логах Supabase.

**Что при этом исправно и перепроверено на гейте** (чинить не нужно):

- функция `entity_timeline` в проде: `HTTP 200`, **100 строк, 37 КБ** — прямым `fetch`
  из браузера владельца с его же сессией;
- `isTimelineRpcRow` — код гварда прогнан на этих 100 строках: вердикт `OK: 100`,
  ни одна строка не отбраковывается;
- RLS/INVOKER: owner видит 17 activity + 40 task, manager-не-участник — 17 + **0 task**;
- порядок событий: построчное совпадение с эталоном 100/100.

---

## ЗАДАЧА 1: вернуть `this` (одна строка)

`src/lib/hooks/use-entity-timeline.ts`, функция `fetchTimeline`.

**Было:**
```ts
const supabase = createClient();
const rpc = supabase.rpc as unknown as UntypedRpc;
const { data, error } = await rpc('entity_timeline', {
```

**Стало** — кастуем **объект**, а не метод, и зовём как метод:
```ts
// ⚠️ Кастуется КЛИЕНТ, а не метод. `const rpc = supabase.rpc` отрывает метод от
// объекта: внутри supabase-js он читает `this.rest`, и оторванный вызов бросает
// TypeError ещё до сети. React Query такой бросок ловит молча — лента выглядит
// пустой, а не сломанной. Это и был дефект S-TL-1.
const supabase = createClient() as unknown as { rpc: UntypedRpc };
const { data, error } = await supabase.rpc('entity_timeline', {
```

Тип `UntypedRpc` остаётся как есть. Если после `npm run db:gen-types` функция уже
видна в `Database['public']['Functions']` — каст можно снять целиком и звать
`supabase.rpc('entity_timeline', …)` напрямую; проверь `npx tsc --noEmit`.

## ЗАДАЧА 2: ошибка ленты обязана быть видимой

Дефект дошёл до глаз владельца ровно потому, что **`<EntityTimeline>` не отличает
«ошибка загрузки» от «событий нет»**. Это не косметика: любой следующий сбой ленты
снова будет немым.

1. `use-entity-timeline.ts` — вернуть ошибку наружу:
   ```ts
   return { events, isLoading: timeline.isLoading, error: timeline.error as Error | null };
   ```
2. `src/components/shared/EntityTimeline.tsx` — до проверки `events.length === 0`:
   ```tsx
   if (error) {
     return (
       <p className="py-6 text-center text-xs text-danger">
         Не удалось загрузить активность. Обновите страницу.
       </p>
     );
   }
   ```
   Цвет — токеном (`text-danger` или тот, что принят в проекте), не хардкодом.
   Публичный контракт компонента не меняется: новое поле опционально.

## ЗАДАЧА 3: тест, который поймал бы это

`tests/unit/timeline-rpc-adapter.test.ts` покрывал чистый адаптер — и был зелёным,
пока лента лежала. Добавить в `tests/unit/` проверку на сам вызов: мок
`createClient()` возвращает объект, чей `rpc` читает `this.rest` (как настоящий
supabase-js), и тест падает, если хук зовёт метод оторванным.

Минимальный каркас:
```ts
const marker = { rest: 'ok' };
const fakeClient = {
  rest: marker,
  rpc(fn: string, args: Record<string, unknown>) {
    if (!this || (this as { rest?: unknown }).rest !== marker) {
      throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    }
    return Promise.resolve({ data: [/* одна валидная строка */], error: null });
  },
};
```
Утверждение: хук возвращает одно событие, а не пустой массив.

## ЗАДАЧА 4: память проекта

`crm-architect/references/learnings.md` — новый раздел рядом с записью про
`getTime()` и миллисекунды:

> ### ❌ `const f = client.method` отрывает `this` — и React Query делает сбой немым
> Обход отсутствующего типа через `const rpc = supabase.rpc as unknown as F` ломает
> рантайм: методы supabase-js читают `this.rest`, оторванный вызов бросает TypeError
> **до сети**. React Query ловит бросок из `queryFn` и по умолчанию молчит — экран
> показывает пустое состояние, консоль чиста, логи БД чисты, запроса в сети нет.
> Диагностика уходит в серверную часть, где всё исправно.
> **Правило: кастуй объект (`createClient() as unknown as { rpc: F }`), никогда не
> метод.** И: пустое состояние компонента обязано отличаться от состояния ошибки —
> иначе класс дефектов «queryFn бросил» не имеет симптома вовсе.

Пакет скилла пересобрать и загрузить в аккаунт (`scripts/skill-deploy.sh`) — иначе
следующий гейт прочтёт прежнюю версию.

---

## Проверка перед сдачей

```bash
npx tsc --noEmit
npm test            # 1072 + новый тест
npm run lint        # 49 находок (15 err / 34 warn) — baseline
```

Затем `npm run dev` и **глазами**:

| Где | Ожидание |
|---|---|
| `/projects/562c6104-e734-4a74-93d1-8a1c37f9476c` | ~100 событий: задачи вперемешку с системными записями |
| `/companies/9ce19e28-a5ec-4ce4-9a36-a2ba4dcf2614` | «Встреча: Фитнес Десерты», дата **6 августа** (не 5-е) |
| `/companies/c72a8886-ca48-4bd2-ab5a-c3245645f360` | «AI: Бриф компании», не `company_brief` |

## Мусор, оставшийся от диагностики гейта

В корне репозитория лежит `thistest.mjs` — им воспроизводился TypeError. Мост Cowork
удалять файлы не умеет. **Удалить руками:** `rm thistest.mjs`.

## КОММИТ

```bash
git add .
git commit -m "fix(timeline): вернуть this в вызов supabase.rpc — лента была пуста молча

const rpc = supabase.rpc отрывает метод от клиента: внутри supabase-js он читает
this.rest, и вызов бросал TypeError до сети. React Query ловил бросок молча, лента
рисовала «Пока нет активности». Кастуется клиент, а не метод.
Плюс: EntityTimeline отличает ошибку от пустоты, тест на оторванный this, learnings."
```
