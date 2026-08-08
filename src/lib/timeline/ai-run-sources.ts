// ═══════════════════════════════════════════════════════
// S-AI-VIS-2: сбор прогонов сущности из ДВУХ источников — общая точка.
//
// Логика родилась в `use-entity-timeline.ts` (S-AI-VIS-1) и понадобилась второму
// потребителю — сводному AI-блоку карточки компании. Вынесена сюда целиком, а не
// скопирована: расхождение «в ленте бриф виден, в блоке нет» — ровно тот класс
// багов, который этот спринт и закрывает.
//
// Чистое слияние живёт отдельно (`ai-run-merge.ts`) и остаётся без Supabase —
// его тесты не должны тянуть браузерный клиент.
// ═══════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/client';
import { mergeAiRunRows, type AiRunTimelineRow } from './ai-run-merge';

/** Сущность-владелец ленты. Совпадает с `TimelineEntityType`. */
export type AiRunOwnerType = 'contact' | 'company' | 'project';

/** entity → колонка серверного фильтра в `calls`/`meetings`. */
export const OWNER_FILTER_COLUMN: Record<AiRunOwnerType, string> = {
  contact: 'contact_id',
  company: 'company_id',
  project: 'project_id',
};

/**
 * id всех звонков и встреч сущности — общий «детский» набор.
 *
 * UUID уникальны между таблицами, поэтому дальше по нему можно бить единым `.in`
 * по `entity_id`, не разделяя звонки и встречи.
 */
export async function fetchCallMeetingIds(owner: AiRunOwnerType, id: string): Promise<string[]> {
  const supabase = createClient();
  const col = OWNER_FILTER_COLUMN[owner];
  const [calls, meetings] = await Promise.all([
    supabase.from('calls').select('id').eq(col, id),
    supabase.from('meetings').select('id').eq(col, id),
  ]);
  if (calls.error) throw calls.error;
  if (meetings.error) throw meetings.error;
  return [
    ...(calls.data ?? []).map((c) => c.id as string),
    ...(meetings.data ?? []).map((m) => m.id as string),
  ];
}

const AI_RUN_SELECT = 'id, preset_key, entity_type, status, created_at';

/**
 * Прогоны сущности — оба источника, слитые и обрезанные лимитом:
 *  1. по звонкам и встречам сущности (`entity_id ∈ (…)`);
 *  2. по самой сущности (`entity_type` = тип хаба, `entity_id` = её id) — брифы
 *     компании и read-only пресеты по сделке.
 *
 * Контакт получает только первый источник: `ai_runs.entity_type` — это
 * call|meeting|project|company, своих прогонов у контакта не бывает.
 *
 * `childIds` передаётся снаружи, когда вызывающий уже их получил (блок компании
 * тем же набором тянет и расшифровки) — иначе они запрашиваются здесь.
 */
export async function fetchAiRunRows(
  owner: AiRunOwnerType,
  id: string,
  limit: number,
  childIds?: string[],
): Promise<AiRunTimelineRow[]> {
  const supabase = createClient();
  const entityIds = childIds ?? (await fetchCallMeetingIds(owner, id));

  const viaChildren = async (): Promise<AiRunTimelineRow[]> => {
    if (entityIds.length === 0) return [];
    const { data, error } = await supabase
      .from('ai_runs')
      .select(AI_RUN_SELECT)
      // ⚠️ Батчинга `.in()` тут НЕТ, хотя `entityIds` (все звонки + встречи сущности за
      // её историю) — единственный список в проекте, который может дорасти до лимита
      // длины URL. Нарезка ломает `limit`: он стал бы лимитом НА БАТЧ, и добор пришлось
      // бы досортировывать на клиенте. Записано остатком S-DEBT-TRUTH-1.
      // Второй источник ниже список не сокращает — он `.eq`, а не `.in`.
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AiRunTimelineRow[];
  };

  const viaSelf = async (): Promise<AiRunTimelineRow[]> => {
    if (owner === 'contact') return [];
    const { data, error } = await supabase
      .from('ai_runs')
      .select(AI_RUN_SELECT)
      .eq('entity_type', owner)
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AiRunTimelineRow[];
  };

  const [children, own] = await Promise.all([viaChildren(), viaSelf()]);
  // Лимит — после слияния: два источника по `limit` иначе дали бы до 2×limit строк.
  return mergeAiRunRows([children, own], limit);
}
