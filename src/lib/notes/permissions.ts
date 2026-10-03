// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: что пользователю показывать у заметки.
//
// Зеркало серверных прав 134 (RLS `notes_update`, RPC `set_note_pinned` /
// `soft_delete_note` / `restore_note`) — для УЧЁТА ВИДИМОСТИ КНОПОК, не для защиты:
// сервер всё равно проверяет. Задача зеркала — чтобы пользователь не видел кнопку,
// которая ответит «нет доступа» после клика.
//
//   owner / admin — всё;
//   manager       — свою заметку правит и удаляет, любую закрепляет, чужую не правит;
//   viewer / нет роли — только «Скопировать текст».
//
// Чистый модуль — без React и Supabase.
// ═══════════════════════════════════════════════════════

import type { OrgRole } from '@/types/database';

export interface NoteAbilities {
  /** Закрепить / открепить (RPC пускает owner/admin/manager на любую заметку). */
  canPin: boolean;
  /** Править текст: owner/admin — любую, manager — свою. */
  canEdit: boolean;
  /** Удалить (soft-delete): те же права, что у правки. */
  canDelete: boolean;
  /** «Скопировать текст» — у всех, включая viewer. */
  canCopy: true;
}

/**
 * `role` — результат `useOrgRole()`: `undefined` пока грузится, `null` без membership.
 * Пока роль неизвестна — права минимальные: кнопка, которая появится позже, лучше
 * кнопки, которая исчезнет под курсором.
 */
export function noteAbilities(
  role: OrgRole | null | undefined,
  userId: string | null | undefined,
  authorId: string | null | undefined,
): NoteAbilities {
  if (role === 'owner' || role === 'admin') {
    return { canPin: true, canEdit: true, canDelete: true, canCopy: true };
  }
  if (role === 'manager') {
    const own = Boolean(userId) && Boolean(authorId) && userId === authorId;
    return { canPin: true, canEdit: own, canDelete: own, canCopy: true };
  }
  return { canPin: false, canEdit: false, canDelete: false, canCopy: true };
}

/** Писать в ленту (композер, «Суть сделки», правка окон встреч и звонков): не viewer. */
export function canWriteFeed(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager';
}
