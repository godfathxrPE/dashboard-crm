// ═══════════════════════════════════════════════════════
// openTimelineEvent — единый маппинг kind→действие для лент ВСЕХ хабов
// (contact / company / deal). Единственный источник правды: клик по
// событию ленты открывает одну и ту же сущность одинаково везде.
//
// project → навигация на карточку сделки.
// call/meeting/task → точечная выборка строки по id (`.eq('id',…).single()`,
//   НЕ org-fetch) и открытие модалки редактирования через колбэк хаба.
// activity/ai_run → без действия в этом спринте (Sprint B).
// ═══════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/client';
import type { TimelineEvent } from '@/types/timeline';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import type { Task } from '@/types/entities';

const CALL_SELECT = '*, company:companies(id, name), contact:contacts(id, first_name, last_name), project:projects(id, name)';
const MEETING_SELECT = '*, project:projects(id, name)';
const TASK_SELECT = '*, project:projects(id, name), company:companies(id, name)';

export interface OpenTimelineEventCtx {
  router: { push: (href: string) => void };
  onCall?: (call: Call) => void;
  onMeeting?: (meeting: Meeting) => void;
  onTask?: (task: Task) => void;
}

export async function openTimelineEvent(event: TimelineEvent, ctx: OpenTimelineEventCtx): Promise<void> {
  const supabase = createClient();
  switch (event.kind) {
    case 'project':
      ctx.router.push(`/projects/${event.sourceId}`);
      return;
    case 'call': {
      if (!ctx.onCall) return;
      const { data } = await supabase.from('calls').select(CALL_SELECT).eq('id', event.sourceId).single();
      if (data) ctx.onCall(data as unknown as Call);
      return;
    }
    case 'meeting': {
      if (!ctx.onMeeting) return;
      const { data } = await supabase.from('meetings').select(MEETING_SELECT).eq('id', event.sourceId).single();
      if (data) ctx.onMeeting(data as unknown as Meeting);
      return;
    }
    case 'task': {
      if (!ctx.onTask) return;
      const { data } = await supabase.from('tasks').select(TASK_SELECT).eq('id', event.sourceId).single();
      if (data) ctx.onTask(data as unknown as Task);
      return;
    }
    default:
      return; // activity / ai_run — без модалки в этом спринте
  }
}
