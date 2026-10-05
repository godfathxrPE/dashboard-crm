// src/lib/domain/focus-feed.ts — S-TODAY-FOCUS-4
//
// Лента фокуса экрана «Сегодня»: вид события для чипа и иконки, фильтр по виду и
// по дню. Спека `today-focus-spec.md`, §7; решения F-06 (пульс фильтрует ленту
// по дню) и F-08 (цвет — только у смены стадии).
//
// День события — `mskDateKey`: та же ось, что у пульса (`buildPulseDays`). Иначе
// событие в 01:30 МСК легло бы в ленте на вчерашний день, а в пульсе — на сегодня.
//
// `now` — аргумент, не `Date.now()` внутри (урок S-LEAD-HUB-2b).

import { isStageEvent } from '@/lib/timeline/feed-model';
import { mskDateKey } from '@/lib/utils/date-helpers';
import type { TimelineEvent } from '@/types/timeline';

export type FeedBucket = 'note' | 'call' | 'stage' | 'other';

type BucketFields = Pick<TimelineEvent, 'kind' | 'eventType' | 'noteKind'>;
type FeedFields = Pick<TimelineEvent, 'kind' | 'eventType' | 'noteKind' | 'date'>;

/**
 * Вид события для чипа и иконки.
 *
 * Смена стадии — по правилу ленты карточки сделки (`isStageEvent`): это и
 * `stage_changed`, и легаси `stage_change` до 14.07. Комментарий перехода — заметка
 * с `noteKind: 'stage_comment'`; в карточке он стоит внутри смены стадии, поэтому
 * здесь он тоже «стадия», а не «заметка».
 */
export function feedBucket(e: BucketFields): FeedBucket {
  if (isStageEvent(e) || e.noteKind === 'stage_comment') return 'stage';
  if (e.kind === 'note') return 'note';
  if (e.kind === 'call') return 'call';
  return 'other';
}

export interface FeedFilter {
  bucket: FeedBucket | 'all';
  /** День 'YYYY-MM-DD' по МСК; null — все дни. */
  day: string | null;
}

/** События не позже `now`, под фильтр, по убыванию даты — как пришли. */
export function filterFeed<T extends FeedFields>(events: readonly T[], filter: FeedFilter, now: Date): T[] {
  const nowMs = now.getTime();
  return events.filter(
    (e) =>
      new Date(e.date).getTime() <= nowMs &&
      (filter.bucket === 'all' || feedBucket(e) === filter.bucket) &&
      (filter.day === null || mskDateKey(e.date) === filter.day),
  );
}

/** Счёт по видам среди событий не позже `now`. */
export function countBuckets(events: readonly FeedFields[], now: Date): Record<FeedBucket | 'all', number> {
  const nowMs = now.getTime();
  const counts: Record<FeedBucket | 'all', number> = { all: 0, note: 0, call: 0, stage: 0, other: 0 };
  for (const e of events) {
    if (new Date(e.date).getTime() > nowMs) continue;
    counts.all += 1;
    counts[feedBucket(e)] += 1;
  }
  return counts;
}
