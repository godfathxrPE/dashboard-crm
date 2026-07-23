'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// Строка выборки — из сгенерированных типов (без any). Тянем только id-пары.
type AttendeeRow = {
  meeting_id: string;
  profile_id: string | null;
};

/**
 * B1: карта meeting_id → profile_id[] для набора встреч (внутренние участники).
 *
 * Отдельный читающий хук (shipped use-meetings.ts не трогаем). Нужен командной
 * сетке (TeamDayGrid), чтобы разложить встречу по дорожкам участников.
 *
 * Видимость строк даёт RLS (071: attendees_select_visible — состав видит тот,
 * кто видит саму встречу). До apply 071 manager-участник получит пустую карту —
 * это деградация, не ошибка.
 */
export function useMeetingAttendees(meetingIds: string[]) {
  return useQuery({
    queryKey: ['meeting-attendees', [...meetingIds].sort().join(',')],
    enabled: meetingIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('meeting_attendees')
        .select('meeting_id, profile_id')
        .in('meeting_id', meetingIds)
        .not('profile_id', 'is', null);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of (data ?? []) as AttendeeRow[]) {
        if (r.profile_id) (map[r.meeting_id] ??= []).push(r.profile_id);
      }
      return map;
    },
    staleTime: 60_000,
  });
}
