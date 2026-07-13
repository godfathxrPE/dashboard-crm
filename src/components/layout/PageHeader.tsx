'use client';

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  wmText: string;
  wmColors: readonly string[];
  count?: number;
  icon?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ title, count, icon, action }: PageHeaderProps) {
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
