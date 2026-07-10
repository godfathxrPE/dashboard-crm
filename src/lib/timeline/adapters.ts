// ═══════════════════════════════════════════════════════
// Адаптеры источник → TimelineEvent.
// Чистые функции (Row → Event), без запросов и side-effects.
// XSS-гигиена (как в S28): только текст в title/detail, никакого HTML.
// ═══════════════════════════════════════════════════════

import type { TimelineEvent } from '@/types/timeline';
import type { ProjectType } from '@/types/database';
import type { CallStatus } from '@/lib/validators/call';
import type { DealStage } from '@/lib/validators/project';
import { STAGE_CONFIG } from '@/lib/validators/project';
import type { TaskLane } from '@/types/database';

// ─── Минимальные входные формы (подмножество Row, что реально читаем) ───

export interface CallEventRow {
  id: string;
  date: string;
  status: CallStatus;
  next_step: string | null;
  agreements: string | null;
}

export interface MeetingEventRow {
  id: string;
  date: string;
  title: string;
  next_step: string | null;
  notes: string | null;
}

export interface TaskEventRow {
  id: string;
  text: string;
  lane: TaskLane;
  deadline: string | null;
  created_at: string;
}

export interface ProjectEventRow {
  id: string;
  name: string;
  type: ProjectType;
  stage: DealStage | null;
  created_at: string;
}

// ─── Адаптеры ───

export function callToEvent(c: CallEventRow): TimelineEvent {
  const status: TimelineEvent['status'] =
    c.status === 'done' ? 'done' : c.status === 'pending' ? 'pending' : undefined;
  const title =
    c.status === 'done' ? 'Звонок выполнен'
    : c.status === 'pending' ? 'Звонок запланирован'
    : 'Звонок отменён';
  return {
    id: `call:${c.id}`,
    sourceId: c.id,
    kind: 'call',
    title,
    date: c.date,
    detail: c.next_step ?? c.agreements ?? undefined,
    status,
    icon: 'call',
  };
}

export function meetingToEvent(m: MeetingEventRow): TimelineEvent {
  return {
    id: `meeting:${m.id}`,
    sourceId: m.id,
    kind: 'meeting',
    title: m.title ? `Встреча: ${m.title}` : 'Встреча',
    date: m.date,
    detail: m.next_step ?? m.notes ?? undefined,
    icon: 'meeting',
  };
}

/**
 * overdue = deadline < now && задача не в колонке done.
 * `now` параметром — чистота/тестируемость (по умолчанию Date.now()).
 * Дата события — deadline (если есть), иначе created_at.
 */
export function taskToEvent(t: TaskEventRow, now: number = Date.now()): TimelineEvent {
  const done = t.lane === 'done';
  const overdue = !done && t.deadline != null && new Date(t.deadline).getTime() < now;
  const status: TimelineEvent['status'] = done ? 'done' : overdue ? 'overdue' : 'pending';
  const detail = t.deadline
    ? `срок ${new Date(t.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
    : undefined;
  return {
    id: `task:${t.id}`,
    sourceId: t.id,
    kind: 'task',
    title: `Задача: ${t.text}`,
    date: t.deadline ?? t.created_at,
    detail,
    status,
    icon: 'task',
  };
}

export function projectToEvent(p: ProjectEventRow): TimelineEvent {
  return {
    id: `project:${p.id}`,
    sourceId: p.id,
    kind: 'project',
    title: p.type === 'internal' ? `Проект: ${p.name}` : `Сделка: ${p.name}`,
    date: p.created_at,
    detail: p.stage ? STAGE_CONFIG[p.stage]?.shortLabel : undefined,
    icon: 'project',
  };
}
