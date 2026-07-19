'use client';

import { useState } from 'react';
import { Users, UserPlus, Link2, Trash2, Check } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import {
  useTeamMembers,
  useUpdateMemberRole,
  useRemoveMember,
  type TeamMember,
} from '@/lib/hooks/use-team-members';
import {
  useInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  inviteLink,
} from '@/lib/hooks/use-invitations';
import type { OrgRole, InvitableRole } from '@/types/database';

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  manager: 'Менеджер',
  viewer: 'Наблюдатель',
};

const INVITABLE_ROLES: InvitableRole[] = ['admin', 'manager', 'viewer'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function RoleBadge({ role }: { role: OrgRole | null }) {
  if (!role) return null;
  return (
    <span className="rounded-full border border-border bg-surface2 px-2.5 py-1 text-[11px] font-medium text-text-dim">
      {ROLE_LABEL[role]}
    </span>
  );
}

function MemberRow({
  member,
  isSelf,
  canAssignOwner,
}: {
  member: TeamMember;
  isSelf: boolean;
  canAssignOwner: boolean;
}) {
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  // Роль owner меняет только owner; себя не трогаем через этот UI.
  // T2: owner-строку (роль + удаление) может трогать только owner — admin не
  // разжалует и не выкинет владельца (RLS 059 подстрахует, здесь — UX).
  const ownerLocked = member.role === 'owner' && !canAssignOwner;
  const readOnly = isSelf || !member.membership_id || ownerLocked;
  const canRemove = !isSelf && !!member.membership_id && !ownerLocked;
  const options: OrgRole[] = canAssignOwner
    ? ['owner', 'admin', 'manager', 'viewer']
    : ['admin', 'manager', 'viewer'];

  return (
    <div className="flex items-center gap-3 py-2">
      {member.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatar_url}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-l text-xs font-bold text-accent">
          {initials(member.full_name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-main">
          {member.full_name || 'Без имени'}
          {isSelf && <span className="ml-1 text-[11px] text-text-mute">(вы)</span>}
        </p>
        {member.job_title && (
          <p className="truncate text-[11px] text-text-dim">{member.job_title}</p>
        )}
      </div>

      {readOnly ? (
        <RoleBadge role={member.role} />
      ) : (
        <select
          value={member.role ?? ''}
          onChange={(e) =>
            updateRole.mutate({ membershipId: member.membership_id!, role: e.target.value as OrgRole })
          }
          disabled={updateRole.isPending}
          className="rounded-md border border-input bg-surface px-2 py-1 text-[11px] text-text-dim"
        >
          {options.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      )}

      {canRemove && (
        <button
          onClick={() => removeMember.mutate(member.membership_id!)}
          disabled={removeMember.isPending}
          className="p-1.5 text-text-mute hover:text-text-main transition-colors"
          aria-label="Удалить из команды"
          title="Удалить из команды"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function InviteForm() {
  const createInvite = useCreateInvitation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('manager');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim();
    if (!value) return;
    createInvite.mutate(
      { email: value, role },
      {
        onSuccess: () => setEmail(''),
        onError: (err) => setError(err instanceof Error ? err.message : 'Не удалось пригласить'),
      },
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-[11px] font-medium text-text-dim">Пригласить в команду</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@company.ru"
          className="min-w-0 flex-1 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-text-main placeholder:text-text-mute"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as InvitableRole)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-[11px] text-text-dim"
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={createInvite.isPending}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <UserPlus size={13} /> Пригласить
        </button>
      </div>
      {error && <p className="text-[11px] text-red">{error}</p>}
      <p className="text-[11px] text-text-mute">
        Скопируйте ссылку из списка ниже и отправьте коллеге — по ней он войдёт и получит
        доступ. Авто-отправка письма появится позже.
      </p>
    </form>
  );
}

function PendingInvites() {
  const { data: invites = [] } = useInvitations();
  const revoke = useRevokeInvitation();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(id: string, token: string) {
    navigator.clipboard?.writeText(inviteLink(token));
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
  }

  if (invites.length === 0) return null;

  return (
    <div className="mt-3 space-y-1 border-t border-border pt-3">
      <p className="text-[11px] font-medium text-text-dim">Ожидают регистрации</p>
      {invites.map((inv) => (
        <div key={inv.id} className="flex items-center gap-2 py-1">
          <span className="min-w-0 flex-1 truncate text-sm text-text-main">{inv.email}</span>
          <RoleBadge role={inv.role} />
          <button
            onClick={() => copy(inv.id, inv.token)}
            className="flex items-center gap-1 p-1.5 text-text-mute hover:text-text-main transition-colors"
            title="Скопировать ссылку-приглашение"
          >
            {copied === inv.id ? <Check size={13} className="text-accent" /> : <Link2 size={13} />}
          </button>
          <button
            onClick={() => revoke.mutate(inv.id)}
            disabled={revoke.isPending}
            className="p-1.5 text-text-mute hover:text-text-main transition-colors"
            aria-label="Отозвать приглашение"
            title="Отозвать приглашение"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Управление командой — видно только owner/admin (useOrgRole). Список членов
 * с ролями, pending-приглашения и форма приглашения. Смена роли owner и
 * назначение owner доступны только owner (RLS + protect_last_owner подстрахуют).
 */
export function TeamSection() {
  const { user } = useAuth();
  const { data: role } = useOrgRole();
  const { data: members = [] } = useTeamMembers();

  const canManage = role === 'owner' || role === 'admin';
  if (!canManage) return null;

  const canAssignOwner = role === 'owner';

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users size={14} className="text-text-dim" />
        <h2 className="text-xs font-semibold text-text-dim">Команда</h2>
      </div>

      <div className="divide-y divide-border">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isSelf={m.id === user?.id}
            canAssignOwner={canAssignOwner}
          />
        ))}
      </div>

      <PendingInvites />
      <InviteForm />
    </div>
  );
}
