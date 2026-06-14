'use client';

import { useState } from 'react';
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
  const [hovered, setHovered] = useState(false);
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';

  // Non-scandi: standard accent button
  if (!isScandi) {
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

  // Scandi: outline button with scaleX fill via React state
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('disabled:opacity-50', className)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        background: 'transparent',
        border: '0.5px solid var(--border)',
        padding: size === 'sm' ? '6px 14px' : '8px 16px',
        fontSize: size === 'sm' ? '11px' : '13px',
        fontWeight: 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: hovered ? 'var(--bg)' : 'var(--text)',
        transition: 'color 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Fill background */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--text)',
          transform: hovered ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: 'left center',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: -1,
        }}
      />
      {/* Content — above fill */}
      <span style={{ position: 'relative', zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'inherit' }}>
        {children}
      </span>
    </button>
  );
}
