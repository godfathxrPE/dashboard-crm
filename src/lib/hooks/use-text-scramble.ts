'use client';

import { useRef, useCallback, useEffect } from 'react';

const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

function randomKatakana() {
  return KATAKANA[Math.floor(Math.random() * KATAKANA.length)];
}

/**
 * Hook for text-scramble (decode) animation.
 * Returns a ref callback and trigger functions.
 * On hover: scrambles from `fromText` → `toText` (katakana → revealed).
 * On leave: reverse scramble `toText` → `fromText`.
 */
export function useTextScramble(fromText: string, toText: string, isActive: boolean) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const cleanup = useCallback(() => {
    if (frameRef.current) {
      clearInterval(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  // Scramble from `src` to `dst`
  const scramble = useCallback((src: string, dst: string) => {
    const el = elRef.current;
    if (!el) return;
    cleanup();

    if (reducedMotion.current) {
      el.textContent = dst;
      return;
    }

    const maxLen = Math.max(src.length, dst.length);
    let revealed = 0;
    let tick = 0;

    frameRef.current = setInterval(() => {
      tick++;
      if (tick % 2 === 0 && revealed < maxLen) {
        revealed++;
      }

      let result = '';
      for (let i = 0; i < maxLen; i++) {
        if (i < revealed) {
          result += dst[i] ?? '';
        } else {
          result += randomKatakana();
        }
      }
      el.textContent = result;

      if (revealed >= maxLen) {
        cleanup();
      }
    }, 35);
  }, [cleanup]);

  const onMouseEnter = useCallback(() => {
    if (isActive) return; // active items already show target text
    scramble(fromText, toText);
  }, [isActive, fromText, toText, scramble]);

  const onMouseLeave = useCallback(() => {
    if (isActive) return;
    scramble(toText, fromText);
  }, [isActive, fromText, toText, scramble]);

  // Ensure correct text on mount / active change
  const setRef = useCallback((node: HTMLSpanElement | null) => {
    elRef.current = node;
    if (node) {
      node.textContent = isActive ? toText : fromText;
    }
  }, [isActive, fromText, toText]);

  useEffect(() => {
    if (elRef.current) {
      cleanup();
      elRef.current.textContent = isActive ? toText : fromText;
    }
  }, [isActive, fromText, toText, cleanup]);

  return { setRef, onMouseEnter, onMouseLeave };
}
