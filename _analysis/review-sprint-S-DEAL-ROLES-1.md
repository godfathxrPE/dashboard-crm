# Ревью: S-DEAL-ROLES-1 — слоты ролей воронки (W10)

**Дата:** 2026-09-06
**Ревьюер:** Grok (верификация по коду `main` @ `a3d182d`, crm-architect `architecture.md` / `learnings.md` / `schema.md`, live `DealStakeholders.tsx` / `deal-signals.ts` / `DealSignals.tsx` / `stakeholders.ts` / `use-deal-stakeholders.ts` / `docs/schema.md` 092 и 027)
**Объект:** `_analysis/sprint-S-DEAL-ROLES-1.md` — таблица `pipeline_expected_roles` (миграция 130) + сборка слотов + перевод `single_threaded` на покрытие ролей
**Контекст:** карта `_analysis/deal-v2-gap-2026-09-06.md` W10; спека `_analysis/deal-v2-spec.html` W10. STATUS рев. 34 очередь ещё `S-DEAL-DATA-1 → S-DEAL-CHZ-1` — устарела относительно карты. `feat/deal-chz-1` на мерже этому спринту не нужна.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды, якоря) | ✅ живые; `DealStakeholders:270–330` и `deal-signals:285–315` совпали |
| `main` = `a3d182d`, миграция 130 | ✅ HEAD совпал; в папке последняя `129_queue_snoozes.sql`; `docs/schema.md` 129 applied `20260823182046` |
| Модель: org-таблица, не колонка `pipelines` | ✅ конвенция схемы; FK на глобальный словарь — осознанно |
| Словарь ролей не трогать; primary виртуальный | ✅ зеркало 092 / урок `companies.phone` |
| RLS org-first + freeze `org_id` руками | ✅ паттерн `stage_requirements` 027 |
| Тесты: фаза `execution` | ❌ deal-фазы другие; гейт сломается или «починят» прод |
| Тесты: `filledCount` люди vs слоты | ❌ таблица противоречит собственной шапке «N из M ролей» |
| `--line-4` | 🟡 токена в теме нет |
| Сид по имени «IIoT» / «ERP» | 🟡 попадут delivery-воронки либо 0 строк |
| `pipeline_id` в виджет | 🟡 в пропах `DealStakeholders` нет, в `useDealSignals` — есть |
| SQL не применяется из CC | ✅ |
| CSS-токены, не hex | 🟡 кроме выдуманного `--line-4` |
| Секция ТЕСТЫ | 🟡 кейсы есть, два из них вредные |
| Out-of-scope (UI настроек, W9, словарь CHECK) | ✅ |

**Оценка: 81/100 (NO-GO).** Архитектура и RLS собраны правильно, в CC уходить нельзя, пока не поправлены два тестовых якоря: фаза гейта и смысл `filledCount`.
- Порог передачи в Claude Code: **≥ 85**. Ниже 85 — не отдавать в CC.
- Любой открытый B* → максимум 84 (NO-GO). Открыты B1, B2.

**Рекомендация:** только после правок B1–B2 (и желательно W1–W3 в том же абзаце). Cold review на гейте — справедливо обязателен.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| `main` | `a3d182d`; origin на 1 коммит впереди (`8b85991`, память зон, без схемы) |
| `pipeline_expected_roles` | **нет** — дыра реальна |
| `deal_stakeholders` 092 | applied; CHECK из шести ролей MEDDIC |
| `DealStakeholders.tsx` | плоский список + виртуальный primary (`:304–307`) |
| `single_threaded` | считает `stakeholderCount`; гасится вне `working`/`approval`/`closing` |
| Сид 027 | org = `ORDER BY created_at LIMIT 1`; воронки — `entity_type = 'deal'` + имя **стадии** |

---

## Live-разведка (сверка claims)

| Claim спринта | Live @ `a3d182d` | |
|---------------|------------------|---|
| `main` = `a3d182d` | совпал | ✅ |
| Следующая миграция 130 | файл 129 есть; раздел `queue_snoozes (129, applied)` в `docs/schema.md:3794`. Живую `schema_migrations` из этой сессии не читали — номер 130 с датой 06.09 правдоподобен | ✅ |
| `DealStakeholders:270–330` | `:275` экспорт, шапка «Стейкхолдеры», кнопка «Добавить» | ✅ |
| `deal-signals.ts:285–315` | `singleThreadedSignal`; `> 1` → `ok`, иначе при фазе из сета → **`warn`**, не `bad` | 🟡 |
| `DealSignals.tsx:93` | `stakeholderCount: stakeholders?.length ?? null` | ✅ |
| Фазовый гейт `attraction` | комментарий про attraction есть (`:100–105`); код — whitelist `MULTI_THREAD_PHASES = working \| approval \| closing` (`:105`) | 🟡 формулировка |
| `sortStakeholders` — primary виртуальный | `use-deal-stakeholders.ts:75–87`; UI дорисовывает строку, если `primaryContactId` задан, а строки нет (`DealStakeholders.tsx:304–307`) | ✅ |
| `useStagesForPipeline` | `use-pipelines.ts:63` | ✅ |
| `STAKEHOLDER_ROLE_CONFIG.full` | `decision_maker` = «Принимает решение (ЛПР)», `expert` = «Технический эксперт» — не «Исполнительный директор» из макета | ✅ брать словарь, не макет |
| `stage_requirements` RLS | select всем членам org; CUD owner/admin; `org_id` явно, без `set_org_id` | ✅ |
| FK `pipeline_id → pipelines` CASCADE | у `stage_requirements` такой FK есть (`docs/schema.md:1164`). Снятие FK у `stage_transitions` (078) — про историю, не про конфиг | ✅ оставить FK |
| Имена deal-воронок | 035 в схеме называет **delivery** (`ERP Внедрение` / `IIoT Внедрение`). Deal-имена в схеме нет; cockpit-спринт: «ERP Продажи», «IIoT Продажи». `UNIQUE (direction, entity_type, name)` | 🟡 |
| `--line-4` | в `globals.css` **0** вхождений. Есть `--border` / `--border2` | ❌ |
| UI настроек | нет — out-of-scope честно | ✅ |

Команды разведки воспроизводимы. `npm run lint` / `vitest` / `build` в этой сессии не гонялись — baseline исполнителя.

---

## С чем согласен полностью

### 1. Новая таблица, не колонка и не второй `decision_maker_id`

`pipelines` глобальны. Org-атрибут воронки — отдельная таблица `(org_id, pipeline_id, …)`, как `stage_requirements`. Словарь ролей остаётся CHECK на `deal_stakeholders`. Primary остаётся `projects.contact_id`. Это ровно тот пункт S-DEAL-DATA-1, который 06.09 сняли по ошибке: ожидание ролей ≠ словарь должностей.

### 2. Воронка без строк = прежний список

Delivery и любые новые воронки не должны молча получить пустые слоты и красный сигнал. Обратная совместимость здесь не заглушка, а требование.

### 3. Сигнал переходит на покрытие, гейт фазы сохраняется

Считать «людей мало» на стадии «Защита КП» — не то сообщение. Считать «ЛПР не в контуре» — то. Гейт на ранней фазе (8 из 10 открытых сделок с ≤1 стейкхолдером) трогать нельзя.

### 4. RLS уже, чем у `deal_stakeholders`

Состав контура — настройка org, не правка сделки. manager пишет участников своей сделки и не пишет ожидания воронки. Смоки гейта (owner INSERT · manager 42501 · viewer SELECT · чужак 0 · дубль 23505 · роль 23514) — правильный набор.

### 5. Домен чистой функцией, время не нужно, тесты поведением

`resolveRoleSlots` без React и без запросов. Один человек закрывает и primary, и свою роль — слоты разные. Человек без роли в хвост. Два `expert` — первый по `created_at`.

### 6. Миграция пишется, не применяется; schema.md тем же PR; cold review обязателен

Контракт проекта соблюдён. Стаб типов снять тем же заходом, что реген — тоже.

---

## Блокеры (критично — исправить до запуска)

### B1. Тест пишет фазу `execution` — у сделки такой фазы нет

Спринт, секция ТЕСТЫ:

> ожидания есть, ЛПР не закрыт, фаза `execution` ⇒ `single_threaded` = `bad`

Deal-`phase_group`: `attraction` / `working` / `approval` / `closing` (`phase-labels.ts:16–20`). `execution` — **delivery** (`initiated` / `planning` / `execution` / `completed`). Слаги «НЕ пересекаются» — это буквально схема 035.

Живой гейт — не blacklist `attraction`, а whitelist:

```105:105:src/lib/domain/deal-signals.ts
const MULTI_THREAD_PHASES = new Set(['working', 'approval', 'closing']);
```

На `execution` сигнал сегодня и после правки останется `na`. CC либо напишет красный тест, либо «починит» прод, пустив delivery-слаг в deal-сигнал.

Плюс: сегодня незакрытый контур — это **`warn`**, не `bad` (`deal-signals.ts:309–314`). `bad` поднимает вердикт в `rotting` и красит зону «Риски». Если это сознательно (спека: «ключевой риск стадии») — написать явно; в тест всё равно ставить `working` (или `approval` / `closing`).

**Вклеить в ТЕСТЫ дословно:**

```
- ожидания есть, ЛПР не закрыт, phaseGroup `working` (не `execution` — это delivery)
  ⇒ `single_threaded` = `bad` (сознательный апгрейд с нынешнего `warn`)
- то же на `attraction` ⇒ `na` (whitelist MULTI_THREAD_PHASES сохранён)
```

### B2. `filledCount` считает людей или слоты — спринт говорит оба

Шапка виджета по спеке: «Стейкхолдеры · **1 из 3 ролей**». Решение 2: «N = сколько из них **закрыто**» (из слотов). Один человек, который и primary, и ЛПР, закрывает **два** слота → `2 из 3`.

Таблица тестов:

> ЛПР закрыт человеком, который И primary | слот primary и слот ЛПР — РАЗНЫЕ, один человек закрывает оба; **`filledCount` не задваивает людей**

«Не задваивает людей» = `filledCount === 1`. Тогда шапка соврёт «1 из 3», хотя закрыты две роли.

Первая половина строки верная (слоты разные, один человек закрывает оба). Вторая — нет.

**Заменить хвост строки:** `filledCount === 2`, `totalCount === 3` (primary + 2 ожидания). Счётчик ролей, не голов.

---

## Предупреждения (желательно исправить)

### W1. Сид матчить `entity_type = 'deal' AND direction`, не имя «IIoT»

027 не ищет воронку по имени «IIoT». Он ищет **стадию** (`ps.name = 'Подготовка КП'`) при `p.entity_type = 'deal'`. Имена deal-воронок в `docs/schema.md` отсутствуют; 035 называет delivery-uuid. `LIKE '%IIoT%'` посадит слоты и на «IIoT Внедрение».

В задачу 1:

```sql
WHERE p.entity_type = 'deal' AND p.direction = 'iiot'   -- и 'erp'
```

Имя (`IIoT Продажи`) — только в комментарии. Не нашлось — пропуск, не ошибка, как 027. Состав ERP пометить в отчёте как гипотезу — спринт уже просит, оставить.

### W2. В виджет не передаётся `pipeline_id`

`StakeholdersBlock` (`DealContextRail.tsx:116–126`) отдаёт `projectId`, `primaryContactId`, `primaryContact`, `companyId`. Пропа `pipeline_id` у `DealStakeholders` нет.

Сигнал это переживёт: `useDealSignals` уже зовёт `useStagesForPipeline(project.pipeline_id)` (`DealSignals.tsx:63`) — туда же садится `usePipelineExpectedRoles`. Слоты в карте без пропа будут вечно `hasExpectations: false`.

В задачу 6: проп `pipelineId={project.pipeline_id}` через `StakeholdersBlock`. Клик по пустому слоту — `initialRole` в `StakeholderAddForm` (`DealStakeholders.tsx:176`, сейчас `useState(null)`).

### W3. Токена `--line-4` нет

Спека написана под свой лист переменных. В продукте рамка — `--border` / `--border2` (`globals.css:87`). Пустой слот: `border-[1.5px] border-dashed border-border` (так уже нарисована `StakeholderAddForm:219`). Не заводить `--line-4`.

Обязательная незакрытая роль — `--danger-text` (или `--red-text`, он алиас). Спринт пишет `--red-text` — допустимо, но в сигналах уже `--danger-text`. Один язык.

### W4. Виртуальный primary не влезает в `filled: StakeholderRow | null`

Primary без строки в `deal_stakeholders` — легальное состояние 092. `StakeholderRow` требует `id`/`created_at`. Либо синтетическая строка с `id: 'virtual-primary'`, либо `filled` + флаг `isVirtual`. Иначе слот «пуст», хотя в карте человек есть, и `single_threaded` снова врёт.

Сверить с нынешним `primaryMissing` (`:306–307`): слот закрыт, если `primaryContactId` задан, **даже без строки**.

### W5. `warn` → `bad` меняет цвет зоны

`firstBad` ⇒ `verdict = 'rotting'` (`deal-signals.ts:361`). Пустой ЛПР на `working` покрасит «Риски» в гниение. Если так и задумано — строка в отчёте. Если нет — оставить `warn`, шапку слота всё равно держать `--danger-text`.

### W6. Стаб типов

`CompaniesChzStub` в `src/` уже нет (снят после 123). Образец для CC — `queue_snoozes` до регена (локальный `interface` + узкий каст, не `any`). В отчёте: «стаб заведён, снять с регеном». Спринт это уже сказал — не потерять.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `src/components/projects/DealContextRail.tsx` | 116–126 | прокинуть `pipeline_id` |
| `src/components/projects/DealStakeholders.tsx` | 176–197 | `initialRole` у `StakeholderAddForm` |
| `src/components/projects/DealSignals.tsx` | 60–97 | `usePipelineExpectedRoles` + `resolveRoleSlots` → `missingRequiredRoles` |
| `src/lib/constants/phase-labels.ts` | 16–20 | не `execution` |
| `src/app/globals.css` | 87 | `--border`, не `--line-4` |
| `crm-architect/STATUS.md` | 16 | очередь эпика; гейт, не CC |

Зеркала словаря ролей (менять вместе с CHECK, спринт их не меняет): `STAKEHOLDER_ROLES`, `STAKEHOLDER_ROLE_ORDER` / `CONFIG`, `src/lib/validators/stakeholder.ts`.

---

## Предлагаемые правки в спринт

1. **B1.** В тестах `phaseGroup: 'working'`. Явно: апгрейд `warn` → `bad` сознательный.
2. **B2.** `filledCount` = число закрытых слотов. Строка про «не задваивает людей» — вычеркнуть.
3. **W1.** Сид: `entity_type = 'deal' AND direction ∈ (iiot, erp)`.
4. **W2.** Проп `pipelineId` + `initialRole`.
5. **W3.** `border-border` dashed, не `--line-4`.
6. **W4.** Виртуальный primary закрывает слот.

---

## Чеклист перед CC

- [ ] B1: фаза `working`, не `execution`
- [ ] B2: `filledCount` считает слоты
- [ ] Сид не цепляет delivery-воронки
- [ ] `pipeline_id` доезжает до виджета
- [ ] Миграция 130 не применяется из CC
- [ ] `docs/schema.md` — «НАПИСАНА, НЕ ПРИМЕНЕНА» тем же PR
