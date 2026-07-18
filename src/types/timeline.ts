// ═══════════════════════════════════════════════════════
// Единая модель события ленты активности сущности.
// Источники (calls / meetings / tasks / projects / …) маппятся
// в этот общий тип адаптерами (src/lib/timeline/adapters.ts).
// Одна ось сортировки — `date`. Один презентер — <EntityTimeline>.
// ═══════════════════════════════════════════════════════

export type TimelineKind = 'call' | 'meeting' | 'task' | 'project' | 'activity' | 'ai_run';

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
};
