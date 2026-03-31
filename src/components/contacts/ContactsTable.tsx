'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Loader2, Building2 } from 'lucide-react';
import { useContacts, useDeleteContact, type Contact } from '@/lib/hooks/use-contacts';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ContactModal } from './ContactModal';

export function ContactsTable() {
  const router = useRouter();
  const { data: contacts, isLoading, error } = useContacts();
  const deleteContact = useDeleteContact();

  const [modalOpen, setModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const columns: Column<Contact>[] = [
    {
      key: 'last_name',
      label: 'Контакт',
      sortable: true,
      render: (c) => (
        <div>
          <span className="font-medium text-text-main">{c.first_name} {c.last_name}</span>
          {c.position && <span className="ml-2 text-xs text-text-dim">{c.position}</span>}
        </div>
      ),
      searchValue: (c) => `${c.first_name} ${c.last_name} ${c.position ?? ''}`,
    },
    {
      key: 'companies',
      label: 'Компании',
      render: (c) => {
        const comps = c.companies ?? [];
        if (comps.length === 0) return <span className="text-text-mute">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {comps.map((cc) => (
              <span key={cc.company_id}
                className="inline-flex items-center gap-0.5 rounded bg-accent-l px-1.5 py-0.5 text-[10px] text-accent">
                <Building2 size={9} />
                {cc.company?.name ?? 'N/A'}
                {cc.role && <span className="text-text-mute"> · {cc.role}</span>}
              </span>
            ))}
          </div>
        );
      },
      searchValue: (c) => (c.companies ?? []).map((cc) => cc.company?.name ?? '').join(' '),
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (c) => <span className="text-text-dim">{c.phone ?? '—'}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      render: (c) => c.email
        ? <a href={`mailto:${c.email}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{c.email}</a>
        : <span className="text-text-mute">—</span>,
    },
    {
      key: 'created_at',
      label: 'Добавлен',
      sortable: true,
      width: '120px',
      render: (c) => (
        <span className="text-xs text-text-dim">
          {new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки контактов</p>
        <p className="mt-1 text-xs text-text-mute">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Контакты</h1>
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">{contacts?.length ?? 0}</span>
        </div>
        <button
          onClick={() => { setEditContact(null); setModalOpen(true); }}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={14} /> Контакт
        </button>
      </div>

      <DataTable
        data={contacts ?? []}
        columns={columns}
        keyField="id"
        onRowClick={(c) => router.push(`/contacts/${c.id}`)}
        searchPlaceholder="Поиск по имени, компании..."
        emptyMessage="Нет контактов. Создай первый!"
        emptyIcon={<Users size={32} className="text-text-mute" />}
      />

      <ContactModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditContact(null); }}
        editContact={editContact}
      />
    </>
  );
}
