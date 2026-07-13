'use client';

import { cn } from '@/lib/utils/cn';
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
