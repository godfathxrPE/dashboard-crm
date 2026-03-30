'use client';

import { useState, useMemo } from 'react';
import { CalendarDays, Plus, Pencil, Trash2, MapPin, FolderKanban, Clock, Loader2 } from 'lucide-react';
import { useMeetings, useDeleteMeeting, type Meeting } from '@/lib/hooks/use-meetings';
import { MeetingModal } from './MeetingModal';

export function MeetingsList() {
  const { data: meetings, isLoading, error } = useMeetings();
  const deleteMeeting = useDeleteMeeting();

  const [modalOpen, setModalOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);

  const { upcoming, past } = useMemo(() => {
    if (!meetings) return { upcoming: [], past: [] };
    const today = new Date().toISOString().slice(0, 10);
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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-main">Встречи</h1>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-mute">
            {meetings?.length ?? 0}
          </span>
        </div>
        <button onClick={() => { setEditMeeting(null); setModalOpen(true); }}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
          <Plus size={14} /> Встреча
        </button>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-1 text-xs font-semibold text-blue">
            <Clock size={12} /> Предстоящие ({upcoming.length})
          </h2>
          <div className="space-y-2">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} meeting={m}
                onEdit={() => { setEditMeeting(m); setModalOpen(true); }}
                onDelete={() => handleDelete(m.id)}
                isUpcoming
              />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      <div>
        <h2 className="mb-3 text-xs font-semibold text-text-mute">
          Прошедшие ({past.length})
        </h2>
        {past.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-mute">Нет прошедших встреч</div>
        ) : (
          <div className="space-y-2">
            {past.map((m) => (
              <MeetingCard key={m.id} meeting={m}
                onEdit={() => { setEditMeeting(m); setModalOpen(true); }}
                onDelete={() => handleDelete(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      <MeetingModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditMeeting(null); }} editMeeting={editMeeting} />
    </>
  );
}

// ═══ Meeting Card ═══

function MeetingCard({
  meeting,
  onEdit,
  onDelete,
  isUpcoming = false,
}: {
  meeting: Meeting;
  onEdit: () => void;
  onDelete: () => void;
  isUpcoming?: boolean;
}) {
  const dateStr = new Date(meeting.date).toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className={`group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors hover:border-border
        ${isUpcoming ? 'border-blue/30 bg-blue/5' : 'border-border/50 bg-surface'}`}
    >
      {/* Date badge */}
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg
        ${isUpcoming ? 'bg-blue/10' : 'bg-surface'}`}>
        <span className={`text-sm font-bold ${isUpcoming ? 'text-blue' : 'text-text-main'}`}>
          {new Date(meeting.date).getDate()}
        </span>
        <span className="text-[8px] uppercase text-text-mute">
          {new Date(meeting.date).toLocaleDateString('ru-RU', { month: 'short' })}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-text-main">{meeting.title}</span>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-text-mute">
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
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={onEdit} className="rounded p-1 text-text-mute hover:bg-surface-hover hover:text-text-main">
          <Pencil size={12} />
        </button>
        <button onClick={onDelete} className="rounded p-1 text-text-mute hover:bg-red/10 hover:text-red">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
