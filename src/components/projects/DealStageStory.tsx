'use client';

import { Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { useStageStory, STAGE_JOURNAL_SINCE } from '@/lib/hooks/use-stage-story';
import { revisitedStageIds, visitCount, type StageSegment } from '@/lib/domain/stage-story';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// S-STAGE-STORY-1: вкладка «История» карточки сделки.
//
// ⚠️ Это СВОДКА, а не второй пересказ ленты. Перечисление изменений полей живёт
// в Активности с 087 (`describeEvent`), дублировать его здесь значило бы завести
// второе место для одного факта. Здесь только то, чего в ленте нет: длительность
// каждого захода в стадию, суммарное время при повторных заходах, счётчик
// возвратов и переносы дедлайна.
// ═══════════════════════════════════════════════════════

export function DealStageStory({ project }: { project: Project }) {
  const { story, deadlineMoves, actorName, isLoading, isEmptyJournal } = useStageStory(project);

  if (isLoading || !story) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-text-mute" />
      </div>
    );
  }

  // Стадии у проекта нет вовсе (не заведена воронка) — сегментов ноль, и считать
  // нечего: единственный честный экран.
  if (story.segments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-body text-text-mute">
        У сделки не задана стадия — истории переходов нет.
      </div>
    );
  }

  const passed = story.segments.filter((s) => s.leftAt !== null).length;
  const revisited = revisitedStageIds(story);
  // Сумма по стадии печатается ОДИН раз — под последним её заходом. Печатать её у
  // каждого вхождения значило бы повторить одно число столько раз, сколько было
  // возвратов.
  const lastIndexOfStage = new Map<string, number>();
  story.segments.forEach((s, i) => lastIndexOfStage.set(s.stageId, i));

  return (
    <div className="mb-4 space-y-3">
      {/* ═══ Сводка ═══ */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3">
        <Stat label="В работе" value={`${story.ageDays} дн.`} />
        <Stat label="Стадий пройдено" value={String(passed)} />
        {/* Возвраты — исключение, а не норма: у пяти сделок из шести число ноль,
            и постоянный «Возвратов 0» читался бы как метрика, за которой следят. */}
        {story.revisits > 0 && <Stat label="Возвратов" value={String(story.revisits)} accent />}
        {deadlineMoves.count > 0 && (
          <Stat
            label="Дедлайн переносился"
            value={`×${deadlineMoves.count}`}
            hint={deadlineMoves.lastAt ? `Последний перенос — ${formatDateShort(deadlineMoves.lastAt)}` : undefined}
          />
        )}
      </div>

      {/* ═══ Пустой журнал — честная оговорка, а не пустая рамка ═══ */}
      {isEmptyJournal && (
        <p className="px-1 text-meta text-text-mute">
          Переходов по стадиям пока нет. Журнал ведётся с {STAGE_JOURNAL_SINCE}.
        </p>
      )}

      {/* ═══ Лента сегментов ═══ */}
      <ol className="overflow-hidden rounded-xl border border-border bg-surface">
        {story.segments.map((seg, i) => (
          <SegmentRow
            key={`${seg.stageId}-${seg.enteredAt}-${i}`}
            seg={seg}
            actor={actorName(seg.actorId)}
            last={i === story.segments.length - 1}
            totalDays={
              revisited.has(seg.stageId) && lastIndexOfStage.get(seg.stageId) === i
                ? story.totalByStage[seg.stageId]
                : null
            }
            visits={visitCount(story, seg.stageId)}
          />
        ))}
      </ol>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="text-meta uppercase tracking-wider text-text-mute">{label}</div>
      <div
        className={cn('text-lg font-semibold tabular-nums', !accent && 'text-text-main')}
        // Тот же приём, что в PipelineCockpit: `--yellow-text` с фолбэком на палитру —
        // в тёмных темах читаемый текст ≠ заливка того же семейства.
        style={accent ? { color: 'var(--yellow-text, var(--yellow))' } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Одна строка ленты. Открытый сегмент (`leftAt === null`) — текущая позиция
 * сделки: подсвечен левой кромкой акцентом, тем же, каким текущая стадия помечена
 * в кокпите и карте воронки. Это указатель «вы здесь», а не сигнал состояния —
 * семантика good/bad живёт на `--green`/`--yellow`/`--red`.
 */
function SegmentRow({
  seg,
  actor,
  last,
  totalDays,
  visits,
}: {
  seg: StageSegment;
  actor: string | null;
  last: boolean;
  totalDays: number | null;
  visits: number;
}) {
  const open = seg.leftAt === null;
  const period = open
    ? `с ${formatDateShort(seg.enteredAt)}`
    : `${formatDateShort(seg.enteredAt)} — ${formatDateShort(seg.leftAt!)}`;

  return (
    <li
      className={cn(
        'flex min-h-[2.375rem] flex-wrap items-center gap-x-3 gap-y-1 border-l-2 px-3 py-2',
        open ? 'border-l-accent bg-surface2' : 'border-l-transparent',
        !last && 'border-b border-b-border',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-body font-medium text-text-main">
        {seg.stageName}
      </span>

      {seg.isRevisit && (
        <span
          title="Сделка вернулась в уже пройденную стадию"
          className="inline-flex items-center gap-1 rounded-full border border-border2 px-1.5 py-0.5 text-meta text-text-mute"
        >
          <RotateCcw size={10} aria-hidden />
          повторно
        </span>
      )}

      <span className="text-meta tabular-nums text-text-mute" title={seg.fromCreation ? 'Первый сегмент открыт датой создания сделки: журнал переходов не пишет вход в первую стадию' : undefined}>
        {seg.fromCreation ? 'с создания · ' : ''}
        {period}
      </span>

      <span className="w-16 text-right text-body tabular-nums text-text-dim">{seg.days} дн.</span>

      <span className="w-28 truncate text-right text-meta text-text-mute" title={actor ?? undefined}>
        {actor ?? ''}
      </span>

      {/* Суммарное время — только у стадий с повторными заходами: иначе это дубль
          длительности того же сегмента. Строка идёт ПОСЛЕДНЕЙ и на всю ширину:
          поставленная выше, она уводила имя актора на отдельную строку. */}
      {totalDays !== null && (
        <span className="w-full text-meta tabular-nums text-text-mute">
          {totalDays} дн. суммарно за {visits} {visitsWord(visits)}
        </span>
      )}
    </li>
  );
}

/** «заход/захода/заходов» — счётчик читается как фраза, а не как код. */
function visitsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заход';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'захода';
  return 'заходов';
}
