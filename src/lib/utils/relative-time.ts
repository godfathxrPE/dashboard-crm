// ═══════════════════════════════════════════════════════
// S-DEAL-ACTIVITY-VIEW-1: «10ч назад» / «2д вперёд» / «11 сент» для строк ленты.
//
// Вынесено из `<EntityTimeline>` без изменения поведения, чтобы ту же подпись
// рисовала лента сделки (`DealActivityFeed`). `now` — аргументом, по конвенции
// чистых функций проекта (тесты фиксируют время, а не мокают Date).
//
// ⚠️ Это НЕ `relativeTime` из `activity-events.ts`: та принимает null и не знает
// будущего («вперёд»), а лента содержит задачи со сроком впереди.
// ═══════════════════════════════════════════════════════

export function relativeTime(date: string, now: number = Date.now()): string {
  const diff = now - new Date(date).getTime();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const suffix = diff >= 0 ? 'назад' : 'вперёд';
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м ${suffix}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч ${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д ${suffix}`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
