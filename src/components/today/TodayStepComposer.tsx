'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { pluralRu } from '@/lib/utils/plural';
import { dayText } from '@/lib/utils/today-text';
import { useFieldMoves } from '@/lib/hooks/use-stage-story';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { useStepFlow, StepFlowError } from '@/lib/hooks/use-step-flow';
import { quickStepDates, type QuickDate } from '@/lib/domain/step-dates';
import {
  planLeaveWithoutStep,
  planStepWrites,
  validateStepInput,
  type StepMode,
  type StepPrev,
  type StepWrite,
} from '@/lib/domain/step-flow';
import type { TodayDealView } from '@/lib/domain/today-model';

/** Что записалось — для отметки карточки и строки «записано сегодня». */
export interface StepResult {
  outcome: 'written' | 'moved' | 'cleared';
  /** Значения до записи — для «Вернуть». */
  prev: StepPrev;
  /** День нового шага; у `cleared` — `null`. */
  dateKey: string | null;
  /** Переносов в сделке после записи — для «Перенесён на … · перенесён N раз». */
  moveCount: number;
  /** Момент записи — читается в обработчике клика, не из рендера. */
  at: Date;
}

interface TodayStepComposerProps {
  view: TodayDealView;
  mode: StepMode;
  onCancel: () => void;
  onWritten: (result: StepResult) => void;
}

const SUBMIT_LABELS: Record<StepMode, string> = {
  done: 'Записать в сделку',
  update: 'Обновить шаг',
  revive: 'Вернуть в работу',
  move: 'Перенести',
};

const FIELD =
  'w-full rounded border border-input bg-surface px-2.5 py-1.5 text-body text-text-main placeholder:text-text-mute ' +
  'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

/**
 * Форма хода на месте (макет, кадры 4 и 9) — одна для карточки хода и для блока
 * «Сейчас» панели. Порядок записи — `planStepWrites`; здесь только поля и исполнение.
 *
 * Ошибка записи не закрывает форму и не чистит поля. Повтор начинается с упавшего
 * шага плана — заметка-итог второй раз не пишется.
 */
export function TodayStepComposer({ view, mode, onCancel, onWritten }: TodayStepComposerProps) {
  const { source } = view;
  const uid = useId();
  const { data: fieldMoves } = useFieldMoves(source.id);
  const stepMoves = fieldMoves?.step.count ?? 0;
  // Справка «последняя заметка» — только у «Обновить шаг»; в остальных режимах
  // запрос выключен (`entityId` пуст).
  const { events: noteEvents } = useEntityTimeline('project', mode === 'update' ? source.id : null, ['note'], 5);
  const lastNote = noteEvents.find((e) => e.kind === 'note') ?? null;
  const flow = useStepFlow();

  // Даты считаются в момент открытия формы, а не на каждом рендере.
  const [dates] = useState<QuickDate[]>(() => quickStepDates(new Date()));
  const [note, setNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ writes: StepWrite[]; from: number; leave: boolean } | null>(null);
  const firstFieldRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const prev: StepPrev = { next_step: source.next_step, next_action_date: source.next_action_date };
  const input = { note, nextStep, dateKey };
  const invalid = validateStepInput(mode, input) !== null;

  async function execute(writes: StepWrite[], from: number, leave: boolean) {
    setPending(true);
    setFailure(null);
    try {
      await flow.run(source.id, writes, from);
      const at = new Date();
      onWritten(
        leave
          ? { outcome: 'cleared', prev, dateKey: null, moveCount: 0, at }
          : mode === 'move'
            ? { outcome: 'moved', prev, dateKey, moveCount: stepMoves + 1, at }
            : { outcome: 'written', prev, dateKey, moveCount: 0, at },
      );
    } catch (error) {
      setFailure({ writes, from: error instanceof StepFlowError ? error.index : from, leave });
    } finally {
      setPending(false);
    }
  }

  const submit = () => {
    if (invalid || pending) return;
    void execute(planStepWrites(mode, prev, input), 0, false);
  };
  const leaveWithoutStep = () => {
    if (pending) return;
    void execute(planLeaveWithoutStep(prev, note), 0, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  const onStepKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const noteLabel = stepMoves >= 3
    ? `Шаг переносился ${stepMoves} ${pluralRu(stepMoves, 'раз', 'раза', 'раз')} — чем закончилось на этот раз?`
    : 'Чем закончилось — заметка в ленту сделки, необязательно';
  const nextMoves = stepMoves + 1;

  return (
    <div className="mt-2 space-y-2.5" onKeyDown={onKeyDown}>
      {mode === 'done' && (
        <div>
          <label htmlFor={`${uid}-note`} className="mb-1 block text-xs text-text-dim">{noteLabel}</label>
          <textarea
            id={`${uid}-note`}
            ref={(el) => { firstFieldRef.current = el; }}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(FIELD, 'resize-y')}
          />
        </div>
      )}

      {mode === 'update' && lastNote && (
        <p className="line-clamp-2 text-xs text-text-dim">
          последняя заметка, {dayText(lastNote.date)}: {lastNote.body ?? lastNote.title}
        </p>
      )}

      {mode !== 'move' && (
        <div>
          <label htmlFor={`${uid}-step`} className="mb-1 block text-xs text-text-dim">
            {mode === 'update' ? 'Новый шаг' : 'Следующий шаг'}
          </label>
          <input
            id={`${uid}-step`}
            ref={(el) => { if (mode !== 'done') firstFieldRef.current = el; }}
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            onKeyDown={onStepKeyDown}
            className={FIELD}
          />
        </div>
      )}

      <div>
        <label htmlFor={`${uid}-date`} className="mb-1 block text-xs text-text-dim">Дата шага</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {dates.map((d, i) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={dateKey === d.key}
              ref={(el) => { if (mode === 'move' && i === 0) firstFieldRef.current = el; }}
              onClick={() => setDateKey(d.key)}
              className={cn(
                'inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs transition-colors',
                dateKey === d.key
                  ? 'border-border2 bg-surface2 font-medium text-text-main'
                  : 'border-border text-text-dim hover:bg-surface2 hover:text-text-main',
              )}
            >
              {d.label}
            </button>
          ))}
          <input
            id={`${uid}-date`}
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            className={cn(FIELD, 'w-auto py-1 text-xs')}
          />
        </div>
        {mode === 'move' && (
          <p className="mt-1.5 text-xs text-warning-text">
            в сделке станет «перенесён {nextMoves} {pluralRu(nextMoves, 'раз', 'раза', 'раз')}»
          </p>
        )}
      </div>

      {failure && (
        <p role="alert" className="text-xs text-danger-text">
          Шаг по «{source.name}» не записан. Введённый текст сохранён.{' '}
          <button
            type="button"
            disabled={pending}
            onClick={() => void execute(failure.writes, failure.from, failure.leave)}
            className="font-medium text-text-main underline underline-offset-2 disabled:opacity-50"
          >
            Повторить
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={submit} disabled={invalid || pending} className="whitespace-nowrap">
          {SUBMIT_LABELS[mode]}
        </Button>
        {mode === 'done' && (
          <Button size="sm" variant="secondary" onClick={leaveWithoutStep} disabled={pending} className="whitespace-nowrap">
            Оставить без шага
          </Button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex min-h-7 items-center rounded px-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
