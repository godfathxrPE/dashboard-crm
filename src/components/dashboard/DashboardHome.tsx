'use client';

import {
  StatsWidget,
  FunnelWidget,
  PomodoroWidget,
  DeadlineRadar,
  ClockWidget,
  QuickActions,
  WeeklyHeatmap,
} from '@/components/widgets';

/**
 * Dashboard Home — композиция виджетов
 *
 * Layout (desktop):
 * ┌──────────────────────────────────────────┐
 * │ Stats (5 cards)                          │
 * ├────────────┬────────────┬────────────────┤
 * │ Clock      │ Pomodoro   │ Quick Actions  │
 * ├────────────┴────────────┼────────────────┤
 * │ Funnel                  │ Deadline Radar │
 * ├─────────────────────────┼────────────────┤
 * │ Weekly Heatmap          │                │
 * └─────────────────────────┴────────────────┘
 *
 * Паттерн: Salesforce Lightning Home Page — виджеты с ключевыми
 * метриками, быстрыми действиями и таймлайном активности.
 */
export function DashboardHome() {
  return (
    <div className="space-y-4">
      {/* Row 1: Stats */}
      <StatsWidget />

      {/* Row 2: Clock + Pomodoro + Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <ClockWidget />
        <PomodoroWidget />
        <QuickActions />
      </div>

      {/* Row 3: Funnel + Deadline Radar */}
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <FunnelWidget />
        <DeadlineRadar />
      </div>

      {/* Row 4: Weekly Heatmap */}
      <WeeklyHeatmap />
    </div>
  );
}
