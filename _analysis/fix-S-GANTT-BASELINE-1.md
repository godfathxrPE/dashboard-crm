# FIX S-GANTT-BASELINE-1 — три фикса по итогам Cowork-гейта

Ветка: `feat/gantt-baseline-1` (продолжаем в ней, поверх 8addfa9).
Миграция 074 **не применена** — файл ещё можно править как исходник, а не как историю.

Три коммита, строго в этом порядке. Фикс 1 обязателен до apply, фиксы 2 и 3 — после.

---

## РАЗВЕДКА (выполнить целиком до первой правки)

```bash
git log --oneline -1                     # ожидание: 8addfa9
git status --porcelain                   # ожидание: пусто
npx supabase migration list 2>/dev/null | tail -5   # 074 НЕ должна значиться применённой
grep -n "current_org_role\|is_project_member" supabase/migrations/074_project_baselines.sql
grep -n "meta:" src/lib/hooks/use-project-baselines.ts
grep -n "useOrgRole" src/lib/hooks/use-org-role.ts src/components/tasks/GanttTimeline.tsx
grep -n "const model = useMemo" -A 22 src/components/tasks/GanttTimeline.tsx
```

**STOP-1.** Если 074 уже применена к БД — остановиться и сказать. Фикс 1 меняет тело функции
и определения политик; после apply это отдельная миграция 075, а не правка файла.
**STOP-2.** Если `useOrgRole` не экспортирует роль текущего пользователя в ожидаемом виде —
остановиться, не изобретать второй хук.
**STOP-3.** Если `git status` не пуст — остановиться, разобраться, что за незакоммиченное.

---

## ФИКС 1 — права RPC + двойной тост + комментарии (ДО apply)

### 1.1 (A) Гард `create_project_baseline` шире, чем видимость

**Проблема.** RPC пускает по `org_id` + роль ∈ (owner, admin, manager). SELECT-политика
разрешает видеть baseline только owner/admin org, владельцу/создателю проекта или
`is_project_member`. Функция — `security definer`, RLS её не ограничивает. Следствие:
manager, не состоящий в проекте, создаёт слепок в проекте, который сам не видит; плюс
разное сообщение об ошибке («Проект не найден» только для чужой org) подтверждает
существование проекта по id.

**Правило.** Право на создание = право видеть проект ∧ роль, допускающая запись.
Предикат видимости — тот же самый, что в `project_baselines_select`.

Заменить блок строк 108–116 (`if not exists ... raise 'Недостаточно прав'`) на:

```sql
  -- Видимость первой: невидимый проект = «не найден», иначе id-зонд подтверждает существование.
  -- Предикат дословно совпадает с project_baselines_select — расхождение = запись вслепую.
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.org_id = public.current_org_id()
      and (
        coalesce(public.current_org_role(), '') in ('owner', 'admin')
        or p.owner_id = auth.uid()
        or p.created_by = auth.uid()
        or public.is_project_member(p.id)
      )
  ) then
    raise exception 'Проект не найден' using errcode = '42501';
  end if;

  if coalesce(public.current_org_role(), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Название плана обязательно' using errcode = '22023';
  end if;
```

Последний блок — это (G): без него `p_name = null` даёт сырой 23502 из CHECK/NOT NULL
с нечитаемым текстом. `22023` (invalid_parameter_value) добавить в `baselineError`
(см. 1.2) с сообщением «Название плана обязательно».

Внутри функции `auth.uid()` без `select`-обёртки — это скалярный вызов в plpgsql,
initplan-обёртка нужна только в RLS-политиках. Не путать.

### 1.2 (B) `meta: { silentError: true }`

`MutationCache.onError` в `src/components/layout/QueryProvider.tsx` тостит `humanizeError`
для любой мутации без `meta.silentError`. Обе baseline-мутации тостят сами → два тоста
на каждую ошибку.

В `useCreateBaseline` и `useDeleteBaseline` (`src/lib/hooks/use-project-baselines.ts`)
добавить в объект `useMutation`:

```ts
    meta: { silentError: true },
```

Плюс ветка `'22023'` в `baselineError`.

### 1.3 (E) Комментарий об отклонениях от конвенций

В шапку 074 (после существующего блока про hard delete) добавить:

```sql
-- Осознанные отклонения от конвенции таблиц:
--   updated_at нет нигде — слепок иммутабелен, UPDATE-политик не существует;
--   у baseline_tasks нет created_at/created_by — строки создаются только RPC вместе с
--   заголовком, автор и время лежат в project_baselines;
--   гранты сужены (select+delete на заголовок, только select на строки) — записи клиентом нет.
```

### Гейт фикса 1

```bash
npx tsc --noEmit          # 0
npm test                  # все зелёные
npx eslint src/lib/hooks/use-project-baselines.ts
git --no-pager diff --stat
```

Коммит: `fix(baselines): гард RPC по видимости проекта, silentError, комментарии 074`

**Дальше — стоп. Apply делает Cowork-гейт.** Не вызывать `supabase db push`,
`apply_migration`, `execute_sql` на запись. Не регенерить типы.

---

## ФИКС 2 — (C) горизонт бакетов учитывает выбранный слепок (ПОСЛЕ apply)

**Проблема.** `model` (GanttTimeline.tsx, ~L682) строит min/max **только** по спанам
задач из `visibleSwimlanes`. Слепок в горизонт не входит. В рендере строки:

```ts
const gs = ghost ? (idxByKey.get(bucketKeyOf(ghost.start, zoom)) ?? 0) : 0;
const ge = ghost ? (idxByKey.get(bucketKeyOf(ghost.end, zoom)) ?? gs) : 0;
```

`?? 0` при промахе молча прибивает призрак к первой колонке; если промахнулись оба конца —
полноразмерная ложная полоса «План» в начале таймлайна. А это ровно целевой кейс baseline:
задачу перенесли далеко вперёд от плана.

**Решение.** Расширять горизонт спанами слепка — но **только для задач, которые сейчас видимы**.
Иначе фильтр «мои задачи» перестанет сужать ось: слепок содержит все задачи проекта.

В `model`:

```ts
  const model = useMemo(() => {
    const allTasks: GanttTask[] = visibleSwimlanes.flatMap((sl) => sl.tasks);
    let min: string;
    let max: string;
    if (allTasks.length > 0) {
      min = allTasks.reduce((m, t) => (t.start < m ? t.start : m), allTasks[0].start);
      max = allTasks.reduce((m, t) => (t.end > m ? t.end : m), allTasks[0].end);
      // Слепок расширяет ось, иначе план вне горизонта рисуется в первой колонке.
      // Берём только видимые задачи: baseline держит весь проект, фильтры не должны сброситься.
      if (planByTask) {
        for (const t of allTasks) {
          const plan = planByTask.get(t.task.id);
          if (!plan) continue;
          if (plan.start < min) min = plan.start;
          if (plan.end > max) max = plan.end;
        }
      }
    } else if (hasUndated) {
      ...без изменений...
```

где `planByTask` — вынесенный наверх `const planByTask = baselineTasks.data ?? null;`
(объявить **до** `model`, ~рядом с L390). Добавить `planByTask` в deps `useMemo`.
`baselineTasks.data` — стабильная ссылка от React Query, лишних пересчётов не даёт.

После этого `?? 0` в `gs`/`ge` всё равно заменить на честный промах — расширение закрывает
случай «плана нет в оси», но не закрывает `zoom`-края и гонку «данные слепка пришли,
`model` ещё не пересчитался»:

```ts
const gsRaw = ghost ? idxByKey.get(bucketKeyOf(ghost.start, zoom)) : undefined;
const geRaw = ghost ? idxByKey.get(bucketKeyOf(ghost.end, zoom)) : undefined;
const ghostVisible = ghost != null && gsRaw !== undefined && geRaw !== undefined;
```

и рендерить `<GhostBar>` только при `ghostVisible`. Тултип со сдвигом (`planText`) считается
как раньше и остаётся на баре факта — сдвиг известен, даже если призрак не влез.

**Тест** (`tests/unit/` — только туда, `include` не трогать). Если логика min/max останется
внутри компонента, юнит-тестом её не покрыть: вынести расчёт горизонта в чистую функцию
`computeHorizon(tasks, planByTask)` в `src/lib/utils/gantt-schedule.ts` и покрыть тремя
кейсами: план внутри оси (границы не меняются), план левее min, план правее max,
плюс задача без плана. Новый файл `tests/unit/gantt-horizon.test.ts`.

Оценка: 1,5–2 ч. Риск средний — трогает ось, от которой зависит весь рендер.

Коммит: `fix(gantt): ось учитывает спаны выбранного слепка, призрак не падает в колонку 1`

---

## ФИКС 3 — (D) + хвост (G) (ПОСЛЕ фикса 2)

### 3.1 (D) Кнопка удаления врёт manager'у

Trash гейтится `canManage`, RLS DELETE — только owner/admin. Manager жмёт → оптимистичный
откат + тост «Недостаточно прав». Кнопку прятать, а не ловить отказ:

```ts
const { data: orgRole } = useOrgRole();          // src/lib/hooks/use-org-role.ts:18
const canDeleteBaseline = orgRole === 'owner' || orgRole === 'admin';
```

условие рендера Trash (~L1004): `selectedBaselineId && canDeleteBaseline`.
`canManage` для кнопки «Зафиксировать план» оставить как есть — там роль совпадает с гардом RPC.

Точную сигнатуру `useOrgRole` сверить в разведке; если он отдаёт роль иначе — адаптировать
чтение, но второй хук не заводить.

### 3.2 (G) Мелочи

- `useBaselineTasks`: убрать `is_milestone` из `.select(...)` — тянется и выбрасывается.
- `useDeleteBaseline.onError`: `if (ctx?.previous !== undefined)` вместо `if (ctx?.previous)` —
  пустой массив снапшота сейчас не откатывается.
- `useCreateBaseline`: `toast.success('План зафиксирован')` в `onSuccess`.
- (F) `task_id ... on delete cascade` — **не трогаем**. Удаление задачи стирает её из прошлых
  слепков, история план/факт теряется. Альтернатива — денормализовать название задачи в
  `baseline_tasks` и снять каскад; это отдельное решение, в этот фикс не входит.

Оценка: 40 мин. Риск низкий.

Коммит: `fix(baselines): кнопка удаления по роли org, мелкие правки хуков`

---

## Итог

| Фикс | Что | Когда | Оценка |
|------|-----|-------|--------|
| 1 | A + B + E + G(p_name) | до apply 074 | 40 мин |
| 2 | C — горизонт + честный промах призрака | после apply | 1,5–2 ч |
| 3 | D + хвост G | после фикса 2 | 40 мин |

`any` запрещён. Стили — только токены из `globals.css`. Типы `src/types/*` не править.
