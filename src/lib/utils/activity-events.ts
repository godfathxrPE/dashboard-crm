import { STAGE_CONFIG } from '@/lib/validators/project';
import type { ActivityLog } from '@/types/entities';

function stageName(key: unknown): string {
  const s = String(key);
  return (STAGE_CONFIG as Record<string, { shortLabel: string }>)[s]?.shortLabel ?? s;
}

export function describeEvent(entry: ActivityLog): string {
  const p = entry.payload as Record<string, unknown>;
  switch (entry.event_type) {
    case 'stage_change':
      return `Стадия: ${stageName(p.from)} → ${stageName(p.to)}`;
    case 'call_logged':
      return p.contact_name ? `Звонок: ${p.contact_name}` : 'Звонок записан';
    case 'task_created':
      return `Задача: ${p.title ?? ''}`;
    case 'task_completed':
      return `Выполнено: ${p.title ?? ''}`;
    case 'meeting_scheduled':
      return `Встреча: ${p.title ?? ''} (${p.date ?? ''})`;
    case 'project_updated': {
      const fields = p.fields_changed as string[] | undefined;
      return fields ? `Обновлено: ${fields.join(', ')}` : 'Сделка обновлена';
    }
    case 'comment_added':
      return (p.text as string) ?? 'Комментарий';
    default:
      return entry.event_type;
  }
}

export function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д назад`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
