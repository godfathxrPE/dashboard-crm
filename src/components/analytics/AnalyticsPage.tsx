'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { CallsChart } from './CallsChart';
import { TasksDistribution, PipelineChart } from './Charts';
import { WeeklyReview } from './WeeklyReview';
import { ExportPanel } from './ExportPanel';

export function AnalyticsPage() {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Аналитика</h1>
        </div>
        <button onClick={() => setReviewOpen(true)}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
          <TrendingUp size={14} /> Итоги недели
        </button>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {/* Row 1: Calls + Tasks */}
        <div className="grid gap-4 md:grid-cols-2">
          <CallsChart />
          <TasksDistribution />
        </div>

        {/* Row 2: Pipeline + Export */}
        <div className="grid gap-4 md:grid-cols-[1fr_300px]">
          <PipelineChart />
          <ExportPanel />
        </div>
      </div>

      <WeeklyReview isOpen={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
