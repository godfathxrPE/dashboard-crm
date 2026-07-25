# S-GANTT-DEPTYPES — типы связей SS / FF / SF

**Ветка:** `feat/gantt-dep-types` от `main`. Тип D2 по форме, D3 по последствиям.
UI-only, миграций нет. Один коммит — спринт обязан реверситься целиком.

Выделено из `S-GANTT-POLISH`: по трудоёмкости эта задача равна трём остальным вместе
и трогает всю математику расписания. Делать **после** того, как POLISH влит, — иначе
конфликты в `GanttTimeline.tsx` гарантированы.

**Трудоёмкость: ~10–14 ч. Риск высокий.**

---

## РАЗВЕДКА — выполнить целиком до первой правки

```bash
git branch --show-current                      # ожидание: feat/gantt-dep-types от свежего main
git status --short                             # чисто

grep -n "dep_type" supabase/migrations/048_task_dependencies.sql
grep -rn "DepType" src/types/database.ts src/components/tasks/GanttTimeline.tsx | head
grep -n "export function computeCascade\|export function computeCpm" src/lib/utils/gantt-schedule.ts
grep -n "useUpdateTaskDependency" src/lib/hooks/use-task-dependencies.ts
grep -n "input: {" src/lib/hooks/use-task-dependencies.ts
ls tests/unit/gantt-schedule.test.ts
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. `dep_type` в 048 объявлен не как `text ... check (...)` → предпосылка «миграция не
   нужна» неверна, сказать и остановиться.
2. Нет `computeCpm` / `computeCascade` → волна не влита.
3. Нет `tests/unit/gantt-schedule.test.ts` → тесты некуда класть, `include` не менять.
4. `tsc` красный до правок.

---

## Миграция НЕ нужна — и `pg_enum` тут ни при чём

`dep_type` объявлен в `048_task_dependencies.sql` L8 как

```sql
dep_type text not null default 'FS' check (dep_type in ('FS','SS','FF','SF'))
```

Это `text` + CHECK, **не** pg_enum. Запрос в `pg_enum` вернёт пустой результат — и это
не значит, что типов нет. Все четыре значения БД принимает уже сейчас, миграция не
требуется, спринт остаётся UI-only. Перепроверять — через `pg_constraint`, не `pg_enum`.

---

## Объём работ честно

Это не «расширение семантики earliest в одном месте». `computeCpm` построен на FS:
forward pass берёт `EF(pred)` и двигает `ES(succ)`, backward — зеркально. SS/FF/SF
связывают **разные** концы:

```
FS: succ.start ≥ pred.end   + lag      (есть)
SS: succ.start ≥ pred.start + lag
FF: succ.end   ≥ pred.end   + lag
SF: succ.end   ≥ pred.start + lag
```

Ограничения на `end` (FF, SF) в forward pass не выражаются через один только ES: для
узла с FF-предшественником earliest finish задан напрямую, а start восстанавливается
вычитанием длительности. Это переписывание **обоих** проходов `computeCpm` и правка
`computeCascade`, а не добавление веток в одну функцию.

**Закон FS из CLAUDE.md распространяется на все четыре типа.** Три места расчёта
(soft-warn ~L605–618, каскад, CPM) обязаны остаться согласованными — разъезд даёт
взаимно противоречивые стрелки и тосты. Базовая форма сохраняется:

```ts
earliest = shiftDateKeyByBuckets(<нужный конец pred>, 'day', lag_days)
violation = <нужный конец succ> < earliest
```

При `lag_days = 0` преемник может начинаться в тот же день, что финиш предшественника —
это уже зафиксировано для FS и не меняется.

---

## Работы

- **Popover ребра:** селект типа рядом с существующим редактором `lag_days`.
- **Хук расширить.** Сейчас `useUpdateTaskDependency` (use-task-dependencies.ts L120)
  принимает `input: { id: string; lag_days: number }`, шлёт `.update({ lag_days })` и
  патчит оптимистиком одно поле. Нужно: `input: { id: string; lag_days?: number; dep_type?: DepType }`,
  сборка объекта апдейта только из переданных ключей, оптимистик по обоим полям.
  `DepType` уже экспортируется из `@/types/database` и используется в `DependencyEdge`.
- **Мутация — строго `dep_type` и `lag_days`, третьего поля не добавлять.** Концы ребра
  через UPDATE менять нельзя: DAG-валидатор 048 стоит только на BEFORE INSERT (см. 062,
  зафиксировано в комментарии над хуком).
- **Отрисовка:** SS/FF меняют точки входа и выхода стрелки (левый край вместо правого).
  Эффект измерения рёбер (~L811+) правится аккуратно — сигнатура его зависимостей уже
  была источником бесконечного цикла дважды. Менять её отдельным шагом и проверять
  ре-рендер-бёрст на драге.
- **Vitest:** на каждый тип, отдельно на forward и backward pass, в
  `tests/unit/gantt-schedule.test.ts`. Плюс кейс смешанного графа (FS + FF на одном узле)
  и кейс `lag_days = 0` для каждого типа.

---

## VERIFY / коммит

```bash
npx tsc --noEmit                                     # 0
npx eslint src/lib/utils src/lib/hooks src/components/tasks   # 0 (scoped, НЕ npm run lint)
npx vitest run tests/unit/gantt-schedule             # новые кейсы SS/FF/SF зелёные
npm test                                             # полный прогон
grep -rn ": any" src/components/tasks src/lib/utils  # пусто
git --no-pager diff --stat
```

Тесты — **только** в `tests/unit/*.test.ts(x)`; `include` в `vitest.config.ts` не менять
(файл под `src/` не запустится и даст ложную зелень).

Смоук обязателен матрицей: темы aura + fuji × зумы day / week / month × каждый тип связи,
плюс граф, где у одного узла есть предшественники разных типов. Отдельно проверить, что
после переключения типа не начинается бесконечный ре-рендер (эффект измерения).

Коммит один:

```
feat(gantt): типы связей SS/FF/SF в расписании и на стрелках
```

**Не пушить.** Отчёт — в чат, с явным ответом: какие кейсы vitest добавлены и что
показала смоук-матрица по каждому типу.
