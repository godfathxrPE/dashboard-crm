'use client';

import type {
  AiRunRow,
  ProtocolResult,
  AnalyticNoteResult,
  SpinReviewResult,
  MeetingPrepResult,
  DealSummaryResult,
} from '@/types/database';
import { ProtocolRenderer, type ActionItem } from './ProtocolRenderer';
import { AnalyticNoteRenderer } from './AnalyticNoteRenderer';
import { SpinReviewRenderer } from './SpinReviewRenderer';
import { MeetingPrepRenderer } from './MeetingPrepRenderer';
import { DealSummaryRenderer } from './DealSummaryRenderer';

/** Диспетчер: рендерер выбирается по preset_key прогона.
 *  `deal_progression` сюда не попадает — у него не рендерер, а диф-панель с
 *  применением в сделку (ветка в AiRunPanel). */
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
    // 085: read-only пресеты по сделке
    case 'meeting_prep':
      return <MeetingPrepRenderer result={run.result as MeetingPrepResult} />;
    case 'deal_summary':
      return <DealSummaryRenderer result={run.result as DealSummaryResult} />;
    default:
      return null;
  }
}
