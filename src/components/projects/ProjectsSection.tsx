'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Loader2, Plus, Rocket, Wrench } from 'lucide-react';
import { useDeliveryProjects, type Project } from '@/lib/hooks/use-projects';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ProjectModal } from './ProjectModal';
import { DeliveryPipelineBoard } from './DeliveryPipelineBoard';
import { PortfolioView } from './PortfolioView';
import { projectHref } from '@/lib/utils/project-href';

// ═══════════════════════════════════════════════════════
// Раздел «Проекты» = delivery (внедрение) + internal (внутренние).
// Сделки (client) живут отдельно на /deals — см. routing-контракт P1.
// ═══════════════════════════════════════════════════════

type SectionTab = 'delivery' | 'portfolio' | 'internal';

const TABS: readonly SectionTab[] = ['delivery', 'portfolio', 'internal'];

const STATUS_LABELS: Record<Project['status'], string> = {
  open: 'В работе',
  on_hold: 'Пауза',
  completed: 'Завершён',
  won: '—',
  lost: '—',
};

function InternalProjectsList() {
  const router = useRouter();
  const { data: rawProjects, isLoading, error } = useDeliveryProjects();
  const [modalOpen, setModalOpen] = useState(false);

  const internal = useMemo(
    () => (rawProjects ?? []).filter((p) => p.type === 'internal'),
    [rawProjects],
  );

  const columns: Column<Project>[] = [
    {
      key: 'name',
      label: 'Проект',
      sortable: true,
      render: (p) => <span className="font-medium text-text-main">{p.name}</span>,
      searchValue: (p) => p.name,
    },
    {
      key: 'status',
      label: 'Статус',
      sortable: true,
      render: (p) => (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          p.status === 'completed' ? 'bg-green-l text-green' : 'bg-accent-l text-accent'
        }`}>
          {STATUS_LABELS[p.status] ?? p.status}
        </span>
      ),
    },
    {
      key: 'deadline',
      label: 'Дедлайн',
      sortable: true,
      render: (p) => p.deadline ? (
        <span className="text-xs text-text-dim">
          {new Date(p.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </span>
      ) : <span className="text-text-mute">—</span>,
    },
    {
      key: 'next_step',
      label: 'Следующий шаг',
      render: (p) => p.next_step
        ? <span className="block max-w-[240px] truncate text-xs text-text-dim">{p.next_step}</span>
        : <span className="text-text-mute">—</span>,
    },
  ];

  if (isLoading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки проектов</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          <Plus size={14} /> Проект
        </button>
      </div>
      <DataTable
        data={internal}
        columns={columns}
        keyField="id"
        onRowClick={(p) => router.push(projectHref(p))}
        searchPlaceholder="Поиск по названию..."
        emptyMessage="Нет внутренних проектов"
        emptyIcon={<Wrench size={32} className="text-text-mute" />}
      />
      <ProjectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editProject={null} />
    </>
  );
}

export function ProjectsSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: SectionTab = (TABS as readonly string[]).includes(raw ?? '')
    ? (raw as SectionTab)
    : 'delivery';

  const setTab = (value: SectionTab) => {
    const qs = value === 'delivery' ? '' : `?tab=${value}`; // дефолт — чистый URL
    router.replace(`${pathname}${qs}`, { scroll: false });
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Rocket size={18} className="text-accent" />
        <h1 className="aura-page-title text-text-main">Проекты</h1>
      </div>

      {/* Табы: Внедрение (delivery-канбан) / Внутренние (список) */}
      <div className="mb-4 flex gap-1 border-b border-border">
        {([
          { value: 'delivery' as const, label: 'Внедрение' },
          { value: 'portfolio' as const, label: 'Портфель' },
          { value: 'internal' as const, label: 'Внутренние' },
        ]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.value
                ? 'border-accent text-accent'
                : 'border-transparent text-text-mute hover:text-text-main'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'portfolio' ? (
        <PortfolioView />
      ) : tab === 'delivery' ? (
        <DeliveryPipelineBoard />
      ) : (
        <InternalProjectsList />
      )}
    </div>
  );
}
