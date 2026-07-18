import { describe, test, expect } from 'vitest';
import { dealMetrics } from '@/lib/selectors/deal-metrics';
import type { Project } from '@/types/entities';
import type { PipelineStage } from '@/types/database';

// Минимальный конструктор проекта — только поля, читаемые dealMetrics.
function proj(over: Partial<Project>): Project {
  return {
    type: 'client',
    status: 'open',
    budget: 0,
    stage_id: null,
    pipeline_id: null,
    ...over,
  } as Project;
}

function stage(id: string, probability: number, pipeline_id = 'pipe-1'): PipelineStage {
  return {
    id,
    pipeline_id,
    name: id,
    order_index: 0,
    probability,
    phase_group: null,
    is_won: false,
    is_lost: false,
  };
}

describe('dealMetrics.active', () => {
  test('active = client + open; исключает won/lost/on_hold/internal/delivery', () => {
    const projects = [
      proj({ status: 'open' }),
      proj({ status: 'won' }),
      proj({ status: 'lost' }),
      proj({ status: 'on_hold' }),
      proj({ type: 'internal', status: 'open' }),
      proj({ type: 'delivery', status: 'open' }),
    ];
    const m = dealMetrics(projects);
    expect(m.active).toHaveLength(1);
    expect(m.active[0].status).toBe('open');
  });

  test('pipelineSum — Σ budget по active (копейки)', () => {
    const projects = [
      proj({ status: 'open', budget: 100_000 }),
      proj({ status: 'open', budget: 250_000 }),
      proj({ status: 'won', budget: 999_999 }), // не active → не в сумме
      proj({ status: 'on_hold', budget: 500_000 }), // on_hold не active
    ];
    const m = dealMetrics(projects);
    expect(m.pipelineSum).toBe(350_000);
  });
});

describe('dealMetrics.conversion', () => {
  test('0 при нуле закрытых', () => {
    const m = dealMetrics([proj({ status: 'open' })]);
    expect(m.conversion).toBe(0);
    expect(m.wonCount).toBe(0);
    expect(m.lostCount).toBe(0);
  });

  test('won / (won + lost), целое', () => {
    const projects = [
      proj({ status: 'won' }),
      proj({ status: 'won' }),
      proj({ status: 'lost' }),
    ];
    const m = dealMetrics(projects);
    expect(m.wonCount).toBe(2);
    expect(m.lostCount).toBe(1);
    expect(m.conversion).toBe(67); // 2/3 = 66.67 → 67
  });
});

describe('dealMetrics.weighted', () => {
  test('Σ budget × probability(стадии)/100', () => {
    const projects = [
      proj({ status: 'open', budget: 1_000_000, stage_id: 's1' }), // 30%
      proj({ status: 'open', budget: 2_000_000, stage_id: 's2' }), // 50%
      proj({ status: 'open', budget: 500_000, stage_id: 'missing' }), // нет в stages → 0
    ];
    const stages = [stage('s1', 30), stage('s2', 50)];
    const m = dealMetrics(projects, { stages });
    // 1_000_000*0.3 + 2_000_000*0.5 = 300_000 + 1_000_000
    expect(m.weighted).toBe(1_300_000);
  });

  test('без stages weighted = 0', () => {
    const m = dealMetrics([proj({ status: 'open', budget: 1_000_000, stage_id: 's1' })]);
    expect(m.weighted).toBe(0);
  });
});

describe('dealMetrics срез по пайплайну', () => {
  test('pipelineId фильтрует по p.pipeline_id', () => {
    const projects = [
      proj({ status: 'open', budget: 100, pipeline_id: 'pipe-1' }),
      proj({ status: 'open', budget: 200, pipeline_id: 'pipe-2' }),
      proj({ status: 'won', pipeline_id: 'pipe-1' }),
      proj({ status: 'lost', pipeline_id: 'pipe-2' }),
    ];
    const m = dealMetrics(projects, { pipelineId: 'pipe-1' });
    expect(m.active).toHaveLength(1);
    expect(m.pipelineSum).toBe(100);
    expect(m.wonCount).toBe(1);
    expect(m.lostCount).toBe(0); // lost был в pipe-2
    expect(m.conversion).toBe(100);
  });
});
