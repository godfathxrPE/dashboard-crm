# Claude Code Prompt — S-QUOTE-1: Quotes (КП) как объект сделки

## КОНТЕКСТ / АРХИТЕКТУРА (D3, не для исполнения)
Роадмап §6 A2. Сумма сделки (`projects.budget`) не связана с жизненным циклом КП. Вводим объект
`quotes` на сделке (`type='client'`): вкладка «КП» + lifecycle + при accepted — обновить бюджет.

**CRM-аналогии:** Salesforce Quote (на Opportunity, lifecycle Draft→Presented→Accepted), HubSpot
Quotes (на Deal, статусы + подпись), Pipedrive — нет нативно (add-on). Берём паттерн Salesforce/HubSpot:
quote привязан к сделке 1:N, статусная модель, при accept → влияет на сумму сделки.

**Data model:** `quotes` (N) → `projects` client (1). Lifecycle enum `quote_status`. amount — **копейки**
(как `projects.budget`; accepted → `budget = amount` тем же типом). Ownership: `org_id` + `created_by`.

**RBAC (Role × Action):**
```
             | Create | Read (own org) | Update | Delete |
owner/admin  |   ✓    |      ✓         |   ✓    |   ✓    |
manager (PM) |   ✓    |      ✓         |   ✓    |   ✓    |
viewer       |   ✗    |      ✓         |   ✗    |   ✗    |
```
→ RLS: SELECT org-wide, INSERT/UPDATE/DELETE — owner/admin/manager (паттерн 048 task_dependencies).

**Инварианты:**
1. **Аддитивно.** Новая таблица/enum/триггеры/RLS. Существующее не трогаем.
2. **Hard delete через CASCADE** — soft-delete (`deleted_at`) в проекте НЕТ ни у одной таблицы;
   не вводить одинокий `deleted_at`. quote удаляется каскадом со сделкой + ручное delete по RLS.
3. **amount == unit(budget) = копейки.** accepted → `updateProject({budget: amount})` — прямое присвоение.
4. **Вкладка «КП» — только `type==='client'`.** delivery/internal её не видят.
5. **Миграцию 053 НЕ применять из CC** — записать+коммит, применяет гейт Cowork (MCP). Типы — руками
   до regen (как S-WBS-1 W1), снять overrides после `gen types`.
6. **spawn НЕ дублировать** — «Создать внедрение» уже в `DealDeliveryHub` на won-сделке. Accept-flow
   квоты трогает только budget (+ подсказку, что внедрение создаётся в Hub).

## РАЗВЕДКА (первой, не менять)
```bash
cd ~/Downloads/dashboard-crm
# триггер-функции (используем как есть)
grep -rn "function public.set_org_id\|function public.update_updated_at\|function public.current_org_id\|function public.current_org_role" supabase/migrations/*.sql | head
# паттерн RLS org-scoped бизнес-таблицы
sed -n '/enable row level security/,/grant/p' supabase/migrations/048_task_dependencies.sql
# ProjectDetail: tab-система (activity/board/timeline) + client-гейты
grep -n "tab === \|setTab\|type === 'client'\|useState.*tab\|ProjectFiles" src/components/projects/ProjectDetail.tsx | head -20
# budget: копейки + формат + inline-edit UX (amount повторяет ЭТУ единицу)
grep -n "formatBudget\|budget:" src/lib/validators/project.ts src/components/projects/ProjectDetail.tsx | head
# next migration = 053
ls supabase/migrations/ | grep -E "^05" | tail
# enum-паттерн (как объявлены в baseline)
grep -n "create type" supabase/migrations/20260712230000_baseline.sql | head
```
Прочитать: `ProjectDetail.tsx` (tab-блок ~760–800 + client-гейты), `validators/project.ts` (budget/formatBudget),
`ProjectFiles.tsx` (референс per-project child-компонента), `use-projects.ts` (`useUpdateProject`), `48`-RLS.

---

## ЗАДАЧА 1 — Миграция 053 (аддитивная; НЕ применять из CC)
`supabase/migrations/053_quotes.sql`:
```sql
-- 053: quotes — КП на сделке (S-QUOTE-1). Hard-delete через CASCADE (soft-delete в проекте нет).
create type public.quote_status as enum ('draft','sent','accepted','rejected','expired');

create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,   -- сделка (client)
  status       public.quote_status not null default 'draft',
  amount       bigint check (amount is null or amount >= 0),   -- КОПЕЙКИ (как projects.budget)
  currency     text not null default 'RUB',
  document_url text,                                           -- ссылка на HTML/PDF из kp-master
  notes        text,
  valid_until  date,
  sent_at      timestamptz,
  accepted_at  timestamptz,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_quotes_org     on public.quotes(org_id);
create index idx_quotes_project on public.quotes(project_id);
create index idx_quotes_status  on public.quotes(status);

-- org_id автозаполнение (паттерн tenant-таблиц) + updated_at (общий триггер проекта)
create trigger trg_set_org_id before insert on public.quotes
  for each row execute function public.set_org_id();
create trigger set_updated_at before update on public.quotes
  for each row execute function public.update_updated_at();

-- Стемпинг sent_at/accepted_at при смене статуса (DB enforcement > UI)
create or replace function public.stamp_quote_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'sent'     and new.sent_at     is null then new.sent_at     := now(); end if;
    if new.status = 'accepted' and new.accepted_at is null then new.accepted_at := now(); end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_quote_status() from public, anon;
grant execute on function public.stamp_quote_status() to authenticated, service_role;
create trigger trg_zz_stamp_quote_status before update of status on public.quotes
  for each row execute function public.stamp_quote_status();

-- RLS: SELECT org-wide; INSERT/UPDATE/DELETE — owner/admin/manager (паттерн 048)
alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select
  using ( org_id = ( select public.current_org_id() ) );
create policy quotes_insert on public.quotes for insert
  with check ( org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager') );
create policy quotes_update on public.quotes for update
  using ( org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager') );
create policy quotes_delete on public.quotes for delete
  using ( org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager') );

grant select, insert, update, delete on public.quotes to authenticated;
revoke all on public.quotes from anon;
```
**НЕ применять из CC** — гейт Cowork. RLS-политики покрыты матрицей выше.

## ЗАДАЧА 2 — Типы + валидатор
- **`entities.ts`**: `export type Quote = Database['public']['Tables']['quotes']['Row'];`
  `QuoteInsert`/`QuoteUpdate` алиасы. **До apply+gen** — руками intersection (как S-WBS-1 W1):
  `Quote = ... & { org_id: string; project_id: string; status: 'draft'|'sent'|'accepted'|'rejected'|'expired'; amount: number|null; currency: string; document_url: string|null; notes: string|null; valid_until: string|null; sent_at: string|null; accepted_at: string|null; created_by: string|null; created_at: string; updated_at: string; id: string }`.
  **WARNING**: снять overrides после `gen types` (гейт применит 053).
- **`src/lib/validators/quote.ts`** (новый): Zod `quoteFormSchema`:
```ts
export const quoteStatuses = ['draft','sent','accepted','rejected','expired'] as const;
export const quoteFormSchema = z.object({
  status: z.enum(quoteStatuses).default('draft'),
  amount: z.number().int().nonnegative().nullable().default(null),   // копейки, как budget
  currency: z.string().default('RUB'),
  document_url: z.string().url('Некорректная ссылка').nullable().or(z.literal('').transform(() => null)).default(null),
  valid_until: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
export const QUOTE_STATUS_CONFIG: Record<typeof quoteStatuses[number], { label: string; text: string; glyph: string }> = {
  draft:    { label: 'Черновик', text: 'text-text-mute', glyph: '○' },
  sent:     { label: 'Отправлено', text: 'text-blue',   glyph: '◔' },
  accepted: { label: 'Принято',   text: 'text-green',   glyph: '●' },
  rejected: { label: 'Отклонено', text: 'text-red',     glyph: '✕' },
  expired:  { label: 'Истекло',   text: 'text-yellow',  glyph: '◐' },
};
```
`amount` вводится в форме в ТОЙ ЖЕ единице, что `budget` в `ProjectDetail` InlineEdit (сверить по
разведке) — чтобы accepted→budget был прямым присвоением. `formatBudget(amount)` для отображения.

## ЗАДАЧА 3 — Хук `use-quotes.ts`
`src/lib/hooks/use-quotes.ts` по конвенции entity-хуков (React Query + optimistic):
- `useQuotes(projectId)` — `queryKey ['quotes', projectId]`, `select` явные колонки, order `created_at desc`.
- `useCreateQuote` / `useUpdateQuote` / `useDeleteQuote` — insert/update/delete (org_id ставит триггер;
  created_by — DEFAULT). Инвалидация `['quotes', projectId]`. Delete — прямой (hard, по RLS).
- Отдельного статуса-мьютатора не нужно — статус меняется через `useUpdateQuote({id, status})`
  (триггер `stamp_quote_status` проставит sent_at/accepted_at).

## ЗАДАЧА 4 — Вкладка «КП» на сделке
**4a. `ProjectDetail.tsx`** — расширить tab-набор ТОЛЬКО для client:
```tsx
// tab-тип += 'quotes'; массив табов:
...(project.type === 'client' ? [{ value: 'quotes' as const, label: 'КП' }] : []),
// рендер:
{tab === 'quotes' && project.type === 'client' && (
  <QuotesTab deal={project} canManage={canManage} />
)}
```
**4b. `src/components/projects/QuotesTab.tsx`** (новый):
- `useQuotes(deal.id)`. Список квот: статус-бейдж (`QUOTE_STATUS_CONFIG`, CVD-глиф+цвет),
  `formatBudget(amount)` (`tabular-nums`), `valid_until`, ссылка `document_url` (↗), `created_at`.
- Loading/error/empty состояния (empty: «Нет КП — создай первое», кнопка + КП только при `canManage`).
- Кнопка «+ КП» (canManage) → `QuoteModal` (create). Клик по строке → edit-modal.
- Статус-переходы: селект/кнопки в строке или модалке (draft→sent→accepted/rejected; expired).
- **Accept-flow:** при статусе `accepted` и `amount != null` — если `amount !== deal.budget`,
  показать подсказку-кнопку «Обновить бюджет сделки до {formatBudget(amount)}» →
  `useUpdateProject().mutate({ id: deal.id, budget: amount })`. Плюс мягкий текст: внедрение
  создаётся кнопкой «Создать внедрение» в блоке выше (DealDeliveryHub) — **не дублировать spawn тут**.

**4c. `src/components/projects/QuoteModal.tsx`** (новый): RHF+Zod (`quoteFormSchema`), шелл `Modal`
(dirty-guard), поля: Сумма (amount, единица = budget), Валюта (default RUB, read-only-ish v1),
Статус (select), Действует до (date), Ссылка на КП (url), Заметки (textarea). create/edit через хук.

## EDGE CASES
- Нет квот → empty-state; viewer → без кнопок создания/правки (canManage=false).
- `amount=null` (черновик без суммы) → «—», accept-flow не предлагает budget.
- accepted с `amount === deal.budget` → подсказку не показывать.
- Удаление сделки → квоты уходят каскадом (FK ON DELETE CASCADE) — проверить, что UI не падает.
- `document_url` пустой → без ссылки-иконки.
- Статус accepted повторно / переключение назад → `accepted_at`/`sent_at` не перетираются (триггер `is null`).

## SELF-CHECK
- [ ] `npx tsc --noEmit` 0 ошибок, без `any` (external — `unknown`+гварды).
- [ ] `npm run build` проходит.
- [ ] Миграция 053 закоммичена, **не применена из CC**.
- [ ] RLS: 4 политики; viewer read-only; write owner/admin/manager. org_id ставит триггер.
- [ ] Вкладка «КП» только у client; delivery/internal не видят.
- [ ] amount == unit(budget); accepted→budget прямое присвоение.
- [ ] Токены/px по конвенции; `tabular-nums` для сумм; CVD-глифы статусов.

## КОММИТ
```bash
git add supabase/migrations/053_quotes.sql src/types/entities.ts src/lib/validators/quote.ts \
        src/lib/hooks/use-quotes.ts src/components/projects/QuotesTab.tsx \
        src/components/projects/QuoteModal.tsx src/components/projects/ProjectDetail.tsx
git commit -m "feat(quotes): S-QUOTE-1 — КП на сделке (quotes + lifecycle + accept→budget)"
```
НЕ пушить без явного «пушь».

## VERIFICATION LABELS (заполнит CC/гейт)
```
Type Safety:            NOT_VERIFIED (до tsc; Quote-типы руками — WARNING до gen types)
RLS Coverage:           PASS (4 политики по RBAC-матрице; org-scoped, роль через current_org_role)
Backward Compatibility: PASS (новая таблица/вкладка; client-гейт; существующее не тронуто)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE

Migration 053: применяет гейт Cowork (MCP) → npx supabase gen types → снять ручные Quote-overrides.
Post-apply (Cowork): docs/schema.md + skill дельта 053.
```

## NEXT (после S-QUOTE-1)
kp-master может писать `document_url` прямо в quote (интеграция контента КП ↔ объект). §13 дальше:
S-SPAWN-UX-2, S-CHECKLIST-1.
