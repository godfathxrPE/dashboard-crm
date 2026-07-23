'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, TrendingUp } from 'lucide-react';
import { CTAButton } from '@/components/ui/CTAButton';
import { WeeklyReview } from './WeeklyReview';
import { ExportPanel } from './ExportPanel';
import { TasksAnalytics } from './TasksAnalytics';

// W4a: recharts-чарты — dynamic-чанком, первый чанк /analytics без recharts.
function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-border/50 bg-surface p-4">
      <div className="mb-4 h-3 w-32 rounded bg-border/50" />
      <div className="h-48 rounded bg-border/30" />
    </div>
  );
}
const CallsChart = dynamic(() => import('./CallsChart').then((m) => m.CallsChart), {
  ssr: false, loading: () => <ChartSkeleton />,
});
const TasksDistribution = dynamic(() => import('./Charts').then((m) => m.TasksDistribution), {
  ssr: false, loading: () => <ChartSkeleton />,
});
const PipelineChart = dynamic(() => import('./Charts').then((m) => m.PipelineChart), {
  ssr: false, loading: () => <ChartSkeleton />,
});

export function AnalyticsPage() {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-accent" />
          <h1 className="aura-page-title text-text-main">Аналитика</h1>
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
        {/* M6: pipeline на всю ширину; ExportPanel — утилита, ушла вниз строкой (ниже) */}
        <PipelineChart />
        {/* S-ANALYTICS-1: task-аналитика (серверные RPC 072) — completion/throughput/cycle/aging */}
        <TasksAnalytics />
        {/* Экспорт — служебная полоса, последним элементом страницы */}
        <ExportPanel />
      </div>

      <WeeklyReview isOpen={reviewOpen} onClose={() => setReviewOpen(false)} />
    </>
  );
}
