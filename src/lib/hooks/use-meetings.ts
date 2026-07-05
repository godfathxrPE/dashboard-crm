'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import { logActivity } from './use-activity-log';

export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  project_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  notes: string | null;
  /** Миграция 020: следующий шаг по итогам встречи */
  next_step: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  project?: { id: string; name: string } | null;
}

export interface MeetingInsert {
  title: string;
  date: string;
  time?: string | null;
  location?: string | null;
  project_id?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  notes?: string | null;
  next_step?: string | null;
}

export interface MeetingUpdate extends Partial<MeetingInsert> {
  id: string;
}

const QUERY_KEY = ['meetings'] as const;

const SELECT_WITH_JOINS = `*, project:projects(id, name)`;

async function fetchMeetings(): Promise<Meeting[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('meetings')
    .select(SELECT_WITH_JOINS)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Meeting[];
}

async function createMeeting(meeting: MeetingInsert): Promise<Meeting> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('meetings')
    .insert(meeting)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) throw error;
  return data as Meeting;
}

async function updateMeeting({ id, ...updates }: MeetingUpdate): Promise<Meeting> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('meetings')
    .update(updates)
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) throw error;
  return data as Meeting;
}

async function deleteMeeting(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) throw error;
}

export function useMeetings() {
  useRealtimeSync('meetings', QUERY_KEY);
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchMeetings, staleTime: 60_000 });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMeeting,
    onMutate: async (newItem) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Meeting[]>(QUERY_KEY);
      const optimistic: Meeting = {
        id: crypto.randomUUID(),
        title: newItem.title,
        date: newItem.date,
        time: newItem.time ?? null,
        location: newItem.location ?? null,
        project_id: newItem.project_id ?? null,
        company_id: newItem.company_id ?? null,
        contact_id: newItem.contact_id ?? null,
        notes: newItem.notes ?? null,
        next_step: newItem.next_step ?? null,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      qc.setQueryData<Meeting[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])]);
      return { prev };
    },
    onSuccess: (result) => {
      if (result.project_id) {
        logActivity(result.project_id, 'meeting_scheduled', {
          title: result.title,
          date: result.date,
          location: result.location,
        });
      }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMeeting,
    onMutate: async (updated) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Meeting[]>(QUERY_KEY);
      qc.setQueryData<Meeting[]>(QUERY_KEY, (old) =>
        (old ?? []).map((m) => (m.id === updated.id ? { ...m, ...updated, updated_at: new Date().toISOString() } : m))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMeeting,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<Meeting[]>(QUERY_KEY);
      qc.setQueryData<Meeting[]>(QUERY_KEY, (old) => (old ?? []).filter((m) => m.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QUERY_KEY, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
