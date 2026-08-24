'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Rocket, Sparkles } from 'lucide-react';
import { useDeleteProject, type Project } from '@/lib/hooks/use-projects';
import { useTransitionStore } from '@/lib/stores/transition-store';
import { Badge } from '@/components/ui/Badge';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
import { deliveryKindLabel, hasTaskProgress } from '@/lib/constants/delivery-phases';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1: шапка карточки сделки/проекта — имя, бейджи, терминальные
// действия, AI, правка, удаление. Вынесена из `ProjectDetail` целиком, логика
// действий не менялась: те же переходы через модалку, тот же `InlineConfirm`.
//
// Из шапки при переносе ушли:
//   • бейдж полноты — в «Сводку» рельсы (R-06: счётчик стоит над своими полями);
//   • «Создан …» — туда же строкой «Создана» (R-11/F-09);
//   • health внедрения — в карточку «Здоровье» рельсы: держать его и здесь
//     значило бы завести второе место для одной величины (F-01).
// ═══════════════════════════════════════════════════════

export interface DealHeaderProps {
  project: Project;
  isDelivery: boolean;
  /** Права управления delivery = контракт RLS/RPC, не `role !== 'viewer'`. */
  canManage: boolean;
  allPipelineStages: PipelineStage[] | undefined;
  /** Куда возвращаться после удаления: /deals у сделки, /projects у остальных. */
  backHref: string;
  /** Открыть Win Wizard (spawn внедрения из выигранной сделки). */
  onSpawn: () => void;
  /** Открыть модалку завершения delivery (чеклист вех, гейт 038). */
  onComplete: () => void;
  onOpenAi: () => void;
  onEdit: () => void;
}

export function DealHeader({
  project,
  isDelivery,
  canManage,
  allPipelineStages,
  backHref,
  onSpawn,
  onComplete,
  onOpenAi,
  onEdit,
}: DealHeaderProps) {
  const router = useRouter();
  const deleteProject = useDeleteProject();
  // S-R2-TRANSITION-1b: карточка не двигает стадию сама — открывает модалку
  // перехода, она же собирает причину won/lost.
  const openTransition = useTransitionStore((s) => s.open);
  // S-DEBT-CONFIRM-1: удаление — оверлей с последствиями, не window.confirm.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleDelete() {
    setConfirmingDelete(false);
    deleteProject.mutate(project.id, {
      onSuccess: () => router.push(backHref),
    });
  }

  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="aura-page-title text-text-main">{project.name}</h1>
          {project.type === 'internal' ? (
            <Badge color="accent" size="sm">Внутренний</Badge>
          ) : (
            <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
              {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
            </Badge>
          )}
          {isDelivery && (() => {
            const kindLabel = project.delivery_kind
              ? deliveryKindLabel(project.delivery_kind, project.direction)
              : null;
            return (
              <>
                <Badge color="green" size="sm">Внедрение</Badge>
                {/* D1: у ERP-launch лейбл kind = «Внедрение» — дублировал бы бейдж */}
                {kindLabel && kindLabel !== 'Внедрение' && (
                  <span className="text-xs text-text-mute">{kindLabel}</span>
                )}
              </>
            );
          })()}
          {/* S-HEALTH-V2-1 (F-01): вердикт здоровья из шапки УБРАН — он живёт
              ровно в одном месте, под следующим шагом (DealNextStep). */}
        </div>
        {/* P2b (B3): прогресс задач — отдельная метрика, НЕ смешиваем со стадийным % */}
        {isDelivery && hasTaskProgress(project.progress_total) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-text-mute">
            <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-text-dim">
              Задачи: {project.progress_done}/{project.progress_total}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Терминальные действия — одним кликом из карточки (только client — воронка) */}
        {project.type === 'client' && (project.status === 'open' || project.status === 'on_hold') && (() => {
          const pipeStages = allPipelineStages?.filter((s) => s.pipeline_id === project.pipeline_id) ?? [];
          const wonStage = pipeStages.find((s) => s.is_won);
          const lostStage = pipeStages.find((s) => s.is_lost);
          return (
            <>
              {wonStage && (
                <button
                  onClick={() =>
                    openTransition({
                      project,
                      toStageId: wonStage.id,
                      // S-WON-AUTO-1 сохранён: успешный выигрыш сразу предлагает
                      // Win Wizard. Отказ гейта → onCommitted не вызовется, мастер
                      // не откроется (как и раньше через onSuccess).
                      onCommitted: onSpawn,
                    })
                  }
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                             transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
                >
                  Выиграна
                </button>
              )}
              {lostStage && (
                <button
                  onClick={() => openTransition({ project, toStageId: lostStage.id })}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                             transition-colors hover:border-red/40 hover:text-red hover:bg-red-l"
                >
                  Проиграна
                </button>
              )}
            </>
          );
        })()}
        {/* Delivery P1: терминал delivery — «Завершить проект» (status open→completed).
            P3: confirm() → модалка с чеклистом вех (гейт 038) */}
        {isDelivery && project.status === 'open' && (
          <button
            onClick={onComplete}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                       transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
          >
            Завершить проект
          </button>
        )}
        {isDelivery && project.status === 'completed' && (
          <span className="rounded-full bg-green-l px-2.5 py-1 text-xs font-medium text-green">
            Завершён
          </span>
        )}
        {(project.status === 'won' || project.status === 'lost') && (
          <>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              project.status === 'won' ? 'bg-green-l text-green' : 'bg-red-l text-red'
            }`}>
              {project.status === 'won' ? 'Выиграна' : 'Проиграна'}
              {project.actual_close_date &&
                ` · ${new Date(project.actual_close_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
            </span>
            {/* Delivery P1 (B4): spawn проекта внедрения из выигранной сделки.
                1 сделка → 1..N проектов — кнопка не блокируется после первого. */}
            {project.type === 'client' && project.status === 'won' && (
              <button
                onClick={onSpawn}
                className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs
                           font-medium text-white shadow-sm transition-opacity hover:opacity-90"
              >
                <Rocket size={12} /> Создать проект внедрения
              </button>
            )}
            <button
              onClick={() => {
                const firstStage = allPipelineStages
                  ?.filter((s) => s.pipeline_id === project.pipeline_id && !s.is_won && !s.is_lost)
                  .sort((a, b) => a.order_index - b.order_index)[0];
                if (!firstStage) return;
                // Модалка нужна и здесь (это переход), но причина не требуется —
                // целевая стадия не won/lost; исход гасится тем же UPDATE.
                openTransition({
                  project,
                  toStageId: firstStage.id,
                  resetOutcome: true,
                });
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-dim
                         transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              Вернуть в работу
            </button>
          </>
        )}
        {/* S-IA-DELIVERY-1 (§3.2): модалка редактирует и delivery (name/связи/owner,
            partial-payload). do_url/deadline остаются инлайн на карточке.
            Для delivery карандаш — по canManage (контракт RLS/RPC, не 42501 в лоб). */}
        {/* 085: AI по сделке — только на клиентской сделке. Бриф к встрече и сводка
            собираются из полей сделки; у delivery/internal своя фактура и своих
            пресетов пока нет. */}
        {project.type === 'client' && (
          <button
            onClick={onOpenAi}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs
                       font-medium text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Sparkles size={12} /> AI
          </button>
        )}
        {(!isDelivery || canManage) && (
          <button
            onClick={onEdit}
            aria-label="Редактировать"
            className="rounded-lg border border-border p-1.5 text-text-mute
                       transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Pencil size={14} />
          </button>
        )}
        <button
          onClick={() => setConfirmingDelete(true)}
          aria-label="Удалить"
          className="rounded-lg border border-border p-1.5 text-text-mute
                     transition-colors hover:bg-red/10 hover:text-red"
        >
          <Trash2 size={14} />
        </button>
        {confirmingDelete && (
          <InlineConfirm
            mode="overlay"
            question={`Удалить ${project.type === 'client' ? 'сделку' : 'проект'}?`}
            consequence="Связанные задачи сохранятся. Это действие нельзя отменить."
            pending={deleteProject.isPending}
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}
      </div>
    </div>
  );
}
