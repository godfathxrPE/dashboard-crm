'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  useUpdateProject,
  parseDeliveryGateError,
  type DeliveryGateFailure,
  type Project,
} from '@/lib/hooks/use-projects';
import { useDeliveryGate, type OpenMilestone } from '@/lib/hooks/use-delivery-gate';
import { useToggleChecklistItem } from '@/lib/hooks/use-project-checklists';
import { DELIVERY_TASK_STATUS_LABELS } from '@/lib/constants/delivery-phases';
import { Modal } from '@/components/shared/Modal';
import type { OpenChecklistItem } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Delivery P3: модалка завершения проекта внедрения.
// Чеклист вех (check_delivery_completion) + подтверждение; отказ
// backstop-триггера (веха переоткрыта между чеклистом и кликом) —
// alert-баннер со списком вех внутри модалки (осмысленная локальная
// реакция). Прочие сбои показывает глобальный toast (AUDIT A1.1).
//
// R2-P1-G (084): второе основание отказа — неотмеченные обязательные пункты
// sign-off чеклистов. Пункты отмечаются ПРЯМО ЗДЕСЬ (тот же RPC, что на карточке
// проекта): иначе РП вынужден закрыть модалку, уйти в секцию чеклистов и вернуться.
// DETAIL backstop'а с 084 содержит оба списка — баннер рендерит оба.
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
        <li key={m.id} className="flex items-center gap-2 text-body">
          <span className="min-w-0 flex-1 truncate text-text-main">
            {m.phase && <span className="text-text-mute">{m.phase} · </span>}
            {m.text}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full border px-1.5 py-px text-xs font-medium',
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

/**
 * Незакрытые обязательные пункты чеклистов. Каждый — настоящий чекбокс, отметка идёт
 * тем же DEFINER-RPC (checked_by/checked_at штампует сервер). После ответа мутация
 * инвалидирует и ['delivery-gate'], поэтому пункт исчезает из списка сам.
 */
function ChecklistItemList({
  items,
  projectId,
  disabled,
}: {
  items: OpenChecklistItem[];
  projectId: string;
  disabled?: boolean;
}) {
  const toggle = useToggleChecklistItem();

  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const inputId = `gate-chk-${it.checklist_id}-${it.key}`;
        return (
          <li key={`${it.checklist_id}:${it.key}`} className="flex items-start gap-2.5 text-body">
            <input
              id={inputId}
              type="checkbox"
              checked={false}
              disabled={disabled || toggle.isPending}
              onChange={() =>
                toggle.mutate({
                  checklistId: it.checklist_id,
                  itemKey: it.key,
                  checked: true,
                  projectId,
                })
              }
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                         disabled:cursor-not-allowed disabled:opacity-50"
            />
            <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
              <span className="text-text-main">{it.label}</span>
              <span className="ml-1.5 text-xs text-text-mute">{it.checklist}</span>
            </label>
          </li>
        );
      })}
      {toggle.isPending && (
        <li className="flex items-center gap-1.5 text-xs text-text-mute">
          <Loader2 size={11} className="animate-spin" /> Отмечаем…
        </li>
      )}
    </ul>
  );
}

export function DeliveryCompletionModal({ project, onClose }: DeliveryCompletionModalProps) {
  const qc = useQueryClient();
  const updateProject = useUpdateProject();
  const gate = useDeliveryGate(project.id, project.type === 'delivery' && project.status === 'open');

  // Backstop-отказ триггера — списки из DETAIL показываем баннером; прочие сбои
  // уходят в глобальный toast (mutationCache.onError).
  const [gateError, setGateError] = useState<DeliveryGateFailure | null>(null);

  const ready = gate.data?.ready === true;
  const openMilestones = gate.data?.open_milestones ?? [];
  const openItems = gate.data?.open_checklist_items ?? [];

  function handleComplete() {
    setGateError(null);
    updateProject.mutate(
      { id: project.id, status: 'completed' },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          const failure = parseDeliveryGateError(err);
          if (failure) {
            setGateError(failure);
            // Чеклист устарел (веху переоткрыли / пункт сняли в другой вкладке) — обновляем
            qc.invalidateQueries({ queryKey: ['delivery-gate', project.id] });
            qc.invalidateQueries({ queryKey: ['project-checklists', project.id] });
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
              {openMilestones.length > 0 && openItems.length > 0
                ? 'Закройте вехи и отметьте обязательные пункты'
                : openItems.length > 0
                ? 'Отметьте обязательные пункты, чтобы завершить проект'
                : 'Закройте вехи, чтобы завершить проект'}
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

                {gateError.open_milestones.length > 0 && (
                  <>
                    <p className="mt-0.5 mb-1.5 text-body text-text-dim">
                      Вехи переоткрыты — закройте их и повторите:
                    </p>
                    <MilestoneList items={gateError.open_milestones} />
                  </>
                )}

                {gateError.open_checklist_items.length > 0 && (
                  <>
                    <p className="mt-1.5 mb-1.5 text-body text-text-dim">
                      Обязательные пункты сняты — отметьте и повторите:
                    </p>
                    <ChecklistItemList
                      items={gateError.open_checklist_items}
                      projectId={project.id}
                      disabled={updateProject.isPending}
                    />
                  </>
                )}

                {gateError.open_milestones.length === 0 &&
                  gateError.open_checklist_items.length === 0 && (
                    <p className="mt-0.5 text-body text-text-dim">
                      Состояние проекта изменилось — обновите чеклист и повторите.
                    </p>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Чеклист готовности: вехи + обязательные пункты sign-off */}
        {gate.isPending ? (
          <div className="mb-4 flex items-center gap-2 text-sm text-text-mute">
            <Loader2 size={14} className="animate-spin" /> Проверяем готовность…
          </div>
        ) : gate.isError ? (
          <div role="alert" className="mb-4 rounded-lg border border-red/40 bg-red/5 p-3 text-body text-red">
            Не удалось проверить готовность проекта
          </div>
        ) : ready ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green/30 bg-green-l p-3 text-sm text-green">
            <CheckCircle2 size={15} className="shrink-0" /> Вехи закрыты, обязательные пункты отмечены
          </div>
        ) : (
          <div className="mb-4 space-y-3">
            {openMilestones.length > 0 && (
              <div className="rounded-lg border border-border bg-surface2 p-3">
                <p className="mb-2 text-xs font-medium text-text-dim">
                  Открытые вехи ({openMilestones.length})
                </p>
                <MilestoneList items={openMilestones} />
              </div>
            )}

            {openItems.length > 0 && (
              <div className="rounded-lg border border-border bg-surface2 p-3">
                <p className="mb-2 text-xs font-medium text-text-dim">
                  Не отмечены обязательные пункты ({openItems.length})
                </p>
                <ChecklistItemList
                  items={openItems}
                  projectId={project.id}
                  disabled={updateProject.isPending}
                />
              </div>
            )}
          </div>
        )}
    </Modal>
  );
}
