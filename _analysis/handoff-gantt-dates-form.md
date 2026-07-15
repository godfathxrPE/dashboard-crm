# Claude Code — Sprint: S-GANTT-DATES form v0 (поля дат в TaskModal + типы + файл миграции 046)

Контекст: миграция 046 (`tasks` += `start_date date`, `end_date date` nullable + CHECK
`tasks_dates_order_chk`) УЖЕ применена на проде через Cowork-гейт (версия 20260715192639).
Эта задача — клиентская часть: поля в форме, типы, и положить SQL-файл миграции в репо.

## РАЗВЕДКА (ничего не меняем)
```bash
cd ~/Downloads/dashboard-crm
# 1. как назван последний файл миграции — повторить паттерн для 046
ls -1 supabase/migrations | tail -5
# 2. подтвердить, что 046 в репо ещё нет
ls supabase/migrations | grep -i gantt || echo "NO 046 FILE — создать"
# 3. как derived Task (ожидаем: из supabase.gen.ts через database.ts, правка руками не нужна)
grep -n "start_date\|end_date" src/types/supabase.gen.ts || echo "gen ещё без дат — regen обязателен"
# 4. существующие поля формы — якоря для вставки
grep -n "Deadline\|deadline\|remind_min" src/components/tasks/TaskModal.tsx
grep -n "deadline" src/lib/validators/task.ts
grep -n "optimistic: Task" src/lib/hooks/use-tasks.ts
```

## ЗАДАЧА 1 — SQL-файл миграции в репо
Создать `supabase/migrations/<по паттерну из РАЗВЕДКА п.1>_gantt_dates_on_tasks.sql`
(если остальные файлы с timestamp-префиксом — использовать `20260715192639_046_gantt_dates_on_tasks.sql`).
Содержимое — ТОЧНО как применено на проде:
```sql
-- Migration 046: S-GANTT-DATES-1 — gantt dates on tasks (additive, nullable)
ALTER TABLE public.tasks
  ADD COLUMN start_date date,
  ADD COLUMN end_date   date;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_dates_order_chk
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

COMMENT ON COLUMN public.tasks.start_date IS 'Gantt: начало задачи (nullable). S-GANTT-DATES-1.';
COMMENT ON COLUMN public.tasks.end_date   IS 'Gantt: конец задачи (nullable). Fallback на deadline::date — на уровне рендера. S-GANTT-DATES-1.';
```
НЕ применять (`supabase db push`/`migration up`) — уже в проде. Файл только для истории/локального reset.

## ЗАДАЧА 2 — Regen типов
```bash
npx supabase gen types typescript --project-id uoiavcabxgdjugzryrmj > src/types/supabase.gen.ts
```
Проверить: `grep -n "start_date\|end_date" src/types/supabase.gen.ts` — в tasks Row/Insert/Update
появились `start_date: string | null` / `end_date: string | null`. `entities.ts`/`database.ts` НЕ трогать
(Task derived). Обновить `docs/schema.md`: в таблицу tasks дописать 2 строки (start_date/end_date, nullable,
CHECK tasks_dates_order_chk, S-GANTT-DATES-1).

## ЗАДАЧА 3 — Zod (`src/lib/validators/task.ts`)
В `taskFormSchema` после строки `deadline: ...` добавить:
```ts
  start_date: z.string().nullable().default(null),
  end_date: z.string().nullable().default(null),
```
И обернуть весь `z.object({...})` в refine (зеркалит CHECK; строки дат сравниваются корректно):
```ts
export const taskFormSchema = z.object({
  // ...все поля...
}).refine(
  (d) => !d.start_date || !d.end_date || d.end_date >= d.start_date,
  { message: 'Конец не раньше начала', path: ['end_date'] },
);
```

## ЗАДАЧА 4 — TaskModal (`src/components/tasks/TaskModal.tsx`)
4.1 `useForm` defaultValues (после `deadline: null,`): добавить `start_date: null, end_date: null,`.

4.2 Обе ветки `reset(...)` в useEffect (edit и create) — добавить в объект:
```ts
        start_date: editTask.start_date ?? null,   // в edit-ветке
        end_date: editTask.end_date ?? null,
```
```ts
        start_date: null,                            // в create-ветке
        end_date: null,
```
(без `.slice` — это чистые даты, не datetime).

4.3 Разметка: сразу ПОСЛЕ блока `{/* Deadline */}` вставить парный блок (grid как у Company+Contact),
с `setValueAs` для коэрсии пустой строки в null (иначе '' упадёт в `date`-колонке):
```tsx
          {/* Gantt: план по датам */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Начало</label>
              <input
                type="date"
                {...register('start_date', { setValueAs: (v) => (v === '' ? null : v) })}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Конец</label>
              <input
                type="date"
                {...register('end_date', { setValueAs: (v) => (v === '' ? null : v) })}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              />
              {errors.end_date && (
                <p className="mt-1 text-xs text-red">{errors.end_date.message}</p>
              )}
            </div>
          </div>
```

## ЗАДАЧА 5 — optimistic в `src/lib/hooks/use-tasks.ts`
В `useCreateTask` → `onMutate` → литерал `const optimistic: Task = {...}` дописать (после `deadline:`):
```ts
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
```
(без этого tsc упадёт — Task получил 2 обязательных поля). Insert/Update pass-through уже несут даты — иная логика не нужна.

## ПРОВЕРКА
```bash
npx tsc --noEmit          # чисто (главный гейт — optimistic-литерал)
npm run build             # next build без ошибок
```
Ручной смок: создать задачу с началом > конца → Zod-ошибка «Конец не раньше начала» под полем «Конец»,
submit заблокирован. Создать с началом < конца → сохраняется. Оставить оба пустыми → сохраняется (null/null).
Edit существующей → даты подтягиваются. Проверить, что очистка даты (была → пусто) сохраняет null, не падает.

## КОММИТ
```bash
git add -A && git commit -m "feat(gantt): даты задачи (start/end) в TaskModal + миграция 046 в репо"
# НЕ пушить — пуш отдельным заходом после Gantt-трека (см. wave2-progress).
```

---

## Заметки гейта (Cowork)
- Типы derived — regen `supabase.gen.ts` пропагирует start/end в Task/Insert/Update; `entities.ts`/`database.ts` не трогать (случай `NotificationType` 045 был hand-authored union, здесь — derived-колонка).
- `optimistic: Task` собран перечислением полей → расширение типа требует дописать литерал, иначе tsc.
- `date`-колонка строгая: `''::date` = invalid input syntax → обязателен `setValueAs '' → null`.
- CHECK `tasks_dates_order_chk` — backstop; Zod-refine — дружелюбный гейт. Обход Zod → check_violation → throw → optimistic rollback.
- V0-1 (следующий шаг): fallback конца бара на deadline делать `(deadline AT TIME ZONE 'Europe/Moscow')::date` — `tasks.deadline` это timestamptz, голый `::date` кастует в UTC и съезжает на день.
