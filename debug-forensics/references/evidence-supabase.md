# Сбор evidence на границах слоёв

Прежде чем предлагать гипотезу, нужен один прогон, показывающий, **где** рвётся.
Гипотеза до evidence — это угадывание с красивым обоснованием.

## Границы, которые нужно проверять по очереди

```
1. Браузер / RHF+Zod      — что реально ушло в мутацию
2. TanStack Query          — что в кэше, был ли invalidate, не отдаётся ли stale
3. supabase-js / PostgREST — код ошибки, тело ответа, заголовки
4. RLS                     — политика пропустила или отсекла
5. Триггеры                — что переписано после INSERT/UPDATE
6. Функция (DEFINER)       — что внутри, с каким search_path и грантами
7. Данные                  — что фактически лежит в строке
```

## Слой 1–2: клиент

```ts
// перед мутацией, не после
console.error('DEBUG payload', JSON.stringify(values, null, 2))
```
Частая находка: Zod-схема пропустила поле, которого нет в форме, и в БД уходит
`undefined` вместо значения. Вторая частая: `invalidateQueries` не вызван, UI
показывает старое, а БД уже новая — «баг записи», которого нет.

## Слой 3: транспорт

Логировать не `error.message`, а объект целиком: `code`, `details`, `hint`.
`details`/`hint` PostgREST переносит из `DETAIL` исключения — именно там лежит
полезная нагрузка гейтов (`enforce_delivery_completion` кладёт в `DETAIL` весь
объект, `parseDeliveryGateError` умеет оба формата).

## Слой 4: RLS

```sql
select current_org_id(), current_org_role(), auth.uid();
select policyname, cmd, qual, with_check
  from pg_policies where tablename = 'projects';
```
Отказ RLS на SELECT выглядит как пустой результат, на INSERT/UPDATE — как `42501`.
Проверять под реальной ролью через отдельного клиента с нужным JWT, а не из-под
service_role: под service_role политики не применяются, и проверка бессмысленна.

## Слой 5: триггеры

```sql
select tgname, tgenabled, pg_get_triggerdef(oid)
  from pg_trigger where tgrelid = 'projects'::regclass and not tgisinternal
 order by tgname;
```
Порядок исполнения — **алфавитный по имени**. Отсюда префиксы `aa_`/`zy_` в
проекте. Если поле «не сохраняется» — почти всегда его переписал триггер,
идущий позже по алфавиту.

## Слой 6: функции

```sql
select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'   -- prokind обязателен
   and p.proname = 'check_stage_requirements';
```
Без `prokind = 'f'` запрос упадёт на агрегате с `42809`, и текст ошибки не будет
связан с тем, что вы искали.

## Слой 7: гранты

```sql
select c.relname, split_part(split_part(a::text,'=',2),'/',1) as privs,
       split_part(a::text,'=',1) as grantee
  from pg_class c
  left join lateral unnest(coalesce(c.relacl,'{}'::aclitem[])) a on true
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r';
```
Только поэлементно. `array_to_string(relacl,',') like '%authenticated=%m%'`
жадно матчит через запятую и находит букву в правах соседней роли.

## Правило

Один прогон собирает evidence по всем слоям сразу. Он показывает границу, на
которой данные ещё корректны, и следующую, где уже нет. Дальше расследуется
**только** этот участок.
