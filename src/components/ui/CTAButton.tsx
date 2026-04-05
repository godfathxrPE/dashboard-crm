'use client';

import { cn } from '@/lib/utils/cn';
import { useThemeStore } from '@/lib/stores/theme-store';
import type { ReactNode, MouseEventHandler } from 'react';

interface CTAButtonProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: 'sm' | 'md';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export function CTAButton({
  children,
  onClick,
  size = 'md',
  className,
  type = 'button',
  disabled,
}: CTAButtonProps) {
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';

  // Scandi: filled dark button with hover lift
  if (isScandi) {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 font-medium text-white disabled:opacity-50',
          'transition-all duration-200',
          size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
          className,
        )}
        style={{
          backgroundColor: '#1a1a1a',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {children}
      </button>
    );
  }

  // Other themes: standard accent button
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded-lg bg-accent font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm',
        className,
      )}
    >
      {children}
    </button>
  );
}
