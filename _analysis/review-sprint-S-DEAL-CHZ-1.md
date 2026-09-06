# Ревью: S-DEAL-CHZ-1 — блок «Честный Знак» на карточке сделки

**Дата:** 2026-09-06
**Ревьюер:** Grok (верификация по коду `main` @ `a3d182d`, crm-architect `architecture.md` / `learnings.md` / `schema.md`, live `DealContextRail.tsx` / `chz-profile.ts` / `chz-groups.ts` / `CompanySidebar.tsx` / `use-companies.ts` / `use-projects.ts` / `tests/unit/chz-profile.test.ts`)
**Объект:** `_analysis/sprint-S-DEAL-CHZ-1.md` — карточка ЧЗ в зоне «Контекст» + дата справочника как значение, без миграции
**Контекст:** эпик зон закрыт (#53–#57); `DealContextZone` уже в `main`. STATUS рев. 34: очередь `S-DEAL-DATA-1 → S-DEAL-CHZ-1` — от DATA-1 этот спринт **не зависит**. Профиль ЧЗ: миграция 123, `resolveChzProfile`, `ChzBadge`. Спека «Сделка v2» в репо файлом не найдена; смысл (`chzGroups` + `chzDictVersion`) из спринта ясен.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды, якоря, зеркала) | ✅ команды живые; `diff` зеркал уже красный на шапке (W5) |
| `main` = `a3d182d`, зон нет в зависимостях | ✅ HEAD совпал; `DealContextZone` на месте |
| Пути файлов задач 1–3 | ✅ `chz-groups.ts` и зеркало, `DealContextRail.tsx`, `ChzBadge`, `RailCard` |
| Схема `companies.chz_groups` / `okved` | ✅ 123 applied; NULL vs `'{}'` в `docs/schema.md:1907` |
| Не расширять `PROJECT_COLUMNS` | ✅ join `companies(id, name)` на `:175`; имя константы другое (W9) |
| `CompaniesChzStub` | 🟡 стаб снят после 123; колонка уже в `supabase.gen.ts` |
| Язык unknown-сирот | 🟡 рендер не в `CompanyDetail`, а в `CompanySidebar` |
| Состояния NULL / `[]` / derived | 🟡 таблица задачи 3 расходится с `resolveChzProfile` |
| Новый queryKey и инвалидация | 🟡 `['company-chz']` вне графа `['companies']` |
| SQL / RLS / миграции | ✅ N/A, честно |
| CSS-токены, не hex | ✅ `ChzBadge` уже на переменных; своих цветов не заводить |
| Секция ТЕСТЫ | ✅ Т1/Т2 поведением; файл Т2 уже есть — дополнять |
| Out-of-scope (миграция, пикер, PROJECT_COLUMNS, актуализация справочника) | ✅ |

**Оценка: 89/100 (GO).** Спринт executable: доменные решения верные, якоря живые, миграций нет. Запускать можно; лучше вклеить W1 и W4 в текст задач, иначе CC угадает состояния `[]` и оставит карточку stale после правки компании.
- Порог передачи в Claude Code: **≥ 85**. Ниже 85 — не отдавать в CC.
- Любой открытый B* → максимум 84 (NO-GO). Блокеров нет.

**Рекомендация:** запускать в CC. Желательно до старта дописать два абзаца (порядок состояний; инвалидация ключа) — не обязательно для GO.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| S-DEAL-ZONES-1A/1B | в `main` (#53/#54): `DealContextZone` / `DealRisksZone` живы |
| S-DEAL-DATA-1 | в очереди STATUS, этому спринту не нужен |
| `src/components/projects/` + `chz` | **0 совпадений** — дыра, которую спринт закрывает, реальна |
| `tests/unit/chz-profile.test.ts` | **есть** (S-LEAD-CARRY-1), 6 кейсов |
| `CompaniesChzStub` | **0** в `src/`; снят в merge 123 (`CHANGELOG`, `docs/schema.md:527`) |
| Зеркала `chz-groups.ts` | расходятся **двумя** строками шапки (путь + текст «зеркало») |

---

## Live-разведка (сверка claims)

| Claim спринта | Live @ `a3d182d` | |
|---------------|------------------|---|
| `main` = `a3d182d` | `a3d182d` `fix(scripts): пакет скилла… (#61)` | ✅ |
| Снапшот 2026-08-03 в шапке | `src/lib/data/chz-groups.ts:3`; источники на `:3–4` совпадают с константами задачи 1 | ✅ |
| Зеркала идентичны | `diff`: строки 1 и 10 (пути/формулировка зеркала). Экспорты совпадают | 🟡 |
| `chz-profile.test.ts` «разведать, нет — завести» | файл есть, 6 тестов; дубль имён не покрыт | 🟡 |
| `CompanyDetail` рендерит unknown | считает `resolveChzProfile` (`:149`) и **передаёт** в сайдбар (`:306–310`). Тег — `CompanySidebar.tsx:211–228` | 🟡 |
| `DealContextZone` после сводки, до материалов | `:175–183`: Summary → **StakeholdersBlock** → Materials | 🟡 якорь есть, слот не дословно |
| `RailCard` | `src/components/shared/RailCard.tsx:13` | ✅ |
| `company:companies(id, name)` | `use-projects.ts:175` внутри `PROJECT_COLUMNS` (`:167`), не `PROJECT_SELECT` | 🟡 имя |
| `chz_groups`/`okved` в `use-companies.ts` | `:47`, `:61`, `:85`, `:92`; `select('*')` + `as Company` / `as never` на **записи**, не на чтении | ✅ |
| `grep chz src/components/projects/` пуст | пуст | ✅ |
| `ChzBadge` без hex | `yellow-l` / `green-l` / `surface2` + `var(--*-text)` | ✅ |
| `companies.chz_groups` в типах | `supabase.gen.ts:668` `string[] \| null`; стаб не нужен | 🟡 спринт отстал |
| Маршруты `/companies/<id>` | `src/app/(dashboard)/companies/[id]/page.tsx`; сосед `DealSummaryCard:84–89` — `next/link` | ✅ |
| `type !== 'delivery'` для зоны | `ProjectDetail.tsx:511` монтирует `DealContextZone` только у `type === 'client'`; рельса — delivery/internal | ✅ проверка в зоне избыточна, не вредна |

Команды разведки воспроизводимы. `npm run lint` / `vitest` / `build` в этой сессии не гонялись — это baseline исполнителя, не ревьюера.

---

## С чем согласен полностью

### 1. Не расширять join списка сделок

`PROJECT_COLUMNS` (`use-projects.ts:167–177`) кормит воронку, канбан и очередь дня. Тащить `chz_groups[]` и `okved` на каждую строку ради одной открытой карточки — лишний payload. Отдельный хук с `enabled: !!companyId` — правильная граница. Редактирование профиля на сделке не заводить: пикер уже в `CompanyModal`, второй ввод = второй источник истины (learnings: «два источника одного факта — вес и подпись, не слияние»).

### 2. Дата снапшота — значение, не комментарий

Шапка `chz-groups.ts:3` датирует справочник, по которому готовят КП. Вынести `CHZ_SNAPSHOT_DATE` рядом с `CHZ_GROUPS` и зеркалить в Deno-файл — единственный способ не разъехаться. Источники в константе совпадают с шапкой. Тест формата + сверка зеркал — правильный страж: текущий `toEqual(CHZ_GROUPS)` **не** поймает новые экспорты (сравнение поимённое, спринт это уже сказал).

### 3. Переиспользовать резолвер и `ChzBadge`

`resolveChzProfile` уже детерминирован, без `Date.now()`, порядок declared человеческий, сироты не глотаются. Второй потребитель без покрытия был бы регрессом — Т2 это закрывает. `ChzBadge` один на продукт; семантические цвета внутри него, в `t-washi` акцент равен `--red` — своих цветов на карточке заводить нельзя, спринт это фиксирует.

### 4. Монтаж только в зоне «Контекст» сделки

`DealContextRail` остался путём внедрения и internal (`DealContextRail.tsx:27–30`). ЧЗ на внедрении — не переговорная тема. Peek (`ProjectPeekContent`) не трогать — укороченный путь, спринт его и не зовёт.

### 5. Скоуп, коммит, гейт

Миграций нет, `schema.md` не нужен, cold review справедливо снят. `git commit -F` — `!` в zsh не раскроется. `npm run build` последним после остановки dev — грабля из learnings учтена.

---

## Блокеры (критично — исправить до запуска)

Нет.

---

## Предупреждения (желательно исправить)

### W1. Таблица состояний задачи 3 расходится с `resolveChzProfile`

Резолвер (`chz-profile.ts:38–64`) пускает в declared **только непустой** массив. `null` и `[]` оба падают в гипотезу по ОКВЭД, и если она молчит — в один и тот же `EMPTY` `{ source: 'none', groups: [] }`. Т2 это **фиксирует**: `[]` + `'15.20'` → `source='derived'`.

Таблица задачи 3 говорит иначе:

| `chz_groups = []` | «Групп маркировки нет» |

Если CC поставит этот `if` первым, гипотеза по ОКВЭД на пустом массиве исчезнет — прямое противоречие Т2 и комментарию в домене.

Плюс: из одного `ChzProfile` NULL и `[]` при молчащем ОКВЭД **неразличимы**. Экран «не выяснено» vs «групп нет» обязан смотреть **сырую колонку**, но только после резолвера.

**Порядок в задаче 3 (вклеить дословно):**

```
1. profile = resolveChzProfile(row.chz_groups, row.okved)
2. если profile.groups / profile.unknown непусты
   или profile.source === 'derived' → карточка групп + подпись источника
3. иначе если row.chz_groups !== null && length === 0 → «Групп маркировки нет»
4. иначе (NULL / нет строки) → «Не выяснено» + ссылка уточнить
5. data === null при успехе запроса → как «нет компании», return null
```

Пикер `CompanyModal:105` / `LeadModal:146` пишет пустой выбор как `null`, не как `[]`. Экран «групп нет» из UI почти недостижим — это pre-existing, пикер в спринте не трогать. Карточка всё равно обязана различать оба значения БД.

### W2. Unknown-сироты рисует `CompanySidebar`, не `CompanyDetail`

Разведка п.3 целится в `CompanyDetail.tsx:140–175` — там только вызов резолвера. Язык тега:

```217:228:src/components/companies/CompanySidebar.tsx
          {chzUnknown.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1.5 text-xs text-text-mute">Нет в справочнике 2026-08</p>
              <div className="flex flex-wrap gap-1">
                {chzUnknown.map((name) => (
                  <span key={name} data-tag
                    className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
                    {name}
                  </span>
                ))}
```

Это **не** `ChzBadge`: статуса у сироты нет, цветной бейдж соврал бы про обязательность. В разведку — `CompanySidebar.tsx:211–228`. Заголовок «Нет в справочнике 2026-08» на сделке лучше собрать из `CHZ_SNAPSHOT_DATE`, а не копировать литерал.

Подпись источника на компании другая (`CompanyHighlights`: «Подтверждено вручную» / «Справочник 2026-08 · по основному ОКВЭД»). На сделке спринт сознательно просит жёстче: «гипотеза по ОКВЭД» vs «подтверждено» — гипотеза, поданная как факт, уедет в КП. Не унифицировать с highlights.

### W3. `CompaniesChzStub` снят; SELECT типизируется без каста

Колонка в `supabase.gen.ts:668` (`chz_groups: string[] | null`) и в `docs/schema.md:1907`. Стаб убрали после apply 123. `use-companies.ts` кастует `as never` / `as Company` на **insert/update** (codegen vs рукописный payload), не на чтение трёх полей.

Сниппет задачи 2 с `.select('id, chz_groups, okved').maybeSingle()` должен пройти `tsc` как есть. Не добавлять `as never` «на всякий случай» и не трогать `database.ts` / `supabase.gen.ts`. Verification `grep CompaniesChzStub` вернёт 0 — это успех, не дыра.

### W4. Ключ `['company-chz']` не попадает в инвалидацию компаний

`architecture.md:344–346`: новый React Query ключ сразу проводить по мутациям, которые меняют его данные — иначе виджет stale, а страница-источник уже нет.

Сейчас `useUpdateCompany` (`use-companies.ts:213–215`) сбрасывает только `['companies']` и `['companies', id]`. `useLeads` / `useContacts` тоже бьют `['companies']`. Префикс **не** матчит `['company-chz', id]`. При `staleTime: 5 мин` путь «Уточнить в карточке компании → поправить группы → назад» покажет старый профиль.

**Правка (одно из двух, лучше оба):**

1. Ключ вложить: `['companies', companyId, 'chz']` — существующий `invalidateQueries({ queryKey: QUERY_KEY })` подхватит.
2. Явно в `useUpdateCompany.onSettled` (и delete): `qc.invalidateQueries({ queryKey: ['company-chz'] })`.

`useCompany(id)` уже отдаёт `chz_groups` и `okved` через `select('*')`. Отдельный трёхполевой хук всё равно лучше, чем расширять список сделок; просто не выпадать из графа свежести. Realtime на этот ключ не вешать — у `useCompany` его тоже нет.

### W5. `diff` зеркал красный уже на входе

Расхождение — две строки комментария (путь файла и формулировка «зеркало»), не данные. Задача 1.2 велит вставку «дословно» и «побайтово идентичны кроме первой строки с путём». Финальная проверка — голый `diff` без фильтра: после вставки констант он **останется красным**, пока не выровнять и строку 10.

В разведке это находка до правок (спринт просит ответить). В задаче 1: либо синхронизировать шапочные комментарии зеркала (кроме первой строки с путём — её `diff` всё равно увидит; тогда в verification сравнивать экспорты, не байты), либо явно: «выровнять оба файла, включая комментарий про зеркало; первая строка-путь может отличаться, в отчёт». Тест Т1 страхует экспорты; `diff` файла — отдельный критерий, его надо согласовать.

### W6. `chz-profile.test.ts` не создавать с нуля

Файл S-LEAD-CARRY-1 уже покрывает: declared побеждает derived (молочка vs обувь — **сильнее** спринтного `'Обувь'` + `'46.90'`, у которого гипотезы нет: префикса 46.90 в справочнике нет), `null`/`[]`/`undefined` + ОКВЭД → derived, только сироты, порядок, оба пусты → none.

Не затирать. Добавить недостающее: дубль `['Обувь','Обувь']` и явно `[]` + `'15.20'` → derived, если хотите фикстуру спринта рядом. Кейс `'46.90'` как «гипотеза не подмешана» слаб — подмешивать нечего.

### W7. Слот монтажа: между сводкой и стейкхолдерами

«После `DealSummaryCard`, до материалов» оставляет развилку: до или после `StakeholdersBlock` (`DealContextRail.tsx:182`). Логично сразу после сводки — профиль компании рядом с её именем, люди ниже. В задачу 3.3: «сразу после `DealSummaryCard`, перед `StakeholdersBlock`». В `DealContextRail` (delivery/internal) карточку не монтировать.

Ссылка «Уточнить» — `next/link` как в `DealSummaryCard:84–89`, не `<a>` и не `router.push`. Иконка — `ScanBarcode` (тот же символ на компании). Класс даты — `text-text-dim` / `text-meta` (`tailwind.config.ts:51` → `text-text-dim`), не выдуманный `text-dim`. `CHZ_SNAPSHOT_SOURCES` задача 1 обещает «человеку рядом с датой», задача 3 упоминает только дату — иначе константа мёртвая; в строку версии: дата + источники текстом, без обязательных внешних `<a>` (это не наш origin).

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `src/components/companies/CompanySidebar.tsx` | 211–228 | образец unknown-тега (`data-tag`, `bg-surface2`, не `ChzBadge`) |
| `src/components/companies/CompanyHighlights.tsx` | 186–196 | подписи источника на компании — **не** копировать, на сделке жёстче |
| `src/lib/hooks/use-companies.ts` | 99, 162–167, 213–215 | `QUERY_KEY = ['companies']`; вложить ключ ЧЗ или инвалидировать |
| `src/lib/domain/chz-profile.ts` | 38–64 | порядок состояний UI — из резолвера, не из сырого `[]` первым |
| `tests/unit/chz-profile.test.ts` | весь файл | дополнить, не создавать |
| `src/types/supabase.gen.ts` | 668 | `chz_groups` уже в Row — стаб не нужен |
| `src/components/projects/DealContextRail.tsx` | 182 | `StakeholdersBlock` между сводкой и материалами |
| `src/components/projects/DealSummaryCard.tsx` | 84–89 | образец ссылки на компанию |
| `CompanyHighlights` / `CompanySidebar` | литерал «2026-08» | out-of-scope: не разносить константу на карточку компании в этом спринте |

---

## Предлагаемые правки в спринт

1. **Задача 3 — порядок состояний** (W1): вклеить пять шагов из предупреждения. Строку таблицы «`chz_groups = []` → групп нет» сузить: «только если после резолвера `source === 'none'`».
2. **Задача 2 — ключ** (W4): `queryKey: ['companies', companyId, 'chz']` **или** явная инвалидация в `useUpdateCompany` / `useDeleteCompany`. В verification — `grep company-chz` / вложенный ключ в `use-companies.ts`.
3. **Разведка п.3:** добавить `sed -n '190,230p' src/components/companies/CompanySidebar.tsx`.
4. **Задача 1.2 / финальный `diff`:** явно про два расходящихся комментария шапки.
5. **Задача 3.3:** «сразу после `DealSummaryCard`, перед `StakeholdersBlock`»; `next/link` + `ScanBarcode`; источники рядом с датой.
6. **Т2:** «файл есть — дополнить; существующие кейсы не удалять».
7. **Задача 2:** убрать опору на `CompaniesChzStub`; «типы уже в gen, каст на SELECT не нужен».

---

## Чеклист crm-architect

- [x] Начинается с РАЗВЕДКИ
- [x] Живые имена таблиц/колонок (`companies.chz_groups`, `okved`)
- [x] Живые пути (`DealContextZone`, `chz-groups.ts`, зеркало, `ChzBadge`)
- [x] learnings: declared vs derived, сироты не глотать; 🟡 новый queryKey без инвалидации (W4)
- [x] Миграций нет, из CC не применять
- [x] RLS/org — N/A (чтение существующей org-таблицы своим RLS)
- [x] Новых DEFINER-функций нет
- [x] `flowType: 'implicit'` не появляется
- [x] DELETE / CASCADE — N/A
- [x] CSS: только токены, скоуп темы не размазывается
- [x] `schema.md` — не нужен (миграции нет)

---

## Чеклист перед CC

- [ ] (желательно) W1 порядок состояний вклеен в задачу 3
- [ ] (желательно) W4 ключ/инвалидация вклеены в задачу 2
- [ ] Ветка `feat/deal-chz-1` через `worktree-isolation`, симлинк `.env.local`
- [ ] Разведка: ответить про зеркала (шапка расходится), про существующий `chz-profile.test.ts`, про тег в `CompanySidebar`
- [ ] `PROJECT_COLUMNS` не трогать
- [ ] Пикер / `CompanyModal` / карточку компании не «подчищать» под константу даты
- [ ] Не мержить; отчёт на гейт
