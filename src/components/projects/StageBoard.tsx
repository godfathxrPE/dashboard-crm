'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import {
  Plus,
  Trophy,
  Loader2,
  FolderKanban,
  Building2,
  Banknote,
  Calendar,
  User,
} from 'lucide-react';
import {
  useProjects,
  useMoveProject,
  useDeleteProject,
  type Project,
} from '@/lib/hooks/use-projects';
import {
  STAGE_CONFIG,
  PHASE_CONFIG,
  dealStages,
  getActiveStages,
  getNextStage,
  formatBudget,
  type DealStage,
} from '@/lib/validators/project';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProjectModal } from './ProjectModal';
import { LostDeals } from './LostDeals';

// ═══════════════════════════════════════════════════════
// Deadline urgency color
// ═══════════════════════════════════════════════════════

function deadlineColor(deadline: string | null): string {
  if (!deadline) return '';
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return 'text-red font-medium';
  if (days < 14) return 'text-red';
  if (days < 30) return 'text-yellow';
  return 'text-green';
}

// ═══════════════════════════════════════════════════════
// Board Card — compact, stage-specific
// ═══════════════════════════════════════════════════════

function BoardCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(project.id)}
      className={`
        cursor-grab rounded-lg bg-surface p-2.5 overflow-hidden glass-card
        shadow-card transition-all duration-fast hover:shadow-card-hover
        hover:-translate-y-px active:cursor-grabbing
        ${isDragging ? 'opacity-50 shadow-lg ring-2 ring-accent/30 rotate-1' : ''}
      `}
    >
      <p className="text-xs font-semibold text-text-main leading-tight">
        {project.name}
      </p>

      <div className="mt-1.5 flex flex-col gap-0.5">
        {project.company?.name && (
          <span className="flex items-center gap-1 text-[10px] text-text-mute">
            <Building2 size={9} />
            <span className="truncate">{project.company.name}</span>
          </span>
        )}
        {project.contact && (
          <span className="flex items-center gap-1 text-[10px] text-text-mute">
            <User size={9} />
            <span className="truncate">
              {project.contact.first_name} {project.contact.last_name}
            </span>
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        {project.budget != null && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-text-dim">
            <Banknote size={9} />
            {formatBudget(project.budget)}
          </span>
        )}
        {project.deadline && (
          <span
            className={`flex items-center gap-0.5 text-[10px] ${deadlineColor(project.deadline)}`}
          >
            <Calendar size={9} />
            {new Date(project.deadline).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        )}
      </div>

      {/* Stage progress */}
      <div
        className="stage-progress mt-2 -mx-2.5 -mb-2.5"
        style={{
          background: `linear-gradient(to right, var(--accent) ${Math.round(((STAGE_CONFIG[project.stage]?.order ?? 0) + 1) / 12 * 100)}%, var(--border) 0%)`,
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Stage Column
// ═══════════════════════════════════════════════════════

function StageColumn({
  stage,
  projects,
  onOpen,
}: {
  stage: DealStage;
  projects: Project[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const config = STAGE_CONFIG[stage];
  const phaseConfig = PHASE_CONFIG[config.phase];
  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);

  const isEmpty = projects.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={`
        flex shrink-0 flex-col rounded-xl snap-start transition-all duration-150
        ${isEmpty
          ? 'w-32 border border-dashed border-border/50 bg-bg/50'
          : 'w-56 bg-bg shadow-card'}
        ${isOver ? 'border-accent/50 bg-accent-l/20 shadow-card-hover' : ''}
      `}
    >
      {/* Header */}
      <div className={`border-b border-border/50 px-2.5 py-2 rounded-t-xl ${phaseConfig.bgColor}`}>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${phaseConfig.dotColor}`} />
          <span className="truncate text-[11px] font-semibold text-text-main">
            {config.shortLabel}
          </span>
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-mute">
            {projects.length}
          </span>
        </div>
        {totalBudget > 0 && (
          <div className="mt-0.5 text-[10px] font-semibold text-text-dim">
            {formatBudget(totalBudget)}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5" style={{ minHeight: 80 }}>
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {projects.map((project) => (
            <BoardCard key={project.id} project={project} onOpen={onOpen} />
          ))}
        </SortableContext>

        {projects.length === 0 && (
          <div className="flex h-16 items-center justify-center text-[10px] text-text-mute">
            Перетащите проект сюда
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Won Section
// ═══════════════════════════════════════════════════════

function WonDeals({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;
  const total = projects.reduce((s, p) => s + (p.budget ?? 0), 0);

  return (
    <div className="mt-4 rounded-xl border border-green/30 bg-green/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-green" />
        <span className="text-sm font-semibold text-green">
          Выиграно: {projects.length}
        </span>
        {total > 0 && (
          <span className="ml-auto text-sm font-medium text-green">
            {formatBudget(total)}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Board
// ═══════════════════════════════════════════════════════

interface StageBoardProps {
  onSwitchView: () => void;
}

export function StageBoard({ onSwitchView }: StageBoardProps) {
  const { data: projects, isLoading, error } = useProjects();
  const { moveToStage } = useMoveProject();
  const deleteProject = useDeleteProject();

  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const activeStages = getActiveStages();

  // Group by stage
  const grouped = useMemo(() => {
    const result: Record<string, Project[]> = {};
    for (const s of dealStages) result[s] = [];
    if (!projects) return result;

    for (const p of projects) {
      result[p.stage].push(p);
    }
    // Sort within each stage by created_at desc
    for (const key of Object.keys(result)) {
      result[key].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return result;
  }, [projects]);

  const activeProject = useMemo(
    () => projects?.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const projectId = active.id as string;
    const project = projects?.find((p) => p.id === projectId);
    if (!project) return;

    // over.id can be a stage (droppable) or another project id (sortable)
    let targetStage: DealStage;
    if (activeStages.includes(over.id as DealStage)) {
      targetStage = over.id as DealStage;
    } else {
      // Dropped on a card — find its stage
      const targetProject = projects?.find((p) => p.id === over.id);
      if (!targetProject) return;
      targetStage = targetProject.stage;
    }

    if (project.stage === targetStage) return;
    moveToStage(projectId, targetStage);
  }

  function handleOpen(id: string) {
    window.location.href = `/projects/${id}`;
  }

  function handleRestore(id: string) {
    moveToStage(id, 'new_lead');
  }

  function handleDelete(id: string) {
    if (confirm('Удалить проект?')) deleteProject.mutate(id);
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки проектов</p>
      </div>
    );
  }

  const activeCount = (projects ?? []).filter(
    (p) => p.stage !== 'won' && p.stage !== 'lost',
  ).length;

  const totalProjects = projects?.length ?? 0;

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">
            Доска по стадиям
          </h1>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-mute">
            {activeCount} активн.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <button
            onClick={onSwitchView}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-dim
                       transition-colors hover:bg-surface-hover"
          >
            Воронка
          </button>

          <button
            onClick={() => {
              setEditProject(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5
                       text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} />
            Проект
          </button>
        </div>
      </div>

      {/* Empty state */}
      {totalProjects === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg py-16">
          <FolderKanban size={32} className="text-text-mute" />
          <p className="mt-3 text-sm text-text-mute">Пока нет проектов</p>
          <button
            onClick={() => {
              setEditProject(null);
              setModalOpen(true);
            }}
            className="mt-4 flex items-center gap-1 rounded-lg bg-accent px-4 py-2
                       text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={14} />
            Создать проект
          </button>
        </div>
      )}

      {/* Stage Kanban */}
      {totalProjects > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            className="flex gap-2.5 overflow-x-auto pb-4 snap-x snap-mandatory
                       md:snap-none"
          >
            {activeStages.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                projects={grouped[stage]}
                onOpen={handleOpen}
              />
            ))}
          </div>

          <DragOverlay>
            {activeProject ? (
              <div className="w-56 rounded-lg border border-accent/50 bg-surface p-2.5 shadow-xl opacity-90 rotate-2">
                <p className="text-xs font-semibold text-text-main">
                  {activeProject.name}
                </p>
                <p className="mt-0.5 text-[10px] text-text-mute">
                  {STAGE_CONFIG[activeProject.stage].label}
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Won */}
      <WonDeals projects={grouped.won ?? []} />

      {/* Lost */}
      <LostDeals
        projects={grouped.lost ?? []}
        onRestore={handleRestore}
        onDelete={handleDelete}
        onEdit={(p) => {
          setEditProject(p);
          setModalOpen(true);
        }}
      />

      {/* Modal */}
      <ProjectModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditProject(null);
        }}
        editProject={editProject}
      />
    </>
  );
}
