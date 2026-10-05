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
  /** Дополнительная кнопка ряда (в фокусе — «Открыть сделку ↗ O»). */
  extra?: ReactNode;
  /** S-TODAY-FOCUS-1: клавиши на кнопках (D, T, S); `extra` уезжает вправо. */
  keyHints?: boolean;
}

const TEXT_BUTTON =
  'inline-flex min-h-7 items-center whitespace-nowrap rounded px-1.5 text-xs transition-colors hover:bg-surface2 hover:text-text-main';

/**
 * Клавиша на кнопке. Геометрия — как в `Hotkeys.tsx`; цвет наследуется от кнопки:
 * на primary-заливке и на стекле фокуса `text-text-mute` спорил бы с подписью.
 */
export function KeyHint({ k }: { k: string }) {
  return (
    <kbd className="ml-1.5 rounded border border-border px-1 font-mono text-meta leading-tight opacity-70">{k}</kbd>
  );
}

/**
 * Кнопки хода по таблице задачи 4 (`stepActionsFor`) — или форма, если она открыта.
 * S-TODAY-FOCUS-1: ряд один на экран — в шапке фокуса; мышь и клавиши D/U/T идут
 * через ту же таблицу, и разойтись им негде.
 */
export function TodayStepActions({
  view, primary, composer, onCompose, onWritten, onSnooze, href, extra, keyHints,
}: TodayStepActionsProps) {
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
          {keyHints && <KeyHint k="D" />}
        </Button>
        {actions.canMove && (
          <button type="button" onClick={() => onCompose('move')} className={`${TEXT_BUTTON} text-text-dim`}>
            Перенести
            {keyHints && <KeyHint k="T" />}
          </button>
        )}
        <button type="button" onClick={onSnooze} className={`${TEXT_BUTTON} text-text-mute${keyHints ? '' : ' ml-auto'}`}>
          Отложить
          {keyHints && <KeyHint k="S" />}
        </button>
        {keyHints && extra ? <span className="ml-auto">{extra}</span> : extra}
      </div>
    </div>
  );
}

/** Итог записанного хода в шапке фокуса: подпись и «Вернуть», пока итог в памяти. */
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
