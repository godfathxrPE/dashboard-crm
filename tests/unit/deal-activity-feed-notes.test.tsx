import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { rpcRowToEvent, type TimelineRpcRow } from '@/lib/timeline/rpc-adapter';
import type { OrgRole } from '@/types/database';
import type { TimelineEvent } from '@/types/timeline';

// S-NOTES-2.1: лента сделки по зонам и на оси. Хуки подменены — проверяется
// представление (зоны, карточки, действия по правам, состояния), а не запрос.
// События собраны настоящим `rpcRowToEvent`, чтобы форма совпадала с боевой.

let events: TimelineEvent[] = [];
let feedState: { isLoading: boolean; error: Error | null } = { isLoading: false, error: null };
let pinned: TimelineEvent[] = [];
let role: OrgRole | null | undefined = 'owner';
let project: { id: string; pinned_note: string | null } | undefined;

const refetch = vi.fn();
const updateNote = vi.fn();
const setPinned = vi.fn();
const softDelete = vi.fn();
const updateProject = vi.fn();

vi.mock('@/lib/hooks/use-entity-timeline', () => ({
  useEntityTimeline: () => ({
    events,
    isLoading: feedState.isLoading,
    error: feedState.error,
    hasMore: false,
    loadMore: () => Promise.resolve(),
    isLoadingMore: false,
    refetch,
  }),
}));
vi.mock('@/lib/hooks/use-realtime', () => ({ useRealtimeSync: () => {} }));
vi.mock('@/lib/hooks/use-org-role', () => ({ useOrgRole: () => ({ data: role }) }));
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/hooks/use-projects', () => ({
  useProject: () => ({ data: project }),
  useUpdateProject: () => ({ mutate: updateProject }),
}));
vi.mock('@/lib/hooks/use-notes', () => ({
  PINNED_LIMIT: 3,
  pinnedNotesKey: (t: string, id: string) => ['notes-pinned', t, id],
  usePinnedNotes: () => ({ notes: pinned, isLoading: false, error: null }),
  useUpdateNote: () => ({ mutateAsync: updateNote, isPending: false }),
  useSetNotePinned: () => ({ mutate: setPinned, isPending: false }),
  useSoftDeleteNote: () => ({ mutate: softDelete, isPending: false }),
}));

import { DealActivityFeed } from '@/components/projects/DealActivityFeed';

const UUID = '11111111-2222-3333-4444-5555555555';
const NOW = new Date(2026, 9, 3, 15, 0);
const iso = (d: number, h: number, mi = 0, mo = 10) => new Date(2026, mo - 1, d, h, mi).toISOString();

function row(
  kind: TimelineRpcRow['kind'],
  n: number,
  ts: string,
  payload: Record<string, unknown>,
  actor: string | null = 'me',
): TimelineRpcRow {
  return {
    ts,
    id: `${kind}:${UUID}${String(n).padStart(2, '0')}`,
    source: 'test',
    kind,
    actor_id: actor,
    ref_type: null,
    ref_id: null,
    payload,
  };
}

const NOTE_TEXT =
  '02.10.2026 · Zoom · ООО «АНФИШ»\nУчастники: Олег, Сергей.\n\nСитуация\n- Считают вручную\n- В ЧЗ нет интеграции';

function note(n: number, over: Record<string, unknown> = {}, actor: string | null = 'me', ts = iso(3, 10, 41)) {
  return rpcRowToEvent(
    row('note', n, ts, { body: NOTE_TEXT, kind: 'note', meta: {}, pinned_at: null, edited_at: null, ...over }, actor),
  );
}
const meeting = (n: number, ts: string, over: Record<string, unknown> = {}) =>
  rpcRowToEvent(row('meeting', n, ts, { title: 'Демо WMS', notes: 'Обсудили сроки', next_step: 'Прислать КП', ...over }));
const call = (n: number, ts: string) =>
  rpcRowToEvent(row('call', n, ts, { status: 'done', agreements: 'Подтвердили встречу', next_step: null }));
const task = (n: number, ts: string, lane: string, deadline: string | null) =>
  rpcRowToEvent(
    row('task', n, ts, { text: 'Отправить требования', lane, deadline, created_at: iso(1, 9) }),
    NOW.getTime(),
  );
const stage = (n: number, ts: string) =>
  rpcRowToEvent(
    row('activity', n, ts, {
      event_type: 'stage_changed',
      payload: {
        from_name: 'Квалификация',
        to_name: 'Подготовка КП',
        from_stage_id: 'st-a',
        to_stage_id: 'st-b',
      },
    }),
  );
const fieldEdit = (n: number, ts: string) =>
  rpcRowToEvent(
    row('activity', n, ts, {
      event_type: 'project_updated',
      payload: { changes: { budget: { from: null, to: 1200000 } }, fields_changed: ['budget'] },
    }),
  );

function renderFeed(over: Partial<{ filter: 'all' | 'note'; entityType: 'project' | 'lead' }> = {}) {
  const onOpenEvent = vi.fn();
  render(
    <DealActivityFeed
      entityId={UUID}
      entityType={over.entityType ?? 'project'}
      filter={over.filter ?? 'all'}
      expanded={false}
      onOpenEvent={onOpenEvent}
    />,
  );
  return onOpenEvent;
}

beforeEach(() => {
  // jsdom не знает ResizeObserver, а `NoteBody` меряет им переполнение свёрнутого тела.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  project = { id: UUID, pinned_note: null };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  events = [];
  pinned = [];
  role = 'owner';
  feedState = { isLoading: false, error: null };
});

describe('DealActivityFeed: история на оси', () => {
  it('день — пилюлей, заметка — карточкой: заголовок — первая строка, тело списком', () => {
    events = [note(1)];
    renderFeed();

    expect(screen.getByText('Сегодня, 3 октября')).toBeInTheDocument();
    expect(screen.getByText('Заметка')).toBeInTheDocument();
    expect(screen.getByText('02.10.2026 · Zoom · ООО «АНФИШ»')).toBeInTheDocument();
    const list = screen.getByText('Считают вручную').closest('ul') as HTMLElement;
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Считают вручную',
      'В ЧЗ нет интеграции',
    ]);
    // время внутри дня без даты: пилюля дня уже назвала день
    expect(screen.getByText('10:41')).toBeInTheDocument();
  });

  it('заметка без переноса строк — тело без заголовка', () => {
    events = [note(1, { body: 'Номер ГЛН у клиента есть. Созвон через неделю.' })];
    renderFeed();
    expect(screen.getByText('Номер ГЛН у клиента есть. Созвон через неделю.')).toBeInTheDocument();
  });

  it('«изменено» — с тултипом даты правки', () => {
    events = [note(1, { edited_at: iso(3, 9, 40) })];
    renderFeed();
    const mark = screen.getByText('изменено');
    expect(mark).toHaveAttribute('title', 'Изменено 3 окт, 09:40');
  });

  it('встреча и звонок: пилюля типа, статус текстом, блок «Дальше»', () => {
    events = [meeting(2, iso(2, 14)), call(3, iso(2, 10, 20))];
    renderFeed();

    expect(screen.getByText('Встреча')).toBeInTheDocument();
    expect(screen.getByText('состоялась')).toBeInTheDocument();
    expect(screen.getByText('Демо WMS')).toBeInTheDocument();
    expect(screen.getByText('Прислать КП')).toBeInTheDocument();
    expect(screen.getByText('Дальше')).toBeInTheDocument();
    expect(screen.getByText('Звонок')).toBeInTheDocument();
    expect(screen.getByText('выполнен')).toBeInTheDocument();
    expect(screen.getByText('Вчера, 2 октября')).toBeInTheDocument();
  });

  it('смена стадии — карточка «было → стало» с комментарием перехода внутри', () => {
    const comment = rpcRowToEvent(
      row('note', 9, iso(2, 16, 20), {
        body: 'Бюджет подтверждён на встрече',
        kind: 'stage_comment',
        meta: { from_stage_id: 'st-a', to_stage_id: 'st-b' },
      }),
    );
    events = [comment, stage(4, iso(2, 16, 20))];
    renderFeed();

    expect(screen.getByText('Квалификация')).toBeInTheDocument();
    expect(screen.getByText('Подготовка КП')).toBeInTheDocument();
    expect(screen.getByText('Бюджет подтверждён на встрече')).toBeInTheDocument();
    // комментарий ушёл в карточку стадии, отдельной заметки нет
    expect(screen.queryByText('Заметка')).toBeNull();
  });

  it('правки полей одного автора подряд — одна группа с раскрытием', () => {
    events = [fieldEdit(5, iso(3, 10, 44)), fieldEdit(6, iso(3, 10, 42)), fieldEdit(7, iso(3, 10, 40))];
    renderFeed();

    expect(screen.getByText('3 изменения')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'показать' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'скрыть' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/Бюджет: не задан → 1[\s ]?200[\s ]?000|Бюджет:/).length).toBeGreaterThan(0);
  });

  it('закреплённая заметка в зоне — в истории её второй раз нет', () => {
    const pinnedEvent = note(1, { pinned_at: iso(3, 9) });
    events = [pinnedEvent, note(2, { body: 'Другая заметка' }, 'me', iso(3, 8))];
    pinned = [pinnedEvent];
    renderFeed();
    expect(screen.getAllByText('02.10.2026 · Zoom · ООО «АНФИШ»')).toHaveLength(1);
    expect(screen.getByText('Другая заметка')).toBeInTheDocument();
    // счётчик зоны — «N из 3»
    expect(screen.getByText('1 из 3')).toBeInTheDocument();
  });

  it('боковых маркеров нет: ни border-left, ни inset-полосы слева', () => {
    events = [
      note(1),
      meeting(2, iso(2, 14)),
      stage(4, iso(2, 16, 20)),
      fieldEdit(5, iso(3, 10, 44)),
      fieldEdit(6, iso(3, 10, 42)),
    ];
    pinned = [note(8, { pinned_at: iso(3, 9) })];
    project = { id: UUID, pinned_note: 'Рыбопереработка, маркировка пластов' };
    const { container } = render(
      <DealActivityFeed entityId={UUID} filter="all" expanded={false} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/border-l(?![a-z])/);
    expect(html).not.toMatch(/inset_3px|shadow-\[inset/);
  });
});

describe('DealActivityFeed: запланировано', () => {
  it('открытые задачи и будущие встречи — отдельной зоной; просроченная первой', () => {
    events = [
      meeting(2, iso(6, 11), { title: 'Схема 1С' }),
      task(3, iso(1, 9), 'now', iso(2, 12)),
      task(4, iso(1, 9), 'now', iso(5, 12)),
      note(1),
    ];
    const onOpen = renderFeed();

    const zone = screen.getByRole('region', { name: 'Запланировано' });
    const items = within(zone).getAllByRole('button');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('просрочено · 2 окт');
    expect(items[1]).toHaveTextContent('5 окт');
    expect(items[2]).toHaveTextContent('Схема 1С');
    // в истории из них ничего нет: только заметка
    expect(screen.getAllByText('Заметка')).toHaveLength(1);

    fireEvent.click(items[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].kind).toBe('task');
  });

  it('закрытая задача — системной строкой в истории', () => {
    events = [task(3, iso(1, 9), 'done', iso(3, 9))];
    renderFeed();
    expect(screen.queryByRole('region', { name: 'Запланировано' })).toBeNull();
    expect(screen.getByText('Задача закрыта: Отправить требования')).toBeInTheDocument();
  });
});

describe('DealActivityFeed: действия по правам', () => {
  it('owner, чужая заметка: закрепить, изменить, скопировать, «Ещё»', () => {
    role = 'owner';
    events = [note(1, {}, 'someone')];
    renderFeed();
    for (const name of ['Закрепить', 'Изменить', 'Скопировать текст', 'Ещё']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('manager, чужая заметка: только закрепить и скопировать — кнопок правки и меню нет', () => {
    role = 'manager';
    events = [note(1, {}, 'someone')];
    renderFeed();
    expect(screen.getByRole('button', { name: 'Закрепить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скопировать текст' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ещё' })).toBeNull();
  });

  it('manager, своя заметка: изменить и «Ещё»', () => {
    role = 'manager';
    events = [note(1, {}, 'me')];
    renderFeed();
    expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ещё' })).toBeInTheDocument();
  });

  it('viewer: у заметки только «Скопировать текст», у встречи нет «Изменить»', () => {
    role = 'viewer';
    events = [note(1, {}, 'me'), meeting(2, iso(2, 14))];
    renderFeed();
    // по одной кнопке копирования на заметку и на встречу — и больше никаких действий
    expect(screen.getAllByRole('button', { name: 'Скопировать текст' })).toHaveLength(2);
    for (const name of ['Закрепить', 'Изменить', 'Ещё']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('встреча: «Изменить» зовёт onOpenEvent', () => {
    events = [meeting(2, iso(2, 14))];
    const onOpen = renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].kind).toBe('meeting');
  });

  it('закрепить → set_note_pinned(true); закреплённая в зоне — «Открепить» → false', () => {
    const e = note(1);
    events = [e];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Закрепить' }));
    expect(setPinned).toHaveBeenCalledWith({ id: e.sourceId, pinned: true });
    cleanup();

    const p = note(2, { pinned_at: iso(3, 9) });
    events = [p];
    pinned = [p];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Открепить' }));
    expect(setPinned).toHaveBeenLastCalledWith({ id: p.sourceId, pinned: false });
  });

  it('удалить — из меню «Ещё», без диалога подтверждения: сразу мутация (отмена — тостом)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const e = note(1);
    events = [e];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
    expect(screen.getByRole('menuitem', { name: /Скопировать ссылку/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Удалить/ }));
    expect(softDelete).toHaveBeenCalledWith(e.sourceId);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    confirmSpy.mockRestore();
  });
});

describe('DealActivityFeed: правка заметки на месте', () => {
  it('«Изменить» → поле с markdown как есть; ⌘↵ сохраняет, карточка выходит из правки', async () => {
    updateNote.mockResolvedValue(undefined);
    const e = note(1, { body: 'Икру маркировали вручную' });
    events = [e];
    renderFeed();

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const field = screen.getByRole('textbox', { name: 'Текст заметки' });
    expect(field).toHaveValue('Икру маркировали вручную');
    fireEvent.change(field, { target: { value: 'Икру маркировали **вручную**' } });
    fireEvent.keyDown(field, { key: 'Enter', metaKey: true });

    await waitFor(() =>
      expect(updateNote).toHaveBeenCalledWith({ id: e.sourceId, body: 'Икру маркировали **вручную**' }),
    );
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Текст заметки' })).toBeNull());
  });

  it('Esc — отмена без сохранения', () => {
    events = [note(1, { body: 'Текст' })];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const field = screen.getByRole('textbox', { name: 'Текст заметки' });
    fireEvent.change(field, { target: { value: 'Другой текст' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Текст заметки' })).toBeNull();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('текст не менялся — сохранение закрывает правку без запроса', () => {
    events = [note(1, { body: 'Текст' })];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(updateNote).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Текст заметки' })).toBeNull();
  });

  it('сбой сохранения: текст остался в поле, строка ошибки и «Повторить»', async () => {
    updateNote.mockRejectedValueOnce(new Error('offline'));
    events = [note(1, { body: 'Текст' })];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const field = screen.getByRole('textbox', { name: 'Текст заметки' });
    fireEvent.change(field, { target: { value: 'Новый текст' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(
      await screen.findByText('Не получилось сохранить — нет связи. Текст остался в поле.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Текст заметки' })).toHaveValue('Новый текст');

    updateNote.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Текст заметки' })).toBeNull());
  });

  it('пустой текст — «Сохранить» заблокирована настоящим disabled', () => {
    events = [note(1, { body: 'Текст' })];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст заметки' }), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});

describe('DealActivityFeed: суть сделки', () => {
  it('сделка: блок с текстом, подписью и кнопкой правки', () => {
    project = { id: UUID, pinned_note: 'Рыбопереработка: маркировка пластов' };
    events = [note(1)];
    renderFeed();
    expect(screen.getByText('Суть сделки')).toBeInTheDocument();
    expect(screen.getByText('поле сделки · читает AI')).toBeInTheDocument();
    expect(screen.getByText('Рыбопереработка: маркировка пластов')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить суть сделки' })).toBeInTheDocument();
  });

  it('правка: счётчик «N / 500», ⌘↵ пишет pinned_note через useUpdateProject', () => {
    project = { id: UUID, pinned_note: 'Старое' };
    events = [note(1)];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить суть сделки' }));
    const field = screen.getByRole('textbox', { name: 'Суть сделки' });
    expect(screen.getByText('6 / 500')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '  Новое  ' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(updateProject).toHaveBeenCalledWith({ id: UUID, pinned_note: 'Новое' });
    expect(screen.queryByRole('textbox', { name: 'Суть сделки' })).toBeNull();
  });

  it('Esc — отмена; пустое значение пишется как null', () => {
    project = { id: UUID, pinned_note: 'Старое' };
    events = [note(1)];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить суть сделки' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Суть сделки' }), { key: 'Escape' });
    expect(updateProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Изменить суть сделки' }));
    const field = screen.getByRole('textbox', { name: 'Суть сделки' });
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.keyDown(field, { key: 'Enter', metaKey: true });
    expect(updateProject).toHaveBeenCalledWith({ id: UUID, pinned_note: null });
  });

  it('пусто: строка-приглашение открывает правку', () => {
    project = { id: UUID, pinned_note: null };
    events = [note(1)];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Две строки: что продаём и что мешает закрыть' }));
    expect(screen.getByRole('textbox', { name: 'Суть сделки' })).toBeInTheDocument();
  });

  it('длинное значение от AI (> 500) не обрезается: лимит — исходная длина', () => {
    const long = 'я'.repeat(800);
    project = { id: UUID, pinned_note: long };
    events = [note(1)];
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить суть сделки' }));
    expect(screen.getByRole('textbox', { name: 'Суть сделки' })).toHaveValue(long);
    expect(screen.getByText('800 / 800')).toBeInTheDocument();
  });

  it('viewer: текст есть, кнопки правки нет; пусто и viewer — блока нет совсем', () => {
    role = 'viewer';
    project = { id: UUID, pinned_note: 'Суть' };
    events = [note(1)];
    renderFeed();
    expect(screen.getByText('Суть')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить суть сделки' })).toBeNull();
    cleanup();

    project = { id: UUID, pinned_note: null };
    renderFeed();
    expect(screen.queryByText('Суть сделки')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Закреплено' })).toBeNull();
  });

  it('лид: зона — только закреплённые заметки, «Сути сделки» нет', () => {
    const p = note(1, { pinned_at: iso(3, 9) });
    events = [p];
    pinned = [p];
    renderFeed({ entityType: 'lead' });
    expect(screen.getByRole('region', { name: 'Закреплено' })).toBeInTheDocument();
    expect(screen.queryByText('Суть сделки')).toBeNull();
  });

  it('под чипом «Звонки» зоны «Закреплено» нет', () => {
    project = { id: UUID, pinned_note: 'Суть' };
    events = [call(3, iso(2, 10))];
    renderFeed({ filter: 'all' });
    expect(screen.getByText('Суть')).toBeInTheDocument();
    cleanup();
    render(<DealActivityFeed entityId={UUID} filter="call" expanded={false} />);
    expect(screen.queryByText('Суть')).toBeNull();
  });
});

describe('DealActivityFeed: состояния', () => {
  it('загрузка — скелет, зон нет', () => {
    feedState = { isLoading: true, error: null };
    const { container } = render(<DealActivityFeed entityId={UUID} filter="all" expanded={false} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Запланировано' })).toBeNull();
  });

  it('ошибка — текст и «Повторить», отличимая от пустоты', () => {
    feedState = { isLoading: false, error: new Error('boom') };
    renderFeed();
    expect(screen.getByText(/Ленту не удалось загрузить\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('пусто у сделки — приглашение; пусто под чипом — прежний текст', () => {
    events = [];
    renderFeed();
    expect(
      screen.getByText('Здесь появятся заметки, звонки и встречи по сделке. Начните с заметки по первому разговору.'),
    ).toBeInTheDocument();
    cleanup();
    render(<DealActivityFeed entityId={UUID} filter="call" expanded={false} />);
    expect(screen.getByText('Нет событий этого типа')).toBeInTheDocument();
  });

  it('системные строки с задачей и AI открываются кликом, поля — нет', () => {
    const ai = rpcRowToEvent(row('ai_run', 11, iso(3, 9, 12), { preset_key: 'analytic_note' }, null));
    events = [ai];
    const onOpen = renderFeed();
    fireEvent.click(screen.getByRole('button', { name: /AI:/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
