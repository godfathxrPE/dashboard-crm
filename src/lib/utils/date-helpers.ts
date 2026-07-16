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

// ─── Gantt бакет-ось (S-GANTT-VIEW-1) ──────────────────────────────────────
// Вся математика на UTC-полдне (T12:00:00Z), как buildDays v0 — инкремент дня/
// недели/месяца в любой TZ не прыгает через полночь (off-by-one на границах).

export type GanttZoom = 'day' | 'week' | 'month';

const GANTT_DAY_MS = 86_400_000;
const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function noonMs(dateKey: string): number {
  return Date.parse(`${dateKey}T12:00:00Z`);
}
function keyOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Ключ бакета, в который попадает YYYY-MM-DD: day → сам; week → понедельник ISO-недели; month → 1-е число. */
export function bucketKeyOf(dateKey: string, zoom: GanttZoom): string {
  if (zoom === 'day') return dateKey;
  if (zoom === 'month') return `${dateKey.slice(0, 7)}-01`;
  const ms = noonMs(dateKey);
  const back = (new Date(ms).getUTCDay() + 6) % 7; // 0=Sun..6=Sat → дней назад до Пн
  return keyOfMs(ms - back * GANTT_DAY_MS);
}

function nextBucketKey(key: string, zoom: GanttZoom): string {
  if (zoom === 'day') return keyOfMs(noonMs(key) + GANTT_DAY_MS);
  if (zoom === 'week') return keyOfMs(noonMs(key) + 7 * GANTT_DAY_MS);
  const d = new Date(noonMs(key));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.toISOString().slice(0, 7)}-01`;
}

/** Сдвиг даты YYYY-MM-DD на n бакетов текущего zoom (та же UTC-полдень математика,
 *  что и nextBucketKey). day → ±n дней; week → ±n×7 дней (день недели сохраняется);
 *  month → ±n календарных месяцев (день месяца сохраняется).
 *  ВНИМАНИЕ (month): setUTCMonth на 31-х числах даёт штатный roll — напр. 31 янв +1мес
 *  = «31 фев» → 3 мар. Для month-zoom это ОК (грубый шаг «на вскидку»), плюс на записи
 *  срабатывает клэмп start≤end в GanttTimeline. */
export function shiftDateKeyByBuckets(dateKey: string, zoom: GanttZoom, n: number): string {
  if (zoom === 'day') return keyOfMs(noonMs(dateKey) + n * GANTT_DAY_MS);
  if (zoom === 'week') return keyOfMs(noonMs(dateKey) + n * 7 * GANTT_DAY_MS);
  const d = new Date(noonMs(dateKey));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function bucketLabel(key: string, zoom: GanttZoom): string {
  if (zoom === 'day') return key.slice(8, 10);                    // DD
  if (zoom === 'week') return `${key.slice(8, 10)}.${key.slice(5, 7)}`; // DD.MM (Пн)
  return `${RU_MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`; // МММ YYYY
}

/** Список бакетов [min..max] включительно (по ключам бакетов). */
export function buildBuckets(minKey: string, maxKey: string, zoom: GanttZoom): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const last = bucketKeyOf(maxKey, zoom);
  let cur = bucketKeyOf(minKey, zoom);
  let guard = 0;
  while (cur <= last && guard < 100_000) {
    buckets.push({ key: cur, label: bucketLabel(cur, zoom) });
    cur = nextBucketKey(cur, zoom);
    guard += 1;
  }
  return buckets;
}

/** Индекс бакета для даты; -1 если вне диапазона. */
export function bucketIndexOf(dateKey: string, zoom: GanttZoom, buckets: { key: string }[]): number {
  const bk = bucketKeyOf(dateKey, zoom);
  return buckets.findIndex((b) => b.key === bk);
}
