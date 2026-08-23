import { describe, it, expect } from 'vitest';
import {
  buildStageStory,
  revisitedStageIds,
  visitCount,
  type StageTransitionRow,
} from '@/lib/domain/stage-story';
import { stageTimeGauge } from '@/lib/domain/stage-norm';

// «Сейчас» фиксировано: функция принимает now параметром именно затем, чтобы тест
// не зависел от часов машины (урок S-LEAD-HUB-2b — leadStaleness читала Date.now()
// мимо переданного времени, и тест этого не ловил).
const NOW = new Date('2026-08-23T12:00:00Z');

const NAMES: Record<string, string> = {
  s1: 'Квалификация',
  s2: 'Проработка',
  s3: 'Согласование',
};
const stageName = (id: string) => NAMES[id] ?? '—';

/** ISO-метка со сдвигом в днях от NOW (отрицательный сдвиг — в прошлое). */
function at(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * 86400000).toISOString();
}

function row(patch: Partial<StageTransitionRow> & { to_stage_id: string }): StageTransitionRow {
  return {
    id: `${patch.to_stage_id}-${patch.changed_at ?? ''}`,
    from_stage_id: null,
    changed_by: null,
    changed_at: at(0),
    ...patch,
  };
}

describe('buildStageStory', () => {
  it('пустой журнал: один открытый сегмент от создания на текущей стадии', () => {
    const story = buildStageStory([], {
      createdAt: at(-10),
      currentStageId: 's1',
      stageName,
      now: NOW,
    });

    expect(story.segments).toHaveLength(1);
    expect(story.segments[0]).toMatchObject({
      stageId: 's1',
      stageName: 'Квалификация',
      enteredAt: at(-10),
      leftAt: null,
      days: 10,
      fromCreation: true,
      isRevisit: false,
    });
    expect(story.revisits).toBe(0);
    expect(story.totalByStage).toEqual({ s1: 10 });
    expect(story.ageDays).toBe(10);
  });

  it('стадии нет вовсе — сегментов ноль, а не сегмент «—»', () => {
    const story = buildStageStory([], {
      createdAt: at(-10),
      currentStageId: null,
      stageName,
      now: NOW,
    });
    expect(story.segments).toEqual([]);
    expect(story.totalByStage).toEqual({});
  });

  it('три перехода без возвратов: 4 сегмента, первый от создания, сумма по стадиям', () => {
    const rows = [
      row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: at(-20), changed_by: 'u1' }),
      row({ from_stage_id: 's2', to_stage_id: 's3', changed_at: at(-12), changed_by: 'u1' }),
      row({ from_stage_id: 's3', to_stage_id: 's1', changed_at: at(-5), changed_by: 'u2' }),
    ];
    // Возврат в s1 — это возврат, поэтому для «без возвратов» третий переход ведёт
    // в новую стадию: подменяем словарь на четыре стадии.
    rows[2] = row({ from_stage_id: 's3', to_stage_id: 's4', changed_at: at(-5), changed_by: 'u2' });

    const story = buildStageStory(rows, {
      createdAt: at(-30),
      currentStageId: 's4',
      stageName,
      now: NOW,
    });

    expect(story.segments.map((s) => s.stageId)).toEqual(['s1', 's2', 's3', 's4']);
    expect(story.segments[0]).toMatchObject({ fromCreation: true, days: 10, actorId: null });
    expect(story.segments[1]).toMatchObject({ fromCreation: false, days: 8, actorId: 'u1' });
    expect(story.segments[2]).toMatchObject({ days: 7, actorId: 'u1' });
    expect(story.segments[3]).toMatchObject({ days: 5, leftAt: null, actorId: 'u2' });
    expect(story.revisits).toBe(0);
    expect(story.totalByStage).toEqual({ s1: 10, s2: 8, s3: 7, s4: 5 });
    // Стадия вне словаря: расчёт не падает, имя — прочерк.
    expect(story.segments[3].stageName).toBe('—');

    // Сумма сегментов сходится с возрастом сделки — критерий «расчёт не разъехался»
    // из смока. Сходится СНИЗУ: каждый сегмент округляется floor'ом по отдельности,
    // и на каждой границе теряется остаток суток. На выровненных по суткам метках
    // потерь нет, поэтому здесь равенство, а инвариант в общем виде — ниже.
    const sum = story.segments.reduce((acc, s) => acc + s.days, 0);
    expect(sum).toBe(story.ageDays);
  });

  it('сумма сегментов не превышает возраст сделки и отстаёт не больше, чем на число границ', () => {
    // Метки НЕ выровнены по суткам — именно здесь floor по сегментам теряет остатки.
    const rows = [
      row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: '2026-08-03T19:40:00Z' }),
      row({ from_stage_id: 's2', to_stage_id: 's3', changed_at: '2026-08-09T05:10:00Z' }),
    ];
    const story = buildStageStory(rows, {
      createdAt: '2026-07-30T08:20:00Z',
      currentStageId: 's3',
      stageName,
      now: NOW,
    });

    const sum = story.segments.reduce((acc, s) => acc + s.days, 0);
    expect(sum).toBeLessThanOrEqual(story.ageDays);
    expect(story.ageDays - sum).toBeLessThanOrEqual(story.segments.length - 1);
  });

  it('возврат в пройденную стадию: isRevisit, счётчик и суммарное время', () => {
    const rows = [
      row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: at(-20) }),
      row({ from_stage_id: 's2', to_stage_id: 's3', changed_at: at(-14) }),
      row({ from_stage_id: 's3', to_stage_id: 's2', changed_at: at(-9) }),
    ];

    const story = buildStageStory(rows, {
      createdAt: at(-30),
      currentStageId: 's2',
      stageName,
      now: NOW,
    });

    expect(story.segments.map((s) => s.stageId)).toEqual(['s1', 's2', 's3', 's2']);
    expect(story.segments[1].isRevisit).toBe(false);
    expect(story.segments[3].isRevisit).toBe(true);
    expect(story.revisits).toBe(1);
    // 6 дней первый заход (−20 → −14) + 9 дней второй (−9 → now).
    expect(story.totalByStage.s2).toBe(6 + 9);
    expect(revisitedStageIds(story)).toEqual(new Set(['s2']));
    expect(visitCount(story, 's2')).toBe(2);
    expect(visitCount(story, 's3')).toBe(1);
  });

  it('последний сегмент открыт: days считается до now', () => {
    const rows = [row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: at(-3) })];
    const story = buildStageStory(rows, {
      createdAt: at(-11),
      currentStageId: 's2',
      stageName,
      now: NOW,
    });

    const last = story.segments[story.segments.length - 1];
    expect(last.leftAt).toBeNull();
    expect(last.days).toBe(3);
    expect(story.segments[0].leftAt).toBe(at(-3));
  });

  it('порядок строк на входе не важен — сортировка внутри домена', () => {
    const rows = [
      row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: at(-20) }),
      row({ from_stage_id: 's2', to_stage_id: 's3', changed_at: at(-14) }),
      row({ from_stage_id: 's3', to_stage_id: 's2', changed_at: at(-9) }),
    ];
    const opts = { createdAt: at(-30), currentStageId: 's2', stageName, now: NOW } as const;

    const forward = buildStageStory(rows, opts);
    const reversed = buildStageStory([...rows].reverse(), opts);

    expect(reversed).toEqual(forward);
  });

  it('неизвестный stage_id → имя «—», расчёт не падает', () => {
    const rows = [row({ from_stage_id: 'ghost', to_stage_id: 's1', changed_at: at(-4) })];
    const story = buildStageStory(rows, {
      createdAt: at(-9),
      currentStageId: 's1',
      stageName,
      now: NOW,
    });

    expect(story.segments[0].stageName).toBe('—');
    expect(story.segments[0].days).toBe(5);
    expect(story.segments[1].stageName).toBe('Квалификация');
  });

  it('граница суток: floor тот же, что у stageTimeGauge — сводка и датчик не расходятся', () => {
    // Переход в 23:50, «сейчас» — 00:10 следующих суток: календарный день сменился,
    // а суток не прошло. Обе величины обязаны сказать 0.
    const enteredAt = '2026-08-22T23:50:00Z';
    const now = new Date('2026-08-23T00:10:00Z');

    const story = buildStageStory(
      [row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: enteredAt })],
      { createdAt: '2026-08-01T09:00:00Z', currentStageId: 's2', stageName, now },
    );
    const open = story.segments[story.segments.length - 1];
    const gauge = stageTimeGauge(enteredAt, 21, now);

    expect(open.days).toBe(0);
    expect(open.days).toBe(gauge.days);

    // И симметрично на другой стороне границы: ровно через сутки обе дают 1.
    const later = new Date('2026-08-23T23:55:00Z');
    const story2 = buildStageStory(
      [row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: enteredAt })],
      { createdAt: '2026-08-01T09:00:00Z', currentStageId: 's2', stageName, now: later },
    );
    const open2 = story2.segments[story2.segments.length - 1];
    expect(open2.days).toBe(stageTimeGauge(enteredAt, 21, later).days);
    expect(open2.days).toBe(1);
  });

  it('битая метка времени в журнале не роняет расчёт — строка отбрасывается', () => {
    const rows = [
      row({ from_stage_id: 's1', to_stage_id: 's2', changed_at: at(-6) }),
      row({ to_stage_id: 's3', changed_at: 'не дата' }),
    ];
    const story = buildStageStory(rows, {
      createdAt: at(-12),
      currentStageId: 's2',
      stageName,
      now: NOW,
    });
    expect(story.segments.map((s) => s.stageId)).toEqual(['s1', 's2']);
  });
});
