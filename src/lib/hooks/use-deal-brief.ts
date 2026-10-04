'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useEntityRuns, useStartRun } from './use-ai-run';
import { useOrgRole } from './use-org-role';
import {
  briefKind,
  pickBriefRuns,
  toBriefAutoState,
  type BriefAutoState,
} from '@/lib/domain/company-brief';
import {
  readBriefPanelOpen,
  readBriefSeen,
  writeBriefPanelOpen,
  writeBriefSeen,
} from '@/lib/utils/brief-panel-state';

/** Опрос прогонов, пока бриф «в очереди»: автопрогон стартует в фоне, Realtime доезжает не всегда. */
const QUEUED_POLL_MS = 60_000;

/**
 * S-BRIEF-IN-DEAL-1.2: AI-бриф компании для шага сделки.
 *
 * Прогоны — `useEntityRuns('company', id)`: ключ `['ai_runs','company',id]` общий с
 * карточкой компании, второго запроса нет. Очередь автосбора — RPC
 * `company_brief_auto_state` (138); его сбой не роняет кнопку — она живёт без
 * текстов очереди.
 *
 * localStorage читается в инициализаторе `useState`, как у `CollapsibleSection`:
 * `DealNextStep` монтируется только после клиентского `useProject`, на сервере его
 * разметки нет — расхождения гидратации не возникает.
 */
export function useDealBrief(companyId: string | null) {
  const supabase = createClient();
  const qc = useQueryClient();

  const { data: runRows } = useEntityRuns('company', companyId);
  const runs = useMemo(() => pickBriefRuns(runRows ?? []), [runRows]);

  const autoKey = ['brief-auto-state', companyId] as const;
  const { data: auto = null } = useQuery({
    queryKey: autoKey,
    enabled: !!companyId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BriefAutoState | null> => {
      const { data, error } = await supabase.rpc('company_brief_auto_state', { p_company_id: companyId! });
      if (error) return null;
      return toBriefAutoState(Array.isArray(data) ? data[0] : null);
    },
  });

  // Последний прогон сменился (стартовал / закончился) — очередь на сервере уже другая.
  // Первый рендер пропускаем: иначе свежий запрос состояния ушёл бы дважды.
  const latestSig = runs.latest ? `${runs.latest.id}:${runs.latest.status}` : null;
  const prevSig = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevSig.current !== undefined && prevSig.current !== latestSig && companyId) {
      qc.invalidateQueries({ queryKey: ['brief-auto-state', companyId] });
    }
    prevSig.current = latestSig;
  }, [latestSig, companyId, qc]);

  const [open, setOpen] = useState(() => readBriefPanelOpen());

  // «Увиденный» прогон — per-компания; сделка может смениться без размонтирования,
  // поэтому состояние помнит, к какой компании относится, и при смене читается заново.
  const [seen, setSeen] = useState(() => ({
    companyId,
    runId: companyId ? readBriefSeen(companyId) : null,
  }));
  const storedSeen = seen.companyId === companyId ? seen.runId : companyId ? readBriefSeen(companyId) : null;
  const latestDoneId = runs.latestDone?.id ?? null;
  // Пока панель раскрыта, бриф считается увиденным — точка гаснет сразу.
  const seenRunId = open && latestDoneId ? latestDoneId : storedSeen;

  // Раскрыто — пишем «увидел» в хранилище, чтобы точка не вернулась после перезагрузки.
  useEffect(() => {
    if (open && companyId && latestDoneId) writeBriefSeen(companyId, latestDoneId);
  }, [open, companyId, latestDoneId]);

  const kind = briefKind({ runs, auto, seenRunId, now: new Date() });

  useEffect(() => {
    if (kind !== 'queued' || !companyId) return;
    const t = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ['ai_runs', 'company', companyId] });
    }, QUEUED_POLL_MS);
    return () => window.clearInterval(t);
  }, [kind, companyId, qc]);

  function toggle() {
    const next = !open;
    setOpen(next);
    writeBriefPanelOpen(next);
    // Закрыли — «увиденное» фиксируется в состоянии, иначе точка вернулась бы
    // со старым значением до перезагрузки.
    if (!next && companyId && latestDoneId) setSeen({ companyId, runId: latestDoneId });
  }

  const { data: role, isSuccess: roleKnown } = useOrgRole();
  const canRun = roleKnown && !!role && role !== 'viewer';

  const start = useStartRun('company', companyId ?? '');
  function run() {
    if (!companyId) return;
    start.mutate(
      { preset_key: 'company_brief' },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['ai_runs', 'company', companyId] });
          qc.invalidateQueries({ queryKey: ['brief-auto-state', companyId] });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return { kind, runs, auto, open, toggle, canRun, run, starting: start.isPending };
}
