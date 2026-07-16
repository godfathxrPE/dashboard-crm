'use client';

import type * as React from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useProjectSchedule, type GanttTask } from '@/lib/hooks/use-project-schedule';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useUpdateTaskDates } from '@/lib/hooks/use-tasks';
import {
  useTaskDependencies,
  useCreateTaskDependency,
  useDeleteTaskDependency,
} from '@/lib/hooks/use-task-dependencies';
import { LANE_CONFIG } from '@/lib/validators/task';
import { DELIVERY_TASK_STATUS_LABELS } from '@/lib/constants/delivery-phases';
import {
  mskDateKey,
  bucketKeyOf,
  bucketIndexOf,
  buildBuckets,
  shiftDateKeyByBuckets,
  type GanttZoom,
} from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

interface GanttTimelineProps {
  projectId: string;
  onEditTask: (task: Task) => void;
}

type GanttFilter = 'open' | 'all' | 'milestones';

const LABEL_W = '12.5rem'; // колонка названий (rem — конвенция проекта, не px)
const ROW_H = '1.75rem';   // высота ряда — синхронно в левой колонке и таймлайне

const ZOOMS: { value: GanttZoom; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];
const FILTERS: { value: GanttFilter; label: string }[] = [
  { value: 'open', label: 'Открытые' },
  { value: 'all', label: 'Все' },
  { value: 'milestones', label: 'Вехи' },
];

// цвет бара/ромба по приоритету; done — приглушённо
function barClass(task: Task): string {
  if (task.lane === 'done') return 'bg-green';
  switch (task.priority) {
    case 'critical': return 'bg-red';
    case 'important': return 'bg-yellow';
    default: return 'bg-accent';
  }
}

// lane-статус с fallback: delivery → DELIVERY_TASK_STATUS_LABELS; иначе → LANE_CONFIG
function laneLabel(lane: Task['lane'], phaseMode: boolean): string {
  return phaseMode
    ? (DELIVERY_TASK_STATUS_LABELS[lane] ?? lane)
    : (LANE_CONFIG[lane]?.label ?? lane);
}

type Tip = { x: number; y: number; text: string; assignee: string; status: string };

const EDGE_PX = 6;    // ширина resize-зоны у краёв бара
const CLICK_PX = 4;   // смещение < порога = клик (открыть модалку), не drag

type DragMode = 'move' | 'left' | 'right';
type DragState = { mode: DragMode; startX: number; bucketPx: number; rawDx: number };

interface GanttBarProps {
  gt: GanttTask;
  zoom: GanttZoom;
  s: number;               // индекс стартового бакета
  e: number;               // индекс конечного бакета
  getBucketPx: () => number;
  onEditTask: (task: Task) => void;
  onDates: (v: { id: string; start_date: string; end_date: string }) => void;
  setTip: (t: Tip | null) => void;
  assignee: string;
  status: string;
  linkMode: boolean;               // S-DEPS-1: режим создания связей — drag отключён
  isLinkSource: boolean;           // подсвечен как выбранный predecessor
  onLinkSelect: (taskId: string) => void;
}

// Бар/ромб с drag-to-resize/move (нативные Pointer Events, без @dnd-kit).
// Живой фидбэк — CSS transform/width (снап к бакету); запись дат на pointerup.
// S-DEPS-1: в linkMode drag-хендлеры не навешиваются — клик выбирает конец связи.
function GanttBar({ gt, zoom, s, e, getBucketPx, onEditTask, onDates, setTip, assignee, status, linkMode, isLinkSource, onLinkSelect }: GanttBarProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const spanBuckets = e - s; // 0 у однобакетных / вех

  // снап + клэмп дельты по режиму (не даём инвертировать бар при resize)
  const clampDelta = useCallback(
    (raw: number, px: number, mode: DragMode) => {
      let bd = px > 0 ? Math.round(raw / px) : 0;
      if (mode === 'left') bd = Math.min(bd, spanBuckets);   // start не заходит за end
      else if (mode === 'right') bd = Math.max(bd, -spanBuckets); // end не заходит за start
      return bd;
    },
    [spanBuckets],
  );

  const commit = useCallback(
    (mode: DragMode, bd: number) => {
      let start = gt.start;
      let end = gt.end;
      if (gt.isMilestone) {
        start = end = shiftDateKeyByBuckets(gt.start, zoom, bd); // веха: start==end
      } else if (mode === 'move') {
        start = shiftDateKeyByBuckets(gt.start, zoom, bd);
        end = shiftDateKeyByBuckets(gt.end, zoom, bd);          // длительность сохраняется
      } else if (mode === 'left') {
        start = shiftDateKeyByBuckets(gt.start, zoom, bd);
        if (start > end) start = end;                           // клэмп CHECK tasks_dates_order_chk
      } else {
        end = shiftDateKeyByBuckets(gt.end, zoom, bd);
        if (end < start) end = start;
      }
      // Материализация deadline-only: gt.start/end уже вычислены effectiveSpan из
      // deadline → первый drag пишет явные start_date/end_date (фича, кормит KPI).
      onDates({ id: gt.task.id, start_date: start, end_date: end });
    },
    [gt, zoom, onDates],
  );

  const startDrag = useCallback(
    (ev: React.PointerEvent, mode: DragMode) => {
      ev.stopPropagation();
      ev.currentTarget.setPointerCapture(ev.pointerId);
      setDrag({ mode: gt.isMilestone ? 'move' : mode, startX: ev.clientX, bucketPx: getBucketPx(), rawDx: 0 });
    },
    [gt.isMilestone, getBucketPx],
  );
  const onMove = useCallback((ev: React.PointerEvent) => {
    setDrag((d) => (d ? { ...d, rawDx: ev.clientX - d.startX } : d));
  }, []);
  const onUp = useCallback(
    (ev: React.PointerEvent) => {
      try { ev.currentTarget.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      if (!drag) return;
      const { rawDx, bucketPx, mode } = drag;
      setDrag(null);
      if (Math.abs(rawDx) < CLICK_PX) {
        onEditTask(gt.task);                          // мелкое смещение = клик
        return;
      }
      const bd = clampDelta(rawDx, bucketPx, mode);
      if (bd !== 0) commit(mode, bd);                 // 0 бакетов = ни мутации, ни модалки
    },
    [drag, gt.task, onEditTask, clampDelta, commit],
  );
  const onCancel = useCallback((ev: React.PointerEvent) => {
    try { ev.currentTarget.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
    setDrag(null);
  }, []);

  // визуальный transform/width во время drag (снап к бакету)
  let transform: string | undefined;
  let width: string | undefined;
  if (drag) {
    const bd = clampDelta(drag.rawDx, drag.bucketPx, drag.mode);
    const dx = bd * drag.bucketPx;
    if (gt.isMilestone || drag.mode === 'move') transform = `translateX(${dx}px)`;
    else if (drag.mode === 'left') { transform = `translateX(${dx}px)`; width = `calc(100% - ${dx}px)`; }
    else width = `calc(100% + ${dx}px)`;
  }

  const showTip = (ev: React.MouseEvent) => setTip({ x: ev.clientX, y: ev.clientY, text: gt.task.text, assignee, status });
  const moveTip = (ev: React.MouseEvent) => setTip({ x: ev.clientX, y: ev.clientY, text: gt.task.text, assignee, status });
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (linkMode) onLinkSelect(gt.task.id); else onEditTask(gt.task);
    }
  };

  // В linkMode drag не навешиваем: клик выбирает конец связи (иначе конфликт с
  // click-vs-drag). Иначе — нативные Pointer Events VIEW-2.
  const dragHandlers = linkMode
    ? undefined
    : {
        onPointerDown: (ev: React.PointerEvent) => startDrag(ev, 'move'),
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onCancel,
      };
  const linkClick = linkMode ? { onClick: () => onLinkSelect(gt.task.id) } : undefined;
  const cursorClass = linkMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing';
  const ringClass = isLinkSource ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : '';

  return (
    <div
      className="relative"
      data-task-bar={gt.task.id}
      style={{ gridColumn: gt.isMilestone ? `${s + 1}` : `${s + 1} / ${e + 2}`, gridRow: 1 }}
    >
      {gt.isMilestone ? (
        <div
          role="button"
          tabIndex={0}
          {...dragHandlers}
          {...linkClick}
          onKeyDown={onKey}
          onMouseEnter={showTip}
          onMouseMove={moveTip}
          onMouseLeave={() => setTip(null)}
          className={`flex h-full w-full items-center justify-center ${cursorClass}`}
          style={{ transform: linkMode ? undefined : transform, touchAction: 'none' }}
          aria-label={`${gt.task.text} (веха): ${gt.start}`}
        >
          <span className={`inline-block h-2.5 w-2.5 rotate-45 rounded-[1px] ${barClass(gt.task)} ${ringClass}`} />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          {...dragHandlers}
          {...linkClick}
          onKeyDown={onKey}
          onMouseEnter={showTip}
          onMouseMove={moveTip}
          onMouseLeave={() => setTip(null)}
          className={`relative my-1 block h-4 w-full rounded ${cursorClass} ${barClass(gt.task)} ${ringClass} ${gt.task.lane === 'done' ? 'opacity-50' : 'opacity-90'} transition-opacity hover:opacity-100`}
          style={{ transform: linkMode ? undefined : transform, width: linkMode ? undefined : width, touchAction: 'none' }}
          aria-label={`${gt.task.text}: ${gt.start} → ${gt.end}`}
        >
          {/* resize-хендлы: только вне linkMode (перехватывают pointerdown у краёв) */}
          {!linkMode && (
            <>
              <span
                onPointerDown={(ev) => startDrag(ev, 'left')}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onCancel}
                className="absolute inset-y-0 left-0 cursor-ew-resize"
                style={{ width: EDGE_PX, touchAction: 'none' }}
                aria-hidden
              />
              <span
                onPointerDown={(ev) => startDrag(ev, 'right')}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onCancel}
                className="absolute inset-y-0 right-0 cursor-ew-resize"
                style={{ width: EDGE_PX, touchAction: 'none' }}
                aria-hidden
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function GanttTimeline({ projectId, onEditTask }: GanttTimelineProps) {
  const { swimlanes, undated, phaseMode, isLoading, isError } = useProjectSchedule(projectId);
  const { data: team = [] } = useTeamMembers();
  const updateDates = useUpdateTaskDates(projectId);
  const gridRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);   // S-DEPS-1: контекст для измерения стрелок
  const [zoom, setZoom] = useState<GanttZoom>('week');
  const [filter, setFilter] = useState<GanttFilter>('open');
  const [tip, setTip] = useState<Tip | null>(null);
  // S-DEPS-1: link-mode — тумблер создания связей + выбранный predecessor
  const [linkMode, setLinkMode] = useState(false);
  const [pendingPred, setPendingPred] = useState<string | null>(null);
  const [edges, setEdges] = useState<{ id: string; d: string }[]>([]); // измеренные пути стрелок

  const nameById = useMemo(() => new Map(team.map((m) => [m.id, m.full_name])), [team]);

  // S-DEPS-1: id всех задач проекта (dated + undated) — сужают RLS-выборку рёбер
  // (task_dependencies без своей project_id; оба конца IN taskIds ⇒ своё ребро).
  const allTaskIds = useMemo(() => {
    const ids = swimlanes.flatMap((sl) => sl.tasks.map((gt) => gt.task.id));
    for (const t of undated) ids.push(t.id);
    return ids;
  }, [swimlanes, undated]);

  const { data: dependencies = [] } = useTaskDependencies(projectId, allTaskIds);
  const createDep = useCreateTaskDependency(projectId);
  const deleteDep = useDeleteTaskDependency(projectId);

  const exitLinkMode = useCallback(() => {
    setLinkMode(false);
    setPendingPred(null);
  }, []);

  // Esc — выход из link-mode (и сброс выбранного predecessor)
  useLayoutEffect(() => {
    if (!linkMode) return;
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') exitLinkMode(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [linkMode, exitLinkMode]);

  // Клик по бару в link-mode: 1-й = predecessor, 2-й = successor → создаём FS-ребро
  const onLinkSelect = useCallback(
    (taskId: string) => {
      if (!pendingPred) { setPendingPred(taskId); return; }
      if (pendingPred === taskId) { setPendingPred(null); return; } // повторный клик — снять выбор
      createDep.mutate(
        { predecessor_id: pendingPred, successor_id: taskId },
        { onSettled: () => setPendingPred(null) },
      );
    },
    [pendingPred, createDep],
  );

  const filteredSwimlanes = useMemo(() => {
    const pred = (gt: GanttTask) =>
      filter === 'all' ? true : filter === 'milestones' ? gt.isMilestone : gt.task.lane !== 'done';
    return swimlanes.map((sl) => ({ ...sl, tasks: sl.tasks.filter(pred) }));
  }, [swimlanes, filter]);

  const filteredUndated = useMemo(() => {
    if (filter === 'milestones') return [];              // вехи без дат — не в этот фильтр (см. заметки гейта)
    if (filter === 'open') return undated.filter((t) => t.lane !== 'done');
    return undated;
  }, [undated, filter]);

  const model = useMemo(() => {
    const allTasks: GanttTask[] = filteredSwimlanes.flatMap((sl) => sl.tasks);
    if (allTasks.length === 0) {
      return { buckets: [] as { key: string; label: string }[], idxByKey: new Map<string, number>(), todayIdx: -1 };
    }
    const min = allTasks.reduce((m, t) => (t.start < m ? t.start : m), allTasks[0].start);
    const max = allTasks.reduce((m, t) => (t.end > m ? t.end : m), allTasks[0].end);
    const buckets = buildBuckets(min, max, zoom);
    const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
    const todayIdx = bucketIndexOf(mskDateKey(new Date()), zoom, buckets);
    return { buckets, idxByKey, todayIdx };
  }, [filteredSwimlanes, zoom]);

  // Ширина бакета в рантайме (сетка minmax(28px,1fr) — динамическая, хардкод нельзя).
  // Снимаем с шапки бакетов на каждый pointerdown.
  const getBucketPx = useCallback(() => {
    const w = gridRef.current?.getBoundingClientRect().width ?? 0;
    return model.buckets.length ? w / model.buckets.length : 0;
  }, [model.buckets.length]);

  // S-DEPS-1: измеряем позиции баров из DOM (бары позиционируются grid-column, не
  // left/width — аналитический пересчёт хрупок). Стрелка: правый край pred → левый
  // край succ, ортогональный elbow. Пересчёт на смену зума/фильтра/дат/размера.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) { setEdges([]); return; }

    const measure = () => {
      const b = bodyRef.current;
      if (!b) return;
      const base = b.getBoundingClientRect();
      const anchor = (taskId: string, side: 'start' | 'end') => {
        const el = b.querySelector<HTMLElement>(`[data-task-bar="${taskId}"]`);
        if (!el) return null;                            // W4: не в текущем фильтре → скрыт
        const r = el.getBoundingClientRect();
        return {
          x: (side === 'end' ? r.right : r.left) - base.left,
          y: r.top + r.height / 2 - base.top,
        };
      };
      const STUB = 10;
      const next: { id: string; d: string }[] = [];
      for (const dep of dependencies) {
        const from = anchor(dep.predecessor_id, 'end');
        const to = anchor(dep.successor_id, 'start');
        if (!from || !to) continue;                      // конец скрыт фильтром → пропускаем стрелку
        const midX = Math.max(from.x + STUB, to.x - STUB);
        next.push({ id: dep.id, d: `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}` });
      }
      setEdges(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [dependencies, filteredSwimlanes, zoom, filter]);

  // isLoading (в т.ч. пока грузятся колонки) → только «Загрузка…», без флеша плоского режима
  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { buckets, idxByKey, todayIdx } = model;
  const laneRows = filteredSwimlanes.filter((sl) => sl.tasks.length > 0);
  const gridCols = { gridTemplateColumns: `repeat(${buckets.length}, minmax(28px, 1fr))` };
  const wideRange = zoom === 'day' && buckets.length > 180;

  const controls = (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {ZOOMS.map((z) => (
          <button
            key={z.value}
            type="button"
            onClick={() => setZoom(z.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              zoom === z.value ? 'border-accent text-accent' : 'border-border text-text-mute hover:text-text-main'
            }`}
          >
            {z.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.value ? 'border-accent text-accent' : 'border-border text-text-mute hover:text-text-main'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {/* S-DEPS-1: тумблер link-mode (создание связей). В режиме drag баров отключён. */}
      <button
        type="button"
        aria-pressed={linkMode}
        onClick={() => (linkMode ? exitLinkMode() : setLinkMode(true))}
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          linkMode ? 'border-accent bg-accent-l text-accent' : 'border-border text-text-mute hover:text-text-main'
        }`}
        title="Связать задачи: клик по первой (предшественник), затем по второй"
      >
        Связи
      </button>
      {linkMode && (
        <span className="text-xs text-text-mute">
          {pendingPred ? 'Выберите задачу-последователь · Esc — отмена' : 'Выберите задачу-предшественник · Esc — выход'}
        </span>
      )}
    </div>
  );

  if (buckets.length === 0 && filteredUndated.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        {controls}
        <div className="py-8 text-center text-xs text-text-mute">Нет задач под фильтр</div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3">
      {controls}

      {wideRange && (
        <div className="mb-2 rounded-lg border border-yellow bg-yellow-l px-3 py-1.5 text-xs text-text-main">
          Широкий диапазон — переключи на неделю или месяц для читаемости.
        </div>
      )}

      {buckets.length > 0 && (
        // C0: split-layout — фикс.левая колонка (вне скролла) + отдельный scrollable timeline-body
        <div className="flex">
          {/* ── Левая колонка: названия фаз/задач (вне overflow) ── */}
          <div className="shrink-0" style={{ width: LABEL_W }}>
            <div style={{ height: ROW_H }} /> {/* спейсер под шапку бакетов */}
            {laneRows.map((sl) => (
              <div key={sl.id}>
                {sl.label !== null && (
                  <div className="truncate px-1 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
                    {sl.label}
                  </div>
                )}
                {sl.tasks.map((gt) => (
                  <div
                    key={gt.task.id}
                    className="flex items-center truncate pr-2 text-xs text-text-main"
                    style={{ height: ROW_H }}
                    title={gt.task.text}
                  >
                    <span className="truncate">{gt.task.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ── Timeline-body: скроллится по X, внутри — шапка, ряды, today-оверлей ── */}
          <div className="flex-1 overflow-x-auto">
            <div ref={bodyRef} className="relative min-w-max">
              {/* Шапка бакетов (ref — мерим ширину бакета для drag) */}
              <div ref={gridRef} className="grid" style={{ ...gridCols, height: ROW_H }}>
                {buckets.map((b, i) => (
                  <div
                    key={b.key}
                    className={`flex flex-col items-center justify-center border-l border-border/40 text-[10px] tabular-nums ${
                      i === todayIdx ? 'font-semibold text-accent' : 'text-text-mute'
                    }`}
                  >
                    <span>{b.label}</span>
                    {zoom === 'day' && (i === 0 || b.key.slice(8, 10) === '01') && (
                      <span className="text-text-dim">{b.key.slice(5, 7)}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Ряды по фазам */}
              {laneRows.map((sl) => (
                <div key={sl.id}>
                  {sl.label !== null && <div className="pt-2 pb-0.5 text-[10px]">&nbsp;</div>}
                  {sl.tasks.map((gt) => {
                    const s = idxByKey.get(bucketKeyOf(gt.start, zoom)) ?? 0;
                    const e = idxByKey.get(bucketKeyOf(gt.end, zoom)) ?? s;
                    const assignee = nameById.get(gt.task.assigned_to ?? '') ?? '—';
                    const status = laneLabel(gt.task.lane, phaseMode);
                    return (
                      <div key={gt.task.id} className="grid border-t border-border/40" style={{ ...gridCols, height: ROW_H }}>
                        <GanttBar
                          gt={gt}
                          zoom={zoom}
                          s={s}
                          e={e}
                          getBucketPx={getBucketPx}
                          onEditTask={onEditTask}
                          onDates={updateDates.mutate}
                          setTip={setTip}
                          assignee={assignee}
                          status={status}
                          linkMode={linkMode}
                          isLinkSource={pendingPred === gt.task.id}
                          onLinkSelect={onLinkSelect}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Today line — оверлей поверх шапки+рядов, выровнен по той же бакет-сетке */}
              {todayIdx !== -1 && (
                <div className="pointer-events-none absolute inset-0 grid" style={gridCols}>
                  <div style={{ gridColumn: `${todayIdx + 1}` }} className="border-l border-accent" />
                </div>
              )}

              {/* S-DEPS-1: SVG-оверлей стрелок зависимостей (pred.end → succ.start).
                  Цвет — токен темы (var(--text-mute)); клик по path удаляет ребро. */}
              {edges.length > 0 && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  style={{ color: 'var(--text-mute)' }}
                  aria-hidden
                >
                  <defs>
                    <marker
                      id="gantt-dep-arrow"
                      markerWidth="7"
                      markerHeight="7"
                      refX="6"
                      refY="3"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
                    </marker>
                  </defs>
                  {edges.map((edge) => (
                    <path
                      key={edge.id}
                      d={edge.d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      markerEnd="url(#gantt-dep-arrow)"
                      className="cursor-pointer"
                      style={{ pointerEvents: 'stroke' }}
                      onClick={() => {
                        if (window.confirm('Удалить зависимость?')) deleteDep.mutate(edge.id);
                      }}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Без дат */}
      {filteredUndated.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">Без дат</div>
          <div className="flex flex-wrap gap-1.5">
            {filteredUndated.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onEditTask(task)}
                className="max-w-[200px] truncate rounded border border-border px-2 py-1 text-xs text-text-dim hover:text-text-main"
                title={task.text}
              >
                {task.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Общий fixed-поповер (эскейпит overflow таймлайна; следует за курсором) */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          <div className="font-medium text-text-main">{tip.text}</div>
          <div className="mt-0.5 text-text-dim">Исполнитель: {tip.assignee}</div>
          <div className="text-text-dim">Статус: {tip.status}</div>
        </div>
      )}
    </div>
  );
}
