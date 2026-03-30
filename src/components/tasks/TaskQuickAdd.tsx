'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { useCreateTask } from '@/lib/hooks/use-tasks';
import type { TaskLane } from '@/types/database';

interface TaskQuickAddProps {
  lane: TaskLane;
}

export function TaskQuickAdd({ lane }: TaskQuickAddProps) {
  const [text, setText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;

    createTask.mutate({ text: trimmed, lane });
    setText('');
    // Держим инпут открытым для серийного добавления
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setText('');
      setIsOpen(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          // focus после рендера
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-text-mute hover:bg-surface2 hover:text-text-dim transition-colors"
      >
        <Plus size={14} />
        Добавить...
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!text.trim()) setIsOpen(false);
        }}
        placeholder="Новая задача..."
        className="flex-1 rounded-md border border-border bg-surface2 px-2 py-1.5 text-xs text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
      />
    </div>
  );
}
