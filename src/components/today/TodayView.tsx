'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Phone, PhoneOutgoing, CheckSquare, Briefcase, CalendarDays } from 'lucide-react';
import { useCalls, useUpdateCall } from '@/lib/hooks/use-calls';
import { useTasks, useUpdateTask } from '@/lib/hooks/use-tasks';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { useProjects, type Project } from '@/lib/hooks/use-projects';
import { useIsProjectActive } from '@/lib/hooks/use-pipelines';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { localDateKey } from '@/lib/utils/date-helpers';
import { ProjectModal } from '@/components/projects/ProjectModal';
import { TodayFocus } from './TodayFocus';
import { QueueRow } from './QueueRow';
import type { ReactNode } from 'react';

const RED = 'var(--red-text, var(--red))';
const YELLOW = 'var(--yellow-text, var(--yellow))';

function dayPart(iso: string) { return iso.slice(0, 10); }
function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function TodayView() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: calls = [] } = useCalls();
  const { data: tasks = [] } = useTasks();
  const { data: meetings = [] } = useMeetings();
  const { data: projects = [] } = useProjects();
  const isProjectActive = useIsProjectActive();
  const updateCall = useUpdateCall();
  const updateTask = useUpdateTask();

  // ProjectModal (для «Запланировать шаг» из строки сделки — Sprint W1a)
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const todayKey = mounted ? localDateKey() : '';
  const tomorrowKey = mounted ? localDateKey(new Date(Date.now() + 86400000)) : '';

  const overdueCalls = useMemo(
    () => calls.filter((c) => c.status === 'pending' && dayPart(c.date) < todayKey)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [calls, todayKey],
  );
  const todayCalls = useMemo(
    () => calls.filter((c) => c.status === 'pending' && dayPart(c.date) === todayKey)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [calls, todayKey],
  );
  const nowTasks = useMemo(() => {
    const isOverdue = (t: typeof tasks[number]) => !!t.deadline && t.deadline < todayKey;
    return tasks.filter((t) => t.lane === 'now').sort((a, b) => {
      const oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
    });
  }, [tasks, todayKey]);
  const rottingDeals = useMemo(
    () => projects.filter((p) => isProjectActive(p) && getDealHealth(p) !== 'ok'),
    [projects, isProjectActive],
  );
  const todayMeetings = useMemo(
    () => meetings.filter((m) => dayPart(m.date) === todayKey)
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [meetings, todayKey],
  );

  const total = overdueCalls.length + todayCalls.length + nowTasks.length
    + rottingDeals.length + todayMeetings.length;

  const bumpCall = (id: string, iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
    updateCall.mutate({ id, date: d.toISOString() });
  };

  const openDeal = (p: Project) => { setEditProject(p); setModalOpen(true); };

  const callName = (c: typeof calls[number]) =>
    c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок';

  const dateProse = mounted
    ? format(new Date(), 'EEEE, d MMMM', { locale: ru }).replace(/^./, (ch) => ch.toUpperCase())
    : '';

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <header className="mb-8">
        <h1 className="aura-page-title text-2xl font-semibold text-text-main">Сегодня</h1>
        <p className="mt-1 text-sm text-text-dim">
          {dateProse}
          {mounted && (
            <span className="ml-2 text-text-mute">
              · {total === 0 ? 'ничего не требует действия' : `${total} ${pluralAction(total)}`}
            </span>
          )}
        </p>
      </header>

      <TodayFocus />

      {mounted && total === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* 2. Просроченные звонки */}
          <Section title="Просроченные звонки" count={overdueCalls.length} icon={<Phone size={13} />}>
            {overdueCalls.map((c) => (
              <QueueRow
                key={c.id}
                marker={{ filled: true, color: RED, title: 'Просрочен' }}
                title={callName(c)}
                subtitle={c.contact ? c.company?.name ?? undefined : undefined}
                meta={<span style={{ color: RED }}>{dateShort(c.date)} {timeStr(c.date)}</span>}
                onOpen={() => router.push('/calls')}
                primary={{ label: 'Выполнен', onClick: () => updateCall.mutate({ id: c.id, status: 'done' }) }}
                secondary={{ label: 'На завтра', onClick: () => bumpCall(c.id, c.date) }}
              />
            ))}
          </Section>

          {/* 3. Звонки на сегодня */}
          <Section title="Звонки на сегодня" count={todayCalls.length} icon={<PhoneOutgoing size={13} />}>
            {todayCalls.map((c) => (
              <QueueRow
                key={c.id}
                marker={{ filled: false, color: 'var(--accent)', title: 'Сегодня' }}
                title={callName(c)}
                subtitle={c.contact ? c.company?.name ?? undefined : undefined}
                meta={timeStr(c.date)}
                onOpen={() => router.push('/calls')}
                primary={{ label: 'Выполнен', onClick: () => updateCall.mutate({ id: c.id, status: 'done' }) }}
                secondary={{ label: 'На завтра', onClick: () => bumpCall(c.id, c.date) }}
              />
            ))}
          </Section>

          {/* 4. Задачи в работе */}
          <Section title="Задачи в работе" count={nowTasks.length} icon={<CheckSquare size={13} />}>
            {nowTasks.map((t) => {
              const overdue = !!t.deadline && t.deadline < todayKey;
              return (
                <QueueRow
                  key={t.id}
                  marker={overdue
                    ? { filled: true, color: RED, title: 'Просрочена' }
                    : { filled: false, color: 'var(--text-mute)' }}
                  title={t.text}
                  subtitle={t.project?.name ?? undefined}
                  meta={t.deadline
                    ? <span style={overdue ? { color: RED } : undefined}>{dateShort(t.deadline)}</span>
                    : undefined}
                  onOpen={() => router.push('/tasks')}
                  primary={{ label: 'Готово', onClick: () => updateTask.mutate({ id: t.id, lane: 'done' }) }}
                  secondary={{ label: 'На завтра', onClick: () => updateTask.mutate({ id: t.id, deadline: tomorrowKey }) }}
                />
              );
            })}
          </Section>

          {/* 5. Сделки без шага */}
          <Section title="Сделки без шага" count={rottingDeals.length} icon={<Briefcase size={13} />}>
            {rottingDeals.map((p) => {
              const dh = getDealHealth(p);
              const overdue = dh === 'overdue-action';
              return (
                <QueueRow
                  key={p.id}
                  marker={overdue
                    ? { filled: true, color: RED }
                    : { filled: false, color: YELLOW }}
                  title={p.name}
                  subtitle={p.company?.name ?? undefined}
                  meta={
                    <span style={{ color: overdue ? RED : YELLOW }}>
                      {overdue
                        ? `шаг просрочен ${getNextActionOverdueDays(p.next_action_date!)} дн.`
                        : 'нет шага'}
                    </span>
                  }
                  onOpen={() => router.push(`/projects/${p.id}`)}
                  primary={{ label: 'Запланировать шаг', onClick: () => openDeal(p) }}
                />
              );
            })}
          </Section>

          {/* 6. Встречи сегодня */}
          <Section title="Встречи сегодня" count={todayMeetings.length} icon={<CalendarDays size={13} />}>
            {todayMeetings.map((m) => (
              <QueueRow
                key={m.id}
                marker={{ filled: false, color: 'var(--accent)' }}
                title={m.title}
                subtitle={m.project?.name ?? undefined}
                meta={m.time ?? '—'}
                onOpen={() => router.push('/meetings')}
              />
            ))}
          </Section>
        </>
      )}

      <ProjectModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditProject(null); }}
        editProject={editProject}
        focusNextAction
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════

function Section({ title, count, icon, children }: {
  title: string; count: number; icon: ReactNode; children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="mb-7">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
        {icon}
        {title}
        <span className="text-text-mute">{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-xl font-medium text-text-main">Всё разобрано</p>
      <p className="mt-1 text-sm text-text-dim">На сегодня очередь пуста.</p>
      <Link
        href="/overview"
        className="mt-5 rounded-lg border border-border px-4 py-2 text-sm text-text-dim
                   transition-colors hover:border-accent hover:text-accent"
      >
        Открыть обзор
      </Link>
    </div>
  );
}

function pluralAction(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'требует действия';
  return 'требуют действия';
}
