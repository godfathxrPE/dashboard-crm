import { LEGACY_STAGE_LABELS } from '@/lib/validators/project';
import type { ActivityLog } from '@/types/entities';

function stageName(key: unknown): string {
  const s = String(key);
  return LEGACY_STAGE_LABELS[s] ?? s;
}

/** Человеческие подписи типов сущностей (entity_deleted). */
export const ENTITY_TYPE_LABEL: Record<string, string> = {
  projects: 'сделка',
  tasks: 'задача',
  contacts: 'контакт',
  companies: 'компания',
  calls: 'звонок',
  meetings: 'встреча',
};

/** Русские лейблы колонок сделки для project_updated.fields_changed.
 *  Ключи — фактические имена колонок из logActivity(project_updated) (Object.keys
 *  апдейта, use-projects.ts). Сырые `stage_id`/`won_reason` в ленту не пускаем. */
export const FIELD_LABELS: Record<string, string> = {
  stage_id: 'стадия',
  status: 'статус',
  next_step: 'следующий шаг',
  next_action_date: 'дата шага',
  budget: 'бюджет',
  deadline: 'дедлайн',
  probability: 'вероятность',
  owner_id: 'ответственный',
  pinned_note: 'заметка',
  won_reason: 'причина выигрыша',
  won_detail: 'причина выигрыша',
  loss_reason: 'причина проигрыша',
  loss_detail: 'причина проигрыша',
  company_id: 'компания',
  contact_id: 'контакт',
  direction: 'направление',
  name: 'название',
  description: 'описание',
  actual_close_date: 'дата закрытия',
  priority: 'приоритет',
};

/** Тип триггера автоматизации → человеческий текст (payload.trigger). */
const AUTOMATION_TRIGGER_LABEL: Record<string, string> = {
  stage_entered: 'смена стадии',
  status_changed: 'смена статуса',
  field_changed: 'изменение поля',
  task_overdue: 'просроченная задача',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function describeEvent(entry: ActivityLog): string {
  const p = (entry.payload ?? {}) as Record<string, unknown>;
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
      return `Встреча: ${p.title ?? ''}`;
    case 'project_updated': {
      let fields = p.fields_changed as string[] | undefined;
      if (!fields || fields.length === 0) return 'Сделка обновлена';
      // Легаси `stage` при наличии `stage_id` — дубль той же смены, не показываем.
      if (fields.includes('stage_id')) fields = fields.filter((f) => f !== 'stage');
      const labels = fields.map(fieldLabel);
      return `Обновлено: ${labels.join(', ')}`;
    }
    case 'comment_added':
      return (p.text as string) ?? 'Комментарий';
    case 'automation_fired': {
      const trigger = p.trigger as string | undefined;
      const label = trigger ? AUTOMATION_TRIGGER_LABEL[trigger] ?? trigger : undefined;
      return label ? `Сработала автоматизация: ${label}` : 'Сработала автоматизация';
    }
    case 'ai_summary_generated': {
      const kind = ENTITY_TYPE_LABEL[p.entity_type as string];
      return kind ? `AI-резюме готово: ${kind}` : 'AI-резюме готово';
    }
    case 'entity_deleted': {
      const entityType = ENTITY_TYPE_LABEL[p.entity_type as string] ?? String(p.entity_type);
      const entityName = p.entity_name as string;
      return `Удалён ${entityType}: ${entityName}`;
    }
    default:
      // Не отдаём сырой event_type голым — греппабельный, но человекочитаемый фолбэк.
      return `Событие: ${entry.event_type}`;
  }
}

export function relativeTime(date: string | null | undefined): string {
  if (!date) return '—';
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
