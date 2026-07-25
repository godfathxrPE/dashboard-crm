'use client';

import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';

interface BaselineNameModalProps {
  defaultName: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

// S-GANTT-BASELINE-1: компактный prompt имени слепка. Имя иммутабельно (UPDATE-политик нет),
// поэтому это единственная точка ввода — переснять план = создать новый. Дефолт «План от DD.MM.YYYY».
export function BaselineNameModal({ defaultName, pending, onSubmit, onClose }: BaselineNameModalProps) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 120;

  const submit = () => {
    if (valid && !pending) onSubmit(trimmed);
  };

  return (
    <Modal
      title="Зафиксировать план"
      description="Слепок текущих сроков всех датированных задач. Имя изменить нельзя — переснять = новый план."
      onClose={onClose}
      isDirty={trimmed !== defaultName.trim()}
      maxWidth="max-w-sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-mute transition-colors hover:bg-surface-hover"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || pending}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Фиксирую…' : 'Зафиксировать'}
          </button>
        </>
      }
    >
      <label htmlFor="baseline-name" className="block text-xs font-medium text-text-mute">
        Название плана
      </label>
      <input
        id="baseline-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        maxLength={120}
        className="mt-1 w-full rounded-lg border border-input bg-surface px-2.5 py-1.5 text-sm text-text-main focus:border-accent focus:outline-none"
        placeholder="План от ДД.ММ.ГГГГ"
      />
    </Modal>
  );
}
