import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── моки границ: команда орга, supabase RPC, тосты ───
const rpcMock = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

vi.mock('@/lib/hooks/use-team-members', () => ({
  useTeamMembers: () => ({
    data: [
      { id: 'u-1', full_name: 'Аня Петрова', avatar_url: null, role: 'member' },
      { id: 'u-2', full_name: 'Борис Ким', avatar_url: null, role: 'member' },
    ],
  }),
}));

import { SpawnWizard } from '@/components/projects/SpawnWizard';

afterEach(cleanup);
beforeEach(() => {
  rpcMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

function setup(props: Partial<Parameters<typeof SpawnWizard>[0]> = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SpawnWizard
        dealId="deal-1"
        dealDirection="iiot"
        defaultOwnerId="u-1"
        onCreated={onCreated}
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onCreated, onClose };
}

describe('SpawnWizard — контур (шаг 1)', () => {
  it('показывает обе опции контура', () => {
    setup();
    expect(screen.getByText('Создать внедрение')).toBeInTheDocument();
    expect(screen.getByText('Пока не создавать')).toBeInTheDocument();
  });

  it('«Пока не создавать» закрывает без создания', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('Пока не создавать'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('«Создать внедрение» ведёт на форму (шаблон + РП)', () => {
    setup();
    fireEvent.click(screen.getByText('Создать внедрение'));
    expect(screen.getByText('Шаблон внедрения')).toBeInTheDocument();
    expect(screen.getByText('Руководитель проекта')).toBeInTheDocument();
  });
});

describe('SpawnWizard — шаблон по direction', () => {
  it('iiot: launch + experiment', () => {
    setup({ dealDirection: 'iiot' });
    fireEvent.click(screen.getByText('Создать внедрение'));
    expect(screen.getByText('Полный запуск')).toBeInTheDocument();
    expect(screen.getByText('Эксперимент')).toBeInTheDocument();
  });

  it('erp: только один шаблон, «(6 этапов)»', () => {
    setup({ dealDirection: 'erp' });
    fireEvent.click(screen.getByText('Создать внедрение'));
    expect(screen.getByText('Внедрение (6 этапов)')).toBeInTheDocument();
    expect(screen.queryByText('Эксперимент')).not.toBeInTheDocument();
  });
});

describe('SpawnWizard — создание', () => {
  it('зовёт RPC с owner и делегирует onCreated при успехе', async () => {
    rpcMock.mockResolvedValue({ data: 'new-proj-id', error: null });
    const { onCreated } = setup({ dealDirection: 'iiot', defaultOwnerId: 'u-1' });
    fireEvent.click(screen.getByText('Создать внедрение'));
    fireEvent.click(screen.getByRole('button', { name: /Создать внедрение/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-proj-id'));
    expect(rpcMock).toHaveBeenCalledWith('spawn_delivery_project', {
      p_deal_id: 'deal-1',
      p_kind: 'launch',
      p_template_id: null,
      p_owner_id: 'u-1',
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('дефолтный owner null → p_owner_id: null (RPC подставит COALESCE)', async () => {
    rpcMock.mockResolvedValue({ data: 'x', error: null });
    setup({ defaultOwnerId: null });
    fireEvent.click(screen.getByText('Создать внедрение'));
    fireEvent.click(screen.getByRole('button', { name: /Создать внедрение/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_owner_id: null });
  });

  it('ошибка 42501 → тост, onCreated не зовётся', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    const { onCreated } = setup();
    fireEvent.click(screen.getByText('Создать внедрение'));
    fireEvent.click(screen.getByRole('button', { name: /Создать внедрение/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
  });
});
