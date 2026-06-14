'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Loader2, Trash2, Download } from 'lucide-react';
import { CTAButton } from '@/components/ui/CTAButton';
import { PageHeader } from '@/components/layout/PageHeader';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import { useCompanies, useUpdateCompany, useDeleteCompany, type Company } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useProjects } from '@/lib/hooks/use-projects';
import { DataTable, type Column, type BulkAction } from '@/components/shared/DataTable';
import { EditableCell } from '@/components/shared/EditableCell';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { useChipFilter } from '@/lib/hooks/use-chip-filter';
import { CompanyModal } from './CompanyModal';
import { ExcelImportButton } from './ExcelImport';
import { localDateKey } from '@/lib/utils/date-helpers';

export function CompaniesTable() {
  const router = useRouter();
  const { data: companies, isLoading, error } = useCompanies();
  const { data: allContacts } = useContacts();
  const { data: allProjects } = useProjects();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  const [modalOpen, setModalOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);

  // Build lookup maps for chip filters
  const companyContactCount = useMemo(() => {
    const map: Record<string, number> = {};
    (allContacts ?? []).forEach((c) => {
      (c.companies ?? []).forEach((cc) => {
        map[cc.company_id] = (map[cc.company_id] || 0) + 1;
      });
    });
    return map;
  }, [allContacts]);

  const companyProjectCount = useMemo(() => {
    const map: Record<string, number> = {};
    (allProjects ?? []).forEach((p) => {
      if (p.company_id) map[p.company_id] = (map[p.company_id] || 0) + 1;
    });
    return map;
  }, [allProjects]);

  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 86400000).toISOString(), []);

  const chipFilters = useMemo<Record<string, (c: Company) => boolean>>(() => ({
    has_projects: (c) => (companyProjectCount[c.id] ?? 0) > 0,
    has_contacts: (c) => (companyContactCount[c.id] ?? 0) > 0,
    recent: (c) => c.created_at >= sevenDaysAgo,
  }), [companyProjectCount, companyContactCount, sevenDaysAgo]);

  const { filtered, activeFilters, counts, toggle, reset } = useChipFilter(companies ?? [], chipFilters);

  const chipOptions: ChipOption[] = useMemo(() => [
    { label: 'Есть проекты', value: 'has_projects', count: counts.has_projects },
    { label: 'Есть контакты', value: 'has_contacts', count: counts.has_contacts },
    { label: 'За 7 дней', value: 'recent', count: counts.recent },
  ], [counts]);

  function openEdit(company: Company) {
    setEditCompany(company);
    setModalOpen(true);
  }

  const columns: Column<Company>[] = [
    {
      key: 'name',
      label: 'Компания',
      sortable: true,
      render: (c) => (
        <div>
          <span className="text-sm text-text-main">{c.name}</span>
          {c.inn && <span className="ml-2 text-xs text-text-dim">ИНН {c.inn}</span>}
        </div>
      ),
      searchValue: (c) => `${c.name} ${c.inn ?? ''}`,
    },
    {
      key: 'industry',
      label: 'Отрасль',
      sortable: true,
      render: (c) => c.industry ? (
        <EditableCell
          value={c.industry}
          className="text-text-dim"
          onSave={(val) => updateCompany.mutateAsync({ id: c.id, industry: val || null })}
        />
      ) : (
        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }}
          className="add-on-hover text-sm transition-colors hover:text-accent">
          + добавить
        </button>
      ),
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (c) => c.phone ? (
        <EditableCell
          value={c.phone}
          type="tel"
          className="text-text-dim"
          onSave={(val) => updateCompany.mutateAsync({ id: c.id, phone: val || null })}
        />
      ) : (
        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }}
          className="add-on-hover text-sm transition-colors hover:text-accent">
          + добавить
        </button>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (c) => c.email ? (
        <EditableCell
          value={c.email}
          type="email"
          className="text-accent"
          onSave={(val) => updateCompany.mutateAsync({ id: c.id, email: val || null })}
        />
      ) : (
        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }}
          className="add-on-hover text-sm transition-colors hover:text-accent">
          + добавить
        </button>
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
      <PageHeader
        title="Компании"
        wmText="Компании"
        wmColors={WATERMARK_GRADIENTS.aurora}
        count={companies?.length ?? 0}
        icon={<Building2 size={18} className="text-accent" />}
        action={
          <div className="flex items-center gap-2">
            <ExcelImportButton />
            <CTAButton size="sm" onClick={() => { setEditCompany(null); setModalOpen(true); }}><Plus size={14} /> Компания</CTAButton>
          </div>
        }
      />

      {/* Chip filters */}
      <div className="mb-3">
        <ChipFilter options={chipOptions} selected={activeFilters} onToggle={toggle} onReset={reset} />
      </div>

      <DataTable
        data={filtered}
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
              a.download = `companies-${localDateKey()}.csv`; a.click();
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
