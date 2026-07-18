'use client';

import { useMemo } from 'react';
import { useTeamMembers } from './use-team-members';

// ═══════════════════════════════════════════════════════
// Sprint T2: единый резолв актора id→имя для лент активности.
// Один источник (useTeamMembers, уже кешируется) → одна Map, чтобы три
// потребителя (EntityTimeline, DashboardHome RecentActivityList,
// ActivityDrawer) не разъехались в способе резолва и не плодили N запросов.
// ═══════════════════════════════════════════════════════

/** profile id → full_name членов текущей org (пустая Map пока грузится). */
export function useActorMap(): Map<string, string> {
  const { data: members } = useTeamMembers();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) {
      if (m.full_name) map.set(m.id, m.full_name);
    }
    return map;
  }, [members]);
}

/** Имя актора по id (undefined — если id пуст или не в org). */
export function useActorName(id: string | null | undefined): string | undefined {
  const map = useActorMap();
  return id ? map.get(id) : undefined;
}
