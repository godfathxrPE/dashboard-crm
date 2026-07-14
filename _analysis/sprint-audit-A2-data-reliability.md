# Claude Code Prompt — Sprint AUDIT-A2: «Данные не врут»

По AUDIT-2026-07-12 (1.5, 1.6, 2.2, 2.9, 3.5, 3.9). После A1 (нужен toast). Ветка: main.
Одна миграция (039_reorder_tasks) — НЕ применять, гейт у Cowork.

## РАЗВЕДКА
```bash
cat src/lib/hooks/use-realtime.ts
grep -rn "useRealtimeSync" src/ | head -12          # все подписчики
grep -n -B3 -A15 "arrayMove" src/components/tasks/KanbanBoard.tsx
sed -n '160,210p;320,330p' src/components/migration/ExcelImport.tsx 2>/dev/null || find src -name "ExcelImport.tsx"
sed -n '30,75p' src/components/shared/EditableCell.tsx 2>/dev/null || grep -rn "EditableCell" src -l
grep -n "dashboard-stats" src -r
grep -n "'timeline'" src/lib/hooks/*.ts src/components -r | head
sed -n '110,125p' src/components/calls/CallModal.tsx  # UTC-баг 3.9
```

## ЗАДАЧА 1: realtime — менеджер подписок с refcount (1.5)

use-realtime.ts: module-level `Map<string, { channel, refs }>`.
- subscribe: если канал есть — refs++; нет — создать `realtime-${table}` ОДИН раз с одним binding.
- cleanup: refs--; `removeChannel` только при refs===0.
- Инвалидация: колбэки подписчиков в Set на записи Map (каждый хук кладёт свой
  `invalidateQueries`), binding один, рассылка всем. Это чинит и дубли bindings, и смерть
  канала при unmount одного подписчика.
- Мёртвый параметр `_queryKey` — задействовать (ключ для колбэка) или удалить из сигнатуры
  (сигнатура используется в N файлов — сверь grep'ом, правь все вызовы).
- Reconnect после сна: на статус `CHANNEL_ERROR`/`TIMED_OUT` — resubscribe с бэкоффом.

## ЗАДАЧА 2: kanban drop = одна мутация (2.2)

Миграция `supabase/migrations/039_reorder_tasks.sql` (НЕ применять):
```sql
CREATE OR REPLACE FUNCTION public.reorder_tasks(p_moves jsonb)
RETURNS void ... SECURITY DEFINER SET search_path = public, pg_temp
-- p_moves: [{"id": uuid, "lane": text, "sort_order": int}, ...]
-- гард: все задачи из p_moves принадлежат org вызывающего (is_org_member по org_id задач,
--   одним запросом; при чужой задаче — RAISE 42501); UPDATE одним стейтментом FROM jsonb_to_recordset.
-- REVOKE PUBLIC, anon; GRANT authenticated, service_role. (Урок: явный REVOKE anon.)
```
KanbanBoard: заменить forEach-mutate на ОДНУ мутацию `useReorderTasks` (rpc) с одним
optimistic-снапшотом (cancel → снимок → перестановка в кеше → rollback целиком).
Инвалидации как в useUpdateTask (tasks + projects при lane + delivery-gate).

## ЗАДАЧА 3: ExcelImport перестаёт врать (1.6)

- Каждый insert/update/upsert: проверка `error` → строка в отчёт ошибок, БЕЗ `newCo!.id`.
- `executeImport` в try/catch; финальный отчёт: «импортировано N, ошибок M (строки: …)»,
  toast + список в UI. Режим: skip-and-continue (не останавливаться на первой).
- Прогресс-стейт сбрасывается в finally.

## ЗАДАЧА 4: мелочь надёжности
- EditableCell (3.5): Enter → blur вызывает два PATCH — guard (submitted-флаг или отписка
  blur после Enter); reject ловить (toast через global onError).
- CallModal UTC (3.9, строки ~117,119): дефолт даты/времени и done/pending — локальное время,
  паттерн `localDateKey` из date-helpers (как чинили июньские 10 мест).
- Инвалидация (2.9): `['dashboard-stats']` инвалидировать в мутациях calls/meetings/tasks/projects;
  `['timeline', ...]` — в мутациях calls/meetings/tasks (сверь точный key-формат по ProjectDetail:186).

## Тест-сценарии
1. Открыть /tasks в двух вкладках → уйти со страницы в одной → realtime во второй ЖИВ (создать
   задачу третьей сессией/SQL — прилетает).
2. Drop карточки через 3 позиции → в Network ОДИН запрос; порядок стабилен после рефетча.
3. Excel с намеренно битой 3-й строкой → импорт доходит до конца, отчёт «N ok / 1 fail (стр. 3)».
4. Enter в EditableCell → один PATCH.
5. Звонок в 00:30 МСК — дата сегодняшняя.
6. Создал сделку → KPI overview обновились без reload.
7. tsc/build зелёные.

## КОММИТЫ (два)
```
git add supabase/migrations/039_reorder_tasks.sql docs/schema.md
git commit -m "feat(tasks): bulk reorder_tasks RPC (039, pending) (AUDIT A2.2)"
git add src/
git commit -m "fix(data): realtime refcount-менеджер, ExcelImport error-handling, kanban bulk-мутация, UTC/EditableCell/инвалидации (AUDIT A2)"
```

## VERIFICATION (ожидаемое)
Type Safety: WARNING | RLS Coverage: WARNING (039 — advisors на гейте) |
Backward Compat: PASS-план | Runtime: NOT_VERIFIED | Regional: NOT_APPLICABLE
