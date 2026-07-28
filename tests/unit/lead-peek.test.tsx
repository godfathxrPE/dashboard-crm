import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LeadPeekContent } from '@/components/leads/LeadPeekContent';
import type { Lead } from '@/types/database';

// leadStaleness считает от Date.now() — фиксируем «сегодня», иначе тест плывёт.
const NOW = new Date('2026-07-28T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
afterEach(cleanup);

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l-1',
    user_id: 'u-1',
    org_id: 'o-1',
    title: 'Завод «Прогресс» — ERP',
    source: 'website',
    status: 'new',
    direction: 'erp',
    company_name_raw: 'Прогресс',
    contact_name_raw: 'Иван Петров',
    phone: '79161234567',
    email: 'ivan@progress.ru',
    notes: null,
    disqualify_reason: null,
    converted_deal_id: null,
    converted_company_id: null,
    converted_contact_id: null,
    converted_at: null,
    created_at: daysAgo(0),
    updated_at: daysAgo(0),
    ...over,
  };
}

describe('LeadPeekContent — состав', () => {
  it('статус, источник и направление — человеческими подписями', () => {
    render(<LeadPeekContent lead={makeLead()} />);
    expect(screen.getByText('Новый')).toBeInTheDocument();
    expect(screen.getByText('Сайт')).toBeInTheDocument();
    expect(screen.getByText('ERP')).toBeInTheDocument();
  });

  it('телефон и почта — кликабельные ссылки', () => {
    render(<LeadPeekContent lead={makeLead()} />);
    expect(screen.getByText('+7 (916) 123-45-67').closest('a')).toHaveAttribute('href', 'tel:79161234567');
    expect(screen.getByText('ivan@progress.ru').closest('a')).toHaveAttribute('href', 'mailto:ivan@progress.ru');
  });

  it('лид без телефона и почты — общий фолбэк', () => {
    render(<LeadPeekContent lead={makeLead({
      phone: null, email: null, company_name_raw: null, contact_name_raw: null,
    })} />);
    expect(screen.getByText('Данные не заполнены')).toBeInTheDocument();
  });

  it('причина дисквалификации — человеческой формулировкой', () => {
    render(<LeadPeekContent lead={makeLead({ status: 'disqualified', disqualify_reason: 'no_budget' })} />);
    expect(screen.getByText('Нет бюджета')).toBeInTheDocument();
  });
});

describe('LeadPeekContent — возраст (leadStaleness)', () => {
  it('свежий лид метку возраста не показывает', () => {
    render(<LeadPeekContent lead={makeLead({ created_at: daysAgo(0) })} />);
    expect(screen.queryByText(/дн\./)).not.toBeInTheDocument();
  });

  it('new старше суток — метка с числом дней и подписью про первое касание', () => {
    render(<LeadPeekContent lead={makeLead({ created_at: daysAgo(5) })} />);
    const badge = screen.getByText(/5 дн\./);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'Дней без первого касания');
  });

  it('contacted считает от updated_at и объясняет это в title', () => {
    render(<LeadPeekContent lead={makeLead({
      status: 'contacted', created_at: daysAgo(30), updated_at: daysAgo(10),
    })} />);
    const badge = screen.getByText(/10 дн\./);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'Дней без движения');
  });
});
