'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => Promise<unknown> | void;
  className?: string;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email';
  format?: (value: string) => string;
}

export function EditableCell({
  value,
  onSave,
  className = '',
  placeholder = '—',
  type = 'text',
  format,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // AUDIT 3.5: Enter → handleSave, затем закрытие инпута триггерит onBlur →
  // второй handleSave → ДВА PATCH. Guard: единожды коммитим за сессию правки.
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      committedRef.current = false; // новая сессия редактирования
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const handleSave = useCallback(async () => {
    if (committedRef.current) return; // blur после Enter/Esc — уже обработали
    committedRef.current = true;
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // Ошибку показывает глобальный mutationCache.onError (toast); значение
      // вернёт optimistic-rollback хука на следующем рендере.
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
    committedRef.current = true; // блокируем onBlur-сейв при закрытии по Esc
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') handleCancel();
    },
    [handleSave, handleCancel],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={`w-full rounded border border-accent bg-surface px-2 py-1 text-sm text-text-main
                   outline-none ring-1 ring-accent-l ${saving ? 'opacity-50' : ''}`}
      />
    );
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`inline-block cursor-pointer rounded px-1 py-0.5 transition-colors
                 hover:bg-accent-l/50 ${!value ? 'text-text-mute' : ''} ${className}`}
      title="Кликни для редактирования"
    >
      {value ? (format ? format(value) : value) : placeholder}
    </span>
  );
}
