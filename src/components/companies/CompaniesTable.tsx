'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Loader2 } from 'lucide-react';
import { Trash2, Download } from 'lucide-react';
import { useCompanies, useUpdateCompany, useDeleteCompany, type Company } from '@/lib/hooks/use-companies';
import { DataTable, type Column, type BulkAction } from '@/components/shared/DataTable';
import { EditableCell } from '@/components/shared/EditableCell';
import { CompanyModal } from './CompanyModal';

export function CompaniesTable() {
  const router = useRouter();
  const { data: companies, isLoading, error } = useCompanies();
  const updateCompany = useUpdateCompany();
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
      render: (c) => (
        <EditableCell
          value={c.industry ?? ''}
          className="text-text-dim"
          onSave={(val) => updateCompany.mutateAsync({ id: c.id, industry: val || null })}
        />
      ),
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (c) => (
        <EditableCell
          value={c.phone ?? ''}
          type="tel"
          className="text-text-dim"
          onSave={(val) => updateCompany.mutateAsync({ id: c.id, phone: val || null })}
        />
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (c) => (
        <EditableCell
          value={c.email ?? ''}
          type="email"
          className="text-accent"
          onSave={(val) => updateCompany.mutateAsync({ id: c.id, email: val || null })}
        />
      ),
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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Компании</h1>
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">
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

      <DataTable
        data={companies ?? []}
        columns={columns}
        keyField="id"
        onRowClick={(c) => router.push(`/companies/${c.id}`)}
        searchPlaceholder="Поиск по названию, ИНН..."
        emptyMessage="Нет компаний. Создай первую!"
        emptyIcon={<Building2 size={32} className="text-text-mute" />}
        selectable
        bulkActions={[
          {
            label: 'Удалить',
            icon: <Trash2 size={14} />,
            variant: 'danger',
            onClick: (ids) => {
              if (!confirm(`Удалить ${ids.length} компаний?`)) return;
              ids.forEach((id) => deleteCompany.mutate(id));
            },
          },
          {
            label: 'CSV',
            icon: <Download size={14} />,
            onClick: (ids) => {
              const sel = (companies ?? []).filter((c) => ids.includes(c.id));
              const csv = [
                'Название,ИНН,Отрасль,Телефон,Email',
                ...sel.map((c) => [c.name, c.inn ?? '', c.industry ?? '', c.phone ?? '', c.email ?? ''].join(',')),
              ].join('\n');
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
            },
          },
        ]}
      />

      <CompanyModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditCompany(null); }}
        editCompany={editCompany}
      />
    </>
  );
}
