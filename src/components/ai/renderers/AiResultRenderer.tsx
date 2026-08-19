'use client';

import type {
  AiRunRow,
  ProtocolResult,
  AnalyticNoteResult,
  SpinReviewResult,
  MeetingPrepResult,
  DealSummaryResult,
  CompanyBriefResult,
} from '@/types/database';
import { ProtocolRenderer, type ActionItem } from './ProtocolRenderer';
import { AnalyticNoteRenderer } from './AnalyticNoteRenderer';
import { SpinReviewRenderer } from './SpinReviewRenderer';
import { MeetingPrepRenderer } from './MeetingPrepRenderer';
import { DealSummaryRenderer } from './DealSummaryRenderer';
import { CompanyBriefRenderer } from './CompanyBriefRenderer';

/** Диспетчер: рендерер выбирается по preset_key прогона.
 *  `deal_progression` сюда не попадает — у него не рендерер, а диф-панель с
 *  применением в сделку (ветка в AiRunPanel).
 *
 *  S-AI-VIS-1: `onCreateTask` необязателен — модалка просмотра результата из ленты
 *  формы задачи не держит, и кнопка «Создать задачу», которая ничего не делает,
 *  там была бы хуже её отсутствия. */
export function AiResultRenderer({
  run,
  onCreateTask,
  okved,
}: {
  run: AiRunRow;
  onCreateTask?: (item: ActionItem) => void;
  /**
   * S-DEBT-1. ОКВЭД карточки компании — для вычисленной строки маркировки в брифе.
   * Необязателен: хост, у которого карточки нет (модалка прогона из ленты), просто
   * не передаёт его, и вычисленной строки не будет. Диспетчер данных не читает —
   * пробрасывает то, что дал хост.
   */
  okved?: string | null;
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
    // 104: бриф по компании из открытых источников
    case 'company_brief':
      return <CompanyBriefRenderer result={run.result as CompanyBriefResult} okved={okved} />;
    default:
      return null;
  }
}
