'use client';

import { useState, useMemo } from 'react';
import { CalendarDays, Plus, Pencil, Sparkles, Trash2, MapPin, FolderKanban, Clock, Loader2, CheckSquare } from 'lucide-react';
import { useCreateTask } from '@/lib/hooks/use-tasks';
import { CTAButton } from '@/components/ui/CTAButton';
import { PageHeader } from '@/components/layout/PageHeader';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import { useMeetings, useDeleteMeeting, type Meeting } from '@/lib/hooks/use-meetings';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { staggerClass } from '@/lib/utils/stagger';
import { useThemeStore } from '@/lib/stores/theme-store';
import { cn } from '@/lib/utils/cn';
import { MeetingModal } from './MeetingModal';
import { AiWorkspaceModal } from '@/components/ai/AiWorkspaceModal';
import { localDateKey } from '@/lib/utils/date-helpers';

export function MeetingsList() {
  const { data: meetings, isLoading, error } = useMeetings();
  const deleteMeeting = useDeleteMeeting();
  const { data: role } = useOrgRole();
  const canCreate = role != null && role !== 'viewer'; // T2: viewer не создаёт (RLS 42501)

  const [modalOpen, setModalOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [aiMeeting, setAiMeeting] = useState<Meeting | null>(null);

  // Toast «создать задачу?» по следующему шагу — паттерн CallLog
  const createTask = useCreateTask();
  const [taskSuggestion, setTaskSuggestion] = useState<{ text: string; projectId: string | null } | null>(null);

  function handleMeetingSaved(values: { next_step?: string | null; project_id?: string | null }) {
    if (values.next_step?.trim() && !editMeeting) {
      setTaskSuggestion({ text: values.next_step.trim(), projectId: values.project_id ?? null });
    }
  }

  const { upcoming, past } = useMemo(() => {
    if (!meetings) return { upcoming: [], past: [] };
    const today = localDateKey();
    const up: Meeting[] = [];
    const pa: Meeting[] = [];
    for (const m of meetings) {
      if (m.date >= today) up.push(m);
      else pa.push(m);
    }
    // Upcoming: soonest first
    up.sort((a, b) => a.date.localeCompare(b.date));
    // Past: most recent first (already sorted desc from query)
    return { upcoming: up, past: pa };
  }, [meetings]);

  function handleDelete(id: string) {
    if (confirm('Удалить встречу?')) deleteMeeting.mutate(id);
  }

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки встреч</p>
        <p className="mt-1 text-xs text-text-mute">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Встречи"
        wmText="Встречи"
        wmColors={WATERMARK_GRADIENTS.frost}
        count={meetings?.length ?? 0}
        icon={<CalendarDays size={18} className="text-accent" />}
        action={canCreate ? <CTAButton size="sm" onClick={() => { setEditMeeting(null); setModalOpen(true); }}><Plus size={14} /> Встреча</CTAButton> : undefined}
      />

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-yellow">
            <Clock size={12} /> Предстоящие
            <span className="rounded-full bg-yellow-l px-2 py-0.5 text-xs font-medium text-yellow">{upcoming.length}</span>
          </h2>
          <div className="space-y-2">
            {upcoming.map((m, i) => (
              <div key={m.id} className={staggerClass(i)}>
                <MeetingCard meeting={m}
                  onEdit={() => { setEditMeeting(m); setModalOpen(true); }}
                  onAi={() => setAiMeeting(m)}
                  onDelete={() => handleDelete(m.id)}
                  isUpcoming
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      <div data-meetings-past>
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-text-dim">
          Прошедшие
          <span className="rounded-full bg-green-l px-2 py-0.5 text-xs font-medium text-green">{past.length}</span>
        </h2>
        {past.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-mute">Нет прошедших встреч</div>
        ) : (
          <div className="space-y-2">
            {past.map((m, i) => (
              <div key={m.id} className={staggerClass(i)}>
                <MeetingCard meeting={m}
                  onEdit={() => { setEditMeeting(m); setModalOpen(true); }}
                  onAi={() => setAiMeeting(m)}
                  onDelete={() => handleDelete(m.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <MeetingModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditMeeting(null); }}
        editMeeting={editMeeting}
        onSaved={handleMeetingSaved}
      />

      {aiMeeting && (
        <AiWorkspaceModal
          isOpen={!!aiMeeting}
          onClose={() => setAiMeeting(null)}
          entityType="meeting"
          entityId={aiMeeting.id}
          projectId={aiMeeting.project_id}
          companyId={aiMeeting.company_id}
          contactId={aiMeeting.contact_id}
        />
      )}

      {/* Task suggestion toast (как в CallLog) */}
      {taskSuggestion && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-border bg-surface p-4 elevation-3">
          <div className="mb-1 flex items-center gap-2">
            <CheckSquare size={14} className="text-accent" />
            <span className="text-sm font-medium text-text-main">Создать задачу?</span>
          </div>
          <p className="mb-3 text-xs text-text-dim">По встрече: «{taskSuggestion.text}»</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                createTask.mutate({ text: taskSuggestion.text, lane: 'now', project_id: taskSuggestion.projectId });
                setTaskSuggestion(null);
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity">
              Создать
            </button>
            <button onClick={() => setTaskSuggestion(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-text-dim hover:text-text-main transition-colors">
              Пропустить
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ═══ Meeting Card ═══

function MeetingCard({
  meeting,
  onEdit,
  onAi,
  onDelete,
  isUpcoming = false,
}: {
  meeting: Meeting;
  onEdit: () => void;
  onAi: () => void;
  onDelete: () => void;
  isUpcoming?: boolean;
}) {
  // Aura: статус встречи — НЕ палка сбоку, а цвет date-бейджа + data-атрибут
  const isAura = useThemeStore((s) => s.theme === 't-aura');
  const dateStr = new Date(meeting.date).toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      data-meeting-status={isAura ? (isUpcoming ? 'upcoming' : 'past') : undefined}
      className={cn(
        'group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors hover:border-border bg-surface',
        // Палки border-l — только НЕ в Aura
        !isAura && isUpcoming && 'border-yellow/30 border-l-2 border-l-yellow',
        !isAura && !isUpcoming && 'border-border/50 border-l-2 border-l-green',
        isAura && 'border-border/60',
      )}
    >
      {/* Date badge */}
      <div className="mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-accent text-white">
        <span className="text-sm font-bold">
          {new Date(meeting.date).getDate()}
        </span>
        <span className="text-xs uppercase opacity-80">
          {new Date(meeting.date).toLocaleDateString('ru-RU', { month: 'short' })}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-text-main">{meeting.title}</span>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim">
          <span>{dateStr}</span>
          {meeting.time && <span>{meeting.time.slice(0, 5)}</span>}
          {meeting.location && (
            <span className="flex items-center gap-0.5">
              <MapPin size={9} /> {meeting.location}
            </span>
          )}
          {meeting.project?.name && (
            <span className="flex items-center gap-0.5 text-accent">
              <FolderKanban size={9} /> {meeting.project.name}
            </span>
          )}
        </div>

        {meeting.notes && (
          <p className="mt-1 line-clamp-2 text-xs text-text-dim">{meeting.notes}</p>
        )}
        {meeting.next_step && (
          <p className="mt-0.5 text-xs text-accent">→ {meeting.next_step}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={onAi} aria-label="AI-анализ" className="rounded p-1 text-text-mute hover:bg-surface-hover hover:text-accent">
          <Sparkles size={12} />
        </button>
        <button onClick={onEdit} aria-label="Редактировать" className="rounded p-1 text-text-mute hover:bg-surface-hover hover:text-text-main">
          <Pencil size={12} />
        </button>
        <button onClick={onDelete} aria-label="Удалить" className="rounded p-1 text-text-mute hover:bg-red/10 hover:text-red">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
