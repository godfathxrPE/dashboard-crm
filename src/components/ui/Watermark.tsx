'use client';

import { useMemo } from 'react';
import { sampleGradient } from '@/lib/utils/lerp-color';
import { cn } from '@/lib/utils/cn';

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
  className?: string;
}

export function Watermark({
  text,
  colors,
  size = 'lg',
  isActive = false,
  className,
}: WatermarkProps) {
  const letters = useMemo(() => {
    const chars = text.split('');
    return chars.map((char, i) => ({
      char,
      color: sampleGradient(colors, chars.length > 1 ? i / (chars.length - 1) : 0),
    }));
  }, [text, colors]);

  const fontSize = SIZE_MAP[size];

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
            color: isActive ? l.color : 'inherit',
            opacity: isActive ? 0.85 : 0.07,
            transition: isActive
              ? 'color 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
              : 'color 0.3s ease, opacity 0.3s ease',
            display: 'inline',
          }}
        >
          {l.char}
        </span>
      ))}
    </span>
  );
}
