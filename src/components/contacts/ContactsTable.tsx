'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Loader2, Building2, Trash2, Download } from 'lucide-react';
import { CTAButton } from '@/components/ui/CTAButton';
import { PageHeader } from '@/components/layout/PageHeader';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import { useContacts, useUpdateContact, useDeleteContact, type Contact } from '@/lib/hooks/use-contacts';
import { DataTable, type Column, type BulkAction } from '@/components/shared/DataTable';
import { EditableCell } from '@/components/shared/EditableCell';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { useChipFilter } from '@/lib/hooks/use-chip-filter';
import { ContactModal } from './ContactModal';
import { localDateKey } from '@/lib/utils/date-helpers';

const CHIP_FILTERS: Record<string, (c: Contact) => boolean> = {
  has_email: (c) => !!c.email,
  has_phone: (c) => !!c.phone,
};

export function ContactsTable() {
  const router = useRouter();
  const { data: contacts, isLoading, error } = useContacts();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const [modalOpen, setModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  // Dynamic position chips (top 5)
  const positionFilters = useMemo(() => {
    const freq: Record<string, number> = {};
    (contacts ?? []).forEach((c) => {
      if (c.position) freq[c.position] = (freq[c.position] || 0) + 1;
    });
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce<Record<string, (c: Contact) => boolean>>((acc, [pos]) => {
        acc[`pos_${pos}`] = (c) => c.position === pos;
        return acc;
      }, {});
  }, [contacts]);

  const allFilters = useMemo(() => ({ ...CHIP_FILTERS, ...positionFilters }), [positionFilters]);
  const { filtered, activeFilters, counts, toggle, reset } = useChipFilter(contacts ?? [], allFilters);

  const chipOptions: ChipOption[] = useMemo(() => [
    { label: 'Есть email', value: 'has_email', count: counts.has_email },
    { label: 'Есть телефон', value: 'has_phone', count: counts.has_phone },
    ...Object.keys(positionFilters).map((key) => ({
      label: key.replace('pos_', ''),
      value: key,
      count: counts[key],
    })),
  ], [counts, positionFilters]);

  function openEdit(contact: Contact) {
    setEditContact(contact);
    setModalOpen(true);
  }

  const columns: Column<Contact>[] = [
    {
      key: 'last_name',
      label: 'Контакт',
      render: (c) => (
        <span className="font-medium text-text-main">{c.first_name} {c.last_name}</span>
      ),
      searchValue: (c) => `${c.first_name} ${c.last_name}`,
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
                className="inline-flex items-center gap-0.5 rounded bg-surface2 border border-border px-1.5 py-0.5 text-[10px] text-text-dim">
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
      render: (c) => c.phone ? (
        <EditableCell
          value={c.phone}
          type="tel"
          className="text-text-dim"
          onSave={(val) => updateContact.mutateAsync({ id: c.id, phone: val || null })}
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
          onSave={(val) => updateContact.mutateAsync({ id: c.id, email: val || null })}
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
      <PageHeader
        title="Контакты"
        wmText="Контакты"
        wmColors={WATERMARK_GRADIENTS.oilSlick}
        count={contacts?.length ?? 0}
        icon={<Users size={18} className="text-accent" />}
        action={<CTAButton size="sm" onClick={() => { setEditContact(null); setModalOpen(true); }}><Plus size={14} /> Контакт</CTAButton>}
      />

      {/* Chip filters */}
      <div className="mb-3">
        <ChipFilter options={chipOptions} selected={activeFilters} onToggle={toggle} onReset={reset} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        keyField="id"
        onRowClick={(c) => router.push(`/contacts/${c.id}`)}
        searchPlaceholder="Поиск по имени, компании..."
        emptyMessage="Нет контактов. Создай первый!"
        emptyIcon={<Users size={32} className="text-text-mute" />}
        selectable
        bulkActions={[
          {
            label: 'Удалить',
            icon: <Trash2 size={14} />,
            variant: 'danger',
            onClick: (ids) => {
              if (!confirm(`Удалить ${ids.length} контактов?`)) return;
              ids.forEach((id) => deleteContact.mutate(id));
            },
          },
          {
            label: 'CSV',
            icon: <Download size={14} />,
            onClick: (ids) => {
              const sel = (contacts ?? []).filter((c) => ids.includes(c.id));
              const csv = [
                'Имя,Фамилия,Должность,Телефон,Email',
                ...sel.map((c) => [c.first_name, c.last_name, c.position ?? '', c.phone ?? '', c.email ?? ''].join(',')),
              ].join('\n');
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `contacts-${localDateKey()}.csv`; a.click();
            },
          },
        ]}
      />

      <ContactModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditContact(null); }}
        editContact={editContact}
      />
    </>
  );
}
