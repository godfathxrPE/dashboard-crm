'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Loader2, Building2, Trash2, Download, Phone } from 'lucide-react';
import { useUiStore } from '@/lib/stores/ui-store';
import { RECONNECT_THRESHOLD_DAYS } from '@/lib/constants/reconnect';
import { CTAButton } from '@/components/ui/CTAButton';
import { PageHeader } from '@/components/layout/PageHeader';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import { useContacts, useUpdateContact, useDeleteContact, type Contact } from '@/lib/hooks/use-contacts';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useLastTouchMap, daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EditableCell } from '@/components/shared/EditableCell';
import { formatPhone } from '@/lib/utils/phone';
import { canonicalPosition } from '@/lib/utils/position';
import { ChipFilter, type ChipOption } from '@/components/ui/ChipFilter';
import { SavedViewChips } from '@/components/ui/SavedViewChips';
import { useChipFilter } from '@/lib/hooks/use-chip-filter';
import { ContactModal } from './ContactModal';
import { ContactPeekContent } from './ContactPeekContent';
import { localDateKey } from '@/lib/utils/date-helpers';

type ContactRow = Contact & { last_touch: string | null };

const CHIP_FILTERS: Record<string, (c: ContactRow) => boolean> = {
  has_email: (c) => !!c.email,
  has_phone: (c) => !!c.phone,
  // Порог как в «Сегодня → Остывают» (lib/constants/reconnect)
  cooling: (c) => !c.last_touch || daysSince(c.last_touch) > RECONNECT_THRESHOLD_DAYS,
};

export function ContactsTable() {
  const router = useRouter();
  const openModal = useUiStore((s) => s.openModal);
  const { data: contacts, isLoading, error } = useContacts();
  const lastTouch = useLastTouchMap();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { data: role } = useOrgRole();
  const canCreate = role != null && role !== 'viewer'; // T2: viewer не создаёт (RLS 42501)

  // Обогащаем строки датой последнего касания (для колонки + сортировки)
  const rows = useMemo<ContactRow[]>(
    () => (contacts ?? []).map((c) => ({ ...c, last_touch: lastTouch.get(c.id)?.date ?? null })),
    [contacts, lastTouch],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  // Dynamic position chips (top 5)
  const positionFilters = useMemo(() => {
    const freq: Record<string, number> = {};
    (contacts ?? []).forEach((c) => {
      if (c.position) { const cp = canonicalPosition(c.position); freq[cp] = (freq[cp] || 0) + 1; }
    });
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce<Record<string, (c: ContactRow) => boolean>>((acc, [pos]) => {
        acc[`pos_${pos}`] = (c) => c.position != null && canonicalPosition(c.position) === pos;
        return acc;
      }, {});
  }, [contacts]);

  const allFilters = useMemo(() => ({ ...CHIP_FILTERS, ...positionFilters }), [positionFilters]);
  const { filtered, activeFilters, counts, toggle, reset } = useChipFilter(rows, allFilters);

  const chipOptions: ChipOption[] = useMemo(() => [
    { label: 'Есть email', value: 'has_email', count: counts.has_email },
    { label: 'Есть телефон', value: 'has_phone', count: counts.has_phone },
    { label: 'Остывают', value: 'cooling', count: counts.cooling },
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

  const columns: Column<ContactRow>[] = [
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
                className="inline-flex items-center gap-0.5 rounded bg-surface2 border border-border px-1.5 py-0.5 text-xs text-text-dim">
                <Building2 size={9} className="shrink-0" />
                <span className="inline-block max-w-[140px] truncate align-bottom" title={cc.company?.name ?? undefined}>
                  {cc.company?.name ?? 'N/A'}
                </span>
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
          format={formatPhone}
          className="text-text-dim whitespace-nowrap tabular-nums"
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
      key: 'last_touch',
      label: 'Касание',
      sortable: true,
      width: '110px',
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
      label: 'Добавлен',
      sortable: true,
      width: '120px',
      render: (c) => (
        <span className="text-xs text-text-dim">
          {new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'row_actions',
      label: '',
      width: '44px',
      render: (c) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openModal('call', undefined, {
              contactId: c.id,
              companyId: (c.companies ?? [])[0]?.company_id,
            });
          }}
          title="Запланировать звонок"
          aria-label="Запланировать звонок"
          className="rounded p-1.5 text-text-mute opacity-0 transition-opacity
                     group-hover:opacity-100 hover:bg-accent-l hover:text-accent"
        >
          <Phone size={13} />
        </button>
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
        action={canCreate ? <CTAButton size="sm" onClick={() => { setEditContact(null); setModalOpen(true); }}><Plus size={14} /> Контакт</CTAButton> : undefined}
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
        onRowClick={(c) => router.push(`/contacts/${c.id}`)}
        peek={(c) => ({
          title: `${c.first_name} ${c.last_name}`,
          href: `/contacts/${c.id}`,
          content: <ContactPeekContent contact={c} />,
        })}
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
