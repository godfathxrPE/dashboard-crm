'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertTriangle, Check, Circle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { StageTransitionFields } from './StageTransitionFields';
import { AutomationPreviewList } from './AutomationPreviewList';
import { useTransitionStore, type TransitionRequest } from '@/lib/stores/transition-store';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useStageGate } from '@/lib/hooks/use-stage-gate';
import { useAutomationRules } from '@/lib/hooks/use-automation-rules';
import { useStageTransition } from '@/lib/hooks/use-stage-transition';
import { parseStageGateError, type Project } from '@/lib/hooks/use-projects';
import { logActivity } from '@/lib/hooks/use-activity-log';
import {
  TRANSITION_METRIC_EVENT,
  previewTransition,
  type TransitionField,
} from '@/lib/domain/stage-transition';
import {
  TRANSITION_FORM_DEFAULTS,
  buildTransitionSchema,
  type TransitionFormValues,
} from '@/lib/validators/stage-transition';
import { parseBudgetInput } from '@/lib/validators/project';
import type { GateFieldColumn, UnmetRequirement } from '@/types/database';
import type { WfRow } from '@/lib/domain/wf-conditions';

/**
 * Модалка перехода стадии — «момент решения» (Blueprint v2, R2-P0-A1).
 *
 * Гейты в БД у нас были и раньше, но пользователь видел только тост об отказе:
 * что именно не закрыто, узнать было негде, а закрыть — тем более. Здесь чек-лист,
 * During-поля и причина исхода собираются ДО перехода и уезжают ОДНИМ UPDATE
 * (это стало возможно только с 078: BEFORE-гейт теперь видит патч того же запроса).
 *
 * Смонтирована ОДИН раз в `GlobalModals` и управляется `useTransitionStore` —
 * поэтому чеврон и доска не могут открыть две модалки поверх друг друга.
 */
export function StageTransitionModal() {
  const request = useTransitionStore((s) => s.request);
  const close = useTransitionStore((s) => s.close);

  if (!request) return null;
  // key — чтобы форма и локальное состояние пересоздавались на новый переход,
  // а не тащили ввод от предыдущего.
  return (
    <TransitionModalBody
      key={`${request.project.id}:${request.toStageId}`}
      request={request}
      onClose={close}
    />
  );
}

function TransitionModalBody({
  request,
  onClose,
}: {
  request: TransitionRequest;
  onClose: () => void;
}) {
  const { project, toStageId, resetOutcome } = request;

  const { data: allStages } = usePipelineStages();
  const gate = useStageGate(project.id, toStageId);
  const { data: rules = [] } = useAutomationRules();
  const { commitTransition, isPending } = useStageTransition();

  /** Отказ гейта/непокрываемые требования — показываем ВНУТРИ модалки, не тостом. */
  const [gateBlock, setGateBlock] = useState<UnmetRequirement[] | null>(null);
  const [checking, setChecking] = useState(false);

  const fromStage = allStages?.find((s) => s.id === project.stage_id) ?? null;
  const toStage = allStages?.find((s) => s.id === toStageId) ?? null;

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<TransitionFormValues>({ defaultValues: TRANSITION_FORM_DEFAULTS });

  const values = watch();

  /**
   * Снапшот строки для превью автоматизаций: текущая сделка + уже введённые поля.
   * Условия правил считаются по нему, поэтому превью реагирует на ввод.
   */
  const snapshot: WfRow = useMemo(() => {
    const patched: Record<string, unknown> = { ...(project as unknown as Record<string, unknown>) };
    if (values.budget.trim() !== '') patched.budget = parseBudgetInput(values.budget);
    if (values.company_id) patched.company_id = values.company_id;
    if (values.contact_id) patched.contact_id = values.contact_id;
    if (values.next_step.trim() !== '') patched.next_step = values.next_step;
    if (values.deadline) patched.deadline = values.deadline;
    if (values.next_action_date) patched.next_action_date = values.next_action_date;
    if (values.direction) patched.direction = values.direction;
    patched.stage_id = toStageId;
    return patched;
  }, [project, values, toStageId]);

  const preview = useMemo(
    () =>
      previewTransition({
        unmet: gate.data ?? [],
        targetStage: toStage,
        rules,
        snapshot,
        toStageId,
      }),
    [gate.data, toStage, rules, snapshot, toStageId],
  );

  /** Поля исхода: собираются на won/lost и гасятся при «вернуть в работу». */
  function outcomePatches(
    isWon: boolean,
    isLost: boolean,
    v: TransitionFormValues,
  ): Partial<Pick<Project, TransitionField>> {
    if (isWon) {
      return {
        won_reason: v.won_reason,
        won_detail: v.won_detail.trim() || null,
        loss_reason: null,
        loss_detail: null,
      };
    }
    if (isLost) {
      return {
        loss_reason: v.loss_reason,
        loss_detail: v.loss_detail.trim() || null,
        won_reason: null,
        won_detail: null,
      };
    }
    // Возврат в работу — исход сбрасывается тем же UPDATE, что и стадия.
    if (resetOutcome) {
      return { won_reason: null, won_detail: null, loss_reason: null, loss_detail: null };
    }
    return {};
  }

  /** Значение поля формы → значение колонки. Только для реально требуемых колонок. */
  function fieldPatch(
    column: GateFieldColumn,
    v: TransitionFormValues,
  ): Partial<Pick<Project, TransitionField>> {
    switch (column) {
      case 'budget':
        return { budget: parseBudgetInput(v.budget) };
      case 'company_id':
        return { company_id: v.company_id };
      case 'contact_id':
        return { contact_id: v.contact_id };
      case 'next_step':
        return { next_step: v.next_step.trim() };
      case 'deadline':
        return { deadline: v.deadline };
      case 'next_action_date':
        return { next_action_date: v.next_action_date };
      case 'direction':
        return { direction: v.direction };
      case 'probability':
        return { probability: Number(v.probability) };
      default:
        return {};
    }
  }

  const onSubmit = handleSubmit(async (v) => {
    setGateBlock(null);
    setChecking(true);
    try {
      // ГОНКА: между открытием модалки и подтверждением сделку мог изменить другой
      // пользователь. БД остаётся источником истины — перепроверяем гейт заново и
      // валидируем ввод против СВЕЖЕГО списка требований, а не того, что был при
      // открытии.
      const fresh = await gate.refetch();
      const freshPreview = previewTransition({
        unmet: fresh.data ?? [],
        targetStage: toStage,
        rules,
        snapshot,
        toStageId,
      });

      // Требования, которые формой не закрыть (файлы, колонка вне whitelist гейта),
      // — не отправляем вовсе: UPDATE гарантированно упал бы на гейте.
      if (freshPreview.blockingChecklist.length > 0) {
        setGateBlock(freshPreview.blockingChecklist);
        return;
      }

      const parsed = buildTransitionSchema({
        requiredFields: freshPreview.requiredDuringFields,
        requireWonReason: freshPreview.targetIsWon,
        requireLossReason: freshPreview.targetIsLost,
      }).safeParse(v);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path[0];
          if (typeof path === 'string') {
            setError(path as keyof TransitionFormValues, { message: issue.message });
          }
        }
        return;
      }

      let fieldPatches: Partial<Pick<Project, TransitionField>> = {};
      for (const column of freshPreview.requiredDuringFields) {
        fieldPatches = { ...fieldPatches, ...fieldPatch(column, v) };
      }
      fieldPatches = {
        ...fieldPatches,
        ...outcomePatches(freshPreview.targetIsWon, freshPreview.targetIsLost, v),
      };

      commitTransition(
        {
          projectId: project.id,
          fromStageId: project.stage_id,
          toStageId,
          fieldPatches,
          comment: v.comment.trim() || undefined,
        },
        {
          onSuccess: () => {
            // Знаменатель метрики «% переходов через модалку» — пишется ВСЕГДА,
            // в том числе с пустым комментарием (контракт 1a). Событие техническое
            // и скрыто из человеческих лент: сам переход там уже виден как
            // stage_changed, а комментарий — отдельным comment_added.
            logActivity(project.id, TRANSITION_METRIC_EVENT, {
              from_stage_id: project.stage_id,
              to_stage_id: toStageId,
              has_comment: v.comment.trim() !== '',
              fields_patched: Object.keys(fieldPatches),
            });
            onClose();
            // Доводки вызывающего (подсказка «запланируй следующий шаг» на доске) —
            // строго после закрытия, иначе тост уедет под оверлей.
            request.onCommitted?.();
          },
          onError: (err) => {
            // Гейт всё-таки отказал (кто-то изменил сделку между refetch и UPDATE,
            // либо клиентская валидация разошлась с БД) — показываем ВНУТРИ модалки.
            const unmet = parseStageGateError(err);
            if (unmet) {
              setGateBlock(unmet);
              void gate.refetch();
              return;
            }
            // Прочие сбои показывает глобальный mutationCache.onError (toast).
            onClose();
          },
        },
      );
    } finally {
      setChecking(false);
    }
  });

  const busy = checking || isPending;
  const ready =
    !gate.isLoading &&
    preview.blockingChecklist.length === 0 &&
    preview.requiredDuringFields.length === 0;

  return (
    <Modal
      title={
        <span>
          Стадия{fromStage ? ` «${fromStage.name}»` : ''} → «{toStage?.name ?? '…'}»
        </span>
      }
      description={project.name}
      onClose={onClose}
      isDirty={isDirty}
      maxWidth="max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-dim
                       transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="stage-transition-form"
            // Двойной клик = два UPDATE = два прохода автоматизаций. Дизейблим на
            // всё время проверки и мутации.
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm
                       font-medium text-white transition-opacity hover:opacity-90
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Подтвердить переход
          </button>
        </>
      }
    >
      <form id="stage-transition-form" onSubmit={onSubmit} className="space-y-4">
        {gate.isLoading ? (
          <div className="flex items-center gap-2 text-body text-text-mute">
            <Loader2 size={14} className="animate-spin" /> Проверяем требования стадии…
          </div>
        ) : (
          ready && (
            <div className="flex items-center gap-2 text-body text-text-dim">
              <Check size={14} className="text-green" /> Требования стадии закрыты.
            </div>
          )
        )}

        {/* Не закрывается формой: файлы и колонки вне whitelist гейта. */}
        {preview.blockingChecklist.length > 0 && (
          <div className="rounded-lg border border-border bg-surface2 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-dim">
              Нужно закрыть до перехода
            </h4>
            <ul className="space-y-1.5">
              {preview.blockingChecklist.map((req, i) => (
                <li key={`${req.type}-${i}`} className="flex items-start gap-2 text-body">
                  <Circle size={14} className="mt-0.5 shrink-0 text-text-mute" />
                  <span className="text-text-main">{req.hint}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-mute">
              Эти пункты закрываются на карточке сделки — например, вложением файла.
            </p>
          </div>
        )}

        <StageTransitionFields
          requiredFields={preview.requiredDuringFields}
          showWon={preview.targetIsWon}
          showLost={preview.targetIsLost}
          register={register}
          control={control}
          errors={errors}
        />

        <AutomationPreviewList items={preview.automationPreview} />

        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">
            Комментарий к переходу
          </label>
          <textarea
            {...register('comment')}
            rows={2}
            placeholder="Почему двигаем (необязательно)"
            className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm
                       text-text-main placeholder:text-text-mute
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {errors.comment && <p className="mt-1 text-xs text-red">{errors.comment.message}</p>}
        </div>

        {/* Отказ гейта — внутри модалки; это acceptance-критерий P0. */}
        {gateBlock && (
          <div className="rounded-lg border border-red/40 bg-red-l/30 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <AlertTriangle size={13} className="text-red" />
              <h4 className="text-xs font-semibold text-red">Переход отклонён</h4>
            </div>
            <ul className="space-y-1">
              {gateBlock.map((r, i) => (
                <li key={i} className="text-body text-text-main">
                  {r.hint}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
}
