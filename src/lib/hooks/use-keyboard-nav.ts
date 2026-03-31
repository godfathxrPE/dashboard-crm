'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseKeyboardNavOptions {
  itemCount: number;
  onSelect?: (index: number) => void;
  enabled?: boolean;
}

export function useKeyboardNav({ itemCount, onSelect, enabled = true }: UseKeyboardNavOptions) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleSelect = useCallback((index: number) => {
    onSelect?.(index);
  }, [onSelect]);

  useEffect(() => {
    if (!enabled || itemCount === 0) return;

    function isInputFocused(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, itemCount - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, i === -1 ? -1 : 0));
          break;
        case 'Enter':
          setActiveIndex((i) => {
            if (i >= 0) { e.preventDefault(); handleSelect(i); }
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
  }, [itemCount, handleSelect, enabled]);

  // Scroll active row into view
  useEffect(() => {
    if (activeIndex < 0) return;
    const row = document.querySelector(`[data-row-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  return { activeIndex, setActiveIndex };
}
