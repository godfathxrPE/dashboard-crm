'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import { useAuth } from './use-auth';
import { useMeetingAttendees } from './use-meeting-attendees';
import { logActivity } from './use-activity-log';
import type { AiSummary } from '@/types/database';

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
  /** Sprint 28: AI-резюме встречи */
  ai_summary: AiSummary | null;
  ai_summary_at: string | null;
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

/**
 * S-VIS-A: подмножество «мои встречи» из УЖЕ суженного списка.
 *
 * После 098 `useMeetings()` отдаёт встречи всей организации — это цель спринта, и
 * фильтр внутрь самого хука класть нельзя: календарю и списку встреч нужна команда.
 * Личную семантику держат потребители с личной семантикой (очередь «Сегодня»,
 * счётчики в дровере), и вот им — этот хук.
 *
 * «Моя» встреча — созданная мной ИЛИ та, где я в участниках. Вторая ветка не
 * украшательство: 071 специально дала участнику видеть чужую встречу, и фильтр по
 * одному `created_by` выкинул бы из личной очереди ровно те встречи, ради которых
 * человека и позвали. Приглашения живут в `meeting_attendees`, в строке `meetings`
 * их нет — отсюда второй запрос.
 *
 * Аргумент — уже НАРЕЗАННЫЙ список (сегодняшние / предстоящие), а не вся лента:
 * ключ запроса состава склеен из id, и передавать туда всю историю встреч значит
 * растить ключ и рефетчить состав на каждое изменение ленты.
 */
export function useMyMeetings(meetings: Meeting[]): Meeting[] {
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const ids = useMemo(() => meetings.map((m) => m.id), [meetings]);
  const { data: attendeesByMeeting = {} } = useMeetingAttendees(ids);

  return useMemo(() => {
    if (!myId) return [];
    return meetings.filter(
      (m) => m.created_by === myId || (attendeesByMeeting[m.id] ?? []).includes(myId),
    );
    // Пока состав едет, встреча-приглашение в подмножество не попадает — это состояние
    // загрузки, а не потеря: своя встреча видна сразу, приглашение доезжает следом.
  }, [meetings, attendeesByMeeting, myId]);
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
        ai_summary: null,
        ai_summary_at: null,
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: встреча влияет на KPI дашборда и ленты сущностей (EntityTimeline)
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      // S-FIX-CO360-1: виджеты карточки компании («Последний контакт», «кто знает»,
      // strength контактов) считаются из calls/meetings своими запросами. Без этих
      // двух строк лента внизу обновлялась, а виджеты сверху показывали старое.
      // Инвалидация по ПРЕФИКСУ: накрывает все companyId и все наборы контактов разом.
      qc.invalidateQueries({ queryKey: ['company-team-touch'] });
      qc.invalidateQueries({ queryKey: ['contact-strength'] });
    },
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: встреча влияет на KPI дашборда и ленты сущностей (EntityTimeline)
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      // S-FIX-CO360-1: виджеты карточки компании («Последний контакт», «кто знает»,
      // strength контактов) считаются из calls/meetings своими запросами. Без этих
      // двух строк лента внизу обновлялась, а виджеты сверху показывали старое.
      // Инвалидация по ПРЕФИКСУ: накрывает все companyId и все наборы контактов разом.
      qc.invalidateQueries({ queryKey: ['company-team-touch'] });
      qc.invalidateQueries({ queryKey: ['contact-strength'] });
    },
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      // AUDIT 2.9: встреча влияет на KPI дашборда и ленты сущностей (EntityTimeline)
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      // S-FIX-CO360-1: виджеты карточки компании («Последний контакт», «кто знает»,
      // strength контактов) считаются из calls/meetings своими запросами. Без этих
      // двух строк лента внизу обновлялась, а виджеты сверху показывали старое.
      // Инвалидация по ПРЕФИКСУ: накрывает все companyId и все наборы контактов разом.
      qc.invalidateQueries({ queryKey: ['company-team-touch'] });
      qc.invalidateQueries({ queryKey: ['contact-strength'] });
    },
  });
}
