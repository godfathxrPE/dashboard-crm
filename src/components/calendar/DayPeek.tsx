'use client';

import { Plus, Sparkles } from 'lucide-react';
import { PeekPanel } from '@/components/shared/PeekPanel';
import { chipMeta, CHIP_KIND_LABEL } from '@/components/calendar/EventChip';
import { chipKindOf, type CalEvent } from '@/components/calendar/cal-event';
import { formatFreeWindow, type TimedInterval } from '@/lib/domain/day-windows';
import { orderCellEvents, pluralEvents } from '@/lib/domain/month-cells';

// ═══════════════════════════════════════════════════════
// S-CAL-MONTH-1: паспорт дня вместо правой панели «Выберите дату».
//
// Панель на 320px висела рядом с сеткой всегда — по умолчанию пустая, с текстом
// «Выбери день слева». Список дня жил вдали от самого дня. Peek открывается по
// клику на ячейку, живёт на общем примитиве `PeekPanel` (Escape, клик мимо,
// возврат фокуса на ячейку) и говорит на языке недели: свободное окно из
// `day-windows`, счётчик, «+N без времени».
//
// `href` у панели нет намеренно: день не сущность, «Открыть полностью» вело бы
// в никуда — примитив с S-CAL-MONTH-1 умеет обходиться без ссылки.
// ═══════════════════════════════════════════════════════

const FULL_DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const FULL_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

interface DayPeekProps {
  /** День, YYYY-MM-DD. */
  dateKey: string;
  events: CalEvent[];
  onClose: () => void;
  onOpenEvent: (ev: CalEvent) => void;
  onOpenAi: (ev: CalEvent) => void;
  onCreateCall: () => void;
  onCreateMeeting: () => void;
  onCreateTask: () => void;
}

export function DayPeek({
  dateKey, events, onClose, onOpenEvent, onOpenAi,
  onCreateCall, onCreateMeeting, onCreateTask,
}: DayPeekProps) {
  // Заголовок из частей ключа, а не из `new Date(dateKey).getDate()`: строка
  // 'YYYY-MM-DD' парсится как UTC-полночь, и в MSK это уже следующий день —
  // ровно тот off-by-one, из-за которого календарные ключи в проекте МСК-шные.
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const title = `${FULL_DAYS[dow]}, ${d} ${FULL_MONTHS[m - 1]}`;

  // Порядок карточек — тот же, что у чипов ячейки (`orderCellEvents`): дедлайн
  // первым, дальше по времени. Класть их в другом порядке значит показать один
  // день двумя способами на одном экране.
  const ordered = orderCellEvents(events);

  const busy: TimedInterval[] = events
    .filter((e): e is CalEvent & { startMin: number; endMin: number } =>
      e.startMin !== null && e.endMin !== null)
    .map((e) => ({ startMin: e.startMin, endMin: e.endMin }));
  const windowLabel = formatFreeWindow(busy);
  const undated = events.length - busy.length;

  // `data-modal-overlay` в keepOpenSelector: модалка создания/правки лежит поверх
  // peek (z-50 против z-40), и клик внутри неё — не «клик мимо». Без этого peek
  // закрывался бы под открытой формой, теряя день, на который её открыли.
  return (
    <PeekPanel title={title} keepOpenSelector="[data-cal-day],[data-modal-overlay]" onClose={onClose}>
      <div className="mb-3 text-meta text-text-mute">
        {windowLabel.prefix}
        {windowLabel.value && <> <b className="font-semibold text-accent">{windowLabel.value}</b></>}
        {events.length > 0 && <> · {pluralEvents(events.length)}</>}
      </div>

      {undated > 0 && (
        <div className="-mt-2 mb-3 text-meta text-text-mute">+{undated} без времени</div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <CreateButton label="Звонок" onClick={onCreateCall} />
        <CreateButton label="Встреча" onClick={onCreateMeeting} />
        <CreateButton label="Задача" onClick={onCreateTask} />
      </div>

      {events.length === 0 ? (
        <div className="py-5 text-center text-meta text-text-mute">Нет событий</div>
      ) : (
        <div className="flex flex-col gap-2">
          {ordered.map((ev) => (
            <EventCard
              key={`${ev.kind}-${ev.id}`}
              ev={ev}
              onOpen={() => onOpenEvent(ev)}
              onAi={() => onOpenAi(ev)}
            />
          ))}
        </div>
      )}
    </PeekPanel>
  );
}

function CreateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta
                 text-text-dim transition-colors hover:border-accent hover:text-accent"
    >
      <Plus size={11} /> {label}
    </button>
  );
}

function EventCard({ ev, onOpen, onAi }: { ev: CalEvent; onOpen: () => void; onAi: () => void }) {
  const kind = chipKindOf(ev.kind);
  const meta = chipMeta(kind);
  const Icon = meta.icon;
  const aiable = ev.kind === 'call' || ev.kind === 'meeting';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Кнопка AI-анализа лежит внутри карточки: её Enter не должен вдобавок
        // открывать саму карточку.
        if (e.target !== e.currentTarget) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onOpen();
      }}
      className="cursor-pointer rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-hover"
    >
      <div className="mb-1 flex items-center gap-1.5">
        {/* Цвет вида несёт иконка, не текст — тот же уговор, что на чипах. */}
        <Icon size={13} strokeWidth={2.2} className={meta.fg} />
        <span className="text-meta font-medium uppercase tracking-wide text-text-mute">
          {CHIP_KIND_LABEL[kind]}
        </span>
        {aiable && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAi(); }}
            aria-label="AI-анализ"
            className="ml-auto inline-flex p-0.5 text-text-mute transition-colors hover:text-accent"
          >
            <Sparkles size={13} />
          </button>
        )}
        {ev.time && (
          <span className={`text-meta tabular-nums text-text-dim ${aiable ? 'ml-2' : 'ml-auto'}`}>
            {ev.time}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-text-main">{ev.title}</div>
      {ev.sub && <div className="mt-0.5 text-meta text-text-dim">{ev.sub}</div>}
    </div>
  );
}
