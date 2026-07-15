/** Локальный YYYY-MM-DD (НЕ UTC). Заменяет toISOString().slice(0,10),
 *  который для UTC+ часовых поясов даёт вчерашнюю дату ночью/утром. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Локальный `YYYY-MM-DDTHH:mm` (НЕ UTC) для <input type="datetime-local">.
 *  Заменяет toISOString().slice(0,16), дающий UTC-время (звонок в 00:30 МСК
 *  показывался вчерашним 21:30). AUDIT 3.9. */
export function localDateTimeKey(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${localDateKey(d)}T${hh}:${mm}`;
}

/** Календарная дата YYYY-MM-DD в таймзоне Europe/Moscow — для timestamptz-полей (напр. deadline).
 *  en-CA форматирует как YYYY-MM-DD. Client-аналог `(ts AT TIME ZONE 'Europe/Moscow')::date`. */
export function mskDateKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(d);
}
