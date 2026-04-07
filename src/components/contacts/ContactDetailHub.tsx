'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Mail, Phone, Calendar, CheckSquare,
  Building2, FolderKanban, Loader2, AlertCircle, Plus, X, Link2,
  ChevronRight, LayoutGrid, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useContact, useUpdateContact, useDeleteContact, useLinkContactCompany, useUnlinkContactCompany } from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCalls } from '@/lib/hooks/use-calls';
import { STAGE_CONFIG, formatBudget } from '@/lib/validators/project';
import { ContactModal } from './ContactModal';
import { CallModal } from '@/components/calls/CallModal';
import { BorderTrace } from '@/components/ui/BorderTrace';

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function getAvatarColor(name: string): string {
  const colors = [
    'var(--accent)', 'var(--green)', 'var(--blue)',
    'var(--purple)', 'var(--red)', 'var(--yellow)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(firstName: string, lastName?: string | null): string {
  return `${firstName.charAt(0)}${(lastName ?? '').charAt(0)}`.toUpperCase();
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д назад`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function deadlineBadge(date: string): { label: string; color: string } {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}д просрочено`, color: 'red' };
  if (days === 0) return { label: 'Сегодня', color: 'red' };
  if (days <= 7) return { label: `через ${days}д`, color: 'yellow' };
  return { label: `через ${days}д`, color: 'green' };
}

// ═══════════════════════════════════════════════════════
// Expanding Pill Action Button
// ═══════════════════════════════════════════════════════

function PillAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group/pill flex h-9 items-center justify-center gap-0 overflow-hidden',
        'rounded-full border border-border bg-surface',
        'transition-all duration-300 ease-out-custom',
        'hover:bg-surface2 hover:gap-1.5',
        'w-9 hover:w-auto hover:px-3',
        'md:w-9 md:hover:w-auto',
        // Mobile: always expanded
        'max-md:w-auto max-md:gap-1.5 max-md:px-3',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className={cn(
        'overflow-hidden whitespace-nowrap text-[0.8125rem] text-text-main',
        'max-w-0 opacity-0 transition-all duration-300 ease-out-custom',
        'group-hover/pill:max-w-[100px] group-hover/pill:opacity-100',
        // Mobile: always visible
        'max-md:max-w-[100px] max-md:opacity-100',
      )}>
        {label}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════
// Highlight Card wrapper
// ═══════════════════════════════════════════════════════

function HighlightCard({ children, isFilled = false, className }: { children: React.ReactNode; isFilled?: boolean; className?: string }) {
  const [showTrace, setShowTrace] = useState(false);
  const [showGlow, setShowGlow] = useState(isFilled);
  const prevFilled = useRef(isFilled);

  useEffect(() => {
    if (isFilled && !prevFilled.current) {
      setShowTrace(true);
      setShowGlow(false);
    }
    if (!isFilled) {
      setShowTrace(false);
      setShowGlow(false);
    }
    prevFilled.current = isFilled;
  }, [isFilled]);

  const handleTraceComplete = useCallback(() => {
    setShowTrace(false);
    setShowGlow(true);
  }, []);

  return (
    <div className={cn('highlight-card', showGlow && 'filled', className)} style={{ overflow: 'visible' }}>
      <BorderTrace active={showTrace} duration={800} onComplete={handleTraceComplete} />
      {children}
    </div>
  );
}

function CardLabel({ icon: Icon, label }: { icon: typeof Building2; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text-mute">
      <Icon size={11} />
      {label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════

interface ContactDetailHubProps { contactId: string; }

export function ContactDetailHub({ contactId }: ContactDetailHubProps) {
  const router = useRouter();
  const { data: contact, isLoading, error } = useContact(contactId);
  const { data: allCompanies } = useCompanies();
  const { data: allProjects } = useProjects();
  const { data: allCalls } = useCalls();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const linkCompany = useLinkContactCompany();
  const unlinkCompany = useUnlinkContactCompany();

  const [modalOpen, setModalOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCompanyId, setLinkCompanyId] = useState('');
  const [linkRole, setLinkRole] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [notesFocused, setNotesFocused] = useState(false);

  // Derived data
  const linkedProjects = useMemo(
    () => (allProjects ?? []).filter((p) => p.contact_id === contactId && p.stage !== 'lost'),
    [allProjects, contactId],
  );

  const contactCalls = useMemo(
    () => (allCalls ?? []).filter((c) => c.contact_id === contactId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [allCalls, contactId],
  );

  const upcomingCall = useMemo(
    () => contactCalls.find((c) => c.status === 'pending' && new Date(c.date) >= new Date()),
    [contactCalls],
  );

  const activeProject = linkedProjects[0] ?? null;

  // Timeline: merge calls + projects
  const timeline = useMemo(() => {
    const items: { id: string; type: 'call' | 'project'; title: string; date: string; detail?: string }[] = [];

    contactCalls.slice(0, 8).forEach((c) => {
      items.push({
        id: c.id,
        type: 'call',
        title: c.status === 'done' ? 'Звонок выполнен' : 'Звонок запланирован',
        date: c.date,
        detail: c.next_step ?? c.agreements ?? undefined,
      });
    });

    linkedProjects.forEach((p) => {
      items.push({
        id: p.id,
        type: 'project',
        title: `Проект: ${p.name}`,
        date: p.created_at,
        detail: STAGE_CONFIG[p.stage]?.shortLabel,
      });
    });

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [contactCalls, linkedProjects]);

  // ─── Loading / Error ───

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
  }

  if (error || !contact) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red" />
        <p className="mt-2 text-sm text-red">Контакт не найден</p>
        <button onClick={() => router.push('/contacts')} className="mt-3 text-xs text-accent hover:underline">
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  const fullName = `${contact.first_name} ${contact.last_name ?? ''}`.trim();
  const avatarColor = getAvatarColor(fullName);
  const initials = getInitials(contact.first_name, contact.last_name);
  const currentNotes = notes ?? contact.notes ?? '';
  const primaryCompany = (contact.companies ?? [])[0];

  const linkedCompanyIds = new Set((contact.companies ?? []).map((cc) => cc.company_id));
  const availableCompanies = (allCompanies ?? []).filter((c) => !linkedCompanyIds.has(c.id));

  function handleDelete() {
    if (confirm(`Удалить «${fullName}»? Это действие нельзя отменить.`)) {
      deleteContact.mutate(contactId, { onSuccess: () => router.push('/contacts') });
    }
  }

  function handleSaveNotes() {
    updateContact.mutate({ id: contactId, notes: currentNotes || null });
    setNotesFocused(false);
  }

  function handleLink() {
    if (!linkCompanyId) return;
    linkCompany.mutate(
      { contact_id: contactId, company_id: linkCompanyId, role: linkRole || null },
      { onSuccess: () => { setLinkOpen(false); setLinkCompanyId(''); setLinkRole(''); } },
    );
  }

  function handleUnlink(companyId: string) {
    if (confirm('Убрать связь с компанией?')) {
      unlinkCompany.mutate({ contactId, companyId });
    }
  }

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  return (
    <>
      {/* Back */}
      <button onClick={() => router.push('/contacts')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute transition-colors hover:text-accent">
        <ArrowLeft size={14} /> Контакты
      </button>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* ═══ LEFT COLUMN — Profile (sticky) ═══ */}
        <div className="w-full flex-shrink-0 md:w-[340px] md:self-start md:sticky md:top-6">
          <div className="contact-profile-card rounded-xl bg-surface p-5">
            {/* Avatar + Name */}
            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold contact-avatar"
                style={{ background: `color-mix(in srgb, ${avatarColor} 15%, transparent)`, color: avatarColor }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-text-main break-words">{fullName}</h1>
                {contact.position && (
                  <p className="text-sm text-text-dim truncate">{contact.position}</p>
                )}
                {primaryCompany && (
                  <button
                    onClick={() => router.push(`/companies/${primaryCompany.company_id}`)}
                    className="mt-0.5 text-sm text-accent hover:underline truncate block"
                  >
                    {primaryCompany.company?.name}
                  </button>
                )}
              </div>
              {/* Edit / Delete */}
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setModalOpen(true)} aria-label="Редактировать"
                  className="rounded-lg p-1.5 text-text-mute transition-colors hover:bg-surface2 hover:text-text-main">
                  <Pencil size={14} />
                </button>
                <button onClick={handleDelete} aria-label="Удалить"
                  className="rounded-lg p-1.5 text-text-mute transition-colors hover:bg-red/10 hover:text-red">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Expanding Pill Actions */}
            <div className="mt-4 flex gap-2">
              <PillAction
                icon={<Mail size={15} className="text-text-dim" />}
                label="Email"
                onClick={() => contact.email ? window.location.href = `mailto:${contact.email}` : undefined}
              />
              <PillAction
                icon={<Phone size={15} className="text-text-dim" />}
                label="Звонок"
                onClick={() => setCallModalOpen(true)}
              />
              <PillAction
                icon={<Calendar size={15} className="text-text-dim" />}
                label="Встреча"
                onClick={() => router.push('/meetings')}
              />
              <PillAction
                icon={<CheckSquare size={15} className="text-text-dim" />}
                label="Задача"
                onClick={() => router.push('/tasks')}
              />
            </div>

            {/* Collapsible Details */}
            <div className="mt-4 pt-3">
              <button
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="flex w-full items-center gap-2 text-xs font-medium text-text-dim hover:text-text-main transition-colors"
              >
                <ChevronRight size={14} className={cn('transition-transform duration-200', detailsOpen && 'rotate-90')} />
                Детали
              </button>
              <div className={cn(
                'grid transition-all duration-250 ease-out',
                detailsOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0',
              )}>
                <div className="overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {contact.email && (
                        <tr>
                          <td className="py-1.5 pr-3 text-text-mute text-xs w-20">Email</td>
                          <td className="py-1.5"><a href={`mailto:${contact.email}`} className="text-accent hover:underline">{contact.email}</a></td>
                        </tr>
                      )}
                      {contact.phone && (
                        <tr>
                          <td className="py-1.5 pr-3 text-text-mute text-xs">Телефон</td>
                          <td className="py-1.5"><a href={`tel:${contact.phone}`} className="text-text-main hover:underline">{contact.phone}</a></td>
                        </tr>
                      )}
                      {contact.position && (
                        <tr>
                          <td className="py-1.5 pr-3 text-text-mute text-xs">Должность</td>
                          <td className="py-1.5 text-text-main">{contact.position}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN — Highlights + Activity ═══ */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Section: Highlights */}
          <div className="flex items-center gap-2 text-sm font-medium text-text-dim">
            <LayoutGrid size={14} />
            Highlights
          </div>

          {/* Bento top row: Notes (2fr) + Company (1fr) */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-[2fr_1fr]">
            {/* Notes */}
            <HighlightCard isFilled={Boolean(contact.notes?.trim())}>
              <CardLabel icon={Pencil} label="Заметка" />
              <textarea
                value={currentNotes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={() => setNotesFocused(true)}
                placeholder="Запиши главное..."
                className={cn(
                  'w-full resize-none rounded-md bg-transparent text-sm text-text-main placeholder:text-text-mute placeholder:italic placeholder:text-[0.8125rem]',
                  'transition-all duration-fast focus:outline-none focus:ring-0 focus:border-transparent',
                  'border-none outline-none',
                  notesFocused ? 'p-2 min-h-[80px]' : 'p-0 min-h-[40px]',
                )}
              />
              {notesFocused && (
                <div className="mt-2 flex gap-2">
                  <button onClick={handleSaveNotes}
                    className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity">
                    Сохранить
                  </button>
                  <button onClick={() => { setNotes(null); setNotesFocused(false); }}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-text-dim hover:bg-surface2">
                    Отмена
                  </button>
                </div>
              )}
            </HighlightCard>

            {/* Company */}
            <HighlightCard isFilled={(contact.companies ?? []).length > 0}>
              <CardLabel icon={Building2} label="Компания" />
              {(contact.companies ?? []).length === 0 ? (
                <div>
                  <p className="text-xs text-text-mute">Не привязана</p>
                  <button onClick={() => setLinkOpen(true)}
                    className="mt-1.5 flex items-center gap-1 text-xs text-accent hover:underline">
                    <Plus size={10} /> Привязать
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {(contact.companies ?? []).slice(0, 2).map((cc) => (
                    <div key={cc.company_id}>
                      <button onClick={() => router.push(`/companies/${cc.company_id}`)}
                        className="text-sm text-accent hover:underline truncate block">
                        {cc.company?.name ?? 'N/A'}
                      </button>
                      {cc.role && <span className="text-[10px] text-text-mute">{cc.role}</span>}
                    </div>
                  ))}
                  {(contact.companies ?? []).length > 2 && (
                    <span className="text-[10px] text-text-mute">+ ещё {(contact.companies ?? []).length - 2}</span>
                  )}
                </div>
              )}
            </HighlightCard>
          </div>

          {/* Bento bottom row: Upcoming + Deal */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {/* Upcoming */}
            <HighlightCard isFilled={Boolean(upcomingCall)}>
              <CardLabel icon={Calendar} label="Ближайшее" />
              {upcomingCall ? (() => {
                const badge = deadlineBadge(upcomingCall.date);
                return (
                  <div>
                    <p className="text-sm text-text-main">Звонок запланирован</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-text-dim">
                        {new Date(upcomingCall.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-${badge.color}-l text-${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })() : (
                <div>
                  <p className="text-xs text-text-mute">Нет запланированных</p>
                  <button onClick={() => setCallModalOpen(true)}
                    className="mt-1.5 flex items-center gap-1 text-xs text-accent hover:underline">
                    <Plus size={10} /> Создать
                  </button>
                </div>
              )}
            </HighlightCard>

            {/* Deal */}
            <HighlightCard isFilled={Boolean(activeProject)}>
              <CardLabel icon={FolderKanban} label="Сделка" />
              {activeProject ? (
                <div>
                  <button onClick={() => router.push(`/projects/${activeProject.id}`)}
                    className="text-sm text-accent hover:underline truncate block">
                    {activeProject.name}
                  </button>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-accent-l px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {STAGE_CONFIG[activeProject.stage]?.shortLabel}
                    </span>
                    {activeProject.budget != null && (
                      <span className="text-xs text-text-dim">{formatBudget(activeProject.budget)}</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-mute">Нет активной сделки</p>
              )}
            </HighlightCard>
          </div>

          {/* Company Link Form (shown when linkOpen) */}
          {linkOpen && (
            <div className="rounded-lg border border-accent/30 bg-accent-l/30 p-3">
              <div className="mb-2 flex items-center gap-1 text-[10px] font-medium text-accent">
                <Link2 size={10} /> Привязать к компании
              </div>
              <select value={linkCompanyId} onChange={(e) => setLinkCompanyId(e.target.value)}
                aria-label="Выбрать компанию"
                className="mb-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-main focus:border-accent focus:outline-none">
                <option value="">Выбери компанию...</option>
                {availableCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input value={linkRole} onChange={(e) => setLinkRole(e.target.value)}
                placeholder="Роль (необязательно)"
                aria-label="Роль в компании"
                className="mb-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none" />
              <div className="flex gap-1">
                <button onClick={handleLink} disabled={!linkCompanyId || linkCompany.isPending}
                  className="rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {linkCompany.isPending ? 'Сохраняю...' : 'Привязать'}
                </button>
                <button onClick={() => setLinkOpen(false)}
                  className="rounded border border-border px-2.5 py-1 text-[10px] text-text-dim hover:bg-surface2">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* ═══ Activity Timeline ═══ */}
          <div className="pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-dim">
              <Activity size={14} />
              Активность
            </div>

            {timeline.length === 0 ? (
              <p className="py-6 text-center text-xs text-text-mute italic">Нет активности</p>
            ) : (
              <div className="relative ml-[7px] border-l border-border pl-5">
                {timeline.map((item) => {
                  const isCall = item.type === 'call';
                  const color = isCall ? 'blue' : 'accent';
                  const Icon = isCall ? Phone : FolderKanban;

                  return (
                    <div key={item.id} className="relative flex items-start gap-3 py-2">
                      <div
                        className={`absolute -left-[23px] top-[10px] flex h-[14px] w-[14px] items-center justify-center rounded-full bg-${color}-l`}
                      >
                        <Icon size={8} className={`text-${color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-main">
                          {item.title}
                          {item.detail && (
                            <span className="ml-1 text-text-dim">— {item.detail}</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-text-mute">{relativeTime(item.date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ContactModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editContact={contact} />
      <CallModal isOpen={callModalOpen} onClose={() => setCallModalOpen(false)} editCall={null} defaultContactId={contactId} />
    </>
  );
}
