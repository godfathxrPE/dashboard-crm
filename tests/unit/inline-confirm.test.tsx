import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { InlineConfirm, CONFIRM_TTL_MS } from '@/components/ui/InlineConfirm';

afterEach(cleanup);

// S-DEBT-CONFIRM-1: примитив заменил 26 вызовов window.confirm. Здесь закреплено то,
// чего у confirm() не было и что легко потерять правкой: безопасный автофокус, Esc,
// самооткат inline-режима и его отсутствие у оверлея.

function setup(props: Partial<React.ComponentProps<typeof InlineConfirm>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <InlineConfirm
      question="Удалить звонок?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('InlineConfirm — inline', () => {
  it('показывает вопрос опасной кнопкой и «Отмена» рядом', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Удалить звонок?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: 'Удалить звонок?' })).toBeInTheDocument();
  });

  it('автофокус — на БЕЗОПАСНОЙ кнопке: Enter отменяет, а не удаляет', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Отмена' }));
  });

  it('Esc — отмена', () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('сам откатывается через CONFIRM_TTL_MS', () => {
    vi.useFakeTimers();
    try {
      const { onCancel } = setup();
      expect(onCancel).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(CONFIRM_TTL_MS); });
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pending блокирует обе кнопки — второй отправки не будет', () => {
    setup({ pending: true });
    expect(screen.getByRole('button', { name: 'Удалить звонок?' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
  });
});

describe('InlineConfirm — overlay', () => {
  it('показывает текст последствий и живёт на слое модалок', () => {
    setup({ mode: 'overlay', consequence: 'Связанные задачи сохранятся.' });
    expect(screen.getByText('Связанные задачи сохранятся.')).toBeInTheDocument();
    expect(document.querySelector('[data-modal-overlay]')).toBeInTheDocument();
    expect(document.querySelector('[data-modal]')).toBeInTheDocument();
  });

  it('Esc на документе — отмена', () => {
    const { onCancel } = setup({ mode: 'overlay' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('клик по фону — отмена, клик по карточке — нет', () => {
    const { onCancel } = setup({ mode: 'overlay' });
    fireEvent.click(document.querySelector('[data-modal]') as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-modal-overlay]') as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('САМ НЕ ЗАКРЫВАЕТСЯ по таймеру — карточку читают, а не ловят', () => {
    vi.useFakeTimers();
    try {
      const { onCancel } = setup({ mode: 'overlay' });
      act(() => { vi.advanceTimersByTime(CONFIRM_TTL_MS * 3); });
      expect(onCancel).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('подтверждение зовёт onConfirm ровно один раз', () => {
    const { onConfirm, onCancel } = setup({ mode: 'overlay', confirmLabel: 'Удалить' });
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
