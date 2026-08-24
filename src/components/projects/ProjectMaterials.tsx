'use client';

import { useState } from 'react';
import { ChevronRight, ExternalLink, Link2, StickyNote } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { ProjectFiles } from './ProjectFiles';
import { ProjectVideos } from './ProjectVideos';
import { safeHref } from '@/lib/utils/safe-href';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// «Материалы проекта» — 1С:ДО, заметки команды, файлы, видео.
//
// S-DEAL-RAIL-1: секция вынесена из `ProjectDetail` БЕЗ изменений разметки и
// поведения — только чтобы карточка перестала быть файлом на 950 строк.
// Переработка самой секции (счётчики в рельсе, R-08) — отдельный спринт.
// ═══════════════════════════════════════════════════════

export function ProjectMaterials({
  project,
  projectId,
  isDelivery,
  canManage,
}: {
  project: Project;
  projectId: string;
  isDelivery: boolean;
  canManage: boolean;
}) {
  const updateProject = useUpdateProject();
  // M5 (F-10): по умолчанию свёрнуто — табы и План видны без скролла.
  const [showMaterials, setShowMaterials] = useState(false);
  const doHref = safeHref(project.do_url); // фильтр схемы для внешней ссылки 1С:ДО

  // M5 (F-10): 1С:ДО / заметки / файлы / видео уходят под сгиб — сворачиваемая
  // секция (по умолчанию закрыта), чтобы табы и План были видны без скролла.
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setShowMaterials((v) => !v)}
        aria-expanded={showMaterials}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-left transition-colors hover:bg-surface2"
      >
        <ChevronRight size={15} className={cn('shrink-0 text-text-mute transition-transform', showMaterials && 'rotate-90')} />
        <span className="text-xs font-semibold uppercase tracking-wide text-text-mute">Материалы проекта</span>
        <span className="ml-auto text-meta text-text-mute">1С:ДО · заметки · файлы · видео</span>
      </button>
      {showMaterials && (
        <div className="mt-3 space-y-4">
          {/* Delivery P1 (B5): ссылка на проект в 1С:Документооборот (редактируемая) */}
          {isDelivery && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
              <Link2 size={13} className="shrink-0 text-text-dim" />
              <span className="shrink-0 text-body text-text-dim">1С:ДО</span>
              <div className="min-w-0 flex-1">
                <InlineEdit
                  value={project.do_url ?? ''}
                  type="text"
                  placeholder="Вставить ссылку на проект в 1С:ДО"
                  onSave={async (val) => {
                    updateProject.mutate({ id: project.id, do_url: val.trim() || null });
                  }}
                  className="text-sm"
                />
              </div>
              {doHref && (
                <a
                  href={doHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Открыть в 1С:ДО"
                  className="shrink-0 rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-accent"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          )}

          {/* S-PROJECT-WORKSPACE-1 (п.6): заметки проекта для команды — переиспользуем
              projects.pinned_note (017); на client заметка уже в DealFocusPanel — не дублируем.
              Пишет canManage, команда читает (v1; all-team edit — NEXT, требует RLS-решения). */}
          {(isDelivery || project.type === 'internal') && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-main">
                <StickyNote size={14} className="text-text-dim" /> Заметки проекта
              </div>
              {canManage ? (
                <div className="text-body leading-relaxed">
                  <InlineEdit
                    as="textarea"
                    value={project.pinned_note ?? ''}
                    placeholder="Заметки для команды…"
                    onSave={async (val) => {
                      updateProject.mutate({ id: project.id, pinned_note: val || null });
                    }}
                  />
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-body leading-relaxed text-text-main">
                  {project.pinned_note || <span className="text-text-mute">Заметок пока нет</span>}
                </p>
              )}
            </div>
          )}

          {/* ═══ Files ═══ */}
          <ProjectFiles projectId={projectId} />

          {/* ═══ Videos (S-VIDEO-EMBED-1) ═══ */}
          <ProjectVideos projectId={projectId} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
