import { describe, test, expect } from 'vitest';
import { contactBelongsToCompany, contactsForCompany } from '@/lib/forms/derive-links';

// Связь контакт↔компания — M:N через junction (`contact.companies[]`).
// Поля `company_id` на контакте НЕТ: попытка фильтровать по нему даёт молчаливо
// пустой список, а не ошибку, — поэтому предикат и живёт в одном месте.
const anton = { id: 'c1', companies: [{ company_id: 'yumi' }] };
const boris = { id: 'c2', companies: [{ company_id: 'stratek' }, { company_id: 'yumi' }] };
const vera = { id: 'c3', companies: [] };
const grigory = { id: 'c4' }; // связи не загружены
const all = [anton, boris, vera, grigory];

describe('contactBelongsToCompany', () => {
  test('находит связь в массиве, в том числе не первую', () => {
    expect(contactBelongsToCompany(anton, 'yumi')).toBe(true);
    expect(contactBelongsToCompany(boris, 'yumi')).toBe(true);
  });

  test('чужая компания / пустые связи / связи не загружены → false', () => {
    expect(contactBelongsToCompany(anton, 'stratek')).toBe(false);
    expect(contactBelongsToCompany(vera, 'yumi')).toBe(false);
    expect(contactBelongsToCompany(grigory, 'yumi')).toBe(false);
  });

  test('без компании принадлежность не определена', () => {
    expect(contactBelongsToCompany(boris, null)).toBe(false);
    expect(contactBelongsToCompany(boris, undefined)).toBe(false);
    expect(contactBelongsToCompany(boris, '')).toBe(false);
  });
});

describe('contactsForCompany', () => {
  test('компания выбрана → только её контакты', () => {
    expect(contactsForCompany(all, 'yumi').map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(contactsForCompany(all, 'stratek').map((c) => c.id)).toEqual(['c2']);
  });

  test('компания НЕ выбрана → все (поведение до спринта сохранено)', () => {
    expect(contactsForCompany(all, null)).toHaveLength(4);
    expect(contactsForCompany(all, undefined)).toHaveLength(4);
  });

  test('у компании нет контактов → пусто, а не «все»', () => {
    // Именно этот случай в UI требует подписи: пустой <select> без неё
    // читается как «не загрузилось».
    expect(contactsForCompany(all, 'unknown')).toEqual([]);
  });

  test('контактов ещё нет (загрузка) → пустой массив, не падение', () => {
    expect(contactsForCompany(null, 'yumi')).toEqual([]);
    expect(contactsForCompany(undefined, null)).toEqual([]);
  });
});
