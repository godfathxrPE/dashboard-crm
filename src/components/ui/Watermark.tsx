'use client';

import { useMemo, useState, useEffect } from 'react';
import { sampleGradient } from '@/lib/utils/lerp-color';
import { cn } from '@/lib/utils/cn';
import { useThemeStore } from '@/lib/stores/theme-store';

const SIZE_MAP = {
  sm: 22,
  md: 28,
  lg: 36,
  xl: 42,
} as const;

interface WatermarkProps {
  text: string;
  colors: readonly string[];
  size?: keyof typeof SIZE_MAP;
  isActive?: boolean;
  autoActivate?: boolean;
  autoActivateDelay?: number;
  className?: string;
}

export function Watermark({
  text,
  colors,
  size = 'lg',
  isActive = false,
  autoActivate = true,
  autoActivateDelay = 2000,
  className,
}: WatermarkProps) {
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const [autoActive, setAutoActive] = useState(false);

  useEffect(() => {
    if (!isScandi || !autoActivate) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setAutoActive(true);
      return;
    }
    const timer = setTimeout(() => setAutoActive(true), autoActivateDelay);
    return () => clearTimeout(timer);
  }, [isScandi, autoActivate, autoActivateDelay]);

  const active = isActive || autoActive;

  const letters = useMemo(() => {
    const chars = text.split('');
    return chars.map((char, i) => ({
      char,
      color: sampleGradient(colors, chars.length > 1 ? i / (chars.length - 1) : 0),
    }));
  }, [text, colors]);

  const fontSize = SIZE_MAP[size];

  // Auto-activation uses slower transition than hover
  const isAutoOnly = autoActive && !isActive;
  const transitionIn = isAutoOnly
    ? 'color 1.5s ease, opacity 1.5s ease'
    : 'color 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
  const transitionOut = 'color 0.3s ease, opacity 0.3s ease';

  return (
    <span
      className={cn(
        'pointer-events-none select-none uppercase',
        className,
      )}
      style={{
        fontSize,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
      aria-hidden="true"
    >
      {letters.map((l, i) => (
        <span
          key={i}
          data-color={l.color}
          style={{
            color: active ? l.color : 'inherit',
            opacity: active ? 0.85 : 0.07,
            transition: active ? transitionIn : transitionOut,
            display: 'inline',
          }}
        >
          {l.char}
        </span>
      ))}
    </span>
  );
}
