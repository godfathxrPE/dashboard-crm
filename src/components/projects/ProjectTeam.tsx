'use client';

import { useState } from 'react';
import { Users, Plus, X, Loader2 } from 'lucide-react';
import {
  useProjectMembers,
  useAddProjectMember,
  useUpdateProjectMemberRole,
  useRemoveProjectMember,
  groupMembersByRole,
  parseMemberError,
  type ProjectMember,
} from '@/lib/hooks/use-project-members';
import {
  PROJECT_MEMBER_ROLE_LABELS,
  PROJECT_MEMBER_ROLE_ORDER,
} from '@/lib/constants/delivery-phases';
import { AssigneeSelect } from '@/components/shared';
import type { ProjectMemberRole } from '@/types/database';

// ═══════════════════════════════════════════════════════
// P2b (B2): виджет «Команда» delivery-проекта — full-width секция под info grid.
// Список сгруппирован по ролям; add через AssigneeSelect (useTeamMembers) +
// селект роли; кнопки управления — по canManage (canManageDeliveryProject, B0),
// НЕ по role !== 'viewer' — иначе кнопки давали бы 42501 на RLS.
// ═══════════════════════════════════════════════════════

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function MemberAvatar({ member }: { member: ProjectMember }) {
  if (member.profile?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={member.profile.avatar_url}
        alt=""
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-l text-[10px] font-bold text-accent">
      {initials(member.profile?.full_name ?? '')}
    </span>
  );
}

export function ProjectTeam({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { data: members = [], isLoading } = useProjectMembers(projectId);
  const addMember = useAddProjectMember(projectId);
  const updateRole = useUpdateProjectMemberRole(projectId);
  const removeMember = useRemoveProjectMember(projectId);

  const [adding, setAdding] = useState(false);
  const [newProfileId, setNewProfileId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<ProjectMemberRole>('manager');
  const [errorText, setErrorText] = useState<string | null>(null);

  const memberProfileIds = members.map((m) => m.profile_id);
  const grouped = groupMembersByRole(members);

  function handleAdd() {
    if (!newProfileId) return;
    setErrorText(null);
    addMember.mutate(
      { profile_id: newProfileId, role: newRole },
      {
        onSuccess: () => { setNewProfileId(null); setAdding(false); },
        onError: (err) => setErrorText(parseMemberError(err)),
      },
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-border/50 bg-surface px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[13px] text-text-dim">
          <Users size={11} /> Команда
        </div>
        {canManage && !adding && (
          <button
            onClick={() => { setErrorText(null); setAdding(true); }}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-dim
                       transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Plus size={12} /> Добавить
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-accent" />
        </div>
      ) : members.length === 0 && !adding ? (
        <p className="py-2 text-xs text-text-mute">
          Команда не назначена
          {canManage && ' — добавь менеджера, внедренца или монтажника'}
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map((group) => (
            <div key={group.role}>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-text-mute">
                {PROJECT_MEMBER_ROLE_LABELS[group.role]}
              </p>
              <div className="space-y-1">
                {group.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-surface2">
                    <MemberAvatar member={m} />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-main">
                      {m.profile?.full_name ?? '…'}
                    </span>
                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={(e) => {
                          setErrorText(null);
                          updateRole.mutate(
                            { id: m.id, role: e.target.value as ProjectMemberRole },
                            { onError: (err) => setErrorText(parseMemberError(err)) },
                          );
                        }}
                        className="rounded-md border border-input bg-surface px-1.5 py-0.5 text-[11px] text-text-dim
                                   focus:border-accent focus:outline-none"
                      >
                        {PROJECT_MEMBER_ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>{PROJECT_MEMBER_ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-accent-l px-2 py-0.5 text-[10px] font-medium text-accent">
                        {PROJECT_MEMBER_ROLE_LABELS[m.role]}
                      </span>
                    )}
                    {canManage && (
                      <button
                        onClick={() => {
                          if (!confirm(`Убрать «${m.profile?.full_name ?? 'сотрудника'}» из команды?`)) return;
                          setErrorText(null);
                          removeMember.mutate(m.id, {
                            onError: (err) => setErrorText(parseMemberError(err)),
                          });
                        }}
                        aria-label="Убрать из команды"
                        className="rounded p-1 text-text-mute transition-colors hover:text-red"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && adding && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-2">
          <div className="min-w-[200px] flex-1">
            <AssigneeSelect
              value={newProfileId}
              onChange={setNewProfileId}
              placeholder="Выбрать сотрудника"
              excludeIds={memberProfileIds}
            />
          </div>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as ProjectMemberRole)}
            className="rounded-lg border border-input bg-surface2 px-2 py-2 text-sm text-text-main
                       focus:border-accent focus:outline-none"
          >
            {PROJECT_MEMBER_ROLE_ORDER.map((r) => (
              <option key={r} value={r}>{PROJECT_MEMBER_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!newProfileId || addMember.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity
                       hover:opacity-90 disabled:opacity-50"
          >
            {addMember.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Добавить'}
          </button>
          <button
            onClick={() => { setAdding(false); setNewProfileId(null); setErrorText(null); }}
            className="rounded-lg border border-border px-3 py-2 text-xs text-text-dim hover:bg-surface2"
          >
            Отмена
          </button>
        </div>
      )}

      {errorText && <p className="mt-1.5 text-xs text-red">{errorText}</p>}
    </div>
  );
}
