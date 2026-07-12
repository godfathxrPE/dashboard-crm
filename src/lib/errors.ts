// ═══════════════════════════════════════════════════════
// AUDIT A1.1 — единая классификация ошибок мутаций/запросов.
// Глобальный обработчик (QueryProvider) решает: тостить, показать
// «сессия истекла» + редирект, или пропустить (у ошибки свой UI).
// ═══════════════════════════════════════════════════════

interface NormalizedError {
  message?: string;
  code?: string;
  details?: string | null;
  status?: number;
}

function norm(err: unknown): NormalizedError {
  if (!err || typeof err !== 'object') return {};
  return err as NormalizedError;
}

/**
 * Гейт-ошибки со своим UI (стадийный гейт S27 / гейт завершения P3).
 * Их НЕ тостим — списки требований/вех показывают сами модалки
 * (parseStageGateError / parseDeliveryGateError в use-projects.ts).
 */
export function isGateError(err: unknown): boolean {
  const m = norm(err).message;
  return m === 'stage_gate_failed' || m === 'delivery_gate_failed';
}

/**
 * Протухшая/отозванная сессия (AUDIT 2.1). PostgREST на истёкшем JWT
 * отдаёт code `PGRST301` или HTTP 401; supabase-auth — AuthApiError со
 * status 401/403 и сообщением про JWT. Один общий предикат для mutation-
 * и query-обработчиков: любой такой отказ → «войдите заново» + редирект.
 */
export function isAuthError(err: unknown): boolean {
  const e = norm(err);
  if (e.code === 'PGRST301') return true;
  if (e.status === 401) return true;
  const msg = (e.message ?? '').toLowerCase();
  return (
    msg.includes('jwt expired') ||
    (msg.includes('jwt') && msg.includes('expired')) ||
    msg.includes('invalid jwt') ||
    msg.includes('invalid claim') ||
    msg.includes('token is expired') ||
    msg.includes('refresh_token_not_found')
  );
}

/**
 * Человекочитаемый текст для toast. Разбираем частые postgres/PostgREST
 * коды; на всё прочее — общий fallback (тех-детали остаются в err для консоли).
 */
export function humanizeError(err: unknown): string {
  const e = norm(err);
  const msg = e.message ?? '';
  const low = msg.toLowerCase();

  // Сеть/оффлайн
  if (low.includes('failed to fetch') || low.includes('networkerror') || low.includes('load failed')) {
    return 'Нет связи с сервером — проверьте интернет. Изменения не сохранены.';
  }
  // RLS-отказ
  if (low.includes('row-level security') || low.includes('violates row-level') || e.code === '42501') {
    return 'Недостаточно прав для этого действия.';
  }
  // Уникальность
  if (e.code === '23505' || low.includes('duplicate key')) {
    return 'Такая запись уже существует.';
  }
  // FK / RESTRICT
  if (e.code === '23503' || low.includes('foreign key')) {
    return 'Нельзя выполнить: есть связанные записи.';
  }
  // NOT NULL / проверка
  if (e.code === '23502' || e.code === '23514') {
    return 'Проверьте заполнение полей — есть некорректные значения.';
  }

  return msg && msg.length < 160 ? msg : 'Не удалось сохранить изменения. Попробуйте ещё раз.';
}
