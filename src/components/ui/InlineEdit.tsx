'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
  formatDisplay?: (value: string) => string;
  className?: string;
  /** 'textarea' renders a multiline editor; Enter inserts a newline, Cmd/Ctrl+Enter saves. */
  as?: 'input' | 'textarea';
}

export function InlineEdit({ value, onSave, type = 'text', placeholder, formatDisplay, className, as = 'input' }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => { setDraft(value); }, [value]);

  const handleSave = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); }
    finally { setSaving(false); setEditing(false); }
  };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={cn(
          'cursor-pointer hover:underline decoration-dashed underline-offset-2',
          as === 'textarea' && 'whitespace-pre-wrap',
          value ? 'text-text-main' : 'text-text-mute',
          className,
        )}
      >
        {value ? (formatDisplay ? formatDisplay(value) : value) : (placeholder || '—')}
      </span>
    );
  }

  if (as === 'textarea') {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        disabled={saving}
        rows={3}
        aria-label={placeholder}
        placeholder={placeholder}
        className="text-sm w-full px-2 py-1 rounded bg-surface2 border border-border2 text-text-main focus:outline-none focus:border-accent resize-y"
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      disabled={saving}
      aria-label={placeholder}
      className="text-sm font-medium w-full px-2 py-1 rounded bg-surface2 border border-border2 text-text-main focus:outline-none focus:border-accent"
    />
  );
}
