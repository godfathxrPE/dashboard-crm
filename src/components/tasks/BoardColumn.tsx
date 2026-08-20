'use client';

import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils/cn';
import { BoardCard } from './BoardCard';
import { BUCKET_LABELS, deadlineForBucket, type DateBucket } from '@/lib/utils/task-view';
import { mskDayCaption } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

/**
 * Заливка колонки — inline `style` семантическими токенами.
 *
 * ⚠️ `--accent-l` для «Сегодня» НЕ использовать. В `t-washi` `--accent` — тот же
 * торий `#C23B3B`, что и `--red` (Δhue = 0, так задумана тема), и две первые
 * колонки становятся одинаково красными. Пара `--danger` / `--info` различима во
 * всех семи темах, потому что палитра обязана держать `--red` и `--blue`
 * раздельно. Проверено на макете во всех 7 темах.
 */
const WELL: Partial<Record<DateBucket, string>> = {
  overdue: 'var(--danger-l)',
  today: 'var(--info-l)',
};

/**
 * Хром заливки колонки — для рамки и пунктира пустой зоны (Minimal v2).
 * Тинт без границы на сером canvas читается как пятно, а не как контейнер;
 * рамка берётся из ТОГО ЖЕ токена, что и заливка, — расходиться им нечем.
 * Нейтральные колонки (заливка `--surface2`) хрома не имеют → `--border`.
 */
const WELL_EDGE: Partial<Record<DateBucket, string>> = {
  overdue: 'var(--danger)',
  today: 'var(--info)',
};

/** Кап рендера на колонку. Виртуализации в проекте нет и не заводим: 373 задачи
 *  «Без даты» закрываются капом + кнопкой, которая называет остаток числом.
 *  Молчаливого усечения быть не должно. */
const PAGE = 50;

interface BoardColumnProps {
  bucket: DateBucket;
  tasks: Task[];
  now: Date;
  onEdit: (task: Task) => void;
  canEdit: boolean;
  /** Клавиатурный фокус доски (`useBoardNav`); визуальный, без DOM-фокуса. */
  focusedId?: string | null;
}

export function BoardColumn({ bucket, tasks, now, onEdit, canEdit, focusedId }: BoardColumnProps) {
  const [shown, setShown] = useState(PAGE);

  // Дроп-цель и подпись берутся из ОДНОЙ функции: подпись «до вс, 16 авг» не
  // может разойтись с тем, что реально запишется, — они один и тот же вызов.
  const drop = deadlineForBucket(bucket, now);
  const droppable = drop !== null;
  const isBacklog = bucket === 'no_date';

  // ⚠️ `disabled: !droppable` здесь НЕЛЬЗЯ, хотя просится. dnd-kit убирает
  // отключённый droppable из collision detection целиком — и дроп, нацеленный
  // в «Просрочено», молча проваливается в БЛИЖАЙШУЮ включённую колонку:
  // на смоке карточка из «Завтра» уехала в «Сегодня» и ушёл PATCH с сегодняшним
  // сроком. Колонка обязана оставаться приёмником и ПОГЛОЩАТЬ дроп; отказ
  // решает `deadlineForBucket === null` в `TaskBoard.onDragEnd`.
  const { setNodeRef, isOver } = useDroppable({ id: bucket });
  // Подсветку даём только там, где дроп реально состоится: иначе рамка обещает
  // действие, которое будет отклонено.
  const showDropHint = isOver && droppable;

  // Подпись — только у датовых бакетов: у «Просрочено» и «Позже» дня нет,
  // у «Без даты» вместо подписи подсказка про разбор. Форматтер общий с
  // карточкой (`mskDayCaption`) — шапка и карточка обязаны называть один день.
  const caption =
    drop?.deadline && (bucket === 'today' || bucket === 'tomorrow' || bucket === 'this_week')
      ? (bucket === 'this_week' ? 'до ' : '') + mskDayCaption(drop.deadline, { weekday: true })
      : null;

  // Кап рендера и клавиатура обязаны договориться: `moveFocus` ходит по ВСЕМУ
  // набору колонки, а рисуются первые `shown`. Без этого `j` за 50-ю карточку
  // уводил бы фокус в нерендеренную строку — визуально он просто исчезает, и
  // Enter открывает «непонятно что». Раскрываем ровно до нужной карточки.
  const focusRow = focusedId ? tasks.findIndex((t) => t.id === focusedId) : -1;
  useEffect(() => {
    if (focusRow >= shown) setShown(focusRow + 1);
  }, [focusRow, shown]);

  const visible = tasks.slice(0, Math.max(shown, focusRow + 1));
  const rest = tasks.length - visible.length;

  // Рамка колонки и пунктир пустой зоны — один хром, разная плотность.
  const edge = WELL_EDGE[bucket];
  const edgeSoft = edge ? `color-mix(in srgb, ${edge} 18%, transparent)` : 'var(--border)';
  const edgeDash = edge ? `color-mix(in srgb, ${edge} 45%, transparent)` : 'var(--border2)';

  return (
    <section
      ref={setNodeRef}
      data-col={bucket}
      className={cn(
        'flex min-h-0 flex-none flex-col px-2 pb-2 pt-1',
        isBacklog ? 'ml-1 w-[302px] border border-dashed border-border2' : 'w-72',
      )}
      style={{
        borderRadius: 'var(--radius-l)',
        // «Без даты» — зона разбора: пунктирная рамка без заливки.
        background: isBacklog ? 'transparent' : (WELL[bucket] ?? 'var(--surface2)'),
        // Рамка — только у залитых колонок; у «Без даты» пунктир уже в классах.
        border: isBacklog ? undefined : `1px solid ${edgeSoft}`,
      }}
    >
      {/* Шапка */}
      <header className="flex flex-none items-baseline gap-[7px] px-1 py-2">
        <h3 className="text-body font-semibold text-text-dim">{BUCKET_LABELS[bucket]}</h3>
        <span className="text-xs tabular-nums text-text-mute">{tasks.length}</span>
        {caption && <span className="ml-auto text-meta tabular-nums text-text-mute">{caption}</span>}
      </header>

      {isBacklog && (
        <p className="flex-none px-1 pb-2 text-meta leading-normal text-text-mute">
          Перетащи на день — срок поставится сам.
        </p>
      )}

      {/* Тело: свой скролл по Y. Подсветка приёмника — на теле (как в макете). */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-1.5 pt-0.5"
        style={
          showDropHint
            ? {
                borderRadius: 'var(--radius)',
                background: 'var(--accent-l)',
                outline: '1px dashed var(--accent-text)',
                outlineOffset: '-1px',
              }
            : undefined
        }
      >
        {visible.map((t) => (
          <BoardCard
            key={t.id}
            task={t}
            bucket={bucket}
            now={now}
            onEdit={onEdit}
            canEdit={canEdit}
            focused={focusedId === t.id}
          />
        ))}

        {tasks.length === 0 && (
          <div
            data-kanban-empty
            className="flex h-20 items-center justify-center rounded border-dashed
                       px-3 text-center text-xs text-text-mute"
            style={{ borderWidth: '1.5px', borderStyle: 'dashed', borderColor: edgeDash }}
          >
            {/* Недроппабельные («Просрочено», схлопнутая «Эта неделя») зовут в
                несуществующее действие — им текста не даём, просто пусто. */}
            {droppable ? 'Пусто — перетащи сюда' : null}
          </div>
        )}

        {rest > 0 && (
          <button
            type="button"
            onClick={() => setShown(tasks.length)}
            className="flex-none rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent-l"
            style={{ color: 'var(--accent-text)' }}
          >
            Показать ещё {rest}
          </button>
        )}
      </div>
    </section>
  );
}
