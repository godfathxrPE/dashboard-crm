// ═══════════════════════════════════════════════════════
// Единая модель события ленты активности сущности.
// Источники (calls / meetings / tasks / projects / …) маппятся
// в этот общий тип адаптерами (src/lib/timeline/adapters.ts).
// Одна ось сортировки — `date`. Один презентер — <EntityTimeline>.
// ═══════════════════════════════════════════════════════

export type TimelineKind = 'call' | 'meeting' | 'task' | 'project' | 'activity' | 'ai_run';

/**
 * S-TL-3/S-TL-4: словарь серверного фильтра `entity_timeline(p_kinds text[])`.
 *
 * Шесть настоящих видов плюс ТРИ производных — срезы внутри `activity_log` по
 * `event_type`: `note` (заметка человека), `stage` (смена стадии), `deleted`
 * (удаление). Отдельными `TimelineKind` их сделать нельзя: источник тот же, и
 * `kind` у события остаётся `activity`.
 *
 * ⚠️ Списки `event_type` за каждым производным видом живут ТОЛЬКО в SQL (CTE
 * `kind_types` миграции 115). Здесь — имена видов, и это осознанно: перечень типов,
 * продублированный на клиенте, разошёлся бы с серверным молча.
 *
 * Тип живёт здесь, а не в `<EntityTimeline>`, потому что его принимает ХУК: иначе
 * `use-entity-timeline.ts` пришлось бы импортировать из компонента.
 */
export type TimelineKindFilter = TimelineKind | 'note' | 'stage' | 'deleted';

export type TimelineStatus = 'done' | 'pending' | 'overdue';

export type TimelineEvent = {
  /** Уникален в рамках ленты: `${kind}:${sourceId}` */
  id: string;
  kind: TimelineKind;
  /** «Звонок выполнен», «Встреча: …», «Задача: …» — только текст, без HTML */
  title: string;
  /** ISO — единая ось сортировки */
  date: string;
  /** Подзаголовок: next_step / agreements / stage / срок — только текст */
  detail?: string;
  /** Для задач/звонков: статус-чип */
  status?: TimelineStatus;
  /** Клик → открыть сущность/модалку (родитель решает по kind+sourceId) */
  href?: string;
  /** ID исходной строки (без префикса kind) — родителю для открытия модалки */
  sourceId: string;
  /** renderer выберет Lucide-икону */
  icon: TimelineKind;
  /** Актор события (кто сделал): profile id из created_by / user_id. Резолв
   *  id→имя — на этапе сборки ленты (useActorMap), не в адаптере. */
  actorId?: string;
  /** Имя актора («Олег») — проставляется хуком после резолва по useActorMap */
  actorName?: string;
  /**
   * S-TL-4: к чему относится событие (`project` → `company` → `contact`, первый
   * непустой). На карточке сущности не нужен — карточка и есть ответ; в org-ленте
   * без него строка «Задача: Приёмка отчёта» бесполезна.
   * `null` — законное значение: у 304 записей журнала из 801 привязки нет вовсе.
   */
  parentType?: 'project' | 'company' | 'contact' | null;
  parentId?: string | null;
  /**
   * Имя родителя — проставляет `useOrgTimeline` из кэшей `useProjects`/
   * `useCompanies`/`useContacts`, ровно как `actorName` из `useActorMap`.
   * RPC отдаёт только идентификатор: джойн трёх таблиц в каждой из шести веток
   * ради строки, которая у клиента уже есть, — работа на каждой странице.
   */
  parentName?: string;
  /**
   * S-COST-TRUTH-1: на что событие ссылается СВЕРХ своего источника. Единственное
   * значение — `'task'` у записей журнала `task_created`/`task_completed`, которые
   * несут `task_id` в payload: у таких событий `sourceId` — id ЗАДАЧИ, а не строки
   * журнала, и `openTimelineEvent` открывает карточку задачи.
   *
   * ⚠️ Поля НЕТ у всех прочих событий, включая записи журнала до 2026-08-09: у них
   * `sourceId` означает ровно свой источник, а клик по ним по-прежнему молчит.
   * Разбор payload — работа представления: RPC про содержимое payload ничего не
   * знает и знать не должен (`ref_type`/`ref_id` у `activity` приходят как null).
   */
  refType?: 'task';
  /**
   * S-UI-CLARITY-1: сырой `activity_log.event_type` для событий `kind='activity'`.
   * Нужен, чтобы отделить человеческую заметку (`comment_added`) от системной
   * записи (смена стадии, аудит полей) — на уровне `kind` они неразличимы.
   * У остальных источников поля нет: у них тип события = `kind`.
   */
  eventType?: string | null;
};
