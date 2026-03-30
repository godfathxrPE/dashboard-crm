'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Phone,
  Users, Building2, CalendarDays, BarChart3, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';

const NAV_ITEMS = [
  { href: '/',          label: 'Дашборд',    icon: LayoutDashboard },
  { href: '/tasks',     label: 'Задачи',     icon: CheckSquare },
  { href: '/projects',  label: 'Проекты',    icon: FolderKanban },
  { href: '/contacts',  label: 'Контакты',   icon: Users },
  { href: '/companies', label: 'Компании',   icon: Building2 },
  { href: '/calls',     label: 'Звонки',     icon: Phone },
  { href: '/meetings',  label: 'Встречи',    icon: CalendarDays },
  { href: '/analytics', label: 'Аналитика',  icon: BarChart3 },
  { href: '/settings',  label: 'Настройки',  icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

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

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-2 mt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent-l text-accent font-medium'
                  : 'text-text-dim hover:bg-surface2 hover:text-text-main',
              )}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
