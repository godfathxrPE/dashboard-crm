import { describe, it, expect } from 'vitest';
import {
  splitCompanyProjects,
  countCompany360,
  formatCompany360Summary,
  isTerminalDeal,
  ruPlural,
} from '@/lib/utils/company-360';

// S-R2-CO360 — композиция карточки компании: деление проектов, счётчики, склонение.

describe('splitCompanyProjects', () => {
  it('делит по типу: client → сделки, delivery → внедрения', () => {
    const { deals, deliveries } = splitCompanyProjects([
      { id: 'a', type: 'client', status: 'open' },
      { id: 'b', type: 'delivery', status: 'open' },
      { id: 'c', type: 'client', status: 'won' },
    ]);
    expect(deals.map((d) => d.id)).toEqual(['a', 'c']);
    expect(deliveries.map((d) => d.id)).toEqual(['b']);
  });

  it('internal идёт во внедрения (тот же раздел /projects), а не теряется', () => {
    const { deals, deliveries } = splitCompanyProjects([{ id: 'i', type: 'internal', status: 'open' }]);
    expect(deals).toHaveLength(0);
    expect(deliveries.map((d) => d.id)).toEqual(['i']);
  });

  it('type=null трактуется как сделка (бэкстоп projectHref)', () => {
    const { deals } = splitCompanyProjects([{ id: 'n', type: null, status: 'open' }]);
    expect(deals.map((d) => d.id)).toEqual(['n']);
  });

  it('пустой вход не падает', () => {
    expect(splitCompanyProjects([])).toEqual({ deals: [], deliveries: [] });
  });
});

describe('isTerminalDeal', () => {
  it('won/lost — терминальные, on_hold и open — нет', () => {
    expect(isTerminalDeal('won')).toBe(true);
    expect(isTerminalDeal('lost')).toBe(true);
    expect(isTerminalDeal('on_hold')).toBe(false);
    expect(isTerminalDeal('open')).toBe(false);
    expect(isTerminalDeal(null)).toBe(false);
  });
});

describe('countCompany360', () => {
  it('терминальные сделки входят в общий счётчик, но не в открытые', () => {
    const split = splitCompanyProjects([
      { id: 'a', type: 'client', status: 'won' },
      { id: 'b', type: 'client', status: 'open' },
      { id: 'c', type: 'delivery', status: 'open' },
    ]);
    expect(countCompany360(split, 8)).toEqual({ deals: 2, dealsOpen: 1, deliveries: 1, contacts: 8 });
  });
});

describe('ruPlural', () => {
  const forms: [string, string, string] = ['сделка', 'сделки', 'сделок'];
  it.each([
    [0, 'сделок'],
    [1, 'сделка'],
    [2, 'сделки'],
    [4, 'сделки'],
    [5, 'сделок'],
    [11, 'сделок'],
    [12, 'сделок'],
    [14, 'сделок'],
    [21, 'сделка'],
    [22, 'сделки'],
    [25, 'сделок'],
    [101, 'сделка'],
    [111, 'сделок'],
  ])('%i → %s', (n, expected) => {
    expect(ruPlural(n, forms)).toBe(expected);
  });
});

describe('formatCompany360Summary', () => {
  it('уточняет открытые, когда часть сделок закрыта', () => {
    expect(formatCompany360Summary({ deals: 2, dealsOpen: 1, deliveries: 1, contacts: 8 }))
      .toBe('2 сделки (1 открыта) · 1 внедрение · 8 контактов');
  });

  it('не уточняет, когда открыты все', () => {
    expect(formatCompany360Summary({ deals: 2, dealsOpen: 2, deliveries: 0, contacts: 4 }))
      .toBe('2 сделки · 0 внедрений · 4 контакта');
  });

  it('не уточняет, когда открытых нет', () => {
    expect(formatCompany360Summary({ deals: 1, dealsOpen: 0, deliveries: 1, contacts: 0 }))
      .toBe('1 сделка · 1 внедрение · 0 контактов');
  });

  it('склоняет «открыто» для 5+', () => {
    expect(formatCompany360Summary({ deals: 7, dealsOpen: 5, deliveries: 2, contacts: 21 }))
      .toBe('7 сделок (5 открыто) · 2 внедрения · 21 контакт');
  });
});
