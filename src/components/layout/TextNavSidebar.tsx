'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUiStore } from '@/lib/stores/ui-store';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useLeads } from '@/lib/hooks/use-leads';
import { useTextScramble } from '@/lib/hooks/use-text-scramble';

// jpLabel — фича washi (иероглифы + scramble на hover). Восстановлено из старого
// Sidebar при слиянии в единый shell (AUDIT C6 follow-up, решение Олега).
const NAV_ITEMS = [
  { href: '/',          label: 'Сегодня',    short: 'Сг', jpLabel: '今日' },
  { href: '/overview',  label: 'Обзор',      short: 'Об', jpLabel: 'ダッシュボード' },
  { href: '/tasks',     label: 'Задачи',     short: 'Зд', jpLabel: 'タスク管理', badgeKey: 'tasks' as const },
  { href: '/leads',     label: 'Лиды',       short: 'Лд', jpLabel: 'リード',     badgeKey: 'leads' as const },
  { href: '/deals',     label: 'Сделки',    short: 'Сд', jpLabel: '案件管理' },
  { href: '/projects',  label: 'Проекты',   short: 'Пр', jpLabel: '導入管理' },
  { href: '/contacts',  label: 'Контакты',   short: 'Кн', jpLabel: '連絡先' },
  { href: '/companies', label: 'Компании',   short: 'Км', jpLabel: '企業一覧' },
  { href: '/calls',     label: 'Звонки',     short: 'Зв', jpLabel: '通話記録', badgeKey: 'calls' as const },
  { href: '/meetings',  label: 'Встречи',    short: 'Вс', jpLabel: '会議予定' },
  { href: '/calendar',  label: 'Календарь',  short: 'Кл', jpLabel: 'カレンダー' },
  { href: '/analytics', label: 'Аналитика',  short: 'Ан', jpLabel: '分析' },
  { href: '/settings',  label: 'Настройки',  short: 'На', jpLabel: '設定' },
] as const;

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
// Text-nav Sidebar (единый shell для всех тем, AUDIT C6)
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
      {/* Logo — Torii-брендинг для тёмных тем, БИТ.IIOT для aura (кожа, не структура) */}
      <div className="flex h-14 items-center gap-3 px-4 shrink-0" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <div
          className="logo-icon flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-semibold"
          style={{ border: '1px solid var(--border)', borderRadius: '6px' }}
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
      <nav className="mt-2 flex flex-col flex-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const badge = 'badgeKey' in item ? badges[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active ? '' : undefined}
              data-nav-item=""
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
              {/* Active indicator — линия (не в Aura; там пилюля через CSS) */}
              {active && !isAura && (
                <span
                  className="absolute left-0 top-1 bottom-1"
                  style={{ width: 2, background: 'var(--text)' }}
                />
              )}
              {sidebarOpen ? (
                <>
                  {isWashi
                    ? <WashiNavLabel label={item.label} jpLabel={item.jpLabel} isActive={active} />
                    : <span className="truncate">{item.label}</span>}
                  {badge > 0 && <span className="text-[10px] text-text-mute">{badge}</span>}
                </>
              ) : (
                <span
                  className="text-[9px] tracking-wider lowercase"
                  style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >{item.label}</span>
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
