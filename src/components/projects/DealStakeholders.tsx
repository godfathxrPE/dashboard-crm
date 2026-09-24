'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Network, Plus, X, Loader2, Star, Phone, StickyNote } from 'lucide-react';
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
import { usePipelineExpectedRoles } from '@/lib/hooks/use-pipeline-expected-roles';
import { resolveRoleSlots, type RoleSlot } from '@/lib/domain/role-slots';
import {
  STAKEHOLDER_ROLE_CONFIG,
  STAKEHOLDER_ROLE_ORDER,
  STAKEHOLDER_ROLE_EMPTY_LABEL,
} from '@/lib/constants/stakeholders';
import { Badge } from '@/components/ui/Badge';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
import { CopyButton } from '@/components/ui/CopyButton';
import { useContactBrief } from '@/lib/hooks/use-contact-brief';
import { formatPhone, telHref } from '@/lib/utils/phone';
import { Combobox, type ComboboxOption } from '@/components/shared';
import { cn } from '@/lib/utils/cn';
import { formatContactName } from '@/lib/utils/contact-name';
import { contactBelongsToCompany } from '@/lib/forms/derive-links';
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
//
// S-DEAL-ROLES-1 (W10): поверх списка легли СЛОТЫ ожидаемых ролей воронки
// (`pipeline_expected_roles`, 130). Список отвечает «кто есть», слоты — «кого НЕ
// хватает», и второе есть работа пресейла. Ожиданий у воронки нет ⇒ виджет рисует
// ровно прежний плоский список: обратная совместимость, а не заглушка.
// Состав слотов из карточки НЕ правится — это настройка организации (RLS 130:
// CUD только owner/admin), у неё будет свой экран в «Настройках».
// ═══════════════════════════════════════════════════════

/**
 * «Имя Фамилия» — тот же порядок, что в инфо-гриде карточки сделки (поле «Контакт»,
 * ProjectDetail). До правки карта печатала «Фамилия Имя», и один человек стоял на
 * экране в двух форматах в сантиметре друг от друга.
 */
const contactName = (c: { first_name: string; last_name: string } | null | undefined) =>
  c ? formatContactName(c.first_name, c.last_name) : '—';

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
  initialRole = null,
  onCancel,
  onSubmit,
}: {
  companyId: string | null;
  excludeContactIds: string[];
  isPending: boolean;
  /**
   * Роль, предвыбранная кликом по пустому слоту: человек уже сказал, КОГО ищет —
   * переспрашивать это селектом значит потерять смысл слота.
   */
  initialRole?: StakeholderRole | null;
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
  const [role, setRole] = useState<StakeholderRole | null>(initialRole);
  const [note, setNote] = useState('');

  const excluded = useMemo(() => new Set(excludeContactIds), [excludeContactIds]);

  // Контакты компании сделки — сверху: в карту почти всегда добавляют именно их.
  // Уже добавленные исключены здесь, а не только unique-нарушением на сервере.
  const options: ComboboxOption[] = useMemo(() => {
    const available = contacts.filter((c) => !excluded.has(c.id));
    const isOwn = (c: (typeof available)[number]) => contactBelongsToCompany(c, companyId);
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

/**
 * Фокус-контур карточки (спека 2.4): цветом ТЕКСТА, не акцентом — на светлой
 * подложке акцент читается хуже чернил (кобальт к --bg 5.24, до 24.09 лайм — 1.29).
 */
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-main';

/**
 * Сетка строки участника (спека 2.2): звезда / контент / роль + действия.
 *
 * ⚠️ Grid, а не прежний `flex flex-wrap` — это лечение, а не косметика: во flex-wrap
 * имя + тег роли + крестик не помещались в 356px, и крестик падал на свою строку,
 * читаясь как поломка вёрстки. В сетке третья колонка `auto` держит роль и
 * действия справа при любой длине имени — длинное имя переносится в средней.
 *
 * `focus-within` повторяет `hover`: иначе группа действий с клавиатуры невидима.
 */
const ROW_GRID =
  'group grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg px-1.5 py-2 ' +
  'transition-colors duration-100 hover:bg-surface2 focus-within:bg-surface2';

function PrimaryStar({ show }: { show: boolean }) {
  // Звезда декоративна: смысл несёт слово «основной» рядом. Колонка есть у всех
  // строк — иначе имена основного и прочих не стояли бы на одной вертикали.
  return (
    <span className="flex h-[1.1rem] items-center" aria-hidden>
      {show && <Star size={12} className="fill-current text-text-main" />}
    </span>
  );
}

function PrimaryTag() {
  return (
    <span
      className="shrink-0 rounded-sm bg-surface2 px-1 text-[0.625rem] font-semibold text-text-dim
                 group-hover:bg-surface group-focus-within:bg-surface"
      title="Основной контакт сделки — меняется в поле «Контакт»"
    >
      основной
    </span>
  );
}

/**
 * Имя, должность и ОДИН способ связи (спека 2.2): телефон есть — кнопка `tel:` с
 * номером целиком; нет телефона, есть почта — почта и «копировать»; нет ничего —
 * ничего. Никаких «добавить телефон»: в реальной базе это большинство строк, и
 * приглашения забили бы карточку.
 */
function PersonBody({
  contactId,
  name,
  isPrimary,
  contact,
  children,
}: {
  contactId: string | null;
  name: string;
  isPrimary: boolean;
  contact: Pick<StakeholderContact, 'position' | 'phone' | 'email'> | null | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {contactId ? (
          <Link
            href={`/contacts/${contactId}`}
            // ⚠️ Кегль `text-body`/`text-meta` — ВНЕ `cn`: tailwind-merge не знает
            // этих имён размера, принимает их за цвет и выкидывает рядом с `text-text-*`.
            className={`text-body ${cn(
              'min-w-0 break-words rounded-sm font-semibold leading-snug text-text-main',
              'hover:underline group-hover:underline',
              FOCUS_RING,
            )}`}
          >
            {name}
          </Link>
        ) : (
          <span className="text-body font-semibold leading-snug text-text-main">{name}</span>
        )}
        {isPrimary && <PrimaryTag />}
      </div>
      {contact?.position && (
        <div className="text-meta leading-snug text-text-dim">{contact.position}</div>
      )}
      {contact?.phone ? (
        <a
          href={telHref(contact.phone)}
          title={`Позвонить: ${name}`}
          className={cn(
            'mt-1.5 inline-flex h-[1.625rem] items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-surface px-2',
            'text-[0.71875rem] font-semibold tabular-nums text-text-main transition-colors hover:border-text-dim',
            FOCUS_RING,
          )}
        >
          <Phone size={11} className="text-text-dim" aria-hidden />
          {formatPhone(contact.phone)}
        </a>
      ) : (
        contact?.email && (
          // flex-wrap: в узкой колонке «копировать» уходит под адрес, а не сжимает
          // его до столбика по три буквы.
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-text-dim">
            <span className="min-w-0 [overflow-wrap:anywhere]">{contact.email}</span>
            <CopyButton
              value={contact.email}
              title="Скопировать почту"
              className={cn(
                'h-5 rounded-sm bg-surface2 px-1 text-[0.65625rem] text-text-dim hover:text-text-main',
                'group-hover:bg-surface group-focus-within:bg-surface',
                FOCUS_RING,
              )}
            />
          </div>
        )
      )}
      {children}
    </div>
  );
}

/** Иконка-кнопка группы действий: 26×26 из спеки 2.3. */
const ACTION_BTN = cn(
  'inline-flex size-[1.625rem] shrink-0 items-center justify-center rounded-sm border border-border bg-surface',
  'text-text-main transition-colors hover:bg-surface2',
  FOCUS_RING,
);

/**
 * Действия на наведении (спека 2.3 с поправкой владельца П5): почта · заметка ·
 * удалить. Иконки телефона НЕТ — кнопка с номером уже стоит в строке, два способа
 * позвонить рядом не нужны. Почта — только когда строка показывает телефон: без
 * телефона почта и «копировать» уже на виду, дубль в группе был бы вторым путём.
 *
 * Видимость — `opacity`, не `hidden`: кнопки остаются в табе всегда, а
 * `group-focus-within` проявляет группу, как только фокус в строке.
 */
function RowActions({
  email,
  showEmail,
  onNote,
  onRemove,
}: {
  email: string | null | undefined;
  showEmail: boolean;
  onNote?: () => void;
  onRemove?: () => void;
}) {
  const mail = showEmail && email;
  if (!mail && !onNote && !onRemove) return null;
  return (
    <div
      className="mt-1.5 flex justify-end gap-1 opacity-0 transition-opacity duration-100
                 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {mail && (
        <CopyButton value={mail} iconOnly iconSize={12} title="Скопировать почту" className={ACTION_BTN} />
      )}
      {onNote && (
        <button type="button" onClick={onNote} title="Заметка" aria-label="Заметка" className={ACTION_BTN}>
          <StickyNote size={12} aria-hidden />
        </button>
      )}
      {/* Удаление — последним и с отступом: опасное действие не стоит вплотную к
          безопасным (П4). Отдельной строкой не живёт ни при какой ширине. */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Убрать из карты стейкхолдеров"
          aria-label="Убрать из карты стейкхолдеров"
          className={cn(ACTION_BTN, (mail || onNote) && 'ml-1.5', 'hover:text-red')}
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Строка заполненного слота и строка хвоста — ОДНА разметка. Вынесена в компонент
 * не ради красоты: слоты и «Ещё в контуре» рисуют одно и то же, а две копии этой
 * разметки разошлись бы на первой же правке.
 */
function StakeholderLine({
  row,
  canManage,
  confirming,
  onConfirm,
  onCancelConfirm,
  onRemove,
  onChangeRole,
  onSaveNote,
}: {
  row: DealStakeholder & { isPrimary: boolean };
  canManage: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onRemove: () => void;
  onChangeRole: (role: StakeholderRole | null) => void;
  onSaveNote: (note: string | null) => void;
}) {
  // Редактор заметки открывает кнопка группы действий; пустую заметку в покое не
  // рисуем вовсе — «+ заметка» в каждой строке был бы шумом.
  const [editingNote, setEditingNote] = useState(false);
  const showNote = !!row.note || editingNote;

  return (
    <div className={ROW_GRID}>
      <PrimaryStar show={row.isPrimary} />

      <PersonBody
        contactId={row.contact_id}
        name={contactName(row.contact)}
        isPrimary={row.isPrimary}
        contact={row.contact}
      >
        {showNote && (
          <div className="mt-1.5 text-meta italic text-text-dim">
            Заметка:{' '}
            {canManage ? (
              <InlineEdit
                // Кнопка «Заметка» пересобирает редактор уже открытым.
                key={editingNote ? 'editing' : 'view'}
                value={row.note ?? ''}
                placeholder="текст заметки"
                startEditing={editingNote}
                className="text-meta"
                onCancel={() => setEditingNote(false)}
                onSave={async (val) => {
                  setEditingNote(false);
                  onSaveNote(val.trim().slice(0, 500) || null);
                }}
              />
            ) : (
              <span>{row.note}</span>
            )}
          </div>
        )}
      </PersonBody>

      <div className="flex flex-col items-end">
        <RoleCell
          role={row.role}
          canManage={canManage}
          emptyLabel={STAKEHOLDER_ROLE_EMPTY_LABEL}
          onChange={onChangeRole}
        />
        {/* У primary кнопки удаления нет: строка следует за полем «Контакт»
            сделки. Причина — в подсказке на «основной». */}
        {confirming ? (
          <InlineConfirm
            question="Убрать?"
            onConfirm={onRemove}
            onCancel={onCancelConfirm}
            className="mt-1.5"
          />
        ) : (
          <RowActions
            email={row.contact?.email}
            showEmail={!!row.contact?.phone}
            onNote={canManage ? () => setEditingNote(true) : undefined}
            onRemove={canManage && !row.isPrimary ? onConfirm : undefined}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Строка основного контакта, у которого ещё НЕТ записи в карте. Легальное состояние
 * 092: primary вычисляется из `projects.contact_id`, дублировать его нечем.
 *
 * S-DEAL-CONTACT-1: должность и контакты — из `useContactBrief`, того же запроса,
 * что у чипа в «Следующем шаге». Пропс `primaryContact` приходит из запроса сделки
 * урезанным до имени, и до спринта это была единственная строка карты без
 * единого поля, кроме имени. Имя из пропса — запасное, пока визитка грузится.
 */
function VirtualPrimaryLine({
  primaryContactId,
  primaryContact,
  canManage,
  onPickRole,
}: {
  primaryContactId: string | null;
  primaryContact?: { id: string; first_name: string; last_name: string } | null;
  canManage: boolean;
  onPickRole: (role: StakeholderRole | null) => void;
}) {
  const { data: brief } = useContactBrief(primaryContactId);
  const person = brief ?? primaryContact ?? null;

  return (
    <div className={ROW_GRID}>
      <PrimaryStar show />
      <PersonBody
        contactId={person?.id ?? null}
        name={person ? contactName(person) : 'Основной контакт'}
        isPrimary
        contact={brief}
      />
      <div className="flex flex-col items-end">
        <RoleCell role={null} canManage={canManage} emptyLabel="указать роль" onChange={onPickRole} />
        {/* Заметки и удаления нет: строки в карте ещё нет, писать их некуда. */}
        <RowActions email={brief?.email} showEmail={!!brief?.phone} />
      </div>
    </div>
  );
}

/**
 * Подпись пустого слота primary. Слот закрывается ТОЛЬКО заданием
 * `projects.contact_id`, поэтому и в клике, и в тексте он ведёт к полю «Контакт»
 * сделки — тем же путём, что `Placeholder` в `DealSummaryCard` (модалка проекта).
 */
const PRIMARY_SLOT_HINT = 'задаётся полем «Контакт» сделки';

/**
 * Пустой слот — носитель сообщения «этой роли в контуре нет», а не место под
 * будущую строку.
 *
 * S-DEAL-CONTACT-1 (решение владельца П1): слот обязан быть ТИШЕ строки с
 * человеком — до спринта незакрытые роли занимали две трети карточки. Поэтому:
 * одна строка (`slot.label`), пунктирной рамки вокруг блока нет — маркер «не
 * закрыто» несёт кружок с плюсом; подсказка не печатается строкой, а уходит в
 * `title` (заодно ушло обрезанное «задаётся полем „Контакт“ сде…»). Обязательность
 * — `--danger-text` на самой метке: цвет несёт состояние, не украшает.
 * Слоты НЕ удаляются: `missingRequired` кормит сигнал `single_threaded`.
 *
 * ⚠️ Два разных действия по типу слота (cold review F1). Слот РОЛИ закрывается
 * добавлением участника — клик открывает форму с предвыбранной ролью. Слот PRIMARY
 * добавлением НЕ закрывается: `resolveRoleSlots` считает его закрытым по
 * `projects.contact_id`, и после «добавить участника» он остался бы пустым — клик
 * обещал бы действие, которого не совершает. Поэтому primary ведёт в модалку
 * проекта (там же правится «Контакт» из сводки — третьего пути не заводим), а если
 * дёрнуть её нельзя (нет прав, нет колбэка) — слот НЕ кликабелен, но подсказка
 * в `title` остаётся: она объясняет, где это поле.
 */
function EmptySlotLine({
  slot,
  canManage,
  onAdd,
  onEditContact,
}: {
  slot: RoleSlot;
  canManage: boolean;
  onAdd: () => void;
  onEditContact?: () => void;
}) {
  const isPrimary = slot.kind === 'primary';
  const hint = isPrimary ? PRIMARY_SLOT_HINT : slot.hint;

  const body = (
    <>
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed
                   border-border2 text-text-mute"
        aria-hidden
      >
        <Plus size={10} />
      </span>
      <span
        // Метка — `text-meta`, мельче имени участника: слот тише строки с
        // человеком (П1). Кегль вне `cn` — см. ⚠️ у ссылки имени в `PersonBody`.
        className={`text-meta ${cn('min-w-0 flex-1', slot.isRequired ? 'text-danger-text' : 'text-text-dim')}`}
      >
        {slot.label}
      </span>
      {/* Тег роли — тот же примитив, что у заполненных строк. У слота primary
          роли нет: его закрывает поле «Контакт», а не роль. */}
      {slot.kind === 'role' && slot.role && <RoleBadge role={slot.role} />}
    </>
  );

  const shell = 'flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left';

  const action = isPrimary ? onEditContact : onAdd;

  // Без прав слот всё равно ВИДЕН: «кого не хватает» — сведение о сделке, а не
  // действие. Кликабельным он становится только у тех, кто может его закрыть.
  if (!canManage || !action) {
    return (
      <div className={shell} title={hint ?? undefined}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={action}
      title={hint ?? undefined}
      className={cn(shell, 'transition-colors hover:bg-surface2', FOCUS_RING)}
    >
      {body}
    </button>
  );
}

export function DealStakeholders({
  projectId,
  primaryContactId,
  primaryContact,
  companyId,
  pipelineId,
  onEditContact,
}: {
  projectId: string;
  primaryContactId: string | null;
  /** `project.contact` — основной контакт сделки; нужен для виртуальной строки. */
  primaryContact?: { id: string; first_name: string; last_name: string } | null;
  companyId: string | null;
  /**
   * Воронка сделки — ключ к ожидаемым ролям (`pipeline_expected_roles`, 130).
   * null у internal-проектов и пока проект не загрузился: тогда ожиданий нет и
   * карта рисуется прежним плоским списком.
   */
  pipelineId?: string | null;
  /**
   * Открыть редактирование СДЕЛКИ — тот же `onEdit`, что «+ Указать» у поля
   * «Контакт» в сводке (`DealSummaryCard`). Пустой слот primary закрывается только
   * `projects.contact_id`, и вести его больше некуда. Не передан — слот
   * не кликабелен (см. `EmptySlotLine`).
   */
  onEditContact?: () => void;
}) {
  const { data: stakeholders = [], isLoading, isError, error } = useDealStakeholders(projectId);
  const { data: expectedRoles = [] } = usePipelineExpectedRoles(pipelineId);
  const { data: orgRole } = useOrgRole();
  const canManage = !!orgRole && orgRole !== 'viewer';

  const addStakeholder = useAddStakeholder(projectId);
  const updateStakeholder = useUpdateStakeholder(projectId);
  const removeStakeholder = useRemoveStakeholder(projectId);

  const [adding, setAdding] = useState(false);
  /** Роль, с которой открыта форма: клик по пустому слоту предвыбирает её. */
  const [addingRole, setAddingRole] = useState<StakeholderRole | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const rows = useMemo(
    () => sortStakeholders(stakeholders, primaryContactId),
    [stakeholders, primaryContactId],
  );

  // Слоты ролей воронки. Ожиданий нет ⇒ `hasExpectations: false` и прежний плоский
  // список — обратная совместимость, а не заглушка (см. шапку role-slots.ts).
  const { slots, filledCount, totalCount, hasExpectations, rest } = useMemo(
    () => resolveRoleSlots(expectedRoles, rows, primaryContactId),
    [expectedRoles, rows, primaryContactId],
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

  function openAdd(role: StakeholderRole | null) {
    setErrorText(null);
    setAddingRole(role);
    setAdding(true);
  }

  function closeAdd() {
    setAdding(false);
    setAddingRole(null);
    setErrorText(null);
  }

  function changeRole(row: DealStakeholder, role: StakeholderRole | null) {
    setErrorText(null);
    updateStakeholder.mutate({ id: row.id, role }, { onError: handleError });
  }

  /** Роль основному контакту = завести ему строку в карте (её ещё нет). */
  function assignPrimaryRole(role: StakeholderRole | null) {
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
  }

  function line(row: DealStakeholder & { isPrimary: boolean }) {
    return (
      <StakeholderLine
        row={row}
        canManage={canManage}
        confirming={confirmingId === row.id}
        onConfirm={() => setConfirmingId(row.id)}
        onCancelConfirm={() => setConfirmingId(null)}
        onRemove={() => {
          setErrorText(null);
          setConfirmingId(null);
          removeStakeholder.mutate(row.id, { onError: handleError });
        }}
        onChangeRole={(role) => changeRole(row, role)}
        onSaveNote={(note) => {
          setErrorText(null);
          updateStakeholder.mutate({ id: row.id, note }, { onError: handleError });
        }}
      />
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-body text-text-dim">
          <Network size={11} /> Стейкхолдеры
          {/* Счётчик считает СЛОТЫ, не головы: один человек закрывает и «основной
              контакт», и свою роль. Без ожиданий счётчика нет — считать нечего. */}
          {hasExpectations && (
            <span className="text-meta text-text-mute">
              · {filledCount} из {totalCount} ролей
            </span>
          )}
        </div>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => openAdd(null)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta text-text-dim
                       transition-colors hover:bg-surface2 hover:text-text-main"
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
      ) : hasExpectations ? (
        // Разделители вместо промежутков (спека 2.1): строки с контактами разной
        // высоты, и без линии соседние люди слипались в один блок.
        <div className="divide-y divide-border2">
          {slots.map((slot) => {
            const key = slot.kind === 'primary' ? 'slot-primary' : `slot-${slot.role}`;
            if (!slot.isFilled) {
              return (
                <EmptySlotLine
                  key={key}
                  slot={slot}
                  canManage={canManage}
                  onAdd={() => openAdd(slot.role)}
                  onEditContact={onEditContact}
                />
              );
            }
            // Слот primary может быть закрыт контактом БЕЗ строки в карте.
            if (!slot.filled) {
              return (
                <VirtualPrimaryLine
                  key={key}
                  primaryContactId={primaryContactId}
                  primaryContact={primaryContact}
                  canManage={canManage}
                  onPickRole={assignPrimaryRole}
                />
              );
            }
            return <div key={key}>{line(slot.filled)}</div>;
          })}

          {/* Люди без роли и сверх слотов не теряются: контур — не весь список. */}
          {rest.length > 0 && (
            <div className="pt-1.5">
              <div className="px-1 pb-0.5 text-meta text-text-mute">Ещё в контуре</div>
              <div className="divide-y divide-border2">
                {rest.map((row) => (
                  <div key={row.id}>{line(row)}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : isEmpty && !adding ? (
        <p className="py-2 text-xs text-text-mute">
          Участники не указаны
          {canManage && ' — добавь тех, кто решает, платит и подписывает'}
        </p>
      ) : (
        <div className="divide-y divide-border2">
          {/* Виртуальная строка основного контакта — записи в карте ещё нет */}
          {primaryMissing && (
            <VirtualPrimaryLine
              primaryContactId={primaryContactId}
              primaryContact={primaryContact}
              canManage={canManage}
              onPickRole={assignPrimaryRole}
            />
          )}

          {rows.map((row) => (
            <div key={row.id}>{line(row)}</div>
          ))}
        </div>
      )}

      {canManage && adding && (
        <StakeholderAddForm
          // Клик по другому пустому слоту меняет предвыбор — форма обязана
          // пересобраться: initialRole садится в useState только при монтировании.
          key={addingRole ?? 'any'}
          companyId={companyId}
          excludeContactIds={excludeContactIds}
          isPending={addStakeholder.isPending}
          initialRole={addingRole}
          onCancel={closeAdd}
          onSubmit={(input) => {
            setErrorText(null);
            addStakeholder.mutate(input, {
              onSuccess: closeAdd,
              onError: handleError,
            });
          }}
        />
      )}

      {errorText && <p className="mt-1.5 text-xs text-red">{errorText}</p>}
    </div>
  );
}
