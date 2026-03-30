'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Phone,
  Users, Building2, CalendarDays, BarChart3, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';

const MAIN_NAV = [
  { href: '/',          label: 'Дашборд',    icon: LayoutDashboard },
  { href: '/tasks',     label: 'Задачи',     icon: CheckSquare },
  { href: '/projects',  label: 'Проекты',    icon: FolderKanban },
  { href: '/contacts',  label: 'Контакты',   icon: Users },
  { href: '/companies', label: 'Компании',   icon: Building2 },
  { href: '/calls',     label: 'Звонки',     icon: Phone },
  { href: '/meetings',  label: 'Встречи',    icon: CalendarDays },
] as const;

const UTIL_NAV = [
  { href: '/analytics', label: 'Аналитика',  icon: BarChart3 },
  { href: '/settings',  label: 'Настройки',  icon: Settings },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  sidebarOpen,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  isActive: boolean;
  sidebarOpen: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150',
        isActive
          ? 'border-l-[3px] border-accent bg-accent-l font-semibold text-accent'
          : 'border-l-[3px] border-transparent text-text-dim hover:bg-surface2 hover:text-text-main',
      )}
      title={!sidebarOpen ? label : undefined}
    >
      <Icon size={20} className={cn('shrink-0', isActive ? 'text-accent' : 'text-text-mute')} />
      {sidebarOpen && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

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
        {MAIN_NAV.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            isActive={isActive(item.href)}
            sidebarOpen={sidebarOpen}
          />
        ))}

        {/* Separator */}
        <div className="my-2 border-t border-border/50" />

        {UTIL_NAV.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            isActive={isActive(item.href)}
            sidebarOpen={sidebarOpen}
          />
        ))}
      </nav>
    </aside>
  );
}
