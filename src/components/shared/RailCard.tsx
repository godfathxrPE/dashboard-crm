'use client';

import type { LucideIcon } from 'lucide-react';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1: примитивы правой рельсы контекста.
//
// Подняты из CompanySidebar (S-R2-CO360-1) без изменения разметки — карточка
// компании и карточка сделки обязаны говорить одним языком. Правки здесь
// меняют обе рельсы разом; это и есть причина существования файла.
// ═══════════════════════════════════════════════════════

export function RailCard({
  icon: Icon, title, badge, action, children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-card className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon size={13} className="shrink-0 text-text-dim" />
        <span className="text-xs font-semibold text-text-main">{title}</span>
        {badge}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Key-value: лейбл фиксированной ширины слева, значение справа.
 *
 * `wrap` — для значений, которые обязаны переноситься, а не обрезаться:
 * «ООО «Торговый дом Метизы и Крепёж»» не влезает в рельсу ни при 320, ни при
 * 400 (замерено в мокапе), и ширина эту задачу не решает — решает перенос.
 */
export function RailRow({
  label, wrap, children,
}: {
  label: string;
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 py-0.5 text-sm">
      <span className="w-[5.5rem] shrink-0 text-text-mute">{label}</span>
      <span className={`min-w-0 flex-1 text-text-main${wrap ? '' : ' truncate'}`}>{children}</span>
    </div>
  );
}
