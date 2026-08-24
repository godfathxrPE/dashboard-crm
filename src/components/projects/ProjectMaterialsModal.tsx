'use client';

import { ExternalLink, Link2, StickyNote } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { Modal } from '@/components/shared/Modal';
import { ProjectFiles } from './ProjectFiles';
import { ProjectVideos } from './ProjectVideos';
import { safeHref } from '@/lib/utils/safe-href';

// ═══════════════════════════════════════════════════════
// S-DEAL-CTX-1 (R-08, L-08): «Материалы проекта» — модалка вместо аккордеона
// в потоке карточки.
//
// Почему модалка, а не раскрытие прямо в рельсе: дроп-зона файлов в колонке
// 320px не работает. Почему не drawer: `ActivityDrawer` — единственный drawer
// приложения и он занят; вторая сущность того же рода заводится без нужды.
//
// Содержимое перенесено из снятого `ProjectMaterials` как есть: разметка блоков
// 1С:ДО, заметок команды, файлов и видео не менялась.
// ═══════════════════════════════════════════════════════

export interface ProjectMaterialsModalProps {
  project: Project;
  canManage: boolean;
  onClose: () => void;
}

export function ProjectMaterialsModal({
  project, canManage, onClose,
}: ProjectMaterialsModalProps) {
  const updateProject = useUpdateProject();
  // `projectId` и `isDelivery` выводятся из project — производные значения
  // пропами не гоняем, иначе появляется второй источник той же истины.
  const projectId = project.id;
  const isDelivery = project.type === 'delivery';
  const doHref = safeHref(project.do_url); // фильтр схемы для внешней ссылки 1С:ДО

  return (
    <Modal
      title="Материалы проекта"
      description="1С:ДО · заметки · файлы · видео"
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
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
            projects.pinned_note (017); на client заметка уже в рельсе («Закреплено»)
            — не дублируем. Пишет canManage, команда читает. */}
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
    </Modal>
  );
}
