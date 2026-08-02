'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Network, Plus, X, Loader2, Star } from 'lucide-react';
import {
  useDealStakeholders,
  useAddStakeholder,
  useUpdateStakeholder,
  useRemoveStakeholder,
  sortStakeholders,
  parseStakeholderError,
  type DealStakeholder,
  type StakeholderContact,
} from '@/lib/hooks/use-deal-stakeholders';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import {
  STAKEHOLDER_ROLE_CONFIG,
  STAKEHOLDER_ROLE_ORDER,
  STAKEHOLDER_ROLE_EMPTY_LABEL,
} from '@/lib/constants/stakeholders';
import { Badge } from '@/components/ui/Badge';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { Combobox, type ComboboxOption } from '@/components/shared';
import { cn } from '@/lib/utils/cn';
import type { StakeholderRole } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-R2-D3: карта стейкхолдеров сделки — full-width секция сразу под info-grid
// карточки проекта (ProjectDetail). Рендерится для всех типов проектов: у внедрения
// участники со стороны клиента тоже есть.
//
// Основной контакт (projects.contact_id) НЕ хранится флагом в deal_stakeholders —
// primary вычисляется сравнением contact_id (sortStakeholders). Отсюда два следствия
// в UI: строку primary нельзя удалить (её меняет поле «Контакт» сделки — это
// показано подписью, а не молчаливым запретом), и primary может вообще не иметь
// строки в таблице — тогда рисуется виртуальная строка с действием «указать роль».
//
// Права — role !== 'viewer' (зеркало RLS 092: write у owner/admin/manager).
// window.confirm запрещён в проекте (блокирует браузерные смоки) — подтверждение
// удаления инлайновое.
// ═══════════════════════════════════════════════════════

/**
 * «Имя Фамилия» — тот же порядок, что в инфо-гриде карточки сделки (поле «Контакт»,
 * ProjectDetail). До правки карта печатала «Фамилия Имя», и один человек стоял на
 * экране в двух форматах в сантиметре друг от друга.
 */
const contactName = (c: { first_name: string; last_name: string } | null | undefined) =>
  c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || '—' : '—';

/** Ключ сортировки списка выбора — по фамилии: в пикере ищут именно так. */
const contactSortKey = (c: { first_name: string; last_name: string }) =>
  [c.last_name, c.first_name].filter(Boolean).join(' ');

/**
 * Ширина селекта в режиме правки. В покое роль — бейдж (см. RoleCell), поэтому
 * постоянной рамки в строке нет и выравнивать между строками нечего.
 */
const ROW_SELECT_WIDTH = 'min-w-[11rem]';

/** Селект роли: пустое значение = «роль не указана» (в БД NULL, это легальное состояние). */
function RoleSelect({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  autoFocus,
  onBlur,
}: {
  value: StakeholderRole | null;
  onChange: (role: StakeholderRole | null) => void;
  disabled?: boolean;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  return (
    <select
      // Нативный select без подписи скрин-ридер читает как «combobox» без имени —
      // self-check проекта требует label у полей формы. Видимой подписи в строке нет
      // по композиции, поэтому имя даётся через aria-label.
      aria-label="Роль в сделке"
      value={value ?? ''}
      disabled={disabled}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onChange={(e) => onChange((e.target.value || null) as StakeholderRole | null)}
      className={cn(
        'rounded border border-input bg-surface py-0.5 pl-1.5 pr-5 text-meta text-text-dim',
        'focus:border-accent focus:outline-none disabled:opacity-50',
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {STAKEHOLDER_ROLE_ORDER.map((r) => (
        <option key={r} value={r}>
          {STAKEHOLDER_ROLE_CONFIG[r].full}
        </option>
      ))}
    </select>
  );
}

function RoleBadge({ role }: { role: StakeholderRole | null }) {
  if (!role) {
    return <span className="text-meta text-text-mute">{STAKEHOLDER_ROLE_EMPTY_LABEL}</span>;
  }
  const cfg = STAKEHOLDER_ROLE_CONFIG[role];
  // Роль вне словаря (ручной SQL) — показываем сырое значение, а не пустоту.
  if (!cfg) return <Badge size="sm">{role}</Badge>;
  return (
    <Badge size="sm" color={cfg.color} title={cfg.full}>
      {cfg.label}
    </Badge>
  );
}

/**
 * Роль в строке: в покое — бейдж, по клику — селект. Тот же приём, что у InlineEdit:
 * постоянная рамка контрола в каждой строке — самый тяжёлый элемент строки, из-за неё
 * карта читалась как форма, а не как данные.
 */
function RoleCell({
  role,
  canManage,
  emptyLabel,
  onChange,
}: {
  role: StakeholderRole | null;
  canManage: boolean;
  emptyLabel: string;
  onChange: (role: StakeholderRole | null) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!canManage) return <RoleBadge role={role} />;

  if (editing) {
    return (
      <RoleSelect
        value={role}
        autoFocus
        className={ROW_SELECT_WIDTH}
        placeholder={emptyLabel}
        onBlur={() => setEditing(false)}
        onChange={(r) => {
          setEditing(false);
          onChange(r);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="shrink-0 rounded decoration-dashed underline-offset-2 hover:underline"
    >
      {role ? <RoleBadge role={role} /> : <span className="text-meta text-text-mute">{emptyLabel}</span>}
    </button>
  );
}

/**
 * Форма добавления. Вынесена в отдельный компонент, чтобы `useContacts()` (полный
 * список контактов организации) грузился только при открытии формы, а не на каждом
 * рендере карточки сделки.
 */
function StakeholderAddForm({
  companyId,
  excludeContactIds,
  isPending,
  onCancel,
  onSubmit,
}: {
  companyId: string | null;
  excludeContactIds: string[];
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    contact_id: string;
    role: StakeholderRole | null;
    note: string | null;
    contact: StakeholderContact | null;
  }) => void;
}) {
  const { data: contacts = [], isLoading } = useContacts();
  const [contactId, setContactId] = useState<string | null>(null);
  const [role, setRole] = useState<StakeholderRole | null>(null);
  const [note, setNote] = useState('');

  const excluded = useMemo(() => new Set(excludeContactIds), [excludeContactIds]);

  // Контакты компании сделки — сверху: в карту почти всегда добавляют именно их.
  // Уже добавленные исключены здесь, а не только unique-нарушением на сервере.
  const options: ComboboxOption[] = useMemo(() => {
    const available = contacts.filter((c) => !excluded.has(c.id));
    const isOwn = (c: (typeof available)[number]) =>
      !!companyId && !!c.companies?.some((cc) => cc.company_id === companyId);
    const rank = (c: (typeof available)[number]) => (isOwn(c) ? 0 : 1);
    return [...available]
      .sort((a, b) => rank(a) - rank(b) || contactSortKey(a).localeCompare(contactSortKey(b), 'ru'))
      .map((c) => ({
        value: c.id,
        label: contactName(c),
        sub: [c.position, isOwn(c) ? 'компания сделки' : null].filter(Boolean).join(' · ') || undefined,
      }));
  }, [contacts, excluded, companyId]);

  const selected = contacts.find((c) => c.id === contactId);

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-2">
      <div className="min-w-[220px] flex-1">
        <Combobox
          options={options}
          value={contactId}
          onChange={setContactId}
          placeholder={isLoading ? 'Загрузка контактов…' : 'Выбрать контакт'}
          disabled={isLoading}
        />
      </div>
      <RoleSelect value={role} onChange={setRole} placeholder="роль не указана" />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Заметка (необязательно)"
        className="min-w-[160px] flex-1 rounded-lg border border-input bg-surface px-2 py-2 text-sm
                   text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={() =>
          contactId &&
          onSubmit({
            contact_id: contactId,
            role,
            note: note.trim() || null,
            contact: selected
              ? {
                  id: selected.id,
                  first_name: selected.first_name,
                  last_name: selected.last_name,
                  position: selected.position,
                  email: selected.email,
                  phone: selected.phone,
                }
              : null,
          })
        }
        disabled={!contactId || isPending}
        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity
                   hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? <Loader2 size={13} className="animate-spin" /> : 'Добавить'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-border px-3 py-2 text-xs text-text-dim hover:bg-surface2"
      >
        Отмена
      </button>
    </div>
  );
}

export function DealStakeholders({
  projectId,
  primaryContactId,
  primaryContact,
  companyId,
}: {
  projectId: string;
  primaryContactId: string | null;
  /** `project.contact` — основной контакт сделки; нужен для виртуальной строки. */
  primaryContact?: { id: string; first_name: string; last_name: string } | null;
  companyId: string | null;
}) {
  const { data: stakeholders = [], isLoading, isError, error } = useDealStakeholders(projectId);
  const { data: orgRole } = useOrgRole();
  const canManage = !!orgRole && orgRole !== 'viewer';

  const addStakeholder = useAddStakeholder(projectId);
  const updateStakeholder = useUpdateStakeholder(projectId);
  const removeStakeholder = useRemoveStakeholder(projectId);

  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const rows = useMemo(
    () => sortStakeholders(stakeholders, primaryContactId),
    [stakeholders, primaryContactId],
  );

  // Основной контакт сделки, у которого ещё нет строки в карте: показываем его
  // виртуальной строкой — иначе «главного» человека в карте участников не видно вовсе.
  const primaryMissing =
    !!primaryContactId && !stakeholders.some((s) => s.contact_id === primaryContactId);

  const excludeContactIds = stakeholders.map((s) => s.contact_id);
  const isEmpty = rows.length === 0 && !primaryMissing;

  function handleError(err: unknown) {
    setErrorText(parseStakeholderError(err));
  }

  function changeRole(row: DealStakeholder, role: StakeholderRole | null) {
    setErrorText(null);
    updateStakeholder.mutate({ id: row.id, role }, { onError: handleError });
  }

  return (
    <div className="mb-6 rounded-lg border border-border/50 bg-surface px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-body text-text-dim">
          <Network size={11} /> Стейкхолдеры
        </div>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => {
              setErrorText(null);
              setAdding(true);
            }}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta text-text-dim
                       transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Plus size={12} /> Добавить
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-accent" />
        </div>
      ) : isError ? (
        <p className="py-2 text-xs text-red">
          Не удалось загрузить карту участников: {parseStakeholderError(error)}
        </p>
      ) : isEmpty && !adding ? (
        <p className="py-2 text-xs text-text-mute">
          Участники не указаны
          {canManage && ' — добавь тех, кто решает, платит и подписывает'}
        </p>
      ) : (
        <div className="space-y-1">
          {/* Виртуальная строка основного контакта — записи в карте ещё нет */}
          {primaryMissing && (
            <div className="flex flex-wrap items-center gap-2 rounded px-1 py-1 hover:bg-surface2">
              <Star size={12} className="shrink-0 text-accent" aria-hidden />
              {primaryContact ? (
                <Link
                  href={`/contacts/${primaryContact.id}`}
                  className="truncate text-sm text-text-main hover:text-accent hover:underline"
                >
                  {contactName(primaryContact)}
                </Link>
              ) : (
                <span className="truncate text-sm text-text-main">Основной контакт</span>
              )}
              <span
                className="shrink-0 text-meta text-text-mute"
                title="Основной контакт сделки — меняется в поле «Контакт»"
              >
                основной
              </span>
              <RoleCell
                role={null}
                canManage={canManage}
                emptyLabel="указать роль"
                onChange={(role) => {
                  if (!role || !primaryContactId) return;
                  setErrorText(null);
                  addStakeholder.mutate(
                    {
                      contact_id: primaryContactId,
                      role,
                      contact: primaryContact
                        ? { ...primaryContact, position: null, email: null, phone: null }
                        : null,
                    },
                    { onError: handleError },
                  );
                }}
              />
            </div>
          )}

          {rows.map((row) => (
            <div
              key={row.id}
              className="group flex flex-wrap items-center gap-2 rounded px-1 py-1 hover:bg-surface2"
            >
              {/* Звезда декоративна: смысл несёт слово «основной» рядом, и на нём же
                  висит подсказка «меняется в поле „Контакт“» — разовое пояснение, ему
                  не место постоянной строкой в каждой записи. */}
              {row.isPrimary && <Star size={12} className="shrink-0 text-accent" aria-hidden />}
              <Link
                href={`/contacts/${row.contact_id}`}
                className="truncate text-sm text-text-main hover:text-accent hover:underline"
              >
                {contactName(row.contact)}
              </Link>
              {row.isPrimary && (
                <span
                  className="shrink-0 text-meta text-text-mute"
                  title="Основной контакт сделки — меняется в поле «Контакт»"
                >
                  основной
                </span>
              )}
              {row.contact?.position && (
                <span className="truncate text-meta text-text-mute">{row.contact.position}</span>
              )}

              <RoleCell
                role={row.role}
                canManage={canManage}
                emptyLabel={STAKEHOLDER_ROLE_EMPTY_LABEL}
                onChange={(role) => changeRole(row, role)}
              />

              {/* Пустая заметка проявляется на наведении: «+ заметка» в каждой строке
                  дублируется столько раз, сколько участников, и забивает строку шумом. */}
              <div
                className={cn(
                  'min-w-[120px] flex-1 text-meta transition-opacity',
                  canManage && !row.note && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                )}
              >
                {canManage ? (
                  <InlineEdit
                    value={row.note ?? ''}
                    placeholder="+ заметка"
                    className="text-meta"
                    onSave={async (val) => {
                      setErrorText(null);
                      updateStakeholder.mutate(
                        { id: row.id, note: val.trim().slice(0, 500) || null },
                        { onError: handleError },
                      );
                    }}
                  />
                ) : (
                  row.note && <span className="text-text-mute">{row.note}</span>
                )}
              </div>

              {/* У primary кнопки удаления нет: строка следует за полем «Контакт»
                  сделки. Причина — в подсказке на «основной», а не постоянной фразой
                  в конце строки: она повторялась бы у каждой сделки и весила больше,
                  чем сами данные. */}
              {canManage &&
                !row.isPrimary &&
                (confirmingId === row.id ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-meta">
                    <span className="text-text-dim">Удалить?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorText(null);
                        setConfirmingId(null);
                        removeStakeholder.mutate(row.id, { onError: handleError });
                      }}
                      className="rounded px-1 font-medium text-red hover:underline"
                    >
                      Да
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded px-1 text-text-dim hover:underline"
                    >
                      Отмена
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(row.id)}
                    aria-label="Убрать из карты стейкхолдеров"
                    className="shrink-0 rounded p-1 text-text-mute transition-colors hover:text-red"
                  >
                    <X size={13} />
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      {canManage && adding && (
        <StakeholderAddForm
          companyId={companyId}
          excludeContactIds={excludeContactIds}
          isPending={addStakeholder.isPending}
          onCancel={() => {
            setAdding(false);
            setErrorText(null);
          }}
          onSubmit={(input) => {
            setErrorText(null);
            addStakeholder.mutate(input, {
              onSuccess: () => setAdding(false),
              onError: handleError,
            });
          }}
        />
      )}

      {errorText && <p className="mt-1.5 text-xs text-red">{errorText}</p>}
    </div>
  );
}
