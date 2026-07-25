# Ревью: sprint-delivery-p3 (гейт завершения «Передача на поддержку»)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect: schema.md / architecture.md / learnings.md; live `src/`, `supabase/migrations/`, `docs/schema.md`)  
**Объект:** `_analysis/sprint-delivery-p3.md` — v2 (правки по `review/REVIEW-sprint-delivery-p3.md`, Grok 8.5/10, 4 блокера)  
**Контекст:** P1/P2a/P2b/P3 (035–038) + 039–046 + 048 уже в истории `main`; baseline `20260712230000`; коммиты P3: `1481ead` (SQL), `b830121` (UI), `ecbaed8` (schema Pending→Applied). Предыдущее ревью v1: `review/REVIEW-sprint-delivery-p3.md` (2026-07-12).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Качество промпта v2 (как design / audit trail) | ✅ 9/10 — S27-паттерн, org-гард, DETAIL-контракт, 2 коммита |
| Закрытие 4 блокеров прошлого ревью (§1–§11) | ✅ все приняты и **уже в коде** |
| Актуальность относительно live-репо (2026-07-16) | ❌ **полностью выполнен / устарел** |
| Безопасность повторного запуска в CC | ❌ **опасно — не запускать** |
| Schema truth (schema.md / baseline / archive) | ✅ P3 Applied 2026-07-12; объекты в baseline |
| РАЗВЕДКА / line numbers vs текущий код | ❌ команды частично валидны, **ожидаемое состояние 2026-07-12** |
| Нумерация миграции `038_…` | ❌ уже в `archive/` + baseline; следующий слот ≥049 |
| Frontend (хук / модалка / ромб / парсер) | ❌ уже реализован (+ Modal primitive, sonner) |

**Оценка: 9/10 как документ-история; 0/10 как исполнимый спринт «с нуля».**  
**Рекомендация: не запускать в Claude Code.** P3 закрыт. Повторный прогон `CREATE OR REPLACE copy_delivery_template` / перезапись UI / «Pending 038» в schema — регресс относительно прод-схемы и пост-P3 дельт (Gantt milestone, Modal, AUDIT A1 toast).

---

## Статус

| Заход | Статус в репо / проде |
|-------|----------------------|
| Миграция `038_delivery_completion_gate.sql` | ✅ `supabase/migrations/archive/038_…sql` (194 строки); объекты в `20260712230000_baseline.sql` |
| `tasks.is_milestone` + `idx_tasks_milestone` | ✅ baseline + `supabase.gen.ts` Row/Insert/Update |
| `copy_delivery_template` → перенос `is_milestone` | ✅ baseline:505–509 `…, is_milestone` / `tt.is_milestone` |
| Бэкфилл + `tt.org_id = p.org_id` | ✅ archive/038:80–88 |
| `check_delivery_completion` + ACL REVOKE anon | ✅ baseline + archive; GRANT authenticated+service_role |
| `enforce_delivery_completion` + `trg_zz_delivery_completion_gate` | ✅ baseline:588+, trigger:2666 |
| `docs/schema.md` / crm-architect schema | ✅ блок «Delivery-P3 (038, **Applied 2026-07-12**)» |
| `useDeliveryGate` + типы OpenMilestone/DeliveryGateResult | ✅ `src/lib/hooks/use-delivery-gate.ts` |
| `parseDeliveryGateError` | ✅ `use-projects.ts:34–40` (+ `isGateError` в `src/lib/errors.ts`) |
| Инвалидация `['delivery-gate']` в `useUpdateTask` | ✅ `use-tasks.ts:280–282` (и delete ~396) |
| `DeliveryCompletionModal` + replace `confirm()` | ✅ `src/components/projects/DeliveryCompletionModal.tsx`; `ProjectDetail.tsx:361–368, 862–863` |
| Milestone-ромб `Diamond` в TaskCard | ✅ `TaskCard.tsx:125–132`, `phaseMode && task.is_milestone` |
| Коммиты (2, как в спринте) | ✅ `1481ead` SQL; `b830121` UI — **ancestors of HEAD** |
| Гейт Cowork / schema flip | ✅ `ecbaed8` Pending→Applied; смоуки 1–9 в schema history |
| Ветка шапки «main» | ✅ текущая `main` (ahead origin на 2 локальных коммита, не P3) |
| Пост-P3 потребители `is_milestone` | ✅ Gantt (`use-project-schedule.ts`), фильтр milestones — **не ломать** |

---

## С чем согласен полностью (как с *историческим* дизайном v2)

### 1. Доменное решение Олега

Шаблон-агностичный гейт по `is_milestone` (не по имени фазы «Передача на поддержку»): ERP = 6 вех, IIoT launch = 3 (4.2/4.3/4.5), experiment = 0 → free complete. Reopen completed→open не блокируется. Совпадает с live SQL (`enforce`: только `open→completed` + `type='delivery'`).

### 2. Двухуровневый enforcement (S27)

`check_delivery_completion` (UI) + `trg_zz_delivery_completion_gate` (backstop) — дословно в archive/038 и baseline. `message = 'delivery_gate_failed'`, DETAIL = jsonb-массив вех, `ERRCODE = 'P0001'`.

### 3. Правки ревью v1 — все вошли в v2 и в код

| Правка v1 | В спринте v2 | В live-коде |
|-----------|--------------|-------------|
| §1 колокация модалки (нет `modals/`) | ✅ ЗАДАЧА 4 | `DeliveryCompletionModal.tsx` рядом с ProjectDetail |
| §2 invalidate `delivery-gate` | ✅ ЗАДАЧА 3 | `use-tasks.ts:282` |
| §3 error-контракт как S27 | ✅ 1.5 | archive/038:175–176 |
| §4 бэкфилл `tt.org_id = p.org_id` | ✅ 1.3 | archive/038:86 |
| §5 org-гард `is_org_member` | ✅ 1.4 | archive/038:120–122 |
| §6 GRANT service_role + REVOKE anon | ✅ 1.4 | archive/038:149–150 |
| §7 TaskCard + Diamond + phaseMode | ✅ ЗАДАЧА 5 | `TaskCard.tsx:125–132` |
| §9 onError + alert в модалке | ✅ ЗАДАЧА 4 | `DeliveryCompletionModal.tsx:69–81, 120–121` |
| §10 ERP 6 вех в смоках | ✅ тест 6 | schema smokes 1–9 |
| §11 два коммита | ✅ | `1481ead` + `b830121` |

### 4. Конвенции crm-architect

- Миграция файлом, apply — гейт Cowork (не CC) — соблюдено.  
- `SECURITY DEFINER SET search_path = public, pg_temp`.  
- REVOKE PUBLIC+anon (урок P1).  
- `trg_zz_*` после `trg_aa_*` / sync (алфавит BEFORE).  
- CSS/tokens: `text-accent`, Lucide, не emoji.  
- CSS variables / theme — без hardcoded palette в P3 UI.

### 5. Историческая разведка (на дату v1/v2)

На 2026-07-12 утверждения были верны: `copy` терял `is_milestone`, `confirm()` на complete, нет toast, нет `modals/`. Сегодня эти «дыры» — закрытый audit trail.

---

## Блокеры (критично — **не** запускать)

### B1. Работа P3 уже смержена — повторный прогон = регресс

**Evidence:**

| Артефакт | Путь / факт |
|----------|-------------|
| Archive migration | `supabase/migrations/archive/038_delivery_completion_gate.sql` |
| Baseline | `check_delivery_completion`, `enforce_delivery_completion`, `idx_tasks_milestone`, trigger `trg_zz_delivery_completion_gate` |
| schema | `docs/schema.md` § Delivery-P3 Applied 2026-07-12; crm-architect `schema.md:983–1009` |
| Hooks/UI | `use-delivery-gate.ts`, `DeliveryCompletionModal.tsx`, `parseDeliveryGateError`, diamond в TaskCard |
| Git | `1481ead`, `b830121` ⊂ ancestors of `HEAD` on `main` |

**Если CC выполнит спринт «как есть»:**

1. Создаст **второй** `supabase/migrations/038_…sql` поверх archive/baseline-конвенции (active chain: 040–046, 048; gap 047; next free **049+**).  
2. `CREATE OR REPLACE copy_delivery_template` телом «036 + is_milestone» — риск отката любых пост-038 правок тела (сейчас baseline = 038-тело; 044 только *зовёт* copy, не переписывает — но OR REPLACE всё равно опасен как привычка).  
3. Перепишет `ProjectDetail` / `use-tasks` / типы, задев Gantt, Modal primitive, sonner/A1.  
4. Откатит `docs/schema.md` в «Pending 038» при уже Applied.

**Действие:** статус **DONE** в шапке спринта (ручная правка вне CC) или перенос в `_analysis/_to_delete` / archive handoffs. **Не** отдавать в Claude Code.

### B2. РАЗВЕДКА описывает pre-P3 мир — CC «починит» то, чего нет

| Утверждение спринта | Live (2026-07-16) |
|---------------------|-------------------|
| «P3 начинается с переноса флага» | Флаг уже в `tasks` / gen types / baseline |
| `ProjectDetail.tsx:472–483` — `confirm()` + complete | Complete: `setCompleting(true)` ~363; modal ~862; `confirm()` остался только для delete/reopen-стадий |
| `gateBlock` :710–734 | `gateBlock` ~615–640 (сдвиг строк) |
| `useUpdateTask` onSettled ~266 — «добавить invalidate» | Уже есть `:280–282` с комментарием P3 |
| `database.ts` — рукописный блок `tasks: {` | `database.ts` = re-export `supabase.gen.ts` + custom; `is_milestone` в gen |
| «Toast-библиотеки нет» | **`sonner`** в `package.json`; глобальный toast в `QueryProvider` (AUDIT A1); modal **осознанно** silent для non-gate ошибок |
| Миграции «035–037 applied», работа = 038 | **001–046 (+038) applied**; active files 040–048 |

Разведка **без** шагов «уже есть? archive/038? baseline? use-delivery-gate?» — для CC 2026-07-16 это инструкция к blind rewrite.

### B3. Конфликт нумерации миграции

Спринт: `supabase/migrations/038_delivery_completion_gate.sql`.  
Факт: 038 в **archive**; active directory: 040–046, 048, baseline. Дубль номера + «IF NOT EXISTS / OR REPLACE» не делают прогон безопасным для UI-задач 2–5.

---

## Предупреждения (если спринт трогать только как документ)

### W1. Line numbers в РАЗВЕДКЕ — исторические

Команды `grep "Завершить проект"` / `head TaskModal` всё ещё полезны как *навигация*, но `sed -n '705,735p'` / `:472–483` / `database.ts tasks: {` введут в заблуждение. Для archive-доки — норма; для runnable — нет.

### W2. Образец модалки сменился

Спринт: «образец TaskModal / [data-modal]».  
Live: `DeliveryCompletionModal` на **`@/components/shared/Modal`** (AUDIT A1: isDirty-guard, viewport-fit, focus). Паттерн лучше, чем ad-hoc TaskModal — при любом *новом* гейте копировать `DeliveryCompletionModal` + shared Modal, не TaskModal.

### W3. Типы: gen, не ручной `tasks` block

Спринт ЗАДАЧА 2: «database.ts вручную, НЕ regen».  
Сейчас truth = `supabase.gen.ts` (+ thin `database.ts`). `is_milestone` уже в gen. Hand-edit gen — anti-pattern; custom interfaces gate-результата — правильно рядом с хуком (как сделано).

### W4. Toast vs alert — нюанс A1

Спринт верно запретил toast **для gate DETAIL**. Live: gate → `role="alert"` в модалке; прочие ошибки → global sonner. Не регрессировать в «вообще нет toast» при документации.

### W5. architecture.md crm-architect

Явных путей `DeliveryCompletionModal` / `use-delivery-gate` в architecture.md **нет** (schema покрывает). Не блокер для DONE-спринта; при следующем sync skill — добавить 2–3 строки в дерево components/hooks.

### W6. Ветка / «роль Cowork»

Шапка: ветка main, миграцию пишет CC, apply — Cowork. Исторически верно. Сегодня apply уже был; повтор «pending 038» ломает schema truth.

---

## Пропущенные места (grep gaps, если бы гоняли «доделать»)

| Файл | Строки / факт | Действие при «с нуля» |
|------|---------------|------------------------|
| `archive/038_…sql` + baseline | полный SQL P3 | **не** создавать заново |
| `src/lib/hooks/use-delivery-gate.ts` | 1–61 | уже есть |
| `src/components/projects/DeliveryCompletionModal.tsx` | full | уже есть |
| `src/lib/hooks/use-projects.ts` | `parseDeliveryGateError` | уже есть |
| `src/lib/hooks/use-tasks.ts` | 280–282, ~396 | invalidate уже |
| `src/components/tasks/TaskCard.tsx` | 125–132 | Diamond уже |
| `src/components/projects/ProjectDetail.tsx` | 163, 361–368, 862–863 | completing + modal |
| `src/lib/errors.ts` | `delivery_gate_failed` в `isGateError` | пост-P3; не затирать |
| `src/lib/hooks/use-project-schedule.ts` | `isMilestone` | Gantt consumer |
| `src/types/supabase.gen.ts` | tasks.is_milestone | gen truth |
| `package.json` sonner | toast stack | не утверждать «нет toast» |

**Пропущенных implementation-gap’ов нет** — scope спринта закрыт end-to-end.

---

## Предлагаемые правки в спринт (только документальные, не CC)

1. **Шапка:** статус `DONE / Applied 2026-07-12` + ссылки на коммиты `1481ead`, `b830121`, `ecbaed8`.  
2. **Первая строка после контекста:** «Не запускать в Claude Code — P3 в `main` и baseline.»  
3. **РАЗВЕДКА:** заменить на «verification-only» checklist (`rg is_milestone`, `ls archive/038`, `test -f use-delivery-gate.ts`) вместо edit-oriented sed.  
4. **Опционально:** пометить файл как historical handoff рядом с `review/REVIEW-sprint-delivery-p3.md` и этим ревью.

Код/миграции **не** править «по этому спринту».

---

## Чеклист crm-architect (condensed) — оценка *исторической* спеки

- [x] Есть РАЗВЕДКА (команды до кода) — да, но **устарела**  
- [x] Реальные table/column names (`tasks.is_milestone`, RPC, trigger)  
- [x] learnings: S27 gate vs automation EXCEPTION, REVOKE anon, `trg_zz_*`  
- [x] SQL отдельным файлом; apply не из CC  
- [x] org boundary: `is_org_member(v_project.org_id)`, не `current_org_id()`  
- [x] SECURITY DEFINER + search_path + ACL  
- [x] schema.md update + flip after gate  
- [x] CSS tokens / CVD (форма+цвет Diamond)  
- [ ] **Runnable 2026-07-16** — **FAIL** (уже applied)

---

## Чеклист перед CC

- [ ] **Стоп:** не запускать этот файл в Claude Code  
- [ ] При необходимости — только ручная пометка DONE в markdown (вне CC)  
- [ ] Новые фичи вокруг completion-gate: форкать **live** `DeliveryCompletionModal` + archive/038 + schema §P3, не этот runnable-checklist  
- [ ] Следующая миграция: **049+** (не 038)  
- [ ] Не коммитить «повтор P3»; не force-apply 038 на прод

---

## Итог

Спринт **v2 — сильный historical handoff**: все 4 блокера v1 закрыты, SQL/UI 1:1 с archive и прод-схемой, смоуки и Applied-статус зафиксированы. Как **задача для Claude Code на 2026-07-16 — блокер B1**: P3 уже в `main`, baseline и UI; повторный прогон опасен. **Вердикт: не запускать.**
