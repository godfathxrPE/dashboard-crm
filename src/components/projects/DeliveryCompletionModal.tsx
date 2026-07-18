'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUpdateProject, parseDeliveryGateError, type Project } from '@/lib/hooks/use-projects';
import { useDeliveryGate, type OpenMilestone } from '@/lib/hooks/use-delivery-gate';
import { DELIVERY_TASK_STATUS_LABELS } from '@/lib/constants/delivery-phases';
import { Modal } from '@/components/shared/Modal';

// ═══════════════════════════════════════════════════════
// Delivery P3: модалка завершения проекта внедрения.
// Чеклист вех (check_delivery_completion) + подтверждение; отказ
// backstop-триггера (веха переоткрыта между чеклистом и кликом) —
// alert-баннер со списком вех внутри модалки (осмысленная локальная
// реакция). Прочие сбои показывает глобальный toast (AUDIT A1.1).
// ═══════════════════════════════════════════════════════

const LANE_BADGE_CLS: Record<string, string> = {
  next: 'border-border2 bg-surface2 text-text-mute',
  now: 'border-accent bg-accent text-[var(--bg)]',  // S-UI-POLISH-1: активный статус — solid-акцент (тинт был блёклым), как пилюля стадии
  wait: 'border-yellow/30 bg-yellow-l text-yellow',
  done: 'border-green/30 bg-green-l text-green',
};

interface DeliveryCompletionModalProps {
  project: Project;
  onClose: () => void;
}

function MilestoneList({ items }: { items: OpenMilestone[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate text-text-main">
            {m.phase && <span className="text-text-mute">{m.phase} · </span>}
            {m.text}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full border px-1.5 py-px text-[0.625rem] font-medium',
              LANE_BADGE_CLS[m.lane] ?? LANE_BADGE_CLS.next,
            )}
          >
            {DELIVERY_TASK_STATUS_LABELS[m.lane] ?? m.lane}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeliveryCompletionModal({ project, onClose }: DeliveryCompletionModalProps) {
  const qc = useQueryClient();
  const updateProject = useUpdateProject();
  const gate = useDeliveryGate(project.id, project.type === 'delivery' && project.status === 'open');

  // Backstop-отказ триггера — вехи из DETAIL показываем баннером; прочие сбои
  // уходят в глобальный toast (mutationCache.onError).
  const [gateError, setGateError] = useState<OpenMilestone[] | null>(null);

  const ready = gate.data?.ready === true;
  const openMilestones = gate.data?.open_milestones ?? [];

  function handleComplete() {
    setGateError(null);
    updateProject.mutate(
      { id: project.id, status: 'completed' },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          const milestones = parseDeliveryGateError(err);
          if (milestones) {
            setGateError(milestones);
            // Чеклист устарел (веху переоткрыли в другой вкладке) — обновляем
            qc.invalidateQueries({ queryKey: ['delivery-gate', project.id] });
          }
          // Прочие ошибки покажет глобальный toast — здесь ничего не делаем.
        },
      },
    );
  }

  return (
    <Modal title="Завершение проекта" onClose={onClose} maxWidth="max-w-md"
      footer={
        <>
          {!ready && !gate.isPending && !gate.isError && (
            <span className="mr-auto text-xs text-text-mute">
              Закройте вехи, чтобы завершить проект
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-dim
                       transition-colors hover:bg-surface2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Отмена
          </button>
          <button
            autoFocus
            onClick={handleComplete}
            disabled={!ready || updateProject.isPending}
            className="rounded-lg border border-green/40 px-3 py-1.5 text-xs font-medium text-green
                       transition-colors hover:bg-green-l focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateProject.isPending ? 'Завершаем…' : 'Завершить'}
          </button>
        </>
      }
    >
        <p className="mb-3 text-sm text-text-dim">
          Проект «{project.name}» будет отмечен завершённым.
        </p>

        {/* Backstop: отказ триггера при клике «Завершить» (образец gateBlock S27) */}
        {gateError && (
          <div role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/5 p-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-main">Завершение заблокировано</p>
                <p className="mt-0.5 mb-1.5 text-[13px] text-text-dim">
                  Вехи переоткрыты — закройте их и повторите:
                </p>
                <MilestoneList items={gateError} />
              </div>
            </div>
          </div>
        )}

        {/* Чеклист вех */}
        {gate.isPending ? (
          <div className="mb-4 flex items-center gap-2 text-sm text-text-mute">
            <Loader2 size={14} className="animate-spin" /> Проверяем вехи…
          </div>
        ) : gate.isError ? (
          <div role="alert" className="mb-4 rounded-lg border border-red/40 bg-red/5 p-3 text-[13px] text-red">
            Не удалось проверить вехи проекта
          </div>
        ) : ready ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green/30 bg-green-l p-3 text-sm text-green">
            <CheckCircle2 size={15} className="shrink-0" /> Все вехи закрыты
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-border bg-surface2 p-3">
            <p className="mb-2 text-xs font-medium text-text-dim">
              Открытые вехи ({openMilestones.length})
            </p>
            <MilestoneList items={openMilestones} />
          </div>
        )}
    </Modal>
  );
}
