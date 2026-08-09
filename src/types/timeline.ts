// ═══════════════════════════════════════════════════════
// Единая модель события ленты активности сущности.
// Источники (calls / meetings / tasks / projects / …) маппятся
// в этот общий тип адаптерами (src/lib/timeline/adapters.ts).
// Одна ось сортировки — `date`. Один презентер — <EntityTimeline>.
// ═══════════════════════════════════════════════════════

export type TimelineKind = 'call' | 'meeting' | 'task' | 'project' | 'activity' | 'ai_run';

/**
 * S-TL-3: словарь серверного фильтра `entity_timeline(p_kinds text[])`.
 *
 * Шесть настоящих видов плюс производный `note` — срез внутри `activity_log`
 * (`event_type in NOTE_EVENT_TYPES`). Отдельным `TimelineKind` его сделать нельзя:
 * источник тот же, и `kind` у события остаётся `activity`.
 *
 * Тип живёт здесь, а не в `<EntityTimeline>`, потому что его принимает ХУК: иначе
 * `use-entity-timeline.ts` пришлось бы импортировать из компонента.
 */
export type TimelineKindFilter = TimelineKind | 'note';

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
   * S-UI-CLARITY-1: сырой `activity_log.event_type` для событий `kind='activity'`.
   * Нужен, чтобы отделить человеческую заметку (`comment_added`) от системной
   * записи (смена стадии, аудит полей) — на уровне `kind` они неразличимы.
   * У остальных источников поля нет: у них тип события = `kind`.
   */
  eventType?: string | null;
};
