'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { CheckCircle2, Clock, AlertTriangle, ListTodo, Gauge } from 'lucide-react';
import { localDateKey } from '@/lib/utils/date-helpers';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import {
  useAnalyticsSummary, useThroughputSeries, useAgingBuckets,
} from '@/lib/hooks/use-task-analytics';

/* Throughput — единственный recharts-блок секции → dynamic-чанком (первый чанк
   /analytics без recharts, паттерн W4a как в AnalyticsPage). */
function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded bg-border/30" />;
}
const ThroughputChart = dynamic(
  () => import('./ThroughputChart').then((m) => m.ThroughputChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

/* Дефолт — последние 8 недель (56 дней) до сегодня. */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 56);
  return { from: localDateKey(from), to: localDateKey(to) };
}

/* ── KPI-плитка ─────────────────────────────────────────────────── */
function KpiTile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string | number;
  sub?: string;
  tone: string; // класс цвета иконки/подложки, напр. 'bg-green/10 text-green'
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text-main tabular-nums">{value}</div>
        <div className="text-xs text-text-dim">{label}</div>
        {sub && <div className="text-xs text-text-mute tabular-nums">{sub}</div>}
      </div>
    </div>
  );
}

const AGING_TONE: Record<number, string> = {
  0: 'var(--green)', 1: 'var(--blue)', 2: 'var(--yellow)', 3: 'var(--accent)',
};

export function TasksAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const def = useMemo(defaultRange, []);
  const from = searchParams.get('from') || def.from;
  const to = searchParams.get('to') || def.to;

  const setRange = useCallback(
    (next: { from?: string; to?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.from) params.set('from', next.from);
      if (next.to) params.set('to', next.to);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const { data: role } = useOrgRole();
  const scoped = role !== 'owner' && role !== 'admin';

  const summary = useAnalyticsSummary(from, to);
  const throughput = useThroughputSeries(from, to);
  const aging = useAgingBuckets();

  const s = summary.data;
  const completionPct = s?.completion_rate != null ? `${Math.round(s.completion_rate * 100)}%` : '—';
  const cycle = s?.cycle_time_median_days != null ? `${s.cycle_time_median_days}` : '—';

  const agingMax = Math.max(1, ...(aging.data ?? []).map((b) => b.cnt));

  return (
    <section className="space-y-4">
      {/* Заголовок секции + дэйт-рейндж */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-main">Задачи</h2>
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <input
            type="date" value={from} max={to}
            onChange={(e) => e.target.value && setRange({ from: e.target.value })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-text-main tabular-nums" />
          <span className="text-text-mute">—</span>
          <input
            type="date" value={to} min={from}
            onChange={(e) => e.target.value && setRange({ to: e.target.value })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-text-main tabular-nums" />
        </div>
      </div>

      {scoped && (
        <p className="text-xs text-text-mute">Показаны задачи в пределах вашего доступа.</p>
      )}

      {summary.isError ? (
        <p className="rounded-lg border border-border/50 bg-surface px-4 py-6 text-center text-xs text-text-mute">
          Не удалось загрузить аналитику.
        </p>
      ) : (
        <>
          {/* KPI-плитки */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile
              icon={Gauge} label="Completion rate" tone="bg-green/10 text-green"
              value={summary.isLoading ? '…' : completionPct}
              sub={s ? `${s.done_total} / ${s.done_total + s.open_total}` : undefined} />
            <KpiTile
              icon={CheckCircle2} label="Завершено за период" tone="bg-blue/10 text-blue"
              value={summary.isLoading ? '…' : (s?.completed_period ?? 0)}
              sub={s ? `создано: ${s.created_period}` : undefined} />
            <KpiTile
              icon={Clock} label="Cycle time, дней (медиана)" tone="bg-purple/10 text-purple"
              value={summary.isLoading ? '…' : cycle}
              sub="≈ для истории до 23.07" />
            <KpiTile
              icon={AlertTriangle} label="Просрочено" tone="bg-yellow/10 text-yellow"
              value={summary.isLoading ? '…' : (s?.overdue_count ?? 0)} />
            <KpiTile
              icon={ListTodo} label="Открыто всего" tone="bg-accent-l text-accent"
              value={summary.isLoading ? '…' : (s?.open_total ?? 0)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Throughput-тренд */}
            <div className="rounded-lg bg-surface p-4 elevation-hover">
              <h3 className="mb-3 text-xs font-semibold text-text-dim">Throughput по неделям</h3>
              <div className="h-56">
                {throughput.isLoading ? (
                  <ChartSkeleton />
                ) : (throughput.data ?? []).length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-text-mute">
                    Нет данных за период
                  </div>
                ) : (
                  <ThroughputChart data={throughput.data ?? []} />
                )}
              </div>
            </div>

            {/* Aging открытых задач */}
            <div className="rounded-lg bg-surface p-4 elevation-hover">
              <h3 className="mb-3 text-xs font-semibold text-text-dim">Возраст открытых задач</h3>
              <div className="h-56">
                {aging.isLoading ? (
                  <ChartSkeleton />
                ) : (aging.data ?? []).length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-text-mute">
                    Открытых задач нет
                  </div>
                ) : (
                  <div className="flex h-full flex-col justify-center gap-3">
                    {(aging.data ?? []).map((b) => (
                      <div key={b.sort_key} className="flex items-center gap-3">
                        <span className="w-12 shrink-0 text-right text-xs text-text-dim tabular-nums">
                          {b.bucket}
                        </span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-surface2">
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${Math.max(4, (b.cnt / agingMax) * 100)}%`,
                              background: AGING_TONE[b.sort_key] ?? 'var(--accent)',
                            }} />
                        </div>
                        <span className="w-8 shrink-0 text-xs font-semibold text-text-main tabular-nums">
                          {b.cnt}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
