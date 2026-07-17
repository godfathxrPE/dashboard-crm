'use client';

import { useMemo } from 'react';
import { useDeliveryProjects, type Project } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  getDeliveryHealth,
  isDeliveryTerminal,
  type DeliveryHealth,
  type DeliveryHealthStatus,
} from '@/lib/utils/delivery-health';
import {
  DELIVERY_PHASE_ORDER,
  type DeliveryPhase,
} from '@/lib/constants/delivery-phases';
import type { PipelineStage } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-PORTFOLIO-2 — единый источник health-ранжирования портфеля внедрений.
// Вынесен из PortfolioView, чтобы PortfolioView и risk-виджет на /overview
// потребляли одну и ту же логику (не форкать пороги health). Ноль новых
// запросов: useDeliveryProjects + usePipelineStages уже в кэше React Query.
// Owner НЕ считаем здесь — он нужен только таблице PortfolioView.
// ═══════════════════════════════════════════════════════

// Строка портфеля БЕЗ ownerName — owner маппит PortfolioView (виджету не нужен).
export type PortfolioRow = {
  id: string;
  name: string;
  deadline: string | null;
  project: Project;
  health: DeliveryHealth;
  stageName: string;
  phase: DeliveryPhase | null;
  dwellDays: number | null;
  isTerminal: boolean;
};

export type PortfolioAging = {
  phase: DeliveryPhase;
  count: number;
  maxDwell: number | null;
};

function isDeliveryPhase(v: string | null | undefined): v is DeliveryPhase {
  return !!v && (DELIVERY_PHASE_ORDER as readonly string[]).includes(v);
}

/**
 * Единый источник health-ранжирования портфеля внедрений.
 * Строки предсортированы по score asc (краснее — выше) — как в S-PORTFOLIO-1.
 * Терминальные (завершён/закрыт) исключены (не краснят портфель).
 */
export function usePortfolioHealth() {
  const { data: rawProjects, isLoading, error } = useDeliveryProjects();
  const { data: allStages } = usePipelineStages();

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    allStages?.forEach((s) => map.set(s.id, s));
    return map;
  }, [allStages]);

  const rows = useMemo<PortfolioRow[]>(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const out: PortfolioRow[] = [];

    for (const p of rawProjects ?? []) {
      if (p.type !== 'delivery') continue;

      const st = p.stage_id ? stageById.get(p.stage_id) ?? null : null;
      const isTerminal = isDeliveryTerminal(st, p.status);
      const health = getDeliveryHealth({
        progress_done: p.progress_done,
        progress_total: p.progress_total,
        stage_entered_at: p.stage_entered_at,
        deadline: p.deadline,
        updated_at: p.updated_at,
        isTerminal,
      });

      if (isTerminal) continue; // портфель = активные (в полёте)

      const phaseRaw = st?.phase_group ?? null;
      const dwellMs = p.stage_entered_at ? new Date(p.stage_entered_at).getTime() : null;
      const dwellDays =
        dwellMs !== null && !Number.isNaN(dwellMs)
          ? Math.floor((nowMs - dwellMs) / 86400000)
          : null;

      out.push({
        id: p.id,
        name: p.name,
        deadline: p.deadline,
        project: p,
        health,
        stageName: st?.name ?? '—',
        phase: isDeliveryPhase(phaseRaw) ? phaseRaw : null,
        dwellDays,
        isTerminal,
      });
    }

    out.sort((a, b) => a.health.score - b.health.score); // краснее — сверху
    return out;
  }, [rawProjects, stageById]);

  const counts = useMemo(() => {
    const c: Record<DeliveryHealthStatus, number> = { at_risk: 0, attention: 0, healthy: 0 };
    for (const r of rows) c[r.health.status] += 1;
    return c;
  }, [rows]);

  const aging = useMemo<PortfolioAging[]>(() => {
    return DELIVERY_PHASE_ORDER.map((phase) => {
      const inPhase = rows.filter((r) => r.phase === phase);
      const maxDwell = inPhase.reduce<number | null>((mx, r) => {
        if (r.dwellDays == null) return mx;
        return mx == null ? r.dwellDays : Math.max(mx, r.dwellDays);
      }, null);
      return { phase, count: inPhase.length, maxDwell };
    });
  }, [rows]);

  return { rows, counts, aging, isLoading, error };
}
