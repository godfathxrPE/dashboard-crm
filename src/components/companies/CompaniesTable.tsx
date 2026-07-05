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
import { useLastTouchMap, daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { RECONNECT_THRESHOLD_DAYS } from '@/lib/constants/reconnect';
import { formatBudget } from '@/lib/validators/project';
import { DataTable, type Column, type BulkAction } from '@/components/shared/DataTable';
import { EditableCell } from '@/components/shared/EditableCell';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { SavedViewChips } from '@/components/ui/SavedViewChips';
import { useChipFilter } from '@/lib/hooks/use-chip-filter';
import { CompanyModal } from './CompanyModal';
import { ExcelImportButton } from './ExcelImport';
import { localDateKey } from '@/lib/utils/date-helpers';

type CompanyRow = Company & {
  contacts_count: number;
  projects_count: number;
  pipeline_budget: number;
  last_touch: string | null;
};

export function CompaniesTable() {
  const router = useRouter();
  const { data: companies, isLoading, error } = useCompanies();
  const { data: allContacts } = useContacts();
  const { data: allProjects } = useProjects();
  const lastTouch = useLastTouchMap();
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

  // Обогащение строк: связи, pipeline открытых сделок, касание = max по контактам компании
  const rows = useMemo<CompanyRow[]>(() => {
    const pipelineByCompany: Record<string, number> = {};
    (allProjects ?? []).forEach((p) => {
      if (p.company_id && p.status !== 'won' && p.status !== 'lost') {
        pipelineByCompany[p.company_id] = (pipelineByCompany[p.company_id] ?? 0) + (p.budget ?? 0);
      }
    });

    const touchByCompany: Record<string, string> = {};
    (allContacts ?? []).forEach((c) => {
      const t = lastTouch.get(c.id)?.date;
      if (!t) return;
      (c.companies ?? []).forEach((cc) => {
        if (!touchByCompany[cc.company_id] || t > touchByCompany[cc.company_id]) {
          touchByCompany[cc.company_id] = t;
        }
      });
    });

    return (companies ?? []).map((c) => ({
      ...c,
      contacts_count: companyContactCount[c.id] ?? 0,
      projects_count: companyProjectCount[c.id] ?? 0,
      pipeline_budget: pipelineByCompany[c.id] ?? 0,
      last_touch: touchByCompany[c.id] ?? null,
    }));
  }, [companies, allContacts, allProjects, lastTouch, companyContactCount, companyProjectCount]);

  const chipFilters = useMemo<Record<string, (c: CompanyRow) => boolean>>(() => ({
    has_projects: (c) => c.projects_count > 0,
    has_contacts: (c) => c.contacts_count > 0,
    recent: (c) => c.created_at >= sevenDaysAgo,
    cooling: (c) => !c.last_touch || daysSince(c.last_touch) > RECONNECT_THRESHOLD_DAYS,
  }), [sevenDaysAgo]);

  const { filtered, activeFilters, counts, toggle, reset } = useChipFilter(rows, chipFilters);

  const chipOptions: ChipOption[] = useMemo(() => [
    { label: 'Есть проекты', value: 'has_projects', count: counts.has_projects },
    { label: 'Есть контакты', value: 'has_contacts', count: counts.has_contacts },
    { label: 'За 7 дней', value: 'recent', count: counts.recent },
    { label: 'Остывают', value: 'cooling', count: counts.cooling },
  ], [counts]);

  function openEdit(company: Company) {
    setEditCompany(company);
    setModalOpen(true);
  }

  const columns: Column<CompanyRow>[] = [
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
      key: 'contacts_count',
      label: 'Контакты',
      sortable: true,
      width: '90px',
      render: (c) => c.contacts_count > 0
        ? <span className="text-sm tabular-nums text-text-dim">{c.contacts_count}</span>
        : <span className="text-text-mute">—</span>,
    },
    {
      key: 'projects_count',
      label: 'Сделки',
      sortable: true,
      width: '80px',
      render: (c) => c.projects_count > 0
        ? <span className="text-sm tabular-nums text-text-dim">{c.projects_count}</span>
        : <span className="text-text-mute">—</span>,
    },
    {
      key: 'pipeline_budget',
      label: 'Pipeline',
      sortable: true,
      width: '100px',
      render: (c) => c.pipeline_budget > 0
        ? <span className="text-sm tabular-nums font-medium text-text-main">{formatBudget(c.pipeline_budget)}</span>
        : <span className="text-text-mute">—</span>,
    },
    {
      key: 'last_touch',
      label: 'Касание',
      sortable: true,
      width: '100px',
      render: (c) => {
        if (!c.last_touch) return <span className="text-xs text-text-mute">—</span>;
        const days = daysSince(c.last_touch);
        const level = touchLevel(days);
        if (level === 'ok') {
          return (
            <span className="text-xs text-text-dim">
              {new Date(c.last_touch).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </span>
          );
        }
        return (
          <span className={`text-xs ${level === 'cold' ? 'text-red' : 'text-yellow'}`}>
            {days} дн.
          </span>
        );
      },
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ChipFilter options={chipOptions} selected={activeFilters} onToggle={toggle} onReset={reset} />
        <SavedViewChips />
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
