import {
  Phone, Calendar, CheckSquare, FolderKanban, Activity, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { TimelineKind } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// Икона и цвет события ленты — ОДНА карта на приложение (S-TL-4).
//
// До этого их было две и они жили на разных осях: `<EntityTimeline>` держал
// `KIND_META` по `kind` (шесть видов), дашборд — `EVENT_ICON`/`EVENT_COLOR` по
// `activity_log.event_type` (девять значений). Пока виджет дашборда читал журнал
// напрямую, вторая карта была вынужденной; с переездом на org-ленту у него на входе
// те же шесть `kind`, и вторая карта стала копией, которая разошлась бы молча —
// одно и то же событие рисовалось бы разными иконками в двух местах.
//
// ⚠️ Модуль лежит в `lib/timeline/`, а не рядом с компонентом: импорт из
// `<EntityTimeline>` в `DashboardHome` потянул бы за собой весь компонент ленты
// вместе с его хуком ради двух констант.
// ═══════════════════════════════════════════════════════

export interface TimelineKindMeta {
  icon: LucideIcon;
  /** Фон точки на оси ленты. */
  dot: string;
  /** Цвет иконки. */
  fg: string;
}

export const KIND_META: Record<TimelineKind, TimelineKindMeta> = {
  call:     { icon: Phone,        dot: 'bg-blue-l',   fg: 'text-blue' },
  meeting:  { icon: Calendar,     dot: 'bg-green-l',  fg: 'text-green' },
  task:     { icon: CheckSquare,  dot: 'bg-yellow-l', fg: 'text-yellow' },
  project:  { icon: FolderKanban, dot: 'bg-accent-l', fg: 'text-accent' },
  activity: { icon: Activity,     dot: 'bg-surface2', fg: 'text-text-mute' },
  ai_run:   { icon: Sparkles,     dot: 'bg-accent-l', fg: 'text-accent' },
};

/**
 * Ссылка на карточку родителя события. `null` — родителя нет (законно: у 304 записей
 * журнала из 801 привязки нет вовсе) или его тип не ведёт ни на какую карточку.
 *
 * ⚠️ Тип обязателен: по одному id адрес не построить, а перебирать разделы наугад —
 * значит выдавать ссылку, которая через раз ведёт в 404.
 */
export function parentHref(
  parentType: 'project' | 'company' | 'contact' | null | undefined,
  parentId: string | null | undefined,
): string | null {
  if (!parentType || !parentId) return null;
  // `/deals/[id]` для любой сделки: типа (`client` vs `delivery|internal`) в событии
  // нет, а серверный бэкстоп в `deals/[id]/page.tsx` перенаправит на `/projects/[id]`
  // сам — тот же контракт, что описан в `project-href.ts` для точек без `type`.
  if (parentType === 'project') return `/deals/${parentId}`;
  if (parentType === 'company') return `/companies/${parentId}`;
  return `/contacts/${parentId}`;
}
