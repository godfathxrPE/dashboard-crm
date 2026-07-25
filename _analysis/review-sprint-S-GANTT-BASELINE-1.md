# Ревью: S-GANTT-BASELINE-1 — базовый план + ghost plan/fact

**Дата:** 2026-07-25  
**Ревьюер:** Grok (код `main`, schema/learnings hard-delete, migrations 072/073, Gantt ROW_H)  
**Объект:** `_analysis/sprint-S-GANTT-BASELINE-1.md`  
**Контекст:** первая **миграция** gantt-волны; аддитивные таблицы; UI ghost-bars на `GanttTimeline`.

**Шкала:** 0–100; **≥ 85 = GO**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (номер миграции с диска) | ✅ идея / 🟡 номер |
| WHY / product (plan vs fact) | ✅ |
| RPC атомарный слепок DEFINER | ✅ идея |
| RLS org-first + role | ✅ скелет |
| Soft-delete `deleted_at` | ❌ **B1** vs конвенция hard-delete |
| SQL `tasks.deleted_at` | ❌ **B2** колонки нет → apply 42703 |
| GRANT authenticated на таблицы | ❌ **B3** не выписан |
| `created_by` → auth.users vs profiles | 🟡 |
| Snapshot only start/end (не deadline) | 🟡 |
| freeze_org_id / set_org_id | ✅ |
| UI ghost + canManage | ✅ paths |
| Types until after apply | ✅ process |
| CC не apply | ✅ |

**Оценка: 74/100 (NO-GO).**  
Продукт и RPC-идея верные; **три блокера SQL/конвенции** — в CC нельзя.

**Рекомендация:** переписать миграционный каркас (hard-delete **или** явный exception + fix tasks filter + GRANTs + FK profiles) → re-review.

---

## С чем согласен

1. **Baseline как иммутабельный слепок** + «переснять = новый» — правильная модель.  
2. **RPC `create_project_baseline`** (один INSERT…SELECT) — клиент не собирает N inserts; baseline_tasks без client INSERT.  
3. **RBAC matrix** create manager / soft-delete owner-admin — ок как product (если soft-delete останется).  
4. **Ghost bar** в той же строке, `ROW_H = 1.75rem` live, bucket math reuse — верно.  
5. **Модалка в `components/tasks/`** — learnings (не `modals/`).  
6. **CC не apply + gate advisors/JWT** — process ok.  
7. **Независимость от 1B/CPM по коду** — ок.

---

## Блокеры

### B1. Soft-delete ломает hard-delete конвенцию проекта

В проекте **нет** `deleted_at` tenant-паттерна (messages/videos/quotes/deps — **hard delete** + CASCADE; explicit comments «Hard delete»).  
S-QUOTE-1: *«soft-delete в проекте НЕТ ни у одной таблицы; не вводить одинокий deleted_at»*.

Baseline вводит **первый** soft-delete только на `project_baselines`.

**Варианты (выбрать один в спринте):**

| A (рекоменд. default) | Hard DELETE header → CASCADE `baseline_tasks`; RLS delete owner/admin; manager без delete |
| B | Soft-delete **exception** с абзацем «почему только здесь» + restore policy / partial unique name |

Без явного выбора — NO-GO.

### B2. `tasks.deleted_at` в RPC — колонки нет

Live `tasks`: hard rows, **нет** `deleted_at` (046 dates, schema.md).  
SQL:

```sql
and t.deleted_at is null  -- 42703 на apply
```

Спринт в note говорит «убрать если нет» — **в теле RPC условие всё равно стоит**. CC/гейт упадут, если скопируют каркас.

**Фикс:** убрать условие **сейчас** в тексте спринта (не «если»).

### B3. Нет GRANT на таблицы для `authenticated`

Только `revoke … from anon`. Без:

```sql
grant select, update on public.project_baselines to authenticated;
grant select on public.baseline_tasks to authenticated;
-- insert/delete baseline_tasks: no client (RPC DEFINER)
-- insert project_baselines: via RPC only → grant insert optional / none
```

Иначе SELECT из клиента 42501/permission denied даже при RLS policy.

Также: `grant execute … to authenticated` — добавить **`service_role`** (паттерн helpers) по желанию.

### B4 (связанный). Свободный номер миграции = **074+**

На диске уже:

- `072_task_analytics.sql`  
- `073_fix_spawn_delivery_project_stage.sql`  

`0NN` + «смотри disk» ок, но в спринт-шапке/коммите явно: **следующая ≥ 074**.  
Не блокер логики, но риск коллизии с параллельными ветками — **W→B soft**: считать **W0**, не cap, если CC реально `ls | tail`.

(Не поднимаю cap — РАЗВЕДКА это ловит.)

---

## Предупреждения

### W1. `created_by` → `auth.users` vs `profiles`

Конвенция свежих таблиц: `references public.profiles(id) on delete set null default auth.uid()` (066/069).  
`auth.users` работает, но расходится с `entities`/FK-картой. **→ profiles.**

### W2. Deadline-only задачи

Gantt `effectiveSpan` = `start_date ?? end_date ?? deadline(MSK)`.  
RPC копирует **только** `start_date`/`end_date` → задачи «только deadline» на Ганте есть, в baseline **нет** → ложный «вне плана» / нет ghost.

**Фикс snapshot:**

```sql
coalesce(t.start_date, t.end_date, (t.deadline at time zone 'Europe/Moscow')::date),
coalesce(t.end_date, t.start_date, (t.deadline at time zone 'Europe/Moscow')::date)
```

(или явный product: «в план только explicit gantt dates»).

### W3. UPDATE policy слишком широкая

Owner/admin UPDATE любой колонки (name rewrite) — бьёт «иммутабельный план».  
Лучше: update только `deleted_at` (check) или separate soft-delete RPC.

### W4. NULL-safe org в RPC

`p.org_id = current_org_id()` при NULL org → 0 rows → 42501 (deny). Acceptable.  
Жёстче learnings: явный `IF current_org_id() IS NULL THEN RAISE`.

### W5. Ownership project

RPC не проверяет `canManage`/project membership — любой org manager snapshot **любого** org project (как tasks_insert org-wide). Product ok if intentional; иначе mirror projects_select.

### W6. Types «не трогать до apply»

Ok для gate; UI до apply сломается на rpc types — hand-stub Functions как quotes **или** feature-flag. Уточнить.

### W7. `freeze` trigger names

054 auto-loop не покрывает **новые** таблицы автоматически. Явные triggers в миграции — обязательны (спринт есть) — ✅.

---

## Пропущенные / ложные

| Тема | |
|------|--|
| `ROW_H` / Gantt path | ✅ |
| `html2canvas` | N/A |
| Indexes partial `deleted_at is null` | ok if soft-delete kept |
| Multiple baselines UI | v1 one select — ok |
| schema.md update | на гейте — добавить в чеклист |

---

## Предлагаемые правки (минимум к GO)

1. **B1:** hard DELETE **или** documented soft-delete exception.  
2. **B2:** убрать `tasks.deleted_at` из SQL.  
3. **B3:** GRANT select/(update) authenticated.  
4. **W1:** `created_by → profiles`.  
5. **W2:** snapshot effective dates (deadline fallback) **или** explicit copy.  
6. Имя файла: `074_project_baselines.sql` (после `ls`).  
7. WITH CHECK на update = using (или только deleted_at).

---

## Баллы

| Критерий | Макс | Факт |
|----------|------|------|
| Structure / process (no apply) | 15 | 14 |
| Data model / product | 15 | 12 (−3 soft-delete conflict) |
| SQL truth (tasks columns, grants) | 25 | 10 (−15 B2/B3) |
| RLS / DEFINER / ACL design | 20 | 14 (−6 soft+grants) |
| Hooks / UI plan | 15 | 14 |
| Verify / gate | 10 | 10 |
| **Итого** | **100** | **74** |

---

## Чеклист перед CC

- [ ] B1–B3 closed in sprint markdown  
- [ ] W1–W2 decided  
- [ ] Migration number ≥ 074 verified on disk  
- [ ] Re-score ≥ 85  

**Итог: 74/100 NO-GO — не в Claude Code.**
