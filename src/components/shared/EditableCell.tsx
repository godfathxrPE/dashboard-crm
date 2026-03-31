'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => Promise<unknown> | void;
  className?: string;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email';
}

export function EditableCell({
  value,
  onSave,
  className = '',
  placeholder = '—',
  type = 'text',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const handleSave = useCallback(async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
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
      {value || placeholder}
    </span>
  );
}
