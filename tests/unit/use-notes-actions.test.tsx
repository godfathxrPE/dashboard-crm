import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TimelineEvent } from '@/types/timeline';

// S-NOTES-2.1: хуки действий с заметкой. Supabase и тосты подменены — проверяется
// поведение хуков: optimistic-правка кэша ленты, откат при ошибке, тост с «Вернуть»,
// текст лимита закреплений, условия запроса закреплённых.

// `vi.mock` поднимается наверх файла — общие моки заводятся через `vi.hoisted`.
const { rpc, update, toastMock, chain } = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  toastMock: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  // Цепочка `from('notes').update(...).eq(...).select(...)`: каждый вызов возвращает её же.
  chain: {} as Record<string, ReturnType<typeof vi.fn>>,
}));
let chainResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => chain,
  }),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/lib/hooks/use-actor', () => ({ useActorMap: () => new Map([['u1', 'Олег']]) }));

import {
  useSetNotePinned,
  useSoftDeleteNote,
  useUpdateNote,
  usePinnedNotes,
} from '@/lib/hooks/use-notes';

const NOTE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const TIMELINE_KEY = ['timeline', 'project', 'p1', 'all', 50];
const PINNED_KEY = ['notes-pinned', 'project', 'p1'];

function noteEvent(id: string, body: string, pinnedAt: string | null = null): TimelineEvent {
  return {
    id: `note:${id}`,
    sourceId: id,
    kind: 'note',
    title: body.split('\n')[0],
    date: '2026-10-03T10:00:00.000Z',
    icon: 'note',
    body,
    pinnedAt,
    editedAt: null,
    noteKind: 'note',
  };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const a = noteEvent(NOTE_ID, 'Первая строка\nВторая');
  const b = noteEvent(OTHER_ID, 'Чужая');
  qc.setQueryData(TIMELINE_KEY, { pages: [[a, b]], pageParams: [null] });
  qc.setQueryData(PINNED_KEY, [noteEvent(NOTE_ID, 'Первая строка\nВторая', '2026-10-03T09:00:00.000Z')]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const pages = (qc: QueryClient) =>
  (qc.getQueryData(TIMELINE_KEY) as { pages: TimelineEvent[][] }).pages[0];

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of ['update', 'eq', 'select', 'not', 'is', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  // thenable: `await chain` в конце цепочки отдаёт результат запроса
  (chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(chainResult).then(resolve);
  chainResult = { data: [], error: null };
});

describe('useSetNotePinned', () => {
  it('четвёртое закрепление (P0001 + notes_pin_limit) → тост про три заметки', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0001', hint: 'notes_pin_limit', message: 'pin limit' } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetNotePinned(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: NOTE_ID, pinned: true }).catch(() => {});
    });
    expect(rpc).toHaveBeenCalledWith('set_note_pinned', { p_note_id: NOTE_ID, p_pinned: true });
    expect(toastMock.error).toHaveBeenCalledWith(
      'Закреплено уже три заметки. Открепите одну — и эта встанет на её место.',
    );
  });

  it('другая ошибка → общий текст заметок, не про лимит', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'insufficient privilege' } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetNotePinned(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: NOTE_ID, pinned: true }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith('Не удалось сохранить заметку');
  });

  it('успех сбрасывает ленту и закреплённые', async () => {
    rpc.mockResolvedValue({ error: null });
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useSetNotePinned(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: NOTE_ID, pinned: false });
    });
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain('timeline');
    expect(keys).toContain('notes-pinned');
  });
});

describe('useSoftDeleteNote', () => {
  it('optimistic: карточка пропадает из ленты и закреплённых ещё до ответа сервера', async () => {
    let resolveRpc: (v: { error: null }) => void = () => {};
    rpc.mockReturnValue(new Promise((r) => (resolveRpc = r)));
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSoftDeleteNote(), { wrapper });

    act(() => {
      result.current.mutate(NOTE_ID);
    });
    await waitFor(() => expect(pages(qc).map((e) => e.sourceId)).toEqual([OTHER_ID]));
    expect(qc.getQueryData(PINNED_KEY)).toEqual([]);

    await act(async () => {
      resolveRpc({ error: null });
    });
    expect(rpc).toHaveBeenCalledWith('soft_delete_note', { p_note_id: NOTE_ID });
  });

  it('успех: тост «Заметка удалена» на 8 с с действием «Вернуть» → restore_note', async () => {
    rpc.mockResolvedValue({ error: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSoftDeleteNote(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(NOTE_ID);
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [text, opts] = toastMock.mock.calls[0] as [
      string,
      { duration: number; action: { label: string; onClick: () => void } },
    ];
    expect(text).toBe('Заметка удалена');
    expect(opts.duration).toBe(8000);
    expect(opts.action.label).toBe('Вернуть');

    rpc.mockClear();
    await act(async () => {
      opts.action.onClick();
    });
    expect(rpc).toHaveBeenCalledWith('restore_note', { p_note_id: NOTE_ID });
  });

  it('ошибка сервера: кэш возвращается как был, тост с причиной', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'insufficient privilege' } });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSoftDeleteNote(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(NOTE_ID).catch(() => {});
    });
    expect(pages(qc).map((e) => e.sourceId)).toEqual([NOTE_ID, OTHER_ID]);
    expect(toastMock.error).toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateNote', () => {
  it('optimistic: тело и заголовок в кэше меняются сразу; edited_at руками не пишется', async () => {
    let resolveQuery: (v: { data: unknown; error: null }) => void = () => {};
    (chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      new Promise((r) => (resolveQuery = r)).then(resolve);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useUpdateNote(), { wrapper });

    act(() => {
      result.current.mutate({ id: NOTE_ID, body: '  Новый заголовок\nтело ' });
    });
    await waitFor(() => expect(pages(qc)[0].body).toBe('Новый заголовок\nтело'));
    expect(pages(qc)[0].title).toBe('Новый заголовок');
    expect(pages(qc)[0].editedAt).toBeNull();
    // закреплённая копия правится тем же вызовом
    expect((qc.getQueryData(PINNED_KEY) as TimelineEvent[])[0].body).toBe('Новый заголовок\nтело');

    await act(async () => {
      resolveQuery({ data: [{ id: NOTE_ID }], error: null });
    });
    expect(update).not.toHaveBeenCalled();
    expect(chain.update).toHaveBeenCalledWith({ body: 'Новый заголовок\nтело' });
    expect(chain.eq).toHaveBeenCalledWith('id', NOTE_ID);
  });

  it('ошибка: откат кэша и тост; mutateAsync бросает дальше (карточка оставит текст в поле)', async () => {
    chainResult = { data: null, error: { code: '23514', message: 'check' } };
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useUpdateNote(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: NOTE_ID, body: 'x' })).rejects.toBeDefined();
    });
    expect(pages(qc)[0].body).toBe('Первая строка\nВторая');
    expect(toastMock.error).toHaveBeenCalledWith('Заметка пустая или длиннее 20 000 символов');
  });

  it('UPDATE закрыт RLS (0 строк, ошибки нет) — это отказ, а не «сохранено»', async () => {
    chainResult = { data: [], error: null };
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useUpdateNote(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: NOTE_ID, body: 'Другой' })).rejects.toBeDefined();
    });
    expect(pages(qc)[0].body).toBe('Первая строка\nВторая');
  });
});

describe('usePinnedNotes', () => {
  it('запрос: родитель, закреплённые, не удалённые, по порядку закрепления, лимит 3', async () => {
    chainResult = {
      data: [
        {
          id: NOTE_ID,
          body: 'Закреплённая',
          kind: 'note',
          meta: {},
          created_by: 'u1',
          created_at: '2026-10-02T10:00:00.000Z',
          pinned_at: '2026-10-03T09:00:00.000Z',
          edited_at: null,
        },
      ],
      error: null,
    };
    const { wrapper } = setup();
    const { result } = renderHook(() => usePinnedNotes('project', 'p-fresh'), { wrapper });
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    expect(chain.eq).toHaveBeenCalledWith('project_id', 'p-fresh');
    expect(chain.not).toHaveBeenCalledWith('pinned_at', 'is', null);
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    expect(chain.order).toHaveBeenCalledWith('pinned_at', { ascending: true });
    expect(chain.limit).toHaveBeenCalledWith(3);

    const note = result.current.notes[0];
    expect(note.body).toBe('Закреплённая');
    expect(note.pinnedAt).toBe('2026-10-03T09:00:00.000Z');
    // автор — из карты команды
    expect(note.actorName).toBe('Олег');
  });

  it('лид: фильтр по lead_id', async () => {
    chainResult = { data: [], error: null };
    const { wrapper } = setup();
    renderHook(() => usePinnedNotes('lead', 'l-fresh'), { wrapper });
    await waitFor(() => expect(chain.eq).toHaveBeenCalledWith('lead_id', 'l-fresh'));
  });

  it('без id запрос не уходит', () => {
    const { wrapper } = setup();
    renderHook(() => usePinnedNotes('project', undefined), { wrapper });
    expect(chain.eq).not.toHaveBeenCalled();
  });
});
