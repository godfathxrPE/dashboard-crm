# Ревью: S-QUOTE-1 — Quotes (КП) как объект сделки

**Дата:** 2026-07-17  
**Ревьюер:** Grok (верификация по коду `main` @ `1339640`; refs crm-architect: `schema.md` / `architecture.md` / `learnings.md`; live: `ProjectDetail.tsx`, `ProjectModal.tsx`, `validators/project.ts`, `use-projects.ts`, `project-permissions.ts`, `048_task_dependencies.sql`, `052_task_wbs.sql`, baseline RLS `projects_*`)  
**Объект:** `_analysis/sprint-S-QUOTE-1.md` — миграция 053 `quotes` + вкладка «КП» на client-сделке + accept→budget  
**Контекст:** roadmap §6 A2; `projects.budget` = bigint/копейки; spawn уже в `DealDeliveryHub`; last numbered migration **052** (`052_task_wbs.sql`, отражена в `docs/schema.md`); таблицы/UI quotes в дереве **нет**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (tabs, budget unit, 048 RLS, next mig 053) | ✅ |
| Scope: аддитивная 053 + UI client-only; spawn не дублировать | ✅ |
| Миграция 053: enum/table/triggers/RLS/ACL | ✅ |
| RLS: org boundary + `current_org_role`; DEFINER stamp + `search_path` | ✅ |
| amount unit = `projects.budget` (копейки); accept→`useUpdateProject` | ✅ / 🟡 **W2** |
| Вкладка «КП» только `type==='client'` | ✅ |
| UI gate `canManage` vs RLS-матрица manager | 🟡 **W1** |
| Типы руками до gen; schema.md post-apply | 🟡 **W3** |
| Нет CHECK type=client / один accepted / project.org match | 🟡 **W4** |
| stamp только на `UPDATE OF status` | 🟡 **W5** |
| Zod `document_url` chain | 🟡 **W6** |
| crm-architect checklist | ✅ |

**Оценка: 8.5/10.** Зрелый v1: правильный data model, RLS по 048+, честный accept-flow без spawn, client-гейт. Блокеров **нет**.  
**Рекомендация:** **запускать в CC**; в HOW зафиксировать W1 (gate прав) и W2 (ввод суммы как в `ProjectModal`, не raw InlineEdit).

---

## Статус

| Заход | Репо |
|-------|------|
| `projects.budget` bigint копейки + `formatBudget` | ✅ `validators/project.ts` L194–200; baseline `budget bigint` |
| `DealDeliveryHub` «Создать внедрение» на won | ✅ `ProjectDetail.tsx` + `DealDeliveryHub.tsx` (~L98/114) |
| Tabs `activity` / `board` / `timeline` | ✅ `ProjectDetail.tsx` L165, L762–796 |
| `useUpdateProject` | ✅ `use-projects.ts` L407+ |
| Next mig **053** после 050–052 | ✅ `ls …/05*` → 050, 051, 052; `053*` нет |
| `053_quotes.sql` / `quotes` / `use-quotes` / QuotesTab | ❌ этот спринт |

---

## Разведка (верификация)

| Утверждение спринта | Live |
|---------------------|------|
| Next migration **053** after 05x | ✅ `050_workflow_engine`, `051_task_overdue`, `052_task_wbs`; `053` отсутствует |
| `set_org_id` / `update_updated_at` / `current_org_*` | ✅ baseline (~L1104, L1341, L533); триггеры `trg_set_org_id` / `set_updated_at` на tenant-таблицах |
| 048 RLS: SELECT org-wide; write owner/admin/manager | ✅ `048_task_dependencies.sql` — SELECT/INSERT/DELETE; **UPDATE-политики нет** (рёбра иммутабельны). Спринт корректно **добавляет** UPDATE для quotes |
| Tab state `'activity' \| 'board' \| 'timeline'` | ✅ `ProjectDetail.tsx` L165 |
| Tab bar ~L762–781; render board/timeline/activity | ✅ L784–833; activity через `hidden`, не unmount |
| `type === 'client'` гейты (pipeline, hub, spawn) | ✅ много мест; `DealDeliveryHub` ~L646 |
| `formatBudget` = kopecks/100 | ✅ `validators/project.ts` L194–200 |
| InlineEdit budget: raw `Number(val)` + `formatDisplay` | ✅ L693–700 — **сырые копейки в draft** |
| ProjectModal budget: **рубли** → `parseBudgetInput` → копейки | ✅ `ProjectModal.tsx` L387–416 |
| `canManage = canManageDeliveryProject(...)` | ✅ L217; helper: org owner/admin **или** `owner_id`/`created_by` — **не** org-manager как роль |
| `projects_update` | ✅ baseline: owner/admin **или** `owner_id` (manager без ownership — нет; `created_by` **не** даёт update) |
| `projects_select` | ✅ owner/admin **или** owner_id/created_by — не org-wide |
| `entities.ts` алиасы Row/Insert/Update | ✅ L6–36; `Quote` нет |
| Soft-delete / `deleted_at` | ✅ в tenant-таблицах нет; CASCADE-паттерн верный |
| `Modal` shell + dirty-guard | ✅ `@/components/shared/Modal` (`isDirty`), не `components/ui` |
| CVD-глифы + `text-green`/`text-blue`… | ✅ токены в `globals.css` (`.text-blue` и т.д.); паттерн glyph+text как `PortfolioView` / `HealthDot` |
| Не apply миграцию из CC | ✅ в спринте явно |

Команды разведки спринта валидны; line numbers tab-блока (~760–800) совпадают с live.

---

## С чем согласен полностью

### 1. Продуктовая модель

КП 1:N на client-сделку, lifecycle enum (`draft→sent→accepted|rejected|expired`), `amount` в копейках как `budget`, при accept — **мягкая** синхронизация budget (кнопка, не silent overwrite). Spawn не дублировать — верно: `DealDeliveryHub` уже на won-сделке.

### 2. Миграция 053

- `quote_status` enum + table + indexes — стандарт.  
- FK `project_id → projects ON DELETE CASCADE` — hard-delete, без `deleted_at` (learnings).  
- `trg_set_org_id` + `set_updated_at` — как tenant-таблицы / 048.  
- `stamp_quote_status`: DEFINER + `search_path = public, pg_temp` + REVOKE/GRANT — checklist.  
- `trg_zz_*` только `BEFORE UPDATE OF status`; timestamps не перетираются (`is null`).  
- RLS 4 политики: SELECT org-wide; INSERT/UPDATE/DELETE owner/admin/manager — совпадает с RBAC-матрицей спринта.  
- GRANT authenticated / REVOKE anon — ок.  
- Initplan-обёртки `( select public.current_org_id() )` — как 048/040.

### 3. UI placement

Расширение tab-набора + `QuotesTab` / `QuoteModal` — правильный слой. Client-only spread в массиве табов — не затронет delivery/internal. Референс child-компонента `ProjectFiles` уместен.

### 4. Хуки

`useQuotes(projectId)` + CUD + invalidate `['quotes', projectId]` — конвенция entity-hooks. Статус через `useUpdateQuote`, не отдельный мутатор — ок при DB stamp. Accept→budget через существующий `useUpdateProject` — не плодить RPC.

### 5. Границы

Миграцию не apply из CC; типы руками до gen; post-apply `docs/schema.md` + skill delta — совпадает с S-WBS-1 / ops-гейтом. Коммит-список файлов полный; push только по явной команде.

---

## Блокеры (критично — исправить до запуска)

**Нет.** Можно писать 053 + UI в Claude Code.

---

## Предупреждения (желательно в HOW)

### W1. `canManage` ≠ RLS quotes / ≠ manager в матрице

Спринт: кнопки create/edit при `canManage`. Live `canManage` = `canManageDeliveryProject` (`project-permissions.ts` L10–18): **owner/admin org** или **owner_id/created_by** проекта. Org-**manager**, не являющийся владельцем/создателем сделки → `canManage === false`, хотя RLS quotes **разрешает** write manager’у.

Обратное: `created_by` без `owner_id` → `canManage === true`, quotes write OK (если role manager+), но **accept→budget** через `projects_update` **упадёт** (нужны owner/admin **или** `owner_id`).

**HOW:**

```ts
const canEditQuotes =
  orgRole === 'owner' || orgRole === 'admin' || orgRole === 'manager';

const canUpdateDealBudget =
  orgRole === 'owner' || orgRole === 'admin' || project.owner_id === user?.id;
```

Кнопку «Обновить бюджет…» — только при `canUpdateDealBudget`. Не переиспользовать delivery-`canManage` без комментария.

### W2. Единица ввода amount: не копировать InlineEdit budget

Спринт: «та же единица, что budget в ProjectDetail InlineEdit». Live InlineEdit пишет **сырое число** (`Number(val)`), а `formatBudget` делит на 100 — UX сырых «копеек в инпуте».  
**Канон форм** — `ProjectModal`: лейбл «Бюджет (₽)», `parseBudgetInput` → копейки в state, preview `formatBudget`.

**HOW:** в `QuoteModal` — как ProjectModal (`parseBudgetInput` / display `/100`). Storage всегда копейки → `accepted → budget: amount` остаётся прямым присвоением. Не учить пользователя вводить копейки.

### W3. Ручные Quote-типы + post-apply

До apply+gen **нельзя** писать `Database['public']['Tables']['quotes']['Row']` — таблицы в gen нет, tsc упадёт. Полностью hand-type / standalone interface (как предупреждал S-WBS-1), **после** `gen types` — алиас на `Database` и снять overrides.  
Post-apply Cowork: `docs/schema.md` + skill delta 053 (в VERIFICATION LABELS есть; в `git add` спринта — нет, ок).

### W4. Нет DB-инварианта «только client» / «один accepted» / project.org

- FK на `projects` без CHECK `type = 'client'` — API может вставить quote на delivery/internal. UI client-only — достаточно для v1.  
- Несколько `accepted` на одну сделку — budget-кнопка на каждой; last-write-wins. v1 ok; partial unique `(project_id) WHERE status = 'accepted'` — backlog.  
- Нет проверки `projects.org_id = quotes.org_id` при insert (FK только на `id`). Класс риска как у ряда child-таблиц; optional trigger/CHECK later. Не блокер v1.

### W5. Stamp только на `UPDATE OF status`

INSERT сразу со `status = 'sent'|'accepted'` **не** проставит `sent_at`/`accepted_at`. UI default `draft` — ок. Если create+status в одной форме — либо stamp на INSERT, либо create всегда `draft`.

### W6. Zod `document_url`

Цепочка `.url().nullable().or(z.literal('').transform(...))` часто ломается на `null`/empty. **HOW:** паттерн проекта (как `do_url` в `projectFormSchema`):

```ts
z.string().url('Некорректная ссылка').nullable()
  .or(z.literal('').transform(() => null))
  .default(null)
```

или `z.union([z.string().url(), z.literal('')]).nullable().transform(...)` — проверить на `''` / `null` / valid URL до merge.

### W7. (minor) Tab union type

Обязательно расширить `useState<'activity' | 'board' | 'timeline'>` → `+ 'quotes'` (L165), иначе tsc. Спринт показывает только spread в массиве — в HOW явно оба места.

### W8. (minor) `Modal` path + `currency`

- Импорт: `import { Modal } from '@/components/shared/Modal'` + `isDirty={formState.isDirty}`.  
- `currency` default RUB ok; v1 read-only / fixed — не free-text без whitelist.

### W9. (minor) Invalidate budget UX

`useUpdateProject` уже инвалидирует `['projects']` / detail — после accept→budget UI сделки подтянется. В QuotesTab после mutate достаточно toast; отдельно инвалидировать quotes не нужно.

---

## Пропущенные места

| Файл | Строки / заметка | Действие |
|------|------------------|----------|
| `ProjectDetail.tsx` | L165 tab union; L764–781 tab array; render после timeline | + `'quotes'`, client-only tab + `<QuotesTab />` |
| `src/components/shared/Modal.tsx` | dirty-guard primitive | QuoteModal shell |
| `src/lib/utils/project-permissions.ts` | `canManageDeliveryProject` | **не** reuse as-is для quotes write |
| `src/components/projects/index.ts` | barrel | экспорт QuotesTab не обязателен (local import) |
| `src/types/database.ts` / `supabase.gen.ts` | gen | не править руками; entities hand → post-gen |
| `DealDeliveryHub.tsx` | spawn CTA | **не трогать**; только текст-подсказка в QuotesTab |
| `activity_type` / `kp_sent` | baseline enum | legacy; v1 quotes **не** обязаны писать activity — out of scope ок |
| `docs/schema.md` + skill schema | post-053 | гейт Cowork, не CC |

Ложных путей в спринте нет; «~760–800» актуально.

---

## Предлагаемые правки в спринт (опционально, не блокер)

1. HOW W1: `canEditQuotes` = RLS quotes; `canUpdateDealBudget` = `projects_update`.  
2. HOW W2: amount UX = ProjectModal + `parseBudgetInput`, storage копейки.  
3. Явно: `setTab` union + `'quotes'`; Modal из `@/components/shared/Modal`.  
4. Quote-типы: full hand-type **без** `Database[…]['quotes']` до gen.  
5. Zod `document_url` — безопасный union/or как `do_url`.  
6. (optional) INSERT-path stamp; partial unique one accepted; project.org guard.

---

## Чеклист перед CC

- [x] РАЗВЕДКА валидна (tabs L165/762+, budget units, 048 RLS, 053 next after 052)
- [x] Миграция 053 аддитивна; не apply из CC
- [x] RLS org + role; stamp DEFINER + search_path + ACL
- [x] Client-only tab; spawn не дублировать
- [x] Hard delete / CASCADE; no `deleted_at`
- [ ] HOW: W1 canEditQuotes / canUpdateDealBudget vs canManage
- [ ] HOW: W2 parseBudgetInput в QuoteModal
- [ ] HOW: tab union + shared/Modal path
- [ ] После apply (гейт): gen types, снять hand Quote, schema.md

---

## crm-architect checklist

| Item | |
|------|--|
| РАЗВЕДКА first | ✅ |
| Real table/column names (new in 053) | ✅ |
| Real file paths (`ProjectDetail`, hooks, validators) | ✅ |
| learnings: no soft-delete, CASCADE, no apply from CC | ✅ |
| org_id + RLS + `current_org_role` | ✅ |
| SECURITY DEFINER + `search_path` + ACL | ✅ |
| No `flowType: 'implicit'` | ✅ N/A (client не трогаем) |
| DELETE via CASCADE | ✅ |
| CSS variables / theme tokens | ✅ (`text-blue` и т.д. — theme classes) |
| schema.md after migration | 🟡 post-apply гейт |

---

**Итог:** спринт готов к Claude Code. Главные HOW-правки — **права UI (W1)** и **ввод суммы в рублях→копейки (W2)**; остальное — polish/edge. Блокеров нет.
