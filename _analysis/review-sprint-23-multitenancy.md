# Ревью: Sprint 23 — Мультитенантность (схема, без смены RLS)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, archive 021/022, baseline, `docs/schema.md`, learnings)  
**Объект:** `_analysis/sprint-23-multitenancy.md` — schema-only multitenancy: `organizations` + `memberships` + `org_id` на tenant-таблицы  
**Контекст:** Фаза multi-user S23–S26 **уже в проде** (с 2026-07-05); живая цепочка до **046**; архив `001–039` + baseline `20260712230000`; S24 org-RLS, S25 RBAC, S26 invites/notifications применены

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** |
| РАЗВЕДКА в промпте | 🟡 Ок для «~020», **ложна для `main` 2026-07-16** |
| SQL 021 в промпте vs applied archive | ❌ Self-ref RLS → 42P17; нет `search_path`/ACL/`is_org_member` |
| SQL 022 (backfill + trigger) | 🟡 Идея верна; applied-версия hardened |
| Scope (не трогать RLS / hooks / validators) | ✅ Было правильно для S23 |
| Номера миграций 021/022 | ❌ Конфликт с archive + baseline; next free ≠ 021 |
| Типы / `docs/schema.md` | ✅ Уже сделаны (и сильно дальше) |
| Smoke SQL (`tasks.user_id, title`) | ❌ Колонок нет: `created_by` / `text` |
| crm-architect checklist | ❌ Провалы по DEFINER/ACL/recursing policy |

**Оценка: 2/10 как runnable-промпт на `main`.** Исторически идея S23 верная; **как документ для Claude Code сегодня — obsolete и опасный.**  
**Рекомендация: не запускать.** Работать только с archive/`docs/schema.md`/baseline. Новый tenancy-work — отдельный спринт поверх 046+, не «перепрогон 021/022».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S23 schema (021/022) | ✅ Applied; файлы в `supabase/migrations/archive/021_multitenancy.sql`, `022_multitenancy_backfill.sql` |
| S24 org-scoped RLS (023) | ✅ archive + baseline |
| S25 team visibility / drop `profiles.role` (024) | ✅ |
| S26 notifications + invitations (025/026) | ✅ |
| Дальше (027–046, AI hub, delivery, gantt dates) | ✅ active `040–046` + baseline |
| **Повторный запуск sprint-23-multitenancy.md** | ❌ **запрещён** |

Доказательства:

- `organizations` / `memberships` / `current_org_id()` / `set_org_id()` / `trg_set_org_id` — в `20260712230000_baseline.sql` и типах `src/types/database.ts`, `supabase.gen.ts`.
- `docs/schema.md` и skill `schema.md`: «Тенант-модель _(applied S23)_».
- Активные миграции: `040…046` + baseline; **021/022 только в archive**.
- Код: `org_id` в хуках, RPC `current_org_id` (automation/stage_requirements/invitations).

---

## С чем согласен полностью (как с историческим дизайном S23)

### 1. Schema-first, RLS later

Разделение: 021/022 = колонки + helpers + backfill; S24 = org RLS. Сохраняет «приложение как раньше» на шаге 1. На проде так и сделано.

### 2. Список tenant-таблиц (на момент 001–020)

14 таблиц + исключения `meeting_attendees` / `user_settings` / `profiles` — совпали с applied 021. Осознанный nullable на «служебных» таблицах до S24 — верно (service-context / DEFINER inserts).

### 3. Триггер `set_org_id` только на `NEW.org_id`

Один trigger-function на shared column — обходит gotcha миграции 011 (generic triggers + разные колонки). В applied 022 это закреплено + `search_path` + ACL.

### 4. Не трогать hooks/validators

`org_id` с триггера — правильный контракт; клиент не шлёт `org_id` (кроме спец-таблиц без триггера позже).

### 5. Маппинг ролей admin→owner / pm→admin / member→manager / viewer→viewer

Совпадает с archive 022; `profiles.role` ещё существовала на S23 (удалена в 024).

---

## Блокеры (критично — не запускать)

### B1. Спринт уже применён — повтор = drift / collision

Промпт: «создать 021/022», «last migration ~020», «org в коде не должно быть».

Факт на `main` (2026-07-16):

| Ожидание промпта | Реальность |
|------------------|------------|
| Миграции до ~020 | Archive 001–039 + active 040–046 + baseline |
| Нет `org_id` в src | `org_id` повсеместно; `OrgRole`/`Organization`/`Membership` в `database.ts` |
| `docs/schema.md` устарел до 013 | `docs/schema.md` ~1234 строк, tenant-модель документирована |
| `profiles.role` жива | Колонки нет (S25/024); роли только в `memberships` |

Повтор: `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` могут «пройти» no-op, но **пересоздание политик/функций без DROP**, backfill «Default Organization», `SET NOT NULL` и commit «Sprint 23…» сломают историю и git-семантику.

### B2. Self-referencing RLS на `memberships` → 42P17

Промпт 021:

```sql
CREATE POLICY "membership_select_own_org" ON public.memberships
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.memberships m2
               WHERE m2.org_id = memberships.org_id AND m2.profile_id = auth.uid())
  );
```

Learnings: *Self-referencing RLS policy → infinite recursion (42P17)*.  
Applied 021: `is_org_member()` SECURITY DEFINER + policy через helper — **не** subquery в `memberships`.

Промпт **без** `is_org_member` — prod-breaking на первом SELECT memberships.

### B3. DEFINER без `SET search_path` и без ACL

Промпт:

- `current_org_id()` — `SECURITY DEFINER STABLE`, **без** `search_path`, **без** REVOKE/GRANT  
- `set_org_id()` — то же  

Checklist / learnings / applied 021–022:

- `SET search_path = public, pg_temp`  
- helpers: REVOKE anon/PUBLIC, GRANT authenticated + service_role  
- trigger `set_org_id`: REVOKE authenticated, GRANT service_role only  

Иначе advisors + mutable search_path risk.

### B4. Номера 021/022 заняты; точка сборки — baseline

Новые schema-изменения → **047+** (или timestamp), не переиспользование 021/022.  
`supabase db push` запрещён (промпт это верно отмечает; повтор SQL Editor 021/022 — всё равно no-go).

### B5. Smoke SQL невалиден даже для pre-S23 tasks

```sql
INSERT INTO public.tasks (user_id, title, lane)
VALUES (auth.uid(), '_smoke_test_org', 'now') ...
```

`tasks` (004 + baseline): **`text`**, **`created_by`**, **нет** `user_id`/`title`.  
Гейт «триггер работает» на этом SQL падает с 42703.

---

## Предупреждения (если бы промпт правили «с нуля» — сейчас academic)

### W1. РАЗВЕДКА не знает archive/baseline

```bash
ls supabase/migrations/ | tail -3
grep CREATE TABLE supabase/migrations/*.sql
```

На текущем дереве **не видит** 001–039 (archive) и завышает «нет org» / «нет таблиц». Нужны: `archive/`, baseline, MCP introspection, `docs/schema.md`.

### W2. Backfill при пустых `profiles`

`ORDER BY p.created_at LIMIT 1` + INSERT org — при 0 profiles org не создаётся, backfill `v_org` NULL, `SET NOT NULL` падает. На single-user CRM обычно ок; edge case не описан.

### W3. `BEGIN`/`COMMIT` vs Cowork `apply_migration`

Процесс learnings: Cowork apply **без** обёртки BEGIN/COMMIT (атомарность tool). Для Dashboard SQL Editor — ок; для MCP apply — убрать.

### W4. Индексы только на части tenant-таблиц

Нет idx на `contact_company`, `project_files`, `kpi_entries`, `call_tracker_days`, `scheduled_calls`. Не блокер S23; S24+ могли добавить.

### W5. Политика org SELECT-only

Нет INSERT/UPDATE на `organizations`/`memberships` — сознательно (S26). После 021 insert org только service/SQL Editor — ок для bootstrap.

### W6. `current_org_id` = «первая membership»

`ORDER BY created_at LIMIT 1` — single-org assumption; multi-org UI — S26+. Документировано; не баг S23.

---

## Пропущенные места (разведка `main` 2026-07-16)

Промпт: «если найдёшь таблицы не из ЗАДАЧИ 1 — добавь».  
**Сейчас** tenant-таблиц/сущностей **больше**, чем 14 из S23 — **не добавлять через этот спринт**, они уже с `org_id` в более поздних миграциях:

| Таблица / область | Откуда | `org_id` |
|------------------|--------|----------|
| `project_columns` | 032 PCT-1 | ✅ |
| `transcripts`, `ai_runs` | 030 | ✅ |
| `automation_rules` / `automation_runs` | 029 | ✅ |
| `stage_requirements` | 027 | ✅ |
| `notifications`, `invitations` | 026 | ✅ (явный org_id, без trg) |
| `delivery_*`, `project_members` | 035–037 | ✅ |
| `dashboard_sync` | prod-only / baseline | **нет** (personal, S25 decision) |

Повторный «добавь org_id всем из разведки» **сломает** модель (global/personal vs tenant).

---

## Diff: SQL промпта vs applied archive (кратко)

| Элемент | Промпт | Archive 021/022 (истина) |
|---------|--------|---------------------------|
| `is_org_member(uuid)` | ❌ нет | ✅ DEFINER + ACL |
| Policy memberships | subquery → recursion | `is_org_member(org_id)` |
| Policy organizations | EXISTS memberships | `is_org_member(id)` |
| `search_path` | ❌ | ✅ |
| ACL helpers/trigger | ❌ | ✅ |
| Backfill + NOT NULL set | ≈ | ≈ совпадает |
| Таблицы org_id | 14 | 14 (те же) |

Промпт = **черновик до hardening**; в archive ушли блокеры B2/B3. В CC отдавать **промпт нельзя** — только archive как reference.

---

## Предлагаемые правки в спринт

**Не править для запуска.** Варианты:

1. **Архивировать промпт**  
   Шапка:
   ```markdown
   > ⛔ SUPERSEDED / APPLIED (2026-07-05). Не запускать в CC.
   > Source of truth: `supabase/migrations/archive/021_*.sql`, `022_*.sql`,
   > `docs/schema.md` § Тенант-модель, baseline.
   ```

2. **Если нужен postmortem-доки** — ссылка на archive + learnings (42P17, search_path, ACL), не на SQL из `_analysis/sprint-23-multitenancy.md`.

3. **Новая tenancy-работа** (multi-org switcher, org create UI, second org) — **новый** sprint id (S-xx), миграция **≥047**, разведка baseline+MCP, **не** «Sprint 23 redo».

---

## Чеклист перед CC

- [ ] **Не** создавать `021_multitenancy.sql` / `022_…` в active migrations  
- [ ] **Не** прогонять SQL промпта в SQL Editor на проде  
- [ ] **Не** коммитить «Sprint 23: multitenancy schema…» повторно  
- [x] S23 уже в archive + baseline + `docs/schema.md`  
- [x] Типы `Organization` / `Membership` / `org_id` уже в `src/types`  
- [ ] Любой новый tenancy-change — отдельный промпт + review + номер после 046  
- [ ] При сомнениях: MCP `list_migrations` / introspection, не текст sprint-23  

---

## crm-architect checklist (промпт as-written)

| Пункт | Статус |
|-------|--------|
| Starts with РАЗВЕДКА | ✅ есть / ❌ устарела на `main` |
| Real table/column names | 🟡 14 таблиц ок для 020; smoke tasks cols ❌ |
| Real file paths | 🟡 `src/types/database.ts` ок; migrations layout сменился |
| learnings gotchas | ❌ recursion RLS, search_path, ACL |
| SQL as files; not applied from CC | ✅ |
| org_id / RLS org first | 🟡 schema only; policies broken if used as-is |
| DEFINER + search_path + ACL | ❌ |
| No flowType implicit | ✅ N/A |
| DELETE CASCADE | ✅ memberships FKs |
| CSS variables | N/A |
| schema.md after migration | ✅ задача 4; уже сделано post-factum |

---

**Итог:** `_analysis/sprint-23-multitenancy.md` — **исторический handoff**, не executable sprint. Applied-версия в archive **исправила** RLS-recursion и hardening. **В Claude Code не отдавать.** Следующая работа — только новые спринты поверх текущей org-модели.
