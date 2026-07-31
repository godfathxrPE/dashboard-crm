import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  splitCompanyProjects, countCompany360, formatCompany360Summary,
} from '@/lib/utils/company-360';
import type { CompanyRow } from '@/components/companies/CompaniesTable';

// ─── моки границ: кеш проектов и настройки org ───
// Панель не делает своих запросов — берёт тот же кеш `useProjects()`, что таблица.
const PROJECTS = [
  { id: 'p-1', name: 'ERP внедрение', company_id: 'c-1', type: 'client', status: 'open',
    budget: 250_000_000, next_step: 'Созвон', next_action_date: '2999-01-01' },
  { id: 'p-2', name: 'Старая сделка', company_id: 'c-1', type: 'client', status: 'won',
    budget: 100_000_000, next_step: null, next_action_date: null },
  { id: 'p-3', name: 'Запуск линии', company_id: 'c-1', type: 'delivery', status: 'open',
    budget: null, next_step: null, next_action_date: null },
  { id: 'p-4', name: 'Чужая сделка', company_id: 'c-2', type: 'client', status: 'open',
    budget: 500_000_000, next_step: null, next_action_date: null },
];

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/hooks/use-projects', () => ({ useProjects: () => ({ data: PROJECTS }) }));
vi.mock('@/lib/hooks/use-org-settings', () => ({ useReconnectDays: () => 14 }));

import { CompanyPeekContent } from '@/components/companies/CompanyPeekContent';

afterEach(cleanup);

function makeCompany(over: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: 'c-1',
    name: 'Ромашка',
    inn: '7701234567',
    industry: 'Пищевое производство',
    website: 'romashka.ru',
    phone: '79161234567',
    phones: [],
    email: 'info@romashka.ru',
    address: null,
    notes: null,
    owner_id: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    contacts_count: 8,
    projects_count: 3,
    pipeline_budget: 250_000_000,
    last_touch: null,
    ...over,
  } as CompanyRow;
}

describe('CompanyPeekContent — сводка 360', () => {
  it('строка сводки совпадает с formatCompany360Summary на тех же counts', () => {
    render(<CompanyPeekContent company={makeCompany()} />);

    const linked = PROJECTS.filter((p) => p.company_id === 'c-1');
    const expected = formatCompany360Summary(countCompany360(splitCompanyProjects(linked), 8));

    expect(expected).toBe('2 сделки (1 открыта) · 1 внедрение · 8 контактов');
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('контакты берутся из строки таблицы, а не из своего запроса', () => {
    // В company контактов 3 — панель обязана показать это число, каким бы ни был
    // список контактов в кеше (второго источника истины у неё нет).
    render(<CompanyPeekContent company={makeCompany({ contacts_count: 3 })} />);
    expect(screen.getByText(/3 контакта/)).toBeInTheDocument();
  });

  it('показывает только открытые сделки компании, чужие не попадают', () => {
    render(<CompanyPeekContent company={makeCompany()} />);
    expect(screen.getByText('ERP внедрение')).toBeInTheDocument();
    expect(screen.queryByText('Старая сделка')).not.toBeInTheDocument();  // won
    expect(screen.queryByText('Запуск линии')).not.toBeInTheDocument();   // внедрение
    expect(screen.queryByText('Чужая сделка')).not.toBeInTheDocument();   // другая компания
  });
});

describe('CompanyPeekContent — фолбэки', () => {
  // S-R2-FIX-1: было «Без открытых сделок» — читалось как отрицание строки-сводки
  // над ним («1 сделка · 1 внедрение»). Блок про деньги говорит про деньги.
  it('нулевой pipeline пишется суммой, а не отрицанием сводки', () => {
    render(<CompanyPeekContent company={makeCompany({ pipeline_budget: 0 })} />);
    expect(screen.getByText('0 ₽ в открытых сделках')).toBeInTheDocument();
    expect(screen.queryByText(/^без открытых сделок$/i)).not.toBeInTheDocument();
  });

  it('пустые реквизиты дают один общий фолбэк', () => {
    render(<CompanyPeekContent company={makeCompany({
      inn: null, industry: null, phone: null, phones: [], email: null, website: null,
    })} />);
    expect(screen.getByText('Нет контактных данных')).toBeInTheDocument();
  });

  it('касаний не было — так и написано', () => {
    render(<CompanyPeekContent company={makeCompany({ last_touch: null })} />);
    expect(screen.getByText('Касаний не было')).toBeInTheDocument();
  });
});
