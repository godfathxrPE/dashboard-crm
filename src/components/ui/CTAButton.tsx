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
        'cta-btn relative overflow-hidden font-medium transition-colors disabled:opacity-50',
        size === 'sm' ? 'px-3.5 py-1 text-[11px]' : 'px-5 py-2 text-[13px]',
        className,
      )}
      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      {/* Fill background */}
      <div className="cta-btn-bg absolute inset-0 z-[1]" />
      {/* Label */}
      <span className="cta-btn-label relative z-[2]">{children}</span>
    </button>
  );
}
