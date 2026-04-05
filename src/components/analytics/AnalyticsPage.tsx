'use client';

import { useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { CTAButton } from '@/components/ui/CTAButton';
import { CallsChart } from './CallsChart';
import { TasksDistribution, PipelineChart } from './Charts';
import { WeeklyReview } from './WeeklyReview';
import { ExportPanel } from './ExportPanel';
import { useThemeStore } from '@/lib/stores/theme-store';
import { Watermark } from '@/components/ui/Watermark';
import { useWatermarkHover } from '@/lib/hooks/use-watermark-hover';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';

const SCANDI_ANALYTICS_WM = {
  calls:  { text: 'Звонки',    colors: WATERMARK_GRADIENTS.tidal },
  tasks:  { text: 'Задачи',    colors: WATERMARK_GRADIENTS.sunset },
  phases: { text: 'Фазы',      colors: WATERMARK_GRADIENTS.aurora },
  export: { text: 'Экспорт',   colors: WATERMARK_GRADIENTS.frost },
};

function ScandiChartWrap({ children, wm }: { children: React.ReactNode; wm: { text: string; colors: readonly string[] } }) {
  const { isActive, onMouseEnter, onMouseLeave } = useWatermarkHover(1000);
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <Watermark text={wm.text} colors={wm.colors} size="lg" isActive={isActive} className="mb-2 block" />
      {children}
    </div>
  );
}

export function AnalyticsPage() {
  const [reviewOpen, setReviewOpen] = useState(false);
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isScandi && <BarChart3 size={18} className="text-accent" />}
          <h1 className="text-lg font-semibold text-text-main">Аналитика</h1>
        </div>
        <CTAButton size="sm" onClick={() => setReviewOpen(true)}>
          <TrendingUp size={14} /> Итоги недели
        </CTAButton>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {isScandi ? (
            <>
              <ScandiChartWrap wm={SCANDI_ANALYTICS_WM.calls}><CallsChart /></ScandiChartWrap>
              <ScandiChartWrap wm={SCANDI_ANALYTICS_WM.tasks}><TasksDistribution /></ScandiChartWrap>
            </>
          ) : (
            <>
              <CallsChart />
              <TasksDistribution />
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {isScandi ? (
            <>
              <ScandiChartWrap wm={SCANDI_ANALYTICS_WM.phases}><PipelineChart /></ScandiChartWrap>
              <ScandiChartWrap wm={SCANDI_ANALYTICS_WM.export}><ExportPanel /></ScandiChartWrap>
            </>
          ) : (
            <>
              <PipelineChart />
              <ExportPanel />
            </>
          )}
        </div>
      </div>

      <WeeklyReview isOpen={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
