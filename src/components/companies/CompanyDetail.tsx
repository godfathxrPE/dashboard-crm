'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Building2, Phone, Mail, Globe, MapPin, FileText,
  Users, FolderKanban, Loader2, AlertCircle, Plus,
} from 'lucide-react';
import { useCompany, useDeleteCompany } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useProjects, type Project } from '@/lib/hooks/use-projects';
import { STAGE_CONFIG, formatBudget } from '@/lib/validators/project';
import { CompanyModal } from './CompanyModal';

interface CompanyDetailProps { companyId: string; }

export function CompanyDetail({ companyId }: CompanyDetailProps) {
  const router = useRouter();
  const { data: company, isLoading, error } = useCompany(companyId);
  const { data: allContacts } = useContacts();
  const { data: allProjects } = useProjects();
  const deleteCompany = useDeleteCompany();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;

  if (error || !company) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red" />
        <p className="mt-2 text-sm text-red">Компания не найдена</p>
        <button onClick={() => router.push('/companies')} className="mt-3 text-xs text-accent hover:underline">
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  // Контакты, привязанные к этой компании
  const linkedContacts = (allContacts ?? []).filter((c) =>
    c.companies?.some((cc) => cc.company_id === companyId)
  );

  // Проекты этой компании
  const linkedProjects = (allProjects ?? []).filter((p) => p.company_id === companyId);

  function handleDelete() {
    if (confirm('Удалить компанию? Связанные контакты и проекты сохранятся.')) {
      deleteCompany.mutate(companyId, { onSuccess: () => router.push('/companies') });
    }
  }

  const infoFields = [
    { icon: Phone, label: 'Телефон', value: company.phone },
    { icon: Mail, label: 'Email', value: company.email },
    { icon: Globe, label: 'Сайт', value: company.website },
    { icon: MapPin, label: 'Адрес', value: company.address },
    { icon: FileText, label: 'ИНН', value: company.inn },
  ];

  return (
    <>
      <button onClick={() => router.push('/companies')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute transition-colors hover:text-accent">
        <ArrowLeft size={14} /> Компании
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-accent" />
            <h1 className="text-xl font-bold text-text-main">{company.name}</h1>
          </div>
          {company.industry && <p className="mt-1 text-sm text-text-dim">{company.industry}</p>}
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
            <div className="mb-1 flex items-center gap-1 text-[10px] text-text-mute">
              <f.icon size={10} /> {f.label}
            </div>
            <div className="text-sm text-text-main">{f.value}</div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {company.notes && (
        <div className="mb-6 rounded-xl border border-border/50 bg-surface/50 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-text-dim">Заметки</p>
          <p className="text-sm text-text-main whitespace-pre-wrap">{company.notes}</p>
        </div>
      )}

      {/* Linked contacts & projects */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Contacts */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Контакты</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">{linkedContacts.length}</span>
          </div>
          {linkedContacts.length === 0 ? (
            <p className="text-xs text-text-mute italic">Нет привязанных контактов. Привяжи контакт на его странице.</p>
          ) : (
            <div className="space-y-1.5">
              {linkedContacts.map((c) => {
                const role = c.companies?.find((cc) => cc.company_id === companyId)?.role;
                return (
                  <button key={c.id} onClick={() => router.push(`/contacts/${c.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                    <span className="text-sm text-text-main">{c.first_name} {c.last_name}</span>
                    {role && <span className="rounded bg-accent-l px-1.5 py-0.5 text-[10px] text-accent">{role}</span>}
                    {c.position && <span className="ml-auto text-[10px] text-text-mute">{c.position}</span>}
                  </button>
                );
              })}
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
            <p className="text-xs text-text-mute italic">Нет проектов. Привяжи компанию при создании проекта.</p>
          ) : (
            <div className="space-y-1.5">
              {linkedProjects.map((p) => (
                <button key={p.id} onClick={() => router.push(`/projects/${p.id}`)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                  <span className="text-sm text-text-main">{p.name}</span>
                  <span className="rounded bg-accent-l px-1.5 py-0.5 text-[10px] text-accent">
                    {STAGE_CONFIG[p.stage].shortLabel}
                  </span>
                  {p.budget != null && <span className="ml-auto text-[10px] text-text-mute">{formatBudget(p.budget)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <CompanyModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editCompany={company} />
    </>
  );
}
