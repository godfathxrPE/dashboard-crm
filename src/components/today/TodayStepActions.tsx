'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { stepActionsFor } from '@/lib/domain/step-actions';
import type { StepMode } from '@/lib/domain/step-flow';
import type { TodayDealView } from '@/lib/domain/today-model';
import { TodayStepComposer, type StepResult } from './TodayStepComposer';

interface TodayStepActionsProps {
  view: TodayDealView;
  /** Primary-кнопка на экране одна — у первого несделанного хода. */
  primary: boolean;
  /** Открытый режим формы; `null` — форма закрыта, видны кнопки. */
  composer: StepMode | null;
  onCompose: (mode: StepMode | null) => void;
  onWritten: (result: StepResult) => void;
  onSnooze: () => void;
  /** Ссылка карточки сделки — для «Закрыть сделку — в карточке». */
  href: string;
  /** Дополнительная кнопка ряда (у карточки — «Подробнее»). */
  extra?: ReactNode;
}

const TEXT_BUTTON =
  'inline-flex min-h-7 items-center whitespace-nowrap rounded px-1.5 text-xs transition-colors hover:bg-surface2 hover:text-text-main';

/**
 * Кнопки хода по таблице задачи 4 (`stepActionsFor`) — или форма, если она открыта.
 * Один компонент на карточку хода и блок «Сейчас»: мышь и клавиши D/U/T идут через
 * ту же таблицу, и разойтись им негде.
 */
export function TodayStepActions({ view, primary, composer, onCompose, onWritten, onSnooze, href, extra }: TodayStepActionsProps) {
  if (composer) {
    return <TodayStepComposer view={view} mode={composer} onCancel={() => onCompose(null)} onWritten={onWritten} />;
  }
  const actions = stepActionsFor(view.cls);

  return (
    <div>
      {actions.closeLink && (
        <Link href={href} className="mb-1.5 inline-block text-xs text-text-dim underline-offset-2 hover:underline">
          Закрыть сделку — в карточке
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
        <Button
          size="sm"
          variant={primary ? 'primary' : 'secondary'}
          onClick={() => onCompose(actions.primary.mode)}
          className="whitespace-nowrap px-2"
        >
          {actions.primary.label}
        </Button>
        {actions.canMove && (
          <button type="button" onClick={() => onCompose('move')} className={`${TEXT_BUTTON} text-text-dim`}>
            Перенести
          </button>
        )}
        <button type="button" onClick={onSnooze} className={`${TEXT_BUTTON} ml-auto text-text-mute`}>
          Отложить
        </button>
        {extra}
      </div>
    </div>
  );
}

/** Итог записанного хода в блоке «Сейчас»: подпись и «Вернуть», пока итог в памяти. */
export function TodayStepDone({ text, onRestore, restoring }: { text: string; onRestore?: () => void; restoring?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="text-xs font-medium text-success-text">{text}</span>
      {onRestore && (
        <button type="button" disabled={restoring} onClick={onRestore} className={`${TEXT_BUTTON} text-text-dim disabled:opacity-50`}>
          Вернуть
        </button>
      )}
    </div>
  );
}
