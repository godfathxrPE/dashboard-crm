'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useCreateNote } from '@/lib/hooks/use-notes';

interface TodayFocusNoteProps {
  projectId: string;
  /** Поле — сюда ставит курсор клавиша N экрана. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Заметка записана; `sentAt` — момент отправки, по нему лента выделяет новую. */
  onCreated: (sentAt: number) => void;
}

/**
 * Заметка в ленту сделки одной строкой (S-TODAY-FOCUS-4, F-07). Enter пишет, текст
 * уходит как есть, без перехода в карточку сделки.
 *
 * ⚠️ Заметка пишет касание, но ход не закрывает: шаг и счётчик дня не меняются.
 * Подсказка под полем об этом — цена F-07, без неё заметку примут за «Сделано».
 *
 * Esc здесь не ловится: он всплывает до `onKeyDown` фокуса (`TodayView`), и тот
 * возвращает DOM-фокус на строку. Текст в поле при этом остаётся.
 */
export function TodayFocusNote({ projectId, inputRef, onCreated }: TodayFocusNoteProps) {
  const createNote = useCreateNote();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const pending = createNote.isPending;

  // Во время записи поле `disabled` и теряет DOM-фокус. Запись кончилась — вернуть
  // курсор (и при ошибке: текст остался, его правят). Эффектом после коммита, а не
  // rAF: в невидимой вкладке rAF не зовётся.
  const refocus = useRef(false);
  useEffect(() => {
    if (!pending && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [pending, inputRef]);

  const submit = async () => {
    const body = text.trim();
    if (!body || pending) return;
    const sentAt = Date.now();
    refocus.current = true;
    try {
      await createNote.mutateAsync({ project_id: projectId, body });
    } catch {
      // Тост даёт хук (`onError`), текст остаётся в поле.
      return;
    }
    setText('');
    onCreated(sentAt);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void submit();
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Заметка в ленту сделки</span>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={pending}
          placeholder="Заметка в ленту сделки"
          className="h-8 w-full rounded-[var(--radius-m)] border border-border2 bg-transparent pl-2.5 pr-8 text-xs text-text-main placeholder:text-text-mute focus:outline-none focus-visible:border-text-dim disabled:opacity-60"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1 font-mono text-meta leading-tight text-text-mute"
        >
          ↵
        </kbd>
      </label>
      {(focused || text.length > 0) && (
        <p className="mt-1 text-meta text-text-mute">Заметка не закрывает ход — для этого «Сделано» (D)</p>
      )}
    </div>
  );
}
