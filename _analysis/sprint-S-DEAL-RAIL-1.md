# Claude Code Prompt — S-DEAL-RAIL-1: двухколонник карточки сделки

**Основание:** `improvements/deals-layout-rationale-2026-08-24.md` — решения R-02, R-03, R-05,
R-06, R-09, R-11, R-12. Спринт B из трёх; A (`S-DEAL-CANVAS-1`, PR #34) закрыт — полотно уже
ограничено 1440.
**Схема:** миграций нет, БД не трогаем, типы не меняются, новых хуков нет.
**Объём:** самый крупный из трёх. Порядок задач фиксирован — 5 опирается на 1–4.

Цель: справочные данные уходят вправо, вертикаль полотна возвращается работе.
Норма — **≤400px до полосы вкладок** (`crm-ui-designer` §5); сейчас ≈580px в дефолте
(карта воронки свёрнута) и ≈700px с раскрытой картой.

---

## РАЗВЕДКА

Выполнить целиком, результат приложить. Расхождение с ожиданием — остановиться и написать.

```bash
cd ~/Downloads/dashboard-crm

# 1. Спринт A на месте — ожидание: content-shell на 5 страницах, токен один
grep -rn "content-shell" "src/app/(dashboard)" | wc -l
grep -n "content-max" src/app/globals.css

# 2. Образец сетки — ожидание: CompanyDetail.tsx строка ~250
grep -n "lg:grid-cols-\[minmax(0,1fr)_320px\]" src/components/companies/CompanyDetail.tsx

# 3. Примитивы, которые будем поднимать в общие — ожидание: SideCard ~245, Row ~268
grep -n "^function SideCard\|^function Row" src/components/companies/CompanySidebar.tsx

# 4. Якоря сигналов — ожидание: 4 живых id + stage_dwell: null
sed -n '/export const SIGNAL_ANCHORS/,/^};/p' src/components/projects/DealSignals.tsx

# 5. Где стоят якоря сейчас — ожидание: info-grid 569, stakeholders 648, activity 821, next-step в DealFocusPanel 59
grep -rn "deal-info-grid\|deal-stakeholders\|deal-activity\|deal-next-step" src/components/projects/

# 6. data-stats-grid в CSS — ожидание: ПУСТО (атрибут мёртвый, снимаем без замены)
grep -rn "data-stats-grid" src/app/globals.css

# 7. Кто рендерит DealFocusPanel — ожидание: ProjectDetail:550 (полная) и ProjectPeekContent:61 (compact)
grep -rn "<DealFocusPanel" src/

# 8. StageRail: скролл есть, shrink нет — ожидание: overflow-x-auto на 76, shrink-0 только у узла 155
grep -n "overflow-x-auto\|shrink-0" src/components/shared/StageRail.tsx

# 9. Размер файлов до правки
wc -l src/components/projects/ProjectDetail.tsx src/components/projects/DealFocusPanel.tsx
```

---

## ЗАДАЧА 1 — общие примитивы рельсы

Сейчас `SideCard` и `Row` живут приватно в `CompanySidebar.tsx`. Копировать их в рельсу
сделки нельзя: два вида одной строки — начало дрейфа, ровно того, от которого заводился
контракт токенов.

**Новый файл** `src/components/shared/RailCard.tsx`:

```tsx
'use client';

import type { LucideIcon } from 'lucide-react';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1: примитивы правой рельсы контекста.
//
// Подняты из CompanySidebar (S-R2-CO360-1) без изменения разметки — карточка
// компании и карточка сделки обязаны говорить одним языком. Правки здесь
// меняют обе рельсы разом; это и есть причина существования файла.
// ═══════════════════════════════════════════════════════

export function RailCard({
  icon: Icon, title, badge, action, children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-card className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon size={13} className="shrink-0 text-text-dim" />
        <span className="text-xs font-semibold text-text-main">{title}</span>
        {badge}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Key-value: лейбл фиксированной ширины слева, значение справа.
 *
 * `wrap` — для значений, которые обязаны переноситься, а не обрезаться:
 * «ООО «Торговый дом Метизы и Крепёж»» не влезает в рельсу ни при 320, ни при
 * 400 (замерено в мокапе), и ширина эту задачу не решает — решает перенос.
 */
export function RailRow({
  label, wrap, children,
}: {
  label: string;
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 py-0.5 text-sm">
      <span className="w-[5.5rem] shrink-0 text-text-mute">{label}</span>
      <span className={`min-w-0 flex-1 text-text-main${wrap ? '' : ' truncate'}`}>{children}</span>
    </div>
  );
}
```

**Правка** `src/components/companies/CompanySidebar.tsx`: удалить локальные `SideCard` и `Row`,
импортировать `RailCard`/`RailRow` из `@/components/shared/RailCard`, заменить все вхождения
(`<SideCard` → `<RailCard`, `<Row` → `<RailRow`). **Разметку не менять** — задача чисто
механическая, визуальный результат карточки компании обязан остаться байт-в-байт.

⚠️ `Row` без `wrap` теперь получает `truncate`, которого раньше не было. В `CompanySidebar`
это меняет поведение длинных значений (юр. адрес, ОКВЭД с отраслью). **Поэтому в
`CompanySidebar` все существующие вызовы `RailRow` ставить с `wrap`** — прежнее поведение
сохраняется, а `truncate` остаётся опцией для новой рельсы сделки.

---

## ЗАДАЧА 2 — «Сводка»: property-list вместо четырёх боксов

**Новый файл** `src/components/projects/DealSummaryCard.tsx`.

Забирает содержимое инфо-грида (`ProjectDetail.tsx` ~569–648) и бейдж полноты.

Состав строк (порядок фиксирован):

| Строка | Значение | Поведение |
|---|---|---|
| Компания | `project.company?.name` | `wrap`, клик → `/companies/{id}`, цвет `text-accent` |
| Контакт | ФИО | без `wrap`; пусто → `+ Указать`, курсив, `text-text-mute` |
| Бюджет / Сделка | `budget` у client, родительская сделка у delivery | `InlineEdit` как сейчас |
| Дедлайн | `deadline` | `InlineEdit` как сейчас |
| Создана | `created_at` | статично, `text-text-dim` |

**Требования:**

- `id="deal-summary"` на корне карточки — якорь сигнала `deadline` (см. задачу 6).
- **Бейдж полноты `CompletenessBadge` переезжает сюда** — в `badge` у `RailCard`.
  Из шапки страницы он **удаляется** (R-06: счётчик обязан стоять над полями, которые
  считает). Компонент не переписывать — вырезать из `ProjectDetail` и передать пропом.
- **«Создан …» из шапки страницы удаляется** — строка «Создана» здесь его замена (R-11, F-09).
- Пустые значения — не прочерк: `+ Указать` курсивом. Для полей с высокой ценой пустоты
  (контакт, бюджет) — жёлтая точка `6px` справа и `title` с последствием
  («Некому писать и звонить» / «Нечего защищать на комитете»). Формулировки взять из
  `useCompletenessRules` (`rule.cost`), не сочинять новые.
- ФИО контакта сокращать до «Фамилия И. О.», полное — в `title`.
- `InlineEdit` и курсив плейсхолдеров сохраняются как есть (S-UI-CLARITY-1, F-05).

**Запрет:** не заводить `bg-surface border border-border rounded-lg` руками —
`audit-tokens.py` R5. Карточка строится только через `RailCard`.

---

## ЗАДАЧА 3 — `DealContextRail`

**Новый файл** `src/components/projects/DealContextRail.tsx` — правая колонка целиком.

Порядок карточек сверху вниз (фиксирован):

1. **Здоровье** — `DealSignals` со списком сигналов и CTA. **Вердикт здесь НЕ повторяется:**
   он живёт в рабочей колонке рядом с шагом (задача 4). Дубль вердикта — воспроизведение
   F-01, закрытой в S-HEALTH-V2-1.
   У delivery/internal вместо `DealSignals` — `DeliveryHealthDot` с причинами, как сейчас в шапке.
2. **Сводка** — `DealSummaryCard` из задачи 2.
3. **Стейкхолдеры** — `DealStakeholders` (компонент **не переписывать**, только переставить),
   обёрнут в `<div id="deal-stakeholders">`.
4. **Закреплено** — `pinned_note` через `InlineEdit as="textarea"`, только у `type='client'`
   (у delivery/internal заметка живёт в «Материалах», дубля не заводить).

**Ветвление по типу** — единственное место, где рельса знает про `isDelivery`. Не размазывать
условие по карточкам.

Корень: `<aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">`.

---

## ЗАДАЧА 4 — расщепление фокус-панели

### 4.1 Новый `src/components/projects/DealNextStep.tsx`

Забирает из `DealFocusPanel` **только зону 1** (следующий шаг) плюс одну строку вердикта:

```
┌ › Следующий шаг ─────────────────────────────┐
│ Ожидаем получение материала — видео анкеты   │
│ Дата: назначить   [✓ Шаг сделан]             │
└──────────────────────────────────────────────┘
● Новая · причина: у следующего шага нет даты
```

- `id="deal-next-step"` на корне.
- Заливка `bg-yellow-l` — **только** когда шага нет (`health === 'no-action'`), как сейчас.
  Нормальное состояние — нейтральный `surface` с акцентной левой границей 3px.
- Вердикт — одна строка под карточкой: пилюля состояния + текст причины. Причина берётся из
  того же `useDealSignals`, что и рельса; **второго запроса быть не должно** — контекст
  сигналов собирается один раз в `ProjectDetail` и передаётся пропом в `DealNextStep` и в
  `DealContextRail`.
- **Пилюлю «нет даты» рядом с полем даты не добавлять** (R-10): тот же факт уже несёт сигнал
  в рельсе, это F-01.

### 4.2 `DealFocusPanel.tsx` остаётся только для peek

После задачи 4.1 полная (не-compact) ветка панели не используется никем.

- Удалить проп `compact` и всю не-compact разметку (трёхколоночный grid, зоны «Закреплено»
  и «Здоровье» в ряду).
- Компонент становится одноколоночным по определению; `ProjectPeekContent` вызывает его
  **без** пропа `compact`.
- Шапку файла заменить комментарием: панель обслуживает **только** peek 440px; на полной
  карточке её роль разделена между `DealNextStep` и `DealContextRail`.
- `id={compact ? undefined : 'deal-next-step'}` → id не ставится вовсе: в peek его быть
  не должно (дубль id с полной страницей уводил `getElementById` не туда).

---

## ЗАДАЧА 5 — сетка в `ProjectDetail`

### 5.1 Вынести шапку в `src/components/projects/DealHeader.tsx`

Забирает блок `ProjectDetail.tsx` ~327–520: имя, бейджи, терминальные действия, AI, edit,
delete, `InlineConfirm` удаления. **Логику действий не менять** — перенос как есть, пропами.

Из шапки при переносе **удаляются**: `CompletenessBadge` (уехал в «Сводку», задача 2) и
строка «Создан …» (уехала туда же, R-11).

### 5.2 Сетка

```tsx
{/* Кокпит — во всю ширину карточки: раскрытой карте воронки нужна ширина,
    в колонке 1100px одиннадцать стадий дают наезд подписей (R-04). */}
{project.pipeline_id && project.stage_id && (project.type === 'client' || isDelivery) && (
  <div className="mb-5">
    <ProjectStageCockpit project={project} onRollback={setRollback} />
  </div>
)}

<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
  <div className="flex min-w-0 flex-col gap-4 order-1">
    {/* DealNextStep · вкладки · содержимое вкладки · лента */}
  </div>
  <div className="order-2 lg:order-none">
    <DealContextRail … />
  </div>
</div>
```

⚠️ **`order` обязателен.** Ниже `lg` рельса встаёт под рабочую колонку — но контекст должен
быть **над** лентой, а не под ней. Порядок на узком: шаг → сводка → здоровье → вкладки.
Реализовать через `order-*` на внутренних блоках, а не перестановкой JSX.

### 5.3 Что уходит из потока

- Инфо-грид (`id="deal-info-grid" data-stats-grid`) — удаляется целиком. Атрибут
  `data-stats-grid` в CSS не используется (разведка п.6), замены не требует.
  В `PipelineBoard` и `DashboardHome` атрибут **не трогать** — не наш скоуп.
- `DealStakeholders` из потока — в рельсу.
- Секция «Материалы проекта» **остаётся на месте, как есть** — её переработка в спринте C.

**Целевой размер** `ProjectDetail.tsx` — ≤550 строк (сейчас 949). Если не выходит — написать
в отчёте, что осталось и почему, не ужимая насильно.

---

## ЗАДАЧА 6 — якоря сигналов

`src/components/projects/DealSignals.tsx`, `SIGNAL_ANCHORS`:

```ts
export const SIGNAL_ANCHORS: Record<SignalKey, string | null> = {
  next_step: 'deal-next-step',      // DealNextStep
  deadline: 'deal-summary',         // было 'deal-info-grid' — грид расформирован
  silence: 'deal-activity',         // без изменений
  single_threaded: 'deal-stakeholders',
  stage_dwell: null,
};
```

⚠️ **Это не ловится ни `tsc`, ни тестами.** После правки проверить руками каждый из трёх
живых CTA: клик по кнопке сигнала обязан доскроллить до нужного блока, а не остаться на месте.
`deadline` — самый рискованный: id меняет и место, и природу.

---

## ЗАДАЧА 7 — `StageRail` не сжимается, а скроллится

`src/components/shared/StageRail.tsx`: контейнер уже имеет `overflow-x-auto` (строка 76), но
группы и стадии внутри — без `shrink-0`, поэтому flex сжимает их, и при рабочей колонке
~556px (1280 + открытый `ActivityDrawer`) подписи наезжают друг на друга.

Добавить `shrink-0` на обёртку группы (`<div key={...} className="flex items-start">`, ~80)
и на обёртку стадии (`<div key={stage.id} className="flex items-start">`, ~101).

Проверка: на 1280 с открытым drawer карта воронки **скроллится по горизонтали**, подписи
целые. Ширина подписи `max-w-[7.5rem]` не меняется.

---

## КРИТЕРИИ ПРИЁМКИ

1. `npx tsc --noEmit` — чисто.
2. `npm run lint` — не больше 35 warnings, 0 errors.
3. `npx vitest run` — зелено.
4. `python3 scripts/audit-tokens.py` — 0 находок вне реестра. **Отдельно проверить R5:**
   ни одной ручной сборки листа в новых файлах.
5. `npm run build` — проходит.
6. `wc -l src/components/projects/ProjectDetail.tsx` — ≤550.

## СМОКИ (тема `t-minimal`, скриншот до/после)

| # | Что | Ожидание |
|---|-----|----------|
| 1 | `/deals/[id]`, 1440, сайдбар свёрнут | Две колонки: работа ~1100, рельса 320. До полосы вкладок **≤400px** — замерить и написать число |
| 2 | То же, прокрутка вниз | Рельса `sticky`, не уезжает |
| 3 | 1280 + открытый `ActivityDrawer` | Рабочая колонка ~556px; карта воронки **скроллится**, подписи целые (задача 7) |
| 4 | Ширина < `lg` (1023) | Рельса под рабочей колонкой, порядок: шаг → сводка → здоровье → вкладки |
| 5 | Сигнал «У шага нет даты» → CTA | Скролл к `#deal-next-step` |
| 6 | Сигнал по дедлайну → CTA | Скролл к `#deal-summary` — **новый id, проверять обязательно** |
| 7 | Сигнал «Единственный участник» → CTA | Скролл к `#deal-stakeholders` в рельсе |
| 8 | Сигнал «Тишина» → CTA | Скролл к `#deal-activity` |
| 9 | Вердикт здоровья | Ровно **один** на экране — под шагом. В рельсе только сигналы |
| 10 | Сделка с длинным юрлицом | «ООО «Торговый дом …»» переносится на 2 строки, не обрезается многоточием |
| 11 | Сделка без контакта и бюджета | `+ Указать` курсивом + жёлтая точка с `title` о последствии |
| 12 | Peek из воронки (клик по карточке) | Панель 440px цела, шаг правится инлайн, вёрстка не разъехалась |
| 13 | `/projects/[id]` (delivery) | Рельса собрана по-другому: `DeliveryHealthDot`, родительская сделка вместо бюджета; «Закреплено» отсутствует |
| 14 | `/companies/[id]` | Карточка компании визуально **не изменилась** — задача 1 механическая |
| 15 | Тема `t-frost` на `/deals/[id]` | Рельса не сливается с полотном, стекло не поехало |

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- Действий `+ Задача / Звонок / Встреча` на полосе вкладок — спринт C (R-07).
- «Материалы» счётчиками в рельсе — спринт C (R-08). Секция остаётся аккордеоном на месте.
- Вкладки «Заметки» — отдельная ветка работ.
- Правок схемы, типов, хуков, RLS. Новых запросов к БД — ноль.
- Переписывания `DealStakeholders` и `DealSignals` — только перестановка и пропы.

## КОММИТ

```bash
git checkout -b feat/deal-context-rail
git add src/
git commit -m "feat(ui): двухколонник карточки сделки — работа и контекст

- сетка minmax(0,1fr) 320px, рельса sticky справа (R-02, R-03)
- RailCard/RailRow подняты из CompanySidebar в shared — одна рельса на два экрана
- инфо-грид из четырёх боксов → property-list «Сводка» в рельсе (R-05)
- бейдж полноты и «Создана» переехали в «Сводку» из шапки (R-06, R-11/F-09)
- DealFocusPanel расщеплён: DealNextStep в работу, сигналы в рельсу (R-09)
- DealHeader вынесен из ProjectDetail
- SIGNAL_ANCHORS: deadline → deal-summary (грид расформирован)
- StageRail: shrink-0 на группах — карта скроллится, а не сжимается

Миграций нет. Основание: improvements/deals-layout-rationale-2026-08-24.md"
```

## ОТЧЁТ

Приложить: вывод разведки; шесть проверок приёмки; **замер вертикали до полосы вкладок
(смок 1) числом**; скриншоты до/после для смоков 1, 3, 4, 13, 14; отдельной строкой —
результат смоков 5–8 (якоря), потому что они единственные не ловятся автоматикой.
