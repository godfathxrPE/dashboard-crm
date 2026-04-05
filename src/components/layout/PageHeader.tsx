'use client';

import type { ReactNode } from 'react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { Watermark } from '@/components/ui/Watermark';
import { useWatermarkHover } from '@/lib/hooks/use-watermark-hover';

interface PageHeaderProps {
  title: string;
  wmText: string;
  wmColors: readonly string[];
  count?: number;
  icon?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, wmText, wmColors, count, icon, action }: PageHeaderProps) {
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const { isActive, onMouseEnter, onMouseLeave } = useWatermarkHover(1000);

  if (isScandi) {
    return (
      <div className="mb-4 flex items-center justify-between">
        <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          <Watermark text={wmText} colors={wmColors} size="lg" isActive={isActive} className="block" />
          {count != null && (
            <span className="text-[11px] text-text-mute mt-1 block">{count}</span>
          )}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h1 className="text-lg font-semibold text-text-main">{title}</h1>
        {count != null && (
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">{count}</span>
        )}
      </div>
      {action}
    </div>
  );
}
