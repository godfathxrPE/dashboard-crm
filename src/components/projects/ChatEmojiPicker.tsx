'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredRect } from '@/lib/hooks/use-anchored-rect';
import { EMOJI_CATEGORIES } from '@/lib/constants/chat-emoji';

interface ChatEmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

// Колонок в сетке — для стрелочной навигации (совпадает с grid-cols-8 ниже).
const GRID_COLS = 8;

/**
 * S-CHAT-1.2: hand-rolled эмодзи-пикер для composer чата (Radix не в стеке).
 * Портал + useAnchoredRect (паттерн Combobox/AssigneeSelect, zIndex 1100) — composer
 * у нижней кромки, поэтому панель ставится НАД триггером с клампом по viewport.
 * Закрытие: Esc / клик вне / выбор; обработчики читают колбэки через ref
 * (известные грабли stale closure). Фокус после закрытия возвращает родитель.
 */
export function ChatEmojiPicker({ onPick, onClose, anchorRef }: ChatEmojiPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Хук пересчитывает rect на scroll/resize — используем как реактивный сигнал,
  // а само размещение (над кнопкой) считаем от живого getBoundingClientRect.
  const anchor = useAnchoredRect(anchorRef, true);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const onCloseRef = useRef(onClose);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onCloseRef.current = onClose;
    onPickRef.current = onPick;
  });

  useLayoutEffect(() => {
    const btn = anchorRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8));
    let top = r.top - panel.offsetHeight - 4; // предпочтительно над кнопкой
    if (top < 8) top = Math.min(r.bottom + 4, window.innerHeight - panel.offsetHeight - 8);
    setPos({ top, left });
  }, [anchor, anchorRef]);

  // Esc и клик вне (mousedown на триггере пропускаем — его onClick сам тогглит).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    function handleDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleDown);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleDown);
    };
  }, [anchorRef]);

  // Фокус в панель на открытии — стрелки/Enter работают сразу.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  function handleGridKeyDown(e: React.KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const panel = panelRef.current;
    if (!panel) return;
    const btns = Array.from(panel.querySelectorAll<HTMLButtonElement>('button[data-emoji]'));
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    if (idx === -1) {
      btns[0]?.focus();
      return;
    }
    const delta =
      e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -GRID_COLS : GRID_COLS;
    const next = idx + delta;
    if (next >= 0 && next < btns.length) btns[next]?.focus();
  }

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Выбор эмодзи"
      onKeyDown={handleGridKeyDown}
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        zIndex: 1100,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="max-h-72 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[var(--radius-m)]
                 border border-border bg-popover p-2 shadow-lg outline-none"
    >
      {EMOJI_CATEGORIES.map((cat) => (
        <div key={cat.key} className="mb-1.5 last:mb-0">
          <div className="px-1 pb-0.5 pt-1 text-[11px] font-medium text-text-mute">{cat.label}</div>
          <div className="grid grid-cols-8">
            {cat.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                data-emoji
                onClick={() => onPickRef.current(emoji)}
                aria-label={emoji}
                className="flex h-8 w-8 items-center justify-center rounded text-base
                           hover:bg-surface2 focus:bg-surface2 focus:outline-none"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
