# Claude Code Prompt — Sprint PIPELINE-RING-2: кольцо времени в списках

## Контекст

Спринт 2 эпика «Кокпит» (решение 2026-08-10, проект «CRM Design auditor» →
`claude/pipeline-design-decisions.md`; спринт 1 — `_analysis/sprint-pipeline-cockpit-1.md`,
принят гейтом). Кокпит живёт на детальных страницах; в компактных местах —
**кольцо времени (StageTimeRing)**: conic-циферблат ~1rem вокруг того же сигнала
норма→ok/warn/over, что и тайм-ячейка кокпита. Один семантический контракт — два
размера.

Поверхности этого спринта:
1. **Карточка сделки в канбане воронки** — `ProjectCard.tsx` (рендерится в
   `PipelineBoard`); там сейчас `getStageAging` + текстовая строка
   «залипла N дн. в „…"» в приоритетном стеке AttentionLine.
2. **Таблица сделок/проектов** — `ProjectsTable.tsx`, ячейка стадии.
3. **Peek сделки** — `ProjectPeekContent.tsx`, статус-строка.

Лиды кольцо НЕ получают: у лида нет норм стадий, сигнал времени несёт
`LeadHealthMark` (решение спринта 1 — вторые часы не выдумываются).

### Данные и опоры (проверены в спринте 1)

- `stageTimeGauge` / `resolveStageNorm` — `src/lib/domain/stage-norm.ts`.
- `useDwellThresholds()` / `useStageTargetDays()` — `src/lib/hooks/use-org-settings.ts`.
- Токены `--time-*-fill` есть; для solid-цветов кольца используются
  `--accent` / `--yellow` / `--red` (+ `--yellow-text`/`--red-text` для текста дней).
- У всех стадий всех воронок `phase_group` заполнен ⇒ норма есть всегда
  (фолбэки 14/21/21/30).

### Красные линии

Миграций нет. `.env` не читается. Типы руками не правятся. Настройки среды
владельца не менять.

## РАЗВЕДКА

```bash
# 1. Как ProjectCard считает aging и рисует «залипла» (ветка 3 приоритетного стека)
grep -n "getStageAging\|AttentionLine\|isStale\|stageLabel" src/components/projects/ProjectCard.tsx | head -20

# 2. Где ProjectCard используется (ожидание: PipelineBoard; возможно ещё)
grep -rn "ProjectCard" src --include="*.tsx" | grep -v "ProjectCard.tsx"

# 3. Ячейка стадии в таблице
grep -n "stage\|Стадия" src/components/projects/ProjectsTable.tsx | head -20

# 4. Статус-строка peek
grep -n "stage\|DealFocusPanel\|статус" src/components/projects/ProjectPeekContent.tsx | head -15

# 5. Хук стадий и terminal-признаки
grep -n "usePipelineStagesMap\|usePipelineStages" src/lib/hooks/use-pipelines.ts
```

## ЗАДАЧА 1: хук сборки датчика — use-stage-gauge.ts

### Context
Сборка «gauge для сущности» понадобится минимум в трёх потребителях — не копировать
тройку хуков в каждый.

### Steps
Создать `src/lib/hooks/use-stage-gauge.ts`:

```ts
'use client';

import { useDwellThresholds, useStageTargetDays } from '@/lib/hooks/use-org-settings';
import { resolveStageNorm, stageTimeGauge, type StageTimeGauge } from '@/lib/domain/stage-norm';

/**
 * Тайм-датчик стадии для компактных поверхностей (S-PIPELINE-RING-2).
 * Та же математика, что у ячейки кокпита (ProjectStageCockpit) — один контракт.
 * `stage: null` (терминал/стадия не найдена) ⇒ null — кольцо не рисуется.
 */
export function useStageTimeGauge(
  stageEnteredAt: string | null | undefined,
  stage: { id: string; phase_group: string | null } | null | undefined,
): StageTimeGauge | null {
  const dwell = useDwellThresholds();
  const targetDays = useStageTargetDays();
  if (!stage || !stageEnteredAt) return null;
  return stageTimeGauge(stageEnteredAt, resolveStageNorm(stage, targetDays, dwell), new Date());
}
```

⚠️ Хуки зовутся ДО раннего выхода — порядок хуков стабилен (правила React).

### Verification
```bash
npx tsc --noEmit
```

## ЗАДАЧА 2: компонент — shared/StageTimeRing.tsx

### Context
Презентационное кольцо. Без clip-path; дырка — CSS mask (работает на любом фоне:
surface, surface2 при hover строки, тинт карточки).

### Steps
Создать `src/components/shared/StageTimeRing.tsx`:

```tsx
'use client';

import type { StageTimeGauge } from '@/lib/domain/stage-norm';

const RING_COLOR = {
  ok: 'var(--accent)',
  warn: 'var(--yellow)',
  over: 'var(--red)',
} as const;

/**
 * Кольцо времени стадии (S-PIPELINE-RING-2) — компакт-форма тайм-ячейки кокпита.
 * conic-gradient = доля израсходованной нормы; over — кольцо сомкнуто, красное.
 * Дырка — mask, НЕ внутренний круг цветом фона: кольцо живёт на разных подложках.
 */
export function StageTimeRing({
  gauge,
  size = '1rem',
  showDays = false,
}: {
  gauge: StageTimeGauge | null;
  size?: string;
  showDays?: boolean;
}) {
  if (!gauge || gauge.pct == null || gauge.days == null) return null;
  const color = RING_COLOR[gauge.state];
  const label = `${gauge.days} дн. в стадии · норма ${gauge.norm} дн.`;
  const mask =
    'radial-gradient(farthest-side, transparent calc(100% - 0.1875rem), #000 calc(100% - 0.1875rem + 0.5px))';

  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={label}>
      <span
        role="img"
        aria-label={label}
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${color} ${gauge.pct}%, var(--surface3) 0)`,
          WebkitMask: mask,
          mask,
        }}
      />
      {showDays && (
        <span
          className="text-meta tabular-nums"
          style={{
            color:
              gauge.state === 'over'
                ? 'var(--red-text, var(--red))'
                : gauge.state === 'warn'
                  ? 'var(--yellow-text, var(--yellow))'
                  : 'var(--text-dim)',
          }}
        >
          {gauge.days} дн.
        </span>
      )}
    </span>
  );
}
```

### Verification
```bash
npx tsc --noEmit
```

## ЗАДАЧА 3: карточка канбана — ProjectCard

### Context
Карточка стоит В КОЛОНКЕ стадии — стадия очевидна, кольцо несёт время. Текстовая
ветка «залипла N дн.» в приоритетном стеке становится дублем кольца И перестаёт
теряться: стек показывает одну строку, и «залипла» гасилась более острыми
сигналами — кольцо видно всегда.

### Steps
1. В `ProjectCard.tsx`: собрать gauge через `useStageTimeGauge(project.stage_entered_at,
   pipelineStage ?? null)` (переменная `pipelineStage` в карточке уже есть — РАЗВЕДКА п.1;
   хук — на верхнем уровне компонента, не в ветке).
2. Рендер `<StageTimeRing gauge={gauge} showDays />` в мета-строке карточки
   (рядом с суммой/датой — точное место выбрать по вёрстке, НЕ внутри
   AttentionLine). Терминальные карточки (won/lost): gauge собирать только для
   открытых — у терминала кольцо не рисовать (передать `null`).
3. Ветку 3 приоритетного стека («залипла …» AttentionLine, ~строки 229-231)
   удалить, оставив комментарий:
   `// S-PIPELINE-RING-2: «залипла» из стека снята — время стадии всегда видно кольцом (не гасится острыми сигналами)`.
   Остальные ветки стека НЕ трогать. Если `getStageAging` после этого в файле
   не используется — убрать импорт.

### Verification
```bash
npx tsc --noEmit
grep -n "залипла" src/components/projects/ProjectCard.tsx   # ожидание: только комментарий
```

## ЗАДАЧА 4: таблица — ProjectsTable

### Steps
В ячейке стадии (`ProjectsTable.tsx`, найти по РАЗВЕДКЕ п.3) — кольцо ПЕРЕД
именем стадии: `<StageTimeRing gauge={...} />` (без `showDays` — в таблице
дни в title). Стадия по `stage_id` через `usePipelineStagesMap()` (если карта
стадий в таблице ещё не строится — добавить). Для терминальных строк — null.

⚠️ Если таблица рендерит много строк: `useStageTimeGauge` — хук, в ячейке-функции
его звать нельзя. Собрать `dwell`/`targetDays` ОДИН раз на таблицу
(`useDwellThresholds` + `useStageTargetDays`) и в ячейке звать чистые
`resolveStageNorm`/`stageTimeGauge` с одним `now = new Date()` на рендер таблицы
(const сверху компонента).

### Verification
```bash
npx tsc --noEmit
```

## ЗАДАЧА 5: peek — ProjectPeekContent

### Steps
В статус-строке peek (РАЗВЕДКА п.4) добавить `<StageTimeRing gauge={...} showDays />`
рядом с названием стадии. Сборка — `useStageTimeGauge` (peek — один проект,
хук уместен). Терминал — null.

### Verification
```bash
npx tsc --noEmit
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint      # ровно baseline
npx vitest run
npm run build     # последним, при выключенном dev
```

Рантайм-смок (если доступен браузер; иначе явно отметить «остаётся гейту»):
канбан воронки — кольца на открытых карточках, title с нормой; таблица сделок —
кольцо в ячейке стадии, ховер строки не «съедает» дырку кольца (mask, не круг
цветом фона); peek — кольцо + дни; тема t-minimal и одна тёмная. Записей в БД — ноль.

## КОММИТ

```bash
git add -A
git commit -m "feat(pipeline): кольцо времени стадии в канбане, таблице и peek (S-PIPELINE-RING-2)

- StageTimeRing (conic + mask, без clip-path) + useStageTimeGauge
- ProjectCard: кольцо вместо строки «залипла» в стеке (сигнал виден всегда)
- ProjectsTable: кольцо в ячейке стадии (чистые вызовы, один now на рендер)
- ProjectPeekContent: кольцо + дни в статус-строке
- контракт норма→ok/warn/over один с ячейкой кокпита"
```
