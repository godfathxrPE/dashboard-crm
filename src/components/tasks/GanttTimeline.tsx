'use client';

import type * as React from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectSchedule, type GanttTask } from '@/lib/hooks/use-project-schedule';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useDeleteTask, useUpdateTaskDates } from '@/lib/hooks/use-tasks';
import { useProjectColumns, useDeleteColumn } from '@/lib/hooks/use-project-columns';
import {
  useTaskDependencies,
  useCreateTaskDependency,
  useDeleteTaskDependency,
  useUpdateTaskDependency,
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
  // S-GANTT-UX-2: UI-гейт write-действий (canManageDeliveryProject из ProjectDetail),
  // НЕ RLS-факт — на write-путях дублируется toast'ом при 42501.
  canManage: boolean;
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

// S-SCHEDULE-1a: assignee/status опциональны — тултип FS-нарушения на стрелке несёт только text
type Tip = { x: number; y: number; text: string; assignee?: string; status?: string };

// S-SCHEDULE-1a: измеренный путь стрелки + данные для lag-бейджа/поповера/soft-warn
type EdgePath = {
  id: string;
  d: string;
  midX: number;      // x вертикального сегмента elbow — якорь бейджа/поповера
  midY: number;      // середина вертикального сегмента
  critical: boolean;
  violated: boolean; // FS-нарушение: succ.start < pred.end + lag
  lag_days: number;
};

// S-SCHEDULE-1a: состояние поповера ребра (lag-редактор + удаление); lag — строка инпута
type EdgeMenu = { id: string; lag: string; x: number; y: number };

// DD.MM из date-key YYYY-MM-DD (для текста FS-нарушения)
const ddmm = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;

const EDGE_PX = 6;    // ширина resize-зоны у краёв бара
const CLICK_PX = 4;   // смещение < порога = клик (открыть модалку), не drag
// S-GANTT-UX-2 (B3): полуширина fallback-оси (today±N дней), когда датированных задач
// нет вовсе (проект из шаблона) — иначе chip из «Без дат» некуда дропать.
const UNDATED_AXIS_PAD_DAYS = 14;

type DragMode = 'move' | 'left' | 'right';
type DragState = { mode: DragMode; startX: number; bucketPx: number; rawDx: number };
// S-GANTT-UX-2: drag chip из «Без дат» — hoverIdx = бакет под курсором (null вне таймлайна)
type UndatedDrag = { task: Task; startX: number; startY: number; moved: boolean; hoverIdx: number | null };

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
  isCritical: boolean;             // S-CRIT-PATH: бар на критическом пути
  onLinkSelect: (taskId: string) => void;
  canManage: boolean;              // S-GANTT-UX-2: гейт drag/resize и hover-Trash
  onDeleteTask: (task: Task, isSummary: boolean) => void;
}

// Бар/ромб с drag-to-resize/move (нативные Pointer Events, без @dnd-kit).
// Живой фидбэк — CSS transform/width (снап к бакету); запись дат на pointerup.
// S-DEPS-1: в linkMode drag-хендлеры не навешиваются — клик выбирает конец связи.
function GanttBar({ gt, zoom, s, e, getBucketPx, onEditTask, onDates, setTip, assignee, status, linkMode, isLinkSource, isCritical, onLinkSelect, canManage, onDeleteTask }: GanttBarProps) {
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
  // W6 (S-WBS-1): сводный бар (isSummary) не таскается — иначе useUpdateTaskDates
  // записал бы envelope-даты детей как реальные даты родителя. Клик = только onEditTask.
  // S-GANTT-UX-2 (W4): без canManage drag/resize отключены — после 065 member видит
  // Гант, но write упрётся в RLS 42501; бар для него = только клик (edit-модалка).
  const draggable = !linkMode && !gt.isSummary && canManage;
  const dragHandlers = draggable
    ? {
        onPointerDown: (ev: React.PointerEvent) => startDrag(ev, 'move'),
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onCancel,
      }
    : undefined;
  const linkClick = linkMode
    ? { onClick: () => onLinkSelect(gt.task.id) }
    : !draggable
      ? { onClick: () => onEditTask(gt.task) }
      : undefined;
  const cursorClass = draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer';
  const ringClass = isLinkSource ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : '';
  // S-CRIT-PATH: акцентная обводка через outline (var(--accent), не хардкод; отдельное
  // CSS-свойство от ring — не клобберит link-source, оба состояния сосуществуют).
  const critClass = isCritical ? 'outline outline-2 outline-accent outline-offset-1' : '';

  return (
    <div
      className="group relative"
      data-task-bar={gt.task.id}
      style={{ gridColumn: (gt.isMilestone && !gt.isSummary) ? `${s + 1}` : `${s + 1} / ${e + 2}`, gridRow: 1 }}
    >
      {/* S-GANTT-UX-2: hover-Trash — удаление задачи прямо из Ганта. Вне бара справа
          (внутри конфликтует с resize-хендлом EDGE_PX); stopPropagation на pointerdown —
          не стартовать drag. В linkMode скрыт (клики заняты выбором связи). */}
      {canManage && !linkMode && (
        <button
          type="button"
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => { ev.stopPropagation(); onDeleteTask(gt.task, gt.isSummary); }}
          className="absolute -right-4 top-1/2 z-10 -translate-y-1/2 text-red opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
          aria-label={`Удалить задачу «${gt.task.text}»`}
          title="Удалить задачу"
        >
          <Trash2 size={11} />
        </button>
      )}
      {/* W3 (S-WBS-1): приоритет вида — веха-не-сводная → ромб; иначе сводная →
          скобка-бар; иначе лист-бар. (summary+milestone → скобка выигрывает.) */}
      {gt.isMilestone && !gt.isSummary ? (
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
          <span className={`inline-block h-2.5 w-2.5 rotate-45 rounded-[1px] ${barClass(gt.task)} ${ringClass} ${critClass}`} />
        </div>
      ) : gt.isSummary ? (
        // Сводный бар: тонкая линия + ножки-скобки по краям, полупрозрачная (var-цвет
        // через bg-токен приоритета) — визуально отличается от листового бара. Не таскается.
        <div
          role="button"
          tabIndex={0}
          {...linkClick}
          onKeyDown={onKey}
          onMouseEnter={showTip}
          onMouseMove={moveTip}
          onMouseLeave={() => setTip(null)}
          className={`relative my-1 flex h-2.5 w-full ${cursorClass}`}
          style={{ touchAction: 'none' }}
          aria-label={`${gt.task.text} (сводная): ${gt.start} → ${gt.end}`}
        >
          <div className={`absolute inset-x-0 top-0 h-1 rounded-sm ${barClass(gt.task)} ${ringClass} ${critClass} opacity-70`} />
          <span className={`absolute left-0 top-0 h-2.5 w-0.5 ${barClass(gt.task)}`} aria-hidden />
          <span className={`absolute right-0 top-0 h-2.5 w-0.5 ${barClass(gt.task)}`} aria-hidden />
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
          className={`relative my-1 block h-4 w-full rounded ${cursorClass} ${barClass(gt.task)} ${ringClass} ${critClass} ${gt.task.lane === 'done' ? 'opacity-50' : 'opacity-90'} transition-opacity hover:opacity-100`}
          style={{ transform: linkMode ? undefined : transform, width: linkMode ? undefined : width, touchAction: 'none' }}
          aria-label={`${gt.task.text}: ${gt.start} → ${gt.end}`}
        >
          {/* resize-хендлы: только когда бар таскается (вне linkMode, не сводный) */}
          {draggable && (
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

export function GanttTimeline({ projectId, canManage, onEditTask }: GanttTimelineProps) {
  const { swimlanes, undated, phaseMode, isLoading, isError } = useProjectSchedule(projectId);
  const { data: team = [] } = useTeamMembers();
  const updateDates = useUpdateTaskDates();
  // S-GANTT-UX-2: удаление задачи/фазы из Ганта — те же мутации, что на доске
  // (FK-cleanup на БД: deps CASCADE 048, parent_task_id SET NULL 052; RPC 032/033).
  const deleteTask = useDeleteTask();
  const deleteColumn = useDeleteColumn(projectId);
  // Кэш ['project_columns', projectId] уже прогрет useProjectSchedule → нового запроса нет.
  // Нужен для real phase-id (гейт Trash: __none__/__flat__ — не колонки) и пикера target.
  const { data: columns = [] } = useProjectColumns(projectId);
  // Пикер target при удалении непустой фазы — тот же UX, что на доске «План»
  const [deletingPhase, setDeletingPhase] = useState<{ id: string; name: string } | null>(null);
  const [targetPhaseId, setTargetPhaseId] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);   // S-DEPS-1: контекст для измерения стрелок
  const [zoom, setZoom] = useState<GanttZoom>('week');
  const [filter, setFilter] = useState<GanttFilter>('open');
  const [tip, setTip] = useState<Tip | null>(null);
  // S-DEPS-1: link-mode — тумблер создания связей + выбранный predecessor
  const [linkMode, setLinkMode] = useState(false);
  const [pendingPred, setPendingPred] = useState<string | null>(null);
  // S-CRIT-PATH: тумблер подсветки критического пути (default off)
  const [showCritical, setShowCritical] = useState(false);
  const [edges, setEdges] = useState<EdgePath[]>([]); // измеренные пути стрелок
  // S-SCHEDULE-1a: поповер ребра (клик по стрелке → lag-редактор + удаление)
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenu | null>(null);
  const edgeMenuRef = useRef<HTMLDivElement>(null);
  // S-WBS-1: свёртка сводных строк — id свёрнутых родителей (их потомки скрыты)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const nameById = useMemo(() => new Map(team.map((m) => [m.id, m.full_name])), [team]);

  // S-GANTT-UX-2: window.confirm — конвенция проекта для задачи/ребра (НЕ для фазы —
  // у неё пикер target). У summary подтверждение называет судьбу детей (SET NULL 052).
  const handleDeleteTask = useCallback(
    (task: Task, isSummary: boolean) => {
      const msg = isSummary
        ? `Удалить сводную задачу «${task.text}»? Подзадачи останутся без родителя. Действие необратимо.`
        : `Удалить задачу «${task.text}»? Действие необратимо.`;
      if (!window.confirm(msg)) return;
      deleteTask.mutate(task.id, {
        onError: () => toast.error('Не удалось удалить задачу (нет прав или сеть)'),
      });
    },
    [deleteTask],
  );

  // Real phase-id: Trash у свимлейна только для настоящих колонок (W5) —
  // синтетические '__none__'/'__flat__' в project_columns не существуют.
  const realPhaseIds = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);

  // Есть ли в удаляемой фазе задачи: считаем по СЫРЫМ данным (dated в свимлейне +
  // undated с этим column_id), не по фильтру — RPC без target падает на непустой.
  const deletePhaseTaskCount = useMemo(() => {
    if (!deletingPhase) return 0;
    const dated = swimlanes.find((sl) => sl.id === deletingPhase.id)?.tasks.length ?? 0;
    return dated + undated.filter((t) => t.column_id === deletingPhase.id).length;
  }, [deletingPhase, swimlanes, undated]);
  const deletePhaseTargets = useMemo(
    () => (deletingPhase ? columns.filter((c) => c.id !== deletingPhase.id) : []),
    [deletingPhase, columns],
  );

  const confirmDeletePhase = useCallback(() => {
    if (!deletingPhase) return;
    deleteColumn.mutate(
      { id: deletingPhase.id, targetId: deletePhaseTaskCount > 0 ? targetPhaseId : null },
      { onError: () => toast.error('Не удалось удалить фазу (защищённая колонка или нет прав)') },
    );
    setDeletingPhase(null);
    setTargetPhaseId('');
  }, [deletingPhase, deletePhaseTaskCount, targetPhaseId, deleteColumn]);

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
  const updateDep = useUpdateTaskDependency(projectId);

  // Стабильная сигнатура набора рёбер: строка не меняет reference между рендерами
  // при тех же зависимостях (dependencies дефолтится в новый [] при пустых данных).
  // S-SCHEDULE-1a: + lag_days — иначе optimistic-правка lag не перезапустит измерение
  // стрелок (бейдж/цвет не обновятся до случайного reflow, ревью W3).
  const depSig = useMemo(
    () => dependencies.map((d) => `${d.id}:${d.predecessor_id}>${d.successor_id}:${d.lag_days}`).join('|'),
    [dependencies],
  );

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

  // S-SCHEDULE-1a: сохранить lag из поповера ребра. Целое ≥ 0 (v1 без lead-time);
  // NaN/мусор из number-инпута → 0.
  const saveEdgeLag = useCallback(() => {
    if (!edgeMenu) return;
    const n = Math.floor(Number(edgeMenu.lag));
    updateDep.mutate({ id: edgeMenu.id, lag_days: Number.isFinite(n) && n > 0 ? n : 0 });
    setEdgeMenu(null);
  }, [edgeMenu, updateDep]);

  const filteredSwimlanes = useMemo(() => {
    const pred = (gt: GanttTask) =>
      filter === 'all' ? true : filter === 'milestones' ? gt.isMilestone : gt.task.lane !== 'done';
    return swimlanes.map((sl) => ({ ...sl, tasks: sl.tasks.filter(pred) }));
  }, [swimlanes, filter]);

  // W2 (S-WBS-1): collapse-фильтр применяем ОДИН раз здесь — результат кормит левую
  // колонку, бары, critical-path И измерение стрелок. Иначе label/bar разъедутся по
  // высоте, а стрелки повиснут к скрытым. Потомок скрыт, если ЛЮБОЙ предок свёрнут:
  // задачи идут в дерево-порядке (pre-order, поддерево contiguous) → держим порог
  // глубины hideBelow, пока не вернёмся на уровень ≤ свёрнутого узла.
  const visibleSwimlanes = useMemo(() => {
    if (collapsed.size === 0) return filteredSwimlanes;
    return filteredSwimlanes.map((sl) => {
      const out: GanttTask[] = [];
      let hideBelow = Infinity;
      for (const gt of sl.tasks) {
        if (gt.depth > hideBelow) continue;              // потомок свёрнутого предка
        hideBelow = Infinity;                            // вышли из свёрнутого поддерева
        out.push(gt);
        if (gt.isSummary && collapsed.has(gt.task.id)) hideBelow = gt.depth;
      }
      return { ...sl, tasks: out };
    });
  }, [filteredSwimlanes, collapsed]);

  // Стабильная сигнатура свёрнутого множества для deps эффекта измерения стрелок.
  const collapsedSig = useMemo(() => [...collapsed].sort().join(','), [collapsed]);

  const filteredUndated = useMemo(() => {
    if (filter === 'milestones') return [];              // вехи без дат — не в этот фильтр (см. заметки гейта)
    if (filter === 'open') return undated.filter((t) => t.lane !== 'done');
    return undated;
  }, [undated, filter]);

  // S-CRIT-PATH: критический путь = самая длинная по сумме длительностей задач цепочка
  // в DAG рёбер (longest path). НЕ полный CPM (ES/EF/LS/LF/float) — даты у нас
  // пользовательские, не выводятся из длительностей; FS-констрейнт не enforced
  // (см. S-DEPS-1 W7). Полный CPM — возможный v2. Чистый useMemo (не effect+setState)
  // → лишний пересчёт по нестабильным ссылкам безвреден, лупа исключена (S-DEPS-1).
  // Считаем по ВИДИМЫМ датированным задачам (у которых есть бар) — консистентно со
  // стрелками (W4); полный путь — на фильтре «Все».
  const critical = useMemo(() => {
    // длительность в днях (inclusive), UTC-полдень — та же нормализация, что бары
    // (noonMs в date-helpers: Date.parse(`${key}T12:00:00Z`)), TZ не прыгает через полночь.
    const noon = (k: string) => Date.parse(`${k}T12:00:00Z`);
    const durDays = (gt: GanttTask) =>
      Math.max(1, Math.round((noon(gt.end) - noon(gt.start)) / 86_400_000) + 1);

    // узлы: только видимые датированные задачи (реально имеют бар; свёрнутые скрыты)
    const nodes = new Map<string, GanttTask>();
    for (const sl of visibleSwimlanes) for (const gt of sl.tasks) nodes.set(gt.task.id, gt);

    // рёбра только между видимыми узлами; заодно in-degree по succ для топосорта
    const adjPreds = new Map<string, { edgeId: string; pred: string }[]>(); // succ → [{edge,pred}]
    const adjSuccs = new Map<string, string[]>();                            // pred → [succ]
    const indeg = new Map<string, number>();
    for (const id of nodes.keys()) indeg.set(id, 0);
    for (const d of dependencies) {
      if (!nodes.has(d.predecessor_id) || !nodes.has(d.successor_id)) continue;
      (adjPreds.get(d.successor_id) ?? adjPreds.set(d.successor_id, []).get(d.successor_id)!)
        .push({ edgeId: d.id, pred: d.predecessor_id });
      (adjSuccs.get(d.predecessor_id) ?? adjSuccs.set(d.predecessor_id, []).get(d.predecessor_id)!)
        .push(d.successor_id);
      indeg.set(d.successor_id, (indeg.get(d.successor_id) ?? 0) + 1);
    }

    // топосорт Kahn (DAG гарантирован триггером 048 → циклов нет)
    const order: string[] = [];
    const queue: string[] = [];
    for (const [id, deg] of indeg) if (deg === 0) queue.push(id);
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      for (const succ of adjSuccs.get(id) ?? []) {
        const d = (indeg.get(succ) ?? 0) - 1;
        indeg.set(succ, d);
        if (d === 0) queue.push(succ);
      }
    }

    // longest-path DP: best[id] = макс. суммарная длительность цепи, кончающейся на id
    const best = new Map<string, number>();
    const from = new Map<string, { pred: string; edgeId: string } | null>();
    for (const id of order) {
      const gt = nodes.get(id)!;
      let bestPredSum = 0;
      let pick: { pred: string; edgeId: string } | null = null;
      for (const { pred, edgeId } of adjPreds.get(id) ?? []) {
        const s = best.get(pred) ?? 0;
        if (s > bestPredSum) { bestPredSum = s; pick = { pred, edgeId }; }
      }
      best.set(id, bestPredSum + durDays(gt));
      from.set(id, pick);
    }

    // глобальный максимум → бэктрек цепи
    let endId: string | null = null;
    let max = 0;
    for (const [id, v] of best) if (v > max) { max = v; endId = id; }
    const taskIds = new Set<string>();
    const edgeIds = new Set<string>();
    let cur: string | null = endId;
    while (cur) {
      taskIds.add(cur);
      const step = from.get(cur);
      if (!step) break;
      edgeIds.add(step.edgeId);
      cur = step.pred;
    }
    // критический путь имеет смысл только при ≥1 ребре (цепочка из 2+ задач)
    return edgeIds.size
      ? { taskIds, edgeIds, totalDays: max }
      : { taskIds: new Set<string>(), edgeIds, totalDays: 0 };
  }, [visibleSwimlanes, dependencies]);

  // Стабильная строковая сигнатура крит-множества для effect-deps измерения стрелок
  // (НЕ объект critical — новый ref каждый рендер). '' когда подсветка выключена.
  const critSig = showCritical ? [...critical.edgeIds].sort().join(',') : '';

  // S-SCHEDULE-1a: soft-warn нарушения FS — succ.start < pred.end + lag (только сигнал,
  // без каскада/блокировки — это S-SCHEDULE-1b). Сравнение по date-key MSK; прибавка
  // дней — shiftDateKeyByBuckets (UTC-полдень, та же арифметика, что бары/critical).
  // Конец без бара (undated / скрыт свёрткой-фильтром) → нарушение не считаем.
  const violation = useMemo(() => {
    const nodes = new Map<string, GanttTask>();
    for (const sl of visibleSwimlanes) for (const gt of sl.tasks) nodes.set(gt.task.id, gt);
    const tips = new Map<string, string>(); // edgeId → текст тултипа нарушения
    for (const d of dependencies) {
      const pred = nodes.get(d.predecessor_id);
      const succ = nodes.get(d.successor_id);
      if (!pred || !succ) continue;
      const earliest = shiftDateKeyByBuckets(pred.end, 'day', d.lag_days);
      if (succ.start < earliest) {
        tips.set(
          d.id,
          `FS-нарушение: «${succ.task.text}» должна начаться не раньше ${ddmm(earliest)} (после «${pred.task.text}»${d.lag_days > 0 ? ` + ${d.lag_days} дн` : ''})`,
        );
      }
    }
    return tips;
  }, [visibleSwimlanes, dependencies]);

  // Стабильная сигнатура множества нарушений для effect-deps измерения (не Map-ref).
  const violSig = useMemo(() => [...violation.keys()].sort().join(','), [violation]);

  // S-SCHEDULE-1a: закрытие поповера ребра — Esc или pointerdown вне поповера
  useLayoutEffect(() => {
    if (!edgeMenu) return;
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setEdgeMenu(null); };
    const onDown = (ev: PointerEvent) => {
      if (!edgeMenuRef.current?.contains(ev.target as Node)) setEdgeMenu(null);
    };
    window.addEventListener('keydown', onEsc);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [edgeMenu]);

  const hasUndated = filteredUndated.length > 0;

  const model = useMemo(() => {
    const allTasks: GanttTask[] = visibleSwimlanes.flatMap((sl) => sl.tasks);
    let min: string;
    let max: string;
    if (allTasks.length > 0) {
      min = allTasks.reduce((m, t) => (t.start < m ? t.start : m), allTasks[0].start);
      max = allTasks.reduce((m, t) => (t.end > m ? t.end : m), allTasks[0].end);
    } else if (hasUndated) {
      // S-GANTT-UX-2 (B3): only-undated (проект из шаблона) — бакетов из задач нет,
      // а drop из «Без дат» без оси мёртв. Временная ось today±N; как только появится
      // первая датированная задача, ось снова строится из дат.
      const today = mskDateKey(new Date());
      min = shiftDateKeyByBuckets(today, 'day', -UNDATED_AXIS_PAD_DAYS);
      max = shiftDateKeyByBuckets(today, 'day', UNDATED_AXIS_PAD_DAYS);
    } else {
      return { buckets: [] as { key: string; label: string }[], idxByKey: new Map<string, number>(), todayIdx: -1 };
    }
    const buckets = buildBuckets(min, max, zoom);
    const idxByKey = new Map(buckets.map((b, i) => [b.key, i]));
    const todayIdx = bucketIndexOf(mskDateKey(new Date()), zoom, buckets);
    return { buckets, idxByKey, todayIdx };
  }, [visibleSwimlanes, hasUndated, zoom]);

  // Ширина бакета в рантайме (сетка minmax(28px,1fr) — динамическая, хардкод нельзя).
  // Снимаем с шапки бакетов на каждый pointerdown.
  const getBucketPx = useCallback(() => {
    const w = gridRef.current?.getBoundingClientRect().width ?? 0;
    return model.buckets.length ? w / model.buckets.length : 0;
  }, [model.buckets.length]);

  // S-GANTT-UX-2 (W4): единая запись дат с toast'ом — canManage лишь UI-гейт,
  // RLS-отказ (42501) не должен молча откатывать бар без объяснения.
  const commitDates = useCallback(
    (v: { id: string; start_date: string; end_date: string }) =>
      updateDates.mutate(v, {
        onError: () => toast.error('Не удалось изменить даты (нет прав или сеть)'),
      }),
    [updateDates.mutate],
  );

  // S-GANTT-UX-2: drag chip из «Без дат» на таймлайн (нативные Pointer Events, как
  // бары VIEW-2). Дата = ключ бакета под курсором; запись строго через
  // useUpdateTaskDates (patchTaskCaches уберёт chip и покажет бар во всех срезах).
  // Источник правды — ref (события в burst приходят ДО re-render, state-замыкание
  // отстаёт → быстрый свайп терял moved и открывал модалку); state — только рендер призрака.
  const undatedDragRef = useRef<UndatedDrag | null>(null);
  const [undatedDrag, setUndatedDrag] = useState<UndatedDrag | null>(null);
  const applyUndatedDrag = useCallback((v: UndatedDrag | null) => {
    undatedDragRef.current = v;
    // дедуп setState (гоча measurement-loop): идентичное состояние → prev, React бейлит
    setUndatedDrag((prev) => {
      if (prev === v) return prev;
      if (prev && v && prev.task.id === v.task.id && prev.moved === v.moved && prev.hoverIdx === v.hoverIdx) return prev;
      return v;
    });
  }, []);

  const undatedDragStart = useCallback(
    (task: Task) => (ev: React.PointerEvent) => {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      applyUndatedDrag({ task, startX: ev.clientX, startY: ev.clientY, moved: false, hoverIdx: null });
    },
    [applyUndatedDrag],
  );

  const undatedDragMove = useCallback(
    (ev: React.PointerEvent) => {
      const d = undatedDragRef.current;
      if (!d) return; // pointermove летит и на голый hover — DOM не меряем
      const x = ev.clientX;
      const y = ev.clientY;
      const moved = d.moved || Math.abs(x - d.startX) >= CLICK_PX || Math.abs(y - d.startY) >= CLICK_PX;
      // «Над таймлайном» = x в границах бакет-сетки, y в границах timeline-body
      let hoverIdx: number | null = null;
      const grid = gridRef.current;
      const body = bodyRef.current;
      if (moved && grid && body && model.buckets.length > 0) {
        const gr = grid.getBoundingClientRect();
        const br = body.getBoundingClientRect();
        if (x >= gr.left && x < gr.right && y >= br.top && y <= br.bottom) {
          hoverIdx = Math.min(
            model.buckets.length - 1,
            Math.max(0, Math.floor((x - gr.left) / (gr.width / model.buckets.length))),
          );
        }
      }
      if (moved === d.moved && hoverIdx === d.hoverIdx) return;
      applyUndatedDrag({ ...d, moved, hoverIdx });
    },
    [model.buckets.length, applyUndatedDrag],
  );

  const undatedDragUp = useCallback(
    (ev: React.PointerEvent) => {
      try { ev.currentTarget.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      const d = undatedDragRef.current;
      applyUndatedDrag(null);
      if (!d) return;
      if (!d.moved) {
        onEditTask(d.task); // мелкое смещение = клик (W6, тот же CLICK_PX, что бары)
        return;
      }
      const bucket = d.hoverIdx !== null ? model.buckets[d.hoverIdx] : undefined;
      if (bucket) {
        // start=end=ключ бакета (Пн/1-е на неделя/месяц — как bar-snap VIEW-2);
        // start==end валиден по CHECK tasks_dates_order_chk (046)
        commitDates({ id: d.task.id, start_date: bucket.key, end_date: bucket.key });
      }
    },
    [model.buckets, onEditTask, commitDates, applyUndatedDrag],
  );

  const undatedDragCancel = useCallback(
    (ev: React.PointerEvent) => {
      try { ev.currentTarget.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
      applyUndatedDrag(null);
    },
    [applyUndatedDrag],
  );

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
      const next: EdgePath[] = [];
      for (const dep of dependencies) {
        const from = anchor(dep.predecessor_id, 'end');
        const to = anchor(dep.successor_id, 'start');
        if (!from || !to) continue;                      // конец скрыт фильтром → пропускаем стрелку
        const midX = Math.max(from.x + STUB, to.x - STUB);
        next.push({
          id: dep.id,
          d: `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`,
          midX,
          midY: (from.y + to.y) / 2,                     // середина вертикального сегмента elbow
          critical: showCritical && critical.edgeIds.has(dep.id), // S-CRIT-PATH
          violated: violation.has(dep.id),               // S-SCHEDULE-1a: soft-warn FS
          lag_days: dep.lag_days,
        });
      }
      // дедуп: идентичные пути → возвращаем prev (React бейлит, re-render не идёт).
      // Без этого setEdges(новый массив) крутит render→effect→setEdges бесконечно.
      // S-CRIT-PATH: сравниваем и critical, иначе тумблер не перерисует стрелки.
      // S-SCHEDULE-1a: + violated/lag_days — иначе смена lag/нарушения не перекрасит.
      setEdges((prev) => {
        if (
          prev.length === next.length &&
          prev.every((e, i) =>
            e.id === next[i].id && e.d === next[i].d && e.critical === next[i].critical &&
            e.violated === next[i].violated && e.lag_days === next[i].lag_days,
          )
        ) return prev;
        return next;
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
    // deps по depSig (стабильная строка), а не filteredSwimlanes (новый ref каждый
    // рендер → effect гонялся всегда). zoom/filter меняют ширину → ResizeObserver перемеряет.
    // S-CRIT-PATH: showCritical + critSig (стабильная строка, НЕ объект critical) →
    // перекраска крит-стрелок по тумблеру без лупа.
    // S-WBS-1: collapsedSig — свёртка меняет набор баров в DOM → перемерить стрелки
    // (скрытые концы дают anchor=null → стрелка пропускается, W4-паттерн).
    // S-SCHEDULE-1a: violSig — смена дат/lag меняет множество нарушений → перекраска
    // (depSig ловит lag, violSig — сдвиг дат при неизменных рёбрах).
    // v1: перемер при смене рёбер/зума/фильтра/размера/свёртки; чистый reflow строк — по следующему триггеру
  }, [depSig, zoom, filter, showCritical, critSig, collapsedSig, violSig]);

  // isLoading (в т.ч. пока грузятся колонки) → только «Загрузка…», без флеша плоского режима
  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { buckets, idxByKey, todayIdx } = model;
  const laneRows = visibleSwimlanes.filter((sl) => sl.tasks.length > 0);
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
      {/* S-CRIT-PATH: тумблер подсветки критического пути (longest path в DAG). */}
      <button
        type="button"
        aria-pressed={showCritical}
        onClick={() => setShowCritical((v) => !v)}
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          showCritical ? 'border-accent bg-accent-l text-accent' : 'border-border text-text-mute hover:text-text-main'
        }`}
        title="Подсветить самую длинную цепочку зависимых задач (по текущему фильтру)"
      >
        Крит. путь
      </button>
      {showCritical && critical.taskIds.size > 0 && (
        <span className="rounded-md bg-accent-l px-2 py-0.5 text-xs font-medium text-accent">
          Крит. путь: {critical.totalDays} дн
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
                  <div className="group flex items-center gap-1 px-1 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wide text-text-mute">
                    <span className="truncate">{sl.label}</span>
                    {/* S-GANTT-UX-2: удаление фазы — только real phase-id (не «Без фазы»/flat);
                        UX как на доске: непустая фаза → пикер target, не window.confirm */}
                    {canManage && phaseMode && realPhaseIds.has(sl.id) && (
                      <button
                        type="button"
                        onClick={() => { setTargetPhaseId(''); setDeletingPhase({ id: sl.id, name: sl.label ?? '' }); }}
                        className="shrink-0 leading-none text-red opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
                        aria-label={`Удалить фазу «${sl.label}»`}
                        title="Удалить фазу"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                )}
                {sl.tasks.map((gt) => (
                  <div
                    key={gt.task.id}
                    className="flex items-center pr-2 text-xs text-text-main"
                    style={{ height: ROW_H, paddingLeft: `${gt.depth}rem` }}
                    title={gt.task.text}
                  >
                    {/* S-WBS-1: треугольник свёртки у сводных; спейсер у листьев — выравнивание */}
                    {gt.isSummary ? (
                      <button
                        type="button"
                        onClick={() => toggleCollapse(gt.task.id)}
                        aria-label={collapsed.has(gt.task.id) ? 'Развернуть' : 'Свернуть'}
                        aria-expanded={!collapsed.has(gt.task.id)}
                        className="mr-0.5 shrink-0 text-text-mute hover:text-text-main transition-colors"
                      >
                        {collapsed.has(gt.task.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                    ) : (
                      <span className="mr-0.5 inline-block w-3 shrink-0" aria-hidden />
                    )}
                    {gt.task.wbs_code && (
                      <span className="mr-1 shrink-0 tabular-nums text-text-mute">{gt.task.wbs_code}</span>
                    )}
                    <span className={`truncate ${gt.isSummary ? 'font-medium' : ''}`}>{gt.task.text}</span>
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
                    className={`flex flex-col items-center justify-center border-l border-border/40 text-xs tabular-nums ${
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
                  {sl.label !== null && <div className="pt-2 pb-0.5 text-xs">&nbsp;</div>}
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
                          onDates={commitDates}
                          setTip={setTip}
                          assignee={assignee}
                          status={status}
                          linkMode={linkMode}
                          isLinkSource={pendingPred === gt.task.id}
                          isCritical={showCritical && critical.taskIds.has(gt.task.id)}
                          onLinkSelect={onLinkSelect}
                          canManage={canManage}
                          onDeleteTask={handleDeleteTask}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* S-GANTT-UX-2 (B3): fallback-ось без единого бара — пустой ряд, чтобы
                  timeline-body имел высоту-приёмник для drop из «Без дат» */}
              {laneRows.length === 0 && (
                <div className="grid border-t border-border/40" style={{ ...gridCols, height: ROW_H }} />
              )}

              {/* Today line — оверлей поверх шапки+рядов, выровнен по той же бакет-сетке */}
              {todayIdx !== -1 && (
                <div className="pointer-events-none absolute inset-0 grid" style={gridCols}>
                  <div style={{ gridColumn: `${todayIdx + 1}` }} className="border-l border-accent" />
                </div>
              )}

              {/* S-GANTT-UX-2: призрак дня под курсором при drag chip из «Без дат» */}
              {undatedDrag?.hoverIdx != null && (
                <div className="pointer-events-none absolute inset-0 grid" style={gridCols}>
                  <div
                    style={{ gridColumn: `${undatedDrag.hoverIdx + 1}` }}
                    className="border-x border-accent bg-accent-l opacity-60"
                  />
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
                    {/* S-CRIT-PATH: акцентный маркер для критических стрелок (marker
                        наследует color из defs, не из ссылающегося path → отдельный). */}
                    <marker
                      id="gantt-dep-arrow-crit"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
                    </marker>
                    {/* S-SCHEDULE-1a: маркер FS-нарушения; приоритетнее critical (это ошибка) */}
                    <marker
                      id="gantt-dep-arrow-viol"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill="var(--red)" />
                    </marker>
                  </defs>
                  {edges.map((edge) => (
                    <g key={edge.id}>
                      <path
                        d={edge.d}
                        fill="none"
                        stroke={edge.violated ? 'var(--red)' : edge.critical ? 'var(--accent)' : 'currentColor'}
                        strokeWidth={edge.violated || edge.critical ? 2.5 : 1.5}
                        markerEnd={
                          edge.violated
                            ? 'url(#gantt-dep-arrow-viol)'
                            : edge.critical
                              ? 'url(#gantt-dep-arrow-crit)'
                              : 'url(#gantt-dep-arrow)'
                        }
                      />
                      {/* прозрачный hit-path (~10px) — кликабельность тонкой стрелки;
                          клик → поповер lag-редактора (удаление связи — внутри него) */}
                      <path
                        d={edge.d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={10}
                        className="cursor-pointer"
                        style={{ pointerEvents: 'stroke' }}
                        onClick={(ev) =>
                          setEdgeMenu({ id: edge.id, lag: String(edge.lag_days), x: ev.clientX, y: ev.clientY })
                        }
                        onMouseEnter={(ev) => {
                          const t = violation.get(edge.id);
                          if (t) setTip({ x: ev.clientX, y: ev.clientY, text: t });
                        }}
                        onMouseMove={(ev) => {
                          const t = violation.get(edge.id);
                          if (t) setTip({ x: ev.clientX, y: ev.clientY, text: t });
                        }}
                        onMouseLeave={() => { if (edge.violated) setTip(null); }}
                      />
                      {/* бейдж «+Nд» у середины ребра — только при lag > 0 */}
                      {edge.lag_days > 0 && (
                        <text
                          x={edge.midX + 4}
                          y={edge.midY + 3}
                          className="tabular-nums"
                          fontSize={10}
                          fill={edge.violated ? 'var(--red)' : 'var(--text-mute)'}
                          stroke="var(--surface)"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          +{edge.lag_days}д
                        </text>
                      )}
                    </g>
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
          <div className="mb-1 text-xs uppercase tracking-wide text-text-mute">Без дат</div>
          <div className="flex flex-wrap gap-1.5">
            {/* S-GANTT-UX-2: chip таскается на таймлайн (canManage) — pointer-flow сам
                различает клик (edit) и drag по CLICK_PX; без canManage — обычный клик */}
            {filteredUndated.map((task) => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                {...(canManage
                  ? {
                      onPointerDown: undatedDragStart(task),
                      onPointerMove: undatedDragMove,
                      onPointerUp: undatedDragUp,
                      onPointerCancel: undatedDragCancel,
                    }
                  : { onClick: () => onEditTask(task) })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEditTask(task); }
                }}
                className={`group flex max-w-[200px] items-center gap-1 rounded border px-2 py-1 text-xs text-text-dim hover:text-text-main ${
                  undatedDrag?.task.id === task.id ? 'border-accent' : 'border-border'
                } ${canManage ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                style={{ touchAction: 'none' }}
                title={task.text}
              >
                <span className="truncate">{task.text}</span>
                {/* удаление undated-задачи; stopPropagation на pointerdown — не стартовать drag */}
                {canManage && (
                  <button
                    type="button"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => { ev.stopPropagation(); handleDeleteTask(task, false); }}
                    className="shrink-0 text-red opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
                    aria-label={`Удалить задачу «${task.text}»`}
                    title="Удалить задачу"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* S-GANTT-UX-2: диалог удаления фазы — скопирован UX доски «План» (ProjectBoard):
          непустая фаза требует target-колонку (контракт RPC delete_project_column 032/033) */}
      {deletingPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingPhase(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 elevation-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-semibold text-text-main">Удалить фазу «{deletingPhase.name}»?</h3>
            {deletePhaseTaskCount > 0 ? (
              <>
                <p className="mb-2 text-xs text-text-mute">В фазе есть задачи. Куда их перенести?</p>
                <select
                  value={targetPhaseId}
                  onChange={(e) => setTargetPhaseId(e.target.value)}
                  className="mb-4 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-text-main focus:border-accent focus:outline-none"
                >
                  <option value="">Выбрать фазу…</option>
                  {deletePhaseTargets.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <p className="mb-4 text-xs text-text-mute">Фаза пуста — будет удалена безвозвратно.</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingPhase(null)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-dim hover:bg-surface2">Отмена</button>
              <button
                onClick={confirmDeletePhase}
                disabled={deletePhaseTaskCount > 0 && !targetPhaseId}
                className="rounded-lg bg-red px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Общий fixed-поповер (эскейпит overflow таймлайна; следует за курсором) */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          <div className="font-medium text-text-main">{tip.text}</div>
          {tip.assignee !== undefined && <div className="mt-0.5 text-text-dim">Исполнитель: {tip.assignee}</div>}
          {tip.status !== undefined && <div className="text-text-dim">Статус: {tip.status}</div>}
        </div>
      )}

      {/* S-SCHEDULE-1a: поповер ребра — lag-редактор (FS + N дн) + удаление связи.
          Fixed (эскейпит overflow), закрытие — Esc / pointerdown вне (effect выше). */}
      {edgeMenu && (
        <div
          ref={edgeMenuRef}
          className="fixed z-50 rounded-lg border border-border bg-popover p-2.5 text-xs shadow-lg"
          style={{ left: edgeMenu.x + 8, top: edgeMenu.y + 8 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-text-main">Связь FS</span>
            <span className="text-text-mute">+</span>
            <input
              type="number"
              min={0}
              step={1}
              autoFocus
              value={edgeMenu.lag}
              onChange={(ev) => setEdgeMenu({ ...edgeMenu, lag: ev.target.value })}
              onKeyDown={(ev) => { if (ev.key === 'Enter') saveEdgeLag(); }}
              className="w-14 rounded-md border border-input bg-surface px-1.5 py-0.5 tabular-nums text-text-main focus:border-accent focus:outline-none"
              aria-label="Задержка, календарных дней"
            />
            <span className="text-text-mute">дн</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={saveEdgeLag}
              className="rounded-lg border border-accent px-2 py-0.5 font-medium text-accent transition-colors hover:bg-accent-l"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Удалить зависимость?')) {
                  deleteDep.mutate(edgeMenu.id);
                  setEdgeMenu(null);
                }
              }}
              className="rounded-lg border border-border px-2 py-0.5 text-red transition-colors hover:border-red"
            >
              Удалить связь
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
