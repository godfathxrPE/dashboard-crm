# Спринт S-R2-D3 — Карта стейкхолдеров сделки

**Вход:** `main` = `6137faf`, миграции 001–091, следующая свободная — **092**.
**Ветка:** `feat/r2-stakeholders`
**Baseline:** lint 15 errors / 34 warnings, тестов 585.
**Миграция есть** → CC пишет файл и коммитит, **не применяет**. Apply, advisors и ролевые
смоки — операция гейта.

---

## Архитектура (прочитать до кода)

### Проблема

`projects.contact_id` — **скаляр**. У B2B-сделки на 1–10 млн ₽ участников 3–5 с разными
функциями: кто подписывает, кто платит, кто заблокирует на техническом ревью, кто продаёт
идею внутри. Сейчас в сделке помещается один, остальные живут в голове.

### Как это решено в других CRM

| Платформа | Механика |
|---|---|
| **Salesforce** | `OpportunityContactRole` — junction Opportunity↔Contact с picklist `Role` и флагом `IsPrimary`. Классика, ей 20 лет. |
| **HubSpot** | Association Deal↔Contact с **association labels** (Decision maker, Influencer, Budget holder) — та же junction, роль вынесена в лейбл связи. |
| **Pipedrive** | У сделки один Person + отдельный список **Participants** — то есть скаляр остался, а множество добавлено рядом. |

Берём модель Salesforce/HubSpot (junction с ролью), но **primary держим как Pipedrive** —
через существующий `projects.contact_id`, не дублируя флаг в junction. Причина ниже.

### Решения и обоснования

**1. `projects.contact_id` не трогаем, `is_primary` в новой таблице НЕ заводим.**
Основной контакт остаётся один и живёт там, где живёт сейчас: `contact_id` читают карточка
сделки (`ProjectDetail:644-650`), чеклист полноты (`:99`) и запросы `use-projects`.
Дублировать «главность» флагом в junction — значит завести второй источник истины и
синхронизацию между ними. Ровно на этом обжёгся хвост #5 (`companies.phone` ↔ `phones[]`):
инвариант держался только клиентом и ничем не был защищён в БД.
**Primary вычисляется:** стейкхолдер, у которого `contact_id = projects.contact_id`.

**Следствие для UI:** строку основного контакта из карты **нельзя удалить** — она меняется
через поле «Контакт» самой сделки. Это надо показать, а не молча запретить.

**2. Триггера синхронизации нет.** Любой UPDATE `projects` дёргает `trg_zz_run_automations`
и цепочку BEFORE-синков; писать в `projects` из триггера на junction — значит запускать
движок автоматизаций побочным эффектом добавления контакта. Не делаем.

**3. Роль — закрытый словарь, а НЕ `contact_company.role`.**
Проверено SQL 02.08: `contact_company.role` — свободный текст **должностей**
(«Генеральный директор» ×4, «Главный механик», «Сисадм,програм-ст,ITшник», одна строка
`ts_Принимает решение` — мусор импорта), и он **пуст в 61 строке из 83**. Это должность,
дубль `contacts.position`, а не роль в сделке. Сверка входа в P2 записала «22 роли — минимум
данных есть»: для D3 это **неверно**, полезных данных ноль. Роль в сделке — новое измерение,
и стартует оно пустым. Это нормально: заполняет его один человек по ходу своих пресейлов,
командного наполнения фича не требует.

Словарь (6 значений, MEDDIC-совместимый):

| Ключ | Русский ярлык | Цвет `Badge` |
|---|---|---|
| `decision_maker` | ЛПР | `red` |
| `economic_buyer` | Держатель бюджета | `accent` |
| `champion` | Чемпион | `green` |
| `expert` | Технический эксперт | `blue` |
| `end_user` | Конечный пользователь | `purple` |
| `blocker` | Блокер | `yellow` |

`role` **nullable**: контакт можно добавить в карту раньше, чем понял его роль. Заставлять
выбирать роль при добавлении — способ получить 60% `decision_maker` по умолчанию.

**4. Второе измерение (отношение: сторонник/нейтрал/противник) НЕ заводим.**
Полноценная карта стейкхолдеров двумерна — власть × отношение. Но `champion` и `blocker` в
словаре ролей уже покрывают крайние случаи, а строить матрицу на двух открытых сделках —
это моделирование вперёд данных. Записать в бэклог, вернуться, когда карт наберётся 10+.

**5. Hard delete, без `deleted_at`.** Junction-связь — не бизнес-запись. Прямой прецедент в
проекте: `contact_company` и `project_members` удаляются физически. Мягкое удаление ссылки
породило бы «невидимые» строки, ломающие `unique (project_id, contact_id)`.

**6. Структурный прецедент для копирования — `project_members` (миграция 037).**
Та же форма: org-junction на проект, RLS по org + роль, хук с `useRealtimeSync`, константа
порядка ролей, чистый хелпер группировки под юнит-тест, дружелюбный текст на unique violation.
Читать `src/lib/hooks/use-project-members.ts` **до** написания нового хука и повторять
структуру, а не изобретать.

### RBAC / RLS матрица

```
             | Read | Create | Update role | Delete |
owner        |  ✓   |   ✓    |     ✓       |   ✓    |
admin        |  ✓   |   ✓    |     ✓       |   ✓    |
manager      |  ✓   |   ✓    |     ✓       |   ✓    |
viewer       |  ✓   |   ✗    |     ✗       |   ✗    |
```

`manager` получает и delete тоже — намеренно, в отличие от `contact_company` (там delete
только owner/admin). Асимметрия «добавить может, убрать не может» гарантирует мусор в карте,
а риск от удаления ссылки нулевой: контакт и сделка остаются.

**Найденный попутно дефект (в этом спринте НЕ чиним, идёт в бэклог):** у `contact_company`
**нет UPDATE-политики вообще** — роль контакта в компании нельзя отредактировать, только
удалить связь и создать заново.

---

## РАЗВЕДКА (выполнить до правок)

```bash
git checkout -b feat/r2-stakeholders

# 1. Структурный образец — читать целиком, повторять форму
cat src/lib/hooks/use-project-members.ts
grep -n "PROJECT_MEMBER_ROLE_ORDER" -A 10 src/lib/constants/delivery-phases.ts

# 2. Миграция-образец junction с org_id (037) — триггеры и политики
sed -n '1,80p' supabase/migrations/037_*.sql
ls supabase/migrations/ | tail -5   # убедиться, что 092 свободна

# 3. Куда встраивать UI: инфо-грид карточки сделки
grep -n "Контакт" src/components/projects/ProjectDetail.tsx

# 4. Компонент выбора из списка (Combobox / AssigneeSelect) — точное имя и путь
find src -iname "*combobox*" -o -iname "*AssigneeSelect*"

# 5. Тесты-образцы для чистых хелперов
ls tests/unit/ | head -20
sed -n '1,30p' tests/unit/project-members.test.ts
```

---

## ЗАДАЧА 1 — Миграция 092: таблица, RLS, индексы

Файл `supabase/migrations/092_deal_stakeholders.sql`. **Не применять** — только написать и
закоммитить.

```sql
-- ═══════════════════════════════════════════════════════
-- 092 — deal_stakeholders: карта участников сделки со стороны клиента.
--
-- Аналог OpportunityContactRole (Salesforce) / association labels (HubSpot).
-- Основной контакт НЕ дублируется флагом: primary = строка, где
-- contact_id = projects.contact_id. Второго источника истины нет, синка нет.
--
-- Откат: drop table public.deal_stakeholders cascade;
--        alter publication supabase_realtime drop table public.deal_stakeholders;
-- ═══════════════════════════════════════════════════════

create table if not exists public.deal_stakeholders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid not null references public.projects(id)      on delete cascade,
  contact_id  uuid not null references public.contacts(id)      on delete cascade,
  role        text,
  note        text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint deal_stakeholders_role_chk check (
    role is null or role in
      ('decision_maker','economic_buyer','champion','expert','end_user','blocker')
  ),
  constraint deal_stakeholders_uniq unique (project_id, contact_id)
);

create index if not exists idx_deal_stakeholders_project on public.deal_stakeholders(project_id);
create index if not exists idx_deal_stakeholders_contact on public.deal_stakeholders(contact_id);
create index if not exists idx_deal_stakeholders_org     on public.deal_stakeholders(org_id);

alter table public.deal_stakeholders enable row level security;

-- Initplan-паттерн: no-arg STABLE в ( SELECT ... ) считается раз на запрос, не на строку.
create policy ds_select on public.deal_stakeholders for select
  using (org_id = ( select public.current_org_id() ));

create policy ds_insert on public.deal_stakeholders for insert
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

create policy ds_update on public.deal_stakeholders for update
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

create policy ds_delete on public.deal_stakeholders for delete
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

-- org_id: проставляется при INSERT и иммутабелен после (конвенция 054)
create trigger trg_set_org_id       before insert on public.deal_stakeholders
  for each row execute function public.set_org_id();
create trigger trg_aa_freeze_org_id before update of org_id on public.deal_stakeholders
  for each row when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();
create trigger trg_set_updated_at   before update on public.deal_stakeholders
  for each row execute function public.update_updated_at();

alter publication supabase_realtime add table public.deal_stakeholders;
```

**Обязательные сверки перед тем, как записать файл** (память врёт, живая БД — нет):

- имена функций: `set_org_id`, `freeze_org_id`, `update_updated_at` — сверить с 037/088,
  не изобретать;
- `WITH CHECK` на UPDATE обязателен (054 закрывал именно межтенантный перенос строки);
- `IF NOT EXISTS` там, где поддерживается; `create policy` его не поддерживает — это норма;
- **backfill в этом спринте не делаем.** Существующий `projects.contact_id` в карту не
  переносим: primary вычисляется, дублировать его строкой не нужно.

### Проверка

```bash
ls supabase/migrations/092_deal_stakeholders.sql
grep -c "create policy" supabase/migrations/092_deal_stakeholders.sql   # 4
```

---

## ЗАДАЧА 2 — Типы и константы

**2.1.** Типы БД **регенерировать**, не писать руками:

```bash
npm run db:gen-types    # целится в src/types/supabase.gen.ts
```

⚠️ Реген возможен **только после того, как гейт применит миграцию** — в БД таблицы пока нет.
Поэтому в этом спринте: написать доменные типы руками в `src/types/database.ts`
(это hand-authored файл, 736 строк, генератор его не трогает), а реген
`supabase.gen.ts` оставить гейту. В отчёте отметить, что реген не выполнен и почему.

**2.2.** `src/types/database.ts` — доменный union рядом с существующими:

```ts
export const STAKEHOLDER_ROLES = [
  'decision_maker', 'economic_buyer', 'champion', 'expert', 'end_user', 'blocker',
] as const;
export type StakeholderRole = (typeof STAKEHOLDER_ROLES)[number];
```

**2.3.** `src/lib/constants/stakeholders.ts` — ярлыки, цвета и порядок вывода:

```ts
import type { BadgeColor } from '@/components/ui/Badge';
import type { StakeholderRole } from '@/types/database';

/** Порядок = убывание влияния на сделку. Им же сортируется карта. */
export const STAKEHOLDER_ROLE_ORDER: readonly StakeholderRole[] = [
  'decision_maker', 'economic_buyer', 'champion', 'expert', 'end_user', 'blocker',
];

export const STAKEHOLDER_ROLE_CONFIG: Record<StakeholderRole, { label: string; color: BadgeColor }> = {
  decision_maker: { label: 'ЛПР',                   color: 'red' },
  economic_buyer: { label: 'Держатель бюджета',     color: 'accent' },
  champion:       { label: 'Чемпион',               color: 'green' },
  expert:         { label: 'Технический эксперт',   color: 'blue' },
  end_user:       { label: 'Конечный пользователь', color: 'purple' },
  blocker:        { label: 'Блокер',                color: 'yellow' },
};
```

Типизировать `color` сразу `BadgeColor` — не повторять хвост #7, где `string` заставлял
кастовать в каждом месте рендера.

**2.4.** Zod-схема `src/lib/validators/stakeholder.ts`: `project_id`/`contact_id` — uuid,
`role` — `z.enum(STAKEHOLDER_ROLES).nullable()`, `note` — `z.string().max(500).nullable()`.

### Проверка

```bash
npx tsc --noEmit
grep -n "STAKEHOLDER_ROLE_CONFIG" src/lib/constants/stakeholders.ts
```

---

## ЗАДАЧА 3 — Хук `use-deal-stakeholders.ts`

Структуру **копировать с `use-project-members.ts`**, не изобретать: тот же ключ-префикс =
имя таблицы, тот же `useRealtimeSync`, тот же чистый хелпер под юнит-тест, тот же дружелюбный
текст на unique violation.

**3.1.** `src/lib/hooks/use-deal-stakeholders.ts`:

- `useDealStakeholders(projectId)` — `queryKey: ['deal_stakeholders', projectId]`,
  select `'*, contact:contacts(id, first_name, last_name, position, email, phone, phones)'`,
  `.eq('project_id', projectId)`, `enabled: !!projectId`;
- `useAddStakeholder` / `useUpdateStakeholder` / `useRemoveStakeholder` — все три с
  **optimistic update** по конвенции проекта: `cancelQueries` → сохранить прежнее →
  оптимистично поменять кеш → rollback в `onError` → `invalidateQueries` в `onSettled`;
- unique violation (`23505`) → сообщение «Контакт уже в карте сделки», не сырая ошибка PG.

**3.2.** Чистый хелпер там же (без React, чтобы тестировался напрямую):

```ts
export interface StakeholderRow { id: string; contact_id: string; role: StakeholderRole | null; /* … */ }

/**
 * Карта для отображения: сначала основной контакт сделки (primary — тот, чей contact_id
 * совпадает с projects.contact_id), затем остальные по STAKEHOLDER_ROLE_ORDER,
 * внутри роли — по created_at. Строки без роли — в конец.
 */
export function sortStakeholders<T extends StakeholderRow>(
  rows: readonly T[],
  primaryContactId: string | null,
): Array<T & { isPrimary: boolean }>
```

**3.3.** Тесты `tests/unit/deal-stakeholders.test.ts` — минимум:

- primary поднимается наверх независимо от роли;
- порядок ролей соответствует `STAKEHOLDER_ROLE_ORDER`;
- `role = null` уходит в конец, а не в начало;
- `primaryContactId = null` — не падает, порядок только по ролям;
- контакт с ролью `blocker`, совпадающий с primary, всё равно первый (primary сильнее роли).

### Проверка

```bash
npx tsc --noEmit
npm test -- deal-stakeholders
```

---

## ЗАДАЧА 4 — Блок «Стейкхолдеры» на карточке сделки

**4.1.** `src/components/projects/DealStakeholders.tsx`. Место — карточка сделки
(`ProjectDetail`), под инфо-гридом, **до** блока «Активность». Рендерить для всех типов
проектов (у внедрения участники со стороны клиента тоже есть).

Строка: имя контакта (ссылка на `/contacts/<id>`) · `position` мелким · `<Badge>` роли ·
`note` мелким · действия. Пустая роль — ярлык «роль не указана» в `text-mute`, не пустое
место: это подсказка, что поле стоит заполнить.

**4.2.** Правило primary — показывать, а не прятать:

- строка основного контакта помечена (например, «основной» мелким рядом с именем);
- у неё **нет** кнопки удаления; вместо неё подпись/тултип «меняется в поле „Контакт“ сделки»;
- роль у primary редактируется как у всех, если для него есть строка в `deal_stakeholders`.
  Если строки нет — показать его как строку без роли с действием «указать роль», которое
  создаёт запись.

**4.3.** Добавление: выбор контакта существующим компонентом выбора (найти шагом 4 разведки —
`Combobox` / `AssigneeSelect`, **не заводить новый**). Список — контакты организации,
контакты компании сделки **сверху**. Уже добавленные — исключить из списка (не полагаться
только на unique violation).

**4.4.** Права — `role !== 'viewer'` через `useOrgRole()`, как в остальных местах. Кнопок
добавления/удаления у viewer нет вовсе. Это UI-зеркало RLS, не замена ей.

**4.5.** Состояния обязательны: loading (скелет или «…»), error (текст, не пустота),
empty («Участники не указаны» + кнопка добавления при наличии прав).

**4.6.** `window.confirm` **запрещён** в проекте (блокирует браузерные смоки). Подтверждение
удаления — inline-строкой «Удалить? Да / Отмена» внутри строки списка.

**4.7.** Ноль хардкод-цветов: только токены и `Badge`. Иконки — Lucide.

### Проверка

```bash
npx tsc --noEmit
npm run lint
grep -rn "window.confirm" src/components/projects/DealStakeholders.tsx   # 0
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint      # сравнить с baseline 15 / 34
npm test          # baseline 585 + новые из ЗАДАЧИ 3
# dev-сервер остановить, build последним
npm run build
```

UI до применения миграции гейтом работать не будет (таблицы нет) — это ожидаемо.
**Не пытаться применить миграцию, чтобы «проверить в браузере».**

В отчёт вынести:

- что реген `supabase.gen.ts` не выполнен и почему (таблицы ещё нет в БД);
- дельту lint и тестов к baseline;
- как именно решён случай «primary без строки в `deal_stakeholders`»;
- какой компонент выбора контакта переиспользован (точный путь).

---

## КОММИТ

```bash
git add .
git commit -m "feat(deals): карта стейкхолдеров сделки

- миграция 092: deal_stakeholders (junction project↔contact + роль), RLS на 4 операции
- словарь ролей: ЛПР / держатель бюджета / чемпион / эксперт / пользователь / блокер
- primary не дублируется: вычисляется по projects.contact_id, синка нет
- хук use-deal-stakeholders с optimistic updates + sortStakeholders под юнит-тест
- блок «Стейкхолдеры» на карточке сделки"
```

**Не мержить.** Отчёт — на гейт.

---

## Что гейт сделает после приёмки

1. `apply_migration` 092 через Supabase MCP.
2. `get_advisors` — сравнить набор WARN с прежним.
3. Ролевые смоки через подмену `request.jwt.claims`: **owner** (полный доступ), **manager**
   (insert/update/delete проходят), **viewer** (select — да, insert — 42501),
   **чужак** со случайным uuid (select → 0 строк), **tamper** (явный чужой `org_id` в INSERT →
   отказ).
4. Реген типов CLI (`npm run db:gen-types`) — MCP-реген не отдаёт `graphql_public`.
5. `docs/schema.md` + `references/schema.md` — блок 092 тем же заходом.
6. Убрать тестовые строки за собой.

---

## Что НЕ входит

| | Почему |
|---|---|
| Второе измерение (отношение: сторонник/нейтрал/противник) | Матрица власть × отношение на двух открытых сделках — моделирование вперёд данных. `champion`/`blocker` покрывают края. Вернуться при 10+ заполненных картах. |
| Backfill `projects.contact_id` → строки карты | Primary вычисляется, дублировать нечего. |
| Стейкхолдеры в peek-панели сделки и в `DealFocusPanel` | Сначала посмотреть, приживётся ли блок на карточке. Дешёвое добавление потом. |
| Пункт «Стейкхолдеры» в чеклисте полноты данных | Оценочное решение: сделать поле обязательным до того, как им начали пользоваться, — способ получить формальные заполнения. |
| UPDATE-политика для `contact_company` | Найдено разведкой этого спринта, но чужая таблица и чужой сценарий — отдельной строкой в бэклог. |
