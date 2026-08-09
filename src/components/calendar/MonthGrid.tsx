'use client';

import { useMemo } from 'react';
import { Flag } from 'lucide-react';
import { EventChip } from '@/components/calendar/EventChip';
import { sliceCellChips, pluralEvents, type MonthDeadline } from '@/lib/domain/month-cells';
import type { CalEvent } from '@/components/calendar/cal-event';
import { chipKindOf, chipTimeLabel } from '@/components/calendar/cal-event';

// ═══════════════════════════════════════════════════════
// S-CAL-MONTH-1: месяц как сетка чипов.
//
// Прежняя ячейка несла счётчик («5» под числом) и уголок-треугольник: оба
// отвечали «событие есть», ни один — «какое», а список дня жил в панели справа
// на 320px, то есть по умолчанию четверть экрана была пустой. Теперь события
// видно прямо в дне, панель уехала в peek (`DayPeek`), сетка занимает всю ширину.
//
// Чип здесь тот же `EventChip`, что на дорожке недели, — раскладкой `cell`.
// Второй рукописный чип разошёлся бы с первым, как расходились две карты видов
// до S-TL-4.
// ═══════════════════════════════════════════════════════

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Высота ячейки: кружок даты + до трёх чипов. Меньше — чипы начинают резаться. */
const CELL_MIN_REM = 6.75;

interface MonthGridProps {
  year: number;
  month: number;
  /** Ключ сегодняшнего дня, YYYY-MM-DD. */
  todayKey: string;
  /** День, открытый в peek (`data-selected` на ячейке), или null. */
  selectedKey: string | null;
  eventsByDay: Record<string, CalEvent[]>;
  /** Дедлайны сделок месяца для фокус-полосы; пустой массив — полосы нет вовсе. */
  deadlines: MonthDeadline[];
  onSelectDay: (dateKey: string) => void;
  onOpenEvent: (ev: CalEvent) => void;
}

export function MonthGrid({
  year, month, todayKey, selectedKey, eventsByDay, deadlines, onSelectDay, onOpenEvent,
}: MonthGridProps) {
  // S-CAL-MONTH-2: сетка считается ПРЯМОУГОЛЬНИКОМ из полных недель — заглушки
  // до первого числа и после последнего попадают в тот же массив. При hairline
  // это не косметика: без хвостовых заглушек линии оборвались бы посреди
  // последней недели, а месяц кончался бы ступенькой.
  const cells = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const offset = firstDow === 0 ? 6 : firstDow - 1; // сетка с понедельника
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;

    return Array.from({ length: total }, (_, i) => {
      const col = i % 7;
      const day = i - offset + 1;
      const inMonth = day >= 1 && day <= daysInMonth;
      return {
        i,
        // Колонки 5 и 6 при раскладке с понедельника — всегда Сб и Вс, дату
        // для этого разбирать не нужно.
        weekend: col >= 5,
        lastCol: col === 6,
        lastRow: i >= total - 7,
        day: inMonth ? day : null,
        key: inMonth
          ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          : null,
      };
    });
  }, [year, month]);

  return (
    <div>
      {deadlines.length > 0 && (
        <FocusStrip deadlines={deadlines} onSelectDay={onSelectDay} />
      )}

      {/* Контейнер сетки: внешняя рамка и радиус живут здесь, у ячеек только
          внутренние линии. Иначе крайние hairline висели бы в воздухе, а углы
          сетки торчали бы из-под скругления. `overflow: hidden` их подрезает. */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {/* Шапка Пн…Вс — заголовок таблицы: разделители между колонками и общая
            нижняя граница. Трек-функция обязана совпадать с сеткой ниже. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              style={{
                fontSize: 11, color: 'var(--text-mute)', padding: '6px 0',
                fontWeight: 500, letterSpacing: '0.03em',
                borderRight: i === 6 ? undefined : '1px solid var(--border)',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* ⚠️ `1fr` здесь НЕЛЬЗЯ: это minmax(auto, 1fr), а `auto` у grid item — это его
            min-content. Чип несёт название в одну строку (nowrap + ellipsis), и его
            min-content тянет колонку вширь: замер в Chromium 09.08 при viewport 1280 —
            колонка с чипами 242px против 163px у соседних. Дни разной ширины, а шапка
            Пн…Вс (сетка без содержимого) остаётся равномерной — подписи перестают
            стоять над своими столбцами. minmax(0, 1fr) снимает нижнюю границу, и
            лишнее уходит в ellipsis, как и задумано.
            ⚠️ `gap` нет и быть не должно: hairline рисуется границами ячеек, а зазор
            между ними разрезал бы линии на пунктир. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {cells.map((cell) => {
            const edges = {
              borderRight: cell.lastCol ? undefined : '1px solid var(--border)',
              borderBottom: cell.lastRow ? undefined : '1px solid var(--border)',
            };

            // Заглушка недели: линии и фон выходного те же, но это не день —
            // ни курсора, ни фокуса, ни обработчиков, ни `data-cal-day`
            // (по нему peek отличает «клик по другому дню» от «клика мимо»).
            if (cell.key === null) {
              return (
                <div
                  key={`blank-${cell.i}`}
                  aria-hidden
                  style={{
                    minHeight: `${CELL_MIN_REM}rem`,
                    background: cell.weekend ? 'var(--surface2)' : undefined,
                    ...edges,
                  }}
                />
              );
            }

            const key = cell.key;
            const events = eventsByDay[key] ?? [];
            const { visible, hiddenCount } = sliceCellChips(events);
            const isToday = key === todayKey;
            const isSel = key === selectedKey;

            return (
            <div
              key={key}
              // Роль кнопки, а не <button>: внутри ячейки лежат кнопки чипов, а
              // вложенная в button кнопка — невалидный HTML (браузер разорвёт
              // разметку, и чипы окажутся вне ячейки).
              role="button"
              tabIndex={0}
              aria-label={`${cell.day} число, ${pluralEvents(events.length)}`}
              onClick={() => onSelectDay(key)}
              onKeyDown={(e) => {
                // Только со самой ячейки: Enter на чипе внутри неё открывает
                // событие, и всплывший keydown открыл бы поверх ещё и peek.
                if (e.target !== e.currentTarget) return;
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                onSelectDay(key);
              }}
              className="cal-day"
              data-cal-day
              data-today={isToday ? '' : undefined}
              data-selected={isSel ? '' : undefined}
              data-weekend={cell.weekend ? '' : undefined}
              data-has-event={events.length > 0 ? '' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
                padding: '0.3rem 0.3rem 0.35rem',
                minHeight: `${CELL_MIN_REM}rem`,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
                ...edges,
                // ⚠️ Фон и кольцо дня — В CSS (globals.css, `.cal-day[...]`), не тут.
                // Инлайновый `background` выигрывает у любого правила таблицы стилей
                // без `!important`, то есть заглушил бы `:hover` — ровно поэтому у
                // прежнего аура-правила стоял `!important`. Состояния и ховер живут
                // одним слоем, иначе ховер снова окажется темо-специфичным.
              }}
            >
              <span
                className="cal-day-num"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.5rem',
                  height: '1.5rem',
                  flexShrink: 0,
                  borderRadius: '999px',
                  fontSize: '0.8125rem',
                  fontWeight: isToday ? 600 : 400,
                  fontVariantNumeric: 'tabular-nums',
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? 'var(--on-accent)' : 'var(--text)',
                }}
              >
                {cell.day}
              </span>

              {visible.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
                  {visible.map((ev) => (
                    <EventChip
                      key={`${ev.kind}-${ev.id}`}
                      layout="cell"
                      kind={chipKindOf(ev.kind)}
                      title={ev.title}
                      timeLabel={chipTimeLabel(ev)}
                      // Клик по чипу — модалка события, а не peek дня: ячейка
                      // слушает клик на себе и поймала бы всплытие.
                      onClick={(e) => { e.stopPropagation(); onOpenEvent(ev); }}
                      style={{ position: 'relative', zIndex: 1 }}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--accent)', paddingLeft: '0.3rem' }}>
                      +{hiddenCount} ещё
                    </span>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Полоса «Фокус месяца»: дедлайны сделок месяца одной строкой над сеткой. */
function FocusStrip({
  deadlines, onSelectDay,
}: { deadlines: MonthDeadline[]; onSelectDay: (dateKey: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        background: 'var(--surface2)',
        border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius-s)',
        padding: '0.5rem 0.75rem',
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-mute)' }}>
        Фокус месяца
      </span>
      {deadlines.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onSelectDay(d.dateKey)}
          title={`${d.title} — дедлайн ${d.day} числа${d.overdue ? ', просрочен' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            maxWidth: '16rem',
            background: 'transparent',
            border: 'none',
            padding: 0,
            fontFamily: 'inherit',
            fontSize: '0.6875rem',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <Flag size={11} strokeWidth={2.2} className="text-danger-text" style={{ flexShrink: 0 }} />
          <b
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: d.overdue ? 700 : 600,
              color: 'var(--danger-text)',
            }}
          >
            {d.day}
          </b>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              // Просроченный — тем же красным и весом, отдельного вида не заводим.
              color: d.overdue ? 'var(--danger-text)' : 'var(--text)',
              fontWeight: d.overdue ? 600 : 400,
            }}
          >
            {d.title}
          </span>
        </button>
      ))}
    </div>
  );
}
