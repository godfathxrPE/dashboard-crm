import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { rpcRowToEvent, type TimelineRpcRow } from '@/lib/timeline/rpc-adapter';
import type { TimelineEvent } from '@/types/timeline';

// S-DEAL-NOTES-READ-1: строка ленты с текстом раскрывается на месте.
// Хук ленты подменён: проверяется представление (превью → раскрытие → действия),
// а не запрос. События собраны настоящим `rpcRowToEvent`, чтобы форма совпадала с боевой.

let events: TimelineEvent[] = [];

vi.mock('@/lib/hooks/use-entity-timeline', () => ({
  useEntityTimeline: () => ({
    events,
    isLoading: false,
    error: null,
    hasMore: false,
    loadMore: () => Promise.resolve(),
    isLoadingMore: false,
  }),
}));

import { DealActivityFeed } from '@/components/projects/DealActivityFeed';

const UUID = '11111111-2222-3333-4444-555555555555';
const NOW_ISO = '2026-10-02T13:56:00+00:00';

function row(kind: TimelineRpcRow['kind'], n: number, payload: Record<string, unknown>): TimelineRpcRow {
  return {
    ts: NOW_ISO,
    id: `${kind}:${UUID.slice(0, -1)}${n}`,
    source: 'test',
    kind,
    actor_id: null,
    ref_type: null,
    ref_id: null,
    payload,
  };
}

const NOTE =
  '02.10.2026 · Zoom · ООО «АНФИШ»\nУчастники: Олег, Сергей.\n\nСитуация\n- Считают вручную\n- В ЧЗ нет интеграции';

const note = () =>
  rpcRowToEvent(row('activity', 1, { event_type: 'comment_added', payload: { text: NOTE } }));
const meeting = () =>
  rpcRowToEvent(
    row('meeting', 2, { title: 'Демо WMS', notes: 'Обсудили сроки', next_step: 'Прислать КП' }),
  );
const stage = () =>
  rpcRowToEvent(
    row('activity', 3, { event_type: 'stage_change', payload: { from: 'kp_sent', to: 'won' } }),
  );

function renderFeed(onOpenEvent = vi.fn()) {
  render(<DealActivityFeed entityId={UUID} filter="all" expanded={false} onOpenEvent={onOpenEvent} />);
  return onOpenEvent;
}

afterEach(() => {
  cleanup();
  events = [];
});

describe('DealActivityFeed: заметки и встречи читаются в ленте', () => {
  it('заметка: заголовок — первая строка, превью — остаток одной строкой, тултипа нет', () => {
    events = [note()];
    renderFeed();

    const btn = screen.getByRole('button', { name: /02\.10\.2026 · Zoom/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).not.toHaveAttribute('title');
    expect(btn.querySelector('[title]')).toBeNull();
    // превью — без маркеров и переносов
    expect(btn).toHaveTextContent('Участники: Олег, Сергей. Ситуация Считают вручную В ЧЗ нет интеграции');
  });

  it('клик раскрывает заметку структурой (заголовок, список), повторный — сворачивает; модалка не открывается', () => {
    events = [note()];
    const onOpen = renderFeed();
    const btn = screen.getByRole('button', { name: /02\.10\.2026 · Zoom/ });

    fireEvent.click(btn);
    expect(onOpen).not.toHaveBeenCalled();
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Ситуация').tagName).toBe('P');
    // внешний `<li>` — сама строка ленты; пункты заметки — во вложенном списке
    const noteList = screen.getByText('Считают вручную').closest('ul') as HTMLElement;
    expect(within(noteList).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Считают вручную', 'В ЧЗ нет интеграции']);
    // у заметки нет «Изменить»: правки заметок в продукте нет
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Считают вручную')).toBeNull();
  });

  it('встреча с текстом: раскрытие показывает заметки и шаг, «Изменить» открывает модалку', () => {
    events = [meeting()];
    const onOpen = renderFeed();

    fireEvent.click(screen.getByRole('button', { name: /Встреча: Демо WMS/ }));
    expect(onOpen).not.toHaveBeenCalled();
    // тело — `<p>`-абзац NoteBody, а не превью в кнопке строки
    expect(screen.getAllByText('Обсудили сроки').some((el) => el.tagName === 'P')).toBe(true);
    expect(screen.getByText(/Следующий шаг: Прислать КП/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].kind).toBe('meeting');
  });

  it('событие без текста — прежнее поведение: клик открывает событие, раскрытия нет', () => {
    events = [stage()];
    const onOpen = renderFeed();

    const btn = screen.getByRole('button', { name: /Стадия/ });
    expect(btn).not.toHaveAttribute('aria-expanded');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('несколько строк раскрыты одновременно', () => {
    events = [note(), meeting()];
    renderFeed();
    const a = screen.getByRole('button', { name: /02\.10\.2026 · Zoom/ });
    const b = screen.getByRole('button', { name: /Встреча: Демо WMS/ });
    fireEvent.click(a);
    fireEvent.click(b);
    expect(a).toHaveAttribute('aria-expanded', 'true');
    expect(b).toHaveAttribute('aria-expanded', 'true');
  });
});
