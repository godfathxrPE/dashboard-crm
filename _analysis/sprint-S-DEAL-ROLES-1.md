# Спринт S-DEAL-ROLES-1 — слоты ролей воронки (W10)

**Вход:** `main` = `a3d182d` (+ `feat/deal-chz-1` на мерже). **Следующая свободная
миграция — 130** (проверено запросом к `schema_migrations` 06.09: последняя
`20260823182046 queue_snoozes` = 129). **Миграция пишется и коммитится, НЕ применяется** —
apply, advisors и ролевые смоки делает гейт Cowork.
**Ветка:** `feat/deal-roles-1` (через `worktree-isolation`, симлинк `.env.local`).
**Baseline:** снять в разведке.
**Спецификация:** `_analysis/deal-v2-spec.html`, виджет **W10**. Карта дельты —
`_analysis/deal-v2-gap-2026-09-06.md`.

---

## Зачем (прочитать до кода)

Сегодня «Стейкхолдеры» — плоский список: кого добавили, тех и видно. Спека W10 требует
другого: **слоты ожидаемых ролей**, где пустой слот сам является сообщением.

> Слоты ролей вместо списка: пустой слот ЛПР = сигнал «один человек».
> Роли по типу воронки (IIoT): ЛПР, Основной контакт, Технический эксперт.
> Пустой слот: пунктир · аватар-плюс · название роли · пояснение
> (ЛПР — «ЛПР не в контуре — ключевой риск стадии»).

Разница не косметическая. Список отвечает «кто есть», слоты — «кого НЕ хватает», а это
второе и есть работа пресейла: сделка на 2,8 млн с одним контактом рушится, когда этот
контакт уходит в отпуск. Ровно поэтому виджет замыкается на два соседних:

- **W6 Здоровье:** сигнал `single_threaded` (`lib/domain/deal-signals.ts`) сегодня
  считает КОЛИЧЕСТВО стейкхолдеров (`stakeholderCount`, вход из `DealSignals.tsx:93`).
  Спека хочет ПОКРЫТИЕ ролей: не «людей мало», а «ЛПР не в контуре».
- **W9 Сводка:** поле «ЛПР» в спеке — это стейкхолдер с ролью `decision_maker`,
  а не колонка. Заводить `projects.decision_maker_id` ЗАПРЕЩЕНО: второй источник истины
  поверх `deal_stakeholders` (прецедент `companies.phone` ↔ `phones[]`, урок хвоста #5).

### Что здесь НЕ трогаем

| | Почему |
|---|---|
| Словарь ролей `deal_stakeholders_role_chk` | Шесть значений MEDDIC универсальны и остаются. Новая таблица описывает не роли, а ОЖИДАНИЕ ролей в конкретной воронке — другая сущность с похожим именем |
| `projects.contact_id` и вычисление primary | Primary как был вычисляемым, так и остаётся |
| UI настройки ожиданий (owner правит состав ролей воронки) | Отдельный экран в «Настройках организации», как «Нормы стадий». В этом спринте состав задаётся сидом; UI — следующим спринтом, когда станет ясно, меняют ли его вообще |
| W9 «ЛПР» в сводке | Спринт S-DEAL-SUMMARY-1, он зависит от этого |

---

## Модель данных

### Решение 1. Новая таблица, а не колонка в `pipelines`

`references/schema.md`: «`pipelines`/`pipeline_stages` — глобальные словари, не
org-scoped. Org-специфичные атрибуты стадии заводятся отдельной таблицей
`(org_id, stage_id, …)`». Ожидаемые роли — ровно такой атрибут, только на воронку.

```
pipeline_expected_roles
  id            uuid PK default gen_random_uuid()
  org_id        uuid NOT NULL → organizations ON DELETE CASCADE
  pipeline_id   uuid NOT NULL → pipelines ON DELETE CASCADE
  role          text NOT NULL — из того же набора, что deal_stakeholders_role_chk
  is_required   boolean NOT NULL DEFAULT false — пустой слот required-роли даёт сигнал
  hint          text — пояснение под названием слота («кто подтвердит интеграцию»)
  sort_order    smallint NOT NULL DEFAULT 0 — порядок слотов в виджете
  created_by    uuid default auth.uid() → profiles ON DELETE SET NULL
  created_at / updated_at timestamptz
  UNIQUE (org_id, pipeline_id, role)
  INDEX (org_id, pipeline_id)
```

⚠️ **FK на `pipelines` — обсудить в разведке.** Прецедент 078: у `stage_transitions`
FK на `pipeline_stages` СНЯТ на гейте, потому что словарь глобальный и уже пересобирался
в 035 — CASCADE вынес бы историю по всем org. Здесь запись не историческая, а
конфигурационная, и потеря строки при пересборке воронки — меньшее зло, чем висячая
ссылка. **Предлагается FK оставить**, но решение зафиксировать в отчёте явно.

### Решение 2. Слот «Основной контакт» — виртуальный

Спека перечисляет для IIoT: ЛПР, **Основной контакт**, Технический эксперт. «Основной
контакт» — не роль из словаря, а `projects.contact_id`. В таблицу его НЕ кладём:
это вернуло бы второй источник истины, который проект уже отверг в S-R2-D3.

Слоты собираются так: **виртуальный слот primary** (всегда первый, всегда есть) +
строки `pipeline_expected_roles` по `sort_order`. Счётчик «N из M ролей»: M = 1 + число
ожидаемых ролей, N = сколько из них закрыто.

### Решение 3. Воронка без ожиданий — прежнее поведение

Строк для воронки нет ⇒ виджет рисует нынешний плоский список, сигнал
`single_threaded` считает по количеству, как сейчас. Это не заглушка, а требование
обратной совместимости: delivery-воронки и любые новые не должны молча получить
пустые слоты и красный сигнал.

### Seed (в миграции, идемпотентный)

Для дефолтной org и двух deal-воронок. **Матчить по `entity_type = 'deal'` и
`direction`** (`iiot` / `erp`) — оба поля есть в `pipelines` (`types/database.ts:259`).
По ИМЕНИ матчить нельзя: имена воронок правятся из UI, а delivery-воронки уже
пересобирались в 035 — якорь на имя разъедется молча. Воронка не нашлась — пропуск,
не ошибка.

| Воронка | role | is_required | hint |
|---|---|---|---|
| IIoT | `decision_maker` | true | «ЛПР не в контуре — ключевой риск стадии» |
| IIoT | `expert` | false | «кто подтвердит интеграцию» |
| ERP | `decision_maker` | true | «ЛПР не в контуре — ключевой риск стадии» |
| ERP | `economic_buyer` | false | «кто держит бюджет» |

Состав ERP — предположение, не из спеки: спека описывает только IIoT. Отметить в отчёте
как требующее подтверждения владельцем.

### RLS (паттерн `stage_requirements` 027)

- `per_select` — `org_id = (select public.current_org_id())`, все члены org: слоты
  видит каждый, кто видит сделку;
- `per_insert` / `per_update` / `per_delete` — то же + `(select public.current_org_role())
  in ('owner','admin')`: состав контура — настройка организации, не правка сделки.

Обязательное по конвенции: `enable row level security`, `revoke all … from anon`,
явные гранты `authenticated`, `trg_set_updated_at` → `public.update_updated_at()`,
**заморозка `org_id` вручную** триггером `trg_aa_freeze_org_id` (автоцикл 054 покрыл
только таблицы, существовавшие на момент 054).

### RBAC-матрица

```
             | Read | Create | Update | Delete |
owner        |  ✓   |   ✓    |   ✓    |   ✓    |
admin        |  ✓   |   ✓    |   ✓    |   ✓    |
manager      |  ✓   |   ✗    |   ✗    |   ✗    |
viewer       |  ✓   |   ✗    |   ✗    |   ✗    |
```

manager намеренно уже, чем в `deal_stakeholders`: там он правит УЧАСТНИКОВ своей сделки,
здесь — НАСТРОЙКУ воронки, общую для всей организации.

---

## РАЗВЕДКА (до правок)

```bash
git log --oneline -1
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -5

sed -n '/### stage_requirements/,/### automation_rules/p' docs/schema.md | head -40
sed -n '/### deal_stakeholders/,/### activities/p' docs/schema.md | head -45
grep -n 'trg_aa_freeze_org_id\|update_updated_at' docs/schema.md | head -8

cat src/lib/constants/stakeholders.ts
sed -n '270,330p' src/components/projects/DealStakeholders.tsx
sed -n '285,315p' src/lib/domain/deal-signals.ts
grep -n 'stakeholderCount' src/components/projects/DealSignals.tsx
grep -n 'useStagesForPipeline\|pipeline_id' src/lib/hooks/use-pipelines.ts | head

ls supabase/migrations/ | tail -5
```

Ответить в отчёте:
1. Точные имена deal-воронок в `pipelines` (для сида) — запросом к живой БД через MCP
   read-only НЕ получится из CC; взять из `docs/schema.md` (035 называет две
   delivery-воронки по uuid) или отложить сид в отдельный шаг гейта.
2. Какой фазовый гейт стоит у `single_threaded` — его надо СОХРАНИТЬ.
3. Как `DealStakeholders` рисует строку сейчас — новый слот повторяет её язык.

---

## ЗАДАЧА 1 — миграция 130

`supabase/migrations/130_pipeline_expected_roles.sql`. Таблица, индексы, RLS,
гранты, триггеры, сид — по разделу «Модель данных». Всё через `IF NOT EXISTS` /
`ON CONFLICT DO NOTHING`, файл обязан переживать повторный прогон.

**CHECK на `role`** — повторить набор из `deal_stakeholders_role_chk` дословно.
Ссылаться на чужой CHECK нельзя, а расхождение даст 23514 при сиде: в комментарии
над CHECK указать, что это зеркало, и обе точки меняются вместе.

### Verification

```bash
grep -c 'IF NOT EXISTS\|ON CONFLICT' supabase/migrations/130_pipeline_expected_roles.sql
grep -n 'enable row level security\|revoke\|grant\|trg_aa_freeze_org_id' supabase/migrations/130_pipeline_expected_roles.sql
```

Миграцию НЕ применять. `docs/schema.md` — раздел с пометкой «НАПИСАНА, НЕ ПРИМЕНЕНА»
тем же PR (статус переведёт гейт после apply).

---

## ЗАДАЧА 2 — типы и стаб

`src/types/database.ts`: интерфейс `PipelineExpectedRole`. `supabase.gen.ts` руками
НЕ править — таблицы в БД ещё нет, реген невозможен. Если для компиляции нужен стаб —
завести его по приёму проекта (образец: `CompaniesChzStub`, см. историю 123) и **в
отчёте написать, что стаб заведён и подлежит снятию тем же заходом, что реген**.

---

## ЗАДАЧА 3 — домен: сборка слотов

`src/lib/domain/role-slots.ts` — чистая функция, ноль React, ноль запросов.

```ts
export interface RoleSlot {
  kind: 'primary' | 'role';
  role: StakeholderRole | null;   // null у primary
  label: string;
  hint: string | null;
  isRequired: boolean;
  /**
   * Кто закрыл слот. У слота primary строки в `deal_stakeholders` может НЕ быть
   * (контакт сделки задан, а в карту его не добавляли) — тогда `filled: null`,
   * но слот считается закрытым: смотреть на `isFilled`, а не на `filled !== null`.
   */
  filled: StakeholderRow | null;
  isFilled: boolean;
  /** Только у primary без своей строки — чей это контакт. */
  virtualContactId: string | null;
}

export interface RoleSlotsResult {
  slots: RoleSlot[];
  /** Число ЗАКРЫТЫХ СЛОТОВ, не людей: один человек закрывает и primary, и свою роль. */
  filledCount: number;
  totalCount: number;
  /** Незакрытые ОБЯЗАТЕЛЬНЫЕ роли — вход сигнала single_threaded. */
  missingRequired: StakeholderRole[];
  /** Ожидания для воронки не заданы — виджет рисует плоский список. */
  hasExpectations: boolean;
}

export function resolveRoleSlots(
  expected: readonly PipelineExpectedRole[],
  stakeholders: readonly StakeholderRow[],
  primaryContactId: string | null,
): RoleSlotsResult
```

Правила:
- primary всегда первым слотом; закрыт, если существует стейкхолдер с
  `contact_id === primaryContactId` (или если сам `primaryContactId` задан — сверить
  с нынешним поведением `sortStakeholders`, где primary может быть виртуальным);
- дальше слоты по `sort_order`, затем по `STAKEHOLDER_ROLE_ORDER` при равенстве;
- один человек закрывает слот своей роли; **человек без роли не закрывает ничего**,
  но и не теряется — уходит в хвост отдельным списком «без роли»;
- `expected` пуст ⇒ `hasExpectations: false`, `slots` = только primary, остальные
  стейкхолдеры в хвосте (то есть нынешний плоский список).

---

## ЗАДАЧА 4 — сигнал `single_threaded` переходит на покрытие

`src/lib/domain/deal-signals.ts`. В `DealSignalContext` добавить
`missingRequiredRoles: StakeholderRole[] | null` (null = ожиданий нет).

Логика:
- ожидания есть и `missingRequired` непуст ⇒ сигнал **`warn`** (НЕ `bad`), `label` из
  `hint` обязательной роли («ЛПР не в контуре — ключевой риск стадии»), cta ведёт
  к виджету;
- ожидания есть и всё закрыто ⇒ `ok`;
- **ожиданий нет ⇒ прежняя ветка по `stakeholderCount`, дословно.**

⚠️ **Severity остаётся `warn` — это решение, а не недосмотр.** Сегодня незакрытый
контур даёт `warn` (`deal-signals.ts:309-314`). Апгрейд до `bad` поднял бы вердикт
сделки до `rotting` и покрасил всю зону «Риски» — то есть незаполненный слот ЛПР
на любой рабочей сделке сделал бы её «под угрозой». Спека называет это «ключевым
риском стадии», но подъём severity меняет продуктовое поведение виджета здоровья и
должен решаться отдельно, а не приезжать прицепом к слотам. Пустой обязательный слот
всё равно выделен в W10 своим цветом — носитель состояния на месте.

⚠️ **Фазовый гейт сохраняется.** Сегодня сигнал гасится на ранних фазах
(`attraction`) — комментарий в файле объясняет почему: «по живой БД 8 из 10 открытых
сделок имеют ≤1 стейкхолдера». Гейт остаётся и для новой ветки: контур собирают
не на первом касании.

Вход считает `DealSignals.tsx:93` — туда же добавить `missingRequiredRoles` из
результата `resolveRoleSlots`.

---

## ЗАДАЧА 5 — хук ожиданий

`src/lib/hooks/use-pipeline-expected-roles.ts`, образец — `useStageRequirements`
(тот же профиль: org-scoped справочник, читается на карточке).

```ts
export function usePipelineExpectedRoles(pipelineId: string | null | undefined)
```

`queryKey: ['pipeline-expected-roles', pipelineId ?? null]`, `enabled: !!pipelineId`,
`staleTime` 5 минут (настройка организации, меняется раз в месяцы).

---

## ЗАДАЧА 6 — слоты в виджете

`src/components/projects/DealStakeholders.tsx`.

**6.0.** ⚠️ **`DealStakeholders` сегодня принимает только `projectId`** — а хуку
ожиданий нужен `pipeline_id`. Прокинуть его пропом от `DealContextZone`
(`DealContextRail.tsx`), где `project` уже есть целиком; НЕ добавлять внутрь виджета
второй запрос проекта ради одного поля. Проп нullable: у internal-проектов
`pipeline_id` пуст, и виджет обязан это переживать.

**6.1.** Шапка: «Стейкхолдеры · {filled} из {total} ролей» вместо нынешнего заголовка;
при `hasExpectations: false` — прежний заголовок без счётчика.

**6.2.** Заполненный слот — нынешняя строка без изменений (не переписывать разметку,
она уже согласована с рельсом).

**6.3.** Пустой слот: пунктирная рамка 1.5 существующим токеном границы
(`--border2`; **`--line-4` из спеки в проекте НЕТ** — спека написана под тему
`minimal` со своим набором, сверить по `globals.css`), аватар-плюс,
название роли из `STAKEHOLDER_ROLE_CONFIG[role].full`, пояснение из `hint` мелким.
Обязательная незакрытая роль — пояснение цветом `--red-text` (это носитель состояния,
не украшение; проверить контраст в восьми темах).
Клик по пустому слоту открывает добавление стейкхолдера **с предвыбранной ролью**.

**6.4.** Стейкхолдеры без роли и сверх слотов — прежним списком под слотами,
заголовок «Ещё в контуре».

**6.5.** Права: правка состава слотов недоступна из карточки вовсе (это настройка
организации). Кнопка «+ Добавить» ведёт себя как сейчас.

### Verification

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -3
grep -rn '#[0-9a-fA-F]\{6\}' src/components/projects/DealStakeholders.tsx | wc -l
python3 scripts/audit-contrast.py 2>&1 | tail -5
```

---

## ТЕСТЫ

`tests/unit/role-slots.test.ts` — поведением:

| Вход | Ожидание |
|---|---|
| ожиданий нет, три стейкхолдера | `hasExpectations:false`, слот только primary, трое в хвосте |
| ожидания [ЛПР(req), эксперт], закрыт эксперт | `missingRequired:['decision_maker']`, `filledCount` считает primary |
| ЛПР закрыт человеком, который И primary | слот primary и слот ЛПР — РАЗНЫЕ, оба закрыты одним человеком, `filledCount` = 2 (считаются СЛОТЫ) |
| стейкхолдер без роли | не закрывает ни один слот, уходит в хвост |
| два человека с ролью `expert` | слот закрыт первым по `created_at`, второй в хвост |
| `primaryContactId = null` | слот primary пуст, не падает |
| порядок: `sort_order` 2,1 | слоты идут 1,2 |

`tests/unit/deal-signals.test.ts` (дополнить):

- ожидания есть, ЛПР не закрыт, фаза **`working`** ⇒ `single_threaded` = `warn`;
- то же на фазе `attraction` ⇒ `na` (фазовый гейт сохранён);

⚠️ Фазы брать из `MULTI_THREAD_PHASES` (`deal-signals.ts:105`) — это
`working` / `approval` / `closing`. **`execution` — фаза DELIVERY-воронки**
(`initiated`/`planning`/`execution`/`completed`, миграция 035), у сделки её нет:
тест на ней ушёл бы в ветку `na` и был бы зелёным, ничего не проверяя.
- ожиданий нет, один стейкхолдер ⇒ прежнее поведение по количеству;
- ожидания есть, всё закрыто ⇒ `ok`.

```bash
npx vitest run tests/unit/role-slots.test.ts tests/unit/deal-signals.test.ts 2>&1 | tail -15
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
npm run build 2>&1 | tail -10
```

Dev-сервер остановить до билда. UI до применения миграции работать не будет —
это ожидаемо, применять её самому НЕ пытаться.

---

## КОММИТ

```bash
cat > /tmp/commit-roles.txt <<'MSG'
feat(deals): слоты ролей воронки в карте стейкхолдеров

- миграция 130: pipeline_expected_roles (org_id, pipeline_id, role), RLS на 4 операции,
  сид для IIoT и ERP; НЕ применена — apply на гейте
- role-slots.ts: сборка слотов, primary виртуальным слотом, воронка без ожиданий
  сохраняет прежний плоский список
- single_threaded переходит с количества стейкхолдеров на покрытие обязательных ролей;
  фазовый гейт сохранён
- пустой слот в виджете: роль, пояснение, предвыбор роли при добавлении
MSG

git add .
git commit -F /tmp/commit-roles.txt
```

**Не мержить.** Отчёт — на гейт.

---

## Что сделает гейт

1. `apply_migration` 130 через Supabase MCP.
2. `get_advisors` — сравнить набор WARN с прежним.
3. Ролевые смоки: owner INSERT · manager INSERT → 42501 · viewer SELECT видит,
   INSERT 42501 · чужак SELECT 0 строк · tamper (явный чужой `org_id`) → отказ ·
   дубль `(org_id, pipeline_id, role)` → 23505 · роль вне набора → 23514.
4. Реген типов у владельца (`npm run db:gen-types`), снятие стаба ТЕМ ЖЕ заходом.
5. Сверка сида: сколько строк село, по каким воронкам — независимым `execute_sql`.
6. `docs/schema.md` — статус 130 из «НАПИСАНА» в `applied` + версия из
   `schema_migrations`, в том же заходе.
7. Cold review — **обязателен**: миграция + RLS + правка носителя здоровья сделки.
