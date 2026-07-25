# S-WBS-BACKFILL — parent_task_id из wbs_code + фикс импортёра плана

**Дата:** 2026-07-25
**Ветка:** `fix/wbs-backfill` (после мержа `feat/schedule-1b-cascade` в `main`)
**Тип:** миграция данных (074) + фикс UI-импортёра + unit-тесты
**Зависимости:** нет по коду. Стартовать после мержа 1B, чтобы не плодить конфликтов в `_analysis/`.

---

## WHY

Миграция `052_task_wbs.sql` добавила `parent_task_id` и `wbs_code`, но **без backfill**, а импортёр плана (`PlanImport.tsx`) пишет только `wbs_code` и никогда не проставляет родителя.

Факт на проде (Стратек, 2026-07-25):

```
всего задач                       618
wbs_code заполнен                 103   (все — один проект)
parent_task_id заполнен             0   ← ни одной
```

Следствие: в проде **каждая задача — корень**. Мёртвыми на реальных данных лежат:

- `isSummary` / сводные бары Ганта;
- `datesFromChildren` / `effectiveSpan` по поддереву;
- `depth` и отступы в дереве задач;
- правило каскада 1B «сводная тянет поддерево» (`computeCascade`) — покрыто только vitest, в проде недостижимо.

То есть половина Ганта проверяется исключительно юнит-тестами. Это и надо закрыть.

---

## Разведка (выполнить целиком до первой правки)

```bash
ls supabase/migrations | tail -3                    # следующий номер, ожидается >= 074
grep -n "parent_task_id" supabase/migrations/052_task_wbs.sql
grep -n "wbs" src/components/tasks/PlanImport.tsx
grep -n "wbs\|normalizeWbs\|parentWbs" src/lib/utils/plan-import-helpers.ts
ls tests/unit | grep -i plan
cat vitest.config.ts | head -20                     # include — ТОЛЬКО tests/unit/**
```

**Факты, сверенные с живой БД (не перепроверять, но и не противоречить):**

1. WBS-коды в плане **неконсистентны по хвостовой точке**: уровни 1–3 идут как `1.`, `1.1.`, `1.1.4.`, уровни 4–5 — как `1.1.4.1`, `1.1.4.1.3`. Без нормализации хвостовой точки родитель не находится у **39 из 103** задач.
2. После `rtrim(wbs_code, '.')` дерево сходится полностью: **1 корень** (`1.`), **102 ребёнка**, **0** ненайденных родителей, **0** дублей кода внутри проекта.
3. Триггер `trg_zz_check_task_parent` (052) стоит `before insert or update of parent_task_id, project_id` — валидирует один проект, одну org и отсутствие цикла. Backfill его проходит: длина префикса строго убывает, цикл невозможен.
4. Дублей `wbs_code` внутри проекта нет, но миграция всё равно обязана быть устойчива к ним (см. ЗАДАЧА 1).

**STOP-условие:** если разведка показала дубли `wbs_code` внутри проекта или ненайденных родителей — остановиться и сказать, не «чинить» данные молча.

---

## ЗАДАЧА 1 — миграция `074_backfill_task_parent_from_wbs.sql`

Только данные, схему 052 не трогать. Идемпотентна (`parent_task_id is null` в условии) — повторный прогон ничего не портит.

```sql
-- 074: backfill parent_task_id из wbs_code (S-WBS-BACKFILL)
-- 052 добавила колонки без backfill; импортёр плана родителя не проставлял.
-- Только данные. Схема и триггеры 052 не меняются.
--
-- Нормализация: '1.1.4.' и '1.1.4' — один узел. Планы приходят из Excel,
-- хвостовая точка стоит непоследовательно (уровни 1-3 с ней, 4-5 без).
-- wbs_code НЕ переписываем: это отображаемое значение из плана заказчика.

with src as (
  select id, project_id, rtrim(wbs_code, '.') as w
    from public.tasks
   where wbs_code is not null
     and rtrim(wbs_code, '.') <> ''
     and project_id is not null
),
child as (
  select s.id, s.project_id, s.w,
         left(s.w, length(s.w) - position('.' in reverse(s.w))) as parent_w
    from src s
   where position('.' in s.w) > 0            -- корень родителя не имеет
),
uniq as (
  select project_id, w, min(id) as id, count(*) as n
    from src group by project_id, w          -- родитель обязан быть единственным
)
update public.tasks t
   set parent_task_id = u.id
  from child c
  join uniq u
    on u.project_id = c.project_id
   and u.w          = c.parent_w
   and u.n          = 1                      -- дубль кода -> связь не ставим
 where t.id = c.id
   and t.parent_task_id is null              -- руками проставленное не перетираем
   and u.id <> t.id;
```

Ожидаемый результат на текущем проде: **102 UPDATE**.

**Откат** (в тело миграции не класть, держать в шапке коммита):

```sql
update public.tasks t set parent_task_id = null
  from public.tasks p
 where t.parent_task_id = p.id
   and rtrim(p.wbs_code,'.') = left(rtrim(t.wbs_code,'.'),
         length(rtrim(t.wbs_code,'.')) - position('.' in reverse(rtrim(t.wbs_code,'.'))));
```

---

## ЗАДАЧА 2 — общий хелпер WBS

Файл: `src/lib/utils/plan-import-helpers.ts` (не заводить новый модуль — тесты уже есть).

```ts
/**
 * WBS: '1.1.4.' и '1.1.4' — один и тот же узел. Планы из Excel ставят
 * хвостовую точку непоследовательно, поэтому сравнение всегда по нормализованному коду.
 * Отображаемый wbs_code при этом не меняется.
 */
export function normalizeWbs(code: string | null | undefined): string {
  return (code ?? '').trim().replace(/\.+$/, '');
}

/** Код родителя: '1.1.4.1' -> '1.1.4'; корень ('1', '1.') -> null. */
export function parentWbs(code: string | null | undefined): string | null {
  const w = normalizeWbs(code);
  const i = w.lastIndexOf('.');
  return i > 0 ? w.slice(0, i) : null;
}
```

Та же семантика, что в SQL миграции. Разъезд этих двух мест = дерево, которое расходится между импортом и backfill.

---

## ЗАДАЧА 3 — импортёр проставляет родителя

Файл: `src/components/tasks/PlanImport.tsx`, блок `// ── Задачи ──` (~L165–187).

Почему вторым проходом, а не в `createTask`: строки в файле идут в произвольном порядке, родителя может ещё не существовать, а триггер 052 отклонит несуществующего родителя с 23503.

1. **До** цикла вставки — собрать карту уже существующих задач проекта с WBS (иначе догрузка второй порции плана в тот же проект не пришьётся к первой):

```ts
const wbsToId = new Map<string, string>();
const { data: existing } = await supabase
  .from('tasks').select('id, wbs_code')
  .eq('project_id', projectId).not('wbs_code', 'is', null);
for (const t of existing ?? []) {
  const w = normalizeWbs(t.wbs_code);
  if (w && !wbsToId.has(w)) wbsToId.set(w, t.id);
}
```

2. **В** цикле вставки — класть созданное в ту же карту (`createTask.mutateAsync` возвращает `Task`):

```ts
const created = await createTask.mutateAsync({ /* как сейчас */ });
tasksCreated++;
const w = normalizeWbs(row.wbs);
if (w && !wbsToId.has(w)) wbsToId.set(w, created.id);
```

3. **После** цикла — второй проход, только по задачам с найденным родителем:

```ts
let linked = 0;
for (const [w, id] of wbsToId) {
  const pw = parentWbs(w);
  const parentId = pw ? wbsToId.get(pw) : undefined;
  if (!parentId || parentId === id) continue;
  try {
    await updateTask.mutateAsync({ id, parent_task_id: parentId });
    linked++;
  } catch (e) {
    errors.push(`Иерархия «${w}»: ${errMsg(e)}`);
  }
}
```

4. `ImportResult` расширить полем `linked: number`, в итоговом отчёте и тосте добавить «иерархия: N связей». Существующие поля и тексты не менять.

**Edge cases, которые обязаны отработать без падения импорта:**

- WBS-колонка не размечена → карта пустая, второй проход — no-op, импорт как раньше;
- родителя нет в файле и нет в проекте → задача остаётся корнем, ошибки нет;
- дубль кода в файле → в карту попадает первый, остальные не перезаписывают (`!wbsToId.has(w)`);
- нет прав на UPDATE чужой задачи → 42501 уходит в `errors`, цикл продолжается;
- 23514 «parent must be in the same project» → в `errors`, импорт не падает.

---

## ЗАДАЧА 4 — тесты

Файл: `tests/unit/plan-import-helpers.test.ts` (**дописать**, не создавать новый — `vitest.config.ts` собирает только `tests/unit/**`).

Кейсы:

| вход | `normalizeWbs` | `parentWbs` |
|---|---|---|
| `'1.'` | `'1'` | `null` |
| `'1'` | `'1'` | `null` |
| `'1.1.'` | `'1.1'` | `'1'` |
| `'1.1.4.1'` | `'1.1.4.1'` | `'1.1.4'` |
| `'1.1.4.1.3'` | `'1.1.4.1.3'` | `'1.1.4.1'` |
| `'  1.1.  '` | `'1.1'` | `'1'` |
| `''` / `null` / `undefined` | `''` | `null` |

Плюс интеграционный кейс на карту: набор кодов из реального плана (`1.`, `1.1.`, `1.1.4.`, `1.1.4.1`, `1.1.4.1.3`) даёт ровно один корень и цепочку без разрывов.

---

## VERIFY

```bash
npx tsc --noEmit                                   # 0 ошибок
npx vitest run tests/unit/plan-import-helpers      # зелёный
npm test                                           # весь набор зелёный
npm run build
```

Миграцию **не применять** — apply, `db:gen-types` и проверка на проде идут отдельным гейтом в Cowork.

---

## Гейт (Cowork, после мержа)

1. `supabase db push` / apply `074`.
2. `select count(*) from tasks where parent_task_id is not null;` → ожидается **102**.
3. `select count(*) from tasks t where t.parent_task_id is not null and t.project_id is distinct from (select project_id from tasks p where p.id = t.parent_task_id);` → **0**.
4. Открыть Гант Стратека: у `1.1.4.`, `1.1.4.1` появились сводные бары, дерево с отступами.
5. Смоук каскада 1B на сводной: сдвиг `1.1.4.1` тянет три её интервью-задачи одним подтверждением.
6. `npm run db:gen-types` не нужен — колонки уже в типах с 052.

---

## ЖЁСТКО НЕ ТРОГАТЬ

- `052_task_wbs.sql` и её триггеры — миграция аддитивная, только данные;
- `wbs_code` — не переписывать, не «нормализовать» в БД;
- `vitest.config.ts` → `include`;
- `src/types/database.ts`, `src/types/supabase.gen.ts`;
- `gantt-schedule.ts` и логику каскада 1B — этот спринт её только оживляет на данных;
- `deleted_at` — в проекте hard delete, soft-delete не вводить.

## Вне scope

- UI-редактор иерархии (перетащить задачу в другого родителя) — отдельный спринт;
- пересчёт `wbs_code` при перемещении задачи в дереве;
- backfill для проектов без `wbs_code` (там иерархии просто нет источника).

## Оценка

Миграция + хелпер + импортёр + тесты ≈ **3–4 часа**. Риск низкий: аддитивно, идемпотентно, откат одним UPDATE.
