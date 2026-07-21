'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { usePortfolioHealth } from '@/lib/hooks/use-portfolio-health';
import { projectHref } from '@/lib/utils/project-href';

// ═══════════════════════════════════════════════════════
// S-PORTFOLIO-2 — risk-виджет на /overview (management-сигнал).
// «N в зоне риска» + топ-красные, deep-link в таб «Портфель».
// Данные — usePortfolioHealth() (тот же источник, что PortfolioView).
// ═══════════════════════════════════════════════════════

const TOP_N = 4;

export function PortfolioRiskWidget() {
  const { rows, counts, isLoading, error } = usePortfolioHealth();

  if (isLoading) {
    return (
      <div className="rounded-lg bg-surface p-4 elevation-hover">
        <div className="flex h-24 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-accent" />
        </div>
      </div>
    );
  }
  if (error) return null; // тихо: остальной дашборд не ломаем

  const redRows = rows.filter((r) => r.health.status === 'at_risk').slice(0, TOP_N);
  const hasRisk = counts.at_risk > 0;

  // Сигнал — только у исключения. Нет рисков → тихая одна строка, не полноразмерный виджет.
  if (!hasRisk) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-surface px-4 py-2.5 elevation-hover">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green" />
        <span className="text-xs text-text-dim">
          <span className="font-medium text-text-main">Портфель внедрений:</span>{' '}
          {rows.length} активных, рисков нет
          {counts.attention > 0 && (
            <span className="text-yellow"> · {counts.attention} требуют внимания</span>
          )}
        </span>
        <Link
          href="/projects?tab=portfolio"
          className="ml-auto flex items-center gap-1 text-meta text-accent hover:underline"
        >
          Портфель <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-surface p-4 elevation-hover">
      {/* Заголовок */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-red">▲</span>
          <span className="text-xs font-semibold text-text-dim">
            Внедрения в зоне риска
          </span>
        </div>
        <Link
          href="/projects?tab=portfolio"
          className="flex items-center gap-1 text-meta text-accent hover:underline"
        >
          Портфель <ArrowRight size={12} />
        </Link>
      </div>

      {/* Счётчики */}
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums text-red">
          {counts.at_risk}
        </span>
        <span className="text-xs text-text-mute">
          в риске
          {counts.attention > 0 && (
            <> · <span className="text-yellow">◐</span> {counts.attention} внимание</>
          )}
        </span>
      </div>

      {/* Топ-красные */}
      <div className="space-y-1">
        {redRows.map((r) => (
          <Link
            key={r.id}
            href={projectHref(r.project)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover"
          >
            <AlertTriangle size={12} className="shrink-0 text-red" />
            <span className="min-w-0 flex-1 truncate text-xs text-text-main">
              {r.project.name}
            </span>
            {r.health.reasons[0] && (
              <span className="hidden shrink-0 text-xs text-text-mute sm:inline">
                {r.health.reasons[0]}
              </span>
            )}
            <span className="shrink-0 text-meta tabular-nums text-text-mute">
              {r.health.score}
            </span>
          </Link>
        ))}
        {counts.at_risk > TOP_N && (
          <Link
            href="/projects?tab=portfolio"
            className="block px-2 pt-1 text-meta text-accent hover:underline"
          >
            ещё {counts.at_risk - TOP_N} →
          </Link>
        )}
      </div>
    </div>
  );
}
