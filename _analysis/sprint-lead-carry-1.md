# Claude Code Prompt — Sprint S-LEAD-CARRY-1: конверсия переносит квалификацию

Добор к варианту B (`_analysis/leads-entity-design.md`, §5). 119 научила `convert_lead`
переносить **историю** (звонки/задачи) и **боль/ЧЗ/дедлайн в заметку сделки**. Три поля
квалификации при этом по-прежнему испаряются или оседают только текстом:

| Поле лида | Сегодня | Должно быть |
|---|---|---|
| `decision_role` | нигде — карта стейкхолдеров сделки создаётся с нуля | строка в `deal_stakeholders` |
| `budget_status` | теряется совсем | строка в `pinned_note` сделки |
| `chz_groups` | текстом в `pinned_note`, в компанию **не попадает** | колонка `companies.chz_groups` |

Третий — главный вдолгую: маркировочный профиль это свойство **компании** (что она
производит), а не разовой сделки. Через год на второй сделке его выясняют заново.

## Границы

- **Миграция одна** — `123_lead_convert_carryover.sql`. Пишется и коммитится,
  **не применяется**: apply у гейта Cowork.
- **Реген типов в CC не делается** (миграция не применена) — колонка добирается стабом
  в `src/types/database.ts` по конвенции проекта, реген снимает стаб на гейте.
- **`regulatory_deadline` в компанию не переезжает.** Дедлайн — свойство товарной группы
  (справочник `chz-groups.ts`, поле `since`), а не компании: перенося его в `companies`,
  мы бы завели вторую копию даты, которая молча разойдётся со справочником. У компании
  живут группы, дата выводится из них.
- **Слияние профилей не делаем.** Если у компании `chz_groups` уже заполнены — конверсия
  их **не трогает** (заполняем только пустое). Автослияние массивов молча смешало бы
  профили двух разных лидов; расхождение вместо этого видно человеку: `pinned_note`
  сделки всегда несёт строку «ЧЗ-группы: …» с тем, что сказал лид.

## РАЗВЕДКА

```sql
-- 1. Номер миграции — ledger целиком, не `ls`
select version, name from supabase_migrations.schema_migrations order by version desc limit 5;
-- ожидание: последняя 20260810121513 realtime_core_tables (122) ⇒ файл 123_

-- 2. Живое тело функции (правим ЕГО, не файл 119 из репо)
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname='convert_lead';

-- 3. Домен ролей — зеркало, которое надо повторить в CHECK на leads
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.deal_stakeholders'::regclass and contype='c';
-- ожидание: role ∈ decision_maker|economic_buyer|champion|expert|end_user|blocker

-- 4. Сколько строк заденет CHECK и бэкфилл СЕГОДНЯ
select count(*) filter (where decision_role is not null) as with_role,
       count(*) filter (where status='converted' and chz_groups is not null) as converted_chz
from leads;
-- снято 2026-08-11: 0 и 0. Это ОСОЗНАННО: CHECK валидируется мгновенно,
-- бэкфилла конвертированных лидов в спринте НЕТ (нечего переносить).
-- Если разведка покажет ненулевые значения — ОСТАНОВИСЬ и сообщи: нужен
-- отдельный блок бэкфилла и пересмотр CHECK (возможно NOT VALID).
```

```bash
grep -n "matchChzGroups" src/components/companies/CompanyDetail.tsx   # ждём :11 и :146
grep -n "chzGroups" src/components/companies/CompanySidebar.tsx src/components/companies/CompanyHighlights.tsx
grep -n "decision_role" src/components/leads/LeadModal.tsx            # ждём select по STAKEHOLDER_ROLE_ORDER
ls src/lib/domain/ | head -30                                         # куда ляжет chz-profile.ts
```

Факты, снятые разведкой 2026-08-11 (живая БД + репо на `main` = `24e03f3`):

| Что | Где | Состояние |
|---|---|---|
| `convert_lead` | прод, из 119 | SECURITY DEFINER, `search_path=public,pg_temp`; переносит calls/tasks и пишет `pinned_note` (боль/ЧЗ/дедлайн) |
| `companies` | схема | колонки под ЧЗ **нет**; профиль на карточке считается `matchChzGroups(company.okved)` |
| `leads.decision_role` | схема | `text`, **CHECK отсутствует** (`database.ts:587` честно пишет «БД её не проверяет») |
| `deal_stakeholders` | 092 | `uniq(project_id, contact_id)`, `role` CHECK-словарь, `trg_set_org_id`, RLS org-first (insert: owner/admin/manager) |
| ЧЗ-профиль компании | `CompanyDetail.tsx:146` → Highlights + Sidebar | derived-only, `ChzGroup[]` из ОКВЭД |
| Зеркало справочника | `src/lib/data/chz-groups.ts` ↔ `supabase/functions/ai-run/chz-groups.ts` | байт-в-байт, страж — `tests/unit/chz-groups.test.ts` |
| Ярлыки бюджета | `src/lib/validators/lead.ts:60` | `Не выяснен / Нет бюджета / Оценён / Подтверждён` |

---

## ЗАДАЧА 1 — миграция `supabase/migrations/123_lead_convert_carryover.sql`

Создай файл целиком. **Тело `convert_lead` бери из разведки (шаг 2) и меняй минимально** —
ниже показаны только вставки и их места. Не переписывай функцию «по памяти»: файл 119 в
репо и живое тело уже расходились однажды (прод был сломан на `user_id`, поймали на гейте).

```sql
-- 123_lead_convert_carryover.sql — S-LEAD-CARRY-1
--
-- Конверсия лида перестаёт терять квалификацию. Три переноса:
--   1. decision_role → строка в deal_stakeholders (карта сделки начинается с контакта лида)
--   2. budget_status → строка в pinned_note сделки
--   3. chz_groups    → companies.chz_groups (маркировочный профиль КОМПАНИИ)
--
-- НЕ ПРИМЕНЯТЬ из Claude Code. apply — гейт Cowork через Supabase MCP.

-- ═══ 1. Подтверждённый маркировочный профиль компании ═══
--
-- Отличие от matchChzGroups(okved): та функция ВЫВОДИТ гипотезу из кода реестра,
-- эта колонка хранит ПОДТВЕРЖДЁННОЕ человеком — что клиент реально маркирует.
-- Компания с ОКВЭД 46.x (оптовая торговля) может возить обувь и молоко; ОКВЭД об
-- этом не знает, продавец знает. Две сущности, не дубль: derived остаётся видимой
-- как предположение, declared побеждает при рендере.
alter table public.companies
  add column if not exists chz_groups text[];

comment on column public.companies.chz_groups is
  'Подтверждённые товарные группы «Честного Знака» (названия из lib/data/chz-groups.ts). '
  'NULL = не выяснено; ''{}'' = выяснено, что групп нет. Гипотеза по ОКВЭД считается '
  'кодом (matchChzGroups) и этой колонкой не заменяется.';

-- ═══ 2. CHECK на leads.decision_role — зеркало deal_stakeholders_role_chk ═══
--
-- Поле с самого начала было словарным (LeadModal рендерит <select> по
-- STAKEHOLDER_ROLE_ORDER), но БД его не проверяла. Пока значение никуда не уезжало,
-- цена была нулевой; теперь оно едет в deal_stakeholders с закрытым CHECK — чужое
-- значение уронит КОНВЕРСИЮ ошибкой 23514 в момент, когда её меньше всего ждут.
-- Домен закрывается на входе, а не разбирается на выходе.
--
-- На 2026-08-11 строк с decision_role ноль ⇒ валидируется мгновенно, NOT VALID не нужен.
alter table public.leads
  drop constraint if exists leads_decision_role_check;

alter table public.leads
  add constraint leads_decision_role_check check (
    decision_role is null or decision_role = any (array[
      'decision_maker','economic_buyer','champion','expert','end_user','blocker'
    ])
  );

-- ═══ 3. convert_lead v3 ═══
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_company_name text default null,
  p_contact_first_name text default null,
  p_contact_last_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_direction text default 'iiot',
  p_deal_title text default null,
  p_deal_amount numeric default null,
  p_company_id uuid default null,
  p_contact_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_lead public.leads%rowtype;
  v_user_id uuid;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_pipeline_id uuid;
  v_first_stage_id uuid;
  v_lead_title text;
  v_note text;
  v_budget_label text;   -- 123
BEGIN
  --  ⬇⬇⬇  БЛОКИ «S25 гард», «1. Компания», «2. Контакт», «3. Связь контакт—компания»
  --       ПЕРЕНОСИ ИЗ ЖИВОГО ТЕЛА БЕЗ ИЗМЕНЕНИЙ  ⬇⬇⬇

  -- ... (гард, v_lead, v_user_id, v_lead_title, блок 1, блок 2, блок 3 — как есть) ...

  -- ═══ 123-A: маркировочный профиль лида → компания ═══
  -- Стоит СРАЗУ после блока 1 (v_company_id уже определён) и до создания сделки:
  -- профиль компании не должен зависеть от того, чем кончится вставка сделки.
  --
  -- `where c.chz_groups is null` — заполняем только пустое. Компания, у которой
  -- профиль уже подтверждён, конверсией не перезаписывается: расхождение с тем,
  -- что сказал лид, останется видимым в pinned_note сделки и разберёт его человек.
  -- Пустой массив у лида сюда не едет (это «выяснили, что групп нет» у ЛИДА,
  -- а не подтверждение по компании).
  IF v_lead.chz_groups IS NOT NULL AND array_length(v_lead.chz_groups, 1) > 0 THEN
    UPDATE public.companies c
       SET chz_groups = v_lead.chz_groups
     WHERE c.id = v_company_id
       AND c.chz_groups IS NULL;
  END IF;

  --  ⬇⬇⬇  БЛОКИ «4. Pipeline + первая стадия» и «5. Сделка» — БЕЗ ИЗМЕНЕНИЙ  ⬇⬇⬇

  -- ... (блок 4, блок 5 → v_deal_id) ...

  -- ═══ 123-B: контакт лида → карта стейкхолдеров сделки ═══
  -- Строка создаётся ВСЕГДА, даже когда роль не выяснена: контакт, с которым вели
  -- лид, — уже участник решения, а `role IS NULL` карта рендерит честной подписью
  -- «роль не указана» (STAKEHOLDER_ROLE_EMPTY_LABEL). Пустая карта у только что
  -- созданной сделки — потеря знания, а не чистота.
  --
  -- org_id ЯВНО из строки лида, не из current_org_id(): функция SECURITY DEFINER и
  -- обязана работать в service-контексте, где auth.uid() = NULL и helper вернёт NULL
  -- (учебный инцидент 024). trg_set_org_id явное значение переживает — он пишет
  -- только при NULL.
  --
  -- ON CONFLICT — по deal_stakeholders_uniq(project_id, contact_id). У свежей сделки
  -- конфликта быть не может; строка стоит ради идемпотентности повторного вызова.
  INSERT INTO public.deal_stakeholders (org_id, project_id, contact_id, role)
  VALUES (v_lead.org_id, v_deal_id, v_contact_id, v_lead.decision_role)
  ON CONFLICT (project_id, contact_id) DO NOTHING;

  --  ⬇⬇⬇  БЛОК «119: перенос истории лида» (calls/tasks) — БЕЗ ИЗМЕНЕНИЙ  ⬇⬇⬇

  -- ... (UPDATE calls, UPDATE tasks — как есть) ...

  -- ═══ 123-C: бюджет → строка заметки ═══
  -- Ярлыки — зеркало LEAD_BUDGET_STATUS_CONFIG (src/lib/validators/lead.ts:60).
  -- Дубль осознанный и того же класса, что chz-groups клиент↔edge: SQL не читает
  -- модули TS. Меняешь ярлык в конфиге — меняй здесь.
  -- `unknown` не пишется: «бюджет не выяснен» — это отсутствие знания, а строка
  -- о нём в закреплённой заметке создаёт вид, что вопрос закрыт.
  v_budget_label := CASE v_lead.budget_status
    WHEN 'none'      THEN 'Нет бюджета'
    WHEN 'estimated' THEN 'Оценён'
    WHEN 'confirmed' THEN 'Подтверждён'
    ELSE NULL
  END;

  v_note := concat_ws(e'\n',
    nullif('Боль: ' || v_lead.pain, 'Боль: '),
    CASE WHEN v_budget_label IS NOT NULL
         THEN 'Бюджет: ' || v_budget_label END,
    CASE WHEN v_lead.chz_groups IS NOT NULL AND array_length(v_lead.chz_groups, 1) > 0
         THEN 'ЧЗ-группы: ' || array_to_string(v_lead.chz_groups, ', ') END,
    CASE WHEN v_lead.regulatory_deadline IS NOT NULL
         THEN 'Дедлайн маркировки: ' || to_char(v_lead.regulatory_deadline, 'DD.MM.YYYY') END
  );

  IF v_note IS NOT NULL AND v_note <> '' THEN
    UPDATE public.projects p
       SET pinned_note = v_note
     WHERE p.id = v_deal_id
       AND (p.pinned_note IS NULL OR p.pinned_note = '');
  END IF;

  --  ⬇⬇⬇  БЛОК «6. Обновляем лид» и RETURN — БЕЗ ИЗМЕНЕНИЙ  ⬇⬇⬇

  -- ... (UPDATE leads ... status='converted' ..., RETURN jsonb_build_object(...)) ...
END $function$;
```

**Гранты не трогай.** `CREATE OR REPLACE` сохраняет ACL существующей функции; повторные
`revoke`/`grant` в миграции только шумят в диффе.

Проверка после написания (файл не применяется — проверяем текст):

```bash
grep -c "БЛОК" supabase/migrations/123_lead_convert_carryover.sql   # 0 — плейсхолдеры заменены реальными блоками
grep -n "chz_groups\|deal_stakeholders\|v_budget_label" supabase/migrations/123_lead_convert_carryover.sql
```

---

## ЗАДАЧА 2 — типы: стаб колонки до применения миграции

`Company` = `Database['public']['Tables']['companies']['Row']` (`src/types/entities.ts:7`),
а `Database` собирается в `src/types/database.ts:29` поверх автогенерации. Реген делать
нельзя — миграции в БД ещё нет.

В `src/types/database.ts`, рядом с блоком `RelaxOrgId` (после определения `Database`),
добавь **`type`, не `interface`** (postgrest требует индексную сигнатуру — `interface` её
не получает и `.update()` схлопывается в `never`):

```ts
// ═══ S-LEAD-CARRY-1 (123, на гейте): companies.chz_groups ═══
// ВРЕМЕННЫЙ СТАБ. Снять целиком после apply 123 + регенерации типов:
// колонка приедет из автогенерации, а этот блок обязан уйти — оставленный стаб
// переживает миграцию молча и продолжает врать про схему.
type CompaniesChzStub = {
  Row: { chz_groups: string[] | null };
  Insert: { chz_groups?: string[] | null };
  Update: { chz_groups?: string[] | null };
};
```

и вплети его в `Database` интерсекшеном по ключу `companies` — минимальной правкой
маппед-типа, не переписывая его.

`src/types/supabase.gen.ts` **не трогать вообще**.

---

## ЗАДАЧА 3 — резолвер профиля: `src/lib/domain/chz-profile.ts` (новый файл)

Карточке компании теперь нужно решать, что показывать: подтверждённое или гипотезу.
Логика чистая ⇒ живёт в `lib/domain/` и покрывается юнит-тестом (правило: агрегация
внутри компонента не тестируется иначе как руками в браузере).

**В `src/lib/data/chz-groups.ts` ничего не добавляй.** Файл байт-в-байт зеркалится с
`supabase/functions/ai-run/chz-groups.ts`, страж — `tests/unit/chz-groups.test.ts`;
edge-функции резолвер по именам не нужен, а зеркало из-за него пришлось бы править дважды.

```ts
// src/lib/domain/chz-profile.ts — S-LEAD-CARRY-1
//
// Маркировочный профиль компании имеет два источника, и они не равны:
//   declared — companies.chz_groups, подтверждено человеком (приезжает с лида при конверсии)
//   derived  — matchChzGroups(okved), выведено из кода реестра, это ГИПОТЕЗА
// Подтверждённое побеждает: ОКВЭД говорит, чем компания числится, продавец — что она
// реально маркирует. Оптовик с 46.x возит обувь и молоко, и ОКВЭД об этом не знает.
//
// `unknown` — имена из БД, которых нет в справочнике-снапшоте. Справочник датирован
// и переименование группы оставит сироту; молча её проглотить — потерять данные,
// которые ввёл человек.

import { CHZ_GROUPS, matchChzGroups, type ChzGroup } from '@/lib/data/chz-groups';

export interface ChzProfile {
  groups: ChzGroup[];
  source: 'declared' | 'derived' | 'none';
  /** Названия из declared, не найденные в справочнике. Рендерятся нейтральным тегом. */
  unknown: string[];
}

export function resolveChzProfile(
  declared: string[] | null | undefined,
  okved: string | null | undefined,
): ChzProfile { /* ... */ }
```

Правила реализации:

- `declared` непустой ⇒ `source: 'declared'`; порядок групп — как в `declared`
  (человек выбирал в LeadModal, порядок его).
- `declared` пуст/`null` ⇒ фолбэк на `matchChzGroups(okved)`, `source: 'derived'`.
- ничего ⇒ `{ groups: [], source: 'none', unknown: [] }`.
- **`Date.now()` внутри домена — нет.** Функция и так детерминирована; не заводи.

---

## ЗАДАЧА 4 — карточка компании показывает подтверждённый профиль

`src/components/companies/CompanyDetail.tsx:146` сейчас:

```ts
const chzGroups = matchChzGroups(company.okved);
```

Замени на резолвер и прокинь `source` в оба потребителя (`CompanyHighlights`,
`CompanySidebar` — сигнатуры расширяются, `chzGroups: ChzGroup[]` остаётся):

```ts
const chz = resolveChzProfile(company.chz_groups, company.okved);
```

Требования к рендеру:

- **Подпись источника обязательна.** У `derived` — прежняя формулировка про ОКВЭД
  (дисклеймер уже живёт в highlight-виджете, `CompanyHighlights`). У `declared` —
  «подтверждено», без ссылки на ОКВЭД: приписывать человеческий ввод реестру нечестно.
- `unknown`-имена — нейтральным тегом (`bg-surface2 text-text-mute`), **без** `ChzBadge`:
  статуса у них нет, а зелёный/жёлтый бейдж соврал бы про обязательность.
- Условие `chzGroups.length > 1` в `CompanySidebar.tsx:166` **пересмотри**: комментарий
  над ним обосновывает единицу тем, что `matchChzGroups` физически не вернёт больше
  одной группы. С `declared` это перестаёт быть верным — человек выбирает сколько угодно.
  Условие становится «показывать, когда групп больше, чем влезло в highlight-виджет
  (там ровно одна, `chzGroups[0]`)», то есть `> 1` остаётся, но **комментарий обязан
  быть переписан**: он сейчас утверждает про реальность то, что перестанет быть правдой.
- Цвета — только токены. `ChzBadge` не трогаем.

---

## ЗАДАЧА 5 — профиль редактируется руками

Конверсия — не единственный путь: компанию заводят и напрямую.

1. `src/lib/validators/company.ts` — в `companyFormSchema`, отдельным блоком с шапкой:

```ts
// ═══ S-LEAD-CARRY-1 (123): подтверждённый маркировочный профиль ═══
// Зеркало пикера LeadModal: те же названия из CHZ_GROUPS, тот же контракт
// «пустой массив → null» (не выяснено ≠ выяснено, что групп нет).
chz_groups: z.array(z.string()).nullable().default(null),
```

2. `src/components/companies/CompanyModal.tsx` — пикер групп. **Скопируй паттерн
   `LeadModal.tsx:139-147` (`toggleChz`) и JSX-тогглы оттуда же** — не изобретай второй
   вид контрола для того же справочника.

3. `src/lib/hooks/use-companies.ts` — мутация обновления уже гоняет весь объект формы
   (`.update(updates as never)`, :121). Проверь грепом, что `chz_groups` не отсекается
   явным списком полей; если отсекается — добавь.

---

## ЗАДАЧА 6 — тест

`tests/unit/chz-profile.test.ts` (путь строго в `tests/unit/**` — `vitest.config.ts`
включает только его; файл рядом с исходником молча не запустится и прогон соврёт зелёным).

Кейсы:

1. `declared` непустой + `okved` с другой группой ⇒ побеждает `declared`, `source==='declared'`.
2. `declared` пуст ⇒ `matchChzGroups(okved)`, `source==='derived'`.
3. `declared` содержит имя, которого нет в `CHZ_GROUPS` ⇒ оно в `unknown`, не в `groups`.
4. Оба пусты ⇒ `groups: []`, `source: 'none'`.
5. Порядок `declared` сохраняется.

```bash
npx vitest run tests/unit/chz-profile.test.ts
npx tsc --noEmit
npm run lint
```

⚠️ `npm run build` гонять **последним** — при живом `next dev` он убивает dev-сервер.

---

## ЗАДАЧА 7 — `docs/schema.md` тем же спринтом

Конвенция проекта: память обновляется тем же PR, что миграция, иначе следующий спринт
читает враньё. Добавь раздел про 123 со статусом **«НАПИСАНА, НЕ ПРИМЕНЕНА»** —
`applied` + версию из `schema_migrations` проставит гейт после apply, спринт-PR их
знать не может.

Что зафиксировать: колонка `companies.chz_groups` (с оговоркой declared vs derived),
`leads_decision_role_check`, три переноса в `convert_lead` v3 и то, что бэкфилла
конвертированных лидов **нет** — на 2026-08-11 их ноль.

---

## КОММИТ

```bash
git checkout -b feat/lead-convert-carryover
git add supabase/migrations/123_lead_convert_carryover.sql \
        docs/schema.md \
        src/types/database.ts \
        src/lib/domain/chz-profile.ts \
        src/lib/validators/company.ts \
        src/components/companies/ \
        tests/unit/chz-profile.test.ts
git status   # убедись, что supabase.gen.ts НЕ в индексе
git commit -m "feat(leads): конверсия переносит квалификацию — роль, бюджет, ЧЗ-профиль (S-LEAD-CARRY-1)

- 123: companies.chz_groups + CHECK на leads.decision_role + convert_lead v3
- decision_role → deal_stakeholders, budget_status → pinned_note, chz_groups → компания
- resolveChzProfile: подтверждённое побеждает гипотезу по ОКВЭД
- миграция НЕ применена — apply у гейта"
```

---

## Для гейта (не выполнять в CC)

1. `apply_migration` 123 → `scripts/gen-types.sh` → **снять стаб `CompaniesChzStub`
   из `database.ts`** → сдифить реген (MCP не отдаёт `graphql_public` — ~28 ложных удалений).
2. `get_advisors` — сравнить набор WARN с прежним. Новая колонка и CHECK новых не дают;
   `convert_lead` уже была в 0029-шуме.
3. Смок конверсии в транзакции с `ROLLBACK`, под `manager` и под чужаком:
   тестовая компания + лид со всеми тремя полями → `convert_lead` → проверить
   `deal_stakeholders` (роль доехала), `projects.pinned_note` (строка «Бюджет:»),
   `companies.chz_groups` (профиль доехал), и **повторный вызов** (идемпотентность
   `ON CONFLICT`). Чужак по известному UUID лида → 42501.
4. Отдельным запросом: компания с уже заполненным `chz_groups` конверсией **не**
   перезаписывается.
5. `docs/schema.md` — колонка, CHECK, тело v3, статус `applied` + версия из
   `schema_migrations` **тем же заходом**.
