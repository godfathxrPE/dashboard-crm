# Ревью: S-ANALYTICS-1 — Task analytics MVP

**Дата:** 2026-07-23  
**Ревьюер:** Grok (верификация по коду `main`, schema.md, paths, learnings)  
**Объект:** `_analysis/sprint-S-ANALYTICS-1.md` — `completed_at` + RPC summary/throughput + секция на `/analytics`  
**Контекст:** `task-аналитика.md` + `review-task-аналитика.md`; миграция **072** (после 071); UI-only `S-TASKS-RESTRUCTURE-1` параллельно без DDL-конфликта.

**Шкала:** 0–100; **порог в Claude Code = 85**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА + executable tasks | ✅ |
| Миграция 072 свободна / не apply из CC | ✅ |
| `completed_at` + stamp после `trg_aa_resolve_board` | ✅ |
| Manager scope + `created_by` (фикс B3 ревью) | ✅ |
| DEFINER + `search_path` + ACL | ✅ |
| Формулы KPI зафиксированы | ✅ |
| UI extend `/analytics`, не rewrite M6 | ✅ |
| Out-of-scope / ЖЁСТКО НЕ ТРОГАТЬ | ✅ |
| SQL throughput week/MSK edge | 🟡 |
| Dual-path types stub | 🟡 |
| Helper `task_analytics_row_visible` surface | 🟡 |

**Оценка: 91/100 (GO).**  
Порог 85 пройден. Блокеров нет. Можно передавать в Claude Code; W* — на усмотрение до/во время CC, не стоп.

**Рекомендация:** **запускать в CC** на ветке `feat/task-analytics-1`. Миграцию **не** apply из CC.

---

## С чем согласен полностью

### 1. Executable sprint, не architecture brief

РАЗВЕДКА → ЗАДАЧА 1…6 → ЖЁСТКО НЕ ТРОГАТЬ → КОММИТ → гейт. Закрывает B1 прошлого ревью architecture.

### 2. Ядро 072

- `completed_at timestamptz` аддитивно.  
- `trg_ab_stamp_task_completed_at` после `trg_aa_resolve_board` (алфавит `ab` > `aa`) — совпадает с baseline order.  
- Reopen → null; stay-in-done не bump'ает stamp.  
- Backfill `updated_at` + `history_approx` — честно.

### 3. RBAC в RPC (фикс ревью)

`task_analytics_row_visible`: owner/admin/**viewer** org-wide; manager =  
`assigned_to ∨ created_by ∨ is_project_member` — зеркало `tasks_select` + member, без «дырки» created_by.

### 4. Product locks

Completion rate, backfill ≈, workload → B, export RBAC → C — зафиксированы. CC не должен переизобретать.

### 5. UI composition

`TaskAnalyticsSection` **сверху**; Calls / TasksDistribution / Pipeline / Export / WeeklyReview сохранены — закрывает W1 architecture.

### 6. Hooks / invalidate

`['task-analytics', …]` + invalidate из task mutations; `mskDateKey`; recharts dynamic — в конвенциях проекта.

### 7. Paths проверены live

| Путь | Статус |
|------|--------|
| `src/components/analytics/AnalyticsPage.tsx` | ✅ |
| `src/lib/utils/date-helpers.ts` (`mskDateKey`) | ✅ |
| `src/lib/hooks/use-org-role.ts` | ✅ |
| `is_project_member(uuid)` 065 | ✅ |
| migrations `070`/`071`, **072 свободна** | ✅ |
| `stamp_quote_status` 053 как образец stamp | ✅ |

---

## Блокеры

**Нет (B* = 0).**

---

## Предупреждения (не роняют ниже 85)

### W1. `date_trunc` / `generate_series` для week bucket

В `task_throughput_series` границы бакетов строятся через `date_trunc` на `timestamp` без явного `AT TIME ZONE 'Europe/Moscow'` на series, при том что фильтры строк — MSK. Риск: сдвиг «недели» на границах UTC/MSK.

**На гейте:** 1–2 смока с `p_from`/`p_to` вокруг воскресенья/понедельника MSK; при сдвиге — trunc в MSK:

```sql
date_trunc('week', (ts at time zone 'Europe/Moscow'))
```

CC может поправить SQL в файле миграции **до** apply (предпочтительно).

### W2. `task_analytics_row_visible` GRANT authenticated

Хелпер DEFINER + execute authenticated — низкий риск (boolean, org-scoped), но REST-поверхность лишняя.  
**Опционально:** `REVOKE … FROM authenticated` + вызывать только из summary/series (как internal); или оставить — симметрия `is_project_member`.

### W3. Types: dual path

«stub в gen **или** hand в database.ts» — CC может размазать.  
**Рекомендация в работе:** gen stub Functions + `completed_at` в tasks Row **и** hand interfaces в `database.ts` (summary shape) — как quotes.

### W4. Aging client vs RPC open_total

Для viewer RPC open_total = org, aging из `useTasks` = RLS-видимое. Подпись в sprint есть — CC обязан не смешивать без label.

### W5. UI без apply 072

Error state до гейта — ок. Не подменять mock KPI.

### W6. Опциональный log payload

ЗАДАЧА 5 best-effort — не раздувать scope; минимум `task_id` в существующем if.

---

## Пропущенные места

| Тема | Статус |
|------|--------|
| `idx_tasks_overdue` 051 дубль смысла | ✅ sprint не ломает |
| `dashboard-stats` | ✅ only invalidate рядом |
| Workload RPC | ✅ out of scope B |
| schema.md в CC | ✅ на гейте — верно |

Зазоров уровня «забыли файл, без которого CC встанет» — **нет**.

---

## Предлагаемые мелкие правки (не блокируют GO)

1. В SQL throughput — MSK-aware `date_trunc` (W1).  
2. Одна фраза в ЗАДАЧА 2: «обязательно: gen stub + database.ts interfaces».  
3. В гейт-чеклист: явный смок manager created_by-only task входит в count.

---

## crm-architect checklist

| Пункт | |
|-------|--|
| РАЗВЕДКА | ✅ |
| Реальные table/column | ✅ |
| Реальные paths | ✅ |
| learnings (DEFINER, NULL org, trigger order) | ✅ |
| Миграция file, не apply CC | ✅ |
| org_id / role scope | ✅ |
| SECURITY DEFINER + search_path + ACL | ✅ |
| CSS variables | ✅ (UI tasks) |
| schema.md after migration | ✅ гейт |
| Commit message | ✅ |

---

## Балльный разбор (прозрачность)

| Критерий | Макс | Факт |
|----------|------|------|
| Executable structure (разведка/задачи/out/commit) | 15 | 15 |
| Schema truth + migration number | 15 | 15 |
| Trigger/RPC security (DEFINER, ACL, scope) | 20 | 19 (−1 surface helper) |
| Product locks / formulas / RBAC vs live RLS | 15 | 15 |
| UI plan vs live `/analytics` | 15 | 14 (−1 aging label risk) |
| File inventory / no false paths | 10 | 10 |
| Gate / smoke completeness | 10 | 8 (−2 TZ series, types dual) |
| **Итого** | **100** | **91** |

---

## Чеклист перед CC

- [x] Оценка ≥ 85  
- [x] Нет открытых B*  
- [ ] Ветка `feat/task-analytics-1`  
- [ ] CC: разведка first, SQL file only, **no apply**  
- [ ] После CC: гейт apply + JWT-sim + types regen + schema.md  

---

## Итог

**91/100 — GO → Claude Code.**  
Мелкие W по TZ buckets и types — по желанию поправить в том же PR до apply.
