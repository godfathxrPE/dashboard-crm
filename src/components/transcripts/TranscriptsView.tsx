'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Search, Loader2, Download, Phone, CalendarDays, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { EmptyState } from '@/components/ui/EmptyState';
import { AiWorkspaceModal } from '@/components/ai/AiWorkspaceModal';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useCallMeetingIds, useTranscriptsList, type TranscriptListRow } from '@/lib/hooks/use-transcripts';
import { formatCharCount, textPreview } from '@/lib/domain/transcript';
import { downloadTranscript, sourceLabel } from '@/lib/utils/transcript-export';
import { TranscriptViewModal } from './TranscriptViewModal';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-AI-VIS-2: раздел «Транскрипты».
//
// До него расшифровку можно было найти, только зная, в каком звонке она лежит.
// Раздел — витрина поверх существующей таблицы `transcripts`: новой сущности в БД
// не появляется.
// ═══════════════════════════════════════════════════════

const SEARCH_DEBOUNCE_MS = 300;

type EntityFilter = 'all' | 'call' | 'meeting';
type SourceFilter = 'all' | 'audio' | 'paste' | 'file';

const ENTITY_TABS: { value: EntityFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'call', label: 'Звонки' },
  { value: 'meeting', label: 'Встречи' },
];

const SOURCE_TABS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Любой способ' },
  { value: 'audio', label: 'Аудио' },
  { value: 'paste', label: 'Вставлено' },
  { value: 'file', label: 'Файл' },
];

/** Значение, отстающее от источника: гасит запрос на каждую набранную букву. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function SegmentTabs<T extends string>({
  tabs, value, onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          aria-pressed={value === t.value}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === t.value
              ? 'bg-accent-l text-accent'
              : 'text-text-dim hover:bg-surface-hover hover:text-text-main',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TranscriptsView() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, SEARCH_DEBOUNCE_MS);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [viewing, setViewing] = useState<TranscriptListRow | null>(null);
  const [aiFor, setAiFor] = useState<TranscriptListRow | null>(null);

  const { data: companies } = useCompanies();

  // Фильтр по компании — СЕРВЕРНЫЙ: id её звонков и встреч сужают выборку самих
  // расшифровок. Клиентский фильтр по загруженной странице отфильтровал бы только
  // то, что и так на экране, — ровно то, чего поиск не должен делать.
  const { data: companyEntityIds, isLoading: idsLoading } = useCallMeetingIds('company', companyId);

  const { data: rows, isLoading, error } = useTranscriptsList({
    search,
    entityType: entityFilter === 'all' ? 'all' : entityFilter,
    source: sourceFilter,
    // `?? []`, а не `?? null`: null значит «без ограничения», и пока id компании
    // ещё летят, список успел бы показать чужие расшифровки.
    restrictToEntityIds: companyId ? (companyEntityIds ?? []) : null,
  });

  const companyOptions: ComboboxOption[] = useMemo(
    () => (companies ?? []).map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );

  const columns: Column<TranscriptListRow>[] = useMemo(() => [
    {
      key: 'createdAt',
      label: 'Дата',
      sortable: true,
      width: '120px',
      render: (t) => (
        <span className="whitespace-nowrap text-xs text-text-dim">
          {new Date(t.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'entityType',
      label: 'Источник',
      sortable: true,
      width: '110px',
      render: (t) => (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-text-dim">
          {t.entityType === 'call'
            ? <Phone size={11} className="shrink-0 text-accent" />
            : <CalendarDays size={11} className="shrink-0 text-accent" />}
          {t.entityType === 'call' ? 'Звонок' : 'Встреча'}
        </span>
      ),
    },
    {
      key: 'company',
      label: 'Компания · контакт',
      sortable: true,
      width: '220px',
      render: (t) => {
        const subject = t.company ?? t.subject;
        if (!subject && !t.contact) {
          // Звонок мог быть удалён — расшифровка живёт своей строкой и остаётся.
          return <span className="text-xs text-text-mute">—</span>;
        }
        return (
          <div className="min-w-0">
            {subject && <p className="truncate text-xs font-medium text-text-main" title={subject}>{subject}</p>}
            {t.contact && <p className="truncate text-xs text-text-mute" title={t.contact}>{t.contact}</p>}
          </div>
        );
      },
      searchValue: (t) => `${t.company ?? ''} ${t.subject ?? ''} ${t.contact ?? ''}`,
    },
    {
      key: 'charCount',
      label: 'Объём',
      sortable: true,
      width: '130px',
      render: (t) => <span className="whitespace-nowrap text-xs text-text-dim">{formatCharCount(t.charCount)}</span>,
    },
    {
      key: 'source',
      label: 'Способ',
      sortable: true,
      width: '130px',
      render: (t) => <span className="whitespace-nowrap text-xs text-text-mute">{sourceLabel(t.source)}</span>,
    },
    {
      key: 'content',
      label: 'Начало текста',
      render: (t) => {
        const preview = textPreview(t.content);
        if (!preview) return <span className="text-xs text-text-mute">—</span>;
        return <span className="block truncate text-xs text-text-dim" title={preview}>{preview}</span>;
      },
      searchValue: (t) => t.content ?? '',
    },
    {
      key: 'actions',
      label: '',
      width: '44px',
      render: (t) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Скачиваем то, что уже на руках: список тянет `content` целиком
            // (долг записан у LIST_LIMIT). Когда список перейдёт на превью, эта
            // кнопка обязана будет сначала догрузить текст точечно.
            downloadTranscript(
              {
                createdAt: t.createdAt,
                entityType: t.entityType,
                company: t.company,
                contact: t.contact,
                subject: t.subject,
                source: t.source,
                charCount: t.charCount,
              },
              t.content,
            );
          }}
          aria-label="Скачать расшифровку"
          title="Скачать .md"
          className="rounded p-1 text-text-mute hover:bg-surface-hover hover:text-accent"
        >
          <Download size={13} />
        </button>
      ),
    },
  ], []);

  const busy = isLoading || (!!companyId && idsLoading);
  const hasFilters = search.trim() !== '' || entityFilter !== 'all' || sourceFilter !== 'all' || companyId !== null;

  return (
    <>
      <PageHeader
        title="Транскрипты"
        wmText="Транскрипты"
        wmColors={WATERMARK_GRADIENTS.frost}
        count={rows?.length ?? 0}
        icon={<FileText size={18} className="text-accent" />}
      />

      {/* Панель фильтров. Поиск, источник, способ и компания комбинируются по «И». */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по тексту расшифровки…"
            className="w-full rounded-lg border border-input bg-surface py-2 pl-9 pr-8 text-sm text-text-main
                       placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-mute hover:text-text-main"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <SegmentTabs tabs={ENTITY_TABS} value={entityFilter} onChange={setEntityFilter} />
        <SegmentTabs tabs={SOURCE_TABS} value={sourceFilter} onChange={setSourceFilter} />

        <div className="min-w-[200px]">
          <Combobox
            options={companyOptions}
            value={companyId}
            onChange={setCompanyId}
            placeholder="Любая компания"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
          <p className="text-sm text-red">Ошибка загрузки расшифровок</p>
          <p className="mt-1 text-xs text-text-mute">{(error as Error).message}</p>
        </div>
      ) : busy ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      ) : (rows?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6">
          <EmptyState
            icon={<FileText size={24} />}
            title={hasFilters ? 'Ничего не нашлось' : 'Расшифровок пока нет'}
            description={
              hasFilters
                ? 'Попробуйте другое слово или снимите фильтры — поиск идёт по всему тексту разговора.'
                : 'Расшифровка появляется здесь после вкладки «Аудио» в AI-анализе звонка или встречи.'
            }
            action={hasFilters
              ? {
                  label: 'Сбросить фильтры',
                  onClick: () => {
                    setSearchInput('');
                    setEntityFilter('all');
                    setSourceFilter('all');
                    setCompanyId(null);
                  },
                }
              : { label: 'К звонкам', href: '/calls' }}
          />
        </div>
      ) : (
        <DataTable
          data={rows ?? []}
          columns={columns}
          keyField="id"
          hideSearch
          pageSize={25}
          onRowClick={(t) => setViewing(t)}
          emptyMessage="Расшифровок пока нет"
          peekSuppressed={viewing !== null || aiFor !== null}
        />
      )}

      <TranscriptViewModal
        row={viewing}
        onClose={() => setViewing(null)}
        onOpenEntity={(t) => {
          setViewing(null);
          setAiFor(t);
        }}
      />

      {aiFor && (
        <AiWorkspaceModal
          isOpen={!!aiFor}
          onClose={() => setAiFor(null)}
          entityType={aiFor.entityType}
          entityId={aiFor.entityId}
          projectId={aiFor.projectId}
          companyId={aiFor.companyId}
          contactId={aiFor.contactId}
        />
      )}
    </>
  );
}
