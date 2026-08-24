'use client';

import Link from 'next/link';
import { Building2, User } from 'lucide-react';
import type { Project } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useStageTimeGauge } from '@/lib/hooks/use-stage-gauge';
import { useActivityLog } from '@/lib/hooks/use-activity-log';
import { formatBudget } from '@/lib/validators/project';
import { describeEvent, relativeTime } from '@/lib/utils/activity-events';
import { Badge } from '@/components/ui/Badge';
import { StageTimeRing } from '@/components/shared/StageTimeRing';
import { DealFocusPanel } from './DealFocusPanel';

/**
 * Содержимое peek-панели сделки (Sprint W2d) — композиция существующих блоков:
 * статус-строка, DealFocusPanel (inline-правка шага работает прямо в peek),
 * ссылки на компанию/контакт, последние 3 события таймлайна.
 * activity_log уже запрашивается внутри DealFocusPanel — тот же кеш, без лишнего запроса.
 */
export function ProjectPeekContent({ project }: { project: Project }) {
  const { data: stages } = usePipelineStages();
  const { data: entries = [] } = useActivityLog(project.id);

  // Путь B: имя стадии — только из pipeline_stages (stage_id), legacy `stage` не читаем.
  const stage = stages?.find((s) => s.id === project.stage_id) ?? null;
  const stageName = stage?.name ?? '—';

  // S-PIPELINE-RING-2: время стадии тем же датчиком, что у кокпита и канбана.
  // Терминальная сделка (won/lost) кольца не получает.
  const isTerminal = !!stage?.is_won || !!stage?.is_lost
    || project.status === 'won' || project.status === 'lost';
  const timeGauge = useStageTimeGauge(
    isTerminal ? null : project.stage_entered_at,
    isTerminal ? null : stage,
  );

  return (
    <div>
      {/* Статус-строка: стадия + направление + бюджет + дедлайн */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-full bg-accent-l px-2 py-0.5 text-xs font-medium text-accent">
            {stageName}
          </span>
          <StageTimeRing gauge={timeGauge} showDays />
        </span>
        <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
          {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
        </Badge>
        <span className="font-medium text-text-main tabular-nums">
          {project.budget && project.budget > 0 ? formatBudget(project.budget) : 'без бюджета'}
        </span>
        {project.deadline && (
          <span className="text-text-dim">
            до {new Date(project.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      <DealFocusPanel project={project} />

      {/* Компания и контакт */}
      {(project.company || project.contact) && (
        <div className="mb-5 space-y-1.5 text-sm">
          {project.company && (
            <Link
              href={`/companies/${project.company_id}`}
              className="flex items-center gap-1.5 text-accent hover:underline"
            >
              <Building2 size={13} />
              {project.company.name}
            </Link>
          )}
          {project.contact && (
            <Link
              href={`/contacts/${project.contact_id}`}
              className="flex items-center gap-1.5 text-accent hover:underline"
            >
              <User size={13} />
              {project.contact.first_name} {project.contact.last_name}
            </Link>
          )}
        </div>
      )}

      {/* Последние события таймлайна */}
      {entries.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-text-dim">Последние события</div>
          <div className="space-y-2">
            {entries.slice(0, 3).map((entry) => (
              <div key={entry.id} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 tabular-nums text-text-mute">
                  {relativeTime(entry.created_at)}
                </span>
                <span className="min-w-0 truncate text-text-dim">{describeEvent(entry)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
