'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  ArrowUpDown,
  Loader2,
  FolderKanban,
  X,
  Lock,
} from 'lucide-react';
import {
  useProjects,
  useMoveProject,
  useDeleteProject,
  useUpdateProject,
  parseStageGateError,
  type Project,
} from '@/lib/hooks/use-projects';
import type { UnmetRequirement } from '@/types/database';
import { formatBudget, sortOptions, type SortOption } from '@/lib/validators/project';
import { usePipelines, usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { mapToLegacyStage } from '@/lib/utils/stage-mapping';
import { applyProjectQuickFilter, type ProjectQuickFilter } from '@/lib/utils/project-filters';
import { ProjectCard } from './ProjectCard';
import { ProjectModal } from './ProjectModal';
import { LostDeals } from './LostDeals';
import { WonDeals } from './WonDeals';
import { useThemeStore } from '@/lib/stores/theme-store';
import { CTAButton } from '@/components/ui/CTAButton';
import type { PipelineStage, Direction } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Phase visual config — keyed by phase_group from DB
// ═══════════════════════════════════════════════════════

const PHASE_ORDER = ['attraction', 'working', 'approval', 'closing'] as const;

const PHASE_LABELS: Record<string, string> = {
  attraction: 'Привлечение',
  working: 'Проработка',
  approval: 'Согласование',
  closing: 'Закрытие',
};

const PHASE_TINT_COLOR: Record<string, string> = {
  attraction: 'var(--track-prep-current)',
  working: 'var(--track-exp-current)',
  approval: 'var(--track-nego-current, var(--track-exp-current))',
  closing: 'var(--track-proj-current)',
};

// Точка-маркер заголовка — track-current (заливка-цвет).
const PHASE_HEADER_COLOR: Record<string, string> = {
  attraction: 'var(--track-prep-current)',
  working: 'var(--track-exp-current)',
  approval: 'var(--track-nego-current, var(--track-exp-current))',
  closing: 'var(--track-proj-current)',
};

// Цвет ТЕКСТА заголовка — семантические *-text токены (visual-audit P1 §2.1).
// Fallback на базовый семантический токен, не на track-current (в paper/sand
// track-current — яркая пастель, нечитаемая как текст).
const PHASE_HEADER_TEXT: Record<string, string> = {
  attraction: 'var(--accent-text, var(--accent))',
  working: 'var(--purple-text, var(--purple))',
  approval: 'var(--yellow-text, var(--yellow))',
  closing: 'var(--blue-text, var(--blue))',
};

const WASHI_PHASE_KANJI: Record<string, { kanji: string; color: string }> = {
  attraction: { kanji: '集', color: '#2B5F8A' },
  working:    { kanji: '探', color: '#C23B3B' },
  approval:   { kanji: '合', color: '#D4993A' },
  closing:    { kanji: '結', color: '#5E7A3A' },
};

// ═══════════════════════════════════════════════════════
// Hero KPI Row
// ═══════════════════════════════════════════════════════

function HeroCard({ label, fmt, value, color, sub }: {
  label: string; fmt: string; value: number; color: string; sub?: string;
}) {
  return (
    <div className="rounded bg-surface2 px-3.5 py-3">
      <div className="text-xs font-medium uppercase tracking-[0.04em] text-text-dim mb-1">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums leading-none ${value === 0 ? 'text-text-mute' : color}`}>
        {fmt}
      </div>
      {sub && <div className="mt-1 text-[10px] tabular-nums text-text-mute">{sub}</div>}
    </div>
  );
}

function HeroMetrics({ projects }: { projects: Project[] }) {
  const { data: allStages } = usePipelineStages();
  const active = projects.filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');
  const won = projects.filter((p) => p.status === 'won');
  const lost = projects.filter((p) => p.status === 'lost');
  const pipeline = active.reduce((s, p) => s + (p.budget ?? 0), 0);
  const closed = won.length + lost.length;
  const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

  // Weighted forecast: Σ budget × probability стадии
  const weighted = active.reduce((s, p) => {
    const prob = allStages?.find((st) => st.id === p.stage_id)?.probability ?? 0;
    return s + (p.budget ?? 0) * prob / 100;
  }, 0);

  // Цикл: от создания до фактического закрытия (fallback — updated_at до миграции 019)
  const avgCycle = won.length > 0
    ? Math.round(
        won.reduce((s, p) => {
          const closedAt = p.actual_close_date ?? p.updated_at;
          return s + (new Date(closedAt).getTime() - new Date(p.created_at).getTime()) / 86400000;
        }, 0) / won.length,
      )
    : 0;

  const metrics: { label: string; value: number; fmt: string; color: string; sub?: string }[] = [
    { label: 'Активные', value: active.length, fmt: String(active.length), color: 'text-accent' },
    {
      label: 'Pipeline', value: pipeline, fmt: formatBudget(pipeline), color: 'text-green',
      sub: pipeline > 0 ? `взвеш. ${formatBudget(Math.round(weighted))}` : undefined,
    },
    { label: 'Конверсия', value: conversion, fmt: `${conversion}%`, color: 'text-green' },
    { label: 'Avg цикл', value: avgCycle, fmt: avgCycle > 0 ? `${avgCycle} дн` : '—', color: 'text-text-main' },
  ];

  return (
    <div data-stats-grid className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {metrics.map((m) => (
        <HeroCard key={m.label} label={m.label} fmt={m.fmt} value={m.value} color={m.color} sub={m.sub} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Phase column type (dynamic from pipeline_stages)
// ═══════════════════════════════════════════════════════

interface PhaseColumnData {
  id: string;          // phase_group value
  label: string;
  stages: PipelineStage[];
}

// ═══════════════════════════════════════════════════════
// Stage chip — дропзона конкретной стадии (внизу колонки)
// ═══════════════════════════════════════════════════════

function StageChip({ stage, count, dragging }: {
  stage: PipelineStage; count: number; dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  return (
    <span
      ref={setNodeRef}
      title={stage.name}
      className={`rounded px-1 py-0.5 text-[9px] transition-colors ${
        isOver
          ? 'border border-accent bg-accent-l text-accent'
          : dragging
            ? 'border border-dashed border-border2 text-text-dim'
            : 'text-text-mute'
      }`}
    >
      {stage.name}
      {count > 0 && <span className="ml-0.5 font-medium text-text-dim">{count}</span>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════
// Droppable Phase Column
// ═══════════════════════════════════════════════════════

function PhaseColumn({
  column,
  projects,
  allStages,
  totalBudget,
  isLast,
  dragging,
  onEdit,
  onDelete,
  onAdvance,
  onOpen,
}: {
  column: PhaseColumnData;
  projects: Project[];
  allStages: PipelineStage[];
  totalBudget: number;
  isLast: boolean;
  dragging: boolean;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onAdvance: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const themeVal = useThemeStore((s) => s.theme);
  const isWashi = themeVal === 't-washi';
  const wk = isWashi ? WASHI_PHASE_KANJI[column.id] : null;
  const headerColor = PHASE_HEADER_COLOR[column.id] ?? 'var(--accent)';
  const headerTextColor = PHASE_HEADER_TEXT[column.id] ?? 'var(--accent-text, var(--accent))';
  const tintColor = PHASE_TINT_COLOR[column.id] ?? 'var(--accent)';

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
          : `linear-gradient(180deg, color-mix(in srgb, ${tintColor} 8%, transparent) 0%, transparent 100%)`,
      }}
    >
      {/* Washi: kanji watermark */}
      {wk && (
        <span
          className="absolute select-none pointer-events-none"
          aria-hidden="true"
          style={{
            right: 10, top: 44, fontSize: '90px', lineHeight: 1,
            fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 400,
            color: wk.color, opacity: 0.045,
          }}
        >
          {wk.kanji}
        </span>
      )}

      {/* Column header */}
      <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: headerColor }} />
        <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: headerTextColor }}>
          {column.label}
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
          <div data-kanban-empty className="flex h-20 items-center justify-center">
            <span className="text-xs text-text-mute">Перетащи сделку сюда</span>
          </div>
        )}
      </div>

      {/* Stages breakdown — дропзоны конкретных стадий при активном drag */}
      <div className="border-t border-border/30 px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {column.stages.map((stg) => (
            <StageChip
              key={stg.id}
              stage={stg}
              count={projects.filter((p) => p.stage_id === stg.id).length}
              dragging={dragging}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Board
// ═══════════════════════════════════════════════════════

interface PipelineBoardProps {
  directionFilter?: 'all' | 'erp' | 'iiot';
  quickFilter?: ProjectQuickFilter | null;
  onSwitchView?: () => void;
}

export function PipelineBoard({ directionFilter = 'all', quickFilter = null, onSwitchView }: PipelineBoardProps = {}) {
  const router = useRouter();
  const { data: rawProjects, isLoading: loadingProjects, error } = useProjects('deals');
  const { data: pipelines } = usePipelines();
  const { data: allStages } = usePipelineStages();
  const { moveToStageId } = useMoveProject();
  const deleteProject = useDeleteProject();
  const { data: role } = useOrgRole();
  const canEdit = role !== 'viewer';

  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [focusNextAction, setFocusNextAction] = useState(false);
  const [nextActionPrompt, setNextActionPrompt] = useState<Project | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  // Sprint 27: отказ стадийного гейта — блокирующий баннер со списком требований
  const [gateBlock, setGateBlock] = useState<{ name: string; unmet: UnmetRequirement[] } | null>(null);

  // Sprint W1a: авто-скрытие мягкой подсказки «запланируй шаг»
  useEffect(() => {
    if (!nextActionPrompt) return;
    const t = setTimeout(() => setNextActionPrompt(null), 8000);
    return () => clearTimeout(t);
  }, [nextActionPrompt]);

  // Sprint 27: авто-скрытие баннера блокировки (дольше — надо прочитать список)
  useEffect(() => {
    if (!gateBlock) return;
    const t = setTimeout(() => setGateBlock(null), 10000);
    return () => clearTimeout(t);
  }, [gateBlock]);

  // Sprint 27: onError для перемещений — «переход заблокирован» вместо тихого rollback
  const onMoveError = (name: string) => (err: unknown) => {
    const unmet = parseStageGateError(err);
    if (unmet) setGateBlock({ name, unmet });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // Direction-filtered projects + быстрые пресеты (?q=attention|nobudget)
  const projects = useMemo(
    () => applyProjectQuickFilter(
      directionFilter === 'all' ? rawProjects ?? [] : (rawProjects ?? []).filter((p) => p.direction === directionFilter),
      quickFilter,
    ),
    [rawProjects, directionFilter, quickFilter],
  );

  // Effective pipeline: when 'all', show IIoT pipeline
  const effectiveDirection: Direction = directionFilter === 'all' ? 'iiot' : directionFilter;
  const activePipeline = useMemo(
    () => pipelines?.find((p) => p.direction === effectiveDirection && p.entity_type === 'deal' && p.is_default),
    [pipelines, effectiveDirection],
  );

  // Stages for the active pipeline
  const pipelineStages = useMemo(
    () => allStages?.filter((s) => s.pipeline_id === activePipeline?.id).sort((a, b) => a.order_index - b.order_index) ?? [],
    [allStages, activePipeline],
  );

  // Build phase columns from pipeline_stages
  const phaseColumns = useMemo<PhaseColumnData[]>(() => {
    return PHASE_ORDER
      .filter((phase) => pipelineStages.some((s) => s.phase_group === phase))
      .map((phase) => ({
        id: phase,
        label: PHASE_LABELS[phase] ?? phase,
        stages: pipelineStages.filter((s) => s.phase_group === phase && !s.is_won && !s.is_lost),
      }));
  }, [pipelineStages]);

  // Stage ID sets per phase (for fast lookup)
  const phaseStageIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const col of phaseColumns) {
      map.set(col.id, new Set(col.stages.map((s) => s.id)));
    }
    return map;
  }, [phaseColumns]);

  // Won/lost stage IDs
  const wonStageIds = useMemo(() => new Set(pipelineStages.filter((s) => s.is_won).map((s) => s.id)), [pipelineStages]);
  const lostStageIds = useMemo(() => new Set(pipelineStages.filter((s) => s.is_lost).map((s) => s.id)), [pipelineStages]);

  // Group projects into phase columns + won + lost
  const grouped = useMemo(() => {
    const result: Record<string, Project[]> = { won: [], lost: [] };
    for (const col of phaseColumns) result[col.id] = [];

    if (!projects) return result;

    const sorted = [...projects].sort((a, b) => {
      switch (sortBy) {
        case 'deadline':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'budget':
          return (b.budget ?? 0) - (a.budget ?? 0);
        case 'stage': {
          const aOrder = allStages?.find((s) => s.id === a.stage_id)?.order_index ?? 0;
          const bOrder = allStages?.find((s) => s.id === b.stage_id)?.order_index ?? 0;
          return aOrder - bOrder;
        }
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    for (const p of sorted) {
      if (!p.stage_id) continue; // PCT-1: internal-проект вне воронки
      if (wonStageIds.has(p.stage_id)) { result.won.push(p); continue; }
      if (lostStageIds.has(p.stage_id)) { result.lost.push(p); continue; }

      let placed = false;
      for (const col of phaseColumns) {
        if (phaseStageIds.get(col.id)?.has(p.stage_id)) {
          result[col.id].push(p);
          placed = true;
          break;
        }
      }
      // Projects from other pipelines (e.g. ERP when showing IIoT pipeline) — skip
      if (!placed && directionFilter === 'all') continue;
      // If direction matches but stage not found — put in first column
      if (!placed) result[phaseColumns[0]?.id]?.push(p);
    }
    return result;
  }, [projects, sortBy, phaseColumns, phaseStageIds, wonStageIds, lostStageIds, allStages, directionFilter]);

  const activeProject = useMemo(
    () => projects?.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  // ERP count for banner
  const erpCount = useMemo(
    () => directionFilter === 'all' ? (rawProjects ?? []).filter((p) => p.direction === 'erp').length : 0,
    [rawProjects, directionFilter],
  );

  function handleDragStart(event: DragStartEvent) { setActiveId(event.active.id as string); }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const project = projects?.find((p) => p.id === active.id as string);
    if (!project) return;

    // Drop на чип конкретной стадии (внизу колонки)
    if (String(over.id).startsWith('stage:')) {
      const stageId = String(over.id).slice(6);
      const targetStage = pipelineStages.find((s) => s.id === stageId);
      if (!targetStage || project.stage_id === targetStage.id) return;
      moveToStageId(project.id, targetStage.id, mapToLegacyStage(targetStage, project.direction), {
        onError: onMoveError(project.name),
      });
      const todayStage = new Date(new Date().toDateString());
      if (!project.next_action_date || new Date(project.next_action_date) < todayStage) {
        setNextActionPrompt(project);
      }
      return;
    }

    // Find target phase
    let targetPhaseId: string | undefined;
    // Check if dropped on a phase column directly
    if (phaseStageIds.has(over.id as string)) {
      targetPhaseId = over.id as string;
    } else {
      // Dropped on a card — find which phase it belongs to
      for (const col of phaseColumns) {
        if (grouped[col.id]?.some((p) => p.id === over.id)) {
          targetPhaseId = col.id;
          break;
        }
      }
    }

    if (!targetPhaseId) return;

    // Find current phase of the project
    let currentPhaseId: string | undefined;
    for (const col of phaseColumns) {
      if (project.stage_id && phaseStageIds.get(col.id)?.has(project.stage_id)) {
        currentPhaseId = col.id;
        break;
      }
    }
    if (currentPhaseId === targetPhaseId) return;

    // Target = first stage of that phase
    const targetCol = phaseColumns.find((c) => c.id === targetPhaseId);
    if (!targetCol || targetCol.stages.length === 0) return;
    const targetStage = targetCol.stages[0];

    const legacyStage = mapToLegacyStage(targetStage, project.direction);
    moveToStageId(project.id, targetStage.id, legacyStage, { onError: onMoveError(project.name) });

    // Sprint W1a: мягкая подсказка запланировать следующий шаг после переноса,
    // если дата шага пустая или в прошлом (drop-target — всегда активная фаза).
    const today = new Date(new Date().toDateString());
    if (!project.next_action_date || new Date(project.next_action_date) < today) {
      setNextActionPrompt(project);
    }
  }

  function handleEdit(project: Project) { setEditProject(project); setModalOpen(true); }
  function handleDelete(id: string) {
    const name = projects?.find((p) => p.id === id)?.name ?? 'сделка';
    if (confirm(`Удалить «${name}»? Это действие нельзя отменить.`)) deleteProject.mutate(id);
  }
  function handleAdvance(id: string) {
    const p = projects?.find((pr) => pr.id === id);
    if (!p) return;
    const currentStage = pipelineStages.find((s) => s.id === p.stage_id);
    if (!currentStage) return;
    const nextStage = pipelineStages.find((s) => s.order_index === currentStage.order_index + 1 && !s.is_won && !s.is_lost);
    if (!nextStage) return;
    const legacyStage = mapToLegacyStage(nextStage, p.direction);
    moveToStageId(id, nextStage.id, legacyStage, { onError: onMoveError(p.name) });
  }
  // Клиентская навигация: window.location.href давал полную перезагрузку
  // (первый клик «обновлял» страницу, не переходя на сделку)
  function handleOpen(id: string) { router.push(`/deals/${id}`); }
  function handleRestore(id: string) {
    // Move to first stage of the pipeline
    const firstStage = pipelineStages.find((s) => s.order_index === 1);
    if (!firstStage) return;
    const project = projects?.find((p) => p.id === id);
    const legacyStage = project ? mapToLegacyStage(firstStage, project.direction) : null;
    moveToStageId(id, firstStage.id, legacyStage);
  }

  const phaseBudget = (phaseId: string) =>
    (grouped[phaseId] ?? []).reduce((sum, p) => sum + (p.budget ?? 0), 0);

  const isLoading = loadingProjects || !pipelines || !allStages;

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
        <p className="text-sm text-red">Ошибка загрузки сделок</p>
      </div>
    );
  }

  const activeCount = Object.entries(grouped)
    .filter(([k]) => k !== 'won' && k !== 'lost')
    .reduce((sum, [, arr]) => sum + arr.length, 0);

  // Drag overlay: resolve stage name from pipeline_stages
  const activeProjectStageName = activeProject
    ? (allStages?.find((s) => s.id === activeProject.stage_id)?.name ?? '—')
    : '—';

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} className="text-accent" />
          <h1 className="aura-page-title text-text-main">Воронка сделок</h1>
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">{activeCount} активн.</span>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchView && (
            <>
              <button onClick={onSwitchView} className="rounded border border-border px-3 py-1.5 text-xs text-text-dim hover:bg-surface-hover">
                Доска
              </button>
              <a href="/deals?view=table" className="rounded border border-border px-3 py-1.5 text-xs text-text-dim hover:bg-surface-hover">
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
          {canEdit && (
            <CTAButton size="sm" onClick={() => { setEditProject(null); setModalOpen(true); }}>
              <Plus size={14} /> Сделка
            </CTAButton>
          )}
        </div>
      </div>

      {/* Hero Metrics */}
      <HeroMetrics projects={projects ?? []} />

      {/* ERP banner when direction=all */}
      {directionFilter === 'all' && erpCount > 0 && (
        <div className="mb-3 rounded border border-border px-4 py-2 text-xs text-text-mute">
          Показан IIoT-пайплайн. {erpCount} ERP-{erpCount === 1 ? 'сделка' : erpCount < 5 ? 'сделки' : 'сделок'} доступны в фильтре ERP.
        </div>
      )}

      {/* Pipeline columns */}
      {phaseColumns.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="rounded border border-border overflow-hidden elevation-1 grid animate-appear stagger-2"
            style={{ gridTemplateColumns: `repeat(${phaseColumns.length}, 1fr)` }}>
            {phaseColumns.map((col, i) => (
              <PhaseColumn
                key={col.id}
                column={col}
                projects={grouped[col.id] ?? []}
                allStages={pipelineStages}
                totalBudget={phaseBudget(col.id)}
                isLast={i === phaseColumns.length - 1}
                dragging={activeId !== null}
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
                <p className="mt-0.5 text-[10px] text-text-mute">{activeProjectStageName}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <WonDeals projects={grouped.won ?? []} />
      <LostDeals projects={grouped.lost ?? []} onRestore={handleRestore} onDelete={handleDelete} onEdit={handleEdit} />

      <ProjectModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditProject(null); setFocusNextAction(false); }}
        editProject={editProject}
        focusNextAction={focusNextAction}
      />

      {/* Sprint W1a: мягкая (не блокирующая) подсказка запланировать следующий шаг */}
      {nextActionPrompt && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-appear
                     flex items-center gap-3 rounded-lg border border-border bg-surface
                     px-4 py-2.5 elevation-3"
        >
          <span
            className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--yellow-text, var(--yellow))' }}
          />
          <span className="text-sm text-text-main">
            Запланируй следующий шаг для «{nextActionPrompt.name}»
          </span>
          <button
            onClick={() => {
              setEditProject(nextActionPrompt);
              setFocusNextAction(true);
              setModalOpen(true);
              setNextActionPrompt(null);
            }}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            Запланировать
          </button>
          <button
            onClick={() => setNextActionPrompt(null)}
            aria-label="Скрыть"
            className="rounded p-0.5 text-text-mute transition-colors hover:bg-surface2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sprint 27: блокирующий баннер стадийного гейта — карточка уже вернулась
          на место (optimistic rollback хука), показываем «что доделать» */}
      {gateBlock && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 animate-appear
                     rounded-lg border border-red/40 bg-surface px-4 py-3 elevation-3"
        >
          <div className="flex items-start gap-2.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-red" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-main">
                Переход заблокирован — «{gateBlock.name}»
              </p>
              <ul className="mt-1.5 space-y-1">
                {gateBlock.unmet.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px] text-text-dim">
                    <span className="mt-1.5 inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-red" />
                    <span>{r.hint}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setGateBlock(null)}
              aria-label="Скрыть"
              className="rounded p-0.5 text-text-mute transition-colors hover:bg-surface2"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
