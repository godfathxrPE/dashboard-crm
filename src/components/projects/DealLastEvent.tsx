'use client';

import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { KIND_META } from '@/lib/timeline/kind-meta';
import {
  resolveEventEffects,
  EVENT_EFFECT_WINDOW_MS,
  type EffectSource,
} from '@/lib/domain/event-effects';
import { formatDateShort } from '@/lib/utils/dates';
import { mskTime } from '@/lib/utils/date-helpers';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-DEAL-EVENT-1 (W5): «Последнее событие» над лентой сделки.
//
// Смысл блока — не повторить первую строку ленты крупнее, а показать СЛЕДСТВИЯ:
// что человек поменял в сделке после этого звонка/встречи. Сегодня «Дата шага:
// 1 сент → 2 сент» стоит в ленте отдельной строкой, и связь с событием читатель
// достраивает сам.
//
// Материал — `.sheet`, тот же, что у «Следующего шага». Тёмное стекло из спеки
// НЕ вводится намеренно: «Следующий шаг» — работа, «Последнее событие» —
// контекст, и более тяжёлый материал на менее важном блоке перевернул бы
// иерархию зоны. Материал зоны «Работа» целиком — предмет W2, и W5 не заводит
// то, что W2 может отменить через спринт.
// ═══════════════════════════════════════════════════════

/**
 * Тип ОДНОГО события — единственным числом.
 *
 * ⚠️ Это не дубль `KIND_LABEL` из `<EntityTimeline>`: там подписи ЧИПОВ фильтра,
 * и они множественные («Звонки»), потому что чип означает набор. Здесь речь об
 * одном событии, и «Звонки · 5 сент · Олег» читалось бы как ошибка. Одна карта
 * на два числа была бы ложным переиспользованием — иконка, которая у чипа и у
 * события действительно одна, берётся из общей `KIND_META`.
 */
const KIND_TITLE: Record<TimelineKind, string> = {
  call: 'Звонок',
  meeting: 'Встреча',
  task: 'Задача',
  project: 'Сделка',
  activity: 'Событие',
  ai_run: 'AI-прогон',
};

/**
 * Подпись действия — по тому, ЧТО произойдёт по клику (`openTimelineEvent`).
 *
 * Кнопок не две, а одна. Спека называет обе — «Изменить» и «Открыть», — но обе
 * ушли бы в один и тот же `onOpenEvent`, то есть делали бы буквально одно и то
 * же под разными именами. Поэтому подпись выбирается по виду события: модалка
 * звонка/встречи/задачи — это редактор, карточка сделки и результат AI-прогона
 * открываются на просмотр.
 *
 * `null` — действия нет: у записи журнала без ссылки на задачу своей карточки не
 * существует, и клик по ней молчит (`open-event.ts`). Кнопка, которая внешне
 * работает, а внутри не делает ничего, — тот же дефект, что серая-на-вид кнопка
 * «Применить выбранное» в SDP.
 */
function actionLabel(event: TimelineEvent): string | null {
  switch (event.kind) {
    case 'call':
    case 'meeting':
    case 'task':
      return 'Изменить';
    case 'project':
    case 'ai_run':
      return 'Открыть';
    case 'activity':
      return event.refType === 'task' ? 'Изменить' : null;
  }
}

/** Событие ленты → вход домена следствий. */
function toSource(e: TimelineEvent): EffectSource {
  return {
    id: e.id,
    at: e.date,
    actorId: e.actorId ?? null,
    eventType: e.eventType ?? null,
    ...(e.changes ? { changes: e.changes } : {}),
  };
}

export function DealLastEvent({
  projectId,
  onOpenEvent,
}: {
  projectId: string;
  onOpenEvent?: (event: TimelineEvent) => void;
}) {
  // Без `kinds` намеренно: виджет показывает последнее событие независимо от
  // выбранного чипа ленты. При чипе «Все» ключ React Query совпадает с лентой
  // (`kindsKey = 'all'`), то есть второго запроса нет вовсе.
  const { events, isLoading, error } = useEntityTimeline('project', projectId);

  const anchor = useMemo(() => {
    // ⚠️ ЛЕНТА СОДЕРЖИТ БУДУЩЕЕ. У задачи дата события — `deadline ?? created_at`
    // (`taskToEvent`, adapters.ts:87), поэтому задача со сроком на следующей
    // неделе стоит в ленте ПЕРВОЙ и без этой отсечки становилась бы «последним
    // событием». Замер на проде 08.09: из 24 сделок у 2 верхнее событие ленты
    // датировано будущим, и обе — задачи с дедлайном. Виджет с таким якорем
    // врёт собственным названием.
    const now = Date.now();
    return (
      events.find((e) => {
        const at = Date.parse(e.date);
        if (Number.isNaN(at) || at > now) return false;
        // `project_updated` якорем быть не может: такая запись сама по себе
        // следствие, и заголовком виджета она показала бы «Дата шага: 1 → 2
        // сент» как главное событие сделки, а её соседей — как её следствия.
        // `stage_changed` якорем быть МОЖЕТ: у смены стадии есть собственный
        // смысл, и следствия у неё осмысленные.
        return !(e.kind === 'activity' && e.eventType === 'project_updated');
      }) ?? null
    );
  }, [events]);

  const { effects, more } = useMemo(() => {
    if (!anchor) return { effects: [], more: 0 };
    const candidates = events.filter((e) => e.kind === 'activity' && e.changes).map(toSource);
    return resolveEventEffects(toSource(anchor), candidates, EVENT_EFFECT_WINDOW_MS);
  }, [anchor, events]);

  // Подходящего события на первой странице нет ⇒ блока нет вовсе. Пустая рамка
  // здесь несёт ноль: в отличие от оси задач (FIX-DEADLINES-1-EMPTY), где сама
  // ось — смысл, тут без события не остаётся ничего.
  if (isLoading || error || !anchor) return null;

  const meta = KIND_META[anchor.kind];
  const Icon = meta.icon;
  const action = actionLabel(anchor);
  const time = mskTime(anchor.date);

  return (
    <div className="sheet mb-3 grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full ${meta.dot}`}
        aria-hidden
      >
        <Icon size={12} className={meta.fg} />
      </div>

      <div className="min-w-0">
        <div className="text-meta text-text-mute">
          {KIND_TITLE[anchor.kind]}
          {' · '}
          {formatDateShort(anchor.date)}
          {time && `, ${time}`}
          {anchor.actorName && ` · ${anchor.actorName}`}
        </div>
        {/* 72ch — мера зоны «Работа», та же, что у тела шага и строк ленты сделки. */}
        <p className="mt-0.5 max-w-[72ch] text-sm leading-snug text-text-main">{anchor.title}</p>

        {/* Следствий нет ⇒ блока следствий нет: подпись «изменений не было»
            была бы шумом — их отсутствие и так видно по отсутствию строк. */}
        {effects.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {/* Ключ с индексом: одно и то же поле может смениться дважды подряд
                (шаг переставили и тут же переписали), и `field` не уникален. */}
            {effects.map((eff, i) => (
              <li
                key={`${eff.field}-${i}`}
                className="flex items-start gap-1 text-meta text-success-text"
              >
                <ArrowRight size={11} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0">{eff.text}</span>
              </li>
            ))}
            {more > 0 && (
              <li className="pl-4 text-meta text-text-mute">и ещё {more}</li>
            )}
          </ul>
        )}
      </div>

      {action && (
        <button
          type="button"
          onClick={() => onOpenEvent?.(anchor)}
          className="shrink-0 rounded-lg border border-border px-2 py-1 text-meta text-text-dim
                     transition-colors hover:bg-surface2 hover:text-text-main"
        >
          {action}
        </button>
      )}
    </div>
  );
}
