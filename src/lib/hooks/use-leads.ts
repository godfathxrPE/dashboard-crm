'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { Lead, LeadInsert, LeadStatus, LeadConversionResult, Direction } from '@/types/database';

const QUERY_KEY = ['leads'] as const;

// ═══════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════

async function fetchLeads(): Promise<Lead[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .neq('status', 'converted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Lead[];
}

// ═══════════════════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════════════════

async function createLead(lead: LeadInsert): Promise<Lead> {
  const supabase = createClient();
  // 117: `user_id` и `owner_id` ставит БД (default `auth.uid()`), поэтому и лишний
  // round-trip за `getUser()` больше не нужен. Переданный формой `owner_id`
  // (назначение через AssigneeSelect) уходит как есть и default перекрывает.
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select('*')
    .single();

  if (error) throw error;
  return data as Lead;
}

async function updateLead({ id, ...updates }: Partial<LeadInsert> & { id: string }): Promise<Lead> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Lead;
}

async function deleteLead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════

/** All non-converted leads */
export function useLeads() {
  // S-LEAD-HUB-2b (121): лид — общий пул, его разбирают несколько человек, и
  // расхождение канбанов до минуты (staleTime + инвалидации только своих мутаций)
  // здесь дороже, чем у приватных задач. Ключ — префикс `['leads']`: инвалидация
  // накрывает и `['leads','one',id]`, и `['leads','converted']`.
  useRealtimeSync('leads', QUERY_KEY);

  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLeads,
    staleTime: 1000 * 60,
  });
}

/**
 * Один лид по id — для страницы `/leads/[id]` (S-LEAD-HUB-2a).
 *
 * ⚠️ Отдельный ключ `['leads','one',id]`, а НЕ выборка из кеша `['leads']`: список
 * режет конвертированных (`.neq('status','converted')`), и по прямой ссылке
 * конвертированный лид из него не достался бы — а это ровно тот случай, ради
 * которого страница и заводится (раньше `?lead=<id>` на нём молча падал в редирект).
 * Ключ — под префиксом `['leads']`, поэтому инвалидации списка накрывают и его.
 */
export function useLead(id: string | null | undefined) {
  // Подписка нужна И здесь: страница `/leads/[id]` списка не держит, а `useLeads()`
  // на ней не вызывается — без своей подписки карточка осталась бы единственным
  // экраном лида без живого обновления. Канал общий, refcount в `use-realtime`
  // рассчитан на несколько потребителей (второй вызов новый канал не создаёт).
  useRealtimeSync('leads', QUERY_KEY);

  return useQuery({
    queryKey: [...QUERY_KEY, 'one', id ?? null],
    queryFn: async (): Promise<Lead | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id as string)
        // `maybeSingle`, а не `single`: удалённый/чужой лид — это «не найден»
        // (страница покажет пустое состояние), а не ошибка запроса.
        .maybeSingle();
      if (error) throw error;
      return (data as Lead | null) ?? null;
    },
    enabled: Boolean(id),
    staleTime: 1000 * 60,
  });
}

/**
 * Лиды за период — ДЛЯ АНАЛИТИКИ, включая конвертированных и дисквалифицированных
 * (S-LEAD-HUB-2b).
 *
 * ⚠️ `useConvertedLeads()` для этого не годится и не переиспользуется: у него
 * `.limit(100)` и сортировка по `converted_at` — это лента полосы «Конвертированы»,
 * а не выборка за период. Расширить его лимит значило бы утяжелить полосу ради
 * блока, который открывают раз в неделю.
 *
 * `limit(1000)` — потолок выборки; при его достижении цифры станут занижены, но
 * это на порядки выше текущего потока (в проде единицы лидов).
 */
export function useLeadsForAnalytics(fromISO: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'analytics', fromISO],
    queryFn: async (): Promise<Lead[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .gte('created_at', fromISO)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Converted leads — для полосы «Конвертированы» и конверсии по источникам */
export function useConvertedLeads() {
  return useQuery({
    queryKey: [...QUERY_KEY, 'converted'],
    queryFn: async (): Promise<Lead[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('status', 'converted')
        .order('converted_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Create lead — optimistic */
export function useCreateLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: createLead,
    onMutate: async (newLead) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Lead[]>(QUERY_KEY);

      const optimistic: Lead = {
        id: crypto.randomUUID(),
        user_id: '',
        org_id: '',
        title: newLead.title,
        source: newLead.source ?? null,
        status: newLead.status ?? 'new',
        direction: newLead.direction ?? null,
        company_name_raw: newLead.company_name_raw ?? null,
        contact_name_raw: newLead.contact_name_raw ?? null,
        phone: newLead.phone ?? null,
        email: newLead.email ?? null,
        notes: newLead.notes ?? null,
        disqualify_reason: null,
        converted_deal_id: null,
        converted_company_id: null,
        converted_contact_id: null,
        converted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // 117: поля работы — из формы, иначе карточка на секунду теряет то,
        // что человек только что ввёл (optimistic-объект рендерится целиком).
        owner_id: newLead.owner_id ?? null,
        next_step: newLead.next_step ?? null,
        next_action_date: newLead.next_action_date ?? null,
        temperature: newLead.temperature ?? null,
        estimated_value: newLead.estimated_value ?? null,
        pain: newLead.pain ?? null,
        budget_status: newLead.budget_status ?? 'unknown',
        decision_role: newLead.decision_role ?? null,
        chz_groups: newLead.chz_groups ?? null,
        regulatory_deadline: newLead.regulatory_deadline ?? null,
        // Штампы ставит БД (trg_zz_stamp_lead_status) — оптимистично не угадываем.
        first_contacted_at: null,
        qualified_at: null,
      };

      qc.setQueryData<Lead[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Update lead — optimistic */
export function useUpdateLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: updateLead,
    onMutate: async (updated) => {
      // Префикс `['leads']` накрывает и `['leads','one',id]` — отдельная отмена не нужна.
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Lead[]>(QUERY_KEY);
      const oneKey = [...QUERY_KEY, 'one', updated.id];
      const prevOne = qc.getQueryData<Lead | null>(oneKey);

      qc.setQueryData<Lead[]>(QUERY_KEY, (old) =>
        (old ?? []).map((l) =>
          l.id === updated.id
            ? { ...l, ...updated, updated_at: new Date().toISOString() }
            : l,
        ),
      );

      // S-LEAD-HUB-2a: кеш карточки патчится ОТДЕЛЬНО — он не срез списка, а своя
      // запись. Без этого правка шага на `/leads/[id]` отыгрывалась бы назад до
      // прихода рефетча (и вовсе не появлялась бы у конвертированного лида,
      // которого в списке нет).
      if (prevOne) {
        qc.setQueryData<Lead | null>(oneKey, {
          ...prevOne,
          ...updated,
          updated_at: new Date().toISOString(),
        });
      }

      return { prev, prevOne, oneKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
      if (ctx?.prevOne && ctx.oneKey) qc.setQueryData(ctx.oneKey, ctx.prevOne);
    },
    onSettled: () => {
      // Инвалидация по префиксу: список, «конвертированные» и карточка разом.
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Смена статуса лида — одна на канбан и на карточку `/leads/[id]`.
 *
 * S-LEAD-HUB-2a: вынесено из `LeadsView`, чтобы у страницы и канбана было одно
 * правило, а не две копии. Правило ровно одно и живёт здесь: причина отказа
 * принадлежит только `disqualified`, и восстановление лида её ЧИСТИТ — иначе
 * «Новый» тащил бы за собой прошлогоднее «Нет бюджета».
 * Штампы времени (`first_contacted_at`/`qualified_at`) ставит БД (118).
 */
export function useLeadStatusChange() {
  const updateLead = useUpdateLead();

  return {
    isPending: updateLead.isPending,
    change: (id: string, status: LeadStatus, reason?: string | null) =>
      updateLead.mutate({
        id,
        status,
        disqualify_reason: status === 'disqualified' ? reason ?? null : null,
      }),
  };
}

/** Delete lead — optimistic */
export function useDeleteLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: deleteLead,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Lead[]>(QUERY_KEY);

      qc.setQueryData<Lead[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((l) => l.id !== id),
      );

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Convert lead → Company + Contact + Deal via RPC */
export function useConvertLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      leadId: string;
      companyName?: string;
      contactFirstName?: string;
      contactLastName?: string;
      contactPhone?: string;
      contactEmail?: string;
      direction: Direction;
      dealTitle?: string;
      dealAmount?: number;
      /** Миграция 018: существующие записи вместо создания дублей */
      companyId?: string;
      contactId?: string;
    }): Promise<LeadConversionResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('convert_lead', {
        p_lead_id: params.leadId,
        p_company_name: params.companyName ?? undefined,
        p_contact_first_name: params.contactFirstName ?? undefined,
        p_contact_last_name: params.contactLastName ?? undefined,
        p_contact_phone: params.contactPhone ?? undefined,
        p_contact_email: params.contactEmail ?? undefined,
        p_direction: params.direction,
        p_deal_title: params.dealTitle ?? undefined,
        p_deal_amount: params.dealAmount ?? undefined,
        p_company_id: params.companyId ?? undefined,
        p_contact_id: params.contactId ?? undefined,
      });
      if (error) throw error;
      return data as unknown as LeadConversionResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
