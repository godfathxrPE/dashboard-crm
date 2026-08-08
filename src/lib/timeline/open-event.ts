// ═══════════════════════════════════════════════════════
// openTimelineEvent — единый маппинг kind→действие для лент ВСЕХ хабов
// (contact / company / deal). Единственный источник правды: клик по
// событию ленты открывает одну и ту же сущность одинаково везде.
//
// project → навигация на карточку сделки.
// call/meeting/task/ai_run → точечная выборка строки по id (`.eq('id',…).single()`,
//   НЕ org-fetch) и открытие модалки через колбэк хаба.
// activity → без действия: у записи журнала нет своей карточки.
// ═══════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/client';
import type { TimelineEvent } from '@/types/timeline';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import type { Task } from '@/types/entities';
import type { AiRunRow } from '@/types/database';

const CALL_SELECT = '*, company:companies(id, name), contact:contacts(id, first_name, last_name), project:projects(id, name)';
const MEETING_SELECT = '*, project:projects(id, name)';
const TASK_SELECT = '*, project:projects(id, name), company:companies(id, name)';

export interface OpenTimelineEventCtx {
  router: { push: (href: string) => void };
  onCall?: (call: Call) => void;
  onMeeting?: (meeting: Meeting) => void;
  onTask?: (task: Task) => void;
  /**
   * S-AI-VIS-1. Хаб, который колбэк не передал, работает как раньше (клик молчит) —
   * сигнатура остаётся обратно совместимой.
   */
  onAiRun?: (run: AiRunRow) => void;
}

export async function openTimelineEvent(event: TimelineEvent, ctx: OpenTimelineEventCtx): Promise<void> {
  const supabase = createClient();
  switch (event.kind) {
    case 'project':
      // Тип строки projects тут неизвестен — /deals/[id], серверный бэкстоп
      // перенаправит delivery/internal на /projects/[id].
      ctx.router.push(`/deals/${event.sourceId}`);
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
    case 'ai_run': {
      if (!ctx.onAiRun) return;
      // Тянем строку целиком: модалка просмотра показывает и результат, и статус,
      // и текст ошибки — прогон в `error`/`pending` кликабелен наравне с готовым.
      const { data } = await supabase.from('ai_runs').select('*').eq('id', event.sourceId).single();
      if (data) ctx.onAiRun(data as unknown as AiRunRow);
      return;
    }
    default:
      return; // activity — записи журнала нечего открывать
  }
}
