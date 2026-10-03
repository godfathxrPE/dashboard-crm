// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: optimistic-правка кэша ленты и закреплённых заметок.
//
// Чистые функции — без React Query и Supabase. Лента лежит в `useInfiniteQuery` как
// `{ pages: TimelineEvent[][], pageParams }`, закреплённые — плоским `TimelineEvent[]`.
// Хуки (`use-notes.ts`) снимают снимок, зовут эти функции в `setQueriesData` и
// откатывают снимком при ошибке.
// ═══════════════════════════════════════════════════════

import { splitNoteHead } from '@/lib/text/note-blocks';
import type { TimelineEvent } from '@/types/timeline';

function isNote(e: TimelineEvent, noteId: string): boolean {
  return e.kind === 'note' && e.sourceId === noteId;
}

/** Событие заметки с новым телом: `title` пересобирается из первой строки. */
export function withNoteBody(e: TimelineEvent, body: string): TimelineEvent {
  return { ...e, body, title: splitNoteHead(body).head || 'Заметка' };
}

/**
 * Страницы ленты: заметку `noteId` заменяет `patch(event)`, `null` — убирает.
 * Возвращает ту же ссылку, если заметки в страницах нет: React Query не перерисует
 * подписчиков ленты, у которых правка заметки не видна (другой чип, другая сущность).
 */
export function patchNoteInPages<T extends { pages: TimelineEvent[][] }>(
  data: T | undefined,
  noteId: string,
  patch: (e: TimelineEvent) => TimelineEvent | null,
): T | undefined {
  if (!data) return data;
  if (!data.pages.some((page) => page.some((e) => isNote(e, noteId)))) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.flatMap((e) => {
        if (!isNote(e, noteId)) return [e];
        const next = patch(e);
        return next ? [next] : [];
      }),
    ),
  };
}

/** Плоский список (закреплённые заметки): то же правило, что у страниц. */
export function patchNoteInList(
  list: TimelineEvent[] | undefined,
  noteId: string,
  patch: (e: TimelineEvent) => TimelineEvent | null,
): TimelineEvent[] | undefined {
  if (!list) return list;
  if (!list.some((e) => isNote(e, noteId))) return list;
  return list.flatMap((e) => {
    if (!isNote(e, noteId)) return [e];
    const next = patch(e);
    return next ? [next] : [];
  });
}
