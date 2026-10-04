'use client';

import { useCreateNote } from '@/lib/hooks/use-notes';
import { useUpdateProject } from '@/lib/hooks/use-projects';
import type { StepWrite } from '@/lib/domain/step-flow';

// ═══════════════════════════════════════════════════════
// S-TODAY-V3-ACT-1: исполнение плана записи хода.
//
// Порядка здесь нет — он в `planStepWrites` (`step-flow.ts`), где его видит тест.
// Хук идёт по списку строго по очереди и останавливается на первой ошибке.
//
// ⚠️ Уже записанное НЕ откатывается: заметка-итог — факт, её место в ленте. Повтор
// начинается с упавшего шага (`from`), поэтому заметка второй раз не пишется.
// ═══════════════════════════════════════════════════════

/** Ошибка записи с индексом упавшего шага плана — повтор начинается с него. */
export class StepFlowError extends Error {
  constructor(readonly index: number, readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Не удалось записать шаг');
    this.name = 'StepFlowError';
  }
}

export function useStepFlow() {
  const createNote = useCreateNote();
  const updateProject = useUpdateProject();

  async function run(projectId: string, writes: readonly StepWrite[], from = 0): Promise<void> {
    for (let i = from; i < writes.length; i++) {
      const w = writes[i];
      try {
        if (w.kind === 'note') {
          await createNote.mutateAsync({ project_id: projectId, body: w.body });
        } else {
          await updateProject.mutateAsync({ id: projectId, next_step: w.next_step, next_action_date: w.next_action_date });
        }
      } catch (error) {
        throw new StepFlowError(i, error);
      }
    }
  }

  return { run };
}
