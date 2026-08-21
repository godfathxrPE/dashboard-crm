'use client';

import { useMemo } from 'react';
import { CheckCircle2, ListChecks, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import {
  useDeleteProjectChecklist,
  useToggleChecklistItem,
} from '@/lib/hooks/use-project-checklists';
import { openRequiredCount } from '@/lib/validators/checklist';
import type { ProjectChecklist } from '@/types/database';

// ═══════════════════════════════════════════════════════
// R2-P1-G: карточка одного sign-off чеклиста внедрения (083/084).
//
// Отметка идёт ТОЛЬКО через RPC toggle_checklist_item: `checked_by`/`checked_at`
// штампует сервер, оптимистичного апдейта нет — «кто и когда» появляется после
// ответа. Прямой UPDATE items рядовому участнику закрыт политикой 083.
//
// A11y: настоящий <input type="checkbox"> + <label htmlFor>, а не div c onClick;
// на время запроса — настоящий `disabled`, а не серый на вид (грабля SDP).
// ═══════════════════════════════════════════════════════

interface ChecklistCardProps {
  checklist: ProjectChecklist;
  projectId: string;
  /** Удаление чеклиста с проекта — owner/admin (RLS всё равно подстрахует). */
  canManage?: boolean;
  /** Проект в терминальном статусе — отметки только на чтение. */
  readOnly?: boolean;
}

export function ChecklistCard({
  checklist,
  projectId,
  canManage = false,
  readOnly = false,
}: ChecklistCardProps) {
  const toggle = useToggleChecklistItem();
  const removeChecklist = useDeleteProjectChecklist();
  const { data: members = [] } = useTeamMembers();

  const memberName = useMemo(
    () => new Map(members.map((m) => [m.id, m.full_name])),
    [members],
  );

  const openRequired = openRequiredCount(checklist.items);
  const done = checklist.completed_at !== null;

  return (
    <div data-card className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2">
        {done ? (
          <CheckCircle2 size={14} className="shrink-0 text-green" />
        ) : (
          <ListChecks size={14} className="shrink-0 text-text-dim" />
        )}
        <h3 className={cn('min-w-0 flex-1 truncate text-xs font-semibold', done ? 'text-green' : 'text-text-dim')}>
          {checklist.title}
        </h3>

        {!done && openRequired > 0 && (
          <span className="shrink-0 rounded-full border border-yellow/30 bg-yellow-l px-1.5 py-px text-xs font-medium text-yellow">
            {openRequired} обязательных
          </span>
        )}

        {toggle.isPending && <Loader2 size={12} className="shrink-0 animate-spin text-text-mute" />}

        {canManage && !readOnly && (
          <button
            onClick={() => removeChecklist.mutate({ id: checklist.id, projectId })}
            disabled={removeChecklist.isPending}
            className="shrink-0 p-1 text-text-mute transition-colors hover:text-text-main
                       disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Удалить чеклист «${checklist.title}»`}
            title="Удалить чеклист с проекта"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {checklist.items.length === 0 ? (
        <p className="py-1 text-xs text-text-mute">В чеклисте нет пунктов.</p>
      ) : (
        <ul className="space-y-2">
          {checklist.items.map((item) => {
            const inputId = `chk-${checklist.id}-${item.key}`;
            const who = item.checked_by ? memberName.get(item.checked_by) : null;

            return (
              <li key={item.key} className="flex items-start gap-2.5">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={item.checked}
                  disabled={readOnly || toggle.isPending}
                  onChange={(e) =>
                    toggle.mutate({
                      checklistId: checklist.id,
                      itemKey: item.key,
                      checked: e.target.checked,
                      projectId,
                    })
                  }
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                             disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={inputId}
                    className={cn(
                      'block text-body',
                      readOnly ? 'cursor-default' : 'cursor-pointer',
                      item.checked ? 'text-text-dim line-through' : 'text-text-main',
                    )}
                  >
                    {item.label}
                    {item.required && (
                      <span
                        className="ml-1 text-red"
                        title="Обязательный пункт — блокирует завершение проекта"
                        aria-label="обязательный пункт"
                      >
                        *
                      </span>
                    )}
                  </label>

                  {item.checked && (
                    <p className="mt-0.5 text-xs text-text-mute">
                      {who ?? 'Участник'}
                      {item.checked_at && ` · ${formatDateShort(item.checked_at)}`}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
