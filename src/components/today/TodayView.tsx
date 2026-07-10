'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Phone, PhoneOutgoing, CheckSquare, Briefcase, CalendarDays, Snowflake, Target } from 'lucide-react';
import { useCalls, useUpdateCall } from '@/lib/hooks/use-calls';
import { useLeads, useUpdateLead } from '@/lib/hooks/use-leads';
import { leadStaleness } from '@/lib/constants/leads';
import { useTasks, useUpdateTask } from '@/lib/hooks/use-tasks';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { useProjects, type Project } from '@/lib/hooks/use-projects';
import { projectHref } from '@/lib/utils/project-href';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useIsProjectActive } from '@/lib/hooks/use-pipelines';
import { useLastTouchMap, daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { RECONNECT_THRESHOLD_DAYS } from '@/lib/constants/reconnect';
import { useUiStore } from '@/lib/stores/ui-store';
import { useKeyboardNav } from '@/lib/hooks/use-keyboard-nav';
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
  const { data: leads = [] } = useLeads();
  const { data: tasks = [] } = useTasks();
  const { data: meetings = [] } = useMeetings();
  const { data: projects = [] } = useProjects();
  const { data: contacts = [] } = useContacts();
  const isProjectActive = useIsProjectActive();
  const lastTouch = useLastTouchMap();
  const openModal = useUiStore((s) => s.openModal);
  const updateCall = useUpdateCall();
  const updateTask = useUpdateTask();
  const updateLead = useUpdateLead();

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
  // Лиды без реакции: new > 1 дн., contacted > 7 дн. (пороги в lib/constants/leads)
  const staleLeads = useMemo(
    () => leads
      .filter((l) => l.status === 'new' || l.status === 'contacted')
      .map((l) => ({ lead: l, s: leadStaleness(l) }))
      .filter((r) => r.s.level !== 'ok')
      .sort((a, b) => b.s.days - a.s.days),
    [leads],
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

  // «Остывают»: контакты активных сделок / компаний с активными сделками,
  // у которых последнее касание старше порога или его вовсе не было.
  const coolingContacts = useMemo(() => {
    const activeProjects = projects.filter((p) => isProjectActive(p));
    const activeContactIds = new Set(activeProjects.map((p) => p.contact_id).filter(Boolean) as string[]);
    const activeCompanyIds = new Set(activeProjects.map((p) => p.company_id).filter(Boolean) as string[]);

    return contacts
      .filter((c) =>
        activeContactIds.has(c.id) ||
        (c.companies ?? []).some((cc) => activeCompanyIds.has(cc.company_id)),
      )
      .map((c) => {
        const touch = lastTouch.get(c.id) ?? null;
        return { contact: c, days: touch ? daysSince(touch.date) : null };
      })
      .filter((r) => r.days === null || r.days > RECONNECT_THRESHOLD_DAYS)
      .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity)); // холоднее сверху
  }, [contacts, projects, isProjectActive, lastTouch]);

  const total = overdueCalls.length + todayCalls.length + staleLeads.length + nowTasks.length
    + rottingDeals.length + todayMeetings.length + coolingContacts.length;

  const bumpCall = (id: string, iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
    updateCall.mutate({ id, date: d.toISOString() });
  };

  const openDeal = (p: Project) => { setEditProject(p); setModalOpen(true); };

  // ─── Keyboard nav (Sprint W2d): j/k по плоской очереди, Enter — открыть, d — primary ───
  const coolingSlice = useMemo(() => coolingContacts.slice(0, 5), [coolingContacts]);
  const queueRef = useRef<HTMLDivElement>(null);

  // Порядок совпадает с порядком секций в JSX; смещения — для kbdIndex строк
  const flatRows: { open: () => void; primary?: () => void }[] = [
    ...overdueCalls.map((c) => ({
      open: () => router.push('/calls'),
      primary: () => updateCall.mutate({ id: c.id, status: 'done' as const }),
    })),
    ...todayCalls.map((c) => ({
      open: () => router.push('/calls'),
      primary: () => updateCall.mutate({ id: c.id, status: 'done' as const }),
    })),
    ...staleLeads.map(({ lead: l }) => ({
      open: () => router.push('/leads'),
      primary: () => updateLead.mutate(
        l.status === 'new'
          ? { id: l.id, status: 'contacted' as const }
          : { id: l.id, status: 'qualified' as const },
      ),
    })),
    ...nowTasks.map((t) => ({
      open: () => router.push('/tasks'),
      primary: () => updateTask.mutate({ id: t.id, lane: 'done' as const }),
    })),
    ...rottingDeals.map((p) => ({
      open: () => router.push(projectHref(p)),
      primary: () => openDeal(p),
    })),
    ...coolingSlice.map(({ contact: c }) => ({
      open: () => router.push(`/contacts/${c.id}`),
      // Шов W2b-3: передаём и компанию, не только контакт
      primary: () => openModal('call', undefined, {
        contactId: c.id,
        companyId: (c.companies ?? [])[0]?.company_id,
      }),
    })),
    ...todayMeetings.map(() => ({
      open: () => router.push('/meetings'),
    })),
  ];
  const offTodayCalls = overdueCalls.length;
  const offLeads = offTodayCalls + todayCalls.length;
  const offTasks = offLeads + staleLeads.length;
  const offDeals = offTasks + nowTasks.length;
  const offCooling = offDeals + rottingDeals.length;
  const offMeetings = offCooling + coolingSlice.length;

  const { activeIndex } = useKeyboardNav({
    itemCount: flatRows.length,
    onSelect: (i) => flatRows[i]?.open(),
    onAction: (i) => flatRows[i]?.primary?.(),
    // ProjectModal здесь локальный (не в ui-store) — глушим nav отдельно
    isActive: () => !modalOpen,
    containerRef: queueRef,
    enabled: mounted && flatRows.length > 0,
  });

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
        <div ref={queueRef}>
          {/* 2. Просроченные звонки */}
          <Section title="Просроченные звонки" count={overdueCalls.length} icon={<Phone size={13} />}>
            {overdueCalls.map((c, i) => (
              <QueueRow
                key={c.id}
                kbdIndex={i}
                focused={activeIndex === i}
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
            {todayCalls.map((c, i) => (
              <QueueRow
                key={c.id}
                kbdIndex={offTodayCalls + i}
                focused={activeIndex === offTodayCalls + i}
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

          {/* 3.5. Лиды без реакции (скорость первого касания) */}
          <Section title="Лиды без реакции" count={staleLeads.length} icon={<Target size={13} />}>
            {staleLeads.map(({ lead: l, s }, i) => {
              const color = s.level === 'cold' ? RED : YELLOW;
              return (
                <QueueRow
                  key={l.id}
                  kbdIndex={offLeads + i}
                  focused={activeIndex === offLeads + i}
                  marker={{ filled: s.level === 'cold', color }}
                  title={l.title}
                  subtitle={l.company_name_raw ?? l.contact_name_raw ?? undefined}
                  meta={
                    <span style={{ color }}>
                      {s.days} дн. {l.status === 'new' ? 'в новых' : 'без движения'}
                    </span>
                  }
                  onOpen={() => router.push('/leads')}
                  primary={l.status === 'new'
                    ? { label: 'Связаться', onClick: () => updateLead.mutate({ id: l.id, status: 'contacted' }) }
                    : { label: 'Квалифицировать', onClick: () => updateLead.mutate({ id: l.id, status: 'qualified' }) }}
                />
              );
            })}
          </Section>

          {/* 4. Задачи в работе */}
          <Section title="Задачи в работе" count={nowTasks.length} icon={<CheckSquare size={13} />}>
            {nowTasks.map((t, i) => {
              const overdue = !!t.deadline && t.deadline < todayKey;
              return (
                <QueueRow
                  key={t.id}
                  kbdIndex={offTasks + i}
                  focused={activeIndex === offTasks + i}
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
            {rottingDeals.map((p, i) => {
              const dh = getDealHealth(p);
              const overdue = dh === 'overdue-action';
              return (
                <QueueRow
                  key={p.id}
                  kbdIndex={offDeals + i}
                  focused={activeIndex === offDeals + i}
                  marker={overdue
                    ? { filled: true, color: RED }
                    : { filled: false, color: YELLOW }}
                  title={p.name}
                  subtitle={p.company?.name ?? undefined}
                  meta={
                    <span style={{ color: overdue ? RED : YELLOW }}>
                      {overdue
                        ? `шаг просрочен ${getNextActionOverdueDays(p.next_action_date!)} дн.`
                        : p.next_step?.trim()
                          ? 'нет даты шага'
                          : 'нет шага'}
                    </span>
                  }
                  onOpen={() => router.push(projectHref(p))}
                  primary={{ label: 'Запланировать шаг', onClick: () => openDeal(p) }}
                />
              );
            })}
          </Section>

          {/* 6. Остывают (reconnect) */}
          <Section title="Остывают" count={coolingContacts.length} icon={<Snowflake size={13} />}>
            {coolingSlice.map(({ contact: c, days }, i) => {
              const company = (c.companies ?? [])[0]?.company?.name;
              const cold = touchLevel(days) === 'cold';
              const color = cold ? RED : YELLOW;
              return (
                <QueueRow
                  key={c.id}
                  kbdIndex={offCooling + i}
                  focused={activeIndex === offCooling + i}
                  marker={{ filled: cold, color }}
                  title={`${c.first_name} ${c.last_name}`}
                  subtitle={company}
                  meta={
                    <span style={{ color }}>
                      {days === null ? 'касаний не было' : `${days} дн. без касания`}
                    </span>
                  }
                  onOpen={() => router.push(`/contacts/${c.id}`)}
                  primary={{
                    label: 'Запланировать звонок',
                    onClick: () => openModal('call', undefined, {
                      contactId: c.id,
                      companyId: (c.companies ?? [])[0]?.company_id,
                    }),
                  }}
                />
              );
            })}
          </Section>

          {/* 7. Встречи сегодня */}
          <Section title="Встречи сегодня" count={todayMeetings.length} icon={<CalendarDays size={13} />}>
            {todayMeetings.map((m, i) => (
              <QueueRow
                key={m.id}
                kbdIndex={offMeetings + i}
                focused={activeIndex === offMeetings + i}
                marker={{ filled: false, color: 'var(--accent)' }}
                title={m.title}
                subtitle={m.project?.name ?? undefined}
                meta={m.time ?? '—'}
                onOpen={() => router.push('/meetings')}
              />
            ))}
          </Section>
        </div>
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
