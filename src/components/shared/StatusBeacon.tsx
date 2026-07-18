'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, UserX, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface AlertItem {
  id: string;
  type: 'overdue' | 'no_contact' | 'stale' | 'no_next_step';
  severity: 'critical' | 'warning';
  title: string;
  description?: string;
  href?: string;
}

const TYPE_ICON = {
  overdue: Clock,
  no_contact: UserX,
  stale: Clock,
  no_next_step: AlertTriangle,
};

interface StatusBeaconProps {
  alerts: AlertItem[];
}

export function StatusBeacon({ alerts }: StatusBeaconProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasCritical = alerts.some((a) => a.severity === 'critical');
  const hasWarning = alerts.some((a) => a.severity === 'warning');
  const level = alerts.length === 0 ? 'ok' : hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok';

  const dotColor = level === 'critical' ? 'bg-red' : level === 'warning' ? 'bg-yellow' : 'bg-green';
  const shouldPulse = level === 'critical';

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          'hover:bg-surface2',
        )}
        title={alerts.length === 0 ? 'Всё в порядке' : `${alerts.length} проблем`}
      >
        <span className={cn('h-2.5 w-2.5 rounded-full transition-colors', dotColor)} />
        {shouldPulse && (
          <span className={cn('absolute h-2.5 w-2.5 rounded-full animate-ping opacity-40', dotColor)} />
        )}
        {alerts.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red px-0.5 text-[9px] font-bold text-white">
            {alerts.length > 9 ? '9+' : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 z-[9999]',
            'w-80 rounded-lg border border-border bg-popover elevation-3',
            'beacon-panel-in',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', dotColor)} />
              <span className="text-sm font-medium text-text-main">
                {alerts.length === 0 ? 'Всё в порядке' : `${alerts.length} проблем`}
              </span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-text-mute hover:text-text-main transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 size={24} className="text-green" />
                <span className="text-sm text-text-dim">Нет проблем</span>
              </div>
            ) : (
              alerts.map((alert) => {
                const Icon = TYPE_ICON[alert.type] ?? AlertTriangle;
                const severityColor = alert.severity === 'critical' ? 'text-red' : 'text-yellow';
                return (
                  <a
                    key={alert.id}
                    href={alert.href}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface2"
                  >
                    <Icon size={16} className={cn('mt-0.5 shrink-0', severityColor)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text-main">{alert.title}</div>
                      {alert.description && (
                        <div className="mt-0.5 text-xs text-text-mute">{alert.description}</div>
                      )}
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
