import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════
// S-TL-3: фильтр по видам — это ЗАПРОС, а не срез загруженного.
//
// Главный дефект спринта (ветка отдаёт строки, которые внешняя отсечка выбросит,
// страница выходит короче лимита, и пагинация встаёт на живом хвосте) живёт в SQL
// и юнит-тестом не воспроизводится: при короткой странице остановка КОРРЕКТНА.
// Он проверяется SQL-сценарием на гейте (см. `_analysis/sprint-S-TL-3.md`).
//
// Здесь — то, что проверяемо на клиенте и ломается так же молча:
//   1. выбранный вид доезжает до RPC (а `all` уходит как `null`);
//   2. набор видов входит в queryKey — иначе React Query отдаст чужой кеш;
//   3. смена вида начинает ленту с ПЕРВОЙ страницы, а не с чужого курсора.
// ═══════════════════════════════════════════════════════

/** Ссылочный маркер: фейковый клиент падает на оторванном вызове, как supabase-js. */
const REST = { marker: 'rest' } as const;

type RpcArgs = {
  p_entity_type: string;
  p_entity_id: string;
  p_before: string | null;
  p_before_id: string | null;
  p_limit: number;
  p_kinds: string[] | null;
};

const rpcCalls: RpcArgs[] = [];
/** Ответ по набору видов: ключ — `p_kinds` в виде строки, `all` для null. */
let respond: (args: RpcArgs) => unknown[] = () => [];

const fakeClient = {
  rest: REST,
  rpc(fn: string, args: RpcArgs): Promise<{ data: unknown; error: null }> {
    if (!this || (this as { rest?: unknown }).rest !== REST) {
      throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    }
    rpcCalls.push(args);
    return Promise.resolve({ data: respond(args), error: null });
  },
};

vi.mock('@/lib/supabase/client', () => ({ createClient: () => fakeClient }));
vi.mock('@/lib/hooks/use-team-members', () => ({
  useTeamMembers: () => ({ data: [] }),
}));

import { EntityTimeline } from '@/components/shared/EntityTimeline';
import { TIMELINE_PAGE_SIZE } from '@/lib/timeline/cursor';

const uuid = (n: number) => `0000000${(n % 10)}-1111-2222-3333-${String(n).padStart(12, '0')}`;

/** Строка RPC в форме `entity_timeline`. `ts` одинаков у всех — блок ничьих. */
function taskRow(n: number) {
  return {
    ts: '2026-07-12T17:43:03.178164Z',
    id: `task:${uuid(n)}`,
    source: 'tasks',
    kind: 'task',
    actor_id: null,
    ref_type: 'task',
    ref_id: uuid(n),
    payload: { text: `Задача ${n}`, lane: null, deadline: null, created_at: '2026-07-12T17:43:03.178164Z' },
  };
}

function callRow(n: number) {
  return {
    ts: '2026-07-11T10:00:00.000Z',
    id: `call:${uuid(n)}`,
    source: 'calls',
    kind: 'call',
    actor_id: null,
    ref_type: 'call',
    ref_id: uuid(n),
    payload: { status: 'done', next_step: null, agreements: null },
  };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <EntityTimeline entityType="project" entityId="p-1" />
      </QueryClientProvider>,
    ),
  };
}

afterEach(cleanup);
beforeEach(() => {
  rpcCalls.length = 0;
  respond = () => [];
});

describe('S-TL-3 — виды уходят в RPC', () => {
  it('«Все» отправляет p_kinds = null, а не список видов', async () => {
    respond = () => [callRow(1)];
    setup();

    await screen.findByText('Звонок выполнен');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].p_kinds).toBeNull();
  });

  it('клик по чипу отправляет ВЫБРАННЫЙ вид и начинает ленту с первой страницы', async () => {
    respond = (a) => (a.p_kinds === null ? [callRow(1)] : [taskRow(1)]);
    setup();

    await screen.findByText('Звонок выполнен');
    fireEvent.click(screen.getByRole('button', { name: 'Задачи' }));

    await waitFor(() => expect(rpcCalls).toHaveLength(2));
    expect(rpcCalls[1].p_kinds).toEqual(['task']);
    // Сброс пагинации: курсор от прежнего набора видов к новому отношения не имеет.
    expect(rpcCalls[1].p_before).toBeNull();
    expect(rpcCalls[1].p_before_id).toBeNull();
    expect(await screen.findByText('Задача: Задача 1')).toBeInTheDocument();
  });

  it('«Заметки» — отдельный вид `note`, а не срез на клиенте', async () => {
    respond = () => [];
    setup();

    await screen.findByText('Пока нет активности');
    // Чип «Заметки» появляется рядом с «Системой» — просим набор с activity.
    cleanup();
    rpcCalls.length = 0;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EntityTimeline entityType="project" entityId="p-1" kindFilter={['task', 'activity']} />
      </QueryClientProvider>,
    );
    await screen.findByText('Пока нет активности');
    fireEvent.click(screen.getByRole('button', { name: 'Заметки' }));

    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(1));
    expect(rpcCalls[rpcCalls.length - 1].p_kinds).toEqual(['note']);
  });

  it('набор видов входит в queryKey: кеш «Все» не отдаётся под «Задачи»', async () => {
    // Ответы РАЗНЫЕ по видам. Если бы ключ не включал набор, React Query отдал бы
    // на «Задачи» готовый кеш «Всех» — то есть звонок под чипом «Задачи», молча
    // и без запроса.
    respond = (a) => (a.p_kinds === null ? [callRow(1)] : [taskRow(1)]);
    setup();

    await screen.findByText('Звонок выполнен');
    fireEvent.click(screen.getByRole('button', { name: 'Задачи' }));

    expect(await screen.findByText('Задача: Задача 1')).toBeInTheDocument();
    expect(screen.queryByText('Звонок выполнен')).not.toBeInTheDocument();

    // Возврат на «Все» отдаёт свою запись кеша, а не ленту задач.
    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(await screen.findByText('Звонок выполнен')).toBeInTheDocument();
    expect(screen.queryByText('Задача: Задача 1')).not.toBeInTheDocument();
  });

  it('пустой ответ при выбранном виде — «нет событий этого типа», а не «нет активности»', async () => {
    // Разница смысловая: с серверным фильтром пустота означает, что событий вида
    // нет ВО ВСЕЙ ленте, а не «нет среди загруженных». Прежний текст «Пока нет
    // активности» тут читался бы как «у сущности вообще ничего нет».
    respond = (a) => (a.p_kinds === null ? [callRow(1)] : []);
    setup();

    await screen.findByText('Звонок выполнен');
    fireEvent.click(screen.getByRole('button', { name: 'Задачи' }));

    expect(await screen.findByText('Нет событий этого типа')).toBeInTheDocument();
    expect(screen.queryByText('Пока нет активности')).not.toBeInTheDocument();
  });

  it('«Показать раньше» при выбранном виде несёт и курсор, и тот же p_kinds', async () => {
    // Полная страница ⇒ есть следующая. Без `p_kinds` во втором запросе вторая
    // страница пришла бы из ленты ВСЕХ видов и склеилась с первой.
    const page = Array.from({ length: TIMELINE_PAGE_SIZE }, (_, i) => taskRow(i + 1));
    respond = (a) => (a.p_kinds === null ? [] : a.p_before === null ? page : []);
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Задачи' }));
    await screen.findByText('Задача: Задача 1');

    fireEvent.click(await screen.findByRole('button', { name: 'Показать раньше' }));

    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(2));
    const last = rpcCalls[rpcCalls.length - 1];
    expect(last.p_kinds).toEqual(['task']);
    expect(last.p_before).toBe('2026-07-12T17:43:03.178164Z');
    expect(last.p_before_id).toBe(`task:${uuid(TIMELINE_PAGE_SIZE)}`);
  });
});
