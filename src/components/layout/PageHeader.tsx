'use client';

import type { ReactNode } from 'react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { Watermark } from '@/components/ui/WatermarkNew';

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
  if (isScandi) {
    return (
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Watermark text={wmText} size="section" />
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
        <h1 className="aura-page-title text-text-main">{title}</h1>
        {count != null && (
          <span className="rounded-full bg-accent-l px-2.5 py-0.5 text-xs font-medium text-accent">{count}</span>
        )}
      </div>
      {action}
    </div>
  );
}
