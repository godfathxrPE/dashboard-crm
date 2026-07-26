# S-R2-SEGMENTS-1 — org settings + серверные сегменты (Smart Views)

**Ветка:** `feat/r2-segments` от `main`. Первый спринт Roadmap #2 (R2-P0-D + R2-P0-B).
Две миграции: **076** `org_settings`, **077** `segments`. Один коммит.

Продукт: `improvements/CRM-ROADMAP-2.md` §F1/D4. Архитектура:
`improvements/CRM-ROADMAP-2-ARCHITECTURE.md` §3.2/§3.4. Ревью с правками:
`_analysis/review-CRM-ROADMAP-2-ARCHITECTURE.md` (F5, F8, F9, F10, F11 — учтены ниже).

**Трудоёмкость: ~10–13 ч. Риск низкий** (всё аддитивно, существующее поведение не меняется).

Идёт первым, а не флагманская модалка перехода: спринт полностью независим, не трогает ни
одного write-path'а сделки и даёт видимый результат сразу. Модалка требует правки
gate-функции в БД — её проектируем спокойно, пока этот спринт на гейте.

---

## РАЗВЕДКА — выполнить целиком до первой правки

```bash
git branch --show-current                     # feat/r2-segments
git status --short                            # чисто
ls supabase/migrations/ | tail -5             # ожидание: последняя 075 → берём 076, 077

# org settings
grep -rn "RECONNECT_THRESHOLD_DAYS" src/            # 3+ потребителя, все останутся рабочими
cat src/lib/constants/reconnect.ts
grep -rn "org_update_owner" supabase/migrations/*.sql
grep -n "useOrgRole" src/lib/hooks/use-org-role.ts
ls src/components/settings/                          # куда встаёт OrgSettingsSection

# сегменты
sed -n '1,40p' src/lib/hooks/use-saved-views.ts      # localStorage-вид: {id,label,route,query}
grep -rn "SavedViewChips" src/                       # 4 потребителя — НЕ ломать
grep -n "searchParams\|useProjects\|applyProjectQuickFilter" src/components/projects/ProjectsView.tsx
sed -n '1,25p' src/lib/utils/project-filters.ts
ls tests/unit/ | head

# паттерн «org_id явно, без trg_set_org_id»
grep -n "stage_req_select\|stage_req_insert" supabase/migrations/*.sql docs/schema.md | head
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. Последняя миграция не 075 → номера сдвинуть, сказать в отчёте.
2. У `organizations` уже есть колонка `settings` → часть A выполнена, проверить и доложить.
3. `tests/unit/` нет → тесты некуда класть, `include` в `vitest.config.ts` **не менять**.
4. `tsc` красный до правок.

---

## Часть A — `organizations.settings` (R2-P0-D)

### Миграция `076_org_settings.sql`

```sql
alter table public.organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;
```

Всё. Политики не трогаем.

**⚠️ Ограничение, которое надо честно отразить в UI:** UPDATE на `organizations` —
**owner-only** (`org_update_owner`: `id = current_org_id() AND current_org_role() = 'owner'`,
+ WITH CHECK из 054). Значит настройки правит **только owner**; admin — читает.
Политику под admin в этом спринте **не расширять** (это отдельное продуктовое решение).

### Типы и валидатор

`src/types/database.ts`:

```ts
export type OrgSettings = {
  reconnect_days?: number;              // порог тишины, дни
  stage_dwell_defaults?: { default?: number; [phaseGroup: string]: number | undefined };
};
```

`src/lib/validators/org-settings.ts` — Zod: `reconnect_days` int, clamp **3–90**;
`stage_dwell_defaults` — записи int 1–365. Неизвестные ключи не выбрасывать
(forward-compat), но и не валидировать.

### Хук `src/lib/hooks/use-org-settings.ts`

- `useOrgSettings()` — читает `organizations.settings` текущей org (`current_org_id` уже
  доступен через существующие хуки/`session_gate`; взять способ, которым это делают
  соседние хуки, а не изобретать).
- `useUpdateOrgSettings()` — **merge, не перезапись**: читаем текущий объект, кладём
  `{...current, ...patch}`. Литерал целиком не писать — иначе параллельная правка другого
  ключа затирается.
- `useReconnectDays()` — тонкая обёртка: `useOrgSettings().data?.reconnect_days ??
  DEFAULT_RECONNECT_DAYS`.

`src/lib/constants/reconnect.ts`: переименовать экспорт в `DEFAULT_RECONNECT_DAYS = 21`,
оставить `RECONNECT_THRESHOLD_DAYS` как `@deprecated`-алиас на один спринт, чтобы диф не
разъехался по трём компонентам сразу. Потребителей (`TodayView`, `ContactsTable`,
`CompaniesTable`) перевести на `useReconnectDays()` — это клиентские компоненты, хук законен.

### UI `src/components/settings/OrgSettingsSection.tsx`

Поле «Порог тишины (дней)» + сохранение. Для не-owner — секция **read-only** с явной
подписью «правит владелец организации», не пустой disabled-инпут без объяснения.
Подключить в `SettingsContent.tsx` рядом с `GatesSection`/`AutomationsSection`.

---

## Часть B — `segments` (R2-P0-B)

### Решения ревью, отменяющие архдок

- **F11:** таблицы `segment_user_state` в этом спринте **нет** (pin/hide/last_used на
  5 сегментов и команду 5–15 — преждевременно). Появится по запросу.
- **F10:** импорта localStorage saved-views в сегменты **нет** — там `{route, query}`,
  здесь predicate AST; автоконвертация не окупается. `use-saved-views` и `SavedViewChips`
  **остаются как есть и продолжают работать** на всех четырёх страницах.
- **F5:** предикат v1 — **только AND**. Сид без `OR`.
- **F8:** RLS с явным WITH CHECK против эскалации personal → shared.

### Миграция `077_segments.sql`

```sql
create table if not exists public.segments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  entity      text not null check (entity in ('deals','deliveries','contacts','companies','tasks','leads')),
  predicate   jsonb not null default '{"version":1,"and":[]}'::jsonb,
  is_shared   boolean not null default true,
  owner_id    uuid references public.profiles(id) on delete set null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Уникальность — **двумя partial-индексами**, а не одним `unique (org_id, entity, name)`
(иначе двое пользователей не создадут личный сегмент с одинаковым именем):

```sql
create unique index if not exists uq_segments_shared_name
  on public.segments (org_id, entity, name) where is_shared;
create unique index if not exists uq_segments_personal_name
  on public.segments (org_id, entity, owner_id, name) where not is_shared;
create index if not exists idx_segments_org_entity on public.segments (org_id, entity);
```

Инварианты и триггеры:

- `check (is_shared or owner_id is not null)` — личный сегмент без владельца невозможен.
- `trg_aa_freeze_org_id` (существующая `freeze_org_id()`, паттерн 054) — org_id иммутабелен.
- `trg_set_updated_at` — как в 069.
- **`trg_set_org_id` НЕ вешать** — `org_id` приходит явно из UI (паттерн
  `stage_requirements` / `notifications`).

RLS:

```sql
alter table public.segments enable row level security;

-- читают все члены org
create policy segments_select on public.segments
  for select using (org_id = ( select public.current_org_id() ));

-- писать: shared — owner/admin; personal — только свой
create policy segments_insert on public.segments
  for insert with check (
    org_id = ( select public.current_org_id() )
    and (
      ( is_shared and ( select public.current_org_role() ) in ('owner','admin') )
      or ( not is_shared and owner_id = auth.uid() )
    )
  );
```

`segments_update` — тот же предикат **и в USING (старая строка), и в WITH CHECK (новая)**,
как в 059: иначе manager перекинет свой личный сегмент в shared. `segments_delete` — USING
по тому же предикату.

**Урок 075 — обязателен:** дефолтные привилегии Supabase дают `authenticated` всё на новую
таблицу, `grant` ничего не сужает. Явно:

```sql
revoke all on public.segments from anon;
revoke truncate, references, trigger on public.segments from authenticated;
grant select, insert, update, delete on public.segments to authenticated;   -- поверх RLS
```

### Сид (идемпотентный, по всем существующим org)

```sql
insert into public.segments (org_id, name, entity, predicate, is_shared, sort_order)
select o.id, v.name, 'deals', v.predicate, true, v.sort_order
from public.organizations o
cross join (values
  ('Без next_step', '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"next_step","op":"is_null"}]}'::jsonb, 10),
  ('Без даты действия', '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"next_action_date","op":"is_null"}]}'::jsonb, 20),
  ('Просрочен next action', '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"next_action_date","op":"days_since_gt","value":0}]}'::jsonb, 30),
  ('ERP в работе', '{"version":1,"and":[{"field":"status","op":"eq","value":"open"},{"field":"direction","op":"eq","value":"erp"}]}'::jsonb, 40)
) as v(name, predicate, sort_order)
on conflict do nothing;
```

`on conflict do nothing` работает по partial-индексу shared-имён → повторный apply
безопасен. Сегмент «Тихо >N дней» **не сидируем**: `last_touch` считается на клиенте
(`useLastTouchMap`), в строке `contacts` его нет — это P1 (`contact_last_touch`).

### Контракт предиката (TS)

`src/types/database.ts`:

```ts
export type SegmentEntity = 'deals' | 'deliveries' | 'contacts' | 'companies' | 'tasks' | 'leads';
export type SegmentOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'contains' | 'is_null' | 'not_null'
  | 'days_since_gt' | 'days_since_lt';
export type SegmentClause = { field: string; op: SegmentOp; value?: string | number | boolean | string[] };
export type SegmentPredicate = { version: 1; and: SegmentClause[] };
```

Whitelist полей — **только `deals`** в v1 (`src/lib/constants/segments.ts`):
`status`, `stage_id`, `direction`, `owner_id`, `budget`, `next_action_date`, `next_step`,
`stage_entered_at`, `probability`, `company_id`. Остальные сущности объявлены в CHECK, но
UI для них не подключаем — иначе спринт раздувается вчетверо.

### Чистый вычислитель + тесты

`src/lib/domain/segment-eval.ts` — `matchSegment(row, predicate): boolean`, без React, без
Supabase. **Семантику null задать явно и покрыть тестами** (это то, что архдок не
специфицировал):

- `is_null` / `not_null` — единственные операторы, определённые на `null`.
- Любой другой оператор при `null`-значении поля → **`false`** (не «истина по умолчанию»).
- `days_since_gt: N` — `(сегодня − значение) > N` в днях по **MSK-дню** (`mskDateKey` из
  `date-helpers.ts`, не UTC и не браузерный TZ — иначе на границе суток сегмент «просрочен»
  мигает). Для `null` → false.
- `contains` — регистронезависимо, только по text-полям.
- `in` — значение массив; несовпадение типов → false, не throw.
- Неизвестное поле (нет в whitelist) или неизвестный оператор → клауза **false** + один
  `console.warn`, а не исключение: сегмент, созданный будущей версией, не должен ломать
  страницу.

Тесты — `tests/unit/segment-eval.test.ts`: по одному кейсу на оператор + null-матрица +
пустой `and` (возвращает все строки) + смешанный предикат из 3 клауз.

### Хуки и UI

- `src/lib/hooks/use-segments.ts` — `useSegments(entity)` (list, `queryKey: ['segments',
  orgId, entity]`), `useCreateSegment` / `useUpdateSegment` / `useDeleteSegment` с
  оптимистиком по образцу `use-stage-requirements.ts` (`org_id` пишем явно).
- `src/components/shared/SegmentsBar.tsx` — чипы сегментов, активный из URL `?segment=<uuid>`;
  клик — переключение. Права на редактирование — через `useOrgRole` (shared правит
  owner/admin; свой личный — автор).
- `src/components/shared/SegmentEditorModal.tsx` — форма: имя, «общий/личный», конструктор
  клауз (поле из whitelist → оператор → значение). **Не JSON-редактор** — менеджеру его не
  показывать.
- Интеграция — **только `ProjectsView` (`/deals`)**: после фильтрации `applyProjectQuickFilter`
  прогоняем `matchSegment` по активному сегменту. Существующие `?view` / `?direction` / `?q`
  и `SavedViewChips` продолжают работать и **комбинируются** с сегментом (AND).

`?segment=<uuid>` — источник истины в URL (шарится ссылкой); сам предикат в URL не кладём.

### Осознанные границы v1

- Вычисление **на клиенте**, поверх уже загруженного списка сделок. Порог, после которого
  нужен SQL-RPC, — **~5k строк** на сущность; записать это в комментарий шапки
  `segment-eval.ts`, чтобы решение было воспроизводимым, а не «забыли».
- `OR`-групп нет. Сортировки/шаринга по пользователям нет. Уведомлений по сегменту нет.

---

## VERIFY / коммит

```bash
npx tsc --noEmit                                            # 0
npx eslint src/lib src/components/shared src/components/settings src/components/projects   # 0 (scoped, НЕ npm run lint)
npx vitest run tests/unit/segment-eval                      # зелёный
npm test                                                    # полный прогон
grep -rn ": any" src/lib/domain src/lib/hooks/use-segments.ts src/components/shared/SegmentsBar.tsx  # пусто
grep -rn "RECONNECT_THRESHOLD_DAYS" src/                    # только алиас в constants
git --no-pager diff --stat
```

Миграции **не применять** — 076/077 только коммитим, apply на гейте Cowork
(apply_migration → gen-types → advisors → ролевые смоки).

Смоук после apply (гейт): owner создаёт shared-сегмент → виден второму пользователю;
manager пытается создать shared → отказ RLS, личный создаётся; сегмент + чип `?direction`
вместе фильтруют корректно; порог тишины меняется в Настройках и `TodayView` реагирует;
не-owner видит секцию настроек read-only.

Коммит один:

```
feat(r2): серверные сегменты + настройки организации (R2-P0-B/D)
```

**Не пушить.** В отчёте: что показал смоук ролями (owner/admin/manager/viewer) по
`segments`, какие кейсы vitest добавлены, и сработал ли `on conflict do nothing` на
повторном сиде.
