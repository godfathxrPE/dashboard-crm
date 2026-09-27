# Карточка лида v2 — спецификация для разработки

**27.09.2026.** Экран: `/leads/[id]` (`src/components/leads/LeadDetail.tsx`). Тема приёмки — дефолтная `t-cobalt`,
плюс прогон по всем 8 темам на гейте.
**Основание:** аудит и решения — Claude Project, `claude/leads-card-v2-audit-redesign-2026-09-27.md`
(находки F-01…F-15, решения R-01…R-13). **Макет:** Design-артефакт «Лид v2 — редизайн карточки», 5 артбордов
(Контакт · Новый · Квалифицирован · Конвертирован · Отклонён). Макет рисует решения, а не реальные компоненты:
при расхождении с этим файлом прав **этот файл**.
**Миграций нет.** Все данные — существующие колонки `leads` (`docs/schema.md`).

Спринты: `S-LEAD-V2-LAYOUT-1` → `S-LEAD-V2-HEALTH-1` → `S-LEAD-V2-WORK-1`. Каждый спринт деплоится сам по себе.

---

## 0. Принцип

Лид говорит на языке карточки сделки v2: те же зоны, материалы, радиусы и места для одних и тех же фактов
(шаг — слева в «Работе», риски — справа сверху, справка — справа снизу). Но состав беднее, потому что лид
живёт дни: **нет** кольца здоровья, пульса, доски задач, орг-блока, AI-брифа, стейкхолдеров, доната полноты.

Правило одного носителя (F-01): у факта одно словесное место. Вердикт и причины — только в зоне «Риски».
В кокпите — мера времени в статусе (другой факт), в стекле шага — дата и «просрочен N дн.» рядом с полем,
как у сделки (`DealNextStep`), больше нигде.

---

## 1. Сетка страницы

```
content-shell
├ крошка «← Лиды»                         text-xs text-text-mute, mb-2.5  (как сейчас)
├ <LeadHeader>   grid lg:grid-cols-[minmax(0,1fr)_356px] gap-5 mb-5   ← копия сетки DealHeader
└ тело           grid lg:grid-cols-[minmax(0,1fr)_356px] gap-5 items-start
   ├ section.zone «Работа»   --zone-surface: var(--zone-work); --zone-gap: .875rem; min-w-0; order-1
   └ div правая колонка      flex-col gap-5; lg:sticky lg:top-4 lg:self-start; order-2
      ├ section.zone «Риски»    класс h-ok|h-attention|h-rotting; --zone-surface: var(--h-zone)
      └ section.zone «Контекст» --zone-surface: var(--zone-ctx)
```

Разметку зон брать **дословно** из `ProjectDetail.tsx` (блок `S-DEAL-ZONES-1A`, ~стр. 558–625): `.zone`,
`.zone-eyebrow`, `<small>`, sticky на обёртке правой колонки. Ниже `lg` колонки стекаются: Работа → Риски →
Контекст.

Eyebrow-подписи:
- «Работа» `color: var(--zone-work-ink)` · small «что делаем сейчас · статус · квалификация»
- «Риски» `color: var(--h-chip-ink)` · small «что может сорвать лид»
- «Контекст» `text-text-dim` · small «кто, откуда, что известно»

---

## 2. Шапка — `LeadHeader` (новый, `src/components/leads/LeadHeader.tsx`) · R-09, F-08, F-11

Образец — `DealIdentityCard` + `DealHeader` (client-ветка). Не обобщать их: там три запроса сделки.

**Левая карточка** `.sheet flex items-center justify-between gap-6 rounded-[1.125rem] px-[1.125rem] py-3`:
- Аватар `grid size-11 rounded-[0.875rem] bg-text-main text-bg text-[0.9375rem] font-bold` — первая буква
  `lead.title` (комментарий про контраст — из `DealIdentityCard`, не менять решение).
- `h1` `truncate text-[1.375rem] font-semibold leading-[1.1] tracking-[-0.02em]` = `lead.title`.
- Рядом ОДИН тег направления: `Badge color={direction==='erp' ? 'purple' : 'blue'} size="sm"` — ровно как
  `typeBadge` сделки. Нет `direction` — тега нет.
- Подстрока `text-meta text-text-mute`, части через «·», пустая часть не рисуется (приём `metaParts`):
  `company_name_raw` (truncate, `font-medium text-text-dim`) · `contact_name_raw` · имя ответственного
  (`owner_id` → `useTeamMembers`).
- Справа — оценка суммы, **только если `estimated_value != null`**: число `formatBudgetFull` (копейки!)
  `text-[1.625rem] font-semibold tabular-nums`, «₽» мельче (приём разбора из `DealIdentityCard`), подпись
  `text-meta text-text-mute` «оценка лида». Нет оценки — блока нет (не прочерк).

**Из шапки уходят:** бейдж источника (accent — F-08), бейдж температуры, бейдж «ЧЗ через N мес.»
(сигнал переезжает в «Риски»), email/телефон строкой (переезжают в «Сводку» и в стекло шага).

**Правая группа** `flex flex-wrap items-center gap-1.5 lg:justify-end lg:self-center`:

| Статус | Кнопки |
|---|---|
| new / contacted / qualified | «Отклонить…» (вторичная, нейтральная) · карандаш |
| converted | «Открыть сделку →» (тёмная: `bg-text-main text-bg`, как «AI-бриф») · карандаш |
| disqualified | карандаш |

- Вторичная кнопка: высота `h-[2.125rem]`, `rounded-lg border border-border px-3 text-xs font-medium` — сверить
  с «Выиграна/Проиграна» в `DealHeader` и взять их классы.
- Карандаш — иконка-кнопка `Pencil` с `aria-label="Редактировать лид"`, открывает `LeadModal` (как «Ред.» сейчас).
- **«Отклонить…» — R-08, пересматривает §7 «терминальное только в меню».** Клик раскрывает под шапкой строку
  причин (текущая разметка `rejecting` из `LeadDetail`, перенесённая) → `status.change(id,'disqualified',r)`.
  **Не красная.** `window.confirm` запрещён — выбор причины и есть подтверждение.

---

## 3. W1 · Кокпит статуса — зона «Работа», первым · R-02, R-03, F-06, F-13

Контейнер — `.sheet` с тем же паддингом, что у кокпита сделки (grep `cockpit` в `ProjectDetail.tsx`).
Компонент — штатный `PipelineCockpit`, но **ветка `CockpitRow`** (передаётся `gauge`), а не `LegacyRow`.

| Проп | Значение у лида |
|---|---|
| `groupLabel` | «Статус лида» |
| `metaRight` | «{i+1} из 4» |
| `pastCount` / `pastNames` | пройденные статусы из `STEPPER` |
| `current` | `{ name: LEAD_STATUS_CONFIG[status].label }` |
| `gauge` | из `leadStatusGauge()` (§8) |
| `counterLabel` *(новый)* | у `new` — «20 ч из 24»; у остальных не передаётся |
| `dates` | `{ entered, norm }` из `leadStatusGauge()` |
| `gate` | только у `qualified`: обязательные пункты квалификации (как сейчас) |
| `next` | как сейчас: Связаться / Квалифицировать / Конвертировать в сделку (замок) |
| `extraActions` | **убрать** — «Отклонить» уехал в шапку (F-07) |
| `restCount` | остаток статусов |
| `inlineNames` *(новый)* | `true` — пройденные именами «✓ Новый · Контакт», остаток — пунктирными чипами с именами вместо «+N» |
| `map` | `null` — карты у лида нет (4 статуса помещаются в строку) |
| `miniMap` | не передаётся |
| `locked` | `converted` |
| `currentExtra` | **убрать** `LeadHealthMark` — время теперь несёт шкала |

Новые пропсы `PipelineCockpit` — **аддитивные, дефолт = прежнее поведение**; сделка и внедрение не меняются:
- `map: ReactNode | fn | null` — при `null`: шеврона нет, чип пройденных — `<span>`, не `<button>`.
- `counterLabel?: string` — заменяет текст счётчика ячейки («N дн. из M по норме»).
- `inlineNames?: boolean` — см. таблицу. Пунктирный чип: `h-[1.875rem] rounded-[0.625rem] border-[1.5px]
  border-dashed border-border2 px-3 text-xs text-text-dim`.

Состояния:
- **new** — ячейка «Новый», счётчик «20 ч из 24», шкала по часам, подписи `CockpitRow` штатные:
  «вход 26 сент., 18:40» ↔ «норма 27 сент., 18:40» (слова подписей не параметризуем).
- **contacted** — «Контакт», «18 дн. из 7 по норме», вход = `first_contacted_at`.
- **qualified** — «Квалифицирован», только «3 дн.» (нормы нет → `norm: null`, шкалы нет), точки готовности.
- **converted** — `locked`, все пройдены, ячейка «Конвертирован» без счётчика.
- **disqualified** — кокпита нет; на его месте терминальная плашка (W1-D).

**W1-D · Плашка «Отклонён»** `.sheet flex items-center gap-3 px-[1.125rem] py-4`: чип `bg-danger-l text-danger-text`
«✕ Отклонён» · причина `text-sm font-semibold` (`DISQUALIFY_REASON_CONFIG`) · под ней `text-meta text-text-mute`
«лид убран из очередей» · справа кнопка «Восстановить» (`RotateCcw`, → `status.change(id,'new')`, как сейчас).

---

## 4. W2 · Следующий шаг — `LeadNextStep` (новый) · R-04, F-02, F-12

Разметка — **копия `DealNextStep`** (стекло `.glass-sheet`, плашка `.glass-plate`, иконка 22px, `data-empty`,
`max-w-[72ch]`, `text-xl font-medium`). Мутации — `useUpdateLead`. Якорь `id="lead-next-step"`.

Показывается у `new`, `contacted`, `qualified`. У `converted` на этом месте W2-C, у `disqualified` — ничего.

- Плашка: `InlineEdit` над `lead.next_step`, placeholder «Какой следующий шаг?», курсив в пустом.
- Футер слева: «Дата:» + `InlineEdit type="date"` над `next_action_date` (`formatActionDate` — вынести
  общий из `DealNextStep`, не копировать третий раз; сейчас копии в `DealNextStep` и `LeadDetail`) ·
  «просрочен N дн.» `text-red` при просрочке (`getLeadActionOverdueDays`) · «Шаг сделан» при наличии шага
  (очищает `next_step` и `next_action_date`).
- Футер справа (`ml-auto`): чип контакта — **`PrimaryContactChip` вынести в
  `src/components/shared/ContactCallChip.tsx`** с пропсами `{ name, position?, initialsFrom, phone, email }`;
  сделка передаёт свои поля, лид — `contact_name_raw`, `phone`, `email`. Правило чипа прежнее: без телефона и
  почты не рисуется.
- У `status === 'new'` и `first_contacted_at == null` — строка `text-meta text-text-dim` под футером:
  «Звонок со статусом «состоялся» сам переведёт лид в «Контакт»» (поведение уже есть:
  `advanceLeadToContacted` в `use-calls.ts`).

**Не берём из макета** (те же причины, что у `DealNextStep`, комментарий в его шапке): кнопку «Перенести»,
строку «обновлён {когда} · {кто}» (штампа в схеме нет).

**W2-C · Сделка создана** (`converted`): прежний `ConvertedDealCard`, материал `.sheet` вместо рамки
`rounded-xl border`, eyebrow `text-success-text` «Сделка создана» + `<small>` дата конверсии; справа ссылка
«Открыть сделку →»; сетка фактов 4 колонки (как сейчас) + четвёртым фактом вместо «Конверсия» — ничего не
выдумывать: дата уже в eyebrow, колонку «Конверсия» убрать.

---

## 5. W3 · Квалификация — зона «Работа» · R-07, F-04, F-05, F-14

Карточка `.sheet px-[1.125rem] py-4`, якорь `id="lead-qualification"`.
Шапка: «Квалификация» `text-xs font-bold` + счётчик «4 из 6» `text-xs tabular-nums text-text-dim`.
Готовность к конверсии здесь **не** печатается — её несут точки гейта в кокпите и замки на строках.
Read-only (`converted` / `disqualified`) — справа в шапке `text-meta text-text-mute`: «только чтение ·
перенесено в сделку» / «заморожено до восстановления».

Две зоны §7 сохраняются: **«Осталось выяснить»** (подложка `bg-surface2 rounded-[0.875rem] p-4`) и **«Известно»**.
Раскладка по ширине **блока**, а не экрана — `@container`, приём `.deal-org-split` из `globals.css`:

| Состояние | Раскладка |
|---|---|
| есть и открытые, и известные | `2fr / 3fr` при блоке ≥ 44rem, иначе одна колонка |
| только открытые | открытые в 2 колонки внутри подложки при ≥ 44rem |
| только известные | 3 колонки при ≥ 44rem, 2 — при меньшем |

**Строка открытого пункта** (F-05: контрол под лейблом, не у дальнего края):
- лейбл `text-body font-semibold`; под ним либо замок «держит конверсию» (`text-meta`, `--yellow-text`,
  `Lock 11`), либо следствие `item.hint` `text-meta text-text-mute`;
- под ними, `mt-2`, контрол **сразу отвечающий на вопрос** (F-04):

| Пункт | Контрол | Запись |
|---|---|---|
| Боль / задача | `InlineEdit as="textarea"` (как сейчас) | `pain` |
| Бюджет | 3 кнопки-варианта: Нет бюджета · Оценён · Подтверждён (`LEAD_BUDGET_STATUS_CONFIG` без `unknown`) | `budget_status` |
| Роль контакта | 3 кнопки: ЛПР · ЛВР · Пользователь + «ещё…» (`<select>` со всем `STAKEHOLDER_ROLE_ORDER`) | `decision_role` |
| Группы ЧЗ | «+ Группа из справочника» → поповер со списком `CHZ_GROUP_NAMES` (мультивыбор, как `toggleChz` в `LeadModal`) | `chz_groups` |
| Дедлайн ЧЗ | `InlineEdit type="date"` | `regulatory_deadline` |
| Оценка суммы | поле суммы в рублях + «Сохранить» (`parseBudgetInput` → копейки) | `estimated_value` |

Кнопка-вариант: `h-7 rounded-[0.5625rem] border border-border2 bg-surface px-2.5 text-xs font-medium`,
hover `bg-surface2`. Роли — только значения, которые допускает `leads_decision_role_check` (РАЗВЕДКА).
«Заполнить» → `LeadModal` **удаляется** из строк; полная форма остаётся на карандаше шапки.

**Строка известного пункта:** ключ `text-meta text-text-mute` (400), значение `text-body text-text-main` (400).
Галок нет (§7). У «Группы ЧЗ» после каждой группы — тег фазы из `chzStatusLabel(g, now)` (`chz-groups.ts`),
стиль тега — как в `DealChzCard`.

«Заполни боль и бюджет — тогда можно конвертировать» — только когда известных нет вовсе (как сейчас).

---

## 6. W4 · Активность — зона «Работа», последней · R-11, F-10, F-15

Вид сделки W5 (`S-DEAL-ACTIVITY-VIEW-1`), а не прежняя лента. Компоненты сделки получают аддитивный
параметр сущности:
- `useDealActivity(projectId, filter)` → `useDealActivity(entityId, filter, entityType = 'project')`;
- `DealActivityFeed`, `DealLastEvent` — проп `entityType?: TimelineEntityType` (дефолт `'project'`),
  `projectId` → `entityId` (два вызова в `ProjectDetail` обновить).

У лида:
- шапка одной строкой: «Активность» `text-xs font-bold` · `TimelineFilterChips variant="pill"`
  `kinds={['call','task','activity']}` `labels={{ activity: 'Поля' }}` · «Вся лента» · справа
  «+ Звонок» / «+ Задача» (`openModal('call'|'task', undefined, { leadId })`, как сейчас);
- `DealLastEvent entityType="lead"`;
- `ActivityComposer entityType="lead" variant="deal"`;
- `DealActivityFeed entityType="lead"`.

Фильтров «Встречи» и «Сделки» у лида нет (F-10: `meetings.lead_id` не существует). Набор уходит в
`kinds` хука — дефекта S-TL-2 нет (см. комментарий к `kindFilter` в `EntityTimeline`).
Read-only статусы: композера и кнопок нет, лента есть.

---

## 7. Правая колонка

### W5 · Риски — `LeadRisksCard` (новый) · R-05, R-06, F-01

Зона рендерится только у `new` / `contacted` / `qualified` (у закрытых сигналов нет — `getLeadSignals`
вернёт пустой список, зона не рисуется целиком).

Карточка `data-card rounded-lg border border-border bg-surface p-4` (как `HealthDealCard`):
1. Строка: «Здоровье лида» `text-body text-text-dim` + чип вердикта. Классы чипа — `VERDICT_STYLES` из
   `DealSignals.tsx` (экспортировать), подписи свои: ok «В порядке» ●, attention «Внимание» ◐, rotting
   «Остывает» ▲. Кольца **нет** (R-06: у лида уровни, не баллы).
2. Сегменты — по одному на сигнал, порядок bad → warn → ok: разметку и `STATE_STROKE` взять из
   `DealHealthRing.tsx` (ряд `mt-2.5 flex gap-1.5`, сегмент `h-1.5 flex-1 rounded-full`), экспортировать
   `STATE_STROKE`, а не копировать.
3. Подпись `text-meta text-text-dim`: «1 критичный · 1 внимание · 1 в норме» (`pluralRu`), без сигналов —
   «сигналов нет — лид в норме».
4. Список: проблемы — `SignalRow`; норма свёрнута «N в норме ▾» — **ровно** ветка `showVerdict={false}` из
   `DealSignals`. `SignalRow` экспортировать и сделать дженериком по ключу (`<K extends string>`), типы
   сделки не менять.
5. CTA скроллит к якорю: `step` → `lead-next-step`, `regulatory` → `lead-qualification`.

Класс зоны по вердикту: ok → `h-ok`, attention → `h-attention`, rotting → `h-rotting`.

### W6 · Сводка — `RailCard` + `RailRow` (`src/components/shared/RailCard.tsx`)

`RailCard icon={Info} title="Сводка"`, строки:

| Ключ | Значение |
|---|---|
| Компания | `company_name_raw`, `wrap` (перенос, не обрезка) |
| Контакт | `contact_name_raw` |
| Телефон | `<a href={telHref}>` `formatPhone`, `tabular-nums` |
| Email | `<a href="mailto:">` |
| Ответственный | имя по `owner_id` |
| Источник | `LEAD_SOURCE_CONFIG[source].label` |
| Температура | `LEAD_TEMPERATURE_CONFIG[t].label` + `text-meta text-text-mute` «· оценка менеджера» (R-10, F-09) |
| Создан | дата · «N дн. назад» (у `new` — «N ч назад») |
| Первое касание | `first_contacted_at` · «через N ч/дн.»; нет — «ещё не было» курсивом `text-text-mute` |

Пустое значение — строка не рисуется (кроме «Первое касание»).

### W7 · Заметки

`RailCard icon={StickyNote} title="Заметки"` — только если `lead.notes` не пуст; текст `text-body
whitespace-pre-wrap`; под ним `text-meta text-text-mute`: «При конверсии станет закреплённой заметкой сделки»
(у `converted` — «Перенесена в сделку»). Правка — карандаш шапки (`LeadModal`), своей кнопки нет.

---

## 8. Домен (чистые функции, `now` — аргументом)

### `leadStatusGauge(lead, now)` — `src/lib/domain/lead-status-gauge.ts`

```ts
type LeadStatusGauge = {
  gauge: StageTimeGauge;            // из stage-norm.ts
  counterLabel: string | null;      // только у new
  dates: { entered: string | null; norm: string | null };
};
```

| Статус | Вход | Норма | Как считается |
|---|---|---|---|
| new | `created_at` | 24 ч (`LEAD_NEW_STALE_DAYS`) | по **часам**: `pct = min(100, h/24·100)`, state по порогам `stageTimeGauge` (≥70% warn, >100% over); `gauge.days` = целые дни; `counterLabel` «N ч из 24» (≥ 48 ч — «N дн. из 1») |
| contacted | `first_contacted_at ?? updated_at` | `LEAD_CONTACTED_STALE_DAYS` (7) | `stageTimeGauge(entered, 7, now)` |
| qualified | `qualified_at ?? updated_at` | нет | `stageTimeGauge(entered, null, now)` |
| converted / disqualified | — | — | `{days:null, norm:null, pct:null, state:'ok'}` |

Даты подписей: `entered` — «9 сент.» (у new — «26 сент., 18:40»), `norm` — дата входа + норма; при
превышении `CockpitRow` сам допишет «+N дн.».

⚠️ Это **другой счётчик**, чем молчание в `getLeadHealth` (`updated_at`): время в статусе ≠ время без
касания. Слова разные: кокпит — «N дн. из M по норме», Риски — «Молчание N дн.».

### `getLeadSignals(lead, now)` — `src/lib/domain/lead-signals.ts`

```ts
type LeadSignalKey = 'step' | 'regulatory' | 'first_touch';
type LeadVerdict = 'ok' | 'attention' | 'rotting';
interface LeadSignal { key: LeadSignalKey; state: 'bad'|'warn'|'ok'; label: string; detail: string; cta: string | null }
interface LeadSignalsResult { verdict: LeadVerdict; signals: LeadSignal[]; top: LeadSignal | null }
```

Закрытый лид (`converted`/`disqualified`) → `{ verdict: 'ok', signals: [], top: null }`.

| key | Условие | state | label | detail | cta |
|---|---|---|---|---|---|
| step | шаг просрочен (`getLeadActionOverdueDays` > 0) | bad | «Шаг просрочен на N дн.» | «Обещанная дата прошла — клиент ждёт» | «К шагу» |
| step | шаг назначен, не просрочен | ok | «Шаг назначен на {дата}» | «» | — |
| step | шага нет, `getLeadHealth` → ok | warn | «Следующий шаг не назначен» | «Назначь шаг — иначе лид начнёт остывать» | «К шагу» |
| step | шага нет, → stale | warn | new: «Нет первого касания N дн.» · contacted: «Молчание N дн.» | «Шага нет — назначь его, и счётчик замолчит» | «К шагу» |
| step | шага нет, → cold | bad | то же + « — лид остывает» | то же | «К шагу» |
| regulatory | `regulatory_deadline` через 0…3 мес. (правило `regulatoryMonths` из LeadDetail, переносится сюда) | warn | «Маркировка обязательна с {дата} — через N мес.» (< 31 дн. — «через N дн.»; 0 дн. — «сегодня»; прошедшая дата — сигнала нет, как сейчас) | «Пилот до срока может не успеть» | «К ЧЗ» |
| first_touch | `new` без `first_contacted_at`, < 24 ч | ok | «Первое касание: осталось N ч» | «SLA — сутки с заявки» | — |
| first_touch | `first_contacted_at − created_at` ≤ 24 ч | ok | «Первое касание — через N ч» | «» | — |

Остальные комбинации — сигнала нет (не `na`-строки). Вердикт: есть `bad` → rotting, иначе есть `warn` →
attention, иначе ok. Сортировка bad → warn → ok, внутри — по порядку таблицы. `top` = первый не-ok.

⚠️ Молчание при назначенном шаге **не** сигналит — ядро правила `getLeadHealth` («запланированный шаг
глушит staleness»), не ломать.

---

## 9. Что удаляется из `LeadDetail.tsx`

`ZoneTitle` (заменяется eyebrow зон и шапками карточек) · карточка «Сигналы» и `showRegWarning`/`showColdSignal`
· фокус-панель на `rounded-xl border` · локальный `formatActionDate` · `regulatoryMonths` (уезжает в домен) ·
отдельная карточка «Заметки» в основной колонке · бейджи шапки · `extraActions` кокпита · `LeadHealthMark` в
кокпите и в фокус-панели. `LeadHealthMark` **остаётся** в канбане и peek — их не трогаем.

## 10. Вне скоупа эпика

Канбан и таблица `/leads` · peek-панель лида · тёмная плашка «Впереди» из макета · автоподстановка дедлайна ЧЗ
из справочника · пульс, доска задач, стейкхолдеры, AI у лида · общий «конструктор» карточек лида и сделки.
