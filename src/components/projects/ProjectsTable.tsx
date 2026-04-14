'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderKanban, Loader2, Trash2, Download, Plus, AlertTriangle,
} from 'lucide-react';
import { useProjects, useDeleteProject, type Project } from '@/lib/hooks/use-projects';
import { STAGE_CONFIG, formatBudget } from '@/lib/validators/project';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { useChipFilter } from '@/lib/hooks/use-chip-filter';
import { exportToCSV } from '@/lib/utils/export-csv';
import { ProjectModal } from './ProjectModal';
import { useState } from 'react';

// Track mapping for the 3-track pipeline
function getTrack(stage: string): string {
  const order = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG]?.order ?? 0;
  if (order <= 5) return 'Подготовка';
  if (order <= 9) return 'Эксперимент';
  return 'Проект';
}

interface ProjectsTableProps {
  onSwitchView?: (view: string) => void;
}

export function ProjectsTable({ onSwitchView }: ProjectsTableProps) {
  const router = useRouter();
  const { data: projects, isLoading, error } = useProjects();
  const deleteProject = useDeleteProject();
  const [modalOpen, setModalOpen] = useState(false);

  const today = useMemo(() => new Date(new Date().toDateString()), []);

  const chipFilters = useMemo<Record<string, (p: Project) => boolean>>(() => ({
    track_prep: (p) => getTrack(p.stage) === 'Подготовка',
    track_exp: (p) => getTrack(p.stage) === 'Эксперимент',
    track_proj: (p) => getTrack(p.stage) === 'Проект',
    has_budget: (p) => !!p.budget && p.budget > 0,
    overdue: (p) => !!p.deadline && new Date(p.deadline) < today,
  }), [today]);

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost'),
    [projects],
  );

  const { filtered, activeFilters, counts, toggle, reset } = useChipFilter(activeProjects, chipFilters);

  const chipOptions: ChipOption[] = useMemo(() => [
    { label: 'Подготовка', value: 'track_prep', count: counts.track_prep },
    { label: 'Эксперимент', value: 'track_exp', count: counts.track_exp },
    { label: 'Проект', value: 'track_proj', count: counts.track_proj },
    { label: 'Есть бюджет', value: 'has_budget', count: counts.has_budget },
    { label: 'Просрочен', value: 'overdue', count: counts.overdue },
  ], [counts]);

  const columns: Column<Project>[] = [
    {
      key: 'name',
      label: 'Проект',
      sortable: true,
      render: (p) => (
        <span className="font-medium text-text-main">{p.name}</span>
      ),
      searchValue: (p) => p.name,
    },
    {
      key: 'stage',
      label: 'Стадия',
      sortable: true,
      render: (p) => {
        const cfg = STAGE_CONFIG[p.stage];
        return (
          <span className="rounded-full bg-accent-l px-2 py-0.5 text-[10px] font-medium text-accent">
            {cfg.shortLabel}
          </span>
        );
      },
    },
    {
      key: 'track',
      label: 'Трек',
      sortable: false,
      render: (p) => (
        <span className="text-xs text-text-dim">{getTrack(p.stage)}</span>
      ),
    },
    {
      key: 'company_id',
      label: 'Компания',
      sortable: true,
      render: (p) => p.company ? (
        <button onClick={(e) => { e.stopPropagation(); router.push(`/companies/${p.company_id}`); }}
          className="text-sm text-accent hover:underline">
          {p.company.name}
        </button>
      ) : <span className="text-text-mute">—</span>,
      searchValue: (p) => p.company?.name ?? '',
    },
    {
      key: 'contact_id',
      label: 'Контакт',
      sortable: true,
      render: (p) => p.contact ? (
        <button onClick={(e) => { e.stopPropagation(); router.push(`/contacts/${p.contact_id}`); }}
          className="text-sm text-accent hover:underline">
          {p.contact.first_name} {p.contact.last_name}
        </button>
      ) : <span className="text-text-mute">—</span>,
      searchValue: (p) => p.contact ? `${p.contact.first_name} ${p.contact.last_name}` : '',
    },
    {
      key: 'budget',
      label: 'Бюджет',
      sortable: true,
      render: (p) => p.budget && p.budget > 0 ? (
        <span className="text-sm font-medium text-text-main tabular-nums">{formatBudget(p.budget)}</span>
      ) : (
        <span className="flex items-center gap-1 text-yellow" title="Бюджет не указан">
          <AlertTriangle size={11} />
          <span className="text-[10px]">—</span>
        </span>
      ),
    },
    {
      key: 'deadline',
      label: 'Дедлайн',
      sortable: true,
      render: (p) => {
        if (!p.deadline) return <span className="text-text-mute">—</span>;
        const isOverdue = new Date(p.deadline) < today;
        return (
          <span className={`text-xs ${isOverdue ? 'text-red font-medium' : 'text-text-dim'}`}>
            {new Date(p.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        );
      },
    },
    {
      key: 'next_step',
      label: 'Следующий шаг',
      render: (p) => p.next_step ? (
        <span className="text-xs text-text-dim truncate block max-w-[200px]">{p.next_step}</span>
      ) : <span className="text-text-mute">—</span>,
    },
  ];

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Проекты</h1>
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">
            {activeProjects.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => onSwitchView?.('pipeline')}
              className="px-3 py-1.5 text-xs text-text-dim hover:text-text-main transition-colors"
            >
              Воронка
            </button>
            <button
              onClick={() => onSwitchView?.('board')}
              className="px-3 py-1.5 text-xs text-text-dim hover:text-text-main transition-colors"
            >
              Доска
            </button>
            <button className="px-3 py-1.5 text-xs bg-accent text-white">
              Таблица
            </button>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Plus size={14} /> Проект
          </button>
        </div>
      </div>

      <div className="mb-3">
        <ChipFilter options={chipOptions} selected={activeFilters} onToggle={toggle} onReset={reset} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyField="id"
        onRowClick={(p) => router.push(`/projects/${p.id}`)}
        searchPlaceholder="Поиск по названию, компании..."
        emptyMessage="Нет активных проектов"
        emptyIcon={<FolderKanban size={32} className="text-text-mute" />}
        selectable
        bulkActions={[
          {
            label: 'Удалить',
            icon: <Trash2 size={14} />,
            variant: 'danger',
            onClick: (ids) => {
              if (!confirm(`Удалить ${ids.length} проектов?`)) return;
              ids.forEach((id) => deleteProject.mutate(id));
            },
          },
          {
            label: 'CSV',
            icon: <Download size={14} />,
            onClick: (ids) => {
              const sel = filtered.filter((p) => ids.includes(p.id));
              exportToCSV(
                sel.map((p) => ({
                  name: p.name,
                  stage: STAGE_CONFIG[p.stage].label,
                  track: getTrack(p.stage),
                  company: p.company?.name ?? '',
                  contact: p.contact ? `${p.contact.first_name} ${p.contact.last_name}` : '',
                  budget: p.budget ? formatBudget(p.budget) : '',
                  deadline: p.deadline ?? '',
                  next_step: p.next_step ?? '',
                })),
                'projects',
                [
                  { key: 'name', label: 'Проект' },
                  { key: 'stage', label: 'Стадия' },
                  { key: 'track', label: 'Трек' },
                  { key: 'company', label: 'Компания' },
                  { key: 'contact', label: 'Контакт' },
                  { key: 'budget', label: 'Бюджет' },
                  { key: 'deadline', label: 'Дедлайн' },
                  { key: 'next_step', label: 'Следующий шаг' },
                ],
              );
            },
          },
        ]}
      />

      <ProjectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editProject={null} />
    </>
  );
}
