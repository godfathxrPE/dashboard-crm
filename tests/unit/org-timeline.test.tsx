import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════
// S-TL-4: org-лента и контекст события.
//
// Что проверяется здесь, а не на гейте:
//   1. `'org'` доезжает до RPC с `p_entity_id: null` — и запрос ВООБЩЕ идёт.
//      Прежнее `enabled = Boolean(entityId)` оставило бы его выключенным навсегда:
//      ни ошибки, ни спиннера, пустой виджет при исправном сервере (класс дефекта
//      FIX S-TL-1-RPC-THIS).
//   2. Табы дашборда уходят в `p_kinds`, а не режут загруженное.
//   3. `parent_type`/`parent_id` доезжают до события, имя резолвится из кэшей,
//      ссылка ведёт на карточку родителя — включая компанию и контакт, чего
//      прежний виджет не умел.
//   4. Строка БЕЗ родителя рендерится как `div`, а не как ссылка в никуда.
// ═══════════════════════════════════════════════════════

const REST = { marker: 'rest' } as const;

type RpcArgs = {
  p_entity_type: string;
  p_entity_id: string | null;
  p_before: string | null;
  p_before_id: string | null;
  p_limit: number;
  p_kinds: string[] | null;
};

type RpcResult = { data: unknown; error: { message: string } | null };

const rpcCalls: RpcArgs[] = [];
let respond: (args: RpcArgs) => RpcResult = () => ({ data: [], error: null });

const fakeClient = {
  rest: REST,
  rpc(fn: string, args: RpcArgs): Promise<RpcResult> {
    // Фейк ведёт себя как supabase-js: читает состояние клиента через `this`,
    // поэтому оторванный вызов (`const rpc = supabase.rpc`) здесь падает.
    if (!this || (this as { rest?: unknown }).rest !== REST) {
      throw new TypeError("Cannot read properties of undefined (reading 'rest')");
    }
    rpcCalls.push(args);
    return Promise.resolve(respond(args));
  },
};

const PROJECT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const COMPANY_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const CONTACT_ID = 'cccccccc-0000-0000-0000-000000000003';
const TASK_ID = 'dddddddd-0000-0000-0000-000000000004';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => fakeClient }));
vi.mock('@/lib/hooks/use-team-members', () => ({
  useTeamMembers: () => ({ data: [] }),
}));
// Кэши-источники имён родителя. Хук обязан брать имя ОТСЮДА — RPC отдаёт только id.
// ⚠️ Подменяется ТОЛЬКО списочный хук, остальные экспорты модуля берутся живыми:
// дашборд зовёт из этих же файлов `useDeliveryProjects` и прочее, и полная подмена
// уронила бы его на «No export is defined on the mock».
vi.mock('@/lib/hooks/use-projects', async (orig) => ({
  ...(await orig<object>()),
  useProjects: () => ({ data: [{ id: PROJECT_ID, name: 'Стратек — внедрение' }] }),
}));
vi.mock('@/lib/hooks/use-companies', async (orig) => ({
  ...(await orig<object>()),
  useCompanies: () => ({ data: [{ id: COMPANY_ID, name: 'Хороший вкус' }] }),
}));
vi.mock('@/lib/hooks/use-contacts', async (orig) => ({
  ...(await orig<object>()),
  useContacts: () => ({ data: [{ id: CONTACT_ID, first_name: 'Аня', last_name: 'Петрова' }] }),
}));
// Realtime тянет живой supabase-канал — виджету он в тесте не нужен.
vi.mock('@/lib/hooks/use-realtime', () => ({ useRealtimeSync: () => {} }));

import { RecentActivityList } from '@/components/dashboard/RecentActivityList';

function taskRow(n: number, parent: { type: string | null; id: string | null }) {
  return {
    ts: `2026-08-0${n}T10:00:00.000Z`,
    id: `task:${TASK_ID.slice(0, -1)}${n}`,
    source: 'tasks',
    kind: 'task',
    actor_id: null,
    ref_type: 'task',
    ref_id: TASK_ID,
    parent_type: parent.type,
    parent_id: parent.id,
    payload: { text: `Задача ${n}`, lane: 'now', deadline: null, created_at: `2026-08-0${n}T10:00:00.000Z` },
  };
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecentActivityList />
    </QueryClientProvider>,
  );
}

/** Вызовы именно ленты — на дашборде живут и другие запросы (их клиент замокан). */
const timelineCalls = () => rpcCalls.filter((c) => c.p_entity_type === 'org');

/** Успешный ответ RPC. */
const rows = (data: unknown[]): RpcResult => ({ data, error: null });

afterEach(cleanup);
beforeEach(() => {
  rpcCalls.length = 0;
  respond = () => rows([]);
});

describe('S-TL-4 — org-лента на дашборде', () => {
  it('зовёт RPC с p_entity_type=org и p_entity_id=null — запрос вообще идёт', async () => {
    respond = () => rows([taskRow(1, { type: 'project', id: PROJECT_ID })]);
    renderDashboard();

    await waitFor(() => expect(timelineCalls().length).toBeGreaterThan(0));
    const call = timelineCalls()[0];
    expect(call.p_entity_id).toBeNull();
    expect(call.p_kinds).toBeNull();
    expect(call.p_limit).toBe(20);
  });

  it('событие показывает имя родителя из кэша и ведёт на его карточку', async () => {
    respond = () => rows([
      taskRow(1, { type: 'project', id: PROJECT_ID }),
      taskRow(2, { type: 'company', id: COMPANY_ID }),
      taskRow(3, { type: 'contact', id: CONTACT_ID }),
    ]);
    renderDashboard();

    expect(await screen.findByText('Стратек — внедрение')).toBeInTheDocument();
    expect(screen.getByText('Хороший вкус')).toBeInTheDocument();
    // Контакт склеивается из first_name + last_name — одной колонки с именем нет.
    expect(screen.getByText('Аня Петрова')).toBeInTheDocument();

    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain(`/deals/${PROJECT_ID}`);
    expect(links).toContain(`/companies/${COMPANY_ID}`);
    expect(links).toContain(`/contacts/${CONTACT_ID}`);
  });

  it('событие без родителя — не ссылка (у 304 записей журнала из 801 привязки нет)', async () => {
    respond = () => rows([taskRow(1, { type: null, id: null })]);
    renderDashboard();

    await screen.findByText('Задача: Задача 1');
    expect(
      screen.queryAllByRole('link').map((a) => a.getAttribute('href')),
    ).not.toContain(`/deals/null`);
    expect(screen.queryByText('Стратек — внедрение')).not.toBeInTheDocument();
  });

  it('полупустая пара parent_type/parent_id отбрасывается целиком, а не наполовину', async () => {
    // Половина пары — не «частично известный родитель», а мусор, и опасны ОБЕ
    // половины: тип без id дал бы ссылку на `/deals/null`, id без типа — имя
    // родителя без всякой ссылки, то есть подпись, по которой некуда пойти.
    respond = () => rows([
      taskRow(1, { type: 'project', id: null }),
      taskRow(2, { type: null, id: PROJECT_ID }),
    ]);
    renderDashboard();

    await screen.findByText('Задача: Задача 1');
    expect(screen.queryAllByRole('link').map((a) => a.getAttribute('href')))
      .not.toContain('/deals/null');
    expect(screen.queryByText('Стратек — внедрение')).not.toBeInTheDocument();
  });

  it('таб уходит в p_kinds: фильтрация серверная, а не по 20 загруженным', async () => {
    respond = (a) =>
      a.p_kinds === null ? rows([taskRow(1, { type: 'project', id: PROJECT_ID })]) : rows([]);
    renderDashboard();

    await screen.findByText('Задача: Задача 1');
    const before = timelineCalls().length;

    fireEvent.click(screen.getByRole('button', { name: 'Стадии' }));
    await waitFor(() => expect(timelineCalls().length).toBeGreaterThan(before));
    expect(timelineCalls().at(-1)!.p_kinds).toEqual(['stage']);

    fireEvent.click(screen.getByRole('button', { name: 'Звонки' }));
    await waitFor(() => expect(timelineCalls().at(-1)!.p_kinds).toEqual(['call']));
    // «Звонки» теперь означают настоящие звонки (kind), а не записи журнала
    // `call_logged`: раньше таб отбирал event_type и показывал 2 записи из 14 звонков.
    expect(timelineCalls().at(-1)!.p_kinds).not.toContain('call_logged');

    fireEvent.click(screen.getByRole('button', { name: 'Удаления' }));
    await waitFor(() => expect(timelineCalls().at(-1)!.p_kinds).toEqual(['deleted']));
  });

  it('ошибка ленты видна, а не маскируется призывом создать сделку', async () => {
    respond = () => ({ data: null, error: { message: 'permission denied' } });
    renderDashboard();

    expect(
      await screen.findByText('Не удалось загрузить активность. Обновите страницу.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Создать сделку →')).not.toBeInTheDocument();
  });
});
