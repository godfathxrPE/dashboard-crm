'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';

const NAV_ITEMS = [
  { href: '/',          label: 'Дашборд',    short: 'Да' },
  { href: '/tasks',     label: 'Задачи',     short: 'Зд', badgeKey: 'tasks' as const },
  { href: '/projects',  label: 'Проекты',    short: 'Пр' },
  { href: '/contacts',  label: 'Контакты',   short: 'Кн' },
  { href: '/companies', label: 'Компании',   short: 'Км' },
  { href: '/calls',     label: 'Звонки',     short: 'Зв', badgeKey: 'calls' as const },
  { href: '/meetings',  label: 'Встречи',    short: 'Вс' },
  { href: '/analytics', label: 'Аналитика',  short: 'Ан' },
  { href: '/settings',  label: 'Настройки',  short: 'На' },
] as const;

// ═══════════════════════════════════════════════════════
// Scandinavian Sidebar
// ═══════════════════════════════════════════════════════

export function ScandiSidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();

  // Keyboard shortcut: Cmd+\ to toggle
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar]);

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
      className={cn(
        'fixed left-0 top-0 z-30 flex h-screen flex-col border-r bg-surface overflow-hidden transition-all duration-300',
        sidebarOpen ? 'w-[232px]' : 'w-14',
      )}
      style={{ borderWidth: '0.5px' }}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 shrink-0" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div
          className="logo-icon flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-semibold"
          style={{ border: '1px solid var(--border)', borderRadius: '6px' }}
        >
          ОП
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-text-main truncate">Dashboard</div>
            <div className="text-[10px] text-text-mute truncate">БИТ.IIOT</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex flex-col flex-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const badge = 'badgeKey' in item ? badges[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center text-[13px] transition-colors',
                active
                  ? 'font-medium text-text-main'
                  : 'text-text-dim hover:text-text-main',
                sidebarOpen ? 'justify-between' : 'justify-center',
              )}
              style={{ padding: sidebarOpen ? '7px 20px' : '7px 0' }}
              title={!sidebarOpen ? item.label : undefined}
            >
              {/* Active indicator */}
              {active && (
                <span
                  className="absolute left-0 top-1 bottom-1"
                  style={{ width: 2, background: 'var(--text)' }}
                />
              )}
              {sidebarOpen ? (
                <>
                  <span className="truncate">{item.label}</span>
                  {badge > 0 && <span className="text-[10px] text-text-mute">{badge}</span>}
                </>
              ) : (
                <span className="text-[11px] font-medium">{item.short}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="flex h-10 items-center justify-center text-text-mute hover:text-text-main transition-colors shrink-0"
        style={{ borderTop: '0.5px solid var(--border)' }}
        aria-label={sidebarOpen ? 'Свернуть меню' : 'Развернуть меню'}
        title={sidebarOpen ? 'Свернуть (⌘\\)' : 'Развернуть (⌘\\)'}
      >
        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </aside>
  );
}
