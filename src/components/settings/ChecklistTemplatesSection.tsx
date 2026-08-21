'use client';

import { useState } from 'react';
import { ClipboardCheck, Pencil, Plus } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import {
  useChecklistTemplates,
  useUpdateChecklistTemplate,
} from '@/lib/hooks/use-project-checklists';
import { checklistTypeLabel } from '@/lib/constants/checklists';
import { ChecklistTemplateEditorModal } from './ChecklistTemplateEditorModal';
import type { ChecklistTemplate } from '@/types/database';

/**
 * Шаблоны sign-off чеклистов внедрения (R2-P1-G, 083) — только owner/admin (RLS 083
 * то же говорит). Без этой секции labels пунктов правились бы исключительно SQL'ем,
 * и заглушечные формулировки сида никогда бы не заменились на реальные из 1С:ДО.
 *
 * Активный шаблон разворачивается на новом внедрении автоматически
 * (instantiate_project_checklists из spawn_delivery_project, 084). На уже идущие
 * проекты бэкфилла нет — там кнопка «Добавить чеклист» на карточке проекта.
 */
export function ChecklistTemplatesSection() {
  const { data: role } = useOrgRole();
  const { data: templates = [] } = useChecklistTemplates();
  const updateTemplate = useUpdateChecklistTemplate();

  // null — закрыт; 'new' — пустой редактор; ChecklistTemplate — редактирование.
  const [editing, setEditing] = useState<ChecklistTemplate | 'new' | null>(null);

  const canManage = role === 'owner' || role === 'admin';
  if (!canManage) return null;

  function scopeLabel(t: ChecklistTemplate): string {
    const dir = t.direction === 'erp' ? 'ERP' : t.direction === 'iiot' ? 'IIoT' : 'любое';
    const kind =
      t.delivery_kind === 'launch' ? 'запуск' : t.delivery_kind === 'experiment' ? 'эксперимент' : 'любой';
    return `${dir} · ${kind}`;
  }

  return (
    <div className="sheet p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={14} className="text-text-dim" />
          <h2 className="text-xs font-semibold text-text-dim">Чеклисты внедрения</h2>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={13} /> Шаблон
        </button>
      </div>

      <p className="mb-3 text-meta text-text-mute">
        Активный шаблон разворачивается на новом внедрении автоматически. Обязательные пункты
        блокируют завершение проекта, отметку штампует сервер — кто и когда. На уже идущие
        внедрения чеклист добавляется кнопкой на карточке проекта.
      </p>

      {templates.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-mute">Шаблоны ещё не заданы.</p>
      ) : (
        <div className="divide-y divide-border">
          {templates.map((t) => {
            const required = t.items.filter((i) => i.required).length;
            return (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-xs font-medium text-text-mute">
                  {checklistTypeLabel(t.checklist_type)}
                </span>

                <span
                  className="min-w-0 flex-1 truncate text-xs text-text-main"
                  title={t.items.map((i) => i.label).join(' · ')}
                >
                  {t.title}
                  <span className="ml-1.5 text-text-mute">
                    {t.items.length} пунктов, {required} обяз. · {scopeLabel(t)}
                  </span>
                </span>

                <button
                  onClick={() => updateTemplate.mutate({ id: t.id, is_active: !t.is_active })}
                  disabled={updateTemplate.isPending}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors
                    disabled:cursor-not-allowed disabled:opacity-50 ${
                      t.is_active ? 'bg-accent-l text-accent' : 'bg-surface2 text-text-mute'
                    }`}
                  title={
                    t.is_active
                      ? 'Активен — нажмите, чтобы выключить'
                      : 'Выключен — нажмите, чтобы включить'
                  }
                >
                  {t.is_active ? 'вкл' : 'выкл'}
                </button>

                <button
                  onClick={() => setEditing(t)}
                  className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
                  aria-label={`Изменить шаблон «${t.title}»`}
                  title="Изменить шаблон"
                >
                  <Pencil size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ChecklistTemplateEditorModal
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
