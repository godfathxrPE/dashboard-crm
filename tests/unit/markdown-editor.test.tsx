import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarkdownEditor, type MarkdownEditorProps } from '@/components/shared/MarkdownEditor';

// S-NOTES-2.2. Компонент: панель, горячие клавиши, вставка HTML, ⌘↵/Esc. В jsdom нет
// `execCommand`, поэтому здесь проверяется запасной путь (запись через onChange) —
// логика самих команд покрыта в md-commands.test.ts.

function Harness(props: Partial<MarkdownEditorProps> & { initial?: string }) {
  const { initial = '', ...rest } = props;
  const [v, setV] = useState(initial);
  return <MarkdownEditor value={v} onChange={setV} aria-label="Поле" {...rest} />;
}

const field = () => screen.getByRole('textbox', { name: 'Поле' }) as HTMLTextAreaElement;

function select(el: HTMLTextAreaElement, start: number, end: number) {
  el.focus();
  el.setSelectionRange(start, end);
}

function paste(el: HTMLElement, data: Record<string, string>) {
  return fireEvent.paste(el, {
    clipboardData: { types: Object.keys(data), getData: (t: string) => data[t] ?? '' },
  });
}

describe('MarkdownEditor · панель', () => {
  it('role=toolbar, у каждой кнопки aria-label, у горячих клавиш — подсказка в title', () => {
    render(<Harness />);
    const bar = screen.getByRole('toolbar', { name: 'Форматирование' });
    expect(bar).toBeInTheDocument();
    const names = ['Жирный', 'Курсив', 'Заголовок', 'Список', 'Нумерованный список', 'Ссылка'];
    for (const n of names) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Жирный' }).getAttribute('title')).toMatch(/Жирный · (⌘|Ctrl)B/);
    expect(screen.getByRole('button', { name: 'Ссылка' }).getAttribute('title')).toMatch(/(⌘|Ctrl)K/);
  });

  it('toolbar={false} — панели нет', () => {
    render(<Harness toolbar={false} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('«Жирный» оборачивает выделение', () => {
    render(<Harness initial="abc" />);
    select(field(), 1, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));
    expect(field().value).toBe('a**b**c');
    expect([field().selectionStart, field().selectionEnd]).toEqual([3, 4]);
  });

  it('«Список» ставит `- ` выделенным строкам', () => {
    render(<Harness initial={'а\nб'} />);
    select(field(), 0, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Список' }));
    expect(field().value).toBe('- а\n- б');
  });

  it('кнопка не забирает фокус у поля (mousedown гасится)', () => {
    render(<Harness initial="abc" />);
    const notPrevented = fireEvent.mouseDown(screen.getByRole('button', { name: 'Жирный' }));
    expect(notPrevented).toBe(false);
  });

  it('один пункт Tab: tabindex=0 только у активной кнопки, стрелки двигают', () => {
    render(<Harness />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1]);
    fireEvent.keyDown(buttons[1], { key: 'End' });
    expect(document.activeElement).toBe(buttons[5]);
  });
});

describe('MarkdownEditor · клавиши', () => {
  it('⌘B / Ctrl+B — жирный; на русской раскладке (code=KeyB, key=«и») тоже', () => {
    render(<Harness initial="abc" />);
    select(field(), 1, 2);
    fireEvent.keyDown(field(), { key: 'и', code: 'KeyB', metaKey: true });
    expect(field().value).toBe('a**b**c');
  });

  it('Ctrl+I — курсив, ⌘K — ссылка', () => {
    render(<Harness initial="abc" />);
    select(field(), 1, 2);
    fireEvent.keyDown(field(), { key: 'i', code: 'KeyI', ctrlKey: true });
    expect(field().value).toBe('a*b*c');
    select(field(), 0, 0);
    fireEvent.keyDown(field(), { key: 'k', code: 'KeyK', metaKey: true });
    expect(field().value).toContain('[текст](https://)');
  });

  it('без панели горячие клавиши форматирования не работают', () => {
    render(<Harness initial="abc" toolbar={false} />);
    select(field(), 1, 2);
    fireEvent.keyDown(field(), { key: 'b', code: 'KeyB', metaKey: true });
    expect(field().value).toBe('abc');
  });

  it('⌘↵ вызывает onSubmit, Esc — onCancel; без обработчиков клавиши не гасятся', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const { unmount } = render(<Harness onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.keyDown(field(), { key: 'Enter', metaKey: true });
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();

    render(<Harness />);
    expect(fireEvent.keyDown(field(), { key: 'Escape' })).toBe(true);
  });

  it('обычный Enter — перенос строки, onSubmit не зовётся', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('MarkdownEditor · вставка', () => {
  const HTML = '<p>Итог: <b>согласны</b></p><ul><li>КП</li><li>Созвон</li></ul>';

  it('text/html → markdown в позицию курсора, браузерная вставка отменена', () => {
    render(<Harness initial="до " />);
    select(field(), 3, 3);
    const notPrevented = paste(field(), { 'text/html': HTML, 'text/plain': 'Итог: согласны' });
    expect(notPrevented).toBe(false);
    expect(field().value).toBe('до Итог: **согласны**\n\n- КП\n- Созвон');
    expect(field().selectionStart).toBe(field().value.length);
  });

  it('вставка заменяет выделение', () => {
    render(<Harness initial="aXXb" />);
    select(field(), 1, 3);
    paste(field(), { 'text/html': '<b>y</b>' });
    expect(field().value).toBe('a**y**b');
  });

  it('только text/plain — вставляет браузер (событие не отменено)', () => {
    render(<Harness initial="" />);
    const notPrevented = paste(field(), { 'text/plain': 'простой текст' });
    expect(notPrevented).toBe(true);
    expect(field().value).toBe('');
  });

  it('text/html без текста (картинка) — вставляет браузер', () => {
    render(<Harness initial="" />);
    expect(paste(field(), { 'text/html': '<img src="x.png">', 'text/plain': '' })).toBe(true);
  });

  it('вставка не выходит за maxLength: хвост обрезается', () => {
    render(<Harness initial="abc" maxLength={8} />);
    select(field(), 3, 3);
    paste(field(), { 'text/html': '<p>1234567890</p>' });
    expect(field().value).toBe('abc12345');
  });

  it('команда, которая не влезает в maxLength, не применяется', () => {
    render(<Harness initial="abc" maxLength={4} />);
    select(field(), 1, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));
    expect(field().value).toBe('abc');
  });
});
