import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════
// FIX S-TL-1-RPC-THIS: вызов `supabase.rpc` не должен терять `this`.
//
// `tests/unit/timeline-rpc-adapter.test.ts` покрывал чистый адаптер и был зелёным,
// пока лента лежала: дефект жил не в разборе строки, а в САМОМ вызове —
// `const rpc = supabase.rpc` отрывал метод от клиента, и он бросал TypeError ещё
// до сети. Поэтому фейковый клиент здесь ведёт себя как настоящий supabase-js:
// читает `this.rest` и падает на оторванном вызове.
//
// Второй тест закрывает вторую половину дефекта: React Query ловит бросок из
// queryFn молча, и без отдельной ветки ошибки экран показывал бы «Пока нет
// активности» — состояние, неотличимое от исправной пустой ленты.
// ═══════════════════════════════════════════════════════

/** Ссылочный маркер: подменить его нечем, сравнение по `===` не обманешь. */
const REST = { marker: 'rest' } as const;

type RpcResult = { data: unknown; error: { message: string } | null };

/** Что фейковый `rpc` отдаёт, если его позвали правильно (методом). */
let rpcResult: RpcResult = { data: [], error: null };
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

const fakeClient = {
  rest: REST,
  rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
    // Ровно то, что делает supabase-js: метод читает состояние клиента через
    // `this`. Оторванный вызов приходит сюда с `this === undefined`.
    if (!this || (this as { rest?: unknown }).rest !== REST) {
      throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    }
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResult);
  },
};

vi.mock('@/lib/supabase/client', () => ({ createClient: () => fakeClient }));
vi.mock('@/lib/hooks/use-team-members', () => ({
  useTeamMembers: () => ({ data: [{ id: 'u-1', full_name: 'Аня Петрова' }] }),
}));

import { EntityTimeline } from '@/components/shared/EntityTimeline';

const MEETING_ID = '11111111-1111-1111-1111-111111111111';

/** Одна валидная строка RPC — форма из `entity_timeline` (миграция 112). */
const ROW = {
  ts: '2026-08-06T09:00:00.000Z',
  id: `meeting:${MEETING_ID}`,
  source: 'meetings',
  kind: 'meeting',
  actor_id: 'u-1',
  ref_type: 'meeting',
  ref_id: MEETING_ID,
  payload: { title: 'Фитнес Десерты', next_step: null, notes: null },
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EntityTimeline entityType="company" entityId="c-1" options={{ includeSystem: true }} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  rpcCalls.length = 0;
  rpcResult = { data: [], error: null };
});

describe('useEntityTimeline — вызов RPC', () => {
  it('зовёт entity_timeline методом клиента: событие доезжает до ленты', async () => {
    rpcResult = { data: [ROW], error: null };
    setup();

    // Если бы хук звал оторванный `rpc`, TypeError улетел бы в queryFn, React Query
    // проглотил бы его молча, и здесь стояло бы «Пока нет активности».
    expect(await screen.findByText('Встреча: Фитнес Десерты')).toBeInTheDocument();
    expect(screen.queryByText('Пока нет активности')).not.toBeInTheDocument();

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('entity_timeline');
    expect(rpcCalls[0].args).toMatchObject({ p_entity_type: 'company', p_entity_id: 'c-1' });
  });

  it('пустой ответ — это «нет активности», а не ошибка', async () => {
    rpcResult = { data: [], error: null };
    setup();

    expect(await screen.findByText('Пока нет активности')).toBeInTheDocument();
    expect(
      screen.queryByText('Не удалось загрузить активность. Обновите страницу.'),
    ).not.toBeInTheDocument();
  });

  it('ошибка RPC видна на экране, а не маскируется пустым состоянием', async () => {
    rpcResult = { data: null, error: { message: 'permission denied' } };
    setup();

    await waitFor(() =>
      expect(
        screen.getByText('Не удалось загрузить активность. Обновите страницу.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Пока нет активности')).not.toBeInTheDocument();
  });
});
