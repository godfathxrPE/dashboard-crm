'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { GripVertical, Loader2, Rocket } from 'lucide-react';
import {
  useDeliveryProjects,
  useMoveProject,
  type Project,
} from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  DELIVERY_PHASE_ORDER,
  DELIVERY_PHASE_LABELS,
  DELIVERY_PHASE_COLOR,
  DELIVERY_KIND_LABELS,
  type DeliveryPhase,
} from '@/lib/constants/delivery-phases';
import { Badge } from '@/components/ui/Badge';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Delivery-канбан (раздел «Проекты», вкладка «Внедрение») — Sprint P1.
//
// Отдельный компонент, НЕ ветка PipelineBoard (тот хардкодит entity_type='deal').
// Колонки — 4 состояния (DELIVERY_PHASE_ORDER), проект попадает в колонку по
// phase_group своей стадии (stage_id → pipeline_stages project-пайплайна).
// ERP- и IIoT-внедрения живут на одной доске: слаги состояний у обоих
// пайплайнов одинаковые, drag резолвит стадию в пайплайне самого проекта.
// Legacy `stage` для delivery всегда NULL — в moveToStageId передаём null,
// mapToLegacyStage не зовём (B6).
// ═══════════════════════════════════════════════════════

function DeliveryCard({ project, stageName, onOpen }: {
  project: Project;
  stageName: string;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      className={`group rounded-lg border border-border bg-surface p-3 transition-shadow hover:elevation-1 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
          className="mt-0.5 shrink-0 cursor-grab text-text-mute opacity-0 transition-opacity group-hover:opacity-100"
        >
          <GripVertical size={12} />
        </button>
        <button
          onClick={() => onOpen(project.id)}
          className="min-w-0 flex-1 text-left text-sm font-medium text-text-main hover:text-accent"
        >
          {project.name}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5">
        <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
          {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
        </Badge>
        {project.delivery_kind && (
          <span className="text-[10px] text-text-mute">
            {DELIVERY_KIND_LABELS[project.delivery_kind] ?? project.delivery_kind}
          </span>
        )}
        {project.status === 'completed' && (
          <span className="rounded-full bg-green-l px-1.5 py-0.5 text-[10px] font-medium text-green">
            Завершён
          </span>
        )}
      </div>
      <div className="mt-1 pl-5 text-[10px] text-text-dim">
        {project.company?.name && <span>{project.company.name} · </span>}
        <span>{stageName}</span>
      </div>
    </div>
  );
}

function PhaseColumn({ phase, projects, stageNameOf, isLast, onOpen }: {
  phase: DeliveryPhase;
  projects: Project[];
  stageNameOf: (p: Project) => string;
  isLast: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  const color = DELIVERY_PHASE_COLOR[phase] ?? 'var(--accent)';

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] flex-1 flex-col transition-colors ${
        !isLast ? 'border-r border-border/50' : ''
      } ${isOver ? 'bg-accent-l/20' : ''}`}
      style={{
        background: isOver
          ? undefined
          : `linear-gradient(180deg, color-mix(in srgb, ${color} 8%, transparent) 0%, transparent 100%)`,
      }}
    >
      <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color }}>
          {DELIVERY_PHASE_LABELS[phase]}
        </span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-mute">
          {projects.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {projects.map((p) => (
          <DeliveryCard key={p.id} project={p} stageName={stageNameOf(p)} onOpen={onOpen} />
        ))}
        {projects.length === 0 && (
          <div data-kanban-empty className="flex h-20 items-center justify-center">
            <span className="text-xs text-text-mute">Перетащи проект сюда</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DeliveryPipelineBoard() {
  const router = useRouter();
  const { data: rawProjects, isLoading: loadingProjects, error } = useDeliveryProjects();
  const { data: allStages } = usePipelineStages();
  const { moveToStageId } = useMoveProject();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const deliveryProjects = useMemo(
    () => (rawProjects ?? []).filter((p) => p.type === 'delivery'),
    [rawProjects],
  );

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    allStages?.forEach((s) => map.set(s.id, s));
    return map;
  }, [allStages]);

  // Группировка по состоянию (phase_group стадии проекта)
  const grouped = useMemo(() => {
    const result = Object.fromEntries(
      DELIVERY_PHASE_ORDER.map((ph) => [ph, [] as Project[]]),
    ) as Record<DeliveryPhase, Project[]>;
    for (const p of deliveryProjects) {
      const phase = p.stage_id ? stageById.get(p.stage_id)?.phase_group : null;
      if (phase && (DELIVERY_PHASE_ORDER as readonly string[]).includes(phase)) {
        result[phase as DeliveryPhase].push(p);
      } else {
        // стадия ещё не загрузилась / неизвестная группа — не теряем карточку
        result.initiated.push(p);
      }
    }
    return result;
  }, [deliveryProjects, stageById]);

  const stageNameOf = (p: Project) =>
    (p.stage_id ? stageById.get(p.stage_id)?.name : null) ?? '—';

  const activeProject = useMemo(
    () => deliveryProjects.find((p) => p.id === activeId) ?? null,
    [deliveryProjects, activeId],
  );

  function handleDragStart(e: DragStartEvent) { setActiveId(e.active.id as string); }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const project = deliveryProjects.find((p) => p.id === active.id);
    if (!project || !project.pipeline_id) return;

    const targetPhase = over.id as string;
    if (!(DELIVERY_PHASE_ORDER as readonly string[]).includes(targetPhase)) return;

    const currentPhase = project.stage_id ? stageById.get(project.stage_id)?.phase_group : null;
    if (currentPhase === targetPhase) return;

    // Целевая стадия — первая (min order_index) стадия состояния в пайплайне проекта
    const targetStage = (allStages ?? [])
      .filter((s) => s.pipeline_id === project.pipeline_id && s.phase_group === targetPhase)
      .sort((a, b) => a.order_index - b.order_index)[0];
    if (!targetStage) return;

    // B6: legacy stage для delivery всегда null (mapToLegacyStage не зовём)
    moveToStageId(project.id, targetStage.id, null);
  }

  function handleOpen(id: string) { router.push(`/projects/${id}`); }

  if (loadingProjects || !allStages) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки проектов внедрения</p>
      </div>
    );
  }
  if (deliveryProjects.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center">
        <Rocket size={28} className="mx-auto text-text-mute" />
        <p className="mt-3 text-sm text-text-dim">Пока нет проектов внедрения</p>
        <p className="mt-1 text-xs text-text-mute">
          Проект внедрения создаётся из выигранной сделки — кнопкой «Создать проект внедрения» на её карточке.
        </p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid overflow-hidden rounded border border-border elevation-1"
        style={{ gridTemplateColumns: `repeat(${DELIVERY_PHASE_ORDER.length}, 1fr)` }}>
        {DELIVERY_PHASE_ORDER.map((phase, i) => (
          <PhaseColumn
            key={phase}
            phase={phase}
            projects={grouped[phase]}
            stageNameOf={stageNameOf}
            isLast={i === DELIVERY_PHASE_ORDER.length - 1}
            onOpen={handleOpen}
          />
        ))}
      </div>

      <DragOverlay>
        {activeProject ? (
          <div className="max-w-[250px] rotate-2 rounded bg-surface p-3 opacity-90 elevation-3">
            <p className="text-sm font-medium text-text-main">{activeProject.name}</p>
            <p className="mt-0.5 text-[10px] text-text-mute">{stageNameOf(activeProject)}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
