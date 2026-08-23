# Claude Code Prompt — Sprint S-STAGE-STORY-1: стадия говорит и помнит

**Ветка:** `feat/stage-story`
**Миграций НЕТ.** Схема, RLS, типы БД не трогаются. Guidance живёт в существующем
`organizations.settings` (076, `.passthrough()`), история строится на уже пишущихся
`stage_transitions` (с 27.07) и `activity_log` (аудит полей 087, с 29.07).
**Основание:** `improvements/deals-audit-benchmark-2026-08-23.md` — R-4 (Salesforce Path
«Guidance for Success», Nutshell rep instructions, Zoho Blueprint During) и R-5 (Pipedrive
Changelog, Salesforce Opportunity History, Zoho Stage History).

---

## Зачем этот спринт

После S-HEALTH-V2-1 карточка сделки говорит, **что не так**. Она по-прежнему молчит о двух
других вещах: **что делать на этой стадии** (новая сделка немая: гейт скажет «нельзя», но не
скажет «зачем и как») и **что с ней уже было** (журнал переходов пишется месяц и не показан
никому).

### Разведка живой БД 23.08 — что уже есть и чего не хватать не должно

| Факт | Значение |
|---|---|
| `stage_transitions` | **19 строк, 6 проектов** (13 переходов по `type='client'`), пишется триггером `trg_zy_log_stage_transition` с 27.07 |
| В UI | **не используется ни разу** — только `lib/domain/org-export.ts`. Спящие данные |
| Колонка времени | **`changed_at`**, не `created_at` (запрос по `created_at` падает с 42703) |
| Первый вход в стадию | **НЕ пишется**: `from_stage_id is null` → 0 строк. Начало первого сегмента берём из `projects.created_at` |
| `changed_by` | заполнен у всех 19 строк |
| RLS | одна политика `stage_tr_select` (org-scoped) — чтение с клиента работает, писать клиент не может и не должен |
| Аудит полей | **уже есть** (087, `trg_zy_log_field_audit` → `activity_log`): `changes` с `from/to` и резолвом имён, события `project_updated` / `stage_changed`. Рендерится `describeEvent` в ленте Активности |
| Данные аудита | с 29.07; переносов дедлайна — **1**, изменений бюджета — 7, смен владельца — 0 |
| Возвраты по стадиям | **1 сделка из 6** («ЭЙЧ ЭНД ЭН»: 5 переходов, 4 уникальные стадии) |
| Сделок без единого перехода | **11 из 17** — пустое состояние вкладки увидят чаще, чем заполненное |

Отсюда три решения, зафиксированные до кода:

1. **Вкладка «История» — сводка, а не пересказ.** Перечисление изменений полей уже живёт в
   ленте Активности с 087; дублировать его — значит завести второе место для одного факта.
   Ценность новой вкладки — то, чего в ленте нет: длительность каждой стадии, суммарное время
   при повторных заходах, счётчик возвратов, переносы дедлайна.
2. **Источник истории — `stage_transitions`, не `activity_log`.** В логе два типа за один
   смысл: legacy `stage_change` (75 строк, до 14.07) и `stage_changed` (19, после). Смешивать
   их в расчёте длительностей нельзя. Таблица переходов структурна и однозначна.
3. **Пустое состояние — честное.** «Журнал переходов ведётся с 27 июля 2026» вместо пустоты,
   которая читается как «сделка не двигалась».

### Что НЕ входит

- Field-level changelog отдельной лентой (уже закрыт 087 — см. выше).
- Cascade/аналитика по стадиям в разрезе воронки (это `/analytics`, не карточка).
- Guidance для лидов и внедрений — только сделки (`type='client'`) в v1.
- AI-пересказ траектории (пресет «траектория сделки») — следующий заход, после R-1.

### Красные линии

- ⛔ **`pipeline_stages` / `pipelines` — глобальные словари** (RLS `USING true`, у клиента
  только SELECT). Колонку `guidance` туда **не добавлять**: org-специфичный атрибут стадии
  живёт отдельно. В v1 — ключ в `organizations.settings`, как `stage_target_days`.
- ⛔ **`stage_transitions` клиент не пишет** — INSERT-политики нет, и заводить её незачем:
  строки ставит триггер. Хук только читает.
- ⛔ **Не трогать `describeEvent` и ленту Активности** — они закрывают свою задачу.
- ⛔ Цвет — семантическими токенами; `--accent` для смысла не использовать (в `t-washi`
  акцент === `--red`); `-l`-токен с альфа-модификатором запрещён.
- ⛔ `src/types/database.ts` для нового ключа settings **не трогать** — ключ читается ридером
  через каст, как `stage_target_days` и `deal_signal_thresholds` (проверено в S-HEALTH-V2-1).

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm

# 1. Спящая таблица: убедиться, что в UI её действительно нет
grep -rn "stage_transitions" src/ | grep -v supabase.gen.ts

# 2. Куда встраивать guidance
sed -n '30,80p' src/components/shared/PipelineCockpit.tsx
sed -n '150,215p' src/components/projects/ProjectStageCockpit.tsx

# 3. Куда встраивать вкладку
grep -n "type Tab = " -A 3 src/components/projects/ProjectDetail.tsx
grep -n "value: 'timeline'" -B 8 -A 12 src/components/projects/ProjectDetail.tsx

# 4. Паттерн настройки организации (копировать целиком)
grep -n "readDealSignalThresholds\|readStageTargetDays" -A 25 src/lib/validators/org-settings.ts | head -60
grep -n "useDealSignalThresholds\|useStageTargetDays" -A 12 src/lib/hooks/use-org-settings.ts

# 5. Права: settings правит только owner
grep -n "org_update_owner\|useOrgRole" -r src/lib/hooks/use-org-role.ts src/lib/hooks/use-org-settings.ts | head

# 6. Готовые кирпичи, которые переиспользуем
grep -n "export function" src/lib/hooks/use-pipelines.ts
grep -n "export function InlineEdit" -A 20 src/components/ui/InlineEdit.tsx | head -30
```

---

## ЗАДАЧА 1 — Guidance стадии (R-4)

### 1.1 Настройка организации

`src/lib/validators/org-settings.ts` — ключ `stage_guidance`: `{ [stage_id]: string }`.

```ts
/** Подсказка по стадии (S-STAGE-STORY-1): `{ [stage_id]: текст }`. */
export const STAGE_GUIDANCE_MAX = 500;

const stageGuidanceSchema = z.record(
  z.string(),
  z.string().max(STAGE_GUIDANCE_MAX).optional(),
).optional();
```

Добавить в `orgSettingsSchema` + ридер `readStageGuidance(settings): Record<string, string> | undefined`
**по образцу `readStageTargetDays` буквально**: каст через `Record<string, unknown>`, проверка
`typeof === 'object' && !Array.isArray`, поле за полем, пустые/слишком длинные строки
игнорируются (не роняют разбор), пустой результат → `undefined`.

`src/lib/hooks/use-org-settings.ts` — хук `useStageGuidance(): Record<string, string> | undefined`
через `useMemo`, как `useStageTargetDays`.

### 1.2 Рендер и правка на карточке

`PipelineCockpit` получает **опциональный** проп `guidance?: React.ReactNode` — блок под
основной строкой, над картой воронки. Проп опционален, потому что лиды его не передают:
компонент общий (см. его шапку).

`ProjectStageCockpit` рендерит в этот слот блок «Что делаем на стадии»:

- текст `guidance[currentStage.id]` — тихий (`text-body text-text-dim`), 2–4 строки,
  `whitespace-pre-wrap`;
- **правка на месте** через `InlineEdit as="textarea"` → `useUpdateOrgSettings()` merge'ом
  `{ stage_guidance: { ...current, [stageId]: value } }`;
- ⚠️ **редактор только у owner**: `organizations` UPDATE — политика `org_update_owner`
  (baseline + 054), у admin/manager будет 42501. Роль брать из `useOrgRole()`; не-owner видит
  текст, но не редактор;
- пусто и не owner ⇒ блок **не рендерится вовсе** (пустая рамка «подсказки нет» — шум);
- пусто и owner ⇒ одна строка-приглашение «Добавить подсказку для стадии».

⚠️ Ключ настройки — `stage_id`, а `pipeline_stages` общие для всех org: подсказка, написанная
одной организацией, другой не видна, потому что живёт в **её** `settings`. Это то же свойство,
что у `stage_target_days`, и оно правильное — не «утечка словаря».

---

## ЗАДАЧА 2 — Домен и хук траектории (R-5)

### 2.1 `src/lib/domain/stage-story.ts` (новый) — чистая логика

`now` — параметр с дефолтом. Ноль запросов.

```ts
export interface StageTransitionRow {
  id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  changed_at: string;
}

/** Отрезок жизни сделки в одной стадии. */
export interface StageSegment {
  stageId: string;
  stageName: string;
  enteredAt: string;
  /** null — сделка в этой стадии сейчас. */
  leftAt: string | null;
  days: number;
  /** Сегмент открыт `created_at` проекта, а не записью журнала. */
  fromCreation: boolean;
  /** Второй и последующий заход в ту же стадию. */
  isRevisit: boolean;
  actorId: string | null;
}

export interface StageStory {
  segments: StageSegment[];          // хронологически, сверху вниз — от старых к новым
  /** Суммарно дней по стадии за ВСЕ заходы: stageId → дни (Salesforce cumulative time). */
  totalByStage: Record<string, number>;
  /** Сколько раз сделка возвращалась в уже пройденную стадию. */
  revisits: number;
  /** Дней от created_at до последнего перехода (или до now, если переходов нет). */
  ageDays: number;
}

export function buildStageStory(
  rows: StageTransitionRow[],
  opts: {
    createdAt: string;
    currentStageId: string | null;
    stageName: (id: string) => string;
    now?: Date;
  },
): StageStory
```

Правила:

1. Строки сортируются по `changed_at` **возрастанию** (хук может отдать любой порядок).
2. **Первый сегмент открывается `createdAt`**, а его стадия — `from_stage_id` первой строки:
   журнал не пишет вход при создании (проверено: таких строк 0). Флаг `fromCreation: true`.
   Если `from_stage_id` первой строки `null` (теоретически) — сегмент пропускается.
3. Каждая следующая строка закрывает текущий сегмент (`leftAt = changed_at`) и открывает
   новый на `to_stage_id`.
4. Последний сегмент открыт: `leftAt = null`, `days` считается до `now`.
5. `isRevisit` — стадия уже встречалась среди предыдущих сегментов.
6. `days` — floor от разницы мс делённой на 86 400 000, **как в `getStageAging` и
   `stageTimeGauge`**: иначе сводка разойдётся с датчиком кокпита на сутки.
7. Пустой `rows` ⇒ один открытый сегмент от `createdAt` на `currentStageId` (если он есть),
   `revisits: 0`. Это ровно случай 11 из 17 сделок — пустого экрана быть не должно.
8. `stageName(id)` возвращает `'—'` для неизвестного id (стадия могла быть удалена из словаря).

### 2.2 `src/lib/hooks/use-stage-story.ts` (новый)

```ts
export function useStageStory(projectId: string)
```

- `stage_transitions` → `select('id, from_stage_id, to_stage_id, changed_by, changed_at')`,
  `.eq('project_id', projectId)`, `.order('changed_at', { ascending: true })`;
- ключ `['stage_transitions', projectId]`;
- ⚠️ **`useRealtimeSync` НЕ вешать.** Проверено на живой БД: в публикации `supabase_realtime`
  есть `activity_log`, `deal_stakeholders`, `projects` — **`stage_transitions` там нет**.
  Подписка на таблицу вне публикации молчит, и молчит тихо (learnings, «`useRealtimeSync` без
  таблицы в publication молчит»);
- ⚠️ **Свежесть — через инвалидацию, и в ОДНОМ месте.** Раз realtime нет, ключ обязан
  сбрасываться при переходе стадии, иначе вкладка покажет вчерашнюю траекторию без единого
  признака ошибки (ровно грабля «вторая витрина тех же строк без инвалидации», S-TR-CREATE-1).
  Переход идёт через `useUpdateProject` (`useStageTransition.commitTransition` → `update.mutate`),
  поэтому сброс `['stage_transitions']` добавляется **в `onSettled` самого `useUpdateProject`**,
  рядом с существующими инвалидациями проекта — не в вызывающих. Тогда новый путь перехода не
  сможет забыть половину;
- имена стадий — из `usePipelineStagesMap()` (готовый хук), имена людей — из хука профилей,
  если он уже есть в проекте; нет — показывать без имени актора, **не выдумывать запрос**;
- отдельным запросом — переносы дедлайна: `activity_log`, `.eq('project_id', …)`,
  `.in('event_type', ['project_updated','stage_changed'])`, фильтр по наличию `changes.deadline`
  на клиенте (jsonb-оператор `?` через PostgREST не выражается; выборка мелкая — 69 строк на
  всю базу). Вернуть `deadlineMoves: number` и дату последнего переноса.
  ⚠️ `useActivityLog` для этого не годится: у него `limit(50)` и он тянет `*`.

---

## ЗАДАЧА 3 — Вкладка «История» на карточке сделки

`ProjectDetail.tsx`: в тип `Tab` добавить `'story'`, в массив вкладок — `{ value: 'story',
label: 'История' }` **только для `type === 'client'`** (как сделано для `'quotes'`).

Компонент `src/components/projects/DealStageStory.tsx`:

- **Шапка-сводка**, три числа в ряд: «В работе N дн.» · «Стадий пройдено M» · «Возвратов K»
  (последнее — только если `K > 0`; по живой БД загорится у одной сделки из шести — это и
  должно быть исключением). Плюс «Дедлайн переносился ×N», если `N > 0` (сегодня — одна
  сделка; сигнал дешёвый и растёт со временем).
- **Лента сегментов** сверху вниз: имя стадии, даты «01 авг — 09 авг», длительность
  «8 дн.», кто двинул. Открытый сегмент — «с 09 авг · 14 дн.», подсвечен акцентной кромкой.
  Повторный заход помечается тихим бейджем «повторно». Первый сегмент — «с создания».
- **Суммарное время по стадии** показывать только у стадий с повторными заходами
  («Согласование: 12 дн. суммарно за 2 захода») — иначе это дубль длительности сегмента.
- **Пустое состояние:** «Переходов по стадиям пока нет. Журнал ведётся с 27 июля 2026» +
  текущая стадия с длительностью от создания. Не пустая рамка.
- Числа — `tabular-nums`; строка сегмента 36–44px; цвет — только токены.

---

## ЗАДАЧА 4 — Тесты

`tests/unit/stage-story.test.ts` — чистый домен, `NOW` фиксирован:

1. Пустой журнал + текущая стадия → один сегмент `fromCreation: true`, `leftAt: null`,
   `revisits: 0`, дни считаются от `createdAt`.
2. Три перехода без возвратов → 4 сегмента (первый от создания), `revisits: 0`,
   `totalByStage` = сумма по каждой стадии.
3. Возврат в пройденную стадию → `isRevisit: true` у второго вхождения, `revisits: 1`,
   `totalByStage` этой стадии = сумма обоих заходов.
4. Последний сегмент открыт: `days` считается до `now`, `leftAt === null`.
5. Строки на вход поданы в обратном порядке → результат тот же (сортировка внутри).
6. Неизвестный `stage_id` → имя `'—'`, расчёт не падает.
7. Границы суток: переход в 23:50 и «сейчас» в 00:10 следующего дня → `days` считается тем же
   floor-правилом, что `stageTimeGauge` (сверить с ним явно, чтобы сводка и датчик не разошлись).

Запуск: `npx vitest run tests/unit/stage-story.test.ts`

---

## САМОПРОВЕРКА

```bash
npx tsc --noEmit
npx eslint src/lib/domain/stage-story.ts src/lib/hooks/use-stage-story.ts \
           src/components/projects/DealStageStory.tsx \
           src/components/projects/ProjectStageCockpit.tsx \
           src/components/shared/PipelineCockpit.tsx
npx vitest run

# Токены вместо хардкода в новых компонентах:
grep -nE "#[0-9a-fA-F]{6}|(bg|text|border)-(red|green|yellow|accent|danger|success|warning)-l/" \
  src/components/projects/DealStageStory.tsx && echo "❌" || echo "✅"

# Лента Активности не тронута:
git diff --stat -- src/lib/utils/activity-events.ts src/components/shared/EntityTimeline.tsx
```

**Визуальный смок в `t-minimal`**, затем бегло `t-washi` и одна тёмная:

1. Сделка «ЭЙЧ ЭНД ЭН» (5 переходов, один возврат) — лента сегментов, бейдж «повторно»,
   счётчик возвратов = 1, суммарное время у повторной стадии.
2. Сделка «Агрохолод» (переходов нет) — пустое состояние с оговоркой про 27 июля и текущей
   стадией от создания, а не пустая рамка.
3. Кокпит: у owner — приглашение «Добавить подсказку», текст сохраняется и виден после
   перезагрузки; проверить, что подсказка привязана именно к текущей стадии и меняется при
   переходе.
4. Сумма длительностей сегментов ≈ возраст сделки (расхождение больше суток — дефект расчёта).
5. Длительность открытого сегмента совпадает с числом дней в ячейке кокпита (обе величины
   считает один и тот же floor — если разошлись, сравнить с `stageTimeGauge`).

---

## КОММИТ

```bash
git checkout -b feat/stage-story
git add -A
git commit -m "S-STAGE-STORY-1: подсказка стадии и траектория сделки

- stage_guidance в настройках организации + правка на месте в кокпите (owner)
- stage-story.ts: сегменты стадий из stage_transitions, суммарное время по стадии,
  счётчик возвратов; первый сегмент открывается created_at — журнал не пишет вход
- вкладка «История» на карточке сделки: сводка и лента сегментов, честное пустое
  состояние (журнал ведётся с 27.07)
- переносы дедлайна из аудита полей 087
- миграций нет; лента Активности и describeEvent не тронуты"
```

**Отчёт** — `_analysis/sprint-S-STAGE-STORY-1.md`. Отдельно отметить: где именно добавлена
инвалидация `['stage_transitions']` и проверено ли, что после перехода стадии вкладка
обновляется без перезагрузки страницы (realtime-подписки у этой таблицы нет по построению).
