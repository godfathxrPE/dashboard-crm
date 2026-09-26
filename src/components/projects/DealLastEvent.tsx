'use client';

import { useMemo } from 'react';
import { useEntityTimeline } from '@/lib/hooks/use-entity-timeline';
import { KIND_META } from '@/lib/timeline/kind-meta';
import {
  resolveEventEffects,
  EVENT_EFFECT_WINDOW_MS,
  type EffectSource,
} from '@/lib/domain/event-effects';
import { formatDateShort } from '@/lib/utils/dates';
import { mskTime } from '@/lib/utils/date-helpers';
import { useCallBrief } from '@/lib/hooks/use-call-brief';
import { formatCallDuration } from '@/lib/utils/call-brief';
import { formatPersonShort } from '@/lib/utils/contact-name';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-DEAL-EVENT-1 (W5): «Последнее событие» над лентой сделки.
//
// Смысл блока — не повторить первую строку ленты крупнее, а показать СЛЕДСТВИЯ:
// что человек поменял в сделке после этого звонка/встречи. Сегодня «Дата шага:
// 1 сент → 2 сент» стоит в ленте отдельной строкой, и связь с событием читатель
// достраивает сам.
//
// S-DEAL-ACTIVITY-VIEW-1 (W5 по макету): тело события — на стекле `.glass-sheet`,
// материале «Следующего шага». Прежнее решение «без стекла» (08.09) снято
// владельцем 26.09: его причина — «Следующий шаг» был светлым листом — исчезла
// с PR 108. Контейнер больше не `.sheet`: блок разделён hairline сверху и снизу,
// стекло — только у тела. Цвета внутри стекла идут через переопределённые им
// токены (`--sheet-*`), theme-if в разметке нет.
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

  const { data: brief } = useCallBrief(anchor?.kind === 'call' ? anchor.sourceId : null);

  // Подходящего события на первой странице нет ⇒ блока нет вовсе. Пустая рамка
  // здесь несёт ноль: в отличие от оси задач (FIX-DEADLINES-1-EMPTY), где сама
  // ось — смысл, тут без события не остаётся ничего.
  if (isLoading || error || !anchor) return null;

  const meta = KIND_META[anchor.kind];
  const Icon = meta.icon;
  const action = actionLabel(anchor);
  const time = mskTime(anchor.date);
  // Длительность и собеседник есть только у звонка и только отдельным запросом
  // (`useCallBrief`); нет данных — сегмента нет, без «—».
  const duration = formatCallDuration(brief?.duration_s ?? null);
  const contact = brief?.contact
    ? formatPersonShort(brief.contact.first_name, brief.contact.last_name)
    : null;
  const metaTail = [duration, contact, anchor.actorName].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );

  return (
    <div className="mb-1 grid grid-cols-[auto_1fr_auto] items-start gap-3.5 border-y border-border px-1 py-3.5">
      {/* Плитка вида: «тёмное с акцентом» из макета. Материал — `.glass-sheet`, а не
          пара `bg-text-main text-accent`: в aura акцент — графит, и на тёмной
          заливке глиф пропадал; `.glass-sheet .text-accent` даёт `--sheet-mark`,
          подобранную под стекло во всех восьми темах (тот же ход, что метка
          `DealNextStep`). */}
      <div
        className="glass-sheet grid size-10 shrink-0 place-items-center rounded-xl"
        aria-hidden
      >
        <Icon size={18} className="text-accent" />
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-meta tabular-nums text-text-mute">
          <span className="font-semibold text-text-main">{KIND_TITLE[anchor.kind]}</span>
          <span aria-hidden>·</span>
          <span className="font-semibold text-text-main">
            {formatDateShort(anchor.date)}
            {time && `, ${time}`}
          </span>
          {metaTail.map((part, i) => (
            <span key={i} className="contents">
              <span aria-hidden>·</span>
              <span>{part}</span>
            </span>
          ))}
        </div>

        {/* 72ch — мера зоны «Работа», та же, что у тела шага. Хвостик слева снизу —
            форма плашки из макета (r14 14 14 4). */}
        <div className="glass-sheet max-w-[72ch] rounded-[0.875rem] rounded-bl-sm px-4 py-3">
          <p className="text-sm font-semibold leading-snug tracking-[-0.01em]">{anchor.title}</p>
          {anchor.detail && (
            <p className="mt-1 text-pretty text-body leading-relaxed text-text-dim">{anchor.detail}</p>
          )}
        </div>

        {/* Следствий нет ⇒ строки нет: «изменений не было» было бы шумом. */}
        {effects.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta font-semibold">
            {/* Ключ с индексом: одно и то же поле может смениться дважды подряд
                (шаг переставили и тут же переписали), и `field` не уникален. */}
            {effects.map((eff, i) => (
              <li key={`${eff.field}-${i}`} className="min-w-0 text-success-text">
                → {eff.text}
              </li>
            ))}
            {more > 0 && <li className="text-text-mute">и ещё {more}</li>}
          </ul>
        )}
      </div>

      {action && (
        <button
          type="button"
          onClick={() => onOpenEvent?.(anchor)}
          className={
            action === 'Изменить'
              ? 'h-[1.875rem] shrink-0 rounded-[0.625rem] border border-border px-3 text-xs font-semibold text-text-main transition-colors hover:bg-surface2'
              : 'h-[1.875rem] shrink-0 rounded-[0.625rem] px-3 text-xs font-semibold text-text-dim transition-colors hover:bg-surface2 hover:text-text-main'
          }
        >
          {action}
        </button>
      )}
    </div>
  );
}
