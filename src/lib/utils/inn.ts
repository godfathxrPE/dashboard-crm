// S-INN-1: формат ИНН и статус юрлица из ЕГРЮЛ. Чистый домен, без React и запросов.

/**
 * 10 цифр — юрлицо, 12 — ИП. Контрольная сумма не считается сознательно: факт
 * существования проверяет сам реестр при lookup, а самодельный чек-дайджест дал бы
 * ложные отказы на редких валидных номерах.
 *
 * ⚠️ Копия регэкспа живёт в Edge Function (`supabase/functions/company-lookup/normalize.ts`):
 * Deno-функция и next-бандл не делят модули, а сервер обязан валидировать вход сам —
 * клиентской проверке доверять нельзя. Правишь здесь — правь и там.
 */
export const INN_RE = /^\d{10}$|^\d{12}$/;

/** Пустое/пробелы — валидно: ИНН необязателен. Заполненное — только по формату. */
export function isValidInn(value: string | null | undefined): boolean {
  const t = value?.trim() ?? '';
  return t === '' || INN_RE.test(t);
}

/** Готов ли ИНН к запросу в реестр (пустой — не готов, в отличие от `isValidInn`). */
export function isLookupableInn(value: string | null | undefined): boolean {
  const t = value?.trim() ?? '';
  return INN_RE.test(t);
}

/**
 * Статусы ЕГРЮЛ, которые отдаёт DaData. Словарь принадлежит реестру, поэтому в БД
 * колонка `inn_status` — TEXT без enum, а незнакомое значение здесь показывается
 * как есть, а не проглатывается.
 */
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Действующее',
  LIQUIDATING: 'В процессе ликвидации',
  LIQUIDATED: 'Ликвидировано',
  REORGANIZING: 'В процессе реорганизации',
  BANKRUPT: 'Банкротство',
};

export function innStatusLabel(status: string | null | undefined): string | null {
  const s = status?.trim();
  if (!s) return null;
  return STATUS_LABELS[s] ?? s;
}

/**
 * Не-ACTIVE — прямой риск-сигнал для пресейла: договор с ликвидируемым юрлицом
 * подписывать нельзя. NULL (статус неизвестен) риском НЕ считаем — иначе жёлтая
 * плашка висела бы на всех 224 компаниях, заведённых до этой фичи.
 */
export function isRiskyInnStatus(status: string | null | undefined): boolean {
  const s = status?.trim();
  return !!s && s !== 'ACTIVE';
}
