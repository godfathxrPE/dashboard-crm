'use client';

import { useRouter } from 'next/navigation';
import { Plus, Phone, CalendarDays, FolderKanban, CheckSquare, Building2, Users } from 'lucide-react';

const actions = [
  { icon: CheckSquare, label: 'Задача', href: '/tasks', color: 'bg-blue/10 text-blue hover:bg-blue/20' },
  { icon: FolderKanban, label: 'Сделка', href: '/deals', color: 'bg-accent-l text-accent hover:bg-accent/20' },
  { icon: Phone, label: 'Звонок', href: '/calls', color: 'bg-green/10 text-green hover:bg-green/20' },
  { icon: CalendarDays, label: 'Встреча', href: '/meetings', color: 'bg-yellow/10 text-yellow hover:bg-yellow/20' },
  { icon: Building2, label: 'Компания', href: '/companies', color: 'bg-purple/10 text-purple hover:bg-purple/20' },
  { icon: Users, label: 'Контакт', href: '/contacts', color: 'bg-teal/10 text-teal hover:bg-teal/20' },
] as const;

export function QuickActions() {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Быстрые действия</h3>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => router.push(a.href)}
            className={`flex flex-col items-center gap-1.5 rounded-lg px-2 py-3
                        transition-colors ${a.color}`}
          >
            <a.icon size={18} />
            <span className="text-[10px] font-medium">+ {a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
