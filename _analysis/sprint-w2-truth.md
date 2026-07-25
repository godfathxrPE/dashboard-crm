# Claude Code Prompt — Sprint W2: Правда во времени и цифрах (TZ, единые метрики, лента событий, optimistic доски)

Контекст: по ревью 2026-07-18. Четыре независимых бага, из-за которых CRM врёт пользователю: время звонков расщепляется на ±3 часа между экранами; Обзор и Сделки показывают разные KPI по одним данным; лента активности сыпет `stage_id, won_reason…` и `automation_fired`; доска задач проекта «прыгает» после мутаций.

**Правила:** миграцию 057 пишем, применяет гейт Cowork. Типы не редактируем руками (derived из supabase.gen.ts). Optimistic-паттерн — 5 шагов как в use-projects.

## РАЗВЕДКА

```bash
grep -n "slice(0, *16)\|slice(0,16)" src/components -r          # все точки datetime-local prefill
grep -n "values.date\|values.deadline" src/components/calls/CallModal.tsx src/components/tasks/TaskModal.tsx
grep -n "slice(0, *10)\|slice(0,10)" src/lib/hooks/use-alerts.ts src/components/layout/EventReminder.tsx
grep -n "localDateKey\|localDateTimeKey\|mskDateKey" src/lib/utils/date-helpers.ts | head
grep -n "formatBudget" -r src/lib | head                        # два определения: validators/project.ts:194 и utils/currency.ts:6
grep -rn "from '@/lib/utils/currency'" src || echo "currency.ts никто не импортирует — мёртвый дубль"
grep -n "describeEvent\|relativeTime" src/components/dashboard/DashboardHome.tsx | head   # локальная копия ~690–722
grep -n "describeEvent" src/lib/utils/activity-events.ts
sed -n '160,215p' src/components/dashboard/DashboardHome.tsx    # KpiCards: своя формула active/pipeline/conversion
sed -n '115,150p' src/components/projects/PipelineBoard.tsx     # вторая формула + weighted
grep -n "queryKey: \['tasks'" src/lib/hooks/use-tasks.ts        # ['tasks'] vs ['tasks','board',projectId]
grep -n "payload" supabase/migrations/050_workflow_engine.sql | head   # ключи payload у automation_fired (~:271)
grep -n "automation_fired" supabase/migrations/051_task_overdue.sql supabase/migrations/20260712230000_baseline.sql | head
```

## ЗАДАЧА 1: TZ — datetime-local пишем/читаем через одну пару конвертеров

**1a. Хелперы** в `src/lib/utils/date-helpers.ts`:

```ts
/** 'YYYY-MM-DDTHH:mm' из <input datetime-local> (локальное время юзера) → ISO UTC для timestamptz. */
export function datetimeLocalToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);              // парсится как ЛОКАЛЬНОЕ время — это и есть смысл
  return isNaN(d.getTime()) ? null : d.toISOString();
}
/** ISO из БД → значение для <input datetime-local> в локальной TZ. */
export function isoToDatetimeLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return localDateTimeKey(new Date(iso));   // уже есть в этом файле — проверить сигнатуру
}
```

**1b. Применить в модалках** (полный список точек — из разведки `slice(0,16)`):
- `src/components/calls/CallModal.tsx`: onSubmit → `{ ...values, date: datetimeLocalToIso(values.date) }` (и в create, и в update); prefill editCall → `isoToDatetimeLocal(editCall.date)`.
- `src/components/tasks/TaskModal.tsx`: prefill `deadline: isoToDatetimeLocal(editTask.deadline)` (вместо `slice(0,16)`), `defaultDeadline` — так же; onSubmit → `deadline: datetimeLocalToIso(...)`.
- Остальные находки из разведки — тем же паттерном. `meetings` (date + time раздельные колонки) и `scheduled_calls` (time) — НЕ трогать.

**1c. Единый day-key.** `use-alerts.ts` и `EventReminder.tsx`: `deadline.slice(0,10)` → `localDateKey(new Date(deadline))`. Голый `slice(0,10)` по timestamptz — это UTC-дата, для 00:00–03:00 МСК это вчера. ВАЖНО: обёртку применять только к timestamptz-полям (`tasks.deadline`, `calls.date`); date-only колонки (`meetings.date`, `next_action_date`) сравниваются строкой как есть — им `new Date()` наоборот навредит.

**1d. Миграция 057** `supabase/migrations/057_backfill_datetime_tz.sql` — сдвиг исторических значений, введённых через datetime-local (хранились как «МСК, записанный UTC-ом»):

```sql
-- ГЕЙТ: перед применением выполнить SELECT-версию и глазами проверить список строк.
-- Сдвигаем только созданное ДО деплоя фикса (заменить метку на фактический момент деплоя W2):
update public.calls
set date = date - interval '3 hours'
where created_at < '<DEPLOY_TS>'::timestamptz;

update public.tasks
set deadline = deadline - interval '3 hours'
where deadline is not null and created_at < '<DEPLOY_TS>'::timestamptz;
```

В комментарии миграции: строки, импортированные `migrate.mjs` из старого дашборда, могли храниться корректно — на гейте сверить их `created_at` (день миграции данных) и при необходимости исключить интервалом `and created_at not between '<IMPORT_FROM>' and '<IMPORT_TO>'`. `<DEPLOY_TS>` — момент **деплоя фронта на Netlify**, не merge PR (между ними записи идут по старому пути). Данных мало (14 звонков) — просмотр глазами обязателен и дешев.

**1e. Тесты** `tests/unit/datetime-local.test.ts`: конвертеры туда-обратно; кейс `TZ=Europe/Moscow` и `TZ=UTC` (vitest: выставить `process.env.TZ` до импорта / отдельные describe); граничный «23:30 МСК» не меняет день при isoToDatetimeLocal.

## ЗАДАЧА 2: Единый модуль метрик сделок

Сейчас: `DashboardHome.KpiCards` (active = status≠won/lost по всем client, conversion за всё время) vs `PipelineBoard` (свои active/weighted/conversion по текущему пайплайну) → «1 vs 2 активных», «3.6M vs 11M», «22% vs 67%» на соседних экранах.

1. Новый файл `src/lib/selectors/deal-metrics.ts` (чистые функции, без хуков):

```ts
// Определения (зафиксированы ревью):
// active  = type='client' AND status='open'   (on_hold — НЕ active, показывается отдельно)
// pipelineSum = Σ budget по active (копейки — как в БД)
// weighted    = Σ budget × probability(stage)/100 (probability из pipeline_stages)
// conversion  = won / (won + lost), в процентах, целое
export function dealMetrics(projects: Project[], opts?: {
  pipelineId?: string;           // срез по пайплайну; без него — все направления
  stages?: PipelineStage[];      // для weighted
}): { active: Project[]; pipelineSum: number; weighted: number;
      wonCount: number; lostCount: number; conversion: number }
```

2. `DashboardHome.tsx` KpiCards: убрать локальный useMemo-расчёт active/pipeline/conversion → `dealMetrics(projects)`. Подпись карточек уточнить срез: «Сумма pipeline · все направления», «Конверсия · за всё время».
3. `PipelineBoard.tsx`: KPI-строка → `dealMetrics(projects, { pipelineId, stages })`. Подпись: «по текущему пайплайну».
4. `formatBudget`: живёт один — в `src/lib/validators/project.ts` (10 импортёров). `src/lib/utils/currency.ts` удалить, если разведка подтвердила ноль импортов.
5. Тест `tests/unit/deal-metrics.test.ts`: active исключает won/lost/on_hold/internal/delivery; conversion 0 при нуле закрытых; weighted с probability.

## ЗАДАЧА 3: Лента активности — один describeEvent, человеческие тексты

1. `src/lib/utils/activity-events.ts` — расширить единую версию:
   - словарь `FIELD_LABELS: Record<string,string>` для `project_updated.fields_changed`: `stage_id`→«стадия», `next_step`→«следующий шаг», `next_action_date`→«дата шага», `budget`→«бюджет», `deadline`→«дедлайн», `won_reason`/`won_detail`→«причина выигрыша», `loss_reason`/`loss_detail`→«причина проигрыша», `pinned_note`→«заметка», `owner_id`→«ответственный», `probability`→«вероятность», `status`→«статус» (+ дополнить по фактическим ключам из разведки). Легаси-`stage` в списке при наличии `stage_id` — не показывать (дубль);
   - ветка `automation_fired`: текст «Сработала автоматизация» + имя правила/задачи из payload (ключи взять из 050:271 / 051:109 / baseline:1064 — по разведке);
   - ветки `ai_summary_generated` («AI-резюме готово»), `entity_deleted` (перенести логику из DashboardHome-копии), и все event_type, которые сейчас есть только в одной из двух копий — свести в одну;
   - `default`: не отдавать сырой event_type — «Событие: <event_type>» как последний фолбэк (греппабельно, но не голая строка).
2. `DashboardHome.tsx`: удалить локальные `describeEvent`/`stageName`/`relativeTime` (~690–722), импортировать из `activity-events.ts`. Прогнать `grep -rn "function relativeTime" src` — должна остаться одна реализация (у `dates.ts` `formatRelative` другое назначение, не трогать).
3. Тест `tests/unit/activity-events.test.ts`: project_updated с fields_changed → русские лейблы без сырых имён; automation_fired → текст с именем правила; неизвестный тип → фолбэк.

## ЗАДАЧА 4: Optimistic задач видит кеш проектной доски

`use-tasks.ts`: `useCreateTask` / `useUpdateTask` / `useDeleteTask` патчат только `['tasks']`, а доска и Гантт читают `['tasks','board',projectId]`. Образец правильного — `useUpdateTaskDates` (:293, патчит оба) и scope-подход `use-projects.ts`.

Во всех трёх мутациях onMutate:
```ts
await queryClient.cancelQueries({ queryKey: ['tasks'] });
const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] }); // ВСЕ срезы префикса
queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => patch(old)); // создание: только совместимые срезы (board только если project_id совпадает — см. ключ)
return { snapshots };
```
onError — откат циклом по `snapshots`; onSettled — invalidate префикса (как сейчас). Перед правкой сверить фактическую форму board-кеша (`useProjectBoard`, :71) — массив или {columns, tasks}; патч под фактическую форму. `useUpdateTaskDates` после унификации привести к общему хелперу, чтобы не жило две механики.

Проверка руками: открыть деталку проекта → создать задачу с доски → карточка появляется мгновенно; перенос между колонками из TaskModal — без «прыжка».

## ПРОВЕРКА

```bash
npx tsc --noEmit
npx vitest run
grep -rn "slice(0, *16)\|slice(0,16)" src/components | grep -v isoToDatetimeLocal   # пусто
grep -rn "function describeEvent" src | wc -l    # 1
```

## ГЕЙТ (Cowork)

1. Ревью диффа; деплой фронта.
2. SELECT-превью бэкфилла 057 (список звонков/дедлайнов с created_at) → подтвердить сдвигаемый набор → `apply_migration` 057 c фактическим `<DEPLOY_TS>`.
3. Смоук: создать звонок на «15:00» → календарь, список звонков, модалка и TodayView показывают 15:00; исторический звонок после бэкфилла — время совпадает с тем, что вводили.
4. Обзор и Сделки: «Активные» и pipeline согласованы (с подписями срезов).
5. Лента на Обзоре и в деталке сделки: ни одного сырого event_type/имени колонки.

## КОММИТ

```bash
git add src/lib/utils/date-helpers.ts src/components/calls/CallModal.tsx src/components/tasks/TaskModal.tsx src/lib/hooks/use-alerts.ts src/components/layout/EventReminder.tsx supabase/migrations/057_backfill_datetime_tz.sql src/lib/selectors/deal-metrics.ts src/components/dashboard/DashboardHome.tsx src/components/projects/PipelineBoard.tsx src/lib/utils/activity-events.ts src/lib/hooks/use-tasks.ts tests/unit/
git rm src/lib/utils/currency.ts
git commit -m "Sprint W2: правда во времени и цифрах — TZ-фикс datetime-local + бэкфилл (057), единый deal-metrics, один describeEvent без сырых полей, optimistic задач для board-кеша"
```
