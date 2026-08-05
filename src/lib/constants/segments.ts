import type { SegmentEntity, SegmentOp } from '@/types/database';

/**
 * Whitelist полей сегментов (R2-P0-B).
 *
 * v1 — ТОЛЬКО `deals`. Прочие сущности объявлены в CHECK миграции 077 (форвард-совместимость
 * хранилища), но UI для них не подключён: конструктор клауз пришлось бы учить пяти разным
 * наборам полей и справочников — это учетверяет спринт. Добавление сущности = запись в
 * SEGMENT_FIELDS + подключение SegmentsBar на её странице, схема БД не меняется.
 *
 * Поле, которого нет в whitelist, вычислитель трактует как клаузу `false` (см. segment-eval),
 * а не как ошибку — сегмент из будущей версии не должен ронять страницу.
 */

/** Как редактор рисует ввод значения и какой справочник подставляет. */
export type SegmentFieldKind =
  | 'enum'      // фиксированный список options
  | 'number'
  | 'text'
  | 'date'      // timestamptz/date — сравнение только через days_since_*
  | 'stage'     // справочник pipeline_stages
  | 'owner'     // справочник членов org
  | 'company';  // справочник компаний

export interface SegmentFieldDef {
  field: string;
  label: string;
  kind: SegmentFieldKind;
  /** Операторы, доступные полю в редакторе (порядок = порядок в селекте). */
  ops: SegmentOp[];
  /** Только для kind='enum'. */
  options?: { value: string; label: string }[];
}

const NULLABILITY_OPS: SegmentOp[] = ['is_null', 'not_null'];

export const SEGMENT_FIELDS: Partial<Record<SegmentEntity, SegmentFieldDef[]>> = {
  deals: [
    {
      field: 'status',
      label: 'Статус',
      kind: 'enum',
      ops: ['eq', 'neq', 'in'],
      options: [
        { value: 'open', label: 'В работе' },
        { value: 'won', label: 'Выиграна' },
        { value: 'lost', label: 'Проиграна' },
        { value: 'on_hold', label: 'На паузе' },
        { value: 'completed', label: 'Завершена' },
      ],
    },
    {
      field: 'direction',
      label: 'Направление',
      kind: 'enum',
      ops: ['eq', 'neq', 'in', ...NULLABILITY_OPS],
      options: [
        { value: 'erp', label: 'ERP' },
        { value: 'iiot', label: 'IIoT' },
      ],
    },
    { field: 'stage_id', label: 'Стадия', kind: 'stage', ops: ['eq', 'neq', 'in', ...NULLABILITY_OPS] },
    { field: 'owner_id', label: 'Ответственный', kind: 'owner', ops: ['eq', 'neq', 'in', ...NULLABILITY_OPS] },
    { field: 'company_id', label: 'Компания', kind: 'company', ops: ['eq', 'neq', 'in', ...NULLABILITY_OPS] },
    { field: 'budget', label: 'Бюджет', kind: 'number', ops: ['gt', 'gte', 'lt', 'lte', 'eq', ...NULLABILITY_OPS] },
    { field: 'probability', label: 'Вероятность, %', kind: 'number', ops: ['gt', 'gte', 'lt', 'lte', 'eq', ...NULLABILITY_OPS] },
    { field: 'next_step', label: 'Следующий шаг', kind: 'text', ops: ['contains', ...NULLABILITY_OPS] },
    {
      field: 'next_action_date',
      label: 'Дата действия',
      kind: 'date',
      ops: ['days_since_gt', 'days_since_lt', ...NULLABILITY_OPS],
    },
    {
      field: 'stage_entered_at',
      label: 'В стадии с',
      kind: 'date',
      ops: ['days_since_gt', 'days_since_lt', ...NULLABILITY_OPS],
    },
    // S-R3-TRUST-1: первое ВЫЧИСЛЯЕМОЕ поле — колонки `completeness_score` в БД нет,
    // значение считает `VIRTUAL_FIELDS` вычислителя (src/lib/domain/segment-eval.ts).
    // Операторов is_null/not_null у него нет намеренно: значение есть всегда.
    {
      field: 'completeness_score',
      label: 'Полнота, %',
      kind: 'number',
      ops: ['gt', 'gte', 'lt', 'lte', 'eq'],
    },
  ],
};

/** Определение поля сущности или undefined, если поле вне whitelist. */
export function segmentFieldDef(entity: SegmentEntity, field: string): SegmentFieldDef | undefined {
  return SEGMENT_FIELDS[entity]?.find((f) => f.field === field);
}

/** Множество разрешённых полей сущности — быстрый гард вычислителя. */
export function segmentFieldSet(entity: SegmentEntity): Set<string> {
  return new Set((SEGMENT_FIELDS[entity] ?? []).map((f) => f.field));
}

export const SEGMENT_OP_LABEL: Record<SegmentOp, string> = {
  eq: 'равно',
  neq: 'не равно',
  gt: 'больше',
  gte: 'больше или равно',
  lt: 'меньше',
  lte: 'меньше или равно',
  in: 'один из',
  contains: 'содержит',
  is_null: 'не заполнено',
  not_null: 'заполнено',
  days_since_gt: 'прошло больше дней, чем',
  days_since_lt: 'прошло меньше дней, чем',
};

/** Операторы, которым значение не нужно (единственные, определённые на null). */
export const SEGMENT_NULLARY_OPS: ReadonlySet<SegmentOp> = new Set<SegmentOp>(['is_null', 'not_null']);

export const SEGMENT_ENTITY_LABEL: Record<SegmentEntity, string> = {
  deals: 'Сделки',
  deliveries: 'Проекты внедрения',
  contacts: 'Контакты',
  companies: 'Компании',
  tasks: 'Задачи',
  leads: 'Лиды',
};
