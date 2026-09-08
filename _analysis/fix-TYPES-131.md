# chore/types-131 — реген типов после 131, снятие временного типа

**Где:** ОСНОВНОЙ чекаут `~/Downloads/dashboard-crm`, ветка `chore/types-131` (уже создана).
Worktree не нужен: правка механическая, а `.env.local` для `npm run build` здесь уже лежит.
**Прецедент:** PR #9 `chore/types-127` — тот же жанр (реген после миграции, снятие стаба).
**Миграций нет.** 131 применена гейтом 2026-09-08, версия `20260908061745`.

## Зачем

`quotes.rejection_reason` существует в БД, но `src/types/supabase.gen.ts` про неё не знает.
Пока это так, в коде живёт временный `QuoteRejectionPatch` — узкий интерфейс вместо `any`,
и `QUOTE_COLS` намеренно не тянет колонку, чтобы SELECT не падал 400-м до apply. Apply
состоялся — обе подпорки снимаются, иначе они переживут причину и станут «так исторически».

## ЗАДАЧА 1 — реген типов

```bash
npm run db:gen-types
```

Скрипт пишет во временный файл и подменяет боевой только после проверок (≥500 строк,
маркеры `graphql_public`, `public: {`, `Database`). Если он отказал — **остановиться и
сказать**, руками `supabase.gen.ts` не править: это генерируемый файл, красная линия проекта.

Проверить, что колонка доехала:

```bash
grep -n "rejection_reason" src/types/supabase.gen.ts | head
```

Пусто — реген не удался, дальше не идти.

## ЗАДАЧА 2 — снять `QuoteRejectionPatch`

`src/lib/validators/quote.ts` — удалить интерфейс целиком вместе с его doc-комментарием
(блок начинается со строки `/**` перед `S-DEAL-ORG-1 (W4): патч отклонения КП` и кончается
закрывающей `}` интерфейса). Ничего вместо него не заводить: после регена
`rejection_reason` приходит из `QuoteUpdate` сам.

`src/components/projects/ActiveQuoteCard.tsx`:

1. Из импорта `@/lib/validators/quote` убрать строку `  type QuoteRejectionPatch,`.
2. В `submitReject` убрать промежуточную переменную и TODO над ней. Было:

        // TODO(S-DEAL-ORG-1): узкий тип уйдёт после регена типов на 131 — тогда
        // `rejection_reason` придёт из `QuoteUpdate` сам.
        const patch: QuoteRejectionPatch = {
          id: active.id,
          status: 'rejected',
          rejection_reason: trimmed,
        };
        updateQuote.mutate(patch, {

   Стало:

        updateQuote.mutate({ id: active.id, status: 'rejected', rejection_reason: trimmed }, {

   Литерал прямо в `mutate` — теперь это законный `QuoteUpdate`, и excess property check
   на него работает как надо: опечатка в имени колонки станет ошибкой компиляции, чего
   промежуточная переменная со своим типом не давала.

## ЗАДАЧА 3 — вернуть колонку в `QUOTE_COLS`

`src/lib/hooks/use-quotes.ts`, константа `QUOTE_COLS`: добавить `rejection_reason` после
`accepted_at`, до `created_by`. Комментарий-предупреждение про «до apply уронит 400-м»
(в `validators/quote.ts` он ушёл вместе с интерфейсом) не воскрешать — причина исчезла.

Без этой задачи причина отклонения пишется, но не читается: карточка её не покажет
никогда, и следующий спринт будет искать баг в UI.

## ТЕСТЫ

Тестов нет: реген типов и снятие временных подпорок, новой логики не появилось.
Существующие 1954 обязаны остаться зелёными — если какой-то упал, это регресс регена,
разбираться до коммита.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run 2>&1 | tail -5 && npm run build 2>&1 | tail -6
grep -rn "QuoteRejectionPatch" src/ | wc -l
grep -n "rejection_reason" src/lib/hooks/use-quotes.ts
```

Ожидается: tsc чисто, lint 0 ошибок (32 warning — baseline), 1954 теста зелёные,
build проходит, `QuoteRejectionPatch` встречается **0** раз, `rejection_reason` в
`QUOTE_COLS` есть.

## КОММИТ

```
chore(types): реген после 131, снят QuoteRejectionPatch

- supabase.gen.ts перегенерирован: quotes.rejection_reason в типах
- временный QuoteRejectionPatch удалён, патч отклонения — литерал QuoteUpdate
- rejection_reason возвращён в QUOTE_COLS: причина отказа теперь читается
```

**Не мержить.** Отчёт — Олегу, PR он создаёт сам.
