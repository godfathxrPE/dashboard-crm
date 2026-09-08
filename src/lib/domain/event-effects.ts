// src/lib/domain/event-effects.ts — S-DEAL-EVENT-1 (W5)
//
// Следствия события: что человек поменял в сделке ПОСЛЕ звонка/встречи/заметки.
// Сегодня лента показывает звонок и, строками ниже, «Дата шага: 1 сент → 2 сент»;
// что второе произошло из-за первого, читатель восстанавливает в голове. Здесь
// эта связь считается явно.
//
// ⚠️ Связь ЭВРИСТИЧЕСКАЯ и вычисляется НА ЧТЕНИИ. Внешнего ключа «событие →
// изменённые поля» в схеме нет, и заводить его спринт не стал: писателей
// `activity_log` четыре (триггеры удаления 009/011, аудит полей 087, лид-статусы
// 118, клиентские вставки), и каждому пришлось бы знать о причине. В БД эта
// функция не пишет ничего. Появится настоящий `source_event_id` — она схлопнется
// в один join, а потребители не изменятся.
//
// Честность эвристики держится на двух правилах: окно минутное (аудит 087 пишет
// из триггера СИНХРОННО с UPDATE) и совпадение актора. События без актора
// (триггеры, cron) следствий не получают вовсе — приписать чужую правку системе
// хуже, чем не показать связь.
//
// `now` — аргумент, не `Date.now()` внутри (урок S-LEAD-HUB-2b: `leadStaleness`
// читала часы мимо переданного времени, и тест этого не поймал).

import { describeChange } from '@/lib/utils/activity-events';

/**
 * Окно, в котором изменение поля считается следствием события.
 *
 * Пять минут потому, что аудит 087 пишет синхронно с UPDATE, а человек, поменявший
 * шаг «по итогам звонка», делает это в те же минуты, пока карточка открыта. Часы
 * тут не годятся: за час в сделке успевает произойти работа, к событию отношения
 * не имеющая, и виджет начал бы врать уверенным тоном.
 */
export const EVENT_EFFECT_WINDOW_MS = 5 * 60_000;

/** Сколько следствий показываем строками; остальное — числом в `more`. */
const MAX_EFFECTS = 3;

export interface EffectSource {
  id: string;
  at: string;
  actorId: string | null;
  eventType: string | null;
  changes?: Record<string, Record<string, unknown>>;
}

export interface Effect {
  field: string;
  text: string;
}

/**
 * Изменения полей, случившиеся ПОСЛЕ события в пределах окна, тем же актором.
 *
 * `now` ограничивает кандидатов сверху: запись, датированная дальше окна вперёд
 * от текущего момента, — сбой часов или данных, а не следствие. Допуск ровно в
 * окно, а не «строго не позже now», потому что рассинхрон часов браузера и БД в
 * несколько секунд — обычное дело, и жёсткая граница съедала бы настоящие
 * следствия, записанные только что.
 */
export function resolveEventEffects(
  anchor: EffectSource,
  candidates: readonly EffectSource[],
  windowMs: number,
  now: number = Date.now(),
): { effects: Effect[]; more: number } {
  const anchorAt = Date.parse(anchor.at);
  // Актор обязателен С ОБЕИХ сторон: у события без актора следствий не бывает,
  // и проверка стоит до перебора, чтобы это читалось как правило, а не как
  // побочный результат сравнения `null === null` (которое иначе прошло бы).
  if (!anchor.actorId || Number.isNaN(anchorAt)) return { effects: [], more: 0 };

  const limit = now + windowMs;
  const matched = candidates
    .filter((c) => {
      // Сам якорь — по `id`, а не по времени: два события одной секунды бывают,
      // и отсев по `at` выкинул бы вместе с якорем настоящего кандидата.
      if (c.id === anchor.id) return false;
      if (!c.actorId || c.actorId !== anchor.actorId) return false;
      if (!c.changes) return false;
      const at = Date.parse(c.at);
      if (Number.isNaN(at)) return false;
      if (at > limit) return false;
      return at > anchorAt && at - anchorAt <= windowMs;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const all: Effect[] = [];
  for (const c of matched) {
    // Порядок полей внутри записи — как их отдал объект: `fields_changed` сюда
    // не доезжает (в модели события его нет), а выдумывать свой порядок значило
    // бы разойтись со строкой ленты, собранной по тем же данным.
    for (const [field, ch] of Object.entries(c.changes ?? {})) {
      all.push({ field, text: describeChange(field, ch) });
    }
  }

  return {
    effects: all.slice(0, MAX_EFFECTS),
    more: Math.max(0, all.length - MAX_EFFECTS),
  };
}
