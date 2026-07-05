'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Lead, LeadInsert, LeadConversionResult, Direction } from '@/types/database';

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...lead, user_id: user.id })
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
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLeads,
    staleTime: 1000 * 60,
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
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Lead[]>(QUERY_KEY);

      qc.setQueryData<Lead[]>(QUERY_KEY, (old) =>
        (old ?? []).map((l) =>
          l.id === updated.id
            ? { ...l, ...updated, updated_at: new Date().toISOString() }
            : l,
        ),
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
        p_company_name: params.companyName ?? null,
        p_contact_first_name: params.contactFirstName ?? null,
        p_contact_last_name: params.contactLastName ?? null,
        p_contact_phone: params.contactPhone ?? null,
        p_contact_email: params.contactEmail ?? null,
        p_direction: params.direction,
        p_deal_title: params.dealTitle ?? null,
        p_deal_amount: params.dealAmount ?? null,
        p_company_id: params.companyId ?? null,
        p_contact_id: params.contactId ?? null,
      });
      if (error) throw error;
      return data as LeadConversionResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
