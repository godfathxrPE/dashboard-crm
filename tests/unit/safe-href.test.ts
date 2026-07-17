import { describe, test, expect } from 'vitest';
import { safeHref } from '@/lib/utils/safe-href';

describe('safeHref', () => {
  test('http/https проходят как есть', () => {
    expect(safeHref('http://example.com/x')).toBe('http://example.com/x');
    expect(safeHref('https://1c-do.ru/project/42')).toBe('https://1c-do.ru/project/42');
  });

  test('регистр схемы не важен', () => {
    expect(safeHref('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  test('опасные схемы → undefined', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('  javascript:alert(1)')).toBeUndefined(); // с ведущими пробелами
    expect(safeHref('JavaScript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined();
  });

  test('голый домен без схемы → https', () => {
    expect(safeHref('example.com')).toBe('https://example.com');
    expect(safeHref('sub.example.com/path?q=1')).toBe('https://sub.example.com/path?q=1');
  });

  test('mailto/tel проходят', () => {
    expect(safeHref('mailto:sales@example.com')).toBe('mailto:sales@example.com');
    expect(safeHref('tel:+79991234567')).toBe('tel:+79991234567');
  });

  test('пустое/null/undefined/мусор → undefined', () => {
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
    expect(safeHref('   ')).toBeUndefined();
    expect(safeHref('просто текст')).toBeUndefined();
  });
});
