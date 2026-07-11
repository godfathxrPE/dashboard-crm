import { describe, test, expect } from 'vitest';
import { projectHref } from '@/lib/utils/project-href';

describe('projectHref — routing-контракт delivery P1', () => {
  const id = 'a0000000-0000-4000-8000-000000000001';

  test('client → /deals/[id]', () => {
    expect(projectHref({ id, type: 'client' })).toBe(`/deals/${id}`);
  });

  test('delivery → /projects/[id]', () => {
    expect(projectHref({ id, type: 'delivery' })).toBe(`/projects/${id}`);
  });

  test('internal → /projects/[id]', () => {
    expect(projectHref({ id, type: 'internal' })).toBe(`/projects/${id}`);
  });

  test('type отсутствует → /deals/[id] (бэкстоп для deep-links без типа)', () => {
    expect(projectHref({ id })).toBe(`/deals/${id}`);
    expect(projectHref({ id, type: null })).toBe(`/deals/${id}`);
  });

  test('неизвестный type → /projects/[id]', () => {
    expect(projectHref({ id, type: 'unknown' })).toBe(`/projects/${id}`);
  });
});