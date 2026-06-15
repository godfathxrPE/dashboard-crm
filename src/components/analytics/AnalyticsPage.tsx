'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { CTAButton } from '@/components/ui/CTAButton';
import { CallsChart } from './CallsChart';
import { TasksDistribution, PipelineChart } from './Charts';
import { WeeklyReview } from './WeeklyReview';
import { ExportPanel } from './ExportPanel';
import { useThemeStore } from '@/lib/stores/theme-store';
import { Watermark } from '@/components/ui/WatermarkNew';

export function AnalyticsPage() {
  const [reviewOpen, setReviewOpen] = useState(false);
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isScandi ? (
            <Watermark text="АНАЛИТИКА" size="section" />
          ) : (
            <>
              <BarChart3 size={18} className="text-accent" />
              <h1 className="aura-page-title text-text-main">Аналитика</h1>
            </>
          )}
        </div>
        <CTAButton size="sm" onClick={() => setReviewOpen(true)}>
          <TrendingUp size={14} /> Итоги недели
        </CTAButton>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <CallsChart />
          <TasksDistribution />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <PipelineChart />
          <ExportPanel />
        </div>
      </div>

      <WeeklyReview isOpen={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
