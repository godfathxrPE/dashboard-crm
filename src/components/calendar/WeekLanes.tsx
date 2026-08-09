'use client';

import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Flag } from 'lucide-react';
import type { Task } from '@/types/entities';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import { KIND_META } from '@/lib/timeline/kind-meta';
import { mskDateKey, mskMinutesOfDay, mskTime } from '@/lib/utils/date-helpers';
import { formatFreeWindow, type TimedInterval } from '@/lib/domain/day-windows';
import { packLane, laneRows, chipSpanMinutes, CHIP_NOMINAL_MIN, CHIP_COMPRESSED_MIN, type PackedChip } from '@/lib/domain/lane-packing';
import {
  START_HOUR, END_HOUR, START_MIN, END_MIN, MEETING_NOMINAL_MIN, clamp, timeToMin,
} from '@/components/calendar/grid-core';

// ═══════════════════════════════════════════════════════
// S-CAL-LANES-1: неделя как горизонтальная лента (вариант C).
//
// Дни — строки, время — горизонталь, события — пилюли-чипы. Пришло на смену
// вертикальной сетке 07–22: на реальной плотности данных org (14 звонков,
// 1 встреча, единицы задач с временем) та давала 90% пустых пикселей и скролл.
// Здесь неделя видна целиком, свободные окна — буквально пустые места, а слева
// «паспорт дня»: дата, счётчик и главное окно (домен `lib/domain/day-windows`).
//
// Ось — та же, что у сетки: START_HOUR..END_HOUR из grid-core. Ось проекта одна,
// 08–20 макета сюда не переносится — иначе события 07:xx и 21:xx исчезли бы.
//
// Drag в v1 нет намеренно (см. спеку): время правится в тех же модалках, что
// открываются кликом по чипу. Горизонтальный перенос — S-CAL-LANES-2.
// ═══════════════════════════════════════════════════════

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Ширина паспорта дня. Тот же rem — в gridTemplateColumns и в позиции линии «сейчас». */
const INFO_REM = 9;

/** Полуширина плашки «сейчас» в долях оси: подпись часа под ней прячется.
 *  Плашка ~2.6rem при дорожке ≥47rem → ~2.8% оси, берём с запасом. */
const NOW_LABEL_HALF_FRAC = 0.02;
const AXIS_MIN = END_MIN - START_MIN;

/** Звонок в схеме без длительности → номинал для упаковки (duration_s, если есть). */
const CALL_NOMINAL_MIN = 30;
/** Задача без scheduled_end — час, как и в прежней сетке. */
const TASK_NOMINAL_MIN = 60;
/** Насколько «широк» по оси чип без времени (дедлайн, встреча без `time`) — только
 *  чтобы упаковка не считала его точкой и не сажала на него соседний чип. */
const CHIP_ANCHOR_MIN = 60;

type LaneKind = 'call' | 'meeting' | 'task' | 'deadline';

interface LaneEvent {
  key: string;
  kind: LaneKind;
  /** id исходной записи — с ним родитель открывает нужную модалку. */
  refId: string;
  title: string;
  /** null — событие без времени (дедлайн сделки, встреча без `time`). */
  timeLabel: string | null;
  startMin: number;
  endMin: number;
  /** Критичный приоритет задачи — бордер и текст `--danger` поверх цвета вида. */
  critical: boolean;
}

/** Дедлайн сделки на дне недели. Собирается родителем из того же `useProjects`,
 *  что и месячный вид — второго запроса не заводим. */
export interface LaneDeadline {
  id: string;
  title: string;
  /** Календарный день МСК, YYYY-MM-DD. */
  dateKey: string;
}

interface WeekLanesProps {
  /** Понедельник отображаемой недели (локальная полночь). */
  weekStart: Date;
  /** Задачи недели: scheduled_start задан + isMine. */
  tasks: Task[];
  /** Задачи недели БЕЗ времени (срок в этом дне) — счётчиком в паспорте дня. */
  undatedTasks: Task[];
  meetings: Meeting[];
  calls: Call[];
  deadlines: LaneDeadline[];
  onSlotClick: (dayDate: Date, hour: number) => void;
  onBlockClick: (taskId: string) => void;
  onMeetingClick: (meetingId: string) => void;
  onCallClick: (callId: string) => void;
  onDeadlineClick: (projectId: string) => void;
}

const KIND_LABEL: Record<LaneKind, string> = {
  call: 'Звонок',
  meeting: 'Встреча',
  task: 'Задача',
  deadline: 'Дедлайн сделки',
};

// Цветовая пара чипа — из KIND_META, единственной карты «вид → иконка и цвет»
// в проекте (её же читают лента сущности и виджет дашборда). Своей карты здесь
// нет и не заводится: две уже сливали в одну, третья разошлась бы молча.
// `deadline` — не TimelineKind (дедлайн сделки не событие ленты), поэтому у него
// одного пара задана явно: тревожный тинт + Flag, как в спеке.
const DEADLINE_META = { icon: Flag, dot: 'bg-danger-l', fg: 'text-danger-text' } as const;

const chipMeta = (kind: LaneKind) => (kind === 'deadline' ? DEADLINE_META : KIND_META[kind]);

export function WeekLanes({
  weekStart, tasks, undatedTasks, meetings, calls, deadlines,
  onSlotClick, onBlockClick, onMeetingClick, onCallClick, onDeadlineClick,
}: WeekLanesProps) {
  // 7 дней: локальная полночь (для onSlotClick) + MSK-ключ (для матча событий).
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
        return { date: d, key: mskDateKey(d), weekend: i >= 5 };
      }),
    [weekStart],
  );

  // Ширина чипа в минутах оси — из фактической ширины дорожки, не константой
  // (см. шапку lane-packing.ts: константа давала наложение на узком экране).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chipSpan, setChipSpan] = useState({ full: CHIP_NOMINAL_MIN, compressed: CHIP_COMPRESSED_MIN });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // Полотно = ширина обёртки минус паспорт дня. Обёртка имеет minWidth 56rem,
      // поэтому при узком окне здесь окажется 56rem, а не ширина вьюпорта — то же
      // число, что видит верстка, а не то, что видит window.
      const lanePx = entry.contentRect.width - INFO_REM * rootFontPx;
      setChipSpan(chipSpanMinutes(lanePx, AXIS_MIN, rootFontPx));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const perDay = useMemo(() => {
    const buckets: Record<string, LaneEvent[]> = {};
    const push = (key: string, ev: LaneEvent) => { (buckets[key] ??= []).push(ev); };
    const fit = (start: number, end: number) => ({
      startMin: clamp(start, START_MIN, END_MIN),
      endMin: clamp(Math.max(end, start + 1), START_MIN, END_MIN),
    });

    for (const c of calls) {
      if (!c.date) continue;
      const start = mskMinutesOfDay(c.date);
      const durMin = c.duration_s ? Math.round(c.duration_s / 60) : CALL_NOMINAL_MIN;
      push(mskDateKey(c.date), {
        key: `call-${c.id}`, kind: 'call', refId: c.id,
        title: c.contact
          ? `${c.contact.first_name} ${c.contact.last_name}`
          : c.company?.name ?? 'Звонок',
        timeLabel: mskTime(c.date),
        ...fit(start, start + durMin),
        critical: false,
      });
    }

    // Встречи: день — `date.slice(0,10)`, время — naive `time` (прямой парс, не ISO).
    // Без времени встреча не теряется: чип прижимается к левому краю, как дедлайн.
    for (const m of meetings) {
      const key = m.date?.slice(0, 10);
      if (!key) continue;
      const s = timeToMin(m.time);
      push(key, {
        key: `meeting-${m.id}`, kind: 'meeting', refId: m.id, title: m.title,
        timeLabel: s === null ? null : (m.time?.slice(0, 5) ?? null),
        ...fit(s ?? START_MIN, (s ?? START_MIN) + MEETING_NOMINAL_MIN),
        critical: false,
      });
    }

    for (const t of tasks) {
      if (!t.scheduled_start) continue;
      const start = mskMinutesOfDay(t.scheduled_start);
      const end = t.scheduled_end ? mskMinutesOfDay(t.scheduled_end) : start + TASK_NOMINAL_MIN;
      push(mskDateKey(t.scheduled_start), {
        key: `task-${t.id}`, kind: 'task', refId: t.id, title: t.text,
        timeLabel: mskTime(t.scheduled_start),
        ...fit(start, end),
        critical: t.priority === 'critical',
      });
    }

    for (const d of deadlines) {
      push(d.dateKey, {
        key: `deadline-${d.id}`, kind: 'deadline', refId: d.id,
        title: `${d.title} — дедлайн`, timeLabel: null,
        ...fit(START_MIN, START_MIN + CHIP_ANCHOR_MIN),
        critical: false,
      });
    }

    // Упаковка — по пиксельной коллизии, не по временной (см. lane-packing).
    const out: Record<string, PackedChip<LaneEvent>[]> = {};
    for (const key of Object.keys(buckets)) {
      out[key] = packLane(
        buckets[key].map((ev) => ({ item: ev, startMin: ev.startMin, endMin: ev.endMin })),
        chipSpan.full,
        chipSpan.compressed,
      );
    }
    return out;
  }, [calls, meetings, tasks, deadlines, chipSpan]);

  // Задачи без времени — счётчиком в паспорте, по дню срока.
  const undatedPerDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of undatedTasks) {
      if (!t.deadline) continue;
      const key = mskDateKey(t.deadline);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [undatedTasks]);

  // «Сегодня» и линия «сейчас» — по МСК, как вся календарная ось проекта.
  const now = new Date();
  const todayKey = mskDateKey(now);
  const nowMin = mskMinutesOfDay(now.toISOString());
  const showNow = days.some((d) => d.key === todayKey) && nowMin >= START_MIN && nowMin <= END_MIN;
  const nowFrac = (nowMin - START_MIN) / AXIS_MIN;

  const gridCols = `${INFO_REM}rem 1fr`;
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const pctOfMin = (min: number) => ((min - START_MIN) / AXIS_MIN) * 100;

  // Клик по пустому месту дорожки → создание на день+час (как было в сетке).
  function handleTrackClick(dayDate: Date, e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = clamp((e.clientX - rect.left) / rect.width, 0, 0.999);
    const hour = Math.floor((START_MIN + frac * AXIS_MIN) / 60);
    onSlotClick(dayDate, clamp(hour, START_HOUR, END_HOUR - 1));
  }

  function openChip(ev: LaneEvent) {
    if (ev.kind === 'call') return onCallClick(ev.refId);
    if (ev.kind === 'meeting') return onMeetingClick(ev.refId);
    if (ev.kind === 'deadline') return onDeadlineClick(ev.refId);
    return onBlockClick(ev.refId);
  }

  return (
    <div
      ref={wrapRef}
      style={{
        minWidth: '56rem',
        border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative' }}>
        {/* Ось часов над дорожками */}
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '0.5px solid var(--border)' }}>
          <div />
          <div style={{ position: 'relative', height: '1.5rem' }}>
            {hours.map((h, i) => {
              // Подпись часа, на которую наезжает метка «сейчас», прячем. Метка
              // (`HH:MM` на плашке) шире подписи и рисуется поверх — без этого
              // «15:42» и «16» сливались в нечитаемое пятно во всех семи темах
              // (смок 09.08). Порог — половина ширины плашки в долях оси.
              const hidden = showNow && Math.abs(pctOfMin(h * 60) / 100 - nowFrac) < NOW_LABEL_HALF_FRAC;
              return (
                <span
                  key={h}
                  aria-hidden={hidden || undefined}
                  style={{
                    position: 'absolute',
                    top: '0.2rem',
                    left: `${pctOfMin(h * 60)}%`,
                    // Первую подпись не центрируем — половина ушла бы за край дорожки.
                    transform: i === 0 ? 'none' : 'translateX(-50%)',
                    fontSize: '0.625rem',
                    color: 'var(--text-mute)',
                    fontVariantNumeric: 'tabular-nums',
                    visibility: hidden ? 'hidden' : undefined,
                  }}
                >
                  {String(h).padStart(2, '0')}
                </span>
              );
            })}
          </div>
        </div>

        {/* Дорожки дней */}
        {days.map((d, dayIndex) => {
          const packed = perDay[d.key] ?? [];
          const rows = laneRows(packed);
          const isToday = d.key === todayKey;
          const undated = undatedPerDay[d.key] ?? 0;

          const busy: TimedInterval[] = packed.map((p) => ({ startMin: p.startMin, endMin: p.endMin }));
          const windowLabel = d.weekend ? null : formatFreeWindow(busy);
          const trackRem = rows === 0 ? (d.weekend ? 2.4 : 3.4) : rows === 1 ? 3.4 : 4.2;

          return (
            <div
              key={d.key}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                borderBottom: dayIndex === 6 ? 'none' : '0.5px solid var(--border)',
                background: isToday ? 'var(--accent-l)' : d.weekend ? 'var(--surface2)' : 'transparent',
                boxShadow: isToday ? 'inset 3px 0 0 var(--accent)' : undefined,
              }}
            >
              {/* Паспорт дня */}
              <div style={{ padding: '0.6rem 0.75rem', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-mute)' }}>
                    {DAY_NAMES[dayIndex]}
                  </span>
                  <span style={{ fontSize: '1.0625rem', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text)' }}>
                    {d.date.getDate()}
                  </span>
                  {packed.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: 'var(--text-mute)', fontVariantNumeric: 'tabular-nums' }}>
                      {packed.length}
                    </span>
                  )}
                </div>
                {windowLabel && (
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-mute)', marginTop: '0.15rem' }}>
                    {windowLabel.prefix}
                    {windowLabel.value && (
                      <> <b style={{ color: 'var(--accent)', fontWeight: 600 }}>{windowLabel.value}</b></>
                    )}
                  </div>
                )}
                {undated > 0 && (
                  <div style={{ fontSize: '0.625rem', color: 'var(--text-mute)', marginTop: '0.15rem' }}>
                    +{undated} без времени
                  </div>
                )}
              </div>

              {/* Полотно дорожки */}
              <div style={{ position: 'relative', minHeight: `${trackRem}rem` }}>
                {/* Часовые вертикали — декор, кликам не мешают */}
                {hours.slice(1).map((h) => (
                  <span
                    key={h}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${pctOfMin(h * 60)}%`,
                      borderLeft: '0.5px solid var(--border)',
                      opacity: 0.6,
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {/* Слой создания: лежит ПОД чипами, поэтому клик по чипу его не задевает
                    (тот же приём, что был в прежней сетке со слотами-подложками). */}
                <div
                  onClick={(e) => handleTrackClick(d.date, e)}
                  style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 0 }}
                />

                {packed.map((p) => (
                  <Chip
                    key={p.item.key}
                    ev={p.item}
                    row={p.row}
                    rows={rows}
                    compressed={p.compressed}
                    leftPct={pctOfMin(Math.min(p.renderStartMin, END_MIN))}
                    onOpen={openChip}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Линия «сейчас» — одна вертикаль через все дорожки, от оси часов вниз */}
        {showNow && (
          <div
            style={{
              position: 'absolute',
              top: '1.5rem',
              bottom: 0,
              left: `calc(${INFO_REM}rem + (100% - ${INFO_REM}rem) * ${nowFrac})`,
              borderLeft: '2px solid var(--danger)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '-1.3rem',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--danger)',
                // Текст на плашке «сейчас»: `--on-accent` — единственный токен «контраст
                // к заливке» в проекте. На светлых темах он белый (на #c0392b 5.9:1),
                // на тёмных — тёмный, и danger там как раз светлый (#ff6090 → 7:1).
                // `--surface` сюда нельзя: в тёмных темах он полупрозрачный.
                color: 'var(--on-accent)',
                fontSize: '0.625rem',
                fontWeight: 600,
                padding: '0.1rem 0.3rem',
                borderRadius: 'var(--radius-s)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {mskTime(now.toISOString())}
            </span>
          </div>
        )}
      </div>

      {/* Легенда видов — из той же карты, что чипы */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          padding: '0.6rem 1rem',
          borderTop: '0.5px solid var(--border)',
          fontSize: '0.6875rem',
          color: 'var(--text-dim)',
          flexWrap: 'wrap',
        }}
      >
        {(['call', 'meeting', 'task', 'deadline'] as const).map((kind) => (
          <span key={kind} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <i
              className={chipMeta(kind).fg}
              style={{ width: '0.55rem', height: '0.55rem', borderRadius: '50%', background: 'currentColor' }}
            />
            {KIND_LABEL[kind]}
          </span>
        ))}
      </div>
    </div>
  );
}

interface ChipProps {
  ev: LaneEvent;
  row: 0 | 1;
  rows: 0 | 1 | 2;
  compressed: boolean;
  leftPct: number;
  onOpen: (ev: LaneEvent) => void;
}

// Позиция = время начала, вертикаль = ряд упаковки. Ширина — по содержимому
// (макет: пилюля), поэтому чип ограничен правым краем дорожки, а название режется
// ellipsis: чип, вылезший за край, спрятал бы конец недели под горизонтальный скролл.
function Chip({ ev, row, rows, compressed, leftPct, onOpen }: ChipProps) {
  const meta = chipMeta(ev.kind);
  const Icon = meta.icon;
  const topPct = rows === 2 ? (row === 0 ? 28 : 72) : 50;
  const label = `${KIND_LABEL[ev.kind]}${ev.timeLabel ? ` ${ev.timeLabel}` : ''}, ${ev.title}`;

  // ⚠️ Цвет вида несёт ИКОНКА, а не текст. `KIND_META.fg` подписан «цвет иконки»,
  // под графику (≥3:1), и подобран под неё: время на чипе — 11px, ему нужно 4.5:1,
  // а text-green давал 3.9:1, text-yellow 3.84:1 — на дорожке «сегодня» ещё ниже,
  // там тинт ложится на тинт. Текст берёт --text: 15:1 во всех семи темах.
  return (
    <button
      type="button"
      onClick={() => onOpen(ev)}
      aria-label={label}
      title={compressed ? label : undefined}
      className={`lane-chip ${meta.dot}`}
      style={{
        color: 'var(--text)',
        position: 'absolute',
        left: `${leftPct}%`,
        top: `${topPct}%`,
        // Пол в 4rem: у события в самом конце оси остаток ширины ушёл бы в минус
        // и чип схлопнулся бы в точку — пусть лучше выйдет за край и обрежется.
        maxWidth: `max(4rem, calc(${100 - leftPct}% - 0.5rem))`,
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: '0.25rem 0.6rem 0.25rem 0.45rem',
        borderRadius: '999px',
        border: ev.critical ? '1px solid var(--danger)' : '1px solid transparent',
        fontFamily: 'inherit',
        fontSize: '0.6875rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        zIndex: 1,
      }}
    >
      <Icon
        size={11}
        strokeWidth={2.2}
        className={ev.critical ? 'text-danger-text' : meta.fg}
        style={{ flexShrink: 0 }}
      />
      {ev.timeLabel && (
        <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{ev.timeLabel}</b>
      )}
      {!compressed && (
        <span
          style={{
            maxWidth: '11rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ev.title}
        </span>
      )}
    </button>
  );
}
