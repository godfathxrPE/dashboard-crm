'use client';

import { ChevronRight, Pin, Check } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { useActivityLog } from '@/lib/hooks/use-activity-log';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { HealthDot } from '@/components/shared/HealthDot';
import {
  calculateDealHealth,
  getDealHealth,
  getNextActionOverdueDays,
} from '@/lib/utils/deal-health';
import { cn } from '@/lib/utils/cn';

// ─── Дата следующего шага: «сегодня/завтра/вчера» вблизи, иначе «7 июля» ───
function formatActionDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const today = new Date(new Date().toDateString());
  const target = new Date(new Date(d).toDateString());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'завтра';
  if (diffDays === -1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function DealFocusPanel({ project, compact }: { project: Project; compact?: boolean }) {
  const updateProject = useUpdateProject();
  const { data: entries = [] } = useActivityLog(project.id);

  const health = getDealHealth(project);
  const overdue = health === 'overdue-action';
  const noAction = health === 'no-action';
  const overdueDays = overdue && project.next_action_date
    ? getNextActionOverdueDays(project.next_action_date)
    : 0;

  // Дней с последней активности — из уже закешированного activity_log (без нового запроса)
  const lastActivityDays = entries.length > 0
    ? Math.floor((Date.now() - new Date(entries[0].created_at!).getTime()) / 86400000)
    : null;

  const dealHealth = calculateDealHealth(project);

  function markStepDone() {
    updateProject.mutate({ id: project.id, next_step: null, next_action_date: null });
  }

  return (
    <div
      data-card
      className={cn(
        // px обязателен: в Aura [data-card] делает панель карточкой,
        // без горизонтальных отступов контент прилипал к её краям
        'mb-6 grid grid-cols-1 gap-x-8 gap-y-4 border-y border-border px-5 py-4',
        // compact — одна колонка (peek-панель 440px)
        !compact && 'md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_auto]',
      )}
    >
      {/* ─── Зона 1: Следующий шаг (доминирует) ─── */}
      <div
        className={cn(
          'min-w-0',
          noAction && 'rounded-lg border border-yellow/40 bg-yellow-l/30 px-3 py-2',
        )}
      >
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-accent">
          <ChevronRight size={13} />
          Следующий шаг
        </div>
        <div className="text-base leading-snug">
          <InlineEdit
            value={project.next_step ?? ''}
            placeholder="Какой следующий шаг?"
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, next_step: val || null });
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="flex items-center gap-1">
            <span className="text-text-dim">Дата:</span>
            <InlineEdit
              value={project.next_action_date ?? ''}
              type="date"
              placeholder="назначить"
              formatDisplay={formatActionDate}
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, next_action_date: val || null });
              }}
              className={cn('font-medium', overdue && 'text-red')}
            />
          </span>
          {overdue && (
            <span className="font-medium text-red">
              просрочен {overdueDays} дн.
            </span>
          )}
          {project.next_step && (
            <button
              onClick={markStepDone}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5
                         text-xs text-text-dim transition-colors hover:bg-surface-hover hover:text-green"
            >
              <Check size={12} />
              Шаг сделан
            </button>
          )}
        </div>
      </div>

      {/* ─── Зона 2: Закреплено ─── */}
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-text-dim">
          <Pin size={12} />
          Закреплено
        </div>
        <div className="text-body leading-relaxed">
          <InlineEdit
            as="textarea"
            value={project.pinned_note ?? ''}
            placeholder="Закрепить заметку…"
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, pinned_note: val || null });
            }}
          />
        </div>
      </div>

      {/* ─── Зона 3: Здоровье ─── */}
      <div className={cn('flex flex-row items-start gap-4', !compact && 'md:flex-col md:items-end md:gap-1')}>
        <div className={cn('mb-0 flex items-center gap-1 text-xs font-semibold text-text-dim', !compact && 'md:mb-1.5')}>
          Здоровье
        </div>
        <HealthDot level={dealHealth.level} score={dealHealth.total} size="md" showLabel />
        {lastActivityDays !== null && (
          <span className="text-xs text-text-mute">
            {lastActivityDays === 0
              ? 'активность сегодня'
              : `${lastActivityDays} дн. без активности`}
          </span>
        )}
      </div>
    </div>
  );
}
