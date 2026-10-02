// ═══════════════════════════════════════════════════════
// S-NOTES-1: сборка строки INSERT в `notes` и разбор ошибки записи.
//
// Чистый модуль — без Supabase и React, чтобы тесты не тянули браузерный клиент
// (тот же приём, что `rpc-adapter.ts`).
//
// ⚠️ Клиент шлёт ТОЛЬКО то, что разрешают column-GRANT'ы миграции 134:
// `project_id | lead_id | company_id | contact_id`, `body`, `kind`, `meta`.
// `org_id` ставит триггер `set_org_id`, `created_by` — DEFAULT `auth.uid()`; всё
// остальное (`pinned_*`, `deleted_at`, `edited_at`) недоступно клиенту вообще —
// лишний ключ в запросе упал бы `42501`, а не молча игнорировался.
// ═══════════════════════════════════════════════════════

import type { Json } from '@/types/database';
import type { NoteInsert } from '@/types/entities';

export type NoteKind = 'note' | 'stage_comment';

export interface NoteInput {
  project_id?: string;
  lead_id?: string;
  company_id?: string;
  contact_id?: string;
  body: string;
  kind?: NoteKind;
  meta?: Record<string, Json>;
}

/**
 * Строка INSERT: только переданные FK (как `useLogActivity`) — `undefined` в объект не
 * кладём, иначе в запрос уехал бы ключ с пустым значением, а `notes_has_parent`
 * требует хотя бы одного родителя. `kind`/`meta` — только если заданы: у БД есть
 * дефолты, и повторять их на клиенте значит завести вторую копию.
 */
export function buildNoteInsert(input: NoteInput): NoteInsert {
  const row: NoteInsert = { body: input.body.trim() };
  if (input.project_id) row.project_id = input.project_id;
  if (input.lead_id) row.lead_id = input.lead_id;
  if (input.company_id) row.company_id = input.company_id;
  if (input.contact_id) row.contact_id = input.contact_id;
  if (input.kind) row.kind = input.kind;
  if (input.meta) row.meta = input.meta;
  return row;
}

/** Потолок из `notes_body_len` (1…20 000 знаков после `btrim`). */
export const NOTE_MAX_LENGTH = 20000;

const CHECK_VIOLATION = '23514';
const CHECK_MESSAGE = 'Заметка пустая или длиннее 20 000 символов';

/**
 * Человеческий текст ошибки записи заметки. `23514` (check) — единственный код со
 * своим текстом: пустая заметка и превышение лимита различаются одним ограничением
 * `notes_body_len`, и клиент знает обе причины заранее. Остальное — общий текст:
 * сырое сообщение Postgres пользователю не показываем.
 */
export function noteErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    if ((err as { code?: unknown }).code === CHECK_VIOLATION) return CHECK_MESSAGE;
  }
  return 'Не удалось сохранить заметку';
}
