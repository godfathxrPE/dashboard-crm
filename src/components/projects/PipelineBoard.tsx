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
import { useThemeStore } from '@/lib/stores/theme-store';

// Phase tint colors for column backgrounds (inline style, works with all themes)
const PHASE_TINT_COLOR: Record<Phase, string> = {
  attract: 'var(--track-prep-current)',
  develop: 'var(--track-exp-current)',
  negotiate: 'var(--track-nego-current, var(--track-exp-current))',
  close: 'var(--track-proj-current)',
};

const PHASE_HEADER_COLOR: Record<Phase, string> = {
  attract: 'var(--track-prep-current)',
  develop: 'var(--track-exp-current)',
  negotiate: 'var(--track-nego-current, var(--track-exp-current))',
  close: 'var(--track-proj-current)',
};

// ═══════════════════════════════════════════════════════
// Hero KPI Row
// ═══════════════════════════════════════════════════════

function HeroMetrics({ projects }: { projects: Project[] }) {
  const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');
  const won = projects.filter((p) => p.stage === 'won');
  const lost = projects.filter((p) => p.stage === 'lost');
  const pipeline = active.reduce((s, p) => s + (p.budget ?? 0), 0);
  const closed = won.length + lost.length;
  const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

  // Avg cycle: days from created_at to won
  const avgCycle = won.length > 0
    ? Math.round(
        won.reduce((s, p) => {
          return s + (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / 86400000;
        }, 0) / won.length,
      )
    : 0;

  const metrics = [
    { label: 'Активные', value: active.length, fmt: String(active.length), color: 'text-accent' },
    { label: 'Pipeline', value: pipeline, fmt: formatBudget(pipeline), color: 'text-green' },
    { label: 'Конверсия', value: conversion, fmt: `${conversion}%`, color: 'text-green' },
    { label: 'Avg цикл', value: avgCycle, fmt: avgCycle > 0 ? `${avgCycle} дн` : '—', color: 'text-text-main' },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="rounded bg-surface2 px-3.5 py-3">
          <div className="text-xs font-medium uppercase tracking-[0.04em] text-text-dim mb-1">
            {m.label}
          </div>
          <div className={`text-2xl font-extrabold tabular-nums leading-none ${m.value === 0 ? 'text-text-mute' : m.color}`}>
            {m.fmt}
          </div>
        </div>
      ))}
    </div>
  );
}

const WASHI_PHASE_KANJI: Record<Phase, { kanji: string; color: string }> = {
  attract:   { kanji: '集', color: '#2B5F8A' },
  develop:   { kanji: '探', color: '#C23B3B' },
  negotiate: { kanji: '合', color: '#D4993A' },
  close:     { kanji: '結', color: '#5E7A3A' },
};

// ═══════════════════════════════════════════════════════
// Droppable Phase Column — tinted
// ═══════════════════════════════════════════════════════

function PhaseColumn({
  phase,
  projects,
  totalBudget,
  isLast,
  onEdit,
  onDelete,
  onAdvance,
  onOpen,
}: {
  phase: Phase;
  projects: Project[];
  totalBudget: number;
  isLast: boolean;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onAdvance: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase });
  const config = PHASE_CONFIG[phase];
  const isWashi = useThemeStore((s) => s.theme) === 't-washi';
  const wk = isWashi ? WASHI_PHASE_KANJI[phase] : null;

  return (
    <div
      ref={setNodeRef}
      className={`
        relative flex min-h-[200px] flex-1 flex-col transition-colors overflow-hidden
        ${!isLast ? 'border-r border-border/50' : ''}
        ${isOver ? 'bg-accent-l/20' : ''}
      `}
      style={{
        background: isOver
          ? undefined
          : `linear-gradient(180deg, color-mix(in srgb, ${PHASE_TINT_COLOR[phase]} 8%, transparent) 0%, transparent 100%)`,
      }}
    >
      {/* Washi: kanji watermark */}
      {wk && (
        <span
          className="absolute select-none pointer-events-none"
          aria-hidden="true"
          style={{
            right: 10,
            top: 44,
            fontSize: '90px',
            lineHeight: 1,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 400,
            color: wk.color,
            opacity: 0.045,
          }}
        >
          {wk.kanji}
        </span>
      )}
      {/* Column header */}
      <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PHASE_HEADER_COLOR[phase] }} />
        <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: PHASE_HEADER_COLOR[phase] }}>
          {config.label}
        </span>
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-mute">
          {projects.length}
        </span>
        {totalBudget > 0 && (
          <span className="ml-auto text-[10px] font-semibold text-text-dim tabular-nums">
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

        {projects.length === 0 && (
          <div className="flex h-20 items-center justify-center">
            <span className="text-xs text-text-mute">Перетащи проект сюда</span>
          </div>
        )}
      </div>

      {/* Stages breakdown */}
      <div className="border-t border-border/30 px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {config.stages.map((stage) => {
            const count = projects.filter((p) => p.stage === stage).length;
            return (
              <span key={stage} className="text-[9px] text-text-mute" title={STAGE_CONFIG[stage].label}>
                {STAGE_CONFIG[stage].shortLabel}
                {count > 0 && <span className="ml-0.5 font-medium text-text-dim">{count}</span>}
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
  const total = projects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

  return (
    <div className="mt-4 rounded border border-green/30 bg-green/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-green" />
        <span className="text-sm font-semibold text-green">Выиграно: {projects.length}</span>
        {total > 0 && (
          <span className="ml-auto text-sm font-medium text-green tabular-nums">{formatBudget(total)}</span>
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

  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('created_at');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const grouped = useMemo(() => {
    if (!projects) return { attract: [], develop: [], negotiate: [], close: [], won: [], lost: [] };
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
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    const result: Record<Phase | 'won' | 'lost', Project[]> = {
      attract: [], develop: [], negotiate: [], close: [], won: [], lost: [],
    };
    for (const p of sorted) {
      if (p.stage === 'won') result.won.push(p);
      else if (p.stage === 'lost') result.lost.push(p);
      else result[getPhaseForStage(p.stage)].push(p);
    }
    return result;
  }, [projects, sortBy]);

  const activeProject = useMemo(
    () => projects?.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  function handleDragStart(event: DragStartEvent) { setActiveId(event.active.id as string); }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const project = projects?.find((p) => p.id === active.id as string);
    if (!project) return;
    const currentPhase = getPhaseForStage(project.stage);

    // over.id can be a phase (droppable) or a project id (sortable card)
    let targetPhase: Phase | undefined;
    if (phases.includes(over.id as Phase)) {
      targetPhase = over.id as Phase;
    } else {
      // Dropped on a card — find which phase it belongs to
      for (const ph of phases) {
        if (grouped[ph].some((p) => p.id === over.id)) {
          targetPhase = ph;
          break;
        }
      }
    }

    if (!targetPhase || currentPhase === targetPhase) return;
    moveToStage(active.id as string, PHASE_CONFIG[targetPhase].stages[0]);
  }

  function handleEdit(project: Project) { setEditProject(project); setModalOpen(true); }
  function handleDelete(id: string) {
    const name = projects?.find((p) => p.id === id)?.name ?? 'проект';
    if (confirm(`Удалить «${name}»? Это действие нельзя отменить.`)) deleteProject.mutate(id);
  }
  function handleAdvance(id: string) {
    const p = projects?.find((pr) => pr.id === id);
    if (p) { const n = getNextStage(p.stage); if (n) moveToStage(id, n); }
  }
  function handleOpen(id: string) { window.location.href = `/projects/${id}`; }
  function handleRestore(id: string) { moveToStage(id, 'new_lead'); }

  const phaseBudget = (phase: Phase) =>
    grouped[phase].reduce((sum, p) => sum + (p.budget ?? 0), 0);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки проектов</p>
      </div>
    );
  }

  const activeCount = (projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost').length;

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Воронка проектов</h1>
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">{activeCount} активн.</span>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchView && (
            <>
              <button onClick={onSwitchView} className="rounded border border-border px-3 py-1.5 text-xs text-text-dim hover:bg-surface-hover">
                Доска
              </button>
              <a href="/projects?view=table" className="rounded border border-border px-3 py-1.5 text-xs text-text-dim hover:bg-surface-hover">
                Таблица
              </a>
            </>
          )}
          <div className="flex items-center gap-1 rounded border border-border px-2 py-1">
            <ArrowUpDown size={12} className="text-text-mute" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs text-text-dim focus:outline-none">
              {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={() => { setEditProject(null); setModalOpen(true); }}
            className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            <Plus size={14} /> Проект
          </button>
        </div>
      </div>

      {/* Hero Metrics */}
      <HeroMetrics projects={projects ?? []} />

      {/* Pipeline columns in single card */}
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="rounded border border-border overflow-hidden elevation-1 grid grid-cols-4 animate-appear stagger-2">
          {phases.map((phase, i) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              projects={grouped[phase]}
              totalBudget={phaseBudget(phase)}
              isLast={i === phases.length - 1}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdvance={handleAdvance}
              onOpen={handleOpen}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProject ? (
            <div className="rounded bg-surface p-3 elevation-3 opacity-90 rotate-2 max-w-[250px]">
              <p className="text-sm font-medium text-text-main">{activeProject.name}</p>
              <p className="mt-0.5 text-[10px] text-text-mute">{STAGE_CONFIG[activeProject.stage].label}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <WonDeals projects={grouped.won} />
      <LostDeals projects={grouped.lost} onRestore={handleRestore} onDelete={handleDelete} onEdit={handleEdit} />

      <ProjectModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditProject(null); }} editProject={editProject} />
    </>
  );
}
