import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';

// jsdom не реализует scrollIntoView, а Combobox зовёт его при смене подсветки
// (↑↓). Заглушка локальная, не в tests/setup.ts: править общий setup из-за одного
// файла — расширять blast radius на 77 наборов.
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

// ═══════════════════════════════════════════════════════
// S-TASKS-FIX-2, з.1: регресс, из-за которого владелец решил, что компании нет
// в базе. `TaskModal` держал нативный <select>, а тот ищет ПО ПРЕФИКСУ: набранное
// «фитнес» сверяется с началом строки, а компания записана `ООО "Фитнес Десерты"`.
// `Combobox` ищет подстрокой по label И по sub — здесь это зафиксировано тестом,
// потому что «поиск работает» иначе проверяется только руками.
// ═══════════════════════════════════════════════════════

const COMPANIES: ComboboxOption[] = [
  { value: 'c1', label: 'ООО "Фитнес Десерты"', sub: '7712345678' },
  { value: 'c2', label: 'АО "Молочный Комбинат"', sub: '5009876543' },
  { value: 'c3', label: 'ИП Фитнесов А. А.', sub: undefined },
];

function setup(value: string | null = null) {
  const onChange = vi.fn();
  render(<Combobox options={COMPANIES} value={value} onChange={onChange} placeholder="— не указана —" />);
  return { onChange };
}

/** Открыть список: до открытия на месте поля кнопка-триггер. */
function open() {
  fireEvent.click(screen.getByRole('button'));
  return screen.getByPlaceholderText('Поиск...');
}

describe('Combobox — поиск по подстроке (замена нативного select)', () => {
  it('«фитнес» находит ООО "Фитнес Десерты" — префиксный поиск не находил', () => {
    setup();
    fireEvent.change(open(), { target: { value: 'фитнес' } });

    expect(screen.getByText('ООО "Фитнес Десерты"')).toBeInTheDocument();
    expect(screen.getByText('ИП Фитнесов А. А.')).toBeInTheDocument();
    expect(screen.queryByText('АО "Молочный Комбинат"')).not.toBeInTheDocument();
  });

  it('регистр не важен', () => {
    setup();
    fireEvent.change(open(), { target: { value: 'ДЕСЕРТ' } });
    expect(screen.getByText('ООО "Фитнес Десерты"')).toBeInTheDocument();
  });

  it('ИНН находится через sub', () => {
    setup();
    fireEvent.change(open(), { target: { value: '7712345678' } });

    expect(screen.getByText('ООО "Фитнес Десерты"')).toBeInTheDocument();
    expect(screen.queryByText('АО "Молочный Комбинат"')).not.toBeInTheDocument();
  });

  it('частичный ИНН тоже находит — это подстрока', () => {
    setup();
    fireEvent.change(open(), { target: { value: '5009' } });
    expect(screen.getByText('АО "Молочный Комбинат"')).toBeInTheDocument();
  });

  it('ничего не совпало — явная подпись, а не пустой список', () => {
    setup();
    fireEvent.change(open(), { target: { value: 'мебель' } });
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });
});

describe('Combobox — клавиатура', () => {
  it('Enter выбирает подсвеченный результат поиска', () => {
    const { onChange } = setup();
    const input = open();
    fireEvent.change(input, { target: { value: 'фитнес' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('c1');
  });

  it('↓ сдвигает подсветку, Enter берёт вторую строку', () => {
    const { onChange } = setup();
    const input = open();
    fireEvent.change(input, { target: { value: 'фитнес' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('c3');
  });

  it('↑ не уходит выше первой строки', () => {
    const { onChange } = setup();
    const input = open();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('c1');
  });

  it('Esc закрывает список, ничего не выбрав', () => {
    const { onChange } = setup();
    const input = open();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Поиск...')).not.toBeInTheDocument();
  });
});

describe('Combobox — выбранное значение', () => {
  it('показывает label выбранной компании, а не placeholder', () => {
    setup('c1');
    expect(screen.getByRole('button', { name: /Фитнес Десерты/ })).toBeInTheDocument();
  });

  it('× снимает выбор (null), а не оставляет пустую строку', () => {
    const { onChange } = setup('c1');
    // Крестик — role="button" внутри триггера; берём последний по порядку.
    const clear = screen.getAllByRole('button').at(-1)!;
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
