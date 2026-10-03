// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: строка `notes` → событие ленты. Одно место сборки для двух источников:
// RPC `entity_timeline` (`rpc-adapter.ts`, payload) и прямой запрос закреплённых
// (`usePinnedNotes`, строка таблицы). Поля обоих называются одинаково, поэтому
// карточка заметки в зоне «Закреплено» и в истории — один и тот же `TimelineEvent`.
//
// Чистый модуль — без Supabase и React.
// ═══════════════════════════════════════════════════════

import { splitNoteHead } from '@/lib/text/note-blocks';
import type { TimelineEvent } from '@/types/timeline';

export interface NoteEventInput {
  /** Ключ события в ленте: `note:<uuid>`. */
  id: string;
  /** Голый uuid строки `notes`. */
  sourceId: string;
  /** `notes.created_at` — дата события. */
  date: string;
  actorId: string | null;
  body: string;
  kind: string | null;
  /** jsonb `notes.meta` как пришёл: `unknown`, сужается здесь. */
  meta: unknown;
  pinnedAt: string | null;
  editedAt: string | null;
}

/** `notes.meta` → ключи стадий. `undefined`, когда ни одного нет (обычная заметка: `{}`). */
export function parseNoteMeta(meta: unknown): TimelineEvent['noteMeta'] {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined;
  const m = meta as Record<string, unknown>;
  const from = typeof m.from_stage_id === 'string' && m.from_stage_id ? m.from_stage_id : undefined;
  const to = typeof m.to_stage_id === 'string' && m.to_stage_id ? m.to_stage_id : undefined;
  if (!from && !to) return undefined;
  return { ...(from ? { fromStageId: from } : {}), ...(to ? { toStageId: to } : {}) };
}

export function buildNoteEvent(input: NoteEventInput): TimelineEvent {
  // `title` — первая строка тела, как в плитке ленты; `body` — весь текст.
  const head = splitNoteHead(input.body).head;
  const noteMeta = parseNoteMeta(input.meta);
  return {
    id: input.id,
    sourceId: input.sourceId,
    kind: 'note',
    title: head || 'Заметка',
    date: input.date,
    icon: 'note',
    body: input.body,
    actorId: input.actorId ?? undefined,
    pinnedAt: input.pinnedAt,
    editedAt: input.editedAt,
    noteKind: input.kind === 'stage_comment' ? 'stage_comment' : 'note',
    ...(noteMeta ? { noteMeta } : {}),
  };
}
