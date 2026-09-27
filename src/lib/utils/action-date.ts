// ═══════════════════════════════════════════════════════
// S-LEAD-V2-LAYOUT-1: дата следующего шага — ОДНА функция на сделку, её peek и
// лид. До спринта было три дословные копии (`DealNextStep`, `DealFocusPanel`,
// `LeadDetail`), и первая же правка одной из них развела бы подписи экранов.
//
// «Сейчас» — аргументом, как у остальных чистых функций проекта: иначе тест
// «завтра» зависел бы от часов машины.
// ═══════════════════════════════════════════════════════

/** «сегодня/завтра/вчера» вблизи, иначе «7 июля». Невалидная строка — как есть. */
export function formatActionDate(value: string, now: Date = new Date()): string {
  // Ключ дня «YYYY-MM-DD» (колонка `date`) собирается ЛОКАЛЬНОЙ датой по частям.
  // `new Date('2026-09-28')` — это UTC-полночь: западнее UTC она уже вчера, и
  // «завтра» печаталось как «сегодня» (гейт S-LEAD-V2-HEALTH-1, TZ=America/Los_Angeles).
  const key = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = key ? new Date(Number(key[1]), Number(key[2]) - 1, Number(key[3])) : new Date(value);
  if (isNaN(d.getTime())) return value;
  const today = new Date(now.toDateString());
  const target = new Date(new Date(d).toDateString());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'завтра';
  if (diffDays === -1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
