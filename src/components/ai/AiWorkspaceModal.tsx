'use client';

import { X, Sparkles } from 'lucide-react';
import { AiSummaryPanel } from '@/components/shared/AiSummaryPanel';
import { AiRunPanel } from './AiRunPanel';
import { useCalls, useUpdateCall } from '@/lib/hooks/use-calls';
import { useMeetings, useUpdateMeeting } from '@/lib/hooks/use-meetings';

interface AiWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'call' | 'meeting';
  entityId: string;
  projectId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
}

/**
 * Отдельная модалка для всего AI по звонку/встрече (вынесено из модалок редактирования):
 * S28 AiSummaryPanel (быстрое резюме по заметкам) сверху + S-AI-1 AiRunPanel
 * (транскрипт, пресеты, лента прогонов) ниже. Данные сущности здесь не редактируются.
 */
export function AiWorkspaceModal({
  isOpen, onClose, entityType, entityId, projectId, companyId, contactId,
}: AiWorkspaceModalProps) {
  const { data: calls } = useCalls();
  const { data: meetings } = useMeetings();
  const updateCall = useUpdateCall();
  const updateMeeting = useUpdateMeeting();

  const call = entityType === 'call' ? calls?.find((c) => c.id === entityId) : undefined;
  const meeting = entityType === 'meeting' ? meetings?.find((m) => m.id === entityId) : undefined;

  const aiSummary = call?.ai_summary ?? meeting?.ai_summary ?? null;
  const aiSummaryAt = call?.ai_summary_at ?? meeting?.ai_summary_at ?? null;
  const hasNotes = entityType === 'call'
    ? !!call?.agreements?.trim()
    : !!meeting?.notes?.trim();

  const typeLabel = entityType === 'call' ? 'Звонок' : 'Встреча';
  const subject = entityType === 'call'
    ? (call?.company?.name ?? (call?.contact ? `${call.contact.first_name} ${call.contact.last_name}` : null))
    : (meeting?.title ?? null);

  // Применение предложенного шага пишет напрямую в сущность (формы редактирования тут нет).
  const applyNextStep = (step: string) => {
    if (entityType === 'call') updateCall.mutate({ id: entityId, next_step: step });
    else updateMeeting.mutate({ id: entityId, next_step: step });
  };

  if (!isOpen) return null;

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} aria-hidden="true">
      <div data-modal className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>

        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-text-main">
            <Sparkles size={18} className="shrink-0 text-accent" />
            <span className="truncate">
              AI-анализ · {typeLabel}{subject ? ` · ${subject}` : ''}
            </span>
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="shrink-0 rounded-lg p-1 text-text-mute hover:bg-surface-hover"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {/* S28: быстрое резюме по заметкам */}
          <AiSummaryPanel
            entityType={entityType}
            entityId={entityId}
            aiSummary={aiSummary}
            aiSummaryAt={aiSummaryAt}
            hasNotes={hasNotes}
            onApplyNextStep={applyNextStep}
          />

          {/* S-AI-1: анализ по транскрипту (пресеты + лента прогонов) */}
          <AiRunPanel
            entityType={entityType}
            entityId={entityId}
            defaultCompanyId={call?.company_id ?? meeting?.company_id ?? companyId ?? null}
            defaultContactId={call?.contact_id ?? meeting?.contact_id ?? contactId ?? null}
            defaultProjectId={call?.project_id ?? meeting?.project_id ?? projectId ?? null}
          />
        </div>
      </div>
    </div>
  );
}
