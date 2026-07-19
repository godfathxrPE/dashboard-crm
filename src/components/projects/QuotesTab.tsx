'use client';

import { useState } from 'react';
import { Plus, ExternalLink, Pencil, Trash2, FileText } from 'lucide-react';
import { useQuotes, useDeleteQuote } from '@/lib/hooks/use-quotes';
import { useUpdateProject } from '@/lib/hooks/use-projects';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useAuth } from '@/lib/hooks/use-auth';
import { formatBudget } from '@/lib/validators/project';
import { formatDateShort } from '@/lib/utils/dates';
import { safeHref } from '@/lib/utils/safe-href';
import { QUOTE_STATUS_CONFIG } from '@/lib/validators/quote';
import { QuoteModal } from './QuoteModal';
import type { Project } from '@/lib/hooks/use-projects';
import type { Quote } from '@/types/entities';

interface QuotesTabProps {
  deal: Project;
}

/**
 * S-QUOTE-1: вкладка «КП» на сделке (type='client').
 *
 * W1: право на write квот ≠ canManage (= canManageDeliveryProject). Гейтим по РОЛИ
 * org, совпадающей с RLS 053 (owner/admin/manager) — иначе org-manager без владения
 * сделкой получил бы canManage=false, хотя RLS ему write разрешает. Кнопку accept→budget
 * гейтим отдельно по праву projects_update (owner/admin ИЛИ владелец сделки), иначе
 * silent RLS-fail.
 */
export function QuotesTab({ deal }: QuotesTabProps) {
  const { data: quotes, isLoading, error } = useQuotes(deal.id);
  const { data: orgRole } = useOrgRole();
  const { user } = useAuth();
  const deleteQuote = useDeleteQuote(deal.id);
  const updateProject = useUpdateProject();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);

  const canEditQuotes =
    orgRole === 'owner' || orgRole === 'admin' || orgRole === 'manager';
  // Право менять бюджет сделки (projects_update): владелец org или владелец сделки.
  const canUpdateDealBudget =
    orgRole === 'owner' || orgRole === 'admin' || deal.owner_id === user?.id;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (q: Quote) => {
    setEditing(q);
    setModalOpen(true);
  };

  const handleDelete = (q: Quote) => {
    if (confirm('Удалить КП? Это действие нельзя отменить.')) {
      deleteQuote.mutate(q.id);
    }
  };

  const accepted = quotes?.find((q) => q.status === 'accepted') ?? null;
  const showBudgetHint =
    accepted != null &&
    accepted.amount != null &&
    accepted.amount !== deal.budget &&
    canUpdateDealBudget;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-text-dim" />
          <span className="text-xs font-semibold text-text-main">
            Коммерческие предложения
          </span>
        </div>
        {canEditQuotes && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Plus size={12} /> КП
          </button>
        )}
      </div>

      {/* Accept-flow: принятое КП → предложить обновить бюджет сделки. */}
      {showBudgetHint && accepted && (
        <div className="mb-3 rounded-lg border border-green/40 bg-green/5 p-3">
          <p className="text-xs text-text-main">
            КП принято на{' '}
            <span className="font-semibold tabular-nums">
              {formatBudget(accepted.amount)}
            </span>
            {deal.budget != null && (
              <>
                {' '}— сейчас бюджет сделки{' '}
                <span className="tabular-nums">{formatBudget(deal.budget)}</span>
              </>
            )}
            .
          </p>
          <button
            onClick={() =>
              updateProject.mutate({ id: deal.id, budget: accepted.amount })
            }
            disabled={updateProject.isPending}
            className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Обновить бюджет сделки до {formatBudget(accepted.amount)}
          </button>
          <p className="mt-2 text-xs text-text-mute">
            Внедрение по этой сделке создаётся кнопкой «Создать внедрение» в блоке выше.
          </p>
        </div>
      )}

      {isLoading && <p className="text-xs text-text-mute">Загрузка…</p>}
      {error && (
        <p className="text-xs text-red">Не удалось загрузить КП.</p>
      )}

      {!isLoading && !error && quotes?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-6 text-center">
          <p className="text-xs text-text-mute">
            {canEditQuotes ? 'Нет КП — создай первое.' : 'Нет КП.'}
          </p>
          {canEditQuotes && (
            <button
              onClick={openCreate}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> КП
            </button>
          )}
        </div>
      )}

      {!isLoading && !error && quotes && quotes.length > 0 && (
        <ul className="space-y-1.5">
          {quotes.map((q) => {
            const cfg = QUOTE_STATUS_CONFIG[q.status];
            const docHref = safeHref(q.document_url); // фильтр схемы для ссылки на документ КП
            return (
              <li
                key={q.id}
                className="group flex items-center gap-3 rounded-lg border border-border/60 bg-surface2/40 px-3 py-2"
              >
                <span
                  className={`flex items-center gap-1 text-xs font-medium ${cfg.text}`}
                  title={cfg.label}
                >
                  <span aria-hidden>{cfg.glyph}</span>
                  {cfg.label}
                </span>

                <span className="min-w-[72px] text-sm font-semibold tabular-nums text-text-main">
                  {formatBudget(q.amount)}
                </span>

                <div className="flex-1 truncate text-[11px] text-text-mute">
                  {q.valid_until && <span>до {formatDateShort(q.valid_until)}</span>}
                  {q.valid_until && q.notes && <span> · </span>}
                  {q.notes && <span className="truncate">{q.notes}</span>}
                </div>

                {docHref && (
                  <a
                    href={docHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-text-mute transition-colors hover:text-accent"
                    title="Открыть документ КП"
                    aria-label="Открыть документ КП"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}

                <span className="shrink-0 text-xs text-text-mute tabular-nums">
                  {formatDateShort(q.created_at)}
                </span>

                {canEditQuotes && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEdit(q)}
                      className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main"
                      title="Редактировать"
                      aria-label="Редактировать КП"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(q)}
                      className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-red"
                      title="Удалить"
                      aria-label="Удалить КП"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <QuoteModal
          dealId={deal.id}
          editQuote={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
