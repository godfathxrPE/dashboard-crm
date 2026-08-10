# Claude Code Prompt — Sprint PIPELINE-COCKPIT-1: единый pipeline «Кокпит»

## Контекст решения

Утверждено 2026-08-10 (Cowork, два раунда макетов; решение зафиксировано в проекте
«CRM Design auditor» → `claude/pipeline-design-decisions.md`). Кратко:

- Три раздела рисуют позицию в воронке тремя разными языками (лиды — пилюли+«›»,
  сделки — шевроны, IIoT/delivery — треки с чипами). Утверждён единый язык.
- **Шевроны удаляются полностью** (clip-path + focus-костыль уходят вместе с ними).
- На детальных страницах — **«Кокпит»**: одна приборная строка
  `[✓ N прошлых] — [ячейка текущей стадии с тайм-заливкой] — [готовность гейта] — [кнопка следующей стадии] — [+N хвост] — [⌄ карта]`.
- Полная карта воронки (**StageRail**: узлы на линии, группы по phase_group) —
  раскрывается по клику под строкой. Откат назад — клик по пройденному узлу карты.
- Тайм-семантика ячейки: заливка = расход нормы дней стадии. <70% — тихий тинт,
  ≥70% — warn (жёлтый), >100% — over (красный, заливка стоит на 100%, счётчик
  «N дн. · норма M»). Кричит только исключение.

### Разведка живой БД (Cowork, 2026-08-10, read-only MCP) — факты, не гипотезы

- 4 воронки: ERP Продажи (10 стадий), IIoT Продажи (13), ERP Внедрение (8),
  IIoT Внедрение (7). **У всех стадий phase_group заполнен.**
- Активных гейт-требований **8** на 4 стадиях: IIoT «Подготовка КП» (2),
  IIoT «Эксперимент» (2), IIoT «Договор» (2), ERP «Договор» (2). Delivery-воронки
  требований не имеют — гейт-элемент у них просто скрыт.
- `organizations.settings.stage_dwell_defaults` = `{}` → работает фолбэк
  `STALE_BY_PHASE` (attraction 14 / working 21 / approval 21 / closing 30, default 21,
  `src/lib/utils/deal-health.ts:125`). Заливка получит норму с первого дня.
- Последняя миграция: `20260810121513` (realtime_core_tables).

### ⚠️ Поправка к дизайн-решению: колонки `target_days` НЕ будет

Изначально норму планировали колонкой `pipeline_stages.target_days`. Разведка
показала, что это бьётся об архитектуру:

1. `pipelines`/`pipeline_stages` — **глобальные словари вне тенант-модели**
   (RLS `USING true`, у клиента только SELECT) — org-специфичной настройке в них
   не место, и UI-записи туда нет.
2. Закрытая развилка S-R2-DWELL-CFG (2026-07-28, `docs/schema.md` §079):
   «Четвёртая сущность (`stage_dwell_overrides`, `pipeline_stages.rotting_days`)
   не заводится» — `stage_dwell_defaults` объявлен единственным источником порога
   UI-сигнала.

Итог: **норма = существующий `resolveDwellThreshold(phase_group, useDwellThresholds())`**
(порог «залипания» — та же величина, кокпит и бейдж «залипла» на ProjectCard
автоматически согласованы) **плюс опциональный org-scoped оверрайд на стадию**
`organizations.settings.stage_target_days` (jsonb `{stage_id: days}`, паттерн
`stage_dwell_defaults`). В этом спринте — только резолвер и Zod-ключ;
UI редактирования per-stage норм — спринт 2.

**⇒ Миграций в этом спринте НЕТ. Схема БД не меняется вообще.**

### Вне скоупа (спринт 2 — не делать сейчас)

- Кольцо времени (StageTimeRing) в таблицах/канбане/peek.
- UI редактирования `stage_target_days` в OrgSettingsSection.
- PipelineBoard, LeadsView-канбан — без изменений.
- ProjectPeekContent/LeadPeekContent — без изменений.

### Красные линии

- Миграции не пишутся и не применяются; прод-БД не трогается.
- `.env` и секреты не читаются.
- `src/types/database.ts` править можно только в hand-authored части
  (интерфейсы `Pipeline`/`PipelineStage` — hand-authored; `supabase.gen.ts` не трогать).
- Настройки среды владельца (localStorage, тема) не менять.

---

## РАЗВЕДКА (выполнить до правок, результаты — в отчёт)

```bash
# 1. Шевроны используются только в ProjectDetail (остальное — комментарии)
grep -rn "DealProgressBar\|StackedPipeline" src --include="*.tsx" --include="*.ts" \
  | grep -v "components/projects/DealProgressBar.tsx\|components/projects/StackedPipeline.tsx"

# 2. StageReadiness — единственное использование в ProjectDetail (line ~666)
grep -rn "StageReadiness" src --include="*.tsx" | grep -v "projects/StageReadiness.tsx"

# 3. Опорные API на месте
grep -n "export function useDwellThresholds" src/lib/hooks/use-org-settings.ts
grep -n "resolveDwellThreshold\|getStageAging" src/lib/utils/deal-health.ts | head -5
grep -n "export function getLeadHealth" src/lib/utils/lead-health.ts
grep -n "useStageGate\|useStageRequirements" src/components/projects/StageReadiness.tsx

# 4. Токенов ещё нет
grep -n "time-ok-fill\|time-warn-fill\|time-over-fill" src/app/globals.css   # ожидание: пусто

# 5. Точки интеграции ProjectDetail
grep -n "DealProgressBar\|StackedPipeline\|StageReadiness\|stage_entered_at" \
  src/components/projects/ProjectDetail.tsx | head -20

# 6. Степпер лида
grep -n "STEPPER\|Степпер" src/components/leads/LeadDetail.tsx | head -10

# 7. Паттерн settings-ключа (образец для stage_target_days)
grep -n "stage_dwell_defaults\|readCompleteness" src/lib/validators/org-settings.ts | head -10
```

Если п.1 находит использования вне ProjectDetail — остановиться и написать в отчёт,
не удалять компоненты.

---

## ЗАДАЧА 1: домен — норма стадии и тайм-датчик

### Context
Чистая логика «дни на стадии против нормы» — в `lib/domain/` (конвенция:
«сейчас» параметром, ноль запросов, юнит-тесты в `tests/unit/`).

### Steps
Создать `src/lib/domain/stage-norm.ts`:

```ts
import { resolveDwellThreshold, type DwellThresholds } from '@/lib/utils/deal-health';

export type StageTimeState = 'ok' | 'warn' | 'over';

export interface StageTimeGauge {
  days: number | null;   // дней на стадии; null — stage_entered_at пуст/невалиден
  norm: number | null;   // норма дней; null — нормы нет (заливка не рисуется)
  pct: number | null;    // min(100, days/norm*100); null без нормы/дней
  state: StageTimeState; // ok <70% · warn ≥70% · over >100%
}

/** Норма дней стадии: org-оверрайд по stage_id → порог phase_group (общий с бейджем «залипла»). */
export function resolveStageNorm(
  stage: { id: string; phase_group: string | null },
  targetDays: Record<string, number> | undefined,
  dwell: DwellThresholds | undefined,
): number {
  return targetDays?.[stage.id] ?? resolveDwellThreshold(stage.phase_group, dwell);
}

export function stageTimeGauge(
  stageEnteredAt: string | null,
  norm: number | null,
  now: Date,
): StageTimeGauge {
  if (!stageEnteredAt) return { days: null, norm, pct: null, state: 'ok' };
  const t = new Date(stageEnteredAt).getTime();
  if (Number.isNaN(t)) return { days: null, norm, pct: null, state: 'ok' };
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86400000)); // как getStageAging
  if (!norm || norm <= 0) return { days, norm: null, pct: null, state: 'ok' };
  const raw = (days / norm) * 100;
  const state: StageTimeState = days > norm ? 'over' : raw >= 70 ? 'warn' : 'ok';
  return { days, norm, pct: Math.min(100, Math.round(raw)), state };
}
```

Тесты `tests/unit/stage-norm.test.ts` (путь обязан попадать в include vitest —
`tests/unit/**`): границы 69.9%/70%/100%/101% нормы; `days > norm` ⇒ over даже
при pct=100; невалидная дата ⇒ days null, state ok; norm null ⇒ pct null;
resolveStageNorm: оверрайд по stage_id бьёт групповой порог; пустые настройки ⇒
фолбэки STALE_BY_PHASE (attraction → 14).

### Verification
```bash
npx vitest run tests/unit/stage-norm.test.ts
```

---

## ЗАДАЧА 2: токены тайм-заливки в globals.css

### Context
Компонентные переменные обязаны резолвиться во всех 7 темах (урок
S-UI-SEMANTIC-1: переменная из одной темы = невидимый дефект в шести).
Класс темы висит на `<html>` = `:root`, поэтому alias на `:root` берёт палитру
активной темы. `--bg` — solid hex во всех темах ⇒ смесь непрозрачна (запрет
rgba для pipeline-заливок — просвечивание на тёмных). Прецедент — `--cal-line`.

### Steps
В `src/app/globals.css`, рядом с alias-блоком семантических токенов
(`--danger`/`--success`… — найти по `grep -n "\-\-danger" src/app/globals.css`),
добавить в тот же `:root`:

```css
/* Тайм-заливка ячейки текущей стадии (PipelineCockpit). Смесь от --bg (solid во
   всех темах — rgba для pipeline-заливок запрещён) + активная палитра темы через
   alias-слой на :root (класс темы на <html>). НЕ объявлять внутри .t-*. */
--time-ok-fill:   color-mix(in srgb, var(--bg) 84%, var(--accent));
--time-warn-fill: color-mix(in srgb, var(--bg) 82%, var(--yellow));
--time-over-fill: color-mix(in srgb, var(--bg) 84%, var(--red));
```

### Verification
```bash
grep -n "time-ok-fill" src/app/globals.css   # ровно одно объявление, в :root
```

---

## ЗАДАЧА 3: карта — src/components/shared/StageRail.tsx

### Context
Раскрываемая карта воронки и единственное место отката назад. Узлы вместо
шевронов: обычные `<button>`, обычный focus-ring, никакого clip-path.

### Steps
Создать `src/components/shared/StageRail.tsx`:

- Props:
  ```ts
  interface StageRailProps {
    stages: { id: string; name: string; phase_group?: string | null }[]; // активные, отсортированные
    currentIndex: number;          // -1 при терминале
    locked?: boolean;              // won/lost/converted — узлы некликабельны
    allDone?: boolean;             // won: все узлы галками
    onStageClick?: (stageId: string) => void; // только done-узлы (rollback) и future (переход)
    groupLabels?: Record<string, string>;     // phase_group → подпись
  }
  ```
- Группировка: подряд идущие `phase_group` → группа (перенести логику `tracks`
  из `StackedPipeline.tsx` useMemo, БАЙТ-В-БАЙТ по смыслу, без цветов треков).
- Визуал (всё токенами, никаких hex):
  - done-узел: кружок `0.875rem` `bg-[var(--accent)]`, галка Lucide `Check`
    (`size={9}`, `strokeWidth={3}`, цвет `var(--on-accent)`), лейбл `text-xs text-text-dim`;
    это `<button>` с `title={'Вернуть на стадию «' + name + '»'}` и
    `focus-visible:outline-2 outline-accent`.
  - current-узел: кружок `0.875rem` `bg-surface` `border-2 border-accent` +
    внутренняя точка `0.3125rem bg-accent`; лейбл `text-xs font-semibold text-text-main`.
  - future-узел: кружок `border-[1.5px] border-border2 bg-surface`, лейбл
    `text-xs text-text-mute`; кликабелен (переход вперёд), если `onStageClick` задан.
  - линия между узлами: `flex-1 min-w-2 h-[2px] rounded` — `bg-accent` слева от
    current включительно, `bg-border2` дальше.
  - группы: вертикальный делитель `w-px self-stretch bg-border2 mx-1.5` +
    подпись над группой `text-meta font-semibold uppercase tracking-wider`
    (`text-text-mute`; активная группа — `var(--accent-text)`). Цветных точек
    треков НЕТ — токены `--track-*` в новом компоненте не используются.
- Никакой собственной загрузки данных — чистый презентационный компонент.

### Verification
```bash
npx tsc --noEmit
```

---

## ЗАДАЧА 4: приборная строка — src/components/shared/PipelineCockpit.tsx

### Context
Презентационный компонент строки. Данные собирают вызывающие (ProjectDetail,
LeadDetail) — у кокпита нет запросов и нет знания о сущностях.

### Steps
Создать `src/components/shared/PipelineCockpit.tsx`:

```ts
export interface CockpitGateItem { label: string; met: boolean }
export interface PipelineCockpitProps {
  pastCount: number;
  pastNames: string[];                    // для title чипа
  current: { name: string };
  gauge: import('@/lib/domain/stage-norm').StageTimeGauge | null; // null — без тайм-части (лид)
  currentExtra?: React.ReactNode;         // слот после имени (лид: LeadHealthMark)
  groupLabel?: string | null;             // «Привлечение · группа 1 из 4»
  gate?: { items: CockpitGateItem[]; title: string } | null; // null/пусто — элемент скрыт
  next?: { label: string; probability?: number | null; locked: boolean; onClick?: () => void } | null;
  restCount: number;
  restGroupsCount?: number;               // «+5 · 3 группы»
  metaRight?: React.ReactNode;            // «3 из 5»
  locked?: boolean;                       // терминал: gate/next скрыты, ячейка без заливки
  map: React.ReactNode;                   // StageRail (+ метаданные карты)
}
```

Рендер слева направо, контейнер `flex flex-wrap items-center gap-2`:

1. **Прошлое** (если `pastCount > 0`): `<button>` `rounded-full bg-accent-l px-2.5 py-1
   text-xs font-semibold` цвет `var(--accent-text)`, содержимое `✓ N` (галка —
   Lucide `Check` 11px, не текстовый символ), `title={pastNames.join(', ')}`,
   клик = toggle карты. После — соединитель `w-3.5 h-[2px] bg-accent rounded`.
2. **Ячейка текущей стадии**: `<div>` `relative overflow-hidden rounded-[0.625rem]
   border-[1.5px] px-3 py-1.5 inline-flex items-center gap-2 bg-surface`:
   - заливка: `<span className="absolute inset-0" style={{ width: pct + '%',
     background: 'var(--time-<state>-fill)' }} />` — только при `gauge?.pct != null`
     и не `locked`;
   - рамка по state: ok → `var(--accent)`, warn → `var(--yellow)`, over → `var(--red)`
     (инлайн-`style`, не Tailwind-классы цвета);
   - имя: `relative text-[0.8125rem] font-semibold text-text-main`;
   - счётчик: `relative text-meta tabular-nums` — ok: `text-text-dim` «N дн.»;
     warn: `var(--yellow-text)`; over: `var(--red-text)` + Lucide `Clock` 12px +
     «N дн. · норма M». `gauge.days == null` — счётчик не рендерится;
   - `currentExtra` рендерится после счётчика.
3. **Гейт** (если `gate` и `items.length > 0` и не `locked`): `<button>`
   `inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-meta text-text-dim
   hover:bg-surface2` — точки `0.4375rem rounded-full` (met: `bg-accent`,
   не met: `bg-surface3 border border-border2`) + «готовность m/t». Клик — поповер:
   `absolute z-50 mt-1 w-72 rounded-[var(--radius)] border border-border
   bg-popover p-3` shadow `var(--elevation-3)`; заголовок `text-meta uppercase
   font-semibold text-text-mute` = `gate.title`; пункты — язык StageReadiness:
   met → `Check` 14px `text-green` + `line-through text-text-dim`, не met →
   `Circle` 14px `text-text-mute` + `text-text-main`. Закрытие: клик вне
   (useEffect + `mousedown`) и Esc. Обёртка кнопки+поповера — `relative`.
4. **Соединитель** `w-3.5 h-[2px] rounded` — `bg-accent` если гейт пройден/отсутствует,
   иначе `bg-border2`.
5. **Следующая стадия** (если `next` и не `locked`): `<button>`
   `rounded-[0.625rem] border px-3 py-1.5 text-xs inline-flex items-center gap-1.5`:
   - `locked: true` → `border-border text-text-mute cursor-default` + Lucide `Lock`
     12px; onClick ВСЁ РАВНО работает, если передан (сервер-гейт — истина;
     модалка перехода сама покажет невыполненные требования);
   - `locked: false` → `border-[var(--accent)] font-medium` цвет
     `var(--accent-text)` + `ArrowRight` 12px, `hover:bg-accent-l`;
   - probability → `· N%` `tabular-nums`.
6. **Хвост** (если `restCount > 0`): `<button>` `rounded-full border border-dashed
   border-border2 px-2 py-0.5 text-xs text-text-mute hover:bg-surface2` —
   «+N» или «+N · M группы» — клик = toggle карты.
7. **Разворот**: icon-`<button>` 24px `ChevronDown`/`ChevronUp`, `aria-expanded`,
   `text-text-mute hover:bg-surface2 rounded-md` — toggle карты.
8. `metaRight` — прижат вправо: `ml-auto text-xs text-text-mute tabular-nums`.
9. `groupLabel` — строка НАД контейнером: `text-meta font-semibold uppercase
   tracking-wider` цвет `var(--accent-text)`, `mb-1`.
10. Карта: при раскрытии `<div className="mt-2">{map}</div>`. Состояние раскрытия —
    локальный `useState` (по умолчанию свёрнута).

### Verification
```bash
npx tsc --noEmit
```

---

## ЗАДАЧА 5: интеграция в ProjectDetail (сделки ERP/IIoT + внедрение)

### Context
Три блока (`DealProgressBar` для client-ERP ~562–587, `StackedPipeline` для
client-IIoT ~589–613, `StackedPipeline` для delivery ~617–649) заменяются одним
кокпитом. Гейт-переходы/rollback НЕ меняются: те же `openTransition`,
`setRollback`, `moveToStageId`.

### Steps
1. В `ProjectDetail.tsx` собрать данные кокпита (при
   `project.pipeline_id && project.stage_id`, для `type === 'client'` и delivery):
   - `stages` = `useStagesForPipeline(pipeline_id)` → фильтр `!is_won && !is_lost`
     → сорт `order_index` (хук НЕ сортирует и НЕ фильтрует — делать на месте,
     как делал StackedPipeline);
   - `currentIndex = stages.findIndex(s => s.id === project.stage_id)`;
     `nextStage = stages[currentIndex + 1] ?? null`;
   - терминал: `locked = status === 'won' || 'lost'` (client) /
     `status === 'completed'` (delivery); won → карта с `allDone`;
   - **норма**: `const dwell = useDwellThresholds();`
     `const targetDays = readStageTargetDays(settings)` (задача 7);
     `gauge = stageTimeGauge(project.stage_entered_at,
       resolveStageNorm(currentStage, targetDays, dwell), new Date())`;
   - **гейт**: перенести логику из `StageReadiness.tsx` (reqKey +
     `useStageRequirements(pipeline_id)` фильтр по `nextStage.id`, `is_active` +
     `useStageGate(project.id, nextStage.id)` только при `reqs.length > 0`):
     `gate = { title: 'Готовность к стадии «' + nextStage.name + '»',
       items: reqs.map(r => ({ label: r.error_hint, met: !unmetKeys.has(reqKey(...)) })) }`;
   - **next**: client → `{ label: nextStage.name, probability: nextStage.probability,
     locked: unmetCount > 0, onClick: () => openTransition({ project, toStageId: nextStage.id }) }`;
     delivery → то же с `moveToStageId(project.id, nextStage.id)` и `locked: false`
     (модалки перехода у delivery НЕТ и не появляется — S-R2-TRANSITION-1b);
     `nextStage == null` → `next = null`;
   - **groupLabel** (только если у стадий есть группы, т.е. всегда):
     `PHASE_LABELS[currentStage.phase_group] + ' · группа K из M'` — лейблы из
     задачи 8 (перенесённый маппинг), K/M — индекс группы;
   - **map**: `<StageRail stages={stages} currentIndex={...} locked={locked}
     allDone={isWon} groupLabels={PHASE_LABELS} onStageClick={(id) => {...}} />` —
     обработчик = существующая логика onStageClick (вперёд → `openTransition` /
     `moveToStageId`; назад → `setRollback`; равный order_index → выход) — взять
     БАЙТ-В-БАЙТ из заменяемых блоков;
   - `metaRight`: `«{currentIndex+1} из {stages.length}»`; под картой —
     `«пройдено N%»` (формула из StackedPipeline: `(currentIndex+1)/stages.length`).
2. Удалить рендер `<StageReadiness project={project} />` (~666) и его импорт —
   кокпит несёт ту же информацию. Комментарий рядом (~658–665) обновить.
3. Консолидация дублей в шапке (F5):
   - удалить пилюлю стадии (~371–385, `headerStage`-пилюля) — имя стадии теперь
     в кокпите; у delivery пилюля «Состояние · фаза» тоже удаляется;
   - удалить `«· N дн. в стадии»` (~404–412) — возраст теперь в ячейке кокпита;
   - НЕ трогать: `CompletenessBadge`, `«Задачи: N/M»`, `HealthDot`,
     `DeliveryHealthDot`, дату создания.
4. Импорты: убрать `DealProgressBar`, `StackedPipeline`, `StageReadiness`;
   добавить `PipelineCockpit`, `StageRail`, `stageTimeGauge`, `resolveStageNorm`,
   `useDwellThresholds`, `readStageTargetDays`.

### Verification
```bash
npx tsc --noEmit
grep -n "DealProgressBar\|StackedPipeline\|StageReadiness" src/components/projects/ProjectDetail.tsx
# ожидание: 0 строк
```

---

## ЗАДАЧА 6: интеграция в LeadDetail

### Context
Блок степпера (~243–333) заменяется кокпитом. У лида нет `stage_entered_at` и
норм — **тайм-часть ячейки НЕ выдумывается**: `gauge = null`, сигнал времени
уже несут `LeadHealthMark` и фокус-панель (single source, без дублей).

### Steps
1. Заменить блок степпера (внутри карточки `rounded-xl border...` ~244) на:
   - `stages` = массив из `STEPPER` (4 статуса, лейблы из `LEAD_STATUS_CONFIG`);
     `currentIndex = stepIndex`;
   - `gauge = null`; `currentExtra = <LeadHealthMark lead={lead} />`
     (метка сама решает, показываться ли; при `reason === 'overdue'` строка
     фокус-панели уже кричит — метка это учитывает, логика не меняется);
   - **next** по статусу (те же мутации, что были у кнопок степпера):
     `new` → `{ label: 'Связаться', locked: false, onClick: () => status.change(lead.id, 'contacted') }`;
     `contacted` → `{ label: 'Квалифицировать', ..., onClick: () => status.change(lead.id, 'qualified') }`;
     `qualified` → `{ label: 'Конвертировать', ..., onClick: () => setConvertOpen(true) }`;
     `converted` → `next = null`, `locked = true`;
   - **«Отклонить»** (только `contacted`): ghost-кнопка в той же строке после
     next (существующие классы `text-red hover:bg-red-l`), открывает существующий
     блок причин `rejecting` — блок причин перенести под строку без изменений;
   - гейтов у лида нет: `gate = null`;
   - `map`: `<StageRail stages={...} currentIndex={stepIndex} locked />` —
     у лида карта read-only (откат статуса из карты НЕ добавляем — отдельное
     решение, не этот спринт); групп нет — `groupLabels` не передавать;
   - `metaRight`: `«{stepIndex+1} из 4»`.
2. Ветка `isDisqualified` (терминальная) остаётся КАК ЕСТЬ (Badge + причина +
   «Восстановить») — вместо кокпита, как сейчас вместо степпера.
3. `isConverted`: кокпит рендерится `locked` (кнопка «К сделке» уже в шапке).

### Verification
```bash
npx tsc --noEmit
grep -n "STEPPER.map" src/components/leads/LeadDetail.tsx   # ожидание: 0 строк
```

---

## ЗАДАЧА 7: org-settings — ключ stage_target_days (только чтение)

### Context
Паттерн настройки организации (S-R3-TRUST-1): jsonb-ключ + Zod `.passthrough()`
+ адресный reader. UI-формы в этом спринте нет.

### Steps
1. `src/lib/validators/org-settings.ts` — в `orgSettingsSchema` добавить ключ
   (рядом со `stage_dwell_defaults`, сверить стиль по месту):
   ```ts
   /** Org-оверрайд нормы дней на конкретную стадию: { [stage_id]: days }.
    *  Пусто/нет ключа — норма группы (stage_dwell_defaults → фолбэки). */
   stage_target_days: z.record(z.string().uuid(), z.number().int().min(1).max(365)).optional(),
   ```
2. Рядом с существующими ридерами (найти по РАЗВЕДКЕ п.7) добавить:
   ```ts
   export function readStageTargetDays(
     settings: OrgSettings | undefined,
   ): Record<string, number> | undefined {
     return settings?.stage_target_days;
   }
   ```
   Если в проекте ридеры живут в `use-org-settings.ts` — положить туда же,
   по образцу соседей (не изобретать второй стиль).

### Verification
```bash
npx tsc --noEmit && npx vitest run
```

---

## ЗАДАЧА 8: чистка — шевроны удаляются, лейблы фаз переезжают

### Context
`PHASE_LABELS` (attraction/working/approval/closing + delivery-слаги) сейчас
живёт внутри `StackedPipeline.tsx` — он нужен StageRail/кокпиту и переживает
удаление компонента.

### Steps
1. Создать `src/lib/constants/phase-labels.ts`: перенести объект `PHASE_LABELS`
   из `StackedPipeline.tsx` (включая спред `DELIVERY_PHASE_LABELS`).
   `PHASE_COLOR`/`PHASE_TEXT` НЕ переносить — цветов категорий в новом языке нет.
2. Обновить импорты в ProjectDetail (задача 5 использует этот модуль).
3. Удалить файлы (только после РАЗВЕДКИ п.1 — использований нет):
   ```bash
   git rm src/components/projects/DealProgressBar.tsx \
          src/components/projects/StackedPipeline.tsx \
          src/components/projects/StageReadiness.tsx
   ```
4. Поправить комментарии, ссылающиеся на удалённые компоненты (чтобы память
   кода не врала): `ProjectCard.tsx:15`, `DealDeliveryHub.tsx:41`,
   `org-settings.ts:67` — заменить упоминание `StackedPipeline` на
   `StageRail`/`phase-labels`.
5. `src/components/projects/index.ts` эти компоненты не экспортирует —
   проверить и не трогать.

### Verification
```bash
grep -rn "StackedPipeline\|DealProgressBar\|StageReadiness" src   # ожидание: 0 строк
npx tsc --noEmit
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint        # ожидание: ровно baseline, новых ошибок нет
npx vitest run      # все зелёные, включая новый stage-norm.test.ts
npm run build       # последним; если крутится next dev — остановить перед билдом
```

Рантайм-смок (минимум, если доступен браузер; иначе — явно написать в отчёте
«рантайм-смок не гонял, остаётся гейту»):

- `/deals/<id>` сделки ERP (10 стадий) и IIoT (13): строка кокпита в одну линию,
  «+N» честный, раскрытие карты, клик по future-узлу открывает модалку перехода,
  клик по done-узлу — подтверждение отката;
- гейт: у сделки IIoT на стадии перед «Подготовка КП» — точки «готовность m/2»,
  поповер с чек-листом; у стадий без требований гейт-элемент отсутствует;
- проект внедрения: кокпит без гейта, переход без модалки;
- лид: кокпит со статусами, «Отклонить» раскрывает причины, дисквалифицированный
  лид показывает терминальную ветку;
- темы: смок в `t-minimal` И в одной тёмной (`t-frost`) — заливка ячейки видна,
  текст на заливке читается, focus-ring на узлах карты виден. Тему владельца
  в localStorage НЕ перезаписывать (переключать классом в DevTools).

Известное поведение (не баг): пока `stage_dwell_defaults` пуст, нормы = фолбэки
14/21/21/30; заливка появляется у всех открытых сделок сразу. `stage_target_days`
пока никем не пишется — оверрайд заработает после спринта 2 (UI настроек).

## КОММИТ

```bash
git add -A
git commit -m "feat(pipeline): кокпит стадий — единый язык для лидов, сделок и проектов

- PipelineCockpit + StageRail (shared) вместо трёх визуальных языков
- тайм-ячейка: дни на стадии против нормы (resolveDwellThreshold + org-оверрайд stage_target_days)
- гейт-готовность и кнопка следующей стадии прямо в строке (данные StageReadiness)
- токены --time-ok/warn/over-fill (color-mix от --bg, все 7 тем)
- удалены DealProgressBar, StackedPipeline, StageReadiness (шевроны и clip-path ушли)
- миграций нет; переходы/rollback/гейты — прежние контракты"
```

Отчёт: РАЗВЕДКА-выводы, список изменённых файлов, вывод финальных проверок,
что НЕ сделано (рантайм-смок, если не гонялся) — на гейт Cowork.
