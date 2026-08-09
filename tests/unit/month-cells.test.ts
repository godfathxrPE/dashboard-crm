import { describe, it, expect } from 'vitest';
import { sliceCellChips, monthDeadlines, pluralEvents, CELL_CHIP_MAX } from '@/lib/domain/month-cells';

// S-CAL-MONTH-1: ячейка месяца показывает чипы, а не счётчик. Тесты фиксируют
// договорённости отбора («дедлайн не тонет в +N», «третий чип вместо +1»),
// а не вёрстку: именно они разъезжаются с UI при правке JSX.

const ev = (kind: string, startMin: number | null, id = `${kind}-${startMin}`) =>
  ({ id, kind, startMin });

describe('sliceCellChips', () => {
  it('пустой день — ни чипов, ни «+N»', () => {
    expect(sliceCellChips([])).toEqual({ visible: [], hiddenCount: 0 });
  });

  it('два события — оба видны', () => {
    const a = ev('call', 600);
    const b = ev('meeting', 720);
    expect(sliceCellChips([a, b])).toEqual({ visible: [a, b], hiddenCount: 0 });
  });

  it('три события — третий чип, а не «+1 ещё»', () => {
    const a = ev('call', 600);
    const b = ev('meeting', 720);
    const c = ev('task', 900);
    const out = sliceCellChips([a, b, c]);
    expect(out.visible).toHaveLength(3);
    expect(out.hiddenCount).toBe(0);
  });

  it('пять событий — два чипа и «+3»', () => {
    const events = [
      ev('call', 540), ev('call', 600), ev('meeting', 660),
      ev('task', 720), ev('call', 780),
    ];
    const out = sliceCellChips(events);
    expect(out.visible).toHaveLength(CELL_CHIP_MAX);
    expect(out.hiddenCount).toBe(3);
    expect(out.visible.map((e) => e.startMin)).toEqual([540, 600]);
  });

  it('дедлайн виден первым и не тонет в «+N» при четырёх соседях', () => {
    const deadline = ev('deal-deadline', null, 'dl');
    const events = [
      ev('call', 540), ev('call', 600), ev('meeting', 660), ev('task', 720),
      deadline,
    ];
    const out = sliceCellChips(events);
    expect(out.visible[0]).toBe(deadline);
    expect(out.visible).toHaveLength(CELL_CHIP_MAX);
    expect(out.hiddenCount).toBe(3);
  });

  it('сортирует по времени, события без времени — в хвост', () => {
    const late = ev('call', 780);
    const early = ev('call', 540);
    const undated = ev('meeting', null);
    const out = sliceCellChips([undated, late, early], 10);
    expect(out.visible).toEqual([early, late, undated]);
  });

  it('порядок равных сохраняется — два звонка в 10:00 не меняются местами', () => {
    const first = ev('call', 600, 'a');
    const second = ev('call', 600, 'b');
    expect(sliceCellChips([first, second], 10).visible).toEqual([first, second]);
  });

  it('max уважается: при max=1 и трёх событиях — один чип и «+2»', () => {
    const out = sliceCellChips([ev('call', 540), ev('call', 600), ev('call', 660)], 1);
    expect(out.visible).toHaveLength(1);
    expect(out.hiddenCount).toBe(2);
  });

  it('вход не мутируется', () => {
    const events = [ev('call', 780), ev('call', 540)];
    const snapshot = [...events];
    sliceCellChips(events);
    expect(events).toEqual(snapshot);
  });
});

describe('pluralEvents', () => {
  it('склоняет по правилу, а не по «один / не один»', () => {
    expect(pluralEvents(1)).toBe('1 событие');
    expect(pluralEvents(2)).toBe('2 события');
    expect(pluralEvents(4)).toBe('4 события');
    expect(pluralEvents(5)).toBe('5 событий');
    expect(pluralEvents(0)).toBe('0 событий');
  });

  it('11–14 — «событий», хотя последняя цифра говорит иначе', () => {
    expect(pluralEvents(11)).toBe('11 событий');
    expect(pluralEvents(12)).toBe('12 событий');
    expect(pluralEvents(14)).toBe('14 событий');
  });

  it('21 и 22 — снова «событие» и «события»', () => {
    expect(pluralEvents(21)).toBe('21 событие');
    expect(pluralEvents(22)).toBe('22 события');
  });
});

describe('monthDeadlines', () => {
  const items = [
    { id: 'c', title: 'Гамма', dateKey: '2026-08-20' },
    { id: 'a', title: 'Альфа', dateKey: '2026-08-03' },
    { id: 'x', title: 'Чужой месяц', dateKey: '2026-09-01' },
    { id: 'b', title: 'Бета', dateKey: '2026-08-09' },
  ];

  it('оставляет только дедлайны месяца и сортирует по дате', () => {
    const out = monthDeadlines(items, '2026-08', '2026-08-09');
    expect(out.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('число месяца — без ведущего нуля', () => {
    const out = monthDeadlines(items, '2026-08', '2026-08-09');
    expect(out.map((d) => d.day)).toEqual([3, 9, 20]);
  });

  it('прошедшая дата — overdue, сегодня и будущее — нет', () => {
    const out = monthDeadlines(items, '2026-08', '2026-08-09');
    expect(out.map((d) => d.overdue)).toEqual([true, false, false]);
  });

  it('месяц без дедлайнов — пустой массив (полосы не будет)', () => {
    expect(monthDeadlines(items, '2026-07', '2026-08-09')).toEqual([]);
  });

  it('декабрь не путается с январём — префикс несёт год', () => {
    const out = monthDeadlines(
      [
        { id: 'dec', title: 'Декабрь', dateKey: '2026-12-31' },
        { id: 'jan', title: 'Январь', dateKey: '2027-01-01' },
      ],
      '2026-12',
      '2026-12-15',
    );
    expect(out.map((d) => d.id)).toEqual(['dec']);
  });
});
