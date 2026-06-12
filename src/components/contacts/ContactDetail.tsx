'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, User, Phone, Mail, Briefcase, FileText,
  Building2, FolderKanban, Loader2, AlertCircle, Plus, X, Link2,
} from 'lucide-react';
import { useContact, useDeleteContact, useLinkContactCompany, useUnlinkContactCompany } from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useProjects } from '@/lib/hooks/use-projects';
import { STAGE_CONFIG, formatBudget } from '@/lib/validators/project';
import { ContactModal } from './ContactModal';

interface ContactDetailProps { contactId: string; }

export function ContactDetail({ contactId }: ContactDetailProps) {
  const router = useRouter();
  const { data: contact, isLoading, error } = useContact(contactId);
  const { data: allCompanies } = useCompanies();
  const { data: allProjects } = useProjects();
  const deleteContact = useDeleteContact();
  const linkCompany = useLinkContactCompany();
  const unlinkCompany = useUnlinkContactCompany();

  const [modalOpen, setModalOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCompanyId, setLinkCompanyId] = useState('');
  const [linkRole, setLinkRole] = useState('');

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;

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

  // Проекты через контакт напрямую
  const linkedProjects = (allProjects ?? []).filter((p) => p.contact_id === contactId);

  // Компании, к которым контакт НЕ привязан (для выбора)
  const linkedCompanyIds = new Set((contact.companies ?? []).map((cc) => cc.company_id));
  const availableCompanies = (allCompanies ?? []).filter((c) => !linkedCompanyIds.has(c.id));

  function handleDelete() {
    if (confirm('Удалить контакт?')) {
      deleteContact.mutate(contactId, { onSuccess: () => router.push('/contacts') });
    }
  }

  function handleLink() {
    if (!linkCompanyId) return;
    linkCompany.mutate(
      { contact_id: contactId, company_id: linkCompanyId, role: linkRole || null },
      { onSuccess: () => { setLinkOpen(false); setLinkCompanyId(''); setLinkRole(''); } }
    );
  }

  function handleUnlink(companyId: string) {
    if (confirm('Убрать связь с компанией?')) {
      unlinkCompany.mutate({ contactId, companyId });
    }
  }

  const fullName = `${contact.first_name} ${contact.last_name}`;

  const infoFields = [
    { icon: Briefcase, label: 'Должность', value: contact.position },
    { icon: Phone, label: 'Телефон', value: contact.phone },
    { icon: Mail, label: 'Email', value: contact.email },
  ];

  return (
    <>
      <button onClick={() => router.push('/contacts')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute transition-colors hover:text-accent">
        <ArrowLeft size={14} /> Контакты
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <User size={20} className="text-accent" />
            <h1 className="text-xl font-bold text-text-main">{fullName}</h1>
          </div>
          {contact.position && <p className="mt-1 text-sm text-text-dim">{contact.position}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setModalOpen(true)}
            className="rounded-lg border border-border p-1.5 text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main">
            <Pencil size={14} />
          </button>
          <button onClick={handleDelete}
            className="rounded-lg border border-border p-1.5 text-text-mute transition-colors hover:bg-red/10 hover:text-red">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {infoFields.filter((f) => f.value).map((f) => (
          <div key={f.label} className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1 text-xs text-text-dim"><f.icon size={10} /> {f.label}</div>
            <div className="text-sm text-text-main">{f.value}</div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {contact.notes && (
        <div className="mb-6 rounded-xl border border-border/50 bg-surface/50 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-text-dim">Заметки</p>
          <p className="text-sm text-text-main whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* ═══ Companies (junction table UI) ═══ */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Building2 size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Компании</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
              {(contact.companies ?? []).length}
            </span>
            <button onClick={() => setLinkOpen(!linkOpen)}
              className="ml-auto rounded p-1 text-text-mute transition-colors hover:bg-accent-l hover:text-accent"
              title="Привязать компанию">
              <Plus size={14} />
            </button>
          </div>

          {/* Link form */}
          {linkOpen && (
            <div className="mb-3 rounded-lg border border-accent/30 bg-accent-l/30 p-2.5">
              <div className="mb-2 flex items-center gap-1 text-[10px] font-medium text-accent">
                <Link2 size={10} /> Привязать к компании
              </div>
              <select value={linkCompanyId} onChange={(e) => setLinkCompanyId(e.target.value)}
                className="mb-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-main focus:border-accent focus:outline-none">
                <option value="">Выбери компанию...</option>
                {availableCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input value={linkRole} onChange={(e) => setLinkRole(e.target.value)}
                placeholder="Роль (необязательно): CEO, менеджер..."
                className="mb-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none" />
              <div className="flex gap-1">
                <button onClick={handleLink} disabled={!linkCompanyId || linkCompany.isPending}
                  className="rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                  {linkCompany.isPending ? 'Сохраняю...' : 'Привязать'}
                </button>
                <button onClick={() => setLinkOpen(false)}
                  className="rounded border border-border px-2.5 py-1 text-[10px] text-text-dim hover:bg-surface-hover">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Linked companies list */}
          {(contact.companies ?? []).length === 0 ? (
            <p className="text-xs text-text-mute italic">Нет привязанных компаний</p>
          ) : (
            <div className="space-y-1.5">
              {(contact.companies ?? []).map((cc) => (
                <div key={cc.company_id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover">
                  <button onClick={() => router.push(`/companies/${cc.company_id}`)}
                    className="flex-1 text-left text-sm text-text-main hover:text-accent">
                    {cc.company?.name ?? 'N/A'}
                  </button>
                  {cc.role && <span data-tag className="rounded bg-accent-l px-1.5 py-0.5 text-[10px] text-accent">{cc.role}</span>}
                  <button onClick={() => handleUnlink(cc.company_id)}
                    className="rounded p-0.5 text-text-mute opacity-0 transition-all hover:bg-red/10 hover:text-red group-hover:opacity-100"
                    title="Убрать связь">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <FolderKanban size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Проекты</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">{linkedProjects.length}</span>
          </div>
          {linkedProjects.length === 0 ? (
            <p className="text-xs text-text-mute italic">Нет проектов с этим контактом</p>
          ) : (
            <div className="space-y-1.5">
              {linkedProjects.map((p) => (
                <button key={p.id} onClick={() => router.push(`/projects/${p.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                  <span className="text-sm text-text-main">{p.name}</span>
                  <span data-tag className="rounded bg-accent-l px-1.5 py-0.5 text-[10px] text-accent">
                    {p.stage ? STAGE_CONFIG[p.stage].shortLabel : '—'}
                  </span>
                  {p.budget != null && <span className="ml-auto text-xs text-text-dim">{formatBudget(p.budget)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContactModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editContact={contact} />
    </>
  );
}
