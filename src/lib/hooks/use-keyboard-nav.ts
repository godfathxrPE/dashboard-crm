'use client';

import { useState, useEffect, useRef, type RefObject } from 'react';
import { useUiStore } from '@/lib/stores/ui-store';

interface UseKeyboardNavOptions {
  itemCount: number;
  /** Enter — открыть focused-строку */
  onSelect?: (index: number) => void;
  /** Space — предпросмотр (peek) focused-строки */
  onPeek?: (index: number) => void;
  /** D — primary-действие focused-строки (экран «Сегодня») */
  onAction?: (index: number) => void;
  /** Escape — дополнительно к сбросу фокуса (напр. закрыть peek) */
  onEscape?: () => void;
  /** Дополнительный gate: видимость списка, арбитраж между двумя таблицами */
  isActive?: () => boolean;
  /** Контейнер, в котором ищется [data-row-index] для scrollIntoView */
  containerRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function useKeyboardNav({
  itemCount,
  onSelect,
  onPeek,
  onAction,
  onEscape,
  isActive,
  containerRef,
  enabled = true,
}: UseKeyboardNavOptions) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const cbRef = useRef({ onSelect, onPeek, onAction, onEscape, isActive });
  cbRef.current = { onSelect, onPeek, onAction, onEscape, isActive };
  // 'G' — префикс глобальной навигации (Hotkeys: G-D → дашборд), глушим 'D' сразу после него
  const gPressedAt = useRef(0);

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
      const { activeModal, commandPaletteOpen } = useUiStore.getState();
      if (activeModal !== null || commandPaletteOpen) return;
      if (cbRef.current.isActive && !cbRef.current.isActive()) return;

      if (e.code === 'KeyG') {
        gPressedAt.current = Date.now();
        return;
      }

      // e.code для букв — не зависит от раскладки (ru/en)
      if (e.code === 'KeyJ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, itemCount - 1));
      } else if (e.code === 'KeyK' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const i = activeIndexRef.current;
        if (i >= 0) {
          e.preventDefault();
          cbRef.current.onSelect?.(i);
        }
      } else if (e.key === ' ') {
        const i = activeIndexRef.current;
        if (cbRef.current.onPeek && i >= 0) {
          e.preventDefault();
          cbRef.current.onPeek(i);
        }
      } else if (e.code === 'KeyD') {
        const i = activeIndexRef.current;
        if (cbRef.current.onAction && i >= 0 && Date.now() - gPressedAt.current > 600) {
          e.preventDefault();
          cbRef.current.onAction(i);
        }
      } else if (e.key === 'Escape') {
        setActiveIndex(-1);
        cbRef.current.onEscape?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemCount, enabled]);

  // Reset when item count changes (page switch, filter)
  useEffect(() => { setActiveIndex(-1); }, [itemCount]);

  // Scroll active row into view (в пределах своего контейнера — на странице может быть два списка)
  useEffect(() => {
    if (activeIndex < 0) return;
    const root: ParentNode = containerRef?.current ?? document;
    const row = root.querySelector(`[data-row-index="${activeIndex}"]`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [activeIndex, containerRef]);

  return { activeIndex, setActiveIndex };
}
