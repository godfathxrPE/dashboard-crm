import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Modal } from '@/components/shared/Modal';

afterEach(cleanup);

function setup(isDirty: boolean) {
  const onClose = vi.fn();
  render(
    <Modal title="Тест" onClose={onClose} isDirty={isDirty} footer={<button>ОК</button>}>
      <p>тело</p>
    </Modal>,
  );
  const overlay = document.querySelector('[data-modal-overlay]') as HTMLElement;
  return { onClose, overlay };
}

describe('Modal — structure', () => {
  it('рендерит title, тело и footer', () => {
    setup(false);
    expect(screen.getByRole('heading', { name: 'Тест' })).toBeInTheDocument();
    expect(screen.getByText('тело')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ОК' })).toBeInTheDocument();
    // тема-хуки на месте
    expect(document.querySelector('[data-modal]')).toBeInTheDocument();
    expect(document.querySelector('[data-modal-overlay]')).toBeInTheDocument();
  });
});

describe('Modal — закрытие без несохранённых изменений', () => {
  it('клик по фону закрывает сразу', () => {
    const { onClose, overlay } = setup(false);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc закрывает сразу', () => {
    const { onClose } = setup(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('крестик закрывает сразу', () => {
    const { onClose } = setup(false);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal — isDirty-guard (тихая потеря ввода)', () => {
  it('клик по фону НЕ закрывает — показывает подтверждение', () => {
    const { onClose, overlay } = setup(true);
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/несохранённые изменения/i)).toBeInTheDocument();
  });

  it('Esc НЕ закрывает при isDirty', () => {
    const { onClose } = setup(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/несохранённые изменения/i)).toBeInTheDocument();
  });

  it('«Закрыть без сохранения» — подтверждает закрытие', () => {
    const { onClose, overlay } = setup(true);
    fireEvent.click(overlay);
    fireEvent.click(screen.getByRole('button', { name: /Закрыть без сохранения/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('«Продолжить редактирование» — данные живы, модалка открыта', () => {
    const { onClose, overlay } = setup(true);
    fireEvent.click(overlay);
    fireEvent.click(screen.getByRole('button', { name: /Продолжить редактирование/i }));
    expect(onClose).not.toHaveBeenCalled();
    // подтверждение исчезло, тело на месте
    expect(screen.queryByText(/несохранённые изменения/i)).not.toBeInTheDocument();
    expect(screen.getByText('тело')).toBeInTheDocument();
  });
});
