import { describe, test, expect } from 'vitest';
import { autoDetectMapping } from '@/lib/utils/import-helpers';

describe('autoDetectMapping', () => {
  test('Book1 headers', () => {
    expect(autoDetectMapping('Название')).toBe('companyName');
    expect(autoDetectMapping('ИНН')).toBe('inn');
    expect(autoDetectMapping('Точное название')).toBe('exactName');
    expect(autoDetectMapping('Контакты')).toBe('contactName');
    expect(autoDetectMapping('Почта')).toBe('email');
    expect(autoDetectMapping('Сайт')).toBe('website');
    expect(autoDetectMapping('Менеджер')).toBe('skip');
    expect(autoDetectMapping('должность')).toBe('position');
    expect(autoDetectMapping('телефон')).toBe('phone');
  });

  test('Book2 headers', () => {
    expect(autoDetectMapping('почта')).toBe('email');
    expect(autoDetectMapping('Имя')).toBe('contactName');
    expect(autoDetectMapping('Комментарий (занято, запросил, направление передано)')).toBe('notes');
  });

  test('edge cases', () => {
    expect(autoDetectMapping('E-mail адрес')).toBe('email');
    expect(autoDetectMapping('ФИО контакта')).toBe('contactName');
    expect(autoDetectMapping('Неизвестная колонка')).toBe('skip');
  });

  test('extended keywords', () => {
    expect(autoDetectMapping('организация')).toBe('companyName');
    expect(autoDetectMapping('мобильный')).toBe('phone');
    expect(autoDetectMapping('контактное лицо')).toBe('contactName');
    expect(autoDetectMapping('ответственный')).toBe('skip');
    expect(autoDetectMapping('примечание')).toBe('notes');
    expect(autoDetectMapping('web-сайт')).toBe('website');
    expect(autoDetectMapping('position')).toBe('position');
  });
});
