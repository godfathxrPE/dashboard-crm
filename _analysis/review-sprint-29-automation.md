# Ревью: Sprint 29 — Автоматизация v1 (триггер → действие)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, grep/read, crm-architect references)  
**Объект:** `_analysis/sprint-29-automation.md` — stage_entered → create_task, migration 029, Settings UI, seed  
**Контекст:** S26 notify, S27 stage gates; S29 **уже в проде** (`1b63d16`, applied 2026-07-06); следом S29.1, PCT-1, delivery 035–038, 040–046. Живая цепочка 001–046; baseline `20260712230000_baseline.sql` содержит automation DDL/функцию.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Контекст «БД на 028» | ❌ Устарело — прод на 046+, 029 applied |
| Скоуп v1 (один trigger/action, идемпотентность, без конструктора) | ✅ Исторически верен; совпадает с shipped |
| DDL/функция/EXCEPTION/zz_ / композиция с notify | ✅ Реализованы 1:1 в archive + baseline |
| Задачи 2–4 (типы, хук, UI, docs/learnings) | ❌ **Уже сделаны** |
| РАЗВЕДКА: пути (`src/app/settings/page.tsx`) | 🟡 Устарел path; секции в `SettingsContent` |
| Нумерация миграции `029_automation.sql` в active tree | ❌ Конфликт с archive/baseline; active = 040+ |
| Актуальность промпта для CC сегодня | ❌ **Stale** — повторный прогон вреден |
| Качество дизайна (как исторический handoff) | ✅ Высокое |

**Оценка: 2/10 как исполняемый спринт на `main` сегодня; 9/10 как исторический handoff (дизайн и DoD были правильными и совпали с merge).**  
**Рекомендация: не запускать в Claude Code.** Работа закрыта коммитом `1b63d16` (2026-07-06); миграция в `supabase/migrations/archive/029_automation.sql` и в baseline; UI/хуки/типы/docs на месте. Новый work — только дельта поверх S29 (v2 trigger/action, правила на delivery, observability runs), не перепрогон.

---

## Статус (факт в репо)

| Заход | Статус в репо | Доказательство |
|-------|---------------|----------------|
| **Миграция 029** | ✅ applied + archive | `supabase/migrations/archive/029_automation.sql` (302 строки); baseline L981–1079 `run_stage_automations`, L1420+ tables, L2674 `trg_zz_run_automations` |
| **Таблицы + RLS** | ✅ | `automation_rules` / `automation_runs` в `docs/schema.md` L281–332; policies initplan; runs без write-политик |
| **Типы** | ✅ | `src/types/database.ts` L245–277 (`AutomationRule`, `AutomationRun`, config); `supabase.gen.ts` L248+ |
| **Хук** | ✅ | `src/lib/hooks/use-automation-rules.ts` — CRUD, явный `org_id` |
| **Константы whitelist** | ✅ | `src/lib/constants/automation.ts` — lane/priority/assignee = SQL CASE |
| **UI Settings** | ✅ | `AutomationsSection.tsx` + mount `SettingsContent.tsx:70` (рядом с `GatesSection`) |
| **docs + learnings** | ✅ | `docs/schema.md` header 029 + раздел S29; skill `learnings.md` L118–131 EXCEPTION S27↔S29 |
| **Гейт/смок** | ✅ (по docs/BACKLOG) | schema: смок 2026-07-06; BACKLOG «Гейт-хвосты S29» done 2026-07-07 |
| **S29.1** | ✅ follow-up | `01dbd08` — чеврон → `stage_id` (гейт+автоматизация на одной оси) |

Файл спринта: mtime ~2026-07-11; **содержимое — pre-merge промпт** (контекст «БД на 028», задачи «написать 029»). Отдельного `review-sprint-29-automation.md` до этого ревью не было.

---

## С чем согласен полностью

### 1. Скоуп v1 и осознанные ограничения

- Один `trigger_type='stage_entered'`, один `action_type='create_task'`.
- Без визуального конструктора — форма в Settings + 3 seed-пресета.
- Идемпотентность `UNIQUE(rule_id, project_id, stage_id)` — один выстрел на (сделка, стадия); защита от пинг-понга. Зафиксировано в schema/docs.

### 2. EXCEPTION-политика (ключевой архитектурный инвариант)

Промпт верно противопоставляет S27 (BEFORE, **не** глотает) и S29 (AFTER, **глотает**): внешний `EXCEPTION WHEN OTHERS THEN RETURN NEW` + вложенный `BEGIN/EXCEPTION` на правило.  
Shipped-функция в baseline L1006–1078 реализует ровно это. skill `learnings.md` L118–131 уже содержит правило «валидатор не глотает / исполнитель глотает».

### 3. Композиция с notify, не дублирование

INSERT задачи с `assigned_to` → `trg_notify_task_assigned` (S26, INSERT-ветка); самоназначение фильтруется там. Ручной INSERT в `notifications` не нужен — и в baseline-функции его нет (L1048–1056).

### 4. Порядок триггеров `zz_`

`trg_zz_run_automations` AFTER UPDATE ON projects — после `on_stage_change` / notify project; финальные `NEW`. Совпадает со schema.md L859–863 и learnings «aa_ первым, zz_ последним».

### 5. Безопасность SQL в функции

- `replace()` для `{deal}`, без `format()`/`EXECUTE` в теле исполнителя.
- Whitelist `lane`/`priority` через CASE (дефолты `now`/`normal`).
- `org_id = NEW.org_id` явно на tasks / runs / activity_log.
- ACL: `SECURITY DEFINER` + `search_path = public, pg_temp` + GRANT только `service_role` (baseline REVOKE/GRANT L3863–3864).

### 6. RLS-паттерн

- `automation_rules`: SELECT org-members; write owner/admin; `org_id` явный из UI (как `stage_requirements`).
- `automation_runs`: SELECT only; write только definer.

### 7. Seed (3 пресета)

«Подготовка КП» / «Договор» по name; won — по `is_won`. Совпадает с docs/schema.md L328–332.

### 8. Контракт «миграция пишется, не применяется из CC»

Исторически соблюдён (ручной apply 029, как 028). Сейчас active-дерево — baseline + 040…046; 029 в `archive/`.

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт полностью выполнен — повторный прогон опасен

| Артефакт | Путь / доказательство |
|----------|------------------------|
| Коммит | `1b63d16` — message совпадает с КОММИТ-блоком спринта |
| SQL | `archive/029_automation.sql` + baseline |
| App | `use-automation-rules.ts`, `AutomationsSection.tsx`, types, constants |
| Docs | `docs/schema.md` 029 applied + smoke |

Запуск CC «как есть» приведёт к: попытке создать `supabase/migrations/029_automation.sql` **вне** archive (дубль/конфликт нумерации с цепочкой 040+), перезаписи уже живого UI/хуков, ложному «Header: 029 pending» в schema, риску `CREATE OR REPLACE`/seed-дублей при apply.

**Действие:** не запускать. Пометить sprint file как done/historical или архивировать; любой follow-up — новый спринт с дельтой.

### B2. Контекст «БД на 028» ложен для текущего main

Промпт: «БД на 028… S29 — …».  
Факт (skill schema.md + `docs/schema.md`): **029 applied 2026-07-06**; цепочка до **046**; pending DDL нет. AI-summarize (028) по-прежнему «ждёт кредитов» — это верно как хвост S28, но **не** как текущая точка для S29.

### B3. Целевой путь миграции в active tree неверен

Спринт пишет `supabase/migrations/029_automation.sql`.  
Active: `040_…`…`046_…` + `20260712230000_baseline.sql`; 001–039 в `archive/`. Создание `029_*` в root migrations **ломает** модель «baseline + только новые дельты» (см. migrations README / AUDIT-B).

---

## Предупреждения (желательно учесть; не блокируют, т.к. запуск запрещён B1)

### W1. РАЗВЕДКА: устаревший путь Settings

Спринт:
```bash
grep -n "Section" src/app/settings/page.tsx
```
Факт: `src/app/settings/page.tsx` **отсутствует**. Реально:
- `src/app/(dashboard)/settings/page.tsx` — тонкая оболочка
- секции: `src/components/settings/SettingsContent.tsx` (`GatesSection`, `AutomationsSection`, `TeamSection`)

Хук-образец `use-stage-requirements.ts` — путь верен.

### W2. Post-S29 эволюция tasks (PCT / delivery) — функция жива, но INSERT минимальный

`run_stage_automations` вставляет `(text, lane, priority, project_id, company_id, contact_id, deadline, assigned_to, org_id)` без `column_id`.  
Это **ожидаемо** для v1: `trg_aa_resolve_board` (032) резолвит board из lane. Не баг промпта; при v2/delivery-rules учитывать project columns / phase.

### W3. Константы ссылаются на `supabase/migrations/029_automation.sql`

`src/lib/constants/automation.ts` L11–12 указывает на active path 029; фактически файл в **archive/**. Косметика docs-ссылок; на runtime не влияет.

### W4. Промпт не упоминает S29.1 / legacy stage

Исторически после S29 смок на IIoT-шевроне ломался (писал legacy `stage`). Закрыто S29.1. Для **нового** исполнителя промпт S29 недостаточен как «полная картина автоматизации» — чеврон уже на `stage_id`.

### W5. `activity_log.event_type = 'automation_fired'`

Нет отдельного CHECK enum в промпте — ок (свободный text + payload). Учесть entity-links 042, если UI-лента должна линковать runs.

---

## Пропущенные места (если бы прогоняли с нуля — inventory «уже есть»)

| Файл | Статус | Действие при «запуске» |
|------|--------|------------------------|
| `supabase/migrations/archive/029_automation.sql` | ✅ full DDL | Не пересоздавать в root |
| `supabase/migrations/20260712230000_baseline.sql` L981–1079, 1420+, 2674, 3255+ | ✅ | Не дублировать |
| `src/types/database.ts` L245–277 | ✅ Automation* | Не затирать |
| `src/lib/hooks/use-automation-rules.ts` | ✅ | Не переписывать с нуля |
| `src/lib/constants/automation.ts` | ✅ | — |
| `src/components/settings/AutomationsSection.tsx` | ✅ | — |
| `src/components/settings/SettingsContent.tsx:70` | ✅ mount | — |
| `docs/schema.md` (029 applied) | ✅ | Не ставить «029 pending» |
| skill `learnings.md` EXCEPTION S27↔S29 | ✅ | Уже есть |
| `src/app/settings/page.tsx` | ❌ не существует | Разведка спринта устарела |

Пробелов «надо добавить, а спринт не нашёл» **нет** — наоборот, всё из DoD уже в репо.

---

## Сверка с crm-architect checklist

| Пункт | В промпте | Live |
|-------|-----------|------|
| РАЗВЕДКА перед правками | ✅ есть | 🟡 команды частично stale |
| Реальные table/column | ✅ | ✅ совпадают с schema |
| Реальные file paths | 🟡 settings path | UI в `components/settings/*` |
| learnings gotchas | ✅ EXCEPTION, composition | ✅ уже в skill |
| SQL file, не apply из CC | ✅ | ✅ applied вручную; в archive |
| org_id / RLS org first | ✅ | ✅ initplan policies |
| SECURITY DEFINER + search_path + ACL | ✅ | ✅ baseline |
| Нет flowType implicit | n/a (нет client auth change) | — |
| DELETE CASCADE | ✅ rules→runs | ✅ |
| CSS variables / theme | ✅ Scandi/Lucide | UI на токенах (как Gates) |
| schema.md после миграции | ✅ задача 4 | ✅ done |

**Исторически:** чеклист промпта был green. **Сегодня:** чеклист не спасает от B1 (работа already shipped).

---

## Предлагаемые правки в спринт

1. **Не править для запуска** — файл оставить как historical handoff **или** в шапке явно:
   ```markdown
   > STATUS: DONE (`1b63d16`, applied 2026-07-06). Do not re-run in CC.
   ```
2. Если нужен **v2** — новый файл (`sprint-XX-automation-v2.md`) с дельтой, например:
   - новые `trigger_type` / `action_type`;
   - сброс/перезапуск runs;
   - UI журнала `automation_runs`;
   - правила для `type=delivery` / phase columns;
   - миграция **следующего** номера (047+), не 029.
3. Починить ссылки в коде (опционально, вне этого спринта): `lib/constants/automation.ts` → `archive/029_automation.sql`.

---

## Чеклист перед CC

- [ ] **Не запускать** этот промпт в Claude Code
- [x] Убедиться: `1b63d16` / archive 029 / AutomationsSection на `main`
- [x] Не создавать `supabase/migrations/029_automation.sql` в active tree
- [x] Не откатывать/не «улучшать» `run_stage_automations` без интроспекции live (`pg_get_functiondef`) — learnings «тело ≠ файл»
- [ ] Для новой работы: отдельный спринт с актуальной разведкой (branch, list_migrations, AFTER-триггеры projects post-045/046)
- [ ] Smoke (если регрессия): stage → «Подготовка КП» (с гейтом S27) → task + optional notify + runs unique; is_active=false; broken config не блокирует UPDATE

---

## Итог одной строкой

**S29 уже shipped и в проде; промпт — качественный, но stale handoff. Запускать в CC нельзя.**
