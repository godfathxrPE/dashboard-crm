'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, FileText, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchAiRunRows } from '@/lib/timeline/ai-run-sources';
import { presetTitle } from '@/lib/constants/ai-presets';
import { formatCharCount, textPreview } from '@/lib/domain/transcript';
import { sourceLabel } from '@/lib/utils/transcript-export';
import { useCallMeetingIds, useTranscriptsList, type TranscriptListRow } from '@/lib/hooks/use-transcripts';
import { AiRunResultModal } from '@/components/ai/AiRunResultModal';
import { AiWorkspaceModal } from '@/components/ai/AiWorkspaceModal';
import { TranscriptViewModal } from '@/components/transcripts/TranscriptViewModal';
import type { AiRunRow } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-AI-VIS-2: сводный AI-блок карточки компании.
//
// До него AI на компании жил двумя разрозненными кусками: чип «AI» в ленте и
// отдельная модалка брифа. Здесь — всё, что AI про компанию знает: её расшифровки
// и её прогоны (оба источника — по звонкам/встречам и собственные брифы).
//
// Сбор прогонов НЕ дублируется: тот же `fetchAiRunRows`, что кормит ленту.
// ═══════════════════════════════════════════════════════

const RUN_LIMIT = 25;
/** Больше — блок сворачивается по умолчанию, чтобы не утяжелять первый экран. */
const COLLAPSE_OVER = 10;

function StatusChip({ status }: { status: string }) {
  if (status === 'error') return <span className="shrink-0 text-xs text-red">Ошибка</span>;
  if (status === 'pending' || status === 'running') {
    return <span className="shrink-0 text-xs text-accent">Идёт</span>;
  }
  return null; // «Готово» — норма, чип на каждой строке был бы шумом
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function CompanyAiDigest({ companyId }: { companyId: string }) {
  /** null — человек блок не трогал, состояние выводится из объёма. */
  const [expandOverride, setExpandOverride] = useState<boolean | null>(null);
  const [viewingTranscript, setViewingTranscript] = useState<TranscriptListRow | null>(null);
  const [viewingRun, setViewingRun] = useState<AiRunRow | null>(null);
  const [aiFor, setAiFor] = useState<TranscriptListRow | null>(null);

  // Один набор id на оба списка: и расшифровки, и прогоны по звонкам/встречам
  // компании считаются по нему — второй такой же выборки не появляется.
  const { data: childIds, isLoading: idsLoading } = useCallMeetingIds('company', companyId);

  // `?? []`, а НЕ `?? null`: null в контракте хука значит «без ограничения», и пока
  // id ещё летят, блок компании утянул бы все расшифровки организации.
  const { data: transcripts, isLoading: trLoading } = useTranscriptsList({
    restrictToEntityIds: childIds ?? [],
  });

  const runs = useQuery({
    queryKey: ['company-ai-runs', companyId, (childIds ?? []).length],
    enabled: !!childIds,
    staleTime: 60_000,
    // Собственные брифы компании есть и без единого звонка — поэтому запрос идёт
    // даже при пустом `childIds`, а не отсекается вместе с ним.
    queryFn: () => fetchAiRunRows('company', companyId, RUN_LIMIT, childIds ?? []),
  });

  const isLoading = idsLoading || trLoading || runs.isLoading;
  const transcriptRows = transcripts ?? [];
  const runRows = runs.data ?? [];
  const total = transcriptRows.length + runRows.length;

  // Свёрнут по умолчанию только когда записей много: на короткой карточке лишний
  // клик ради трёх строк — трение, а не бережное отношение к первому экрану.
  const effectiveExpanded = expandOverride ?? total <= COLLAPSE_OVER;
  const toggle = () => setExpandOverride(!effectiveExpanded);

  const openTranscriptEntity = (t: TranscriptListRow) => {
    setViewingTranscript(null);
    setAiFor(t);
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={effectiveExpanded}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles size={14} className="shrink-0 text-accent" />
        <span className="text-xs font-semibold text-text-main">AI и расшифровки</span>
        {total > 0 && (
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-text-dim">{total}</span>
        )}
        {isLoading && <Loader2 size={12} className="animate-spin text-accent" />}
        <span className="ml-auto text-text-mute">
          {effectiveExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {effectiveExpanded && (
        <div className="mt-3 space-y-4">
          {/* Расшифровки */}
          <div>
            <p className="mb-1.5 text-meta font-medium uppercase tracking-wide text-text-mute">Расшифровки</p>
            {isLoading ? (
              <p className="text-xs text-text-mute">Загружаю…</p>
            ) : transcriptRows.length === 0 ? (
              // Честное пустое состояние: не «пусто», а как получить непустое.
              <p className="text-xs text-text-mute">
                Расшифровок пока нет. Они появляются после вкладки «Аудио» в AI-анализе
                звонка или встречи этой компании.
              </p>
            ) : (
              <ul className="space-y-1">
                {transcriptRows.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setViewingTranscript(t)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover"
                    >
                      <FileText size={12} className="mt-0.5 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-dim">
                          <span className="text-text-main">{shortDate(t.createdAt)}</span>
                          <span>{t.entityType === 'call' ? 'звонок' : 'встреча'}</span>
                          <span>{formatCharCount(t.charCount)}</span>
                          <span className="text-text-mute">{sourceLabel(t.source)}</span>
                        </span>
                        {textPreview(t.content, 90) && (
                          <span className="mt-0.5 block truncate text-xs text-text-mute">
                            {textPreview(t.content, 90)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Прогоны — оба источника, включая собственные брифы компании */}
          <div>
            <p className="mb-1.5 text-meta font-medium uppercase tracking-wide text-text-mute">AI-прогоны</p>
            {isLoading ? (
              <p className="text-xs text-text-mute">Загружаю…</p>
            ) : runRows.length === 0 ? (
              <p className="text-xs text-text-mute">
                Прогонов пока нет. Бриф по компании запускается кнопкой «AI-бриф» вверху карточки.
              </p>
            ) : (
              <ul className="space-y-1">
                {runRows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void openRun(r.id, setViewingRun)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-hover"
                    >
                      <Sparkles size={12} className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1 truncate text-xs text-text-main">
                        {presetTitle(r.preset_key)}
                      </span>
                      <StatusChip status={r.status} />
                      <span className="shrink-0 text-xs text-text-mute">{shortDate(r.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <TranscriptViewModal
        row={viewingTranscript}
        onClose={() => setViewingTranscript(null)}
        onOpenEntity={openTranscriptEntity}
      />
      <AiRunResultModal run={viewingRun} onClose={() => setViewingRun(null)} />
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
    </div>
  );
}

/**
 * Точечная выборка прогона под модалку просмотра — та же, что в `open-event.ts`:
 * список тянет только метаданные, а `result` может весить килобайты.
 */
async function openRun(id: string, onLoaded: (run: AiRunRow) => void): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.from('ai_runs').select('*').eq('id', id).single();
  if (data) onLoaded(data as unknown as AiRunRow);
}
