import { LEGACY_STAGE_LABELS, formatBudget } from '@/lib/validators/project';
import { AUTOMATION_STATUS_LABEL } from '@/lib/constants/automation';
import { formatDateShort } from '@/lib/utils/dates';
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
  // 087: поля whitelist аудита, которых клиент раньше не логировал. Без лейбла в
  // ленту уехало бы сырое имя колонки — ровно то, чего эта карта и не допускает.
  pipeline_id: 'воронка',
  delivery_kind: 'шаблон внедрения',
  lost_reason: 'причина проигрыша',
  do_url: 'ссылка 1С:ДО',
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

// ═══════════════════════════════════════════════════════
// S-R2-FIELD-AUDIT (087): «было → стало» из payload.changes
//
// Триггер `trg_zy_log_field_audit` пишет надмножество прежнего payload:
// `fields_changed` остаётся, добавляется `changes` со значениями. Записей без
// `changes` на проде сотни (всё, что писал клиент до 087) — обе ветки обязаны
// работать, старая ветка не трогается.
// ═══════════════════════════════════════════════════════

/** Поля-даты: `null` осмыслен («дедлайн сняли»), поэтому «не задан», а не «—». */
const DATE_FIELDS = new Set(['deadline', 'actual_close_date', 'next_action_date']);

/** Ссылочные поля: в ленту идут ТОЛЬКО from_name/to_name. Сырой UUID — никогда. */
const REF_FIELDS = new Set(['owner_id', 'stage_id', 'company_id', 'contact_id', 'pipeline_id']);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Число из значения payload (SQL кладёт его текстом), иначе null. */
function numOrNull(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatFieldValue(field: string, raw: unknown): string {
  if (field === 'budget') return formatBudget(numOrNull(raw));
  if (field === 'probability') {
    const n = numOrNull(raw);
    return n === null ? '—' : `${n}%`;
  }
  if (DATE_FIELDS.has(field)) {
    if (typeof raw !== 'string' || raw === '') return 'не задан';
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : formatDateShort(d);
  }
  if (field === 'status' && typeof raw === 'string') {
    return AUTOMATION_STATUS_LABEL[raw] ?? raw;
  }
  if (raw == null || raw === '') return '—';
  return String(raw);
}

/** Одно изменение: «Бюджет: 10.0M ₽ → 12.0M ₽», «Ответственный: Олег → Иван». */
function describeChange(field: string, ch: Record<string, unknown>): string {
  const label = capitalize(fieldLabel(field));
  // Класс «факт»: значение не хранится (длинные тексты и заметки в лог не тащим).
  if (!('from' in ch) && !('to' in ch)) return label;
  if (REF_FIELDS.has(field)) {
    const from = typeof ch.from_name === 'string' && ch.from_name ? ch.from_name : '—';
    const to = typeof ch.to_name === 'string' && ch.to_name ? ch.to_name : '—';
    return `${label}: ${from} → ${to}`;
  }
  return `${label}: ${formatFieldValue(field, ch.from)} → ${formatFieldValue(field, ch.to)}`;
}

/**
 * Текст по payload.changes или null, если его нет (старая запись).
 * Строка в ленте одна и узкая (nowrap + ellipsis в ActivityDrawer), поэтому
 * разворачиваем первое изменение, остальные — счётчиком.
 */
function describeChanges(p: Record<string, unknown>): string | null {
  const raw = p.changes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const changes: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      changes[k] = v as Record<string, unknown>;
    }
  }

  // Порядок — из fields_changed (SQL пишет его по порядку whitelist), хвостом
  // ключи, которых там почему-то не оказалось.
  const listed = Array.isArray(p.fields_changed)
    ? (p.fields_changed as unknown[]).filter(
        (f): f is string => typeof f === 'string' && f in changes,
      )
    : [];
  const keys = [...listed, ...Object.keys(changes).filter((k) => !listed.includes(k))];
  if (keys.length === 0) return null;

  const head = describeChange(keys[0], changes[keys[0]]);
  const rest = keys.length - 1;
  return rest > 0 ? `${head} и ещё ${rest}` : head;
}

/**
 * S-UI-CLARITY-1: типы записей `activity_log`, которые написал ЧЕЛОВЕК.
 *
 * Ровно один: `comment_added` — его пишут `ActivityComposer` (заметка на сущность)
 * и `use-stage-transition` (комментарий к переходу). Всё остальное в `activity_log`
 * порождают клиентские хуки и триггеры БД: смены стадий, аудит полей (087),
 * автоматизации, AI-прогоны, удаления. Поэтому лента может честно предложить
 * «Заметки» отдельно от «Системы» — а не звать заметками весь журнал.
 */
export const NOTE_EVENT_TYPES: readonly string[] = ['comment_added'];

/** Заметка это или системная запись. Вход — сырой `event_type` (может быть null). */
export function isNoteEvent(eventType: string | null | undefined): boolean {
  return eventType != null && NOTE_EVENT_TYPES.includes(eventType);
}

export function describeEvent(entry: ActivityLog): string {
  const p = (entry.payload ?? {}) as Record<string, unknown>;
  switch (entry.event_type) {
    case 'stage_change':
      return `Стадия: ${stageName(p.from)} → ${stageName(p.to)}`;
    case 'stage_changed': {
      // Sprint T2: имена стадий приходят готовыми в payload (резолв stage_id→name
      // сделан на записи из pipeline_stages) — legacy-enum здесь не трогаем.
      const from = (p.from_name as string) || '—';
      const to = (p.to_name as string) || '—';
      const stage = `Стадия: ${from} → ${to}`;
      // 087: что ещё закрыли этим переходом. Производных полей (probability,
      // status, actual_close_date) в changes нет — их пишут BEFORE-триггеры стадии.
      const also = describeChanges(p);
      return also ? `${stage} · ${also}` : stage;
    }
    case 'call_logged':
      return p.contact_name ? `Звонок: ${p.contact_name}` : 'Звонок записан';
    case 'task_created':
      // D4: задачи из принятого AI-предложения пишут тот же `task_created` (иначе
      // в ленте была бы дыра), но помечены source — происхождение не теряется.
      return p.source === 'ai_progression_applied'
        ? `Задача (из предложения AI): ${p.title ?? ''}`
        : `Задача: ${p.title ?? ''}`;
    case 'task_completed':
      return `Выполнено: ${p.title ?? ''}`;
    case 'meeting_scheduled':
      return `Встреча: ${p.title ?? ''}`;
    case 'project_updated': {
      // 087: со значениями, если триггер их дал; иначе — прежний рендер по именам
      // колонок (все записи до 087).
      const detailed = describeChanges(p);
      if (detailed) return detailed;

      let fields = p.fields_changed as string[] | undefined;
      if (!fields || fields.length === 0) return 'Сделка обновлена';
      // Легаси `stage` при наличии `stage_id` — дубль той же смены, не показываем.
      if (fields.includes('stage_id')) fields = fields.filter((f) => f !== 'stage');
      // W2-дедуп: разные колонки дают один лейбл (won_reason/won_detail →
      // «причина выигрыша») — сворачиваем одинаковые подписи через Set.
      const labels = [...new Set(fields.map(fieldLabel))];
      return `Обновлено: ${labels.join(', ')}`;
    }
    case 'comment_added':
      return (p.text as string) ?? 'Комментарий';
    case 'automation_fired': {
      const trigger = p.trigger as string | undefined;
      const label = trigger ? AUTOMATION_TRIGGER_LABEL[trigger] ?? trigger : undefined;
      return label ? `Сработала автоматизация: ${label}` : 'Сработала автоматизация';
    }
    case 'ai_progression_applied': {
      // R2-P0-C: audit trail HITL-применения AI-предложения (I4). Показываем ЧТО
      // применили — «AI обновил сделку» без деталей в ленте бесполезно.
      const fields = (p.fields as string[] | undefined) ?? [];
      const tasks = typeof p.tasks === 'number' ? p.tasks : 0;
      const parts: string[] = [];
      if (fields.length > 0) parts.push([...new Set(fields.map(fieldLabel))].join(', '));
      if (tasks > 0) parts.push(`задач: ${tasks}`);
      return parts.length > 0
        ? `Применено предложение AI: ${parts.join('; ')}`
        : 'Применено предложение AI';
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
