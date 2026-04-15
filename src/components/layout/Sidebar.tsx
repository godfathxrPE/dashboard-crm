'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Phone,
  Users, Building2, CalendarDays, BarChart3, Settings, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useLeads } from '@/lib/hooks/use-leads';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useTextScramble } from '@/lib/hooks/use-text-scramble';

const MAIN_NAV = [
  { href: '/',          label: 'Дашборд',    jpLabel: 'ダッシュボード', icon: LayoutDashboard, badgeKey: null,               sectionColor: '#94A3B8' },
  { href: '/tasks',     label: 'Задачи',     jpLabel: 'タスク管理',     icon: CheckSquare,     badgeKey: 'tasks' as const,   sectionColor: '#8B7CF6' },
  { href: '/leads',     label: 'Лиды',       jpLabel: 'リード',         icon: Target,          badgeKey: 'leads' as const,   sectionColor: '#F97316' },
  { href: '/projects',  label: 'Проекты',    jpLabel: '案件管理',       icon: FolderKanban,    badgeKey: null,               sectionColor: '#FF6633' },
  { href: '/contacts',  label: 'Контакты',   jpLabel: '連絡先',         icon: Users,           badgeKey: null,               sectionColor: '#06B6D4' },
  { href: '/companies', label: 'Компании',   jpLabel: '企業一覧',       icon: Building2,       badgeKey: null,               sectionColor: '#22C55E' },
  { href: '/calls',     label: 'Звонки',     jpLabel: '通話記録',       icon: Phone,           badgeKey: 'calls' as const,   sectionColor: '#F59E0B' },
  { href: '/meetings',  label: 'Встречи',    jpLabel: '会議予定',       icon: CalendarDays,    badgeKey: null,               sectionColor: '#F43F5E' },
  { href: '/calendar',  label: 'Календарь',  jpLabel: 'カレンダー',     icon: CalendarDays,    badgeKey: null,               sectionColor: '#6366F1' },
] as const;

const UTIL_NAV = [
  { href: '/analytics', label: 'Аналитика',  jpLabel: '分析', icon: BarChart3, sectionColor: '#3B82F6' },
  { href: '/settings',  label: 'Настройки',  jpLabel: '設定', icon: Settings,  sectionColor: '#94A3B8' },
] as const;

function NavBadge({ count, urgent }: { count: number; urgent?: boolean }) {
  if (count === 0) return null;
  return (
    <span className={cn(
      'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white',
      urgent ? 'bg-red' : 'bg-accent',
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Scramble label for Washi theme */
function WashiNavLabel({ label, jpLabel, isActive }: { label: string; jpLabel: string; isActive: boolean }) {
  const { setRef, onMouseEnter, onMouseLeave } = useTextScramble(jpLabel, label, isActive);
  return (
    <span
      ref={setRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="truncate"
      style={{ fontFamily: "'Noto Sans JP', 'Manrope', system-ui, sans-serif" }}
    />
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const theme = useThemeStore((s) => s.theme);
  const isWashi = theme === 't-washi';
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();
  const { data: leads } = useLeads();
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number; opacity: number }>({ top: 0, height: 0, opacity: 0 });
  const [mounted, setMounted] = useState(false);

  const today = new Date(new Date().toDateString());
  const overdueTasks = (tasks ?? []).filter((t) => t.lane !== 'done' && t.deadline && new Date(t.deadline) < today).length;
  const activeTasks = (tasks ?? []).filter((t) => t.lane === 'now' || t.lane === 'next').length;
  const overdueCalls = (calls ?? []).filter((c) => c.status === 'pending' && new Date(c.date) < today).length;
  const pendingCalls = (calls ?? []).filter((c) => c.status === 'pending').length;
  const activeLeads = (leads ?? []).filter((l) => l.status === 'new' || l.status === 'contacted').length;

  const badges: Record<string, number> = {
    tasks: overdueTasks || activeTasks,
    calls: overdueCalls || pendingCalls,
    leads: activeLeads,
  };
  const badgeUrgent: Record<string, boolean> = {
    tasks: overdueTasks > 0,
    calls: overdueCalls > 0,
  };

  function isActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href));
  }

  const updateIndicator = useCallback(() => {
    if (!navRef.current) return;
    const activeEl = navRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (activeEl) {
      const navRect = navRef.current.getBoundingClientRect();
      const linkRect = activeEl.getBoundingClientRect();
      setIndicator({
        top: linkRect.top - navRect.top,
        height: linkRect.height,
        opacity: 1,
      });
    } else {
      setIndicator((prev) => ({ ...prev, opacity: 0 }));
    }
  }, []);

  useEffect(() => {
    updateIndicator();
    // Enable transition only after first paint
    if (!mounted) requestAnimationFrame(() => setMounted(true));
  }, [pathname, sidebarOpen, updateIndicator, mounted]);

  return (
    <aside
      aria-label="Основная навигация"
      className={cn(
        'fixed left-0 top-0 z-30 h-screen border-r border-border bg-surface transition-all duration-200',
        sidebarOpen ? 'w-56' : 'w-16',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="logo-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white text-sm font-semibold">
          TC
        </div>
        {sidebarOpen && (
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-text-main truncate">
              Torii CRM
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="relative flex flex-col gap-0.5 p-2 mt-2">
        {/* Sliding indicator */}
        <div
          className="absolute left-2 right-2 rounded-lg pointer-events-none"
          style={{
            top: indicator.top,
            height: indicator.height,
            opacity: indicator.opacity,
            background: 'var(--sidebar-indicator)',
            transition: mounted
              ? 'top 300ms cubic-bezier(0.4,0,0.2,1), height 200ms cubic-bezier(0.4,0,0.2,1), opacity 200ms'
              : 'none',
          }}
        />

        {MAIN_NAV.map((item) => {
          const active = isActive(item.href);
          const badge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
          const isUrgent = item.badgeKey ? badgeUrgent[item.badgeKey] ?? false : false;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              style={{ '--section-color': item.sectionColor } as React.CSSProperties}
              className={cn(
                'nav-item relative z-10 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-fast',
                active
                  ? 'nav-active font-medium text-[var(--sidebar-active-text)]'
                  : 'text-text-dim hover:text-text-main hover:bg-surface2',
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={20} className={cn('shrink-0', active ? 'text-[var(--sidebar-active-text)]' : 'text-text-mute')} />
              {sidebarOpen && (
                <>
                  {isWashi
                    ? <WashiNavLabel label={item.label} jpLabel={item.jpLabel} isActive={active} />
                    : <span className="truncate">{item.label}</span>}
                  {badge > 0 && <NavBadge count={badge} urgent={isUrgent} />}
                </>
              )}
              {!sidebarOpen && badge > 0 && (
                <span className={cn('absolute right-1.5 top-0.5 h-2 w-2 rounded-full', isUrgent ? 'bg-red' : 'bg-accent')} />
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
              data-active={active}
              style={{ '--section-color': item.sectionColor } as React.CSSProperties}
              className={cn(
                'nav-item relative z-10 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-fast',
                active
                  ? 'nav-active font-medium text-[var(--sidebar-active-text)]'
                  : 'text-text-dim hover:text-text-main hover:bg-surface2',
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={20} className={cn('shrink-0', active ? 'text-[var(--sidebar-active-text)]' : 'text-text-mute')} />
              {sidebarOpen && (
                isWashi
                  ? <WashiNavLabel label={item.label} jpLabel={item.jpLabel} isActive={active} />
                  : <span className="truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
