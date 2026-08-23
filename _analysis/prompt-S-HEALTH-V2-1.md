# Claude Code Prompt — Sprint S-HEALTH-V2-1: здоровье сделки как сигнальная панель

**Ветка:** `feat/deal-signals`
**Миграций НЕТ.** RLS, схема, типы БД не трогаются. Порог настройки живёт в уже
существующем `organizations.settings` (jsonb, миграция 076) — новая колонка не нужна.
**Основание:** `improvements/deals-audit-benchmark-2026-08-23.md` (R-2 + quick wins §1.3),
бенчмарк Monday Deal Insights / Freshsales Freddy / Close.

---

## Зачем этот спринт (прочитать до кода)

Разведка живой БД 23.08 (10 открытых сделок) вскрыла **два дефекта формулы
`calculateDealHealth`**, из-за которых индикатор здоровья врёт, а не просто «беден»:

1. **Мёртвый фактор.** Фактор `lastContact` читает `project.last_contact_date` —
   **такой колонки в `projects` нет** (проверено `information_schema.columns`, её нет и в
   `docs/schema.md`, и в `PROJECT_COLUMNS` селекта). Фактор всегда даёт `0`, потолок
   здоровья — **6 из 8**, а порог «зелёная» — `total >= 6`. Зелёной сделка может стать
   только при идеальном совпадении всех трёх оставшихся факторов.
2. **Инвертированный дедлайн.** `deadline = 2` при сроке дальше 30 дней **или при
   отсутствии дедлайна вовсе**; близкий срок режет 2 балла. У **8 из 10** открытых сделок
   дедлайн ближе 30 дней — они наказаны за то, что близки к закрытию, а сделка вообще без
   дедлайна получает максимум.

Результат виден на скриншоте карточки: сделка, созданная 21.08, к 23.08 уже «▲ Критично»
красным. Красный на двухдневной сделке приучает игнорировать красный вообще.

Чиним не подкраску, а модель: вместо одного непрозрачного числа 0–8 — **именованные
сигналы** с вердиктом, причиной и кнопкой действия (паттерн Monday Deal Insights + подача
Freshsales Freddy: тег → топ-причина → список сигналов → CTA).

### Что НЕ входит в спринт (не делать, даже если захочется)

- **История/тренд скора и спарклайн** — требует таблицы и решения «когда писать снимок»;
  отдельный спринт с миграцией.
- **Изменения в списках и очередях** (TodayView, PipelineBoard, ProjectsTable, фильтры).
- **AI-объяснение сигналов**, автозадачи по сигналу, уведомления.
- **UI редактирования порогов в настройках** — резолвер читает ключ, писать его пока
  некому (ровно как `stage_target_days`, S-PIPELINE-COCKPIT-1).

### Пороги сверены с живой БД (23.08, Supabase MCP, read-only)

10 открытых сделок `type='client'`. Сколько строк зажжётся сегодня при дефолтах:

| Порог | Значение | Срабатываний сегодня | Почему так |
|---|---|---|---|
| `graceDays` | 5 | 2 из 10 | новых за 5 дней — ровно 2; больше — grace станет фоном |
| `silenceDays` | 10 | 6 из 10 | средняя тишина по открытым сделкам — 8 дн.; при 14 сигнал даёт **ноль** срабатываний и мёртв, при 7 — почти у всех |
| `deadlineWarnDays` | 7 | часть из 8 сделок с дедлайном < 30 дн. | прежняя формула наказывала все 8; предупреждение за неделю — рабочий горизонт |
| `single_threaded` (гейт по фазе) | с `working` | 4 из 10 (без гейта было бы 8) | на `attraction` один контакт — норма, а сигнал у 80% сделок не сигнал |

Ноль срабатываний ни у одного сигнала — осознанно не допущен: мёртвый сигнал не отличим от
исправного, пока в него не ткнёшь.

### Красные линии

- ⛔ **`getDealHealth` НЕ ТРОГАТЬ** — другая ось («гниёт/не гниёт») и **5 потребителей**:
  `TodayView`, `ProjectCard`, `ProjectsTable`, `CompanyDealsCard`/`CompanyHighlights`/
  `CompanyPeekContent`, `lib/utils/project-filters.ts`. Новая панель его **переиспользует**,
  а не заменяет: третьей формулы «есть ли следующий шаг» в проекте быть не должно.
- ⛔ **`DealHealthDot` НЕ ТРОГАТЬ** — это точка в списках компаний, парная к
  `DeliveryHealthDot`. Удаляется только `HealthDot` (0–8), у него ровно 2 потребителя.
- ⛔ **Не сливать сигналы с полнотой.** `deal-completeness.ts` отвечает на «что не
  заполнено», сигналы — на «что происходит». Сигналов «нет бюджета/нет контакта» не
  заводить: их несёт бейдж полноты рядом (правило «Два источника одного факта — вес и
  подпись, не слияние», learnings).
- ⛔ **Цвет — семантическими токенами.** «Требует внимания» → `--warning`, «Киснет» →
  `--danger`, «В порядке» → `--success`, «Новая» → нейтраль (`--text-mute` / `--surface2`).
  **`--accent` для смысла не использовать** (в `t-washi` акцент === `--red`). Хардкод hex
  и Tailwind-цвета запрещены. `-l`-токен + альфа-модификатор — запрещённый паттерн.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm

# 1. Подтвердить, что колонки last_contact_date нет ни в типах, ни в селекте
grep -rn "last_contact_date" src/ || echo "OK: только в deal-health.ts, если пусто — уже удалено"
grep -n "PROJECT_COLUMNS" -A 20 src/lib/hooks/use-projects.ts | head -30

# 2. Потребители того, что удаляем (ожидается ровно 2 файла на каждый)
grep -rn "calculateDealHealth" src/
grep -rn "from '@/components/shared/HealthDot'" src/

# 3. Потребители того, что НЕ трогаем (ожидается 5+ файлов — убедиться и не сломать)
grep -rn "getDealHealth\b" src/ | grep -v deal-health.ts

# 4. Точки монтирования новой панели и quick-wins
sed -n '120,155p' src/components/projects/DealFocusPanel.tsx
sed -n '350,362p;565,640p' src/components/projects/ProjectDetail.tsx
sed -n '155,170p' src/components/shared/PipelineCockpit.tsx

# 5. Паттерн настройки организации (копируем целиком)
sed -n '1,80p' src/lib/validators/org-settings.ts
sed -n '95,130p' src/lib/hooks/use-org-settings.ts

# 6. Что переиспользуем в домене
cat src/lib/domain/stage-norm.ts
grep -n "export function useDealStakeholders" -A 20 src/lib/hooks/use-deal-stakeholders.ts
grep -n "export function useActivityLog" -A 25 src/lib/hooks/use-activity-log.ts

# 7. Тесты рядом (стиль и импорты)
ls tests/unit | grep -E "stage-norm|completeness|health" || ls tests/unit | head
```

**Ожидаемая картина:** `last_contact_date` встречается только внутри `deal-health.ts`;
`calculateDealHealth` — в `ProjectDetail.tsx` и `DealFocusPanel.tsx`; `HealthDot` — там же.
Если потребителей больше — **остановиться и сообщить**, план переезда рассчитан на два.

---

## ЗАДАЧА 1 — домен: `src/lib/domain/deal-signals.ts` (новый файл)

Чистая логика: без React, без Supabase, `now` — параметр с дефолтом (иначе не тестируется —
см. грабли `getNextActionOverdueDays`).

**Контракт.** Функция принимает поля сделки + контекст, который карточка добирает хуками
(стейкхолдеры, последняя активность, датчик стадии). Домен ничего не запрашивает сам.

```ts
import { getDealHealth } from '@/lib/utils/deal-health';
import type { StageTimeGauge } from '@/lib/domain/stage-norm';
import { diffDaysKey, localDateKey } from '@/lib/utils/date-helpers';

export type SignalState = 'ok' | 'warn' | 'bad' | 'na';
export type DealVerdict = 'new' | 'ok' | 'attention' | 'rotting';

export type SignalKey =
  | 'next_step' | 'stage_dwell' | 'deadline' | 'silence' | 'single_threaded';

export interface DealSignal {
  key: SignalKey;
  /** Короткая формулировка ПРОБЛЕМЫ, если state !== 'ok' («Шаг просрочен на 3 дн.»). */
  label: string;
  state: SignalState;
  /** Что это значит и что сделать — одна строка, попадает под label в раскрытии. */
  detail: string;
  /** Подпись кнопки действия; null — действия нет (state 'ok'/'na'). */
  cta: string | null;
}

export interface DealSignalContext {
  /** Датчик стадии из stageTimeGauge — тот же, что рисует заливку кокпита. */
  gauge: StageTimeGauge | null;
  /** phase_group текущей стадии — гасит single_threaded на ранних стадиях. */
  phaseGroup: string | null;
  /** Число стейкхолдеров сделки (включая основной контакт). */
  stakeholderCount: number | null;
  /** ISO последней записи activity_log по сделке; null — активности не было. */
  lastActivityAt: string | null;
}

export interface DealSignalThresholds {
  /** Дней «льготы» новой сделке: пустые поля ещё не повод для тревоги. */
  graceDays: number;
  /** Дней тишины до сигнала 'bad'; половина порога — 'warn'. */
  silenceDays: number;
  /** Дней до дедлайна, начиная с которых — 'warn' (просрочка — всегда 'bad'). */
  deadlineWarnDays: number;
}

export const DEFAULT_SIGNAL_THRESHOLDS: DealSignalThresholds = {
  graceDays: 5,
  silenceDays: 10,
  deadlineWarnDays: 7,
};

export interface DealSignalsResult {
  verdict: DealVerdict;
  /** Все применимые сигналы, отсортированы: bad → warn → ok; 'na' отфильтрованы. */
  signals: DealSignal[];
  /** Первый bad, иначе первый warn, иначе null — «топ-причина» для свёрнутого вида. */
  top: DealSignal | null;
}
```

### Правила сигналов

| key | Условие | state | Дефолтный текст |
|---|---|---|---|
| `next_step` | `getDealHealth(project) === 'overdue-action'` | `bad` | «Шаг просрочен на N дн.» |
| | `=== 'no-action'` | `bad` | «Следующий шаг не назначен» |
| | `=== 'ok'` | `ok` | «Следующий шаг назначен» |
| `stage_dwell` | `gauge.state === 'over'` | `bad` | «В стадии N дн. при норме M» |
| | `gauge.state === 'warn'` | `warn` | «В стадии N дн. из M по норме» |
| | `gauge` null / `days` null | `na` | — |
| `deadline` | `deadline < сегодня` | `bad` | «Дедлайн просрочен на N дн.» |
| | `0 ≤ дней до дедлайна ≤ deadlineWarnDays` | `warn` | «До дедлайна N дн.» |
| | дедлайн дальше | `ok` | «До дедлайна N дн.» |
| | дедлайна нет | **`na`** | — (это полнота, не динамика) |
| `silence` | дней с `lastActivityAt` (или `created_at`) > `silenceDays` | `bad` | «Тишина N дн.» |
| | > `silenceDays / 2` | `warn` | «Последняя активность N дн. назад» |
| `single_threaded` | `stakeholderCount ≤ 1` **и** `phaseGroup ∈ {working, approval, closing}` | `warn` | «Вся работа на одном человеке» |
| | `stakeholderCount` null (не загрузились) | `na` | — |

**Почему `single_threaded` гасится на `attraction`:** по живой БД 8 из 10 открытых сделок
имеют ≤1 стейкхолдера, и сигнал «на всех» — это не сигнал. С гейтом по фазе загорится у 4 —
исключение, а не фон. На стадии привлечения один контакт нормален (паттерн «mute сигналов
per status», Monday).

**Почему тишина считается от `created_at` при пустом `lastActivityAt`:** иначе сделка без
единой записи в журнале (таких 2 из 10) молчала бы вечно.

### Вердикт

```
если есть хотя бы один 'bad'                       → 'rotting'   («Киснет»)
иначе если сделка моложе graceDays                 → 'new'       («Новая»)
иначе если есть хотя бы один 'warn'                → 'attention' («Требует внимания»)
иначе                                              → 'ok'        («В порядке»)
```

Порядок важен: `bad` **побеждает** grace-period. Новая сделка с просроченным шагом — это
уже проблема, а не «ещё осваиваемся». Grace-период гасит только жёлтую тревогу от пустоты.

Экспортировать `VERDICT_CONFIG: Record<DealVerdict, { label: string; glyph: string }>` —
глиф обязателен (CVD-safe: форма + цвет, как в существующих `HealthDot`/`DeliveryHealthDot`).
Предлагаемые: `new` `○`, `ok` `●`, `attention` `◐`, `rotting` `▲`.

**Терминальные сделки.** Если `status !== 'open'` — вернуть `{ verdict: 'ok', signals: [],
top: null }` без вычислений: у выигранной сделки «тишина 40 дней» — шум (тот же принцип, что
`isDeliveryTerminal` у внедрений и скрытый счётчик дней у терминала в кокпите).

---

## ЗАДАЧА 2 — порог как настройка организации

Повторить паттерн `stage_dwell_defaults` целиком (learnings → «Настройка организации —
повторять паттерн целиком»). **Миграция не нужна:** `organizations.settings` существует с
076, схема `.passthrough()`, запись идёт merge'ом.

**`src/lib/validators/org-settings.ts`:**

```ts
/** Пороги сигналов сделки (S-HEALTH-V2-1). Clamp — по смыслу каждого. */
const dealSignalThresholdsSchema = z
  .object({
    grace_days: z.number().int().min(0).max(30).optional(),
    silence_days: z.number().int().min(3).max(90).optional(),
    deadline_warn_days: z.number().int().min(1).max(60).optional(),
  })
  .optional();
```

Добавить ключ `deal_signal_thresholds` в `orgSettingsSchema` и ридер
`readDealSignalThresholds(settings)` рядом с `readStageTargetDays`, возвращающий
`DealSignalThresholds` с подстановкой дефолтов по каждому полю независимо.

**Ридер пишется по образцу `readStageTargetDays` буквально:** каст
`(settings as Record<string, unknown> | null | undefined)?.deal_signal_thresholds`, проверка
`typeof === 'object' && !Array.isArray`, поле за полем с clamp — невалидное значение
игнорируется, а не роняет разбор (форвард-совместимость: настройка из будущей версии
клиента не должна ломать текущую).

**`src/lib/hooks/use-org-settings.ts`:** хук `useDealSignalThresholds(): DealSignalThresholds`
через `useMemo` от `data` — как `useStageTargetDays`. При пустых настройках возвращать
**ту же ссылку** `DEFAULT_SIGNAL_THRESHOLDS` (новый литерал на каждый рендер ломает
мемоизацию потребителей — грабля зафиксирована в шапке `useDwellThresholds`).

⚠️ **`OrgSettings` в `src/types/database.ts` НЕ трогать.** Проверено: ни `stage_target_days`,
ни `completeness_rules` в этом интерфейсе не описаны — они живут в Zod-схеме и читаются
ридерами через каст. Ключ проходит благодаря `.passthrough()` и merge-записи. Добавление
поля в `OrgSettings` было бы отступлением от действующего паттерна, а не приведением к нему.

---

## ЗАДАЧА 3 — UI: панель сигналов вместо точки 0–8

### 3.1 Новый компонент `src/components/projects/DealSignals.tsx`

Презентационный + один хук-сборщик контекста. Состав:

- **Свёрнутый вид (по умолчанию):** глиф + вердикт-тег + топ-причина текстом + шеврон.
  Пример: `▲ Киснет · Шаг просрочен на 3 дн.`
- **Раскрытый:** список всех сигналов (кроме `na`): глиф состояния, `label`, `detail`
  тихим текстом, кнопка `cta` справа. Сигналы `ok` — в конце, без кнопки.
- Цвета — только семантические токены (см. красные линии). Тег: фон `--warning-l` /
  `--danger-l` / `--success-l` **без альфа-модификатора**, текст — `*-text`-вариант.
- `role="img"` + `aria-label` с полным вердиктом на глифе — как в `HealthDot`.

**CTA — колбэки, не навигация внутри компонента.** Проп
`onAction?: (key: SignalKey) => void`; хост решает, что делать:

| key | Действие хоста |
|---|---|
| `next_step` | скролл к фокус-панели + фокус в поле шага (`#deal-next-step`) |
| `deadline` | скролл к инфо-гриду (`#deal-info-grid`) |
| `silence` | скролл к ленте активности (`#deal-activity`) |
| `single_threaded` | скролл к карте стейкхолдеров (`#deal-stakeholders`) |
| `stage_dwell` | ничего (кнопки нет: двигать стадию — решение, а не «починка сигнала») |

Якоря — `id` на уже существующих обёртках в `ProjectDetail.tsx`/`DealFocusPanel.tsx`;
скролл через `document.getElementById(...)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
Никаких новых порталов и рефов через компоненты.

### 3.2 Сборщик контекста

В том же файле — `useDealSignals(project)`:

- `useDealStakeholders(project.id)` → `stakeholderCount` (`data?.length ?? null`);
- `useActivityLog(project.id)` → `lastActivityAt` (`entries[0]?.created_at ?? null`) —
  **тот же хук и тот же ключ, что уже зовёт `DealFocusPanel`**, второго запроса не будет;
- `usePipelineStages()` + `useStageTargetDays()` + `useDwellThresholds()` →
  `resolveStageNorm` → `stageTimeGauge` — **тот же путь, что у кокпита**, вторую формулу
  нормы не писать;
- `useDealSignalThresholds()`.

⚠️ `DealFocusPanel` и панель сигналов не должны каждый считать своё — контекст собирается
**один раз** в `DealFocusPanel` (панель живёт в его зоне 3) и передаётся вниз пропом.

### 3.3 Переезд и удаление

**`DealFocusPanel.tsx`** — зона 3 «Здоровье»: `HealthDot` + строка «N дн. без активности»
заменяются на `<DealSignals … />`. Строка про активность больше не нужна отдельно — она
стала сигналом `silence`. Импорт `calculateDealHealth` уходит.

**`ProjectDetail.tsx:356`** — `<HealthDot … showLabel />` в шапке **удалить целиком**
(находка F-01: «Критично» дублировалось в шапке и в зоне «Здоровье»; одна величина в двух
местах девальвирует сигнал). Вердикт остаётся ровно в одном месте — в фокус-панели.

**Удалить как мёртвый код** (после того, как оба потребителя переехали):
- `src/components/shared/HealthDot.tsx`;
- `calculateDealHealth`, `HealthScore`, `HealthLevel`, интерфейс `ProjectForHealth` из
  `src/lib/utils/deal-health.ts` — вместе с мёртвым `last_contact_date`.

⚠️ Перед удалением `HealthLevel` — `grep -rn "HealthLevel" src/`: тип мог утечь в другие
файлы. `DeliveryHealthDot` имеет **свой** уровень (`delivery-health.ts`) — проверить, что не
импортирует общий, и не сломать его.

---

## ЗАДАЧА 4 — quick wins визуального аудита

Три независимые правки, каждая — отдельный коммит-абзац в теле. Из
`improvements/deals-audit-benchmark-2026-08-23.md` §1.3.

**F-03 — три процента в одной зоне.** `ProjectStageCockpit.tsx`: в объекте `next` передаётся
`probability: isDelivery ? null : nextStage.probability` — заменить на `probability: null`
(вероятность **текущей** стадии остаётся в `metaRight`, она и есть величина сделки; процент
следующей стадии на кнопке — третье число подряд и читается как прогресс). Проп
`PipelineCockpit` не менять — он остаётся для лидов.

**F-05 — плейсхолдеры инфо-грида читаются как значения.** `ProjectDetail.tsx`, инфо-грид:
у `InlineEdit` бюджета и дедлайна добавить `className={cn('text-base font-medium', !project.budget && 'italic')}`
(и аналогично для `deadline`). Тот же приём, что уже применён к «Следующий шаг» и «Дата»
в `DealFocusPanel` (S-UI-CLARITY-1) — «Указать»/«Установить» должны выглядеть приглашением.

**F-08 — фильтры ленты без ленты.** Чипы рендерит `EntityTimeline` (строка ~243,
`{showFilters && <TimelineFilterChips … />}`) — правка идёт туда, действует на всех хостах
ленты (project, contact, company). Кнопки создания (`+ Задача`, `+ Звонок`, `+ Встреча`)
в `ProjectDetail` **остаются** — они и есть выход из пустого состояния.

⚠️ **Условие скрытия — НЕ «мало событий».** Прямо над этим местом в коде стоит
предупреждение: чипы не прячут на время загрузки, потому что «мигали бы при каждом клике, а
промахнуться по исчезающей кнопке легко». Скрытие по `events.length < N` наступает на те же
грабли в худшем виде: пользователь выбирает чип «Звонки», по нему 0 событий — чипы исчезают,
и **вернуться к `Все` уже нечем**. Правильное условие:

```
чипы скрыты ⟺ фильтр === 'all' И загрузка завершена И событий 0
```

То есть прячем только «у сущности вообще нет ленты». Как только событие появляется или
фильтр не `all` — чипы на месте. Это же условие безопасно и в управляемом режиме
(`controlled`), потому что при `filter !== 'all'` ветка не срабатывает.

---

## ЗАДАЧА 5 — тесты

`tests/unit/deal-signals.test.ts` — чистый домен, без React:

1. Терминальная сделка (`status='won'`) → `verdict:'ok'`, `signals: []`.
2. Новая (создана вчера), шаг назначен на завтра, дедлайна нет, тишина 1 дн. → `'new'`.
3. Новая (создана вчера), но шаг просрочен → `'rotting'` (bad побеждает grace).
4. `deadline` в прошлом → сигнал `bad`; дедлайна нет → сигнал отсутствует в списке (`na`).
5. `single_threaded`: `phaseGroup='attraction'`, 1 стейкхолдер → сигнала нет;
   `phaseGroup='closing'`, 1 стейкхолдер → `warn`.
6. `silence`: `lastActivityAt` null, `created_at` 12 дн. назад, порог 10 → `bad`.
7. `top` возвращает bad при наличии и bad, и warn.
8. Пороги из настроек перекрывают дефолт (`silenceDays: 30` → тот же вход даёт `ok`).

Запуск: `npx vitest run tests/unit/deal-signals.test.ts`.

---

## САМОПРОВЕРКА (выполнить и приложить вывод к отчёту)

```bash
npx tsc --noEmit
npx eslint src/lib/domain/deal-signals.ts src/components/projects/DealSignals.tsx \
           src/components/projects/DealFocusPanel.tsx src/components/projects/ProjectDetail.tsx
npx vitest run tests/unit/deal-signals.test.ts

# Мёртвый код действительно исчез:
grep -rn "last_contact_date\|calculateDealHealth\|components/shared/HealthDot" src/ \
  && echo "❌ остались ссылки" || echo "✅ чисто"

# Не задета соседняя ось (ожидается прежний список файлов):
grep -rn "getDealHealth\b" src/ | grep -v deal-health.ts

# Цвета — только токены, без хардкода и без -l с альфой:
grep -nE "#[0-9a-fA-F]{6}|bg-(red|green|yellow|accent)-l/" \
  src/components/projects/DealSignals.tsx && echo "❌ хардкод/альфа на -l" || echo "✅"
```

**Визуальный смок — в теме `t-minimal`** (рабочая тема владельца), затем бегло в `t-washi`
(там `--accent === --red`) и в одной тёмной (`t-frost`):

1. Открыть сделку «М Д М» (создана 21.08) — вердикт **не должен** быть «Киснет» только из-за
   пустых полей; ожидается «Новая» либо «Требует внимания» с внятной причиной.
2. Раскрыть панель — сигналы читаются, у каждого небезопасного есть кнопка.
3. Нажать CTA у `single_threaded` — страница скроллит к карте стейкхолдеров.
4. В шапке карточки «▲ Критично» больше нет; вердикт ровно один на экране.
5. Выигранная сделка — панели сигналов нет вовсе.

---

## КОММИТ

```bash
git checkout -b feat/deal-signals
git add -A
git commit -m "S-HEALTH-V2-1: здоровье сделки как сигнальная панель

- deal-signals.ts: именованные сигналы (шаг, стадия, дедлайн, тишина, один контакт),
  вердикт new/ok/attention/rotting, пороги из настроек организации
- удалены мёртвый фактор last_contact_date (колонки нет в БД) и инвертированный
  фактор дедлайна: близкий срок больше не режет здоровье
- DealSignals в фокус-панели с CTA на каждом сигнале; дубль вердикта в шапке снят (F-01)
- quick wins визуального аудита: F-03 (процент на кнопке стадии), F-05 (курсив
  плейсхолдеров инфо-грида), F-08 (чипы фильтров при пустой ленте)
- calculateDealHealth и HealthDot удалены как мёртвый код; getDealHealth не тронут"
```

**Отчёт** — в `_analysis/sprint-S-HEALTH-V2-1.md` по обычному формату (что сделано, что
проверено, известные ограничения). Пуш и мерж — за владельцем; миграций нет, поэтому гейту
нечего применять — только ревью диффа и визуальный смок.
