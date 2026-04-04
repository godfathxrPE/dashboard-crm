'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useMeetings } from '@/lib/hooks/use-meetings';

const NAV_ITEMS = [
  { href: '/',          label: 'Дашборд' },
  { href: '/tasks',     label: 'Задачи',    badgeKey: 'tasks' as const },
  { href: '/projects',  label: 'Проекты' },
  { href: '/contacts',  label: 'Контакты' },
  { href: '/companies', label: 'Компании' },
  { href: '/calls',     label: 'Звонки',    badgeKey: 'calls' as const },
  { href: '/meetings',  label: 'Встречи' },
  { href: '/analytics', label: 'Аналитика' },
  { href: '/settings',  label: 'Настройки' },
] as const;

// ═══════════════════════════════════════════════════════
// Living Tasks Block
// ═══════════════════════════════════════════════════════

function LivingTasks() {
  const { data: tasks = [] } = useTasks();
  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();
  const [offset, setOffset] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const today = new Date(new Date().toDateString());
  const nowTasks = tasks
    .filter((t) => t.lane === 'now')
    .sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

  const todayStr = today.toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekCalls = calls.filter((c) => c.date >= weekAgo).length;
  const upMeetings = meetings.filter((m) => m.date >= todayStr).length;
  const overdue = tasks.filter((t) => t.lane !== 'done' && t.deadline && new Date(t.deadline) < today).length;

  const totalSteps = Math.max(nowTasks.length - 2, 1); // each step shows 3 tasks

  useEffect(() => {
    if (nowTasks.length <= 3) return;
    intervalRef.current = setInterval(() => {
      setOffset((prev) => (prev + 1) % totalSteps);
    }, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [nowTasks.length, totalSteps]);

  return (
    <div className="px-5 pb-4">
      {/* Watermark */}
      <div
        className="mb-2 text-[28px] font-bold uppercase tracking-[2px] leading-none select-none"
        style={{
          background: 'linear-gradient(135deg, #ff6b9d, #c44cff, #45caff, #6ee7b7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          opacity: 0.15,
        }}
      >
        ДЕЛА
      </div>

      {/* Header: Сегодня · N + dots */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-mute">
          Сегодня · {nowTasks.length}
        </span>
        {nowTasks.length > 3 && (
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 w-1 rounded-full transition-opacity',
                  i === offset ? 'bg-text-main opacity-60' : 'bg-text-main opacity-15',
                )}
                style={{ borderRadius: '50%' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tasks window — 3 visible, rotating */}
      <div className="overflow-hidden" style={{ height: 72 }}>
        <div
          className="flex flex-col transition-transform duration-500"
          style={{
            transform: `translateY(-${offset * 24}px)`,
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {nowTasks.map((task) => {
            const isOverdue = task.deadline && new Date(task.deadline) < today;
            return (
              <div
                key={task.id}
                className="flex h-6 items-center gap-2 text-[12px] text-text-main"
              >
                <span
                  className="h-[11px] w-[11px] shrink-0 border"
                  style={{ borderWidth: '1px', borderColor: 'var(--border)', borderRadius: '2px' }}
                />
                <span className="flex-1 truncate">{task.text}</span>
                {isOverdue && (
                  <span className="shrink-0 text-[9px] font-semibold" style={{ opacity: 0.4 }}>!</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-2 flex gap-4 border-t pt-2 text-[10px] text-text-mute" style={{ borderWidth: '0.5px' }}>
        <span>{weekCalls} звонков</span>
        <span>{upMeetings} встреч</span>
        {overdue > 0 && <span style={{ opacity: 0.6 }}>{overdue} просроч.</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Scandinavian Sidebar
// ═══════════════════════════════════════════════════════

export function ScandiSidebar() {
  const pathname = usePathname();
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();

  const today = new Date(new Date().toDateString());
  const overdueTasks = (tasks ?? []).filter((t) => t.lane !== 'done' && t.deadline && new Date(t.deadline) < today).length;
  const activeTasks = (tasks ?? []).filter((t) => t.lane === 'now' || t.lane === 'next').length;
  const overdueCalls = (calls ?? []).filter((c) => c.status === 'pending' && new Date(c.date) < today).length;
  const pendingCalls = (calls ?? []).filter((c) => c.status === 'pending').length;

  const badges: Record<string, number> = {
    tasks: overdueTasks || activeTasks,
    calls: overdueCalls || pendingCalls,
  };

  function isActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href));
  }

  return (
    <aside
      aria-label="Основная навигация"
      className="fixed left-0 top-0 z-30 flex h-screen flex-col border-r bg-surface"
      style={{ width: 232, borderWidth: '0.5px' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-5" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div
          className="logo-icon flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-semibold"
          style={{ border: '1px solid var(--border)', borderRadius: '6px' }}
        >
          ОП
        </div>
        <div>
          <div className="text-[13px] font-medium text-text-main">Dashboard</div>
          <div className="text-[10px] text-text-mute">БИТ.IIOT</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex flex-col">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const badge = 'badgeKey' in item ? badges[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center justify-between text-[13px] transition-colors',
                active
                  ? 'font-medium text-text-main'
                  : 'text-text-dim hover:text-text-main',
              )}
              style={{ padding: '7px 20px' }}
            >
              {/* Active indicator */}
              {active && (
                <span
                  className="absolute left-0 top-1 bottom-1"
                  style={{ width: 2, background: 'var(--text)' }}
                />
              )}
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="text-[10px] text-text-mute">{badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Separator */}
      <div className="mx-5 my-2" style={{ borderTop: '0.5px solid var(--border)' }} />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Living Tasks Block */}
      <LivingTasks />
    </aside>
  );
}
