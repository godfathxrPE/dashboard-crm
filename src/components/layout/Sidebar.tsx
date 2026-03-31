'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Phone,
  Users, Building2, CalendarDays, BarChart3, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';

const MAIN_NAV = [
  { href: '/',          label: 'Дашборд',    icon: LayoutDashboard, badgeKey: null },
  { href: '/tasks',     label: 'Задачи',     icon: CheckSquare,     badgeKey: 'tasks' as const },
  { href: '/projects',  label: 'Проекты',    icon: FolderKanban,    badgeKey: null },
  { href: '/contacts',  label: 'Контакты',   icon: Users,           badgeKey: null },
  { href: '/companies', label: 'Компании',   icon: Building2,       badgeKey: null },
  { href: '/calls',     label: 'Звонки',     icon: Phone,           badgeKey: 'calls' as const },
  { href: '/meetings',  label: 'Встречи',    icon: CalendarDays,    badgeKey: null },
] as const;

const UTIL_NAV = [
  { href: '/analytics', label: 'Аналитика',  icon: BarChart3 },
  { href: '/settings',  label: 'Настройки',  icon: Settings },
] as const;

function NavBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full
                     bg-accent px-1 text-[10px] font-medium text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();

  const activeTasks = (tasks ?? []).filter((t) => t.lane === 'now' || t.lane === 'next').length;
  const pendingCalls = (calls ?? []).filter((c) => c.status === 'pending').length;

  const badges: Record<string, number> = {
    tasks: activeTasks,
    calls: pendingCalls,
  };

  function isActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href));
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-30 h-screen border-r border-border bg-surface transition-all duration-200',
        sidebarOpen ? 'w-56' : 'w-16',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white text-sm font-semibold">
          ОП
        </div>
        {sidebarOpen && (
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-text-main truncate">
              Dashboard CRM
            </div>
            <div className="text-[11px] text-text-mute truncate">
              БИТ.IIOT
            </div>
          </div>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex flex-col gap-0.5 p-2 mt-2">
        {MAIN_NAV.map((item) => {
          const active = isActive(item.href);
          const badge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-fast',
                active
                  ? 'bg-accent-l font-medium text-accent'
                  : 'text-text-dim hover:text-text-main',
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={20} className={cn('shrink-0', active ? 'text-accent' : 'text-text-mute')} />
              {sidebarOpen && (
                <>
                  <span className="truncate">{item.label}</span>
                  {badge > 0 && <NavBadge count={badge} />}
                </>
              )}
              {!sidebarOpen && badge > 0 && (
                <span className="absolute right-1.5 top-0.5 h-2 w-2 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}

        {/* Separator */}
        <div className="my-2 border-t border-border/50" />

        {UTIL_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-fast',
                active
                  ? 'bg-accent-l font-medium text-accent'
                  : 'text-text-dim hover:text-text-main',
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={20} className={cn('shrink-0', active ? 'text-accent' : 'text-text-mute')} />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
