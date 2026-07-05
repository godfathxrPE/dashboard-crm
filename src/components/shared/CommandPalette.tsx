'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search, CheckSquare, FolderKanban, Building2, Users, Phone, CalendarDays, Settings, BarChart3,
  Plus, Sun, Bookmark,
} from 'lucide-react';
import { useUiStore } from '@/lib/stores/ui-store';
import { useSavedViews } from '@/lib/hooks/use-saved-views';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useCalls } from '@/lib/hooks/use-calls';
import { useMeetings } from '@/lib/hooks/use-meetings';

type ModalAction = 'task' | 'project' | 'call' | 'meeting' | 'contact' | 'company';

interface CmdItem {
  id: string;
  label: string;
  sub?: string;
  icon: typeof Search;
  section: string;
  /** Навигация: переход по маршруту */
  href?: string;
  /** Действие: открыть модалку создания */
  action?: ModalAction;
  /** Подсказка-shortcut (T/C/P/M), показывается справа */
  kbd?: string;
}

/** Быстрые клавиши действий, активны только при пустом query */
const QUICK_ACTIONS: Record<string, ModalAction> = {
  t: 'task', c: 'call', p: 'project', m: 'meeting',
};

/** Подписи маршрутов для сохранённых видов */
const ROUTE_LABELS: Record<string, string> = {
  '/projects': 'Проекты',
  '/companies': 'Компании',
  '/contacts': 'Контакты',
  '/calls': 'Звонки',
  '/tasks': 'Задачи',
  '/meetings': 'Встречи',
};

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const actionsOnly = useUiStore((s) => s.paletteActionsOnly);
  const togglePalette = useUiStore((s) => s.toggleCommandPalette);
  const closePalette = useUiStore((s) => s.closeCommandPalette);
  const openModal = useUiStore((s) => s.openModal);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Шов W2a-4: гонка при route change — палитра, открытая в момент навигации,
  // оставалась в подвешенном состоянии. Сбрасываем при смене маршрута.
  useEffect(() => {
    closePalette();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: calls } = useCalls();
  const { data: meetings } = useMeetings();
  const { views: savedViews } = useSavedViews();

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        togglePalette();
      }
      if (e.key === 'Escape') closePalette();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePalette, closePalette]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build items
  const allItems = useMemo<CmdItem[]>(() => {
    const items: CmdItem[] = [];

    // Actions (создание сущностей) — всегда первыми
    items.push(
      { id: 'act-task', label: 'Новая задача', icon: Plus, action: 'task', kbd: 'T', section: 'Действия' },
      { id: 'act-call', label: 'Новый звонок', icon: Plus, action: 'call', kbd: 'C', section: 'Действия' },
      { id: 'act-project', label: 'Новая сделка', icon: Plus, action: 'project', kbd: 'P', section: 'Действия' },
      { id: 'act-meeting', label: 'Новая встреча', icon: Plus, action: 'meeting', kbd: 'M', section: 'Действия' },
      { id: 'act-contact', label: 'Новый контакт', icon: Plus, action: 'contact', section: 'Действия' },
      { id: 'act-company', label: 'Новая компания', icon: Plus, action: 'company', section: 'Действия' },
    );

    // Saved views (все страницы) — после действий
    for (const v of savedViews) {
      items.push({
        id: `view-${v.id}`,
        label: v.label,
        sub: ROUTE_LABELS[v.route] ?? v.route,
        icon: Bookmark,
        href: v.route + v.query,
        section: 'Виды',
      });
    }

    // Navigation
    items.push(
      { id: 'nav-today', label: 'Сегодня', icon: Sun, href: '/', section: 'Навигация' },
      { id: 'nav-overview', label: 'Обзор', icon: BarChart3, href: '/overview', section: 'Навигация' },
      { id: 'nav-tasks', label: 'Задачи', icon: CheckSquare, href: '/tasks', section: 'Навигация' },
      { id: 'nav-projects', label: 'Проекты', icon: FolderKanban, href: '/projects', section: 'Навигация' },
      { id: 'nav-companies', label: 'Компании', icon: Building2, href: '/companies', section: 'Навигация' },
      { id: 'nav-contacts', label: 'Контакты', icon: Users, href: '/contacts', section: 'Навигация' },
      { id: 'nav-calls', label: 'Звонки', icon: Phone, href: '/calls', section: 'Навигация' },
      { id: 'nav-meetings', label: 'Встречи', icon: CalendarDays, href: '/meetings', section: 'Навигация' },
      { id: 'nav-analytics', label: 'Аналитика', icon: BarChart3, href: '/analytics', section: 'Навигация' },
      { id: 'nav-settings', label: 'Настройки', icon: Settings, href: '/settings', section: 'Навигация' },
    );

    // Tasks
    for (const t of tasks ?? []) {
      items.push({
        id: `task-${t.id}`,
        label: t.text,
        sub: t.lane,
        icon: CheckSquare,
        href: '/tasks',
        section: 'Задачи',
      });
    }

    // Projects
    for (const p of projects ?? []) {
      items.push({
        id: `proj-${p.id}`,
        label: p.name,
        sub: p.stage ?? undefined,
        icon: FolderKanban,
        href: `/projects/${p.id}`,
        section: 'Проекты',
      });
    }

    // Companies
    for (const c of companies ?? []) {
      items.push({
        id: `comp-${c.id}`,
        label: c.name,
        sub: c.industry ?? undefined,
        icon: Building2,
        href: `/companies/${c.id}`,
        section: 'Компании',
      });
    }

    // Contacts
    for (const c of contacts ?? []) {
      items.push({
        id: `cont-${c.id}`,
        label: `${c.first_name} ${c.last_name}`,
        sub: c.position ?? undefined,
        icon: Users,
        href: `/contacts/${c.id}`,
        section: 'Контакты',
      });
    }

    // Calls
    for (const c of calls ?? []) {
      const name = c.contact
        ? `${c.contact.first_name} ${c.contact.last_name}`
        : c.company?.name ?? 'Звонок';
      items.push({
        id: `call-${c.id}`,
        label: name,
        sub: c.status,
        icon: Phone,
        href: '/calls',
        section: 'Звонки',
      });
    }

    // Meetings
    for (const m of meetings ?? []) {
      items.push({
        id: `meet-${m.id}`,
        label: m.title,
        sub: new Date(m.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        icon: CalendarDays,
        href: '/meetings',
        section: 'Встречи',
      });
    }

    return items;
  }, [tasks, projects, companies, contacts, calls, meetings, savedViews]);

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Режим «только Действия» (открыто по хоткею N)
      const base = actionsOnly ? allItems.filter((i) => i.section === 'Действия') : allItems;
      return base.slice(0, 15);
    }
    const q = query.toLowerCase();
    return allItems.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.sub?.toLowerCase().includes(q) ||
      item.section.toLowerCase().includes(q)
    ).slice(0, 15);
  }, [allItems, query, actionsOnly]);

  // Reset selection on filter change
  useEffect(() => setSelectedIdx(0), [filtered]);

  const handleSelect = useCallback((item: CmdItem) => {
    closePalette();
    if (item.action) {
      openModal(item.action);
    } else if (item.href) {
      router.push(item.href);
    }
  }, [closePalette, openModal, router]);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    // Быстрые клавиши действий — только при пустом query (иначе это ввод текста)
    if (!query && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const action = QUICK_ACTIONS[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        closePalette();
        openModal(action);
        return;
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      handleSelect(filtered[selectedIdx]);
    }
  }

  if (!open) return null;

  // Group by section
  let currentSection = '';

  return (
    <div data-modal-overlay="palette" className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50"
      onClick={closePalette}>
      <div data-modal className="w-full max-w-md rounded-xl border border-border bg-surface elevation-3 ring-1 ring-border overflow-hidden"
        role="dialog" aria-modal="true" aria-label="Палитра команд" onClick={(e) => e.stopPropagation()}>

        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search size={16} className="text-text-mute" />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск по задачам, проектам, контактам..."
            aria-label="Поиск по задачам, проектам, контактам"
            className="flex-1 bg-transparent text-sm text-text-main placeholder:text-text-mute focus:outline-none" />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-mute">ESC</kbd>
        </div>

        {/* Results */}
        {/* pb-3: последний пункт не подрезается нижней кромкой (шов W2a-2) */}
        <div className="max-h-72 overflow-y-auto p-1.5 pb-3">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-mute">Ничего не найдено</div>
          ) : (
            filtered.map((item, i) => {
              const showSection = item.section !== currentSection;
              if (showSection) currentSection = item.section;

              return (
                <div key={item.id}>
                  {showSection && (
                    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold text-text-mute">{item.section}</div>
                  )}
                  <button
                    onClick={() => handleSelect(item)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors
                      ${i === selectedIdx ? 'bg-accent-l text-accent' : 'text-text-main hover:bg-surface-hover'}`}
                  >
                    <item.icon size={14} className={i === selectedIdx ? 'text-accent' : 'text-text-mute'} />
                    <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                    {item.kbd && (
                      <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-text-mute">
                        {item.kbd}
                      </kbd>
                    )}
                    {item.sub && (
                      <span className="shrink-0 text-xs text-text-dim">{item.sub}</span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2 text-[10px] text-text-mute">
          <span>↑↓ — навигация</span>
          <span className="text-text-dim">·</span>
          <span>Enter — выбрать</span>
          <span className="text-text-dim">·</span>
          <span>Esc — закрыть</span>
          <span className="text-text-dim">·</span>
          <span>в списках: j/k, Space — предпросмотр, d — действие (Сегодня)</span>
        </div>
      </div>
    </div>
  );
}
