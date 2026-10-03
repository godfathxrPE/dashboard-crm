// ═══════════════════════════════════════════════════════
// S-NOTES-2.1: разбор ошибок RPC заметок.
//
// Чистый модуль — без Supabase и React (тот же приём, что `build-insert.ts`).
// Ошибка PostgREST — объект `{ code, hint, message, details }`; в хук её разбор не
// кладём, чтобы тест не тянул браузерный клиент.
// ═══════════════════════════════════════════════════════

const RAISE_EXCEPTION = 'P0001';
const PIN_LIMIT_HINT = 'notes_pin_limit';

/**
 * Четвёртое закрепление: `set_note_pinned` (134) бросает `P0001` с `hint =
 * 'notes_pin_limit'`. Другой `P0001` (чужой `raise exception` без этого hint) лимитом не
 * считается — тост «закреплено три» соврал бы.
 */
export function isPinLimitError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; hint?: unknown };
  return e.code === RAISE_EXCEPTION && e.hint === PIN_LIMIT_HINT;
}
