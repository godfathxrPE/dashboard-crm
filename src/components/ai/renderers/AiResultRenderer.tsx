'use client';

import type { AiRunRow, ProtocolResult, AnalyticNoteResult, SpinReviewResult } from '@/types/database';
import { ProtocolRenderer, type ActionItem } from './ProtocolRenderer';
import { AnalyticNoteRenderer } from './AnalyticNoteRenderer';
import { SpinReviewRenderer } from './SpinReviewRenderer';

/** Диспетчер: рендерер выбирается по preset_key прогона. */
export function AiResultRenderer({
  run,
  onCreateTask,
}: {
  run: AiRunRow;
  onCreateTask: (item: ActionItem) => void;
}) {
  if (run.status !== 'done' || !run.result) return null;

  switch (run.preset_key) {
    case 'meeting_protocol':
      return <ProtocolRenderer result={run.result as ProtocolResult} onCreateTask={onCreateTask} />;
    case 'analytic_note':
      return <AnalyticNoteRenderer result={run.result as AnalyticNoteResult} />;
    case 'spin_review':
      return <SpinReviewRenderer result={run.result as SpinReviewResult} />;
    default:
      return null;
  }
}
