import type { PipelineStage } from '@/types/database';

/** Минимум полей сделки, нужный метрикам. Дженерик — чтобы функция работала
 *  и с entities.Project, и с локальным use-projects.Project (у них разный набор
 *  полей), возвращая active того же типа, что передали. */
export interface DealMetricsProject {
  type: string;
  status: string;
  budget: number | null;
  stage_id: string | null;
  pipeline_id: string | null;
}

/**
 * Единый источник метрик по сделкам (Sprint W2). Раньше Обзор (KpiCards) и Сделки
 * (PipelineBoard.HeroMetrics) считали active/pipeline/conversion по СВОИМ формулам —
 * на соседних экранах выходило «1 vs 2 активных», «3.6M vs 11M», «22% vs 67%».
 *
 * Определения зафиксированы ревью 2026-07-18:
 *   active      = type='client' AND status='open'   (on_hold — НЕ active)
 *   pipelineSum = Σ budget по active (в копейках, как в БД)
 *   weighted    = Σ budget × probability(стадии)/100 (probability из pipeline_stages)
 *   conversion  = won / (won + lost), в процентах, целое (0 при нуле закрытых)
 *
 * Чистая функция без хуков — тестируется напрямую, переиспользуется на любом экране.
 */
export interface DealMetricsOptions {
  /** Срез по пайплайну (p.pipeline_id). Без него — все направления. */
  pipelineId?: string;
  /** Стадии для weighted-прогноза (probability берётся по stage_id). */
  stages?: PipelineStage[];
}

export interface DealMetrics<T> {
  active: T[];
  pipelineSum: number;
  weighted: number;
  wonCount: number;
  lostCount: number;
  conversion: number;
}

export function dealMetrics<T extends DealMetricsProject>(
  projects: T[],
  opts: DealMetricsOptions = {},
): DealMetrics<T> {
  const { pipelineId, stages } = opts;

  // Клиентские сделки (+ опциональный срез по пайплайну). internal/delivery — вне метрик.
  const clients = projects.filter(
    (p) => p.type === 'client' && (!pipelineId || p.pipeline_id === pipelineId),
  );

  const active = clients.filter((p) => p.status === 'open');
  const won = clients.filter((p) => p.status === 'won');
  const lost = clients.filter((p) => p.status === 'lost');

  const pipelineSum = active.reduce((s, p) => s + (p.budget ?? 0), 0);

  const probByStage = new Map<string, number>();
  for (const st of stages ?? []) probByStage.set(st.id, st.probability ?? 0);
  const weighted = active.reduce((s, p) => {
    const prob = p.stage_id ? probByStage.get(p.stage_id) ?? 0 : 0;
    return s + (p.budget ?? 0) * prob / 100;
  }, 0);

  const closed = won.length + lost.length;
  const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

  return {
    active,
    pipelineSum,
    weighted,
    wonCount: won.length,
    lostCount: lost.length,
    conversion,
  };
}
