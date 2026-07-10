'use client';

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils/cn';
import { leadStaleness } from '@/lib/constants/leads';
import {
  Plus,
  Loader2,
  Target,
  Trash2,
  Download,
  ArrowRight,
  Phone,
  Building2,
  User,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useLeads, useConvertedLeads, useUpdateLead, useDeleteLead } from '@/lib/hooks/use-leads';
import {
  LEAD_STATUS_CONFIG,
  LEAD_SOURCE_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  disqualifyReasons,
  type DisqualifyReason,
} from '@/lib/validators/lead';
import { Badge } from '@/components/ui/Badge';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { exportToCSV } from '@/lib/utils/export-csv';
import { LeadModal } from './LeadModal';
import { LeadConversionModal } from './LeadConversionModal';
import type { Lead, LeadStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Status column config for Kanban
// ═══════════════════════════════════════════════════════

const KANBAN_COLUMNS: { status: LeadStatus; label: string; color: string }[] = [
  { status: 'new',            label: 'Новые',              color: 'var(--blue)' },
  { status: 'contacted',      label: 'Контакт',            color: 'var(--yellow)' },
  { status: 'qualified',      label: 'Квалифицированные',  color: 'var(--green)' },
  { status: 'disqualified',   label: 'Дисквалифицированные', color: 'var(--red)' },
];

// ═══════════════════════════════════════════════════════
// Lead Card (Kanban)
// ═══════════════════════════════════════════════════════

function LeadCard({
  lead,
  onEdit,
  onStatusChange,
  onConvert,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus, reason?: DisqualifyReason) => void;
  onConvert: (lead: Lead) => void;
}) {
  // «Отклонить» — двухшаговый: сначала причина, потом статус
  const [rejecting, setRejecting] = useState(false);
  // Drag между стадиями (как в воронке проектов); клики по кнопкам
  // не активируют drag благодаря activationConstraint distance: 8
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'touch-none cursor-grab active:cursor-grabbing rounded-lg border border-border bg-surface p-3 shadow-card transition-shadow hover:shadow-card-hover',
        isDragging && 'relative z-50 rotate-1 opacity-80 shadow-card-hover',
      )}
    >
      {/* Title + source */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <button
          onClick={() => onEdit(lead)}
          className="text-left text-sm font-medium text-text-main hover:text-accent transition-colors leading-tight"
        >
          {lead.title}
        </button>
        {lead.source && (
          <Badge color="accent" size="sm">
            {LEAD_SOURCE_CONFIG[lead.source]?.label ?? lead.source}
          </Badge>
        )}
      </div>

      {/* Direction badge */}
      {lead.direction && (
        <div className="mb-1.5">
          <Badge color={lead.direction === 'erp' ? 'purple' : 'blue'} size="sm">
            {lead.direction === 'iiot' ? 'IIoT' : 'ERP'}
          </Badge>
        </div>
      )}

      {/* Contact info */}
      <div className="flex flex-col gap-0.5 mb-2">
        {lead.company_name_raw && (
          <span className="flex items-center gap-1 text-[10px] text-text-dim">
            <Building2 size={9} />
            <span className="truncate">{lead.company_name_raw}</span>
          </span>
        )}
        {lead.contact_name_raw && (
          <span className="flex items-center gap-1 text-[10px] text-text-dim">
            <User size={9} />
            <span className="truncate">{lead.contact_name_raw}</span>
          </span>
        )}
        {lead.phone && (
          <span className="flex items-center gap-1 text-[10px] text-text-dim">
            <Phone size={9} />
            {lead.phone}
          </span>
        )}
      </div>

      {/* Date + возраст в статусе (rotting для лидов — язык меток как у сделок: ○/●) */}
      <div className="mb-2 flex items-center gap-2 text-[10px] text-text-mute">
        {new Date(lead.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        {(() => {
          const s = leadStaleness(lead);
          if (s.level === 'ok') return null;
          const color = s.level === 'cold'
            ? 'var(--red-text, var(--red))'
            : 'var(--yellow-text, var(--yellow))';
          return (
            <span
              className="flex items-center gap-1 font-medium"
              style={{ color }}
              title={lead.status === 'new' ? 'Дней без первого касания' : 'Дней без движения'}
            >
              <span className={cn(
                'inline-block h-[6px] w-[6px] rounded-full',
                s.level === 'cold' ? 'bg-current' : 'border border-current',
              )} />
              {s.days} дн.
            </span>
          );
        })()}
      </div>

      {/* Reject: выбор причины */}
      {rejecting && (
        <div className="mb-1 flex flex-wrap items-center gap-1 border-t border-border/50 pt-2">
          <span className="w-full text-[10px] text-text-mute">Причина отказа:</span>
          {disqualifyReasons.map((r) => (
            <button
              key={r}
              onClick={() => { onStatusChange(lead.id, 'disqualified', r); setRejecting(false); }}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-dim
                         transition-colors hover:border-red hover:bg-red-l hover:text-red"
            >
              {DISQUALIFY_REASON_CONFIG[r].label}
            </button>
          ))}
          <button
            onClick={() => setRejecting(false)}
            className="rounded px-1.5 py-0.5 text-[10px] text-text-mute hover:text-text-main"
          >
            Отмена
          </button>
        </div>
      )}

      {/* Actions by status */}
      <div className="flex items-center gap-1 border-t border-border/50 pt-2">
        {lead.status === 'new' && (
          <button
            onClick={() => onStatusChange(lead.id, 'contacted')}
            className="rounded px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent-l transition-colors"
          >
            Связаться
          </button>
        )}
        {lead.status === 'contacted' && !rejecting && (
          <>
            <button
              onClick={() => onStatusChange(lead.id, 'qualified')}
              className="rounded px-2 py-1 text-[10px] font-medium text-green hover:bg-green-l transition-colors"
            >
              Квалифицировать
            </button>
            <button
              onClick={() => setRejecting(true)}
              className="rounded px-2 py-1 text-[10px] font-medium text-red hover:bg-red-l transition-colors"
            >
              Отклонить
            </button>
          </>
        )}
        {lead.status === 'qualified' && (
          <button
            onClick={() => onConvert(lead)}
            className="flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent-l transition-colors"
          >
            Конвертировать <ArrowRight size={10} />
          </button>
        )}
        {lead.status === 'disqualified' && (
          <>
            {lead.disqualify_reason && (
              <span className="rounded bg-red-l px-1.5 py-0.5 text-[10px] text-red">
                {DISQUALIFY_REASON_CONFIG[lead.disqualify_reason as DisqualifyReason]?.label ?? lead.disqualify_reason}
              </span>
            )}
            <button
              onClick={() => onStatusChange(lead.id, 'new')}
              className="rounded px-2 py-1 text-[10px] font-medium text-text-mute hover:bg-surface2 transition-colors"
            >
              Восстановить
            </button>
          </>
        )}
        <button
          onClick={() => onEdit(lead)}
          className="ml-auto rounded px-2 py-1 text-[10px] text-text-mute hover:text-text-main hover:bg-surface2 transition-colors"
        >
          Ред.
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Converted leads strip (паттерн LostDeals из воронки)
// ═══════════════════════════════════════════════════════

function ConvertedLeads() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data: converted = [] } = useConvertedLeads();

  if (converted.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-border/50 bg-surface/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface2"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-sm font-medium text-text-dim">Конвертированы</span>
        <span className="rounded-full bg-green-l px-2 py-0.5 text-xs font-medium text-green">
          {converted.length}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4">
          <div className="space-y-2">
            {converted.map((lead) => (
              <div
                key={lead.id}
                className="group flex items-center gap-3 rounded-lg border border-border/50 bg-bg px-3 py-2.5 transition-colors hover:border-border"
              >
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => lead.converted_deal_id && router.push(`/deals/${lead.converted_deal_id}`)}
                    className="block truncate text-sm text-text-main transition-colors hover:text-accent"
                  >
                    {lead.title}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-dim">
                    {lead.company_name_raw && (
                      <span className="flex items-center gap-0.5">
                        <Building2 size={9} />
                        {lead.company_name_raw}
                      </span>
                    )}
                    {lead.source && (
                      <span className="rounded bg-accent-l px-1 py-px text-accent">
                        {LEAD_SOURCE_CONFIG[lead.source]?.label ?? lead.source}
                      </span>
                    )}
                    {lead.converted_at && (
                      <span>
                        {new Date(lead.converted_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                {lead.converted_deal_id && (
                  <button
                    onClick={() => router.push(`/deals/${lead.converted_deal_id}`)}
                    className="flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-medium text-accent
                               opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent-l"
                  >
                    К сделке <ArrowRight size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Droppable column (Kanban DnD)
// ═══════════════════════════════════════════════════════

function DroppableColumn({ status, children }: { status: LeadStatus; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[96px] flex-1 flex-col gap-2 rounded-lg transition-colors',
        isOver && 'bg-accent-l/30',
      )}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main View
// ═══════════════════════════════════════════════════════

export function LeadsView() {
  const { data: leads, isLoading, error } = useLeads();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [modalOpen, setModalOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);

  // Direction filter
  const [dirFilter, setDirFilter] = useState<'all' | 'iiot' | 'erp' | 'none'>('all');

  const filtered = useMemo(() => {
    if (!leads) return [];
    if (dirFilter === 'all') return leads;
    if (dirFilter === 'none') return leads.filter((l) => !l.direction);
    return leads.filter((l) => l.direction === dirFilter);
  }, [leads, dirFilter]);

  const dirOptions: ChipOption[] = useMemo(() => {
    const all = leads ?? [];
    return [
      { label: 'Все', value: 'all', count: all.length },
      { label: 'IIoT', value: 'iiot', count: all.filter((l) => l.direction === 'iiot').length },
      { label: 'ERP', value: 'erp', count: all.filter((l) => l.direction === 'erp').length },
      { label: 'Не определено', value: 'none', count: all.filter((l) => !l.direction).length },
    ];
  }, [leads]);

  const handleStatusChange = useCallback((id: string, status: LeadStatus, reason?: DisqualifyReason) => {
    updateLead.mutate({
      id,
      status,
      // причина живёт только у disqualified; восстановление её очищает
      disqualify_reason: status === 'disqualified' ? reason ?? null : null,
    });
  }, [updateLead]);

  // DnD между стадиями (distance 8 — чтобы клики по кнопкам карточки не стали drag'ом)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const status = over.id as LeadStatus;
    const lead = leads?.find((l) => l.id === active.id);
    if (!lead || lead.status === status) return;
    updateLead.mutate({ id: lead.id, status });
  }, [leads, updateLead]);

  const handleEdit = useCallback((lead: Lead) => {
    setEditLead(lead);
    setModalOpen(true);
  }, []);

  const handleConvert = useCallback((lead: Lead) => {
    setConvertLead(lead);
  }, []);

  // Group for Kanban
  const grouped = useMemo(() => {
    const result: Record<LeadStatus, Lead[]> = {
      new: [], contacted: [], qualified: [], disqualified: [], converted: [],
    };
    for (const l of filtered) {
      result[l.status]?.push(l);
    }
    return result;
  }, [filtered]);

  // Table columns
  const columns: Column<Lead>[] = [
    {
      key: 'title',
      label: 'Название',
      sortable: true,
      render: (l) => (
        <button onClick={() => handleEdit(l)} className="font-medium text-text-main hover:text-accent transition-colors text-left">
          {l.title}
        </button>
      ),
      searchValue: (l) => l.title,
    },
    {
      key: 'source',
      label: 'Источник',
      sortable: true,
      render: (l) => l.source ? (
        <Badge color="accent" size="sm">{LEAD_SOURCE_CONFIG[l.source]?.label ?? l.source}</Badge>
      ) : <span className="text-text-mute">—</span>,
    },
    {
      key: 'status',
      label: 'Статус',
      sortable: true,
      render: (l) => {
        const cfg = LEAD_STATUS_CONFIG[l.status];
        return <Badge color={cfg?.color as 'blue' | 'green' | 'red' | 'yellow' | 'accent'} size="sm">{cfg?.label ?? l.status}</Badge>;
      },
    },
    {
      key: 'direction',
      label: 'Направление',
      sortable: true,
      render: (l) => l.direction ? (
        <Badge color={l.direction === 'erp' ? 'purple' : 'blue'} size="sm">
          {l.direction === 'iiot' ? 'IIoT' : 'ERP'}
        </Badge>
      ) : <span className="text-text-mute">—</span>,
    },
    {
      key: 'company_name_raw',
      label: 'Компания',
      sortable: true,
      render: (l) => l.company_name_raw ? (
        <span className="text-sm text-text-main">{l.company_name_raw}</span>
      ) : <span className="text-text-mute">—</span>,
      searchValue: (l) => l.company_name_raw ?? '',
    },
    {
      key: 'contact_name_raw',
      label: 'Контакт',
      render: (l) => l.contact_name_raw ? (
        <span className="text-sm text-text-main">{l.contact_name_raw}</span>
      ) : <span className="text-text-mute">—</span>,
      searchValue: (l) => l.contact_name_raw ?? '',
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (l) => l.phone ? (
        <span className="text-sm text-text-dim">{l.phone}</span>
      ) : <span className="text-text-mute">—</span>,
    },
    {
      key: 'created_at',
      label: 'Создан',
      sortable: true,
      render: (l) => (
        <span className="text-xs text-text-dim">
          {new Date(l.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
  }
  if (error) {
    return <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center"><p className="text-sm text-red">Ошибка загрузки лидов</p></div>;
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-accent" />
          <h1 className="aura-page-title text-text-main">Лиды</h1>
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setView('kanban')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${view === 'kanban' ? 'bg-accent text-white' : 'text-text-dim hover:text-text-main'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${view === 'table' ? 'bg-accent text-white' : 'text-text-dim hover:text-text-main'}`}
            >
              <List size={14} />
            </button>
          </div>
          <button
            onClick={() => { setEditLead(null); setModalOpen(true); }}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Plus size={14} /> Лид
          </button>
        </div>
      </div>

      {/* Direction filter */}
      <div className="mb-4">
        <ChipFilter
          options={dirOptions}
          selected={dirFilter === 'all' ? [] : [dirFilter]}
          onToggle={(val) => setDirFilter(val === dirFilter ? 'all' : val as typeof dirFilter)}
          onReset={() => setDirFilter('all')}
        />
      </div>

      {/* Kanban view */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KANBAN_COLUMNS.map((col) => {
            const items = grouped[col.status] ?? [];
            return (
              <div key={col.status} className="flex flex-col">
                {/* Column header */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: col.color }}>
                    {col.label}
                  </span>
                  <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-text-mute">
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <DroppableColumn status={col.status}>
                  {items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onEdit={handleEdit}
                      onStatusChange={handleStatusChange}
                      onConvert={handleConvert}
                    />
                  ))}
                  {items.length === 0 && (
                    <div data-kanban-empty className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/50">
                      <span className="text-xs text-text-mute">Перетащи лид сюда</span>
                    </div>
                  )}
                </DroppableColumn>
              </div>
            );
          })}
        </div>
        </DndContext>
      )}

      {/* Table view */}
      {view === 'table' && (
        <DataTable
          data={filtered}
          columns={columns}
          keyField="id"
          onRowClick={handleEdit}
          searchPlaceholder="Поиск по названию, компании..."
          emptyMessage="Нет лидов"
          emptyIcon={<Target size={32} className="text-text-mute" />}
          selectable
          bulkActions={[
            {
              label: 'Удалить',
              icon: <Trash2 size={14} />,
              variant: 'danger',
              onClick: (ids) => {
                if (!confirm(`Удалить ${ids.length} лидов?`)) return;
                ids.forEach((id) => deleteLead.mutate(id));
              },
            },
            {
              label: 'CSV',
              icon: <Download size={14} />,
              onClick: (ids) => {
                const sel = filtered.filter((l) => ids.includes(l.id));
                exportToCSV(
                  sel.map((l) => ({
                    title: l.title,
                    source: l.source ? LEAD_SOURCE_CONFIG[l.source]?.label ?? l.source : '',
                    status: LEAD_STATUS_CONFIG[l.status]?.label ?? l.status,
                    direction: l.direction === 'iiot' ? 'IIoT' : l.direction === 'erp' ? 'ERP' : '',
                    company: l.company_name_raw ?? '',
                    contact: l.contact_name_raw ?? '',
                    phone: l.phone ?? '',
                    email: l.email ?? '',
                    created_at: l.created_at,
                  })),
                  'leads',
                  [
                    { key: 'title', label: 'Название' },
                    { key: 'source', label: 'Источник' },
                    { key: 'status', label: 'Статус' },
                    { key: 'direction', label: 'Направление' },
                    { key: 'company', label: 'Компания' },
                    { key: 'contact', label: 'Контакт' },
                    { key: 'phone', label: 'Телефон' },
                    { key: 'email', label: 'Email' },
                    { key: 'created_at', label: 'Создан' },
                  ],
                );
              },
            },
          ]}
        />
      )}

      {/* Конвертированные — свёрнутая полоса (паттерн LostDeals) */}
      <ConvertedLeads />

      {/* Modals */}
      <LeadModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditLead(null); }}
        editLead={editLead}
      />
      {convertLead && (
        <LeadConversionModal
          isOpen={!!convertLead}
          onClose={() => setConvertLead(null)}
          lead={convertLead}
        />
      )}
    </>
  );
}
