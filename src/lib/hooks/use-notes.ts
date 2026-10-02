'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { buildNoteInsert, noteErrorMessage, type NoteInput } from '@/lib/notes/build-insert';

// ═══════════════════════════════════════════════════════
// S-NOTES-1: запись заметок в `notes` (миграция 134). Чтение — через
// `entity_timeline` (`kind='note'`), своего списочного хука у заметок пока нет.
//
// ⚠️ Автора и организацию клиент НЕ шлёт: `created_by` — DEFAULT `auth.uid()`,
// `org_id` ставит триггер `set_org_id`. Сборка строки — `lib/notes/build-insert.ts`.
// ═══════════════════════════════════════════════════════

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
