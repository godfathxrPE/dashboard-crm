'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';

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

    </aside>
  );
}
