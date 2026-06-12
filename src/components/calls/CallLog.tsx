'use client';

import { useState, useMemo } from 'react';
import { Phone, Pencil, Trash2, Building2, User, FolderKanban, Calendar, Loader2, Plus, Clock } from 'lucide-react';
import { CTAButton } from '@/components/ui/CTAButton';
import { PageHeader } from '@/components/layout/PageHeader';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import { useCalls, useDeleteCall, type Call } from '@/lib/hooks/use-calls';
import { useCreateTask } from '@/lib/hooks/use-tasks';
import { staggerClass } from '@/lib/utils/stagger';
import { CALL_STATUS_CONFIG, formatDuration, type CallStatus } from '@/lib/validators/call';
import { CallModal } from './CallModal';
import { CallTracker } from './CallTracker';
import { CheckSquare } from 'lucide-react';

type TabFilter = 'all' | CallStatus;

export function CallLog() {
  const { data: calls, isLoading, error } = useCalls();
  const deleteCall = useDeleteCall();

  const createTask = useCreateTask();
  const [modalOpen, setModalOpen] = useState(false);
  const [editCall, setEditCall] = useState<Call | null>(null);
  const [tab, setTab] = useState<TabFilter>('all');
  const [taskSuggestion, setTaskSuggestion] = useState<{ text: string; projectId: string | null } | null>(null);

  function handleCallSaved(values: { next_step?: string | null; project_id?: string | null }) {
    if (values.next_step?.trim() && !editCall) {
      setTaskSuggestion({ text: values.next_step.trim(), projectId: values.project_id ?? null });
    }
  }

  function handleCreateTask() {
    if (!taskSuggestion) return;
    createTask.mutate({ text: taskSuggestion.text, lane: 'now', project_id: taskSuggestion.projectId });
    setTaskSuggestion(null);
  }

  const filtered = useMemo(() => {
    if (!calls) return [];
    if (tab === 'all') return calls;
    return calls.filter((c) => c.status === tab);
  }, [calls, tab]);

  // Upcoming (pending) calls for the sidebar
  const scheduledCalls = useMemo(() => {
    if (!calls) return [];
    return calls
      .filter((c) => c.status === 'pending' && new Date(c.date) >= new Date())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [calls]);

  function handleDelete(id: string) {
    if (confirm('Удалить звонок?')) deleteCall.mutate(id);
  }

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки звонков</p>
        <p className="mt-1 text-xs text-text-mute">{(error as Error).message}</p>
      </div>
    );
  }

  const tabs: { key: TabFilter; label: string; count: number; activeColor: string }[] = [
    { key: 'all', label: 'Все', count: calls?.length ?? 0, activeColor: 'border-accent text-accent' },
    { key: 'done', label: 'Выполненные', count: calls?.filter((c) => c.status === 'done').length ?? 0, activeColor: 'border-green text-green' },
    { key: 'pending', label: 'Запланированные', count: calls?.filter((c) => c.status === 'pending').length ?? 0, activeColor: 'border-yellow text-yellow' },
    { key: 'cancelled', label: 'Отменённые', count: calls?.filter((c) => c.status === 'cancelled').length ?? 0, activeColor: 'border-red text-red' },
  ];

  return (
    <>
      <PageHeader
        title="Звонки"
        wmText="Звонки"
        wmColors={WATERMARK_GRADIENTS.tidal}
        icon={<Phone size={18} className="text-accent" />}
        action={<CTAButton size="sm" onClick={() => { setEditCall(null); setModalOpen(true); }}><Plus size={14} /> Звонок</CTAButton>}
      />

      {/* Layout: tracker + scheduled | call log */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Sidebar: tracker + scheduled */}
        <div className="space-y-4">
          <CallTracker onQuickLog={() => { setEditCall(null); setModalOpen(true); }} />

          {/* Scheduled calls */}
          {scheduledCalls.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock size={14} className="text-blue" />
                <span className="text-xs font-semibold text-text-main">Ближайшие звонки</span>
              </div>
              <div className="space-y-2">
                {scheduledCalls.map((c) => (
                  <div key={c.id} data-card className="rounded-lg border border-border/50 bg-bg px-2.5 py-2">
                    <div className="flex items-center gap-1 text-[10px] text-blue">
                      <Calendar size={9} />
                      {new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {c.company?.name && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-text-main">
                        <Building2 size={10} /> {c.company.name}
                      </div>
                    )}
                    {c.contact && (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-dim">
                        <User size={9} /> {c.contact.first_name} {c.contact.last_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main call log */}
        <div>
          {/* Tabs */}
          <div className="mb-3 flex gap-1 border-b border-border">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px
                  ${tab === t.key ? t.activeColor : 'border-transparent text-text-mute hover:text-text-dim'}`}>
                {t.label}
                <span className="ml-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px]">{t.count}</span>
              </button>
            ))}
          </div>

          {/* Call list */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-mute">Нет звонков</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((call, i) => {
                const isOverdue = call.status === 'pending' && new Date(call.date) < new Date(new Date().toDateString());
                const statusBg = isOverdue ? 'bg-red/10' : CALL_STATUS_CONFIG[call.status].bg;
                const statusColor = isOverdue ? 'text-red' : CALL_STATUS_CONFIG[call.status].color;
                const statusLabel = isOverdue ? 'Просрочен' : CALL_STATUS_CONFIG[call.status].label;

                return (
                <div key={call.id} data-card
                  className={`group flex items-start gap-3 rounded-xl border border-border/50 bg-surface px-4 py-3 transition-colors hover:border-border ${staggerClass(i)}`}>

                  {/* Status dot */}
                  <div className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${statusBg}`}>
                    <Phone size={11} className={statusColor} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBg} ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <span className="text-[10px] text-text-dim">
                        {new Date(call.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {call.duration_s != null && call.duration_s > 0 && (
                        <span className="text-[10px] text-text-dim">{formatDuration(call.duration_s)}</span>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      {call.company?.name && (
                        <span className="flex items-center gap-0.5 text-text-main">
                          <Building2 size={10} /> {call.company.name}
                        </span>
                      )}
                      {call.contact && (
                        <span className="flex items-center gap-0.5 text-text-dim">
                          <User size={10} /> {call.contact.first_name} {call.contact.last_name}
                        </span>
                      )}
                      {call.project?.name && (
                        <span className="flex items-center gap-0.5 text-text-dim">
                          <FolderKanban size={10} /> {call.project.name}
                        </span>
                      )}
                    </div>

                    {/* Agreements */}
                    {call.agreements && (
                      <p className="mt-1 line-clamp-2 text-xs text-text-dim">{call.agreements}</p>
                    )}

                    {/* Next step */}
                    {call.next_step && (
                      <p className="mt-0.5 text-[10px] text-accent">→ {call.next_step}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => { setEditCall(call); setModalOpen(true); }}
                      aria-label="Редактировать"
                      className="rounded p-1 text-text-mute hover:bg-surface-hover hover:text-text-main">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => handleDelete(call.id)}
                      aria-label="Удалить"
                      className="rounded p-1 text-text-mute hover:bg-red/10 hover:text-red">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      </div>

      <CallModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditCall(null); }} editCall={editCall} onSaved={handleCallSaved} />

      {/* Task suggestion toast */}
      {taskSuggestion && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-border bg-surface p-4 elevation-3">
          <div className="mb-1 flex items-center gap-2">
            <CheckSquare size={14} className="text-accent" />
            <span className="text-sm font-medium text-text-main">Создать задачу?</span>
          </div>
          <p className="mb-3 text-xs text-text-dim">
            По звонку: «{taskSuggestion.text}»
          </p>
          <div className="flex gap-2">
            <button onClick={handleCreateTask}
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
