# Claude Code Prompt — Sprint S-SCHEDULE-1a: lag_days UI + soft-warn нарушения FS

Контекст: первый слой эпика S-SCHEDULE-1 (Grok M1, «доверие к плану»). Сейчас Gantt рисует FS-зависимости, но: (1) `lag_days` в БД есть (048), а UI его не пишет — `useCreateTaskDependency` шлёт только predecessor/successor, дефолт БД 0, поменять нельзя (нет update-мутации); (2) FS-констрейнт не enforced — если successor стартует раньше `predecessor.end + lag`, график молча врёт (Grok: «связал → сдвинул → пусконаладка на старых датах → график визуально врёт»). Этот спринт даёт **lag-UI** и **мягкое предупреждение** (визуальный сигнал, БЕЗ каскада и авто-сдвига — они слои b/c).

**НЕ в скоупе (следующие слои):** cascade reschedule (S-SCHEDULE-1b), critical path v2 на реальных датах (S-SCHEDULE-1c), working-calendar (lag сейчас в календарных днях), dep_type ≠ FS, отрицательный lag (lead). Не тащить.

Стек: Next 15 + TS strict + Supabase. **Есть миграция 062** (UPDATE-политика RLS — см. задачу 1). Модель: CC пишет миграцию + коммитит, **НЕ применяет**; применяет гейт Cowork через MCP + смок ролями. Следующая свободная миграция — **062** (054–059+061 заняты, 060 резерв W3).

## РАЗВЕДКА (до правок)
```bash
cd ~/Downloads/dashboard-crm
cat src/lib/hooks/use-task-dependencies.ts          # create/delete есть, update НЕТ; parseDependencyError; optimistic-паттерн
sed -n '295,360p' src/components/tasks/GanttTimeline.tsx   # link-mode тулбар, pendingPred, создание ребра
sed -n '405,480p' src/components/tasks/GanttTimeline.tsx   # critical useMemo — nodes-map со span'ами задач (переиспользовать для soft-warn)
sed -n '505,560p' src/components/tasks/GanttTimeline.tsx   # measure() → edges[] (SVG paths from pred.end to succ.start)
grep -n "deleteDep\|onDelete\|удалить связь\|edges.map\|<path\|<svg\|edge" src/components/tasks/GanttTimeline.tsx  # ГДЕ рисуются стрелки и есть ли уже delete-UI ребра
grep -n "effectiveSpan\|gt.start\|gt.end\|\.start\|\.end" src/lib/hooks/use-project-schedule.ts | head   # формат дат span (date-string MSK)
sed -n '1,60p' src/lib/utils/date-helpers.ts 2>/dev/null   # addLocalDays / парс date-key (для pred.end + lag)
```
Зафиксировать: (1) как именно рендерятся `edges` (SVG `<path>`) и есть ли уже клик/delete по ребру; (2) откуда взять `end` предшественника и `start` преемника как сравнимые date-строки (в `critical` useMemo уже строится map задача→span — переиспользовать, не дублировать); (3) есть ли helper прибавления дней к date-key (нужен `end + lag`).

---

## ЗАДАЧА 1 — миграция 062: UPDATE-политика на task_dependencies

WHY: у `task_dependencies` политики INSERT/DELETE/SELECT есть, **UPDATE — нет** (проверено на живой БД). Без неё правка `lag_days` из клиента → RLS deny. Добавляем UPDATE строго по предикату insert/delete (owner/admin/manager, org-scoped) + WITH CHECK (конвенция 054).

**062_task_dep_update_policy.sql:**
```sql
-- 062: UPDATE-политика task_dependencies (правка lag_days из Gantt, S-SCHEDULE-1a).
-- Предикат — как task_dep_insert/delete (org + роль owner/admin/manager);
-- WITH CHECK (новая строка) по конвенции 054 (ловит SET org_id/смену тенанта).
create policy "task_dep_update" on public.task_dependencies for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_org_role()) = any (array['owner','admin','manager'])
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.current_org_role()) = any (array['owner','admin','manager'])
  );
```
NB: RLS — row-level, не column-level; ограничение «только lag_days» — на стороне клиента (мутация шлёт только lag_days). org_id иммутабелен существующим freeze-триггером (054) — проверить на гейте, что task_dependencies им покрыт; если нет — WITH CHECK на org_id всё равно не даёт увести строку в чужой тенант. Гейт Cowork: apply + смок ролями (manager правит lag своего проекта → ok; viewer → 42501; чужой org → 0 строк/deny) + advisors.

## ЗАДАЧА 2 — useUpdateTaskDependency

`src/lib/hooks/use-task-dependencies.ts` — добавить мутацию по образцу create/delete (тот же optimistic-паттерн, `meta.silentError`, `parseDependencyError`):
```ts
export function useUpdateTaskDependency(projectId: string) {
  // mutationFn: supabase.from('task_dependencies').update({ lag_days }).eq('id', id).select(...).single()
  // input: { id: string; lag_days: number }
  // onMutate: optimistic — заменить ребро в кеше depsKey(projectId) с новым lag_days
  // onError: rollback previous + toast(parseDependencyError)
  // onSettled: invalidate depsKey
}
```
lag_days валидировать на клиенте: целое ≥ 0 (v1 без lead-time). dep_type не трогаем (FS).

## ЗАДАЧА 3 — lag-UI на ребре (клик по стрелке → редактор)

WHY: юзеру нужно задать «FS + N дн» (логистика/сушка/согласование между задачами).

HOW (по РАЗВЕДКЕ — выбрать наименее инвазивный путь):
1. **Кликабельная стрелка.** Поверх видимого `<path>` ребра положить второй прозрачный `<path>` с широким `stroke` (hit-area ~10px) + `cursor-pointer` + `onClick` → открыть маленький поповер у середины ребра (координата midX/midY уже считается в measure()). Если delete ребра сейчас живёт отдельно — свернуть его в этот же поповер.
2. **Поповер ребра:** число `lag_days` (инпут/степпер, ≥0), подпись типа «FS» (статично v1), кнопка «Удалить связь» (существующий `deleteDep`). Сохранение → `useUpdateTaskDependency`. Закрытие по Esc/клику вне (как в других поповерах репо).
3. **Метка lag на стрелке:** если `lag_days > 0` — маленький бейдж «+Nд» у середины ребра (tabular-nums, var-токены). При 0 — без бейджа.
4. Не ломать link-mode (создание рёбер), critical-подсветку, свёртку и измерение стрелок (effect-deps по `depSig` — при смене lag ребро тем же id, `d` тот же; чтобы бейдж/цвет обновились, добавить lag/violation в сигнатуру `edges`, как сделано для `critical`).

## ЗАДАЧА 4 — soft-warn нарушения FS (визуальный сигнал, БЕЗ блокировки)

WHY: главный сигнал «график врёт». FS-нарушение = `succ.start < pred.end + lag_days`.

HOW:
1. **Вычисление (read-only).** В `critical` useMemo (или рядом) уже есть map задача→span (`start`/`end` как date-строки). Для каждого ребра, у которого оба конца датированы: `violated = succ.start < addDays(pred.end, lag_days)`. Даты — date-key MSK (как в Gantt); прибавление дней — через date-helper (если нет `addLocalDays(key, n)` — добавить в `date-helpers.ts`, TZ-осознанно). Undated-конец → нарушение не считаем (нечего сравнивать), стрелка как есть.
2. **Отрисовка.** Нарушенное ребро — отдельный визуальный класс (напр. `text-red` stroke + чуть толще), ОТЛИЧНЫЙ от critical-подсветки (critical = accent-outline на баре; violation = на стрелке). Если ребро и critical, и violated — violation-цвет приоритетнее (это ошибка). Добавить `violated` в объект `edges` + в его сигнатуру (иначе не перерисуется).
3. **Тултип** на нарушенной стрелке: «FS-нарушение: „{succ}" должна начаться не раньше {DD.MM} (после „{pred}" + {lag} дн)». Через существующий `setTip`-механизм.
4. **Только сигнал.** НИКАКОГО авто-сдвига дат и блокировки сохранения — это cascade (S-SCHEDULE-1b). Юзер видит красную стрелку и решает сам.

## EDGE CASES / TESTS (сценарии, не полный suite)
- Задать lag=5 на FS-ребре → бейдж «+5д», сохранилось (рефетч), при succ.start < pred.end+5 стрелка красная + тултип.
- lag=0, succ.start ≥ pred.end → стрелка обычная (нет нарушения).
- succ.start < pred.end (даже lag=0) → красная стрелка (нарушение).
- Один из концов undated → нарушение не считаем, стрелка обычная.
- viewer (роль) → правка lag запрещена (42501, тост parseDependencyError); manager своего проекта → ок.
- Свёртка сводной строки скрывает конец ребра → стрелка пропадает (W4-паттерн), не падает.
- Смена lag не ломает critical-подсветку и link-mode.
- Backward-compat: существующие рёбра (lag=0) рисуются как раньше, без бейджа.

## VERIFICATION LABELS (ожидаемые)
```
Type Safety:            WARNING (новая мутация + violation-поле в edges — проверить типы)
RLS Coverage:           WARNING → PASS после гейта (062 UPDATE-политика по паттерну insert/delete + WITH CHECK; смок ролями гейтом)
Backward Compatibility: PASS (аддитивно: новая политика/мутация/UI; create/delete/CP/link-mode не тронуты; старые рёбра lag=0 как были)
Runtime Tested:         NOT_VERIFIED (Chrome-смок на Vercel: lag-редактор, красная стрелка нарушения, роль-гейт)
```

## КОММИТ
Миграция 062 — НЕ применять из CC (пишется + коммитится, применяет гейт Cowork). Фронт деплоить ТОЛЬКО после apply 062 (иначе update lag → RLS deny). Явный список файлов (не add -A): `062_task_dep_update_policy.sql`, `use-task-dependencies.ts`, `GanttTimeline.tsx`, `date-helpers.ts` (если добавлялся helper).
```
git add supabase/migrations/062_task_dep_update_policy.sql src/lib/hooks/use-task-dependencies.ts src/components/tasks/GanttTimeline.tsx src/lib/utils/date-helpers.ts
git commit -m "S-SCHEDULE-1a: lag_days UI + soft-warn FS-нарушений (062 UPDATE-политика task_dependencies)"
git push
```
После пуша память: 062 ждёт apply гейтом. Смок (гейтом Cowork на Vercel): lag-редактор пишет и рисует бейдж; нарушение FS даёт красную стрелку + тултип; роль-гейт (viewer→42501); create/delete/CP/свёртка без регресса.

---

## ПОПРАВКИ ПО РЕВЬЮ GROK 7.5/10 (учесть при исполнении; сверено с живой БД + кодом a8096d4)

**B1 — добавить явный `grant update` в 062 (но НЕ блокер на живой БД).** Grok читал файл 048 (`grant select, insert, delete`), но на живой БД у `authenticated` UPDATE-привилегия УЖЕ есть (дефолты Supabase — проверено `role_table_grants`). Т.е. одной policy хватило бы. Всё равно добавить явно (идемпотентно, намерение + защита от дрейфа дефолтов, как quotes 053):
```sql
grant update on public.task_dependencies to authenticated;
```
В гейт-смок добавить строку: `manager UPDATE lag → 1 row`.

**W1 — НЕ создавать `addLocalDays`, переиспользовать существующий.** В `date-helpers.ts:83` есть `shiftDateKeyByBuckets(dateKey, 'day', n)` (TZ-безопасно, UTC-noon — как бары/critical). Для soft-warn:
```ts
const earliest = shiftDateKeyByBuckets(pred.end, 'day', lag_days);
const violated = succ.start < earliest;
```
Тонкий alias допустим, но не плодить вторую date-арифметику. Правка `date-helpers.ts` из состава коммита УБРАТЬ (helper уже есть).

**W2 — midY не считается.** В `measure()` (~L529) есть только `midX`, а `edges[]` = `{id, d, critical}`. Для поповера/бейджа/цвета положить в объект edge: `midX, midY` (напр. точка elbow или `(from.y+to.y)/2`), `violated: boolean`, `lag_days: number`.

**W3 — `depSig` не содержит lag → measure не перезапустится при смене только lag (КРИТИЧНО для перерисовки).** Сейчас `depSig` (L332) = `` `${id}:${pred}>${succ}` ``. Optimistic lag-update обновит кеш, но SVG останется старым до resize/zoom. Правка: `depSig += :${d.lag_days}` (и включить `violated` в сравнение `setEdges`). Без этого бейдж «+Nд» и красная стрелка не появятся до случайного reflow.

**W4 — точные строки разведки (drift):** link-mode state/pendingPred/создание — L299–361; **тулбар «Связи»/«Крит. путь» — L600–616** (не 295); measure→edges — L510–559; рёбра SVG `<path>` + delete через `window.confirm` — **L794–807** (`pointerEvents:'stroke'`).

**W5 (не блокер, отметить как долг):** триггер `check_task_dependency_valid` — только BEFORE **INSERT** (048). Через API UPDATE можно сменить `predecessor_id`/`successor_id` в обход DAG/cross-project валидации. В этом спринте клиент шлёт ТОЛЬКО `lag_days` — приемлемо для v1. Hardening (BEFORE UPDATE re-validate или immutable-ends) — отдельный заход, не тащить сюда.

**W8 — токены:** violation-stroke через `var(--red)` (не класс `text-red` — он `color`, а SVG нужен `stroke`). Стиль policy — для единообразия с 048 можно `in ('owner','admin','manager')` вместо `= any(array[...])` (работает и так).

**W9 — delete:** оставить `window.confirm('Удалить зависимость?')` внутри поповера (конвенция репо, learnings) — не заменять на кастом.

**W7 — schema-дельта:** после гейт-apply 062 обновить `docs/schema.md` (RLS task_dependencies: +UPDATE policy +grant) — отдельным коммитом/заходом, в чеклист (не обязателен в CC-коммите спринта).
