'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft, ChevronRight,
  Sun, LayoutDashboard, CheckSquare, Target, FolderKanban, Rocket,
  Users, Building2, Phone, CalendarDays, BarChart3, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useLeads } from '@/lib/hooks/use-leads';
import { useTextScramble } from '@/lib/hooks/use-text-scramble';

// jpLabel — фича washi (иероглифы + scramble на hover). icon/sectionColor — иконочный
// нав всех тем КРОМЕ aura (aura прячет .nav-ico через CSS). Единый shell: иконки ВСЕГДА
// в DOM, разница тем = CSS-кожа (AUDIT C7, регресс-фикс C6).
const MAIN_NAV = [
  { href: '/',          label: 'Сегодня',   jpLabel: '今日',           icon: Sun,             sectionColor: '#94A3B8' },
  { href: '/overview',  label: 'Обзор',     jpLabel: 'ダッシュボード', icon: LayoutDashboard, sectionColor: '#94A3B8' },
  { href: '/tasks',     label: 'Задачи',    jpLabel: 'タスク管理',     icon: CheckSquare,     sectionColor: '#8B7CF6', badgeKey: 'tasks' as const },
  { href: '/leads',     label: 'Лиды',      jpLabel: 'リード',         icon: Target,          sectionColor: '#F97316', badgeKey: 'leads' as const },
  { href: '/deals',     label: 'Сделки',    jpLabel: '案件管理',       icon: FolderKanban,    sectionColor: '#FF6633' },
  { href: '/projects',  label: 'Проекты',   jpLabel: '導入管理',       icon: Rocket,          sectionColor: '#10B981' },
  { href: '/contacts',  label: 'Контакты',  jpLabel: '連絡先',         icon: Users,           sectionColor: '#06B6D4' },
  { href: '/companies', label: 'Компании',  jpLabel: '企業一覧',       icon: Building2,       sectionColor: '#22C55E' },
  { href: '/calls',     label: 'Звонки',    jpLabel: '通話記録',       icon: Phone,           sectionColor: '#F59E0B', badgeKey: 'calls' as const },
  { href: '/meetings',  label: 'Встречи',   jpLabel: '会議予定',       icon: CalendarDays,    sectionColor: '#F43F5E' },
  { href: '/calendar',  label: 'Календарь', jpLabel: 'カレンダー',     icon: CalendarDays,    sectionColor: '#6366F1' },
] as const;

const UTIL_NAV = [
  { href: '/analytics', label: 'Аналитика', jpLabel: '分析', icon: BarChart3, sectionColor: '#3B82F6' },
  { href: '/settings',  label: 'Настройки', jpLabel: '設定', icon: Settings,  sectionColor: '#94A3B8' },
] as const;

/** Красная плашка при urgent, accent при обычном (перенос из старого Sidebar, AUDIT C7). */
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

/** Washi: иероглифы по умолчанию, scramble катакана→русский на hover, русский — активный. */
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

// ═══════════════════════════════════════════════════════
// Text/icon-nav Sidebar (единый shell для всех тем, AUDIT C6 + C7)
//   • не-aura: иконка + русский лейбл + NavBadge (иконочный нав как на проде)
//   • aura:    иконки скрыты CSS (.t-aura .nav-ico) → текстовый капс-нав
//   • washi:   иконка + иероглиф + scramble + торий-скобки (CSS)
// ═══════════════════════════════════════════════════════

export function TextNavSidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  // Aura: активный пункт — полупрозрачная пилюля (не линия). Помечаем data-active.
  const theme = useThemeStore((s) => s.theme);
  const isAura = theme === 't-aura';
  const isWashi = theme === 't-washi';
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();
  const { data: leads } = useLeads();

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

  function renderItem(item: { href: string; label: string; jpLabel: string; icon: typeof Sun; sectionColor: string; badgeKey?: 'tasks' | 'leads' | 'calls' }) {
    const active = isActive(item.href);
    const badge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
    const isUrgent = item.badgeKey ? badgeUrgent[item.badgeKey] ?? false : false;
    return (
      <Link
        key={item.href}
        href={item.href}
        data-active={active ? '' : undefined}
        data-nav-item=""
        style={{ '--section-color': item.sectionColor } as React.CSSProperties}
        className={cn(
          'nav-item relative z-10 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          active
            ? 'nav-active font-medium text-[var(--sidebar-active-text)]'
            : 'text-text-dim hover:text-text-main hover:bg-surface2',
          sidebarOpen ? '' : 'justify-center',
        )}
        title={!sidebarOpen ? item.label : undefined}
      >
        <item.icon
          size={20}
          className={cn('nav-ico shrink-0', active ? 'text-[var(--sidebar-active-text)]' : 'text-text-mute')}
        />
        {sidebarOpen ? (
          <>
            {isWashi
              ? <WashiNavLabel label={item.label} jpLabel={item.jpLabel} isActive={active} />
              : <span className="truncate">{item.label}</span>}
            {badge > 0 && <NavBadge count={badge} urgent={isUrgent} />}
          </>
        ) : (
          <>
            {/* Aura без иконок: вертикальный капс-лейбл (nav-ico скрыт CSS) */}
            <span
              className="nav-vlabel text-[9px] tracking-wider lowercase"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >{item.label}</span>
            {badge > 0 && (
              <span className={cn('absolute right-1.5 top-0.5 h-2 w-2 rounded-full', isUrgent ? 'bg-red' : 'bg-accent')} />
            )}
          </>
        )}
      </Link>
    );
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
      {/* Logo — акцентный TC-квадрат (Torii CRM) для не-aura; бордер-квадрат ОП/БИТ.IIOT для aura */}
      <div className="flex h-14 items-center gap-3 px-4 shrink-0" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div
          className={cn(
            'logo-icon flex shrink-0 items-center justify-center font-semibold',
            isAura
              ? 'h-7 w-7 text-[11px]'
              : 'h-8 w-8 rounded-md bg-accent text-white text-sm',
          )}
          style={isAura ? { border: '1px solid var(--border)', borderRadius: '6px' } : undefined}
        >
          {isAura ? 'ОП' : 'TC'}
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-text-main truncate">{isAura ? 'Dashboard' : 'Torii CRM'}</div>
            {isAura && <div className="text-[10px] text-text-mute truncate">БИТ.IIOT</div>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex flex-col flex-1 gap-0.5 px-2">
        {MAIN_NAV.map(renderItem)}

        {/* Separator */}
        <div className="my-2 border-t border-border/50" />

        {UTIL_NAV.map(renderItem)}
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
