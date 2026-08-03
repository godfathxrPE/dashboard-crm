'use client';

import { X, Sparkles } from 'lucide-react';
import { AiCompanyPanel } from './AiCompanyPanel';

interface AiCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName?: string | null;
}

/**
 * S-COMPANY-AI-1 (104) — модалка AI по компании (бриф к звонку).
 * Повторяет AiDealModal: сущность без транскрипта, панель внутри.
 */
export function AiCompanyModal({ isOpen, onClose, companyId, companyName }: AiCompanyModalProps) {
  if (!isOpen) return null;

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        data-modal
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-text-main">
            <Sparkles size={18} className="shrink-0 text-accent" />
            <span className="truncate">AI по компании{companyName ? ` · ${companyName}` : ''}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-lg p-1 text-text-mute hover:bg-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        <AiCompanyPanel companyId={companyId} />
      </div>
    </div>
  );
}
