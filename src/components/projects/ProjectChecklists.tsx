'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck, Loader2, Plus } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import {
  useAddProjectChecklist,
  useChecklistTemplates,
  useProjectChecklists,
} from '@/lib/hooks/use-project-checklists';
import { checklistTypeLabel } from '@/lib/constants/checklists';
import { ChecklistCard } from './ChecklistCard';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// R2-P1-G: секция sign-off чеклистов проекта внедрения (083/084).
//
// Кнопка «Добавить чеклист» (owner/admin) — единственный путь получить чеклисты на
// УЖЕ ИДУЩЕМ внедрении: бэкфилла сознательно нет. Сид навесил бы обязательные пункты
// на три живых проекта, и они моментально стали бы незавершаемыми без действия РП —
// regression, даже если продуктово «правильно» (Открытое решение 2 спринта).
//
// Новые внедрения получают чеклисты сами: instantiate_project_checklists вызывается
// из spawn_delivery_project (084).
// ═══════════════════════════════════════════════════════

export function ProjectChecklists({ project }: { project: Project }) {
  const { data: role } = useOrgRole();
  const canManage = role === 'owner' || role === 'admin';
  const readOnly = project.status !== 'open';

  const { data: checklists = [], isPending } = useProjectChecklists(project.id);
  // Шаблоны нужны только для кнопки добавления — рядовому участнику не запрашиваем.
  const { data: templates = [] } = useChecklistTemplates();
  const addChecklist = useAddProjectChecklist();

  const [picking, setPicking] = useState(false);

  // Уже развёрнутые типы: `unique (project_id, checklist_type)` не даст завести второй.
  const usedTypes = useMemo(
    () => new Set(checklists.map((c) => c.checklist_type)),
    [checklists],
  );

  const available = useMemo(
    () => templates.filter((t) => t.is_active && !usedTypes.has(t.checklist_type)),
    [templates, usedTypes],
  );

  // Нечего показать и нечего добавить — секции нет вовсе (не пустая рамка).
  if (isPending) {
    return (
      <div className="mb-6 flex items-center gap-2 text-xs text-text-mute">
        <Loader2 size={12} className="animate-spin" /> Загружаем чеклисты…
      </div>
    );
  }
  if (checklists.length === 0 && !(canManage && !readOnly && available.length > 0)) return null;

  return (
    <div className="mb-6">
      <div className="mb-2.5 flex items-center gap-2">
        <ClipboardCheck size={14} className="text-text-dim" />
        <h2 className="text-xs font-semibold text-text-dim">Sign-off чеклисты</h2>

        {canManage && !readOnly && available.length > 0 && (
          <button
            onClick={() => setPicking((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs
                       font-medium text-text-dim transition-colors hover:bg-surface2
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-expanded={picking}
          >
            <Plus size={12} /> Добавить чеклист
          </button>
        )}
      </div>

      {picking && (
        <div className="mb-3 rounded-lg border border-border bg-surface2 p-3">
          <p className="mb-2 text-xs font-medium text-text-dim">Шаблон организации</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map((t) => (
              <button
                key={t.id}
                disabled={addChecklist.isPending}
                onClick={() => {
                  addChecklist.mutate(
                    { projectId: project.id, template: t },
                    { onSuccess: () => setPicking(false) },
                  );
                }}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium
                           text-text-main transition-colors hover:border-accent
                           disabled:cursor-not-allowed disabled:opacity-50"
                title={`${checklistTypeLabel(t.checklist_type)} · ${t.items.length} пунктов`}
              >
                {t.title}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-mute">
            Пункты копируются в проект и дальше живут отдельно от шаблона.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {checklists.map((c) => (
          <ChecklistCard
            key={c.id}
            checklist={c}
            projectId={project.id}
            canManage={canManage}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}
