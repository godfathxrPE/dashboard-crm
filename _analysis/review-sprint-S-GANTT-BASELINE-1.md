# Ревью: S-GANTT-BASELINE-1 — базовый план + ghost plan/fact

**Дата:** 2026-07-25 (re-review после правок спринта)  
**Ревьюер:** Grok (код `main`, 067 RLS mirror, effectiveSpan, migrations 072/073, hard-delete convention)  
**Объект:** `_analysis/sprint-S-GANTT-BASELINE-1.md` (версия с hard delete, 074, effectiveSpan, GRANT)  
**Контекст:** первая миграция gantt-волны; аддитивно; UI ghost на `GanttTimeline`.

**Шкала:** 0–100; **≥ 85 = GO в Claude Code**. B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + номер **074** (после 073) | ✅ |
| Hard delete (без `deleted_at`) | ✅ закрыт B1 v1 |
| Нет `tasks.deleted_at` в RPC | ✅ закрыт B2 v1 |
| GRANT select/delete authenticated | ✅ закрыт B3 v1 |
| `created_by → profiles` | ✅ |
| effectiveSpan / deadline-only в слепке | ✅ = `use-project-schedule.ts` |
| SELECT = зеркало 067 (не org-wide) | ✅ |
| `project_id` на `baseline_tasks` | ✅ |
| RPC DEFINER + no client INSERT | ✅ |
| Иммутабельность (нет UPDATE policies) | ✅ |
| UI ghost / tasks folder / canManage | ✅ |
| CC не apply | ✅ |
| RPC create без visibility-гарда | 🟡 |
| `baseline_tasks_select` как placeholder | 🟡 |
| Types до apply | 🟡 |

**Оценка: 91/100 (GO).**  
Порог **85** пройден. Открытых **B\*** нет. Можно в Claude Code.

**Рекомендация:** **запускать в CC** на `feat/gantt-baseline-1`. Миграцию **не** apply из CC. Желательно закрыть W1–W2 в том же PR (не блокируют старт).

---

## Что изменилось с прошлого ревью (74 → 91)

| Было (B*) | Сейчас |
|-----------|--------|
| soft-delete `deleted_at` | **hard DELETE** + CASCADE; rationale vs 067 |
| `tasks.deleted_at is null` в RPC | **убрано**, явный запрет в тексте |
| нет GRANT | `grant select, delete` / `select` + revoke anon |
| `created_by → auth.users` | **`profiles` SET NULL** |
| snapshot только start/end | **deadline MSK + clamp** как effectiveSpan |
| org-wide SELECT | **зеркало 067** + `project_id` denorm |
| `0NN` | **074** + re-check `ls` |

Все три блокера v1 закрыты содержательно, не косметикой.

---

## С чем согласен полностью

### 1. Hard delete + immutability

Нет UPDATE-политик → нельзя «подправить имя/даты плана» через RLS.  
Переснять = новый baseline. Физический DELETE header → CASCADE rows. Совпадает с 067/066/quotes.

### 2. effectiveSpan в RPC

Live:

```ts
start = start_date ?? end_date ?? dl
end   = end_date ?? dl ?? start_date; if (end < start) end = start
```

SQL `coalesce` + `greatest(...)` — эквивалент; smoke **7a** обязателен. Закрывает главный plan/fact bug.

### 3. Visibility ≠ org-wide

Предикат = `project_messages_select` (067 L32–45): owner/admin org ∨ project ownership ∨ `is_project_member`.  
Денормализация `baseline_tasks.project_id` — правильная цена, без join на SELECT.

### 4. Write path = only RPC

Нет INSERT policies + нет INSERT grant → пустой header клиентом невозможен. DEFINER + `search_path` + revoke anon/public.

### 5. Triggers explicit

054 loop не кроет новые таблицы — `set_org_id` + `freeze_org_id` на обеих — верно.

### 6. UI / process

`components/tasks/`, tokens only, gate apply + gen-types + advisors + JWT — ок.

---

## Блокеры

**Нет.**

---

## Предупреждения (не роняют ниже 85)

### W1. RPC create шире, чем SELECT / UI canManage

```sql
-- только org + role manager+
exists (projects where id = p and org_id = current_org_id())
```

Нет `is_project_member` / ownership. Org-manager может `rpc` по UUID **чужого** проекта (IDOR write: плодит baselines, которые сам не прочитает, но admin увидит).  
UI режет `canManage` — дыра только в прямом RPC.

**Рекомендация (1 SQL-блок в RPC после role-check):**

```sql
-- visibility mirror (fail closed)
if coalesce(current_org_role(),'') not in ('owner','admin')
   and not exists (
     select 1 from projects p
     where p.id = p_project_id
       and (p.owner_id = auth.uid() or p.created_by = auth.uid()
            or public.is_project_member(p.id))
   ) then
  raise exception 'forbidden' using errcode = '42501';
end if;
```

Или: create только `canManage`-эквивалент. Не блокер MVP, если принять «как tasks_insert org-wide».

### W2. `baseline_tasks_select` — placeholder в промпте

```sql
using ( /* тот же предикат, что выше, по своему project_id */ );
```

CC обязан **вставить полный SQL**, не оставить комментарий. Риск copy-paste miss.

**Фикс в спринте:** продублировать полный `using (...)` 1:1 с header policy.

### W3. Types «не трогать до apply»

`.from('project_baselines')` / rpc name → tsc на `Database` упадёт до gen.  
Варианты: (a) hand-stub Tables+Functions в gen до apply (quotes pattern); (b) commit hooks after gate gen; (c) cast `as any` временно — хуже.

Явно: **stub минимальный в gen или database.ts Args**, иначе VERIFY tsc красный в CC-ветке.

### W4. NULL-safe `current_org_id()`

`p.org_id = current_org_id()` при NULL → not exists → 42501 (deny). Ок.  
Learnings-стиль: явный `IF current_org_id() IS NULL THEN RAISE` — optional.

### W5. `grant execute` только authenticated

Паттерн многих RPC; `service_role` optional для gate scripts.

### W6. Empty name

`trim(p_name)` + CHECK length → 23514; UI должен ловить до RPC (toast). Мелочь.

### W7. schema.md

Обновить на **гейте** после apply (skill + docs) — добавить в gate checklist явно.

---

## Разведка live (re-verify 2026-07-25)

| Claim | Live |
|-------|------|
| 073 last numeric, 074 free | ✅ `073_fix_spawn…`, no 074 file |
| `tasks.deleted_at` | ✅ **нет** |
| hard-delete convention | ✅ 067 comment |
| effectiveSpan formula | ✅ `use-project-schedule.ts` L37–43 |
| 067 SELECT predicate | ✅ matches sprint |
| `ROW_H = 1.75rem` | ✅ GanttTimeline |
| `profiles` created_by | ✅ 066/069 |
| `freeze_org_id` / `set_org_id` | ✅ 054/069 |

---

## crm-architect checklist

| Пункт | |
|-------|--|
| РАЗВЕДКА | ✅ |
| Real table/column names | ✅ |
| Real paths (tasks UI) | ✅ |
| learnings hard-delete / DEFINER / org-first | ✅ |
| Migration file, not apply from CC | ✅ |
| SECURITY DEFINER + search_path + ACL | ✅ |
| RLS org first + role / membership | ✅ (read); write RPC W1 |
| CSS variables | ✅ UI |
| schema.md after migration | 🟡 gate |
| Commit message | ✅ |

---

## Балльный разбор

| Критерий | Макс | Факт |
|----------|------|------|
| Executable structure | 15 | 15 |
| Data model / hard-delete / immutability | 15 | 15 |
| SQL truth (columns, span, grants, 074) | 25 | 24 (−1 placeholder policy) |
| RLS / DEFINER / visibility | 20 | 17 (−3 RPC create width) |
| Hooks / UI plan | 15 | 13 (−2 types-before-apply) |
| Verify / gate / smoke | 10 | 10 |
| **Итого** | **100** | **91** |

---

## Чеклист перед CC

- [x] Оценка ≥ 85  
- [x] Нет открытых B*  
- [ ] Ветка `feat/gantt-baseline-1`  
- [ ] РАЗВЕДКА: `ls migrations | tail` → confirm 074 still free  
- [ ] Полный текст `baseline_tasks_select` (W2)  
- [ ] (жел.) visibility-гард в RPC (W1)  
- [ ] (жел.) type stub until gate gen (W3)  
- [ ] Миграцию **не** apply из CC  

---

## Итог

**91/100 — GO → Claude Code.**  

Предыдущий **74 NO-GO** снят: hard delete, no `tasks.deleted_at`, GRANTs, profiles FK, effectiveSpan, project-scoped RLS, 074.  
Остаются warnings (RPC create scope, полный SELECT SQL, types stub) — править по желанию в том же PR.
