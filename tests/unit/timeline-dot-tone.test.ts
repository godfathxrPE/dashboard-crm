import { describe, test, expect } from 'vitest';
import { timelineDotTone } from '@/lib/timeline/dot-tone';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

function ev(kind: TimelineKind, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: `${kind}:1`, kind, title: 't', date: '2026-09-01T10:00:00Z',
    sourceId: '1', icon: kind, ...extra,
  };
}

describe('timelineDotTone', () => {
  test('звонок и встреча — касание', () => {
    expect(timelineDotTone(ev('call'))).toBe('touch');
    expect(timelineDotTone(ev('meeting'))).toBe('touch');
  });

  test('правка бюджета — деньги', () => {
    expect(
      timelineDotTone(ev('activity', { eventType: 'project_updated', changes: { budget: { from: '1', to: '2' } } })),
    ).toBe('money');
  });

  test('правка шага — нейтраль', () => {
    expect(
      timelineDotTone(ev('activity', { eventType: 'project_updated', changes: { next_step: { from: 'a', to: 'b' } } })),
    ).toBe('neutral');
  });

  test('задача и AI — нейтраль', () => {
    expect(timelineDotTone(ev('task'))).toBe('neutral');
    expect(timelineDotTone(ev('ai_run'))).toBe('neutral');
  });
});
