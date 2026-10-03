'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/shared/Modal';
import { useStageTransition } from '@/lib/hooks/use-stage-transition';
import { parseStageGateError, type Project } from '@/lib/hooks/use-projects';
import type { PipelineMoveTarget } from '@/lib/domain/pipeline-choice';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-PIPE-SPLIT-2: перевод сделки в другую воронку направления.
//
// Это ПЕРЕХОД СТАДИИ, а не правка формы: `pipeline_id` и `stage_id` уходят одним
// UPDATE через единственный вход `useStageTransition` — гейт требований целевой
// стадии срабатывает на том же запросе, журнал `stage_transitions` пишет триггер.
// Стадия в цели — по имени (`mapStageToPipeline`): «Материалы» → «Материалы»,
// нет такой — первая рабочая.
//
// Отдельного примитива нет: компактный `Modal` (Esc / фон / Tab — его), а не
// `InlineConfirm` — тот принимает только строки, а здесь нужен выбор воронки.
// ═══════════════════════════════════════════════════════

interface PipelineMoveDialogProps {
  project: Project;
  currentStage: PipelineStage;
  targets: PipelineMoveTarget[];
  onClose: () => void;
}

export function PipelineMoveDialog({ project, currentStage: stageProp, targets: targetsProp, onClose }: PipelineMoveDialogProps) {
  const { commitTransition, isPending } = useStageTransition();
  // Снимок на момент открытия: оптимистичный апдейт меняет `pipeline_id` сделки ещё
  // до ответа сервера, и пересчитанные вызывающим цели (теперь — прежняя воронка)
  // подменили бы текст диалога, пока висит «Перевожу…».
  const [{ currentStage, targets }] = useState(() => ({ currentStage: stageProp, targets: targetsProp }));
  const [targetId, setTargetId] = useState(targets[0]?.pipeline.id ?? '');
  const target = useMemo(
    () => targets.find((t) => t.pipeline.id === targetId) ?? targets[0] ?? null,
    [targets, targetId],
  );

  const submit = () => {
    if (!target || isPending) return;
    const name = target.pipeline.name;
    commitTransition(
      {
        projectId: project.id,
        fromStageId: project.stage_id,
        toStageId: target.stage.id,
        pipelineId: target.pipeline.id,
      },
      {
        onSuccess: () => {
          toast.success(`Сделка переведена в «${name}»`);
          onClose();
        },
        onError: (err) => {
          // Гейт глобальный обработчик не тостит (isGateError) — показываем здесь,
          // с подсказками требований. Прочие сбои тостит mutationCache.onError.
          const unmet = parseStageGateError(err);
          if (!unmet) return;
          toast.error(`Перевод заблокирован: стадия «${target.stage.name}» требует заполнить поля`, {
            description: unmet.map((u) => u.hint).filter(Boolean).join(' · ') || undefined,
          });
        },
      },
    );
  };

  return (
    <Modal
      title="Перевести в воронку"
      description={project.name}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-dim transition-colors hover:bg-surface2"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="pipeline-move-form"
            // Modal фокус не ставит сам: без выбора воронки фокус — на действии,
            // чтобы диалог проходился с клавиатуры (Enter — перевести, Esc — отмена).
            autoFocus={targets.length <= 1}
            disabled={!target || isPending}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Перевожу…' : 'Перевести'}
          </button>
        </>
      }
    >
      <form
        id="pipeline-move-form"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="space-y-3"
      >
        {targets.length > 1 ? (
          <div>
            <label htmlFor="pipeline-move-target" className="mb-1 block text-xs font-medium text-text-dim">
              Воронка
            </label>
            <select
              id="pipeline-move-target"
              autoFocus
              value={target?.pipeline.id ?? ''}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {targets.map((t) => (
                <option key={t.pipeline.id} value={t.pipeline.id}>{t.pipeline.name}</option>
              ))}
            </select>
          </div>
        ) : (
          target && (
            <p className="text-body text-text-main">
              В воронку «{target.pipeline.name}»
            </p>
          )
        )}
        {target && (
          <p className="text-meta text-text-dim">
            Стадия: {currentStage.name} → <span className="font-medium text-text-main">{target.stage.name}</span>
          </p>
        )}
      </form>
    </Modal>
  );
}
