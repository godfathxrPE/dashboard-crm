'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ArrowRight,
  Building2,
  User,
  Calendar,
  Banknote,
  ChevronRight,
  CheckSquare,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  type Project,
} from '@/lib/hooks/use-projects';
import {
  STAGE_CONFIG,
  PHASE_CONFIG,
  dealStages,
  getNextStage,
  getPrevStage,
  formatBudget,
  type DealStage,
} from '@/lib/validators/project';
import { ProjectModal } from './ProjectModal';

// ═══════════════════════════════════════════════════════
// Stage Progress Bar — визуальный прогресс по pipeline
// Паттерн: Salesforce Opportunity Path Component
// ═══════════════════════════════════════════════════════

function StageProgress({ currentStage }: { currentStage: DealStage }) {
  const currentOrder = STAGE_CONFIG[currentStage].order;
  // Показываем только активные стадии (без won/lost)
  const activeStages = dealStages.filter((s) => s !== 'won' && s !== 'lost');

  return (
    <div className="flex gap-0.5 overflow-x-auto pb-1">
      {activeStages.map((stage) => {
        const config = STAGE_CONFIG[stage];
        const isCurrent = stage === currentStage;
        const isPast = config.order < currentOrder;
        const isWon = currentStage === 'won';

        return (
          <div
            key={stage}
            className="flex-1 text-center"
            title={config.label}
          >
            <div
              className={`
                h-1.5 rounded-full transition-colors
                ${isWon || isPast ? 'bg-green' : isCurrent ? 'bg-accent' : 'bg-border'}
              `}
            />
            <span
              className={`
                mt-1 block text-[8px] leading-tight
                ${isCurrent ? 'font-semibold text-accent' : isPast ? 'text-green' : 'text-text-mute'}
              `}
            >
              {config.shortLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Related Items Section (placeholder for Sprint 3-4)
// ═══════════════════════════════════════════════════════

function RelatedSection({
  title,
  icon: Icon,
  count,
  emptyText,
}: {
  title: string;
  icon: typeof CheckSquare;
  count: number;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">{title}</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-text-mute italic">{emptyText}</p>
      ) : (
        <p className="text-xs text-text-mute">
          {/* TODO: Sprint 3-4 — список связанных items */}
          Загрузка связанных записей...
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Detail View
// ═══════════════════════════════════════════════════════

interface ProjectDetailProps {
  projectId: string;
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red" />
        <p className="mt-2 text-sm text-red">Проект не найден</p>
        <button
          onClick={() => router.push('/projects')}
          className="mt-3 text-xs text-accent hover:underline"
        >
          ← Вернуться к воронке
        </button>
      </div>
    );
  }

  const stageConfig = STAGE_CONFIG[project.stage];
  const nextStage = getNextStage(project.stage);
  const prevStage = getPrevStage(project.stage);

    function handleAdvance() {
    if (!project) return;
    if (nextStage) {
       if (project) updateProject.mutate({ id: project.id, stage: nextStage });
    }
  }

  function handleRevert() {
    if (!project) return;
    if (prevStage) {
      updateProject.mutate({ id: project.id, stage: prevStage });
    }
  }

  function handleDelete() {
    if (!project) return;
    if (confirm('Удалить проект? Связанные задачи сохранятся (project_id станет null).')) {
      deleteProject.mutate(project.id, {
        onSuccess: () => router.push('/projects'),
      });
    }
  }

  return (
    <>
      {/* Back navigation */}
      <button
        onClick={() => router.push('/projects')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute
                   transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} />
        Воронка проектов
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-main">{project.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-mute">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stageConfig.probability > 50 ? 'bg-green/10 text-green' : 'bg-accent-l text-accent'}`}>
              {stageConfig.label} · {stageConfig.probability}%
            </span>
            <span>
              Создан {new Date(project.created_at).toLocaleDateString('ru-RU')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Revert */}
          {prevStage && project.stage !== 'won' && project.stage !== 'lost' && (
            <button
              onClick={handleRevert}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs
                         text-text-dim transition-colors hover:bg-surface-hover"
              title={`← ${STAGE_CONFIG[prevStage].shortLabel}`}
            >
              ← {STAGE_CONFIG[prevStage].shortLabel}
            </button>
          )}
          {/* Advance */}
          {nextStage && project.stage !== 'won' && project.stage !== 'lost' && (
            <button
              onClick={handleAdvance}
              className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5
                         text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              {STAGE_CONFIG[nextStage].shortLabel}
              <ArrowRight size={12} />
            </button>
          )}
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg border border-border p-1.5 text-text-mute
                       transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg border border-border p-1.5 text-text-mute
                       transition-colors hover:bg-red/10 hover:text-red"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Stage progress bar */}
      <div className="mb-6">
        <StageProgress currentStage={project.stage} />
      </div>

      {/* Info grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <InfoCard
          icon={Building2}
          label="Компания"
          value={project.company?.name ?? '—'}
        />
        <InfoCard
          icon={User}
          label="Контакт"
          value={project.contact ? `${project.contact.first_name} ${project.contact.last_name}` : '—'}
        />
        <InfoCard
          icon={Banknote}
          label="Бюджет"
          value={formatBudget(project.budget)}
        />
        <InfoCard
          icon={Calendar}
          label="Дедлайн"
          value={
            project.deadline
              ? new Date(project.deadline).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : '—'
          }
        />
      </div>

      {/* Next step */}
      {project.next_step && (
        <div className="mb-6 rounded-xl border border-accent/20 bg-accent-l/30 px-4 py-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-accent">
            <ChevronRight size={12} />
            Следующий шаг
          </div>
          <p className="text-sm text-text-main">{project.next_step}</p>
        </div>
      )}

      {/* Related items — placeholders, will be connected in Sprint 3-4 */}
      <div className="grid gap-4 md:grid-cols-2">
        <RelatedSection
          title="Связанные задачи"
          icon={CheckSquare}
          count={0}
          emptyText="Нет привязанных задач. Назначь задачу этому проекту на странице Задач."
        />
        <RelatedSection
          title="Звонки и встречи"
          icon={Calendar}
          count={0}
          emptyText="Нет записей. Связанные звонки появятся в Sprint 4."
        />
      </div>

      {/* Edit modal */}
      <ProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editProject={project}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════
// Small UI helper
// ═══════════════════════════════════════════════════════

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1 text-[10px] text-text-mute">
        <Icon size={10} />
        {label}
      </div>
      <div className="text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}
