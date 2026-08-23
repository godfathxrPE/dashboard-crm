'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { chunkForIn } from '@/lib/utils/query-batching';
import { fetchCallMeetingIds, type AiRunOwnerType } from '@/lib/timeline/ai-run-sources';
import type { TranscriptEntity } from './use-ai-run';

// ═══════════════════════════════════════════════════════
// S-AI-VIS-2: витрина расшифровок — раздел /transcripts и блок на карточке компании.
//
// Новой сущности в БД не появляется: это чтение существующей `transcripts`.
// ═══════════════════════════════════════════════════════

/**
 * Сколько строк тянет список за раз.
 *
 * ⚠️ ДОЛГ. `content` в выборке списка едет ЦЕЛИКОМ, а час разговора — это ~45 тыс.
 * символов. Обрезать на стороне БД нечем: PostgREST не умеет `substring()` в
 * `select`, а вычисляемая колонка/вью — это миграция, которой в спринте нет.
 * При 100 строках худший случай ≈ 4.5 МБ на запрос; на текущих единицах записей
 * это доли секунды.
 *
 * **Порог пересмотра:** больше ~100 транскриптов в организации ИЛИ заметная пауза
 * при открытии раздела. Тогда — миграция с генерируемой колонкой
 * `content_preview` (`left(content, 200)`) либо вью, и список переходит на неё,
 * а полный текст остаётся точечной выборкой (`useTranscriptContent`).
 */
const LIST_LIMIT = 100;

/**
 * Порог пересмотра поиска (по образцу `segment-eval.ts`).
 *
 * Поиск идёт `ilike('%…%')` по `content` — последовательным сканом без индекса.
 * Полнотекстового индекса в проекте нет, и на десятках записей он не нужен.
 *
 * **Порог:** несколько сотен транскриптов ИЛИ ответ поиска дольше ~1 с. Тогда —
 * отдельная миграция с GIN-индексом по `to_tsvector('russian', content)` и
 * переход на `textSearch`. Без записанного порога это стало бы «забыли».
 */
export const TRANSCRIPT_SEARCH_REVIEW_THRESHOLD = 300;

export type TranscriptListRow = {
  id: string;
  entityType: TranscriptEntity;
  entityId: string;
  source: string;
  charCount: number;
  createdAt: string;
  /** Полный текст, как он приехал в выборке списка (см. долг у LIST_LIMIT). */
  content: string | null;
  /** Резолв связанной сущности — может отсутствовать, если звонок удалили. */
  companyId: string | null;
  company: string | null;
  contact: string | null;
  /** Заголовок встречи; у звонка его нет. */
  subject: string | null;
  /** Дата самого звонка/встречи — она отличается от даты расшифровки. */
  entityDate: string | null;
  /** Привязки строки — нужны, чтобы открыть AI-модалку с тем же контекстом. */
  projectId: string | null;
  contactId: string | null;
  /** S-TR-CREATE-1: имя сделки для колонки «Сделка» (эмбед по FK родителя). */
  projectName: string | null;
  /** S-TR-CREATE-1: сколько прогонов AI сделано по этой расшифровке. */
  runCount: number;
};

type TranscriptRawRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  source: string;
  char_count: number;
  created_at: string;
  content: string | null;
};

export type TranscriptsFilter = {
  /** Подстрока по тексту расшифровки — фильтр СЕРВЕРНЫЙ. */
  search?: string;
  entityType?: TranscriptEntity | 'all';
  source?: string | 'all';
  /**
   * Ограничить набор конкретными звонками/встречами (блок карточки компании).
   * Пустой массив = «сущностей нет» ⇒ и расшифровок нет, запрос не уходит.
   */
  restrictToEntityIds?: string[] | null;
};

function fullName(c: { first_name?: string | null; last_name?: string | null } | null | undefined): string | null {
  if (!c) return null;
  const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return name || null;
}

/**
 * Список расшифровок с резолвом связанных звонков/встреч.
 *
 * ⚠️ Джойна в одном запросе НЕТ и быть не может: связь `transcripts.entity_id` →
 * `calls`/`meetings` полиморфная (сверено с живой БД: из ограничений только CHECK
 * `entity_type in ('call','meeting')`, внешнего ключа нет), а PostgREST строит
 * эмбеды только по FK. Поэтому три запроса на ВЕСЬ список — транскрипты, затем
 * звонки и встречи одним `.in` каждый — и склейка на клиенте. Запроса на строку
 * нет ни одного.
 */
export function useTranscriptsList(filter: TranscriptsFilter = {}) {
  const supabase = createClient();
  const search = (filter.search ?? '').trim();
  const entityType = filter.entityType ?? 'all';
  const source = filter.source ?? 'all';
  const restrict = filter.restrictToEntityIds ?? null;
  // Ключ включает производную от списка id (урок S-DEBT-TRUTH-1): без неё ответ
  // по звонкам одной компании переиспользовался бы для другой.
  const restrictKey = restrict ? [...restrict].sort().join(',') : null;

  return useQuery({
    queryKey: ['transcripts-list', { search, entityType, source, restrictKey }],
    // Пустой `.in()` роняет PostgREST — до запроса дело не доходит вовсе.
    enabled: restrict === null || restrict.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<TranscriptListRow[]> => {
      const runQuery = async (ids: string[] | null): Promise<TranscriptRawRow[]> => {
        let q = supabase
          .from('transcripts')
          .select('id, entity_type, entity_id, source, char_count, created_at, content')
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT);
        if (entityType !== 'all') q = q.eq('entity_type', entityType);
        if (source !== 'all') q = q.eq('source', source);
        // Поиск СЕРВЕРНЫЙ: смысл в том, чтобы найти разговор, которого нет на
        // первом экране. Клиентская фильтрация загруженной страницы этого не даёт.
        // `%` и `_` в запросе экранируем — иначе они читаются как шаблон LIKE.
        if (search) q = q.ilike('content', `%${search.replace(/[%_\\]/g, '\\$&')}%`);
        if (ids) q = q.in('entity_id', ids);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as TranscriptRawRow[];
      };

      // Фильтры и поиск комбинируются по «И» — все они на одном запросе.
      const raw = restrict
        ? (await Promise.all(chunkForIn(restrict).map((batch) => runQuery(batch)))).flat()
        : await runQuery(null);

      if (raw.length === 0) return [];

      const callIds = raw.filter((r) => r.entity_type === 'call').map((r) => r.entity_id);
      const meetingIds = raw.filter((r) => r.entity_type === 'meeting').map((r) => r.entity_id);

      const [calls, meetings, runsByTranscript] = await Promise.all([
        fetchRelated(
          callIds,
          (batch) =>
            supabase
              .from('calls')
              .select('id, date, project_id, contact_id, company_id, company:companies(id, name), contact:contacts(id, first_name, last_name), project:projects(id, name)')
              .in('id', batch),
        ),
        fetchRelated(
          meetingIds,
          (batch) =>
            supabase
              .from('meetings')
              .select('id, date, title, project_id, contact_id, company_id, company:companies(id, name), contact:contacts(id, first_name, last_name), project:projects(id, name)')
              .in('id', batch),
        ),
        fetchRunCounts(supabase, raw.map((r) => r.id)),
      ]);

      const byId = new Map<string, RelatedRow>();
      for (const row of [...calls, ...meetings]) byId.set(row.id, row);

      return raw
        .map((r): TranscriptListRow => {
          const rel = byId.get(r.entity_id);
          return {
            id: r.id,
            entityType: r.entity_type as TranscriptEntity,
            entityId: r.entity_id,
            source: r.source,
            charCount: r.char_count,
            createdAt: r.created_at,
            content: r.content,
            companyId: rel?.company_id ?? null,
            company: rel?.company?.name ?? null,
            contact: fullName(rel?.contact),
            subject: rel?.title ?? null,
            entityDate: rel?.date ?? null,
            projectId: rel?.project_id ?? null,
            contactId: rel?.contact_id ?? null,
            projectName: rel?.project?.name ?? null,
            runCount: runsByTranscript.get(r.id) ?? 0,
          };
        })
        // Батчи `.in` порядок между собой не держат (см. шапку query-batching).
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
  });
}

/**
 * Сколько прогонов AI сделано по каждой расшифровке — ОДИН запрос на весь список
 * (нарезка по границе длины URL), а не запрос на строку.
 *
 * Считаем на клиенте: агрегата `count ... group by` PostgREST в такой форме не
 * отдаёт, а RPC ради счётчика в списке — это миграция, которой в спринте нет.
 * Тянем единственную колонку: числу строк содержимое прогонов не нужно.
 */
async function fetchRunCounts(
  supabase: ReturnType<typeof createClient>,
  transcriptIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (transcriptIds.length === 0) return counts;
  for (const batch of chunkForIn([...new Set(transcriptIds)])) {
    const { data, error } = await supabase
      .from('ai_runs')
      .select('transcript_id')
      .in('transcript_id', batch);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = row.transcript_id as string | null;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

type RelatedRow = {
  id: string;
  date: string | null;
  title?: string | null;
  project_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; first_name: string; last_name: string } | null;
  project?: { id: string; name: string } | null;
};

/** Один запрос на весь список id (с нарезкой по границе длины URL), а не на строку. */
async function fetchRelated(
  ids: string[],
  query: (batch: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<RelatedRow[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const out: RelatedRow[] = [];
  for (const batch of chunkForIn(unique)) {
    const { data, error } = await query(batch);
    if (error) throw error;
    out.push(...((data ?? []) as RelatedRow[]));
  }
  return out;
}

/**
 * Полный текст одной расшифровки — точечно при открытии модалки.
 *
 * Отдельно от списка сознательно: даже сейчас, когда список тянет `content`
 * целиком (долг у `LIST_LIMIT`), точка чтения полного текста уже отделена — и
 * при переходе списка на превью менять придётся только выборку списка.
 */
export function useTranscriptContent(transcriptId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['transcript-content', transcriptId],
    enabled: !!transcriptId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('transcripts')
        .select('content')
        .eq('id', transcriptId!)
        .single();
      if (error) throw error;
      return (data?.content as string | null) ?? null;
    },
  });
}

/** id звонков и встреч сущности — для блока карточки (переиспользует общий сбор). */
export function useCallMeetingIds(owner: AiRunOwnerType, id: string | null) {
  return useQuery({
    queryKey: ['call-meeting-ids', owner, id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: () => fetchCallMeetingIds(owner, id!),
  });
}
