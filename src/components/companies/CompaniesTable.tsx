'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Loader2 } from 'lucide-react';
import { useCompanies, useDeleteCompany, type Company } from '@/lib/hooks/use-companies';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { CompanyModal } from './CompanyModal';

export function CompaniesTable() {
  const router = useRouter();
  const { data: companies, isLoading, error } = useCompanies();
  const deleteCompany = useDeleteCompany();

  const [modalOpen, setModalOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);

  const columns: Column<Company>[] = [
    {
      key: 'name',
      label: 'Компания',
      sortable: true,
      render: (c) => (
        <div>
          <span className="font-medium text-text-main">{c.name}</span>
          {c.inn && <span className="ml-2 text-xs text-text-dim">ИНН {c.inn}</span>}
        </div>
      ),
      searchValue: (c) => `${c.name} ${c.inn ?? ''}`,
    },
    {
      key: 'industry',
      label: 'Отрасль',
      sortable: true,
      render: (c) => <span className="text-text-dim">{c.industry ?? '—'}</span>,
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
      label: 'Добавлена',
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
        <p className="text-sm text-red">Ошибка загрузки компаний</p>
        <p className="mt-1 text-xs text-text-mute">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Компании</h1>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-mute">
            {companies?.length ?? 0}
          </span>
        </div>
        <button
          onClick={() => { setEditCompany(null); setModalOpen(true); }}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={14} /> Компания
        </button>
      </div>

      {/* Table */}
      <DataTable
        data={companies ?? []}
        columns={columns}
        keyField="id"
        onRowClick={(c) => router.push(`/companies/${c.id}`)}
        searchPlaceholder="Поиск по названию, ИНН..."
        emptyMessage="Нет компаний. Создай первую!"
        emptyIcon={<Building2 size={32} className="text-text-mute" />}
      />

      {/* Modal */}
      <CompanyModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditCompany(null); }}
        editCompany={editCompany}
      />
    </>
  );
}
