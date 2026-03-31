'use client';

import { useState, useEffect, useRef } from 'react';

interface UseKeyboardNavOptions {
  itemCount: number;
  onSelect?: (index: number) => void;
  enabled?: boolean;
}

export function useKeyboardNav({ itemCount, onSelect, enabled = true }: UseKeyboardNavOptions) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!enabled) return;

    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, itemCount - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          setActiveIndex((i) => {
            if (i >= 0) { e.preventDefault(); onSelectRef.current?.(i); }
            return i;
          });
          break;
        case 'Escape':
          setActiveIndex(-1);
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [itemCount, enabled]);

  // Reset when item count changes (page switch, filter)
  useEffect(() => { setActiveIndex(-1); }, [itemCount]);

  // Scroll active row into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const row = document.querySelector(`[data-row-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return { activeIndex, setActiveIndex };
}
