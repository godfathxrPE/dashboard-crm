import { describe, test, expect } from 'vitest';
import { pluralRu, pluralProblems } from '@/lib/utils/plural';

describe('pluralRu', () => {
  test('1/2/5/11/21 — базовое русское склонение', () => {
    expect(pluralRu(1, 'один', 'два', 'много')).toBe('один');
    expect(pluralRu(2, 'один', 'два', 'много')).toBe('два');
    expect(pluralRu(5, 'один', 'два', 'много')).toBe('много');
    expect(pluralRu(11, 'один', 'два', 'много')).toBe('много');
    expect(pluralRu(21, 'один', 'два', 'много')).toBe('один');
  });
});

describe('pluralProblems', () => {
  test('1 → помеха', () => {
    expect(pluralProblems(1)).toBe('помеха');
  });
  test('2 → помехи', () => {
    expect(pluralProblems(2)).toBe('помехи');
  });
  test('5 → помех', () => {
    expect(pluralProblems(5)).toBe('помех');
  });
  test('11 → помех (исключение 11–19)', () => {
    expect(pluralProblems(11)).toBe('помех');
  });
  test('21 → помеха', () => {
    expect(pluralProblems(21)).toBe('помеха');
  });
});
