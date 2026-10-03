/**
 * Выбор deal-воронки направления и перенос стадии между воронками (S-PIPE-SPLIT-2).
 *
 * Закрепляется: default — только порядок, а не единственный вариант; чужой id в
 * URL не ломает доску; стадия при переводе ищется по имени, терминал — по природе.
 */

import { describe, it, expect } from 'vitest';
import {
  dealPipelinesFor,
  firstWorkingStage,
  mapStageToPipeline,
  pipelineMoveTargets,
  resolveActivePipeline,
} from '@/lib/domain/pipeline-choice';
import type { Pipeline, PipelineStage } from '@/types/database';

const pipe = (over: Partial<Pipeline> & Pick<Pipeline, 'id' | 'name'>): Pipeline => ({
  direction: 'iiot',
  entity_type: 'deal',
  is_default: false,
  created_at: '2026-10-03T00:00:00Z',
  ...over,
});

const PROJECT = pipe({ id: 'p-proj', name: 'IIoT Проект', is_default: true });
const EXPERIMENT = pipe({ id: 'p-exp', name: 'IIoT Эксперимент' });
const ALPHA = pipe({ id: 'p-alpha', name: 'IIoT Альфа' });
const DELIVERY = pipe({ id: 'p-deliv', name: 'IIoT Внедрение', entity_type: 'project', is_default: true });
const ERP = pipe({ id: 'p-erp', name: 'ERP Продажи', direction: 'erp', is_default: true });

const ALL = [EXPERIMENT, DELIVERY, ERP, ALPHA, PROJECT];

const stage = (
  over: Partial<PipelineStage> & Pick<PipelineStage, 'id' | 'name' | 'order_index'>,
): PipelineStage => ({
  pipeline_id: 'p-x',
  probability: null,
  phase_group: 'attraction',
  is_won: false,
  is_lost: false,
  ...over,
});

describe('dealPipelinesFor', () => {
  it('default первым, дальше по имени', () => {
    expect(dealPipelinesFor(ALL, 'iiot').map((p) => p.id)).toEqual(['p-proj', 'p-alpha', 'p-exp']);
  });

  it('delivery-воронки и чужое направление отброшены', () => {
    const ids = dealPipelinesFor(ALL, 'iiot').map((p) => p.id);
    expect(ids).not.toContain('p-deliv');
    expect(ids).not.toContain('p-erp');
    expect(dealPipelinesFor(ALL, 'erp').map((p) => p.id)).toEqual(['p-erp']);
  });

  it('не мутирует входной массив', () => {
    const input = [...ALL];
    dealPipelinesFor(input, 'iiot');
    expect(input).toEqual(ALL);
  });
});

describe('resolveActivePipeline', () => {
  it('валидный id этого направления → он', () => {
    expect(resolveActivePipeline(ALL, 'iiot', 'p-exp')?.id).toBe('p-exp');
  });

  it('id чужого направления / delivery / несуществующий → default', () => {
    expect(resolveActivePipeline(ALL, 'iiot', 'p-erp')?.id).toBe('p-proj');
    expect(resolveActivePipeline(ALL, 'iiot', 'p-deliv')?.id).toBe('p-proj');
    expect(resolveActivePipeline(ALL, 'iiot', 'нет-такой')?.id).toBe('p-proj');
  });

  it('без параметра → default', () => {
    expect(resolveActivePipeline(ALL, 'iiot', null)?.id).toBe('p-proj');
  });

  it('нет default → первая по имени', () => {
    expect(resolveActivePipeline([EXPERIMENT, ALPHA], 'iiot', null)?.id).toBe('p-alpha');
  });

  it('пустой список → null', () => {
    expect(resolveActivePipeline([], 'iiot', 'p-exp')).toBeNull();
    expect(resolveActivePipeline([DELIVERY, ERP], 'iiot', null)).toBeNull();
  });
});

describe('mapStageToPipeline', () => {
  const target = [
    stage({ id: 't-won', name: 'Выиграна', order_index: 7, is_won: true, phase_group: 'closing' }),
    stage({ id: 't-mat', name: 'Материалы', order_index: 3 }),
    stage({ id: 't-lead', name: 'Лид', order_index: 1 }),
    stage({ id: 't-docs', name: 'Документы', order_index: 4, phase_group: 'working' }),
    stage({ id: 't-lost', name: 'Проиграна', order_index: 8, is_lost: true, phase_group: 'closing' }),
  ];

  it('совпадение по имени без учёта регистра и пробелов', () => {
    const current = stage({ id: 's-mat', name: '  материалы ', order_index: 3 });
    expect(mapStageToPipeline(current, target)?.id).toBe('t-mat');
  });

  it('нет совпадения → рабочая стадия с минимальным order_index', () => {
    const current = stage({ id: 's-kp', name: 'Подготовка КП', order_index: 4 });
    expect(mapStageToPipeline(current, target)?.id).toBe('t-lead');
  });

  it('won → won, lost → lost', () => {
    const won = stage({ id: 's-won', name: 'Выиграна', order_index: 7, is_won: true });
    const lost = stage({ id: 's-lost', name: 'Проиграна', order_index: 8, is_lost: true });
    expect(mapStageToPipeline(won, target)?.id).toBe('t-won');
    expect(mapStageToPipeline(lost, target)?.id).toBe('t-lost');
  });

  it('имя терминальной стадии не матчит рабочую', () => {
    // «Выиграна» есть в цели только как is_won — рабочей с таким именем нет.
    const working = stage({ id: 's-x', name: 'Выиграна', order_index: 2 });
    expect(mapStageToPipeline(working, target)?.id).toBe('t-lead');
  });

  it('current = null → первая рабочая', () => {
    expect(mapStageToPipeline(null, target)?.id).toBe('t-lead');
  });

  it('цель без рабочих стадий → null', () => {
    const terminalOnly = target.filter((s) => s.is_won || s.is_lost);
    expect(mapStageToPipeline(null, terminalOnly)).toBeNull();
    expect(mapStageToPipeline(stage({ id: 's', name: 'Лид', order_index: 1 }), [])).toBeNull();
  });
});

describe('firstWorkingStage', () => {
  it('минимальный order_index среди не-терминальных', () => {
    const stages = [
      stage({ id: 'won', name: 'Выиграна', order_index: 0, is_won: true }),
      stage({ id: 'b', name: 'Б', order_index: 2 }),
      stage({ id: 'a', name: 'А', order_index: 1 }),
    ];
    expect(firstWorkingStage(stages)?.id).toBe('a');
  });
});

describe('pipelineMoveTargets', () => {
  const EMPTY = pipe({ id: 'p-empty', name: 'IIoT Пустая' });
  const pipelines = [PROJECT, EXPERIMENT, EMPTY];
  const stages = [
    stage({ id: 'proj-lead', pipeline_id: 'p-proj', name: 'Лид', order_index: 1 }),
    stage({ id: 'proj-mat', pipeline_id: 'p-proj', name: 'Материалы', order_index: 3 }),
    stage({ id: 'proj-kp', pipeline_id: 'p-proj', name: 'Подготовка КП', order_index: 4 }),
    stage({ id: 'exp-lead', pipeline_id: 'p-exp', name: 'Лид', order_index: 1 }),
    stage({ id: 'exp-mat', pipeline_id: 'p-exp', name: 'Материалы', order_index: 3 }),
    // У «пустой» воронки только терминалы — рабочих стадий нет.
    stage({ id: 'empty-won', pipeline_id: 'p-empty', name: 'Выиграна', order_index: 7, is_won: true }),
  ];
  const current = stages[1]; // «Материалы» проекта

  it('текущая воронка в цели не попадает', () => {
    const ids = pipelineMoveTargets(pipelines, 'p-proj', current, stages).map((t) => t.pipeline.id);
    expect(ids).not.toContain('p-proj');
  });

  it('воронка без рабочих стадий отброшена', () => {
    const ids = pipelineMoveTargets(pipelines, 'p-proj', current, stages).map((t) => t.pipeline.id);
    expect(ids).toEqual(['p-exp']);
  });

  it('стадия цели — по имени: «Материалы» → «Материалы»', () => {
    const [target] = pipelineMoveTargets(pipelines, 'p-proj', current, stages);
    expect(target.stage.id).toBe('exp-mat');
  });

  it('нет пары по имени — первая рабочая цели', () => {
    const [target] = pipelineMoveTargets(pipelines, 'p-proj', stages[2], stages);
    expect(target.stage.id).toBe('exp-lead');
  });
});
