'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lightbulb } from 'lucide-react';
import { PipelineCockpit, type CockpitGateItem } from '@/components/shared/PipelineCockpit';
import { StageRail } from '@/components/shared/StageRail';
import { useStagesForPipeline } from '@/lib/hooks/use-pipelines';
import { useStageRequirements } from '@/lib/hooks/use-stage-requirements';
import { useStageGate } from '@/lib/hooks/use-stage-gate';
import {
  useDwellThresholds,
  useStageGuidance,
  useStageTargetDays,
  useUpdateOrgSettings,
} from '@/lib/hooks/use-org-settings';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { buildStageGuidancePatch, STAGE_GUIDANCE_MAX } from '@/lib/validators/org-settings';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { useMoveProject } from '@/lib/hooks/use-stage-transition';
import { useTransitionStore } from '@/lib/stores/transition-store';
import { resolveStageNorm, stageTimeGauge } from '@/lib/domain/stage-norm';
import { PHASE_LABELS, phaseLabel } from '@/lib/constants/phase-labels';
import type { Project } from '@/lib/hooks/use-projects';
import type { OrgSettings, PipelineStage, StageRequirementConfig } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-PIPELINE-COCKPIT-1: сборка данных кокпита для сделки/проекта внедрения.
//
// Заменил ТРИ блока ProjectDetail (DealProgressBar для ERP, StackedPipeline для
// IIoT, StackedPipeline для delivery) и чек-лист StageReadiness. Контракты
// переходов не изменились: вперёд у сделки — модалка перехода (openTransition),
// вперёд у внедрения — прямой moveToStageId (модалки перехода у фаз СДР НЕТ и
// не должно быть, S-R2-TRANSITION-1b), назад — подтверждение отката у родителя.
// ═══════════════════════════════════════════════════════

/** Стабильный ключ требования — тип + config (порядок ключей нормализован). Из StageReadiness. */
function reqKey(type: string, config: StageRequirementConfig): string {
  return `${type}:${JSON.stringify(config, Object.keys(config).sort())}`;
}

export interface ProjectStageCockpitProps {
  project: Project;
  /** Откат назад по воронке — подтверждение живёт у родителя (S-DEBT-CONFIRM-1). */
  onRollback: (target: { stageId: string; stageName: string; kind: 'deal' | 'delivery' }) => void;
}

export function ProjectStageCockpit({ project, onRollback }: ProjectStageCockpitProps) {
  const openTransition = useTransitionStore((s) => s.open);
  const { moveToStageId } = useMoveProject();
  const allStages = useStagesForPipeline(project.pipeline_id);
  const dwell = useDwellThresholds();
  const targetDays = useStageTargetDays();
  const guidance = useStageGuidance();
  const { data: orgRole } = useOrgRole();
  const updateSettings = useUpdateOrgSettings();
  const { data: requirements } = useStageRequirements(project.pipeline_id);

  // Хук НЕ сортирует и НЕ фильтрует — то же, что делал StackedPipeline на месте.
  const stages = useMemo(
    () => allStages.filter((s) => !s.is_won && !s.is_lost).sort((a, b) => a.order_index - b.order_index),
    [allStages],
  );

  const currentIndex = stages.findIndex((s) => s.id === project.stage_id);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1] ?? null : null;

  // Требования СЛЕДУЮЩЕЙ стадии — язык и фильтр прежние (StageReadiness).
  const stageReqs = useMemo(
    () => (requirements ?? []).filter((r) => r.stage_id === nextStage?.id && r.is_active),
    [requirements, nextStage?.id],
  );

  // Гейт-проверка — та же SECURITY DEFINER функция, что и enforcement-триггер.
  // Зовём только когда требования есть: у delivery-воронок их нет вовсе.
  const { data: unmet } = useStageGate(
    stageReqs.length > 0 ? project.id : null,
    nextStage?.id ?? null,
  );

  const unmetKeys = useMemo(
    () => new Set((unmet ?? []).map((u) => reqKey(u.type, u.config))),
    [unmet],
  );

  // Группы phase_group — та же логика подряд идущих групп, что в карте.
  const groups = useMemo(() => {
    const out: { key: string; from: number; to: number }[] = [];
    stages.forEach((s, i) => {
      const key = s.phase_group ?? '—';
      const last = out[out.length - 1];
      if (last && last.key === key) last.to = i;
      else out.push({ key, from: i, to: i });
    });
    return out;
  }, [stages]);

  if (!project.pipeline_id || !project.stage_id || stages.length === 0) return null;

  const isDelivery = project.type === 'delivery';
  const isWon = project.status === 'won';
  const locked = isDelivery
    ? project.status === 'completed'
    : project.status === 'won' || project.status === 'lost';

  // Терминал: stage_id указывает на won/lost-стадию, которой в `stages` нет —
  // имя берём из полного набора, иначе ячейка осталась бы без подписи.
  const currentStage: PipelineStage | null =
    stages[currentIndex] ?? allStages.find((s) => s.id === project.stage_id) ?? null;
  if (!currentStage) return null;

  const gauge = stageTimeGauge(
    project.stage_entered_at,
    currentIndex >= 0 ? resolveStageNorm(currentStage, targetDays, dwell) : null,
    new Date(),
  );

  // Пока гейт грузится, элемент готовности НЕ рендерится: пустой ответ RPC и
  // «ещё не спросили» неразличимы по unmetKeys, и «готовность 2/2» мигнула бы
  // перед честным «0/2».
  const gateReady = stageReqs.length > 0 && unmet !== undefined;
  const gateItems: CockpitGateItem[] = gateReady
    ? stageReqs.map((r) => ({
        label: r.error_hint,
        met: !unmetKeys.has(reqKey(r.requirement_type, r.config)),
      }))
    : [];
  const unmetCount = gateItems.filter((i) => !i.met).length;

  const groupIndex = groups.findIndex((g) => currentIndex >= g.from && currentIndex <= g.to);
  const groupLabel =
    currentIndex >= 0 && groupIndex >= 0 && currentStage.phase_group
      ? `${phaseLabel(currentStage.phase_group)} · группа ${groupIndex + 1} из ${groups.length}`
      : null;

  const restCount = currentIndex >= 0 ? stages.length - currentIndex - 1 : 0;
  const restGroupsCount = groups.filter((g) => g.from > currentIndex).length;

  /**
   * Клик по узлу карты — ветки БАЙТ-В-БАЙТ из заменённых блоков ProjectDetail:
   * равный order_index — выход, назад — подтверждение отката, вперёд — модалка
   * перехода (сделка) либо прямая запись (внедрение).
   */
  function handleStageClick(newStageId: string) {
    const currentStageObj = allStages.find((s) => s.id === project.stage_id);
    const targetStageObj = allStages.find((s) => s.id === newStageId);
    if (!currentStageObj || !targetStageObj) return;
    if (targetStageObj.order_index === currentStageObj.order_index) return;

    if (targetStageObj.order_index < currentStageObj.order_index) {
      onRollback({
        stageId: newStageId,
        stageName: targetStageObj.name,
        kind: isDelivery ? 'delivery' : 'deal',
      });
      return;
    }

    if (isDelivery) moveToStageId(project.id, newStageId);
    else openTransition({ project, toStageId: newStageId });
  }

  const next = nextStage
    ? {
        label: nextStage.name,
        // S-HEALTH-V2-1 (F-03): вероятность СЛЕДУЮЩЕЙ стадии на кнопке снята.
        // В зоне кокпита подряд шли три процента (прогресс воронки, вероятность
        // текущей стадии в metaRight, вероятность следующей здесь) — третье
        // число читалось как прогресс. Величина сделки — вероятность ТЕКУЩЕЙ
        // стадии, она осталась в metaRight. Проп `PipelineCockpit` не тронут:
        // он остаётся для лидов.
        probability: null,
        // Сервер — истина: приглушённая кнопка всё равно кликается, невыполненные
        // требования покажет модалка перехода.
        locked: unmetCount > 0,
        onClick: () =>
          isDelivery
            ? moveToStageId(project.id, nextStage.id)
            : openTransition({ project, toStageId: nextStage.id }),
      }
    : null;

  return (
    <PipelineCockpit
      pastCount={currentIndex >= 0 ? currentIndex : isWon ? stages.length : 0}
      pastNames={(currentIndex >= 0 ? stages.slice(0, currentIndex) : isWon ? stages : []).map((s) => s.name)}
      current={{ name: currentStage.name }}
      gauge={gauge}
      groupLabel={groupLabel}
      gate={gateItems.length > 0 ? { items: gateItems, title: `Готовность к стадии «${nextStage?.name ?? ''}»` } : null}
      next={next}
      restCount={restCount}
      restGroupsCount={restGroupsCount}
      metaRight={
        // Гейт-фикс S-PIPELINE-COCKPIT-1: вероятность ТЕКУЩЕЙ стадии ушла из шапки
        // вместе с пилюлей (F5) и не жила больше нигде — кнопка next несёт вероятность
        // СЛЕДУЮЩЕЙ. Возвращена сюда; подписана словом (S-UI-CLARITY-1).
        currentIndex >= 0
          ? `${currentIndex + 1} из ${stages.length}` +
            (!isDelivery && currentStage.probability != null
              ? ` · вероятность ${currentStage.probability}%`
              : '')
          : null
      }
      locked={locked}
      guidance={
        // Подсказка привязана к ТЕКУЩЕЙ стадии и меняется вместе с ней. У лидов
        // слота нет — блок собирает вызывающий, не общий кокпит.
        <StageGuidance
          stageId={currentStage.id}
          stageName={currentStage.name}
          text={guidance?.[currentStage.id] ?? ''}
          canEdit={orgRole === 'owner'}
          onSave={async (value) => {
            try {
              await updateSettings.mutateAsync({
                stage_guidance: buildStageGuidancePatch(guidance, currentStage.id, value),
              } as unknown as OrgSettings);
            } catch (err) {
              // 42501 у не-owner: политика org_update_owner. Кнопку мы уже скрыли,
              // но истина на сервере — молча терять текст нельзя.
              toast.error(err instanceof Error ? err.message : 'Не удалось сохранить подсказку');
            }
          }}
        />
      }
      map={
        <StageRail
          stages={stages}
          currentIndex={currentIndex}
          locked={locked}
          allDone={isWon}
          groupLabels={PHASE_LABELS}
          onStageClick={locked ? undefined : handleStageClick}
        />
      }
    />
  );
}

/**
 * «Что делаем на стадии» — org-подсказка под строкой кокпита (S-STAGE-STORY-1,
 * Salesforce Path «Guidance for Success»).
 *
 * ⚠️ Редактор — только у owner: `organizations` UPDATE закрыт политикой
 * `org_update_owner` (baseline + 054), у admin/manager запись вернула бы 42501.
 * Не-owner видит текст, но не редактор.
 *
 * ⚠️ Пусто и не owner ⇒ блок не рендерится ВОВСЕ: рамка «подсказки нет» — шум на
 * каждой карточке ненастроенной организации. Пусто и owner ⇒ одна строка-приглашение.
 */
function StageGuidance({
  stageId,
  stageName,
  text,
  canEdit,
  onSave,
}: {
  stageId: string;
  stageName: string;
  text: string;
  canEdit: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  // Хук объявлен ДО раннего return: порядок хуков обязан совпадать на всех
  // рендерах, а выходы ниже условны. На поведение это не влияет — у не-owner
  // с пустым текстом компонент по-прежнему не рисует ничего.
  const [editing, setEditing] = useState(false);

  if (!text && !canEdit) return null;

  // Пустая подсказка у owner — приглашение, а не блок: рамка во всю ширину ради
  // одной фразы была полосой-пустышкой на каждой ненастроенной стадии.
  // Заполненная подсказка остаётся прежним блоком — у неё есть содержание.
  //
  // S-FORMAT-1: приглашение больше не занимает строку в постоянном показе —
  // `h-0` держит его вне высоты полосы, а проявляется оно по наведению на блок
  // стадии (`group/cockpit` в PipelineCockpit). Меню «…» у карточки сделки нет,
  // поэтому вариант с наведением. `display` НЕ используем: скрытая через `hidden`
  // кнопка выпала бы из tab-порядка — здесь она остаётся фокусируемой и
  // проявляется на `focus-visible`, то есть с клавиатуры подсказка доступна.
  if (!text && canEdit && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex h-0 items-center gap-1.5 overflow-hidden text-meta text-text-mute
                   opacity-0 transition-opacity hover:text-accent
                   focus-visible:h-auto focus-visible:opacity-100
                   group-hover/cockpit:h-auto group-hover/cockpit:opacity-100"
      >
        <Lightbulb size={12} aria-hidden />
        Добавить подсказку для стадии «{stageName}»
      </button>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface2 px-3 py-2">
      <Lightbulb size={13} className="mt-0.5 shrink-0 text-text-mute" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-meta font-semibold uppercase tracking-wider text-text-mute">
          Что делаем на стадии
        </div>
        {canEdit ? (
          <InlineEdit
            // key по stageId: черновик InlineEdit живёт в его state, и без сброса
            // при смене стадии текст предыдущей подсказки утёк бы в следующую.
            key={stageId}
            as="textarea"
            value={text}
            // Клик по строке-приглашению уже был — редактор открываем сразу,
            // без второго клика по плейсхолдеру внутри блока.
            startEditing={editing}
            onSave={async (value) => {
              await onSave(value);
              setEditing(false);
            }}
            // Отказ (Escape / уход фокуса без правки) возвращает строку-приглашение:
            // иначе рамка-пустышка, ради снятия которой всё и делалось, остаётся на экране.
            onCancel={() => setEditing(false)}
            placeholder={`Добавить подсказку для стадии «${stageName}» (до ${STAGE_GUIDANCE_MAX} симв.)`}
            // twMerge: `text-text-dim` перебивает `text-text-main` InlineEdit'а —
            // подсказка тихая. У пустого значения класс не задаём: приглашение
            // остаётся `text-text-mute`, как всякий placeholder в проекте.
            className={text ? 'block text-body text-text-dim' : 'block text-body'}
          />
        ) : (
          <p className="whitespace-pre-wrap text-body text-text-dim">{text}</p>
        )}
      </div>
    </div>
  );
}
