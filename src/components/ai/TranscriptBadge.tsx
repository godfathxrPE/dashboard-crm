'use client';

import { FileText } from 'lucide-react';
import { formatCharCount } from '@/lib/domain/transcript';

/**
 * S-AI-VIS-1: признак «у этой строки есть расшифровка» в списке звонков/встреч.
 *
 * Первое место, куда человек идёт её искать (проверено на владельце: он пошёл в
 * карточку компании → звонки и ничего не нашёл, хотя расшифровка была).
 *
 * Бейджа нет — не рисуем ничего: у большинства звонков расшифровки не будет, и
 * пустая пометка «нет расшифровки» на каждой строке была бы шумом, а не информацией.
 * Клик открывает ту же AI-модалку, что и Sparkles.
 */
export function TranscriptBadge({ chars, onClick }: { chars: number; onClick: () => void }) {
  const volume = formatCharCount(chars);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Расшифровка · ${volume} — открыть AI-анализ`}
      aria-label={`Расшифровка, ${volume} — открыть AI-анализ`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5
                 text-meta text-text-dim transition-colors hover:border-accent hover:bg-accent-l hover:text-accent"
    >
      <FileText size={11} className="shrink-0" />
      <span className="whitespace-nowrap">Расшифровка · {volume}</span>
    </button>
  );
}
