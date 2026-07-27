'use client';

/**
 * Единственный вход смены стадии (S-R2-TRANSITION-1a).
 *
 * До этого спринта стадия писалась из шести мест четырьмя разными способами:
 * `moveToStageId` на трёх досках, два прямых `updateProject.mutate({stage_id, ...})`
 * в карточке сделки и поле «Стадия» в общей форме проекта. Правило «не писать
 * status/probability/actual_close_date» приходилось помнить в каждом. Теперь форма
 * payload'а собирается ровно одним `buildTransitionPatch`, а мутация — одна
 * (`useUpdateProject`), со всей её оптимистикой, откатом и логированием.
 *
 * `useMoveProject` живёт здесь же, а не в `use-projects.ts`: иначе получался бы цикл
 * импорта (use-projects → use-stage-transition → use-projects). Домен-модуль
 * `@/lib/domain/stage-transition` тянет из use-projects только типы (`import type`,
 * стирается компилятором), поэтому рантайм-цикла нет.
 *
 * 1a намеренно НЕ меняет поведение: все существующие вызовы переведены на сервис с
 * теми же полями, теми же тостами и тем же `parseStageGateError`. Модалка перехода —
 * S-R2-TRANSITION-1b.
 */

import { useUpdateProject } from './use-projects';
import { logActivity } from './use-activity-log';
import {
  buildTransitionPatch,
  type TransitionField,
  type TransitionInput,
} from '@/lib/domain/stage-transition';
import type { Project } from './use-projects';

/** Колбэки вызывающего поверх встроенного optimistic-rollback мутации. */
export interface TransitionOptions {
  onError?: (err: unknown) => void;
  onSuccess?: () => void;
}

export function useStageTransition() {
  const update = useUpdateProject();

  /**
   * Один `projects.update({ stage_id, ...fieldPatches })`. Комментарий (если есть) —
   * отдельным `comment_added` в activity_log ПОСЛЕ успеха: колонки под него нет, а
   * писать его до подтверждённого перехода нельзя — гейт мог бы переход отклонить.
   *
   * Событие `stage_changed` пишет сам `useUpdateProject` (он знает from-стадию из
   * кеша) — здесь его дублировать нельзя, иначе одно перемещение даст два события.
   */
  const commitTransition = (input: TransitionInput, options?: TransitionOptions) => {
    update.mutate(buildTransitionPatch(input), {
      onError: options?.onError,
      onSuccess: () => {
        const text = input.comment?.trim();
        if (text) {
          logActivity(input.projectId, 'comment_added', {
            text,
            from_stage_id: input.fromStageId,
            to_stage_id: input.toStageId,
          });
        }
        options?.onSuccess?.();
      },
    });
  };

  return { ...update, commitTransition };
}

/**
 * Быстрое перемещение по стадиям (drag&drop, чеврон, «следующая стадия»).
 * Тонкая обёртка над `commitTransition` — сохранена, чтобы три доски и карточка
 * не переписывались под новую сигнатуру ради спринта, который обязан быть
 * незаметен пользователю.
 */
export function useMoveProject() {
  const transition = useStageTransition();

  return {
    ...transition,
    /**
     * Sprint 1.5: move by stage_id — единственная истина стадии.
     * B1 (S-LEGACY-STAGE-1): legacy `stage` не пишем (колонка снята в 047).
     * Sprint 27: options пробрасываются в mutate — вызывающий ловит отказ гейта
     * (parseStageGateError) поверх встроенного optimistic-rollback хука.
     * S-WON-REASON-1: `extra` — доп. поля тем же mutate (напр. won_reason).
     */
    moveToStageId: (
      id: string,
      stageId: string,
      options?: TransitionOptions,
      extra?: Partial<Pick<Project, TransitionField>>,
    ) => {
      transition.commitTransition(
        {
          projectId: id,
          // Досок «откуда» не спрашиваем: from-стадию для лога берёт из кеша сам
          // useUpdateProject, а комментария у этого пути нет.
          fromStageId: null,
          toStageId: stageId,
          fieldPatches: extra,
        },
        options,
      );
    },
  };
}
