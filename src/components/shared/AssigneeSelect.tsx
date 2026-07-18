'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTeamMembers, type TeamMember } from '@/lib/hooks/use-team-members';
import { useAnchoredRect } from '@/lib/hooks/use-anchored-rect';

interface AssigneeSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** P2b: скрыть уже выбранных (команда проекта — иначе unique violation по дублю) */
  excludeIds?: ReadonlyArray<string>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function Avatar({ member }: { member: TeamMember }) {
  if (member.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={member.avatar_url}
        alt=""
        className="h-5 w-5 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-l text-[9px] font-bold text-accent">
      {initials(member.full_name)}
    </span>
  );
}

/**
 * Выбор со-члена организации для назначения записи.
 * value — uuid профиля или null («Не назначено»). Источник — useTeamMembers()
 * (RLS отдаёт только членов той же org). Стили — токены темы, без хардкода.
 */
export function AssigneeSelect({
  value,
  onChange,
  label,
  placeholder = 'Не назначено',
  disabled,
  excludeIds,
}: AssigneeSelectProps) {
  const { data: allMembers = [] } = useTeamMembers();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLUListElement>(null);
  // Попап рендерится в портал (position: fixed) поверх overflow-скролла модалки.
  const anchor = useAnchoredRect(triggerRef, open);

  // выбранного не скрываем, даже если он в excludeIds — иначе кнопка «ослепнет»
  const members = excludeIds?.length
    ? allMembers.filter((m) => m.id === value || !excludeIds.includes(m.id))
    : allMembers;

  const selected = members.find((m) => m.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      // Попап живёт в портале вне ref — учитываем и его, иначе клик по пункту закроет до выбора.
      if (ref.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div>
      {label && (
        <label className="mb-1 block text-xs font-medium text-text-dim">{label}</label>
      )}
      <div ref={ref} className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-input
                     bg-surface2 px-3 py-2 text-left text-sm
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent
                     disabled:opacity-50"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <Avatar member={selected} />
                <span className="truncate text-text-main">{selected.full_name}</span>
              </>
            ) : (
              <>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-text-mute">
                  <UserRound size={12} />
                </span>
                <span className="text-text-mute">{placeholder}</span>
              </>
            )}
          </span>
          <ChevronDown size={14} className="shrink-0 text-text-mute" />
        </button>

        {open && anchor && createPortal(
          <ul
            ref={popupRef}
            style={{ position: 'fixed', top: anchor.top, left: anchor.left, width: anchor.width, zIndex: 1100 }}
            className="max-h-56 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
          >
            <li
              onMouseDown={() => pick(null)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/10',
                value === null ? 'text-accent' : 'text-text-mute',
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-text-mute">
                <UserRound size={12} />
              </span>
              Не назначено
            </li>
            {members.map((m) => (
              <li
                key={m.id}
                onMouseDown={() => pick(m.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/10',
                  m.id === value ? 'font-medium text-accent' : 'text-text-main',
                )}
              >
                <Avatar member={m} />
                <span className="truncate">{m.full_name}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      </div>
    </div>
  );
}
