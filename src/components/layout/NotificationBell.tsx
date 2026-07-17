'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckSquare, Briefcase, Check, Rocket, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
} from '@/lib/hooks/use-notifications';
import type { Notification, NotificationType } from '@/types/database';

// Задачи — доска без detail-роута → /tasks. Сделки имеют /deals/[id];
// тип сущности в уведомлении неизвестен — delivery/internal перенаправит
// серверный бэкстоп deals/[id] → /projects/[id].
function entityRoute(n: Notification): string {
  // S-WF-2C-B: task_overdue-автоматизация несёт entity_type='tasks' → доска задач
  // (иначе ушла бы в /deals/{task_id} = 404). Проверять ДО общей automation-ветки.
  if (n.type === 'automation' && n.entity_type === 'tasks') return '/tasks';
  // S-WON-AUTO-1: deal_won ведёт на сделку — там кнопка «Создать проект внедрения».
  // S-WF-2B: automation (entity_type='projects') ведёт на сделку (серверный бэкстоп deals→projects).
  if (n.type === 'project_assigned' || n.type === 'deal_won' || n.type === 'automation')
    return `/deals/${n.entity_id}`;
  return '/tasks';
}

const TYPE_LABEL: Record<NotificationType, string> = {
  task_assigned: 'Назначена задача',
  project_assigned: 'Назначена сделка',
  deal_won: 'Сделка выиграна',
  automation: 'Автоматизация',
};

function TypeIcon({ type }: { type: NotificationType }) {
  const Icon =
    type === 'task_assigned' ? CheckSquare
    : type === 'deal_won' ? Rocket
    : type === 'automation' ? Zap
    : Briefcase;
  return <Icon size={14} className="shrink-0 text-accent" />;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU');
}

function payloadTitle(n: Notification): string {
  const p = n.payload as { title?: string; text?: string } | null;
  const title = p?.title?.trim();
  // S-WON-AUTO-1: главная строка — actionable CTA (не просто имя сделки)
  if (n.type === 'deal_won') {
    return title
      ? `Сделка «${title}» выиграна — создайте внедрение`
      : 'Сделка выиграна — создайте внедрение';
  }
  // S-WF-2B: notify-действие кладёт текст правила в payload.text
  if (n.type === 'automation') {
    return p?.text?.trim() || title || TYPE_LABEL[n.type];
  }
  return title || TYPE_LABEL[n.type];
}

export function NotificationBell() {
  const router = useRouter();
  const { data: notifications = [] } = useNotifications();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function openItem(n: Notification) {
    if (n.read_at === null) markRead.mutate(n.id);
    setOpen(false);
    router.push(entityRoute(n));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-text-dim hover:text-text-main transition-colors"
        aria-label="Уведомления"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[9999] mt-1 w-80 rounded-lg border border-border bg-surface elevation-3">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-text-dim">Уведомления</span>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                <Check size={11} /> Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-text-mute">Пока нет уведомлений</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface2',
                    n.read_at === null && 'bg-accent-l/40',
                  )}
                >
                  <TypeIcon type={n.type} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm text-text-main',
                        // deal_won — CTA-строка целиком (иначе truncate съест «создайте внедрение»)
                        n.type === 'deal_won' ? '' : 'truncate',
                      )}
                    >
                      {payloadTitle(n)}
                    </span>
                    <span className="block text-[11px] text-text-mute">
                      {TYPE_LABEL[n.type]} · {relativeTime(n.created_at)}
                    </span>
                  </span>
                  {n.read_at === null && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
