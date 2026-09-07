'use client';

import {
  buildHealthRing,
  RING_BOX,
  RING_RADIUS,
  RING_STROKE,
  STATE_STROKE,
} from '@/lib/domain/health-ring';
import { pluralRu, pluralProblems } from '@/lib/utils/plural';
import { DealVerdictChip } from './DealSignals';
import { VERDICT_CONFIG, type DealSignal, type DealVerdict } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B (Р3). Здоровье сделки — по макету «Сделка v2»:
// слева кольцо (серая дорожка + одна дуга помех цветом худшего состояния),
// справа посигнальная полоса и её расшифровка словами.
//
// Чип вердикта стоит ЗДЕСЬ, а не под следующим шагом. Это перенос, не добавка:
// два словесных носителя уровня здоровья на одном экране — закрытая F-01.
// Под шагом чип был обходным путём, пока виджета здоровья с кольцом не
// существовало; теперь уровень живёт там же, где кольцо и разрез по сигналам.
//
// Полоса вернулась после того, как кольцо перестало быть сегментированным:
// Р7 резал её как дубль кольца, теперь она единственный носитель посигнального
// разреза. Подпись под ней — тот же разрез словами: он читается без различения
// цвета, то есть служит текстовой альтернативой полосе, а не её дублем.
//
// A11Y: кольцо и полоса — role="img" с подписью; кликабельных зон нет,
// переход к сигналу делает кнопка CTA в его строке ниже.
// ═══════════════════════════════════════════════════════

/**
 * Разрез ТОЛЬКО по помехам. «N в норме» из макета здесь нет намеренно: ровно
 * это число стоит кнопкой-раскрывашкой на сорок пикселей ниже, в списке
 * сигналов. Одни и те же слова дважды в одном виджете — младший брат F-01.
 * Долю нормы при этом видно: она зелёная в полосе и в незакрашенной части дуги.
 */
function countsCaption(counts: { bad: number; warn: number; ok: number }): string {
  const parts: string[] = [];
  if (counts.bad > 0) {
    parts.push(`${counts.bad} ${pluralRu(counts.bad, 'критичный', 'критичных', 'критичных')}`);
  }
  if (counts.warn > 0) parts.push(`${counts.warn} внимание`);
  return parts.length > 0 ? parts.join(' · ') : 'все сигналы в норме';
}

export function DealHealthRing({
  signals,
  verdict,
}: {
  signals: DealSignal[];
  verdict?: DealVerdict;
}) {
  const ring = buildHealthRing(signals);
  if (ring.total === 0) return null;

  const c = RING_BOX / 2;
  const caption = countsCaption(ring.counts);
  const verdictLabel = verdict ? `${VERDICT_CONFIG[verdict].label}. ` : '';
  const label =
    ring.problems === 0
      ? `Здоровье сделки: ${verdictLabel}все ${ring.total} сигналов в норме`
      : `Здоровье сделки: ${verdictLabel}${ring.problems} из ${ring.total} сигналов требуют внимания — ${caption}`;

  return (
    <div className="flex items-center gap-4" role="img" aria-label={label}>
      <div className="relative shrink-0" style={{ width: RING_BOX, height: RING_BOX }}>
        <svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} aria-hidden>
          {/* Дорожка — полный круг под дугой: даёт кольцу форму при короткой
              дуге и служит шкалой «сколько всего сигналов». */}
          <circle
            cx={c}
            cy={c}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth={RING_STROKE}
          />
          {ring.full ? (
            <circle
              cx={c}
              cy={c}
              r={RING_RADIUS}
              fill="none"
              stroke={ring.stroke}
              strokeWidth={RING_STROKE}
            />
          ) : (
            ring.d && (
              <path
                d={ring.d}
                fill="none"
                stroke={ring.stroke}
                strokeWidth={RING_STROKE}
                strokeLinecap="butt"
              />
            )
          )}
        </svg>
        {/* S-DEAL-LAYOUT-1 (задача 6): «1 из 5» читалось оценкой по пятибалльной
            (числитель — здоровье, больше = лучше — унаследовано от отклонённого
            score W2). Здесь числитель — ПОМЕХИ, знак противоположный: заменён
            на число + слово по числу, «из {total}» (знаменатель) убран —
            разрез по сигналам уже несёт пятиполосная шкала справа и строка
            «N критичный · M внимание» под ней (`countsCaption`). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          {ring.problems === 0 ? (
            <span className="text-sm font-bold leading-none text-text-main">в норме</span>
          ) : (
            <>
              <span className="text-2xl font-bold leading-none tabular-nums text-text-main">
                {ring.problems}
              </span>
              <span className="mt-1 text-meta leading-none text-text-dim">
                {pluralProblems(ring.problems)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1" aria-hidden>
        <p className="text-body text-text-dim">Здоровье сделки</p>
        {verdict && (
          <div className="mt-1.5">
            <DealVerdictChip verdict={verdict} />
          </div>
        )}
        {/* Порядок долек = порядок строк списка ниже: полоса — легенда к нему. */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {ring.states.map((state, i) => (
            <span
              key={i}
              className="h-1.5 min-w-0 flex-1 rounded-full"
              style={{ background: STATE_STROKE[state] }}
            />
          ))}
        </div>
        <p className="mt-2 text-meta leading-snug text-text-dim">{caption}</p>
      </div>
    </div>
  );
}
