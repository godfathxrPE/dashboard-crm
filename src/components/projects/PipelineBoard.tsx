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
  ArrowUpDown,
  Loader2,
  FolderKanban,
} from 'lucide-react';
import {
  useProjects,
  useMoveProject,
  useDeleteProject,
  useUpdateProject,
  type Project,
} from '@/lib/hooks/use-projects';
import {
  phases,
  PHASE_CONFIG,
  STAGE_CONFIG,
  getPhaseForStage,
  getNextStage,
  formatBudget,
  sortOptions,
  type Phase,
  type DealStage,
  type SortOption,
} from '@/lib/validators/project';
import { ProjectCard } from './ProjectCard';
import { ProjectModal } from './ProjectModal';
import { LostDeals } from './LostDeals';

// ═══════════════════════════════════════════════════════
// Droppable Phase Column
// ═══════════════════════════════════════════════════════

function PhaseColumn({
  phase,
  projects,
  totalBudget,
  onEdit,
  onDelete,
  onAdvance,
  onOpen,
}: {
  phase: Phase;
  projects: Project[];
  totalBudget: number;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onAdvance: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  const config = PHASE_CONFIG[phase];

  return (
    <div
      ref={setNodeRef}
      className={`
        flex min-h-[200px] flex-1 flex-col rounded-xl border border-border/50 bg-bg
        transition-colors
        ${isOver ? 'border-accent/50 bg-accent-l/30' : ''}
      `}
    >
      {/* Column header */}
      <div className={`flex items-center gap-2 border-b border-border/50 px-3 py-2.5 ${config.bgColor}`}>
        <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
        <span className="text-xs font-semibold text-text-main">
          {config.label}
        </span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-mute">
          {projects.length}
        </span>
        {totalBudget > 0 && (
          <span className="ml-auto text-[10px] font-semibold text-text-dim">
            {formatBudget(totalBudget)}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 p-2">
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={onEdit}
              onDelete={onDelete}
              onAdvance={onAdvance}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>

        {/* Empty state */}
        {projects.length === 0 && (
          <div className="flex h-20 items-center justify-center text-xs text-text-mute">
            Перетащи проект сюда
          </div>
        )}
      </div>

      {/* Stages breakdown footer */}
      <div className="border-t border-border/30 px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {config.stages.map((stage) => {
            const count = projects.filter((p) => p.stage === stage).length;
            return (
              <span
                key={stage}
                className="text-[9px] text-text-mute"
                title={STAGE_CONFIG[stage].label}
              >
                {STAGE_CONFIG[stage].shortLabel}
                {count > 0 && (
                  <span className="ml-0.5 font-medium text-text-dim">
                    {count}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Won Section
// ═══════════════════════════════════════════════════════

function WonDeals({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;

  const totalWon = projects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

  return (
    <div className="mt-4 rounded-xl border border-green/30 bg-green/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-green" />
        <span className="text-sm font-semibold text-green">
          Выиграно: {projects.length}
        </span>
        {totalWon > 0 && (
          <span className="ml-auto text-sm font-medium text-green">
            {formatBudget(totalWon)}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Board
// ═══════════════════════════════════════════════════════

interface PipelineBoardProps {
  onSwitchView?: () => void;
}

export function PipelineBoard({ onSwitchView }: PipelineBoardProps = {}) {
  const { data: projects, isLoading, error } = useProjects();
  const { moveToStage } = useMoveProject();
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();

  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('created_at');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // ─── Group projects by phase ───
  const grouped = useMemo(() => {
    if (!projects) return { attract: [], develop: [], negotiate: [], close: [], won: [], lost: [] };

    // Sort
    const sorted = [...projects].sort((a, b) => {
      switch (sortBy) {
        case 'deadline':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'budget':
          return (b.budget ?? 0) - (a.budget ?? 0);
        case 'stage':
          return STAGE_CONFIG[a.stage].order - STAGE_CONFIG[b.stage].order;
        default: // created_at
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    const result: Record<Phase | 'won' | 'lost', Project[]> = {
      attract: [],
      develop: [],
      negotiate: [],
      close: [],
      won: [],
      lost: [],
    };

    for (const p of sorted) {
      if (p.stage === 'won') {
        result.won.push(p);
      } else if (p.stage === 'lost') {
        result.lost.push(p);
      } else {
        const phase = getPhaseForStage(p.stage);
        result[phase].push(p);
      }
    }

    return result;
  }, [projects, sortBy]);

  // ─── Drag handlers ───
  const activeProject = useMemo(
    () => projects?.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const projectId = active.id as string;
    const targetPhase = over.id as Phase;

    // Если дропнули в ту же фазу — ничего не делаем
    const project = projects?.find((p) => p.id === projectId);
    if (!project) return;

    const currentPhase = getPhaseForStage(project.stage);
    if (currentPhase === targetPhase) return;

    // Перемещаем в первую стадию целевой фазы
    const targetStage = PHASE_CONFIG[targetPhase].stages[0];
    moveToStage(projectId, targetStage);
  }

  // ─── Action handlers ───
  function handleEdit(project: Project) {
    setEditProject(project);
    setModalOpen(true);
  }

  function handleDelete(id: string) {
    if (confirm('Удалить проект? Это действие нельзя отменить.')) {
      deleteProject.mutate(id);
    }
  }

  function handleAdvance(id: string) {
    const project = projects?.find((p) => p.id === id);
    if (!project) return;
    const next = getNextStage(project.stage);
    if (next) moveToStage(id, next);
  }

  function handleOpen(id: string) {
    // Навигация на detail page
    window.location.href = `/projects/${id}`;
  }

  function handleRestore(id: string) {
    moveToStage(id, 'new_lead');
  }

  // ─── Budget totals per phase ───
  const phaseBudget = (phase: Phase) =>
    grouped[phase].reduce((sum, p) => sum + (p.budget ?? 0), 0);

  // ─── Loading / Error states ───
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
        <p className="mt-1 text-xs text-text-mute">{(error as Error).message}</p>
      </div>
    );
  }

  const activeCount = (projects ?? []).filter(
    (p) => p.stage !== 'won' && p.stage !== 'lost'
  ).length;

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">
            Воронка проектов
          </h1>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-mute">
            {activeCount} активн.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          {onSwitchView && (
            <button
              onClick={onSwitchView}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-dim
                         transition-colors hover:bg-surface-hover"
            >
              Доска
            </button>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <ArrowUpDown size={12} className="text-text-mute" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs text-text-dim focus:outline-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Add */}
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

      {/* Pipeline Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-4 gap-3">
          {phases.map((phase) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              projects={grouped[phase]}
              totalBudget={phaseBudget(phase)}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdvance={handleAdvance}
              onOpen={handleOpen}
            />
          ))}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeProject ? (
            <div className="rounded-lg border border-accent/50 bg-surface p-3 shadow-xl opacity-90 rotate-2">
              <p className="text-sm font-medium text-text-main">
                {activeProject.name}
              </p>
              <p className="mt-0.5 text-[10px] text-text-mute">
                {STAGE_CONFIG[activeProject.stage].label}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Won deals */}
      <WonDeals projects={grouped.won} />

      {/* Lost deals — collapsible */}
      <LostDeals
        projects={grouped.lost}
        onRestore={handleRestore}
        onDelete={handleDelete}
        onEdit={handleEdit}
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
