# Claude Code Prompt — S-DEAL-ZONES-1B: кольцо здоровья и «перенесён N раз»

Ревизия 2 (после внешнего ревью, `_analysis/review-sprint-S-DEAL-ZONES-1B.md`, 81/100 NO-GO → правки B1, B2, W1–W8 внесены).

Ветка: `feat/deal-zones-1b`.
Источник решений — `claude/decisions-lime-theme-2026-09-05.md` (Р3, Р8) и `claude/decisions-zones-1b-2026-09-06.md` (правки к ним). Файлов в репо нет, они в Claude Project.

## ⚠️ ПРЕДУСЛОВИЕ — читать первым

**S-DEAL-ZONES-1A НЕ в `main`.** Она живёт в ветке `feat/deal-zones-1a` (`5e6c535`), гейт пройден, мерж не сделан. Этот спринт стартует **поверх 1A**, а не поверх `main`.

Если разведка не находит зону «Риски» — СТОП, сообщи. Не изобретать зону, не делать её здесь.

## Что в спринте и чего в нём НЕТ

| Пункт решений | Статус | Почему |
|---|---|---|
| **Р3 — кольцо здоровья** | ✅ в спринте, в изменённом виде | см. «Отклонение от Р3» |
| **Р8 — «перенесён N раз»** | ✅ в спринте | данные есть с миграции 087, миграция НЕ нужна |
| Чип вердикта под шагом | ❌ не трогаем | 1A обещала «перенести слова в кольцо в 1B» — **отменено сознательно**: в кольцо кладётся счёт, а не слова, и чип остаётся единственным словесным вердиктом в рабочей колонке. Два словесных носителя одного факта — закрытая F-01 |
| Р7 — срезы вертикали в W1 | ❌ не нужен | срез №1 сделан в 1A (`ProjectStageCockpit.tsx:131`, F-04); срез №2 («подсказка стадии → тултип») отклонён: `StageGuidance` не рендерится вовсе, когда подсказки нет и юзер не owner — 34px тратятся только на реальный контент, а редактирование org-подсказки внутри тултипа было бы регрессом |
| Р7 — срезы в W6 | ❌ нечего резать | пятисегментной шкалы и подписи «1 критичный · 2 внимание» в приложении никогда не было: `DealSignals` при `showVerdict={false}` уже показывает только помехи + свёрнутое «N в норме» |
| Р2 — лайм-бюджет (7 перекрасок) | ❌ отдельной задачей | перекраски описаны по МАКЕТУ; в приложении этих элементов в перечисленном виде нет. Ставить их в промпт — заставить изобретать анкеры. Делается аудитом по скриншоту (`crm-design-auditor`) после этого спринта |
| Р4 — тёмный материал | ✅ уже сделано | `--glass-bg: #17171C` в `t-lime` с S-LIME-TOKENS-1 |

## Отклонение от Р3 — читать перед задачей 1

Р3 проектирует кольцо как **взвешенный score**: `48 = 100 − (просрочка 30 + норма стадии 12 + один контакт 10)`, длина дуги ∝ весу сигнала.

Это в спринт НЕ идёт, по двум причинам из самого кода:

1. Весов не существует. `src/lib/domain/deal-signals.ts` отдаёт сигналы с `state` (`ok/warn/bad/na`) и не имеет ни score, ни весов. Числа 30/12/10 пришлось бы выдумать, и они не калибруются ничем — в отличие от порогов `DEFAULT_SIGNAL_THRESHOLDS`, которые сверялись с живой БД.
2. Шапка того же файла запрещает третью формулу прямо: «вместо одного непрозрачного числа — сигналы с вердиктом» и «Третьей формулы в проекте быть не должно». Score `48/100` — это ровно то число, которое `calculateDealHealth` (0–8) уже проиграл.

**Что делается вместо.** Дуга делится на РАВНЫЕ сегменты — по одному на каждый применимый сигнал, цвет сегмента = состояние сигнала. Порядок сегментов = порядок массива `signals` (`bad → warn → ok`), тот же, что задаёт строки списка. Клик по сегменту скроллит к своему сигналу.

Критерий Р3 «кольцо обязано нести то, чего нет в списке ниже» при этом выполняется: список в зоне «Риски» показывает только помехи, а норма спрятана под кнопкой «N в норме». Кольцо — единственное место, где видна ПРОПОРЦИЯ: две помехи из пяти и четыре из пяти выглядят по-разному без единого клика. Зелёные сегменты соответствуют строкам, которые видны только после раскрытия «N в норме» — это не рассинхрон, это ровно та информация, ради которой кольцо и рисуется.

Центр кольца — пропорции Р3, но кегли из шкалы S-FORMAT-1: `text-2xl` (24px/700) и `text-meta` (11px) вместо макетных 22 и 9.5. Шкала 11/13/14/16/18/24 — принятое и работающее решение, произвольные `text-[22px]` были бы первой пробоиной в ней; оба токена в `rem`, переживают увеличение шрифта в браузере. Числа в центре — счёт сигналов, а не выдуманный балл.

---

## Acceptance criteria

1. В зоне «Риски» карточки сделки (`type === 'client'`) над списком сигналов есть кольцо: N равных сегментов с зазором 2°, цвет по состоянию сигнала, в центре «сколько помех / из скольких».
2. Клик по КАЖДОМУ сегменту скроллит к своему сигналу — включая первый (bad), а не только последний отрисованный.
3. Внедрение (`type === 'delivery'`) и internal не изменились ВООБЩЕ — там своя формула здоровья, кольца нет.
4. В строке метаданных «Следующего шага» при ≥2 переносах даты появляется «перенесён N раз».
5. Счётчик переносов относится к ТЕКУЩЕМУ шагу и исчезает, когда шаг закрыт («Шаг сделан»).
6. Счётчик приезжает из того же queryFn, что уже считал переносы дедлайна: второго запроса и второго ключа нет, инвалидация одна.
7. `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build` — зелёные. `python3 scripts/audit-tokens.py` — 0 нарушений.

---

## РАЗВЕДКА

```bash
# 1. Стартуем ПОВЕРХ 1A, не поверх main
git --no-optional-locks log --oneline -1
git --no-optional-locks status --porcelain

# 2. Зона «Риски» из 1A — она должна быть в дереве
grep -rn "showVerdict={false}" src/components/projects/
grep -rn "zone-eyebrow" src/components/projects/ProjectDetail.tsx | head

# 3. Существующий счётчик переносов — его расширяем, НЕ пишем второй
sed -n '45,100p' src/lib/hooks/use-stage-story.ts
grep -rn "deadline-moves" src          # ДВА совпадения: хук и инвалидация
grep -rn "useDeadlineMoves\|deadlineMoves" src --include=*.tsx --include=*.ts

# 4. Семантические токены цвета и якоря сигналов
grep -n "danger\|warning\|success" tailwind.config.ts | head
grep -n "SIGNAL_ANCHORS" -A 10 src/components/projects/DealSignals.tsx

# 5. Помощник склонения
sed -n '13,25p' src/lib/utils/plural.ts
```

**Ожидания и стопы:**
- п.2 пуст ⇒ 1A нет в дереве. **СТОП**, сообщи — этот спринт без неё не выполним.
- п.3 `grep deadline-moves` даёт **ровно два** совпадения: `use-stage-story.ts` (ключ хука) и `use-projects.ts` (инвалидация). Если совпадений больше — перечисли их в отчёте, все они меняются в задаче 3.2.

---

## ЗАДАЧА 1: чистая геометрия кольца — `src/lib/domain/health-ring.ts`

### Context

Геометрия SVG-дуг — арифметика, а не разметка. В отдельном модуле она тестируется без React и без DOM.

**Дуги рисуются `<path>`, не stacked `<circle>` со `stroke-dasharray`.** Пять полных окружностей друг на друге отдают hit-testing на откуп браузеру: попадание в зазор между штрихами трактуется по-разному, и клик по красному сегменту мог бы уехать в верхний (последний, зелёный) круг. AC 2 тогда молча врёт. Дуга-path — это ровно та фигура, которая видна, и кликается только она.

### Steps

Создай `src/lib/domain/health-ring.ts`:

```ts
import type { DealSignal, SignalKey, SignalState } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B: геометрия кольца здоровья сделки.
//
// Кольцо — НЕ score. Сегменты равные, по одному на применимый сигнал; смысл
// несёт цвет сегмента и его позиция (та же, что у строки в списке). Взвешенная
// версия из макета отклонена: весов у сигналов нет, а выдуманные 30/12/10
// вернули бы непрозрачный балл, ради ухода от которого `calculateDealHealth`
// (0–8) и был снят в S-HEALTH-V2-1.
//
// Цвет — ТОЛЬКО семантические токены (--danger/--warning/--success).
// `--accent` для смысла не годится: в `t-washi` акцент === --red, и «в порядке»
// стало бы красным. Правило унаследовано из шапки `DealSignals.tsx`.
//
// `--h-ring` из :root здесь НЕ используется: он один на всю зону, а сегменту
// нужен свой цвет.
// ═══════════════════════════════════════════════════════

export const RING_RADIUS = 35;
export const RING_STROKE = 6;
/** viewBox 80×80: r 35 + половина обводки 3 = 38 ≤ 40. */
export const RING_BOX = 80;
/** Зазор между сегментами, градусы (Р3). */
export const RING_GAP_DEG = 2;

const STATE_STROKE: Record<Exclude<SignalState, 'na'>, string> = {
  bad:  'var(--danger)',
  warn: 'var(--warning)',
  ok:   'var(--success)',
};

export interface RingSegment {
  key: SignalKey;
  /** Подпись для нативного тултипа сегмента. */
  label: string;
  /** Готовое значение stroke — CSS-переменная, не hex. */
  stroke: string;
  /** Границы дуги в градусах: 0 — 12 часов, рост по часовой. */
  startDeg: number;
  endDeg: number;
  /** Атрибут d для <path>. */
  d: string;
}

export interface HealthRing {
  segments: RingSegment[];
  /** Сколько сигналов не в норме — большое число в центре. */
  problems: number;
  /** Сколько сигналов всего — маленькое «из N». */
  total: number;
}

/** Точка на окружности; 0° — 12 часов, отсчёт по часовой стрелке. */
export function polarPoint(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x0, y0] = polarPoint(cx, cy, r, startDeg);
  const [x1, y1] = polarPoint(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

/**
 * `signals` приходит уже отсортированным (bad → warn → ok) и без 'na' — так его
 * отдаёт `getDealSignals`. Порядок здесь НЕ трогается: он обязан совпадать с
 * порядком строк списка, иначе кольцо перестаёт быть легендой.
 */
export function buildHealthRing(signals: DealSignal[]): HealthRing {
  const total = signals.length;
  if (total === 0) return { segments: [], problems: 0, total: 0 };

  const c = RING_BOX / 2;
  const slotDeg = 360 / total;
  const half = RING_GAP_DEG / 2;

  const segments = signals.map((s, i) => {
    const startDeg = i * slotDeg + half;
    const endDeg = (i + 1) * slotDeg - half;
    return {
      key: s.key,
      label: s.label,
      stroke: STATE_STROKE[s.state === 'na' ? 'ok' : s.state],
      startDeg,
      endDeg,
      d: arcPath(c, c, RING_RADIUS, startDeg, endDeg),
    };
  });

  return {
    segments,
    problems: signals.filter((s) => s.state !== 'ok').length,
    total,
  };
}
```

### Verification

```bash
npx tsc --noEmit
```

---

## ЗАДАЧА 2: компонент кольца и его монтаж

### Context

Кольцо живёт в зоне «Риски», слева от списка сигналов: колонка зоны 356px, кольцо 80px + список рядом экономит вертикаль, ради которой зоны и вводились.

### Steps — компонент

Создай `src/components/projects/DealHealthRing.tsx`:

```tsx
'use client';

import {
  buildHealthRing,
  RING_BOX,
  RING_STROKE,
} from '@/lib/domain/health-ring';
import type { DealSignal, SignalKey } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B (Р3). Кольцо здоровья сделки.
//
// A11Y: кольцо — role="img" с полной подписью, сегменты НЕ являются focusable.
// Клик по сегменту — мышиная надстройка над действием, которое с клавиатуры уже
// доступно кнопкой CTA в строке сигнала под кольцом. Отдельные табстопы на
// дугах дали бы второй набор точек остановки к тем же пяти действиям.
//
// Дуги — <path>, не окружности со stroke-dasharray: кликается ровно видимая
// фигура, а не полный круг с невидимыми штрихами поверх соседей.
// ═══════════════════════════════════════════════════════

export function DealHealthRing({
  signals,
  onSegmentClick,
}: {
  signals: DealSignal[];
  onSegmentClick?: (key: SignalKey) => void;
}) {
  const ring = buildHealthRing(signals);
  if (ring.total === 0) return null;

  const label =
    ring.problems === 0
      ? `Здоровье сделки: все ${ring.total} сигналов в норме`
      : `Здоровье сделки: ${ring.problems} из ${ring.total} сигналов требуют внимания`;

  return (
    <div className="relative shrink-0" style={{ width: RING_BOX, height: RING_BOX }}>
      <svg
        width={RING_BOX}
        height={RING_BOX}
        viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
        role="img"
        aria-label={label}
      >
        {ring.segments.map((seg) => (
          <path
            key={seg.key}
            d={seg.d}
            fill="none"
            stroke={seg.stroke}
            strokeWidth={RING_STROKE}
            strokeLinecap="butt"
            onClick={onSegmentClick ? () => onSegmentClick(seg.key) : undefined}
            className={onSegmentClick ? 'cursor-pointer' : undefined}
          >
            <title>{seg.label}</title>
          </path>
        ))}
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className="text-2xl font-bold leading-none tabular-nums text-text-main">
          {ring.problems}
        </span>
        <span className="mt-0.5 text-meta leading-none tabular-nums text-text-dim">
          из {ring.total}
        </span>
      </div>
    </div>
  );
}
```

### Steps — монтаж (имена обёрток НЕ фиксированы)

1A могла оформить зону «Риски» по-разному. **Не ищи конкретное имя компонента.** Найди в коде зоны «Риски» единственное место, где `DealSignals` рендерится с `showVerdict={false}` для сделки (`type === 'client'`), и поставь кольцо слева от списка:

```tsx
<div className="flex items-start gap-3">
  <DealHealthRing signals={signals.signals} onSegmentClick={scrollToSignalAnchor} />
  <div className="min-w-0 flex-1">
    <DealSignals result={signals} onAction={scrollToSignalAnchor} showVerdict={false} />
  </div>
</div>
```

Если тот же компонент переиспользуется рельсой внедрения (`DealContextRail`, путь `delivery`/`internal`) — кольцо там появиться НЕ должно: добавь булев проп (`withRing`) и включай его только на клиентской зоне «Риски». Если пути уже разведены и общего компонента нет — проп не нужен, вставляй напрямую.

Как именно получилось — в отчёт: имя компонента, где вставлено, понадобился ли проп.

### Verification

```bash
npx tsc --noEmit
# кольцо есть у сделки и отсутствует у внедрения — проверяется по коду, а не по числу совпадений
grep -rn "DealHealthRing" src/components/projects/
python3 scripts/audit-tokens.py   # 0 нарушений: hex в кольце нет
```

---

## ЗАДАЧА 3: счётчик переносов — чистая функция, расширение хука, инвалидация

### Context

`useDeadlineMoves` (`src/lib/hooks/use-stage-story.ts:69`) уже вытягивает ВСЕ строки `activity_log` по проекту и на клиенте считает переносы `deadline`. `next_action_date` лежит в том же `payload.changes` (миграция 087, whitelist класса «Значения»). Второй запрос не нужен — нужен второй счётчик в том же проходе.

Миграция `postpone_count` из S-DEAL-DATA-1 для этого НЕ требуется и остаётся денормализацией на потом.

⚠️ **У хука нет realtime — намеренно.** Свежесть держит ОДНА инвалидация в `use-projects.ts:514`. Переименование ключа без правки этой строки заморозит счётчик ровно после того UPDATE, который его должен инкрементить. Это пункт 3.3, он обязателен.

### Steps

**3.1.** Создай `src/lib/domain/field-moves.ts`:

```ts
// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B: подсчёт переносов даты по аудиту полей (087).
//
// Вынесено из queryFn хука, потому что правило подсчёта нетривиально и обязано
// быть проверяемым без сети.
// ═══════════════════════════════════════════════════════

export interface FieldMoves {
  count: number;
  /** ISO последнего переноса или null. */
  lastAt: string | null;
}

export interface AuditRow {
  created_at: string;
  payload: unknown;
}

function changesOf(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const changes = (payload as Record<string, unknown>).changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  return changes as Record<string, unknown>;
}

/**
 * Переносы `deadline` — прежнее поведение `useDeadlineMoves` дословно: считается
 * ЛЮБОЕ появление ключа в changes, включая назначение с нуля. Не ужесточаем:
 * число «Переносов ×N» уже на экране во вкладке «История», и менять его молча
 * означало бы поменять цифру у пользователя без спроса.
 */
export function countDeadlineMoves(rows: AuditRow[]): FieldMoves {
  let count = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    const changes = changesOf(row.payload);
    if (!changes || !('deadline' in changes)) continue;
    count += 1;
    if (lastAt === null) lastAt = row.created_at;
  }
  return { count, lastAt };
}

/**
 * Переносы даты ТЕКУЩЕГО шага. Строгий счёт, три отличия от `deadline`:
 *
 * 1. `to > from` — только сдвиг ВПЕРЁД. Перенос шага на более раннюю дату это
 *    ускорение, а не прокрастинация, и в диагноз «перенесён N раз» не идёт.
 * 2. Счёт обрывается на `from === null`: это момент, когда дата текущего шага
 *    была назначена впервые. Всё, что раньше, относится к прошлым шагам.
 * 3. Счёт обрывается и на `to === null`: снятие даты — это «Шаг сделан»
 *    (`markStepDone` пишет `next_step: null, next_action_date: null`). Диагноз
 *    закрытого шага не должен висеть на карточке следующего.
 *
 * `rows` ожидаются по УБЫВАНИЮ `created_at` — так их отдаёт запрос хука.
 * `from`/`to` приходят из `jsonb_build_object('from', v_old ->> v_field, ...)`,
 * то есть JSON-null при пустом значении, а не отсутствующий ключ.
 */
export function countStepMoves(rows: AuditRow[]): FieldMoves {
  let count = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    const changes = changesOf(row.payload);
    if (!changes || !('next_action_date' in changes)) continue;
    const entry = changes.next_action_date;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { from, to } = entry as { from?: unknown; to?: unknown };
    const fromStr = typeof from === 'string' && from.length > 0 ? from : null;
    const toStr = typeof to === 'string' && to.length > 0 ? to : null;
    // Обе границы жизни текущего шага. Идём по убыванию, поэтому первая
    // встреченная — ближайшая к настоящему.
    if (fromStr === null || toStr === null) break;
    if (toStr <= fromStr) continue;
    count += 1;
    if (lastAt === null) lastAt = row.created_at;
  }
  return { count, lastAt };
}
```

**3.2.** В `src/lib/hooks/use-stage-story.ts` переименуй `useDeadlineMoves` → `useFieldMoves`, ключ `['deadline-moves', id]` → `['field-moves', id]`, тело queryFn замени на два вызова из 3.1:

```ts
export interface ProjectFieldMoves {
  deadline: FieldMoves;
  step: FieldMoves;
}

export function useFieldMoves(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['field-moves', projectId],
    enabled: !!projectId,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<ProjectFieldMoves> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('activity_log')
        .select('created_at, payload')
        .eq('project_id', projectId!)
        .in('event_type', ['project_updated', 'stage_changed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as AuditRow[];
      return { deadline: countDeadlineMoves(rows), step: countStepMoves(rows) };
    },
  });
}
```

Тип `DeadlineMoves` заменить на `FieldMoves` из нового модуля (реэкспорт не плодить).
В `useStageStory` поле результата `deadlineMoves` оставить как есть, но брать `moves?.deadline`. `DealStageStory.tsx` при этом не меняется.

**3.3. ОБЯЗАТЕЛЬНО.** В `src/lib/hooks/use-projects.ts:514` (`onSettled` у `useUpdateProject`):

```ts
// Перенос дедлайна и переносы даты шага видны на этой вкладке и на карточке
// (аудит полей 087) и приезжают тем же UPDATE.
qc.invalidateQueries({ queryKey: ['field-moves'] });
```

Без этой правки счётчик не обновится после переноса даты — у хука нет realtime, инвалидация единственная.

**3.4.** В `src/components/projects/DealNextStep.tsx` добавь строку в блок метаданных, СРАЗУ после блока `{overdue && (...)}`:

```tsx
{stepMoves >= 2 && (
  <span className="text-warning-text">
    перенесён {stepMoves} {pluralRu(stepMoves, 'раз', 'раза', 'раз')}
  </span>
)}
```

где вверху компонента:

```tsx
const { data: moves } = useFieldMoves(project.id);
const stepMoves = moves?.step.count ?? 0;
```

Импорты: `useFieldMoves` из `@/lib/hooks/use-stage-story`, `pluralRu` из `@/lib/utils/plural`.

Порог `>= 2` — из Р8: один перенос это работа, два и больше — диагноз.

`DealFocusPanel.tsx` (peek-панель) НЕ трогать: там своя укороченная версия шага.

### Verification

```bash
npx tsc --noEmit
grep -rn "useDeadlineMoves\|deadline-moves" src        # 0 совпадений — старые имя и ключ вычищены
grep -rn "field-moves" src                             # 2: use-stage-story.ts + use-projects.ts
grep -n "deadlineMoves" src/components/projects/DealStageStory.tsx   # 4, как было
```

---

## ТЕСТЫ

Обязательны: обе новые функции — чистая логика в `lib/`.

**`tests/unit/health-ring.test.ts`** (`buildHealthRing`):
- пустой массив → `{segments: [], problems: 0, total: 0}`;
- 5 сигналов → 5 сегментов; `startDeg[i] === i*72 + 1`, `endDeg[i] === (i+1)*72 − 1`; зазор между соседями ровно 2°;
- сумма длин дуг = 360 − N·2;
- 1 сигнал → один сегмент `1° … 359°`, `d` содержит флаг large-arc `1`;
- 3 сигнала → каждая дуга 118°, флаг large-arc `0`;
- порядок сегментов совпадает с порядком входного массива (кольцо — легенда к списку);
- `state: 'bad'` → `stroke === 'var(--danger)'`, `'warn'` → `--warning`, `'ok'` → `--success`;
- `problems` считает только `state !== 'ok'`;
- `polarPoint(40,40,35,0)` → верх окружности `[40, 5]` (0° = 12 часов).

**`tests/unit/field-moves.test.ts`**:
- `countDeadlineMoves`: пустой вход → `{0, null}`; строка без `changes`; строка с `changes`, но без `deadline`; три строки с `deadline` → `count 3`, `lastAt` = `created_at` ПЕРВОЙ строки (вход по убыванию);
- `countStepMoves`: `{from: null, to: '2026-09-10'}` → 0 (назначение, не перенос) — именно JSON-`null`, а не отсутствующий ключ;
- `countStepMoves`: `{from: '2026-09-01', to: null}` первой строкой → 0 («Шаг сделан», диагноз прошлого шага не висит);
- `countStepMoves`: `{from: '2026-09-10', to: '2026-09-05'}` → 0 (сдвиг назад);
- `countStepMoves`: два переноса вперёд, затем (ниже по списку) строка `from: null` → `count 2`, всё что за границей отброшено;
- смешанный payload `{deadline: {...}, next_action_date: {...}}` в одной строке — счётчики независимы, каждый считает своё;
- `payload` = `null`, строка, массив — не падает, отдаёт `{0, null}`.

---

## СМОК РУКАМИ (в отчёт, одной строкой на пункт)

1. Открыть сделку с ≥1 помехой: кольцо есть, число в центре совпадает с числом строк-помех.
2. **Клик по ПЕРВОМУ (красному) сегменту** скроллит к своему сигналу, а не к последнему. У `stage_dwell` якоря нет (`SIGNAL_ANCHORS.stage_dwell === null`) — клик по его сегменту ничего не делает, это штатно.
3. Открыть внедрение (`type='delivery'`): кольца нет, рельса прежняя.
4. Перенести дату шага вперёд на тестовой сделке 2 раза → «перенесён 2 раза» появляется БЕЗ перезагрузки страницы.
5. Нажать «Шаг сделан» → строка исчезает.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
python3 scripts/audit-tokens.py
```

Все пять зелёные — иначе не коммить.

---

## КОММИТ

**Не `git add -A`**: в рабочем дереве лежат незакоммиченные файлы `_analysis/` (спринты и ревью 1A и 1B). Перечисляй файлами.

Сообщение многострочное: писать через `git commit -F`, НЕ через `-m` (в zsh `!` в теле раскрывается как history expansion и глотает буфер).

```bash
cat > /tmp/zones1b.txt <<'MSG'
feat(deals): кольцо здоровья и счётчик переносов шага

Кольцо в зоне «Риски»: N равных сегментов по числу применимых сигналов,
цвет — состояние, порядок — тот же, что задаёт строки списка. Клик по
сегменту скроллит к своему сигналу. Дуги рисуются path, а не окружностями
со stroke-dasharray: кликается видимая фигура, а не полный круг поверх
соседей.

Взвешенная версия из макета (score 100 минус веса) отклонена: весов у
сигналов нет, а выдуманные вернули бы непрозрачный балл, ради ухода от
которого calculateDealHealth (0–8) и был снят в S-HEALTH-V2-1. Кольцо
несёт то, чего нет в списке: пропорцию — норма в списке свёрнута.

«Перенесён N раз» считается из аудита полей 087 в том же запросе, что
уже тянул переносы дедлайна: миграция postpone_count не понадобилась.
Счёт строгий — только сдвиг вперёд, только у текущего шага (границы —
назначение даты и «Шаг сделан»).

Ключ хука deadline-moves переименован в field-moves вместе с
единственной инвалидацией в useUpdateProject.onSettled: realtime у
хука нет намеренно, и разъехавшийся ключ заморозил бы счётчик ровно
после того UPDATE, который его инкрементит.

Кольцо — role="img" с полной подписью; сегменты не focusable, те же
действия доступны с клавиатуры кнопками CTA в строках сигналов.
MSG

git add \
  src/lib/domain/health-ring.ts \
  src/lib/domain/field-moves.ts \
  src/components/projects/DealHealthRing.tsx \
  src/components/projects/DealNextStep.tsx \
  src/lib/hooks/use-stage-story.ts \
  src/lib/hooks/use-projects.ts \
  tests/unit/health-ring.test.ts \
  tests/unit/field-moves.test.ts
# плюс файл, куда фактически вставлено кольцо (зона «Риски» из 1A) — добавь его явно
git status --short
git commit -F /tmp/zones1b.txt && rm /tmp/zones1b.txt
```

---

## Известные ограничения (в отчёт, не чинить здесь)

- **Запрос переносов теперь стреляет на каждой открытой сделке.** До этого `useDeadlineMoves` монтировался только со вкладкой «История». Второго queryFn и второго ключа не появилось — но момент запроса изменился. Выборка неограниченная намеренно: `useActivityLog` с `limit(50)` молча обрезал бы счётчик на длинной сделке. Если карточка заметно просядет — резать не лимитом, а серверным счётчиком (RPC), отдельной задачей.
- `countDeadlineMoves` считает и назначение дедлайна с нуля, `countStepMoves` — нет. Асимметрия сознательная: прежнее число «Переносов ×N» уже на экране, и менять его в этом спринте значило бы поменять цифру у пользователя без спроса.
- Переносы до миграции 087 в `activity_log` не записаны — бэкфилла нет и восстанавливать не из чего. На старых сделках счётчик занижен.
- Если шаг заменили текстом, не сняв дату, граница «текущего шага» не сбрасывается и счёт продолжается со старого. Точную границу даст `postpone_count` в S-DEAL-DATA-1.
