'use client';

import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { buildNoteInsert, noteErrorMessage, type NoteInput } from '@/lib/notes/build-insert';
import { patchNoteInList, patchNoteInPages, withNoteBody } from '@/lib/notes/cache-patch';
import { isPinLimitError } from '@/lib/notes/errors';
import { buildNoteEvent } from '@/lib/timeline/note-event';
import type { TimelineEvent } from '@/types/timeline';
import { useActorMap } from './use-actor';

// ═══════════════════════════════════════════════════════
// S-NOTES-1: запись заметок в `notes` (миграция 134). Чтение — через
// `entity_timeline` (`kind='note'`).
//
// S-NOTES-2.1: правка, закрепление, удаление и возврат (RPC 134), плюс отдельный запрос
// закреплённых заметок сущности (`usePinnedNotes`).
//
// ⚠️ Автора и организацию клиент НЕ шлёт: `created_by` — DEFAULT `auth.uid()`,
// `org_id` ставит триггер `set_org_id`. Сборка строки — `lib/notes/build-insert.ts`.
// ═══════════════════════════════════════════════════════

/** Префикс кэша ленты: его сбрасывают все мутации заметок. */
const TIMELINE_KEY = ['timeline'] as const;

/** Ключ закреплённых заметок сущности. Префикс отдельный: не `['timeline']` и не `['tasks']`. */
export function pinnedNotesKey(entityType: NoteEntityType, entityId: string): string[] {
  return ['notes-pinned', entityType, entityId];
}
const PINNED_KEY = ['notes-pinned'] as const;

export type NoteEntityType = 'project' | 'lead' | 'company' | 'contact';

const FK_COLUMN = {
  project: 'project_id',
  lead: 'lead_id',
  company: 'company_id',
  contact: 'contact_id',
} as const satisfies Record<NoteEntityType, string>;

/** Максимум закреплённых на сущность — `set_note_pinned` (134) режет четвёртое. */
export const PINNED_LIMIT = 3;

const PIN_LIMIT_TEXT = 'Закреплено уже три заметки. Открепите одну — и эта встанет на её место.';
const DELETED_TEXT = 'Заметка удалена';
const DELETED_UNDO_MS = 8000;

type TimelineData = InfiniteData<TimelineEvent[]>;
type Snapshot = Array<[QueryKey, unknown]>;

/** Снимок обоих кэшей до optimistic-правки: откат — `restoreSnapshot`. */
async function snapshotCaches(qc: QueryClient): Promise<Snapshot> {
  await Promise.all([
    qc.cancelQueries({ queryKey: TIMELINE_KEY }),
    qc.cancelQueries({ queryKey: PINNED_KEY }),
  ]);
  return [
    ...qc.getQueriesData<TimelineData>({ queryKey: TIMELINE_KEY }),
    ...qc.getQueriesData<TimelineEvent[]>({ queryKey: PINNED_KEY }),
  ];
}

function restoreSnapshot(qc: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

function patchCaches(
  qc: QueryClient,
  noteId: string,
  patch: (e: TimelineEvent) => TimelineEvent | null,
) {
  qc.setQueriesData<TimelineData>({ queryKey: TIMELINE_KEY }, (old) =>
    patchNoteInPages(old, noteId, patch),
  );
  qc.setQueriesData<TimelineEvent[]>({ queryKey: PINNED_KEY }, (old) =>
    patchNoteInList(old, noteId, patch),
  );
}

function invalidateNoteCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: TIMELINE_KEY });
  void qc.invalidateQueries({ queryKey: PINNED_KEY });
}

/**
 * Заметка на сущность (ввод в ленте сделки / лида / компании / контакта).
 * Передавай ровно один из `project_id`/`lead_id`/`company_id`/`contact_id`.
 * Лента (`['timeline']`) обновляется по `onSettled`, как у `useLogActivity`.
 */
export function useCreateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: NoteInput) => {
      const supabase = createClient();
      const { error } = await supabase.from('notes').insert(buildNoteInsert(input));
      if (error) throw error;
    },
    onError: (err) => {
      toast.error(noteErrorMessage(err));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

/**
 * Fire-and-forget для вызова из `onSuccess` другой мутации (комментарий к переходу
 * стадии). Не блокирует основную мутацию: ошибка — тост, а не исключение, потому что
 * сама смена стадии к этому моменту уже прошла гейт и откатывать её незачем.
 */
export async function insertNote(input: NoteInput): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from('notes').insert(buildNoteInsert(input));
    if (error) throw error;
  } catch (err) {
    console.error('Note insert error:', err);
    toast.error(noteErrorMessage(err));
  }
}

/**
 * Правка текста заметки на месте. Клиенту разрешён только `body` (column-grant 134);
 * `edited_at` ставит триггер `notes_touch` — в кэш его руками не пишем, после успеха
 * лента перечитывается и берёт настоящую отметку.
 *
 * Optimistic: тело в кэше меняется сразу, при ошибке — откат снимком и тост.
 * `mutateAsync` бросает дальше: карточка в режиме правки по отказу оставляет текст в поле.
 */
export function useUpdateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const supabase = createClient();
      // `.select('id')`: UPDATE, закрытый RLS (чужая заметка, уже удалённая), ошибки не даёт —
      // он просто меняет 0 строк. Пустой ответ — отказ, а не «сохранено».
      const { data, error } = await supabase
        .from('notes')
        .update({ body: body.trim() })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('note not updated');
    },
    onMutate: async ({ id, body }) => {
      const snapshot = await snapshotCaches(qc);
      patchCaches(qc, id, (e) => withNoteBody(e, body.trim()));
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      restoreSnapshot(qc, ctx?.snapshot);
      toast.error(noteErrorMessage(err));
    },
    onSettled: () => invalidateNoteCaches(qc),
  });
}

/**
 * Закрепить / открепить. Лимит — три на сущность (RPC): четвёртое даёт `P0001` +
 * `hint = 'notes_pin_limit'`, для него свой текст. Без optimistic: исход зависит от
 * лимита, который клиент считает хуже сервера (параллельные закрепления).
 */
export function useSetNotePinned() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const supabase = createClient();
      const { error } = await supabase.rpc('set_note_pinned', { p_note_id: id, p_pinned: pinned });
      if (error) throw error;
    },
    onError: (err) => {
      toast.error(isPinLimitError(err) ? PIN_LIMIT_TEXT : noteErrorMessage(err));
    },
    onSettled: () => invalidateNoteCaches(qc),
  });
}

async function restoreNote(qc: QueryClient, id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc('restore_note', { p_note_id: id });
  if (error) toast.error('Не удалось вернуть заметку');
  invalidateNoteCaches(qc);
}

/**
 * Удаление без confirm-диалога: карточка пропадает сразу, тост на 8 секунд держит
 * «Вернуть» (`restore_note`). Физического удаления нет — soft-delete 134, снимает закрепление.
 */
export function useSoftDeleteNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.rpc('soft_delete_note', { p_note_id: id });
      if (error) throw error;
    },
    onMutate: async (id) => {
      const snapshot = await snapshotCaches(qc);
      patchCaches(qc, id, () => null);
      return { snapshot };
    },
    onError: (err, _id, ctx) => {
      restoreSnapshot(qc, ctx?.snapshot);
      toast.error(noteErrorMessage(err));
    },
    onSuccess: (_data, id) => {
      toast(DELETED_TEXT, {
        duration: DELETED_UNDO_MS,
        action: { label: 'Вернуть', onClick: () => void restoreNote(qc, id) },
      });
    },
    onSettled: () => invalidateNoteCaches(qc),
  });
}

/**
 * Закреплённые заметки сущности — до трёх, по порядку закрепления.
 *
 * Отдельный запрос, а не выборка из ленты: лента пагинирована keyset'ом, и закреплённая
 * заметка может лежать на любой странице. События собраны тем же `buildNoteEvent`, что
 * и в ленте, — карточка заметки одна на обе зоны.
 */
export function usePinnedNotes(entityType: NoteEntityType, entityId: string | null | undefined) {
  const query = useQuery({
    queryKey: pinnedNotesKey(entityType, entityId ?? ''),
    enabled: Boolean(entityId),
    staleTime: 60_000,
    queryFn: async (): Promise<TimelineEvent[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notes')
        .select('id, body, kind, meta, created_by, created_at, pinned_at, edited_at')
        .eq(FK_COLUMN[entityType], entityId as string)
        .not('pinned_at', 'is', null)
        .is('deleted_at', null)
        .order('pinned_at', { ascending: true })
        .limit(PINNED_LIMIT);
      if (error) throw error;
      return (data ?? []).map((n) =>
        buildNoteEvent({
          id: `note:${n.id}`,
          sourceId: n.id,
          date: n.created_at,
          actorId: n.created_by,
          body: n.body,
          kind: n.kind,
          meta: n.meta,
          pinnedAt: n.pinned_at,
          editedAt: n.edited_at,
        }),
      );
    },
  });

  // Имя автора — из кэша команды, как у ленты (`useEntityTimeline`): строка таблицы его не несёт.
  const actorMap = useActorMap();
  const notes = useMemo(
    () =>
      (query.data ?? []).map((e) => (e.actorId ? { ...e, actorName: actorMap.get(e.actorId) } : e)),
    [query.data, actorMap],
  );

  return { notes, isLoading: query.isLoading, error: query.error as Error | null };
}
