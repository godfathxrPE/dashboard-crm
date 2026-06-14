import { describe, test, expect } from 'vitest';
import { parseFullName } from '@/lib/utils/import-helpers';

describe('parseFullName', () => {
  test('одно имя', () => {
    expect(parseFullName('Светлана')).toEqual({ firstName: 'Светлана', lastName: '' });
  });

  test('фамилия + имя', () => {
    expect(parseFullName('Башарова Найля')).toEqual({ firstName: 'Найля', lastName: 'Башарова' });
  });

  test('фамилия + имя + отчество', () => {
    const result = parseFullName('Зобова Мария Аркадьевна');
    expect(result.firstName).toBe('Мария');
    expect(result.lastName).toBe('Зобова');
  });

  test('пустая строка', () => {
    expect(parseFullName('')).toEqual({ firstName: '', lastName: '' });
  });

  test('пробелы вокруг', () => {
    expect(parseFullName('  Андрей  ')).toEqual({ firstName: 'Андрей', lastName: '' });
  });

  test('множественные пробелы между словами', () => {
    expect(parseFullName('Иванов   Иван')).toEqual({ firstName: 'Иван', lastName: 'Иванов' });
  });
});
