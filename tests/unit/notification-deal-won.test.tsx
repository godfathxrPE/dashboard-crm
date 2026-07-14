import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const pushMock = vi.fn();
const markReadMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

let mockNotifications: unknown[] = [];
vi.mock('@/lib/hooks/use-notifications', () => ({
  useNotifications: () => ({ data: mockNotifications }),
  useUnreadCount: () => mockNotifications.filter((n) => (n as { read_at: unknown }).read_at === null).length,
  useMarkRead: () => ({ mutate: markReadMock }),
  useMarkAllRead: () => ({ mutate: vi.fn() }),
}));

import { NotificationBell } from '@/components/layout/NotificationBell';

function notif(over: Record<string, unknown>) {
  return {
    id: 'n1', org_id: 'o1', recipient_id: 'u1', actor_id: 'u1',
    type: 'deal_won', entity_type: 'projects', entity_id: 'deal-99',
    payload: { title: 'Завод Атлант' }, read_at: null,
    created_at: '2026-07-14T10:00:00Z',
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  pushMock.mockReset();
  markReadMock.mockReset();
  mockNotifications = [];
});

function openBell() {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: 'Уведомления' }));
}

describe('NotificationBell — deal_won (S-WON-AUTO-1)', () => {
  it('рендерит actionable CTA-строку с именем сделки', () => {
    mockNotifications = [notif({})];
    openBell();
    expect(
      screen.getByText('Сделка «Завод Атлант» выиграна — создайте внедрение'),
    ).toBeInTheDocument();
    // саб-лейбл типа
    expect(screen.getByText(/Сделка выиграна ·/)).toBeInTheDocument();
  });

  it('без title в payload — дефолтная CTA-строка', () => {
    mockNotifications = [notif({ payload: {} })];
    openBell();
    expect(screen.getByText('Сделка выиграна — создайте внедрение')).toBeInTheDocument();
  });

  it('клик ведёт на сделку /deals/{entity_id} и метит прочитанным', () => {
    mockNotifications = [notif({})];
    openBell();
    fireEvent.click(screen.getByText(/создайте внедрение/));
    expect(markReadMock).toHaveBeenCalledWith('n1');
    expect(pushMock).toHaveBeenCalledWith('/deals/deal-99');
  });

  it('регрессия: task_assigned по-прежнему ведёт на /tasks', () => {
    mockNotifications = [
      notif({ id: 'n2', type: 'task_assigned', entity_type: 'tasks', entity_id: 't-1', payload: { title: 'Позвонить' } }),
    ];
    openBell();
    fireEvent.click(screen.getByText('Позвонить'));
    expect(pushMock).toHaveBeenCalledWith('/tasks');
  });
});
