'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import type { CallStatus } from '@/lib/validators/call';
import { logActivity } from './use-activity-log';

export interface Call {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  project_id: string | null;
  date: string;
  status: CallStatus;
  next_step: string | null;
  agreements: string | null;
  duration_s: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  company?: { id: string; name: string } | null;
  contact?: { id: string; first_name: string; last_name: string } | null;
  project?: { id: string; name: string } | null;
}

export interface CallInsert {
  company_id?: string | null;
  contact_id?: string | null;
  project_id?: string | null;
  date: string;
  status?: CallStatus;
  next_step?: string | null;
  agreements?: string | null;
  duration_s?: number | null;
}

export interface CallUpdate extends Partial<CallInsert> {
  id: string;
}

const QUERY_KEY = ['calls'] as const;

const SELECT_WITH_JOINS = `
  *,
  company:companies(id, name),
  contact:contacts(id, first_name, last_name),
  project:projects(id, name)
`;

async function fetchCalls(): Promise<Call[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calls')
    .select(SELECT_WITH_JOINS)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Call[];
}

async function createCall(call: CallInsert): Promise<Call> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calls')
    .insert(call)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) throw error;
  return data as Call;
}

async function updateCall({ id, ...updates }: CallUpdate): Promise<Call> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('calls')
    .update(updates)
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) throw error;
  return data as Call;
}

async function deleteCall(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('calls').delete().eq('id', id);
  if (error) throw error;
}

export function useCalls() {
  useRealtimeSync('calls', QUERY_KEY);
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchCalls, staleTime: 60_000 });
}

export function useCreateCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCall,
    onMutate: async (newItem) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Call[]>(QUERY_KEY);
      const optimistic: Call = {
        id: crypto.randomUUID(),
        company_id: newItem.company_id ?? null,
        contact_id: newItem.contact_id ?? null,
        project_id: newItem.project_id ?? null,
        date: newItem.date,
        status: newItem.status ?? 'done',
        next_step: newItem.next_step ?? null,
        agreements: newItem.agreements ?? null,
        duration_s: newItem.duration_s ?? null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      qc.setQueryData<Call[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev };
    },
    onSuccess: (result) => {
      if (result.project_id) {
        const contactName = result.contact
          ? `${result.contact.first_name} ${result.contact.last_name}`
          : null;
        logActivity(result.project_id, 'call_logged', {
          contact_name: contactName,
          status: result.status,
          duration: result.duration_s,
        });
      }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useUpdateCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCall,
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Call[]>(QUERY_KEY);
      qc.setQueryData<Call[]>(QUERY_KEY, (old) =>
        (old ?? []).map((c) => (c.id === updated.id ? { ...c, ...updated, updated_at: new Date().toISOString() } : c))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCall,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Call[]>(QUERY_KEY);
      qc.setQueryData<Call[]>(QUERY_KEY, (old) => (old ?? []).filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
