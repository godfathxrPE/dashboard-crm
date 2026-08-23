'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Phone, PhoneOutgoing, CheckSquare, Briefcase, CalendarDays, Snowflake, Target, CircleDashed, Clock } from 'lucide-react';
import { useCalls, useUpdateCall } from '@/lib/hooks/use-calls';
import { useLeads, useUpdateLead } from '@/lib/hooks/use-leads';
import { getLeadHealth, compareLeadHealth } from '@/lib/utils/lead-health';
import { useTasks, useUpdateTask } from '@/lib/hooks/use-tasks';
import { useMeetings, useMyMeetings } from '@/lib/hooks/use-meetings';
import { useAuth } from '@/lib/hooks/use-auth';
import { useProjects, type Project } from '@/lib/hooks/use-projects';
import { projectHref } from '@/lib/utils/project-href';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useIsProjectActive } from '@/lib/hooks/use-pipelines';
import { useLastTouchMap, daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { useReconnectDays } from '@/lib/hooks/use-org-settings';
import { useUiStore } from '@/lib/stores/ui-store';
import { useKeyboardNav } from '@/lib/hooks/use-keyboard-nav';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { localDateKey } from '@/lib/utils/date-helpers';
import { useQueueSnoozes, useSnooze, useUnsnooze } from '@/lib/hooks/use-queue-snooze';
import {
  activeSnoozes,
  excludeSnoozed,
  splitDealsByHealth,
  noPlanReason,
  type SnoozeEntityType,
} from '@/lib/domain/queue-snooze';
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

  const { user } = useAuth();
  const myId = user?.id ?? null;
  const { data: calls = [] } = useCalls();
  const { data: leads = [] } = useLeads();
  const { data: tasks = [] } = useTasks();
  const { data: meetings = [] } = useMeetings();
  const { data: projects = [] } = useProjects();
  const { data: contacts = [] } = useContacts();
  const isProjectActive = useIsProjectActive();
  const lastTouch = useLastTouchMap();
  const reconnectDays = useReconnectDays();
  const openModal = useUiStore((s) => s.openModal);
  const updateCall = useUpdateCall();
  const updateTask = useUpdateTask();
  const updateLead = useUpdateLead();
  // S-QUEUE-1: личный snooze строк очереди (сделки, лиды, остывающие контакты).
  const { snoozes, keys: snoozedKeys } = useQueueSnoozes();
  const snooze = useSnooze();
  const unsnooze = useUnsnooze();
  const [showSnoozed, setShowSnoozed] = useState(false);

  // ProjectModal (для «Запланировать шаг» из строки сделки — Sprint W1a)
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const todayKey = mounted ? localDateKey() : '';
  const tomorrowKey = mounted ? localDateKey(new Date(Date.now() + 86400000)) : '';

  // ── S-VIS-A: «Сегодня» — ЛИЧНАЯ очередь, а не сводка по организации.
  //
  // После 098 `useCalls()`/`useMeetings()` отдают записи всей org. Списку звонков и
  // календарю это и нужно, а здесь — нет: экран отвечает на вопрос «что сделать МНЕ»,
  // и чужой просроченный звонок в этой очереди означает, что человек пойдёт делать
  // чужую работу. Фильтруем у потребителя, хук остаётся командным.
  const myCalls = useMemo(
    () => (myId ? calls.filter((c) => c.created_by === myId) : []),
    [calls, myId],
  );
  const overdueCalls = useMemo(
    () => myCalls.filter((c) => c.status === 'pending' && dayPart(c.date) < todayKey)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [myCalls, todayKey],
  );
  const todayCalls = useMemo(
    () => myCalls.filter((c) => c.status === 'pending' && dayPart(c.date) === todayKey)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [myCalls, todayKey],
  );
  // Лиды — БЕЗ фильтра «мои», та же асимметрия, что у бейджа в сайдбаре: лид это общий
  // пул. Залежавшийся лид — проблема организации, и молчать о нём тому, кто может его
  // взять, только потому что заводил его не он, — ровно способ его потерять.
  //
  // S-LEAD-HUB-2b: очередь считает ЗДОРОВЬЕ лида, а не только его возраст.
  // Запланированный шаг глушит staleness (`getLeadHealth`), поэтому лид, к которому
  // менеджер вернётся послезавтра, из очереди уходит, а лид с просроченным шагом
  // приходит в неё, даже будучи «свежим». Порядок — `compareLeadHealth`: просрочка
  // это обещание клиенту, молчание — только риск.
  const leadsNeedingActionAll = useMemo(
    () => leads
      .filter((l) => l.status === 'new' || l.status === 'contacted')
      .map((l) => ({ lead: l, h: getLeadHealth(l) }))
      .filter((r) => r.h.level !== 'ok')
      .sort((a, b) => compareLeadHealth(a.h, b.h)),
    [leads],
  );
  // Отложенные вычитаются ПОСЛЕ отбора: `…All` остаётся источником для блока
  // «Отложено» — иначе отложенную строку не по чему показать и вернуть.
  const leadsNeedingAction = useMemo(
    () => excludeSnoozed(leadsNeedingActionAll, 'lead', (r) => r.lead.id, snoozedKeys),
    [leadsNeedingActionAll, snoozedKeys],
  );
  const nowTasks = useMemo(() => {
    const isOverdue = (t: typeof tasks[number]) => !!t.deadline && t.deadline < todayKey;
    return tasks.filter((t) => t.lane === 'now').sort((a, b) => {
      const oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
    });
  }, [tasks, todayKey]);
  // Delivery P1: только client — delivery/internal без next_step не «гниющая сделка»
  const rottingDeals = useMemo(
    () => projects.filter((p) => p.type === 'client' && isProjectActive(p) && getDealHealth(p) !== 'ok'),
    [projects, isProjectActive],
  );
  // ── S-QUEUE-1: «шаг просрочен» и «плана нет» — РАЗНЫЕ действия ──
  //
  // Первое — сделать или перенести уже данное обещание, второе — впервые
  // спланировать. В одной секции они читались как один упрёк, и девять сделок
  // выглядели одинаково безнадёжно. Ось та же, что у сигнала карточки
  // (`deal-signals.nextStepSignal`: bad против warn) — список и карточка обязаны
  // говорить на одном языке, иначе снова разойдутся.
  const dealsSplit = useMemo(() => splitDealsByHealth(rottingDeals), [rottingDeals]);
  const dealsOverdueStep = useMemo(
    () => excludeSnoozed(dealsSplit.overdueStep, 'deal', (p) => p.id, snoozedKeys),
    [dealsSplit, snoozedKeys],
  );
  const dealsNoPlan = useMemo(
    () => excludeSnoozed(dealsSplit.noPlan, 'deal', (p) => p.id, snoozedKeys),
    [dealsSplit, snoozedKeys],
  );
  // Встречи дня — сначала режем по дате, и только потом по «моим»: `useMyMeetings`
  // тянет состав по переданным id, и кормить его всей лентой встреч значило бы
  // запрашивать участников всей истории ради одного дня.
  const meetingsToday = useMemo(
    () => meetings.filter((m) => dayPart(m.date) === todayKey),
    [meetings, todayKey],
  );
  const myMeetingsToday = useMyMeetings(meetingsToday);
  const todayMeetings = useMemo(
    () => [...myMeetingsToday].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [myMeetingsToday],
  );

  // «Остывают»: контакты активных сделок / компаний с активными сделками,
  // у которых последнее касание старше порога или его вовсе не было.
  //
  // S-VIS-A: фильтра «мои» здесь нет и не нужно — секция и так сужена активными
  // ПРОЕКТАМИ, а `projects` осталась на member-модели 065, то есть в списке только те
  // сделки, где человек участник. `useLastTouchMap` при этом стал командным, и это
  // прямое улучшение: звонок коллеги теперь считается касанием контакта, а раньше
  // контакт «остывал» в глазах того, кто просто не видел чужого звонка.
  const coolingContactsAll = useMemo(() => {
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
      .filter((r) => r.days === null || r.days > reconnectDays)
      .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity)); // холоднее сверху
  }, [contacts, projects, isProjectActive, lastTouch, reconnectDays]);
  const coolingContacts = useMemo(
    () => excludeSnoozed(coolingContactsAll, 'contact', (r) => r.contact.id, snoozedKeys),
    [coolingContactsAll, snoozedKeys],
  );

  // ⚠️ `total` считает ВИДИМОЕ: отложенная строка выходит и из секции, и из счётчика,
  // иначе шапка обещает «13 требуют действия» над наполовину пустым экраном.
  const total = overdueCalls.length + todayCalls.length + leadsNeedingAction.length + nowTasks.length
    + dealsOverdueStep.length + dealsNoPlan.length + todayMeetings.length + coolingContacts.length;

  const bumpCall = (id: string, iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
    updateCall.mutate({ id, date: d.toISOString() });
  };

  // «Шаг сделан» — тот же жест, что у сделки (DealFocusPanel): чистим ОБА поля
  // одним апдейтом, иначе осиротевшая дата снова поднимет лид в очередь.
  const markLeadStepDone = (id: string) =>
    updateLead.mutate({ id, next_step: null, next_action_date: null });

  const openDeal = (p: Project) => { setEditProject(p); setModalOpen(true); };

  // S-QUEUE-1: «Отложить» — secondary-действие строки; отдельный проп QueueRow не заводим.
  const snoozeRow = (entity_type: SnoozeEntityType, entity_id: string) =>
    ({ label: 'Отложить', onClick: () => snooze.mutate({ entity_type, entity_id }) });

  // Отложенные строки для блока «Отложено на завтра · показать». Собираются
  // сопоставлением snooze с ПОЛНЫМИ списками (`…All`): если сделке за это время
  // назначили шаг, она вышла из очереди — показывать её как отложенную незачем,
  // и висячий snooze просто не находит свою строку (FK у entity_id нет, см. 129).
  const snoozedEntries = useMemo(() => {
    const out: { snoozeId: string; title: string; subtitle?: string; open: () => void }[] = [];
    for (const s of activeSnoozes(snoozes, todayKey)) {
      if (s.entity_type === 'deal') {
        const p = rottingDeals.find((x) => x.id === s.entity_id);
        if (p) out.push({
          snoozeId: s.id,
          title: p.name,
          subtitle: p.company?.name ?? undefined,
          open: () => router.push(projectHref(p)),
        });
      } else if (s.entity_type === 'lead') {
        const r = leadsNeedingActionAll.find((x) => x.lead.id === s.entity_id);
        if (r) out.push({
          snoozeId: s.id,
          title: r.lead.title,
          subtitle: r.lead.company_name_raw ?? r.lead.contact_name_raw ?? undefined,
          open: () => router.push(`/leads/${r.lead.id}`),
        });
      } else {
        const r = coolingContactsAll.find((x) => x.contact.id === s.entity_id);
        if (r) out.push({
          snoozeId: s.id,
          title: `${r.contact.first_name} ${r.contact.last_name}`,
          subtitle: (r.contact.companies ?? [])[0]?.company?.name,
          open: () => router.push(`/contacts/${r.contact.id}`),
        });
      }
    }
    return out;
  }, [snoozes, todayKey, rottingDeals, leadsNeedingActionAll, coolingContactsAll, router]);

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
    ...leadsNeedingAction.map(({ lead: l, h }) => ({
      open: () => router.push(`/leads/${l.id}`),
      // Действие по клавише `d` обязано совпадать с кнопкой в строке — иначе
      // клавиатура и мышь делают разное с одной и той же строкой.
      primary: () => (h.level === 'overdue-action'
        ? markLeadStepDone(l.id)
        : updateLead.mutate(
            l.status === 'new'
              ? { id: l.id, status: 'contacted' as const }
              : { id: l.id, status: 'qualified' as const },
          )),
    })),
    ...nowTasks.map((t) => ({
      open: () => router.push('/tasks'),
      primary: () => updateTask.mutate({ id: t.id, lane: 'done' as const }),
    })),
    ...dealsOverdueStep.map((p) => ({
      open: () => router.push(projectHref(p)),
      primary: () => openDeal(p),
    })),
    ...dealsNoPlan.map((p) => ({
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
  // ⚠️ Смещения обязаны идти тем же порядком, что секции в JSX ниже, и тем же, что
  // spread'ы в flatRows выше. Расхождение выглядит как «j/k подсвечивает одну строку,
  // Enter открывает другую» и не ловится ни tsc, ни тестами — сверять глазами по всем
  // ТРЁМ спискам. Порядок: звонки просроч. · звонки сегодня · лиды · задачи ·
  // сделки «просрочен шаг» · сделки «без плана» · остывают · встречи.
  //
  // Отложенные строки в flatRows НЕ входят намеренно: блок «Отложено» свёрнут по
  // умолчанию, и невидимые позиции в очереди j/k давали бы провалы фокуса.
  const offTodayCalls = overdueCalls.length;
  const offLeads = offTodayCalls + todayCalls.length;
  const offTasks = offLeads + leadsNeedingAction.length;
  const offDealsOverdue = offTasks + nowTasks.length;
  const offDealsNoPlan = offDealsOverdue + dealsOverdueStep.length;
  const offCooling = offDealsNoPlan + dealsNoPlan.length;
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

          {/* 3.5. Лиды: шаг и реакция — секция больше не только про молчание */}
          <Section title="Лиды: шаг и реакция" count={leadsNeedingAction.length} icon={<Target size={13} />}>
            {leadsNeedingAction.map(({ lead: l, h }, i) => {
              const overdueStep = h.level === 'overdue-action';
              const color = overdueStep || h.level === 'cold' ? RED : YELLOW;
              return (
                <QueueRow
                  key={l.id}
                  kbdIndex={offLeads + i}
                  focused={activeIndex === offLeads + i}
                  marker={{ filled: overdueStep || h.level === 'cold', color }}
                  title={l.title}
                  subtitle={l.company_name_raw ?? l.contact_name_raw ?? undefined}
                  meta={
                    <span style={{ color }}>
                      {overdueStep
                        ? `шаг просрочен ${h.days} дн.`
                        : `${h.days} дн. ${l.status === 'new' ? 'в новых' : 'без движения'}`}
                    </span>
                  }
                  onOpen={() => router.push(`/leads/${l.id}`)}
                  primary={overdueStep
                    ? { label: 'Шаг сделан', onClick: () => markLeadStepDone(l.id) }
                    : l.status === 'new'
                      ? { label: 'Связаться', onClick: () => updateLead.mutate({ id: l.id, status: 'contacted' }) }
                      : { label: 'Квалифицировать', onClick: () => updateLead.mutate({ id: l.id, status: 'qualified' }) }}
                  secondary={snoozeRow('lead', l.id)}
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

          {/* 5a. Просрочен шаг — обещание, которое уже нарушено */}
          <Section title="Просрочен шаг" count={dealsOverdueStep.length} icon={<Briefcase size={13} />}>
            {dealsOverdueStep.map((p, i) => (
              <QueueRow
                key={p.id}
                kbdIndex={offDealsOverdue + i}
                focused={activeIndex === offDealsOverdue + i}
                marker={{ filled: true, color: RED, title: 'Просрочен шаг' }}
                title={p.name}
                subtitle={p.company?.name ?? undefined}
                meta={
                  <span style={{ color: RED }}>
                    просрочен {getNextActionOverdueDays(p.next_action_date!)} дн.
                  </span>
                }
                onOpen={() => router.push(projectHref(p))}
                primary={{ label: 'Запланировать шаг', onClick: () => openDeal(p) }}
                secondary={snoozeRow('deal', p.id)}
              />
            ))}
          </Section>

          {/* 5b. Без плана — работу ещё не назначали */}
          <Section title="Без плана" count={dealsNoPlan.length} icon={<CircleDashed size={13} />}>
            {dealsNoPlan.map((p, i) => (
              <QueueRow
                key={p.id}
                kbdIndex={offDealsNoPlan + i}
                focused={activeIndex === offDealsNoPlan + i}
                marker={{ filled: false, color: YELLOW, title: 'Без плана' }}
                title={p.name}
                subtitle={p.company?.name ?? undefined}
                meta={
                  <span style={{ color: YELLOW }}>
                    {noPlanReason(p) === 'no-date' ? 'у шага нет даты' : 'шаг не назначен'}
                  </span>
                }
                onOpen={() => router.push(projectHref(p))}
                primary={{ label: 'Запланировать шаг', onClick: () => openDeal(p) }}
                secondary={snoozeRow('deal', p.id)}
              />
            ))}
          </Section>

          {/* 6. Остывают (reconnect) */}
          <Section title="Остывают" count={coolingContacts.length} icon={<Snowflake size={13} />}>
            {coolingSlice.map(({ contact: c, days }, i) => {
              const company = (c.companies ?? [])[0]?.company?.name;
              const cold = touchLevel(days, reconnectDays) === 'cold';
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
                  secondary={snoozeRow('contact', c.id)}
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

      {/* S-QUEUE-1: одна полоса на весь экран, не по блоку в каждой секции.
          Рендерится и при пустой очереди — иначе отложенное некуда вернуть. */}
      {snoozedEntries.length > 0 && (
        <section className="mb-7">
          <button
            onClick={() => setShowSnoozed((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-text-mute transition-colors hover:text-text-dim"
          >
            <Clock size={13} />
            Отложено на завтра: {snoozedEntries.length}
            <span className="text-text-dim">· {showSnoozed ? 'скрыть' : 'показать'}</span>
          </button>

          {showSnoozed && (
            <div className="sheet mt-2 overflow-hidden">
              <div className="px-4 py-1 [&>*:last-child]:border-b-0">
                {snoozedEntries.map((e) => (
                  <QueueRow
                    key={e.snoozeId}
                    marker={{ filled: false, color: 'var(--text-mute)', title: 'Отложено' }}
                    title={e.title}
                    subtitle={e.subtitle}
                    onOpen={e.open}
                    secondary={{ label: 'Вернуть', onClick: () => unsnooze.mutate(e.snoozeId) }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
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
    /* v2.1: секция — лист. Шапка на surface2, тело на surface.
       px-4 у тела при -mx-2 у QueueRow даёт 8px до края листа: hover-полоса
       шире текста, но внутрь листа. Сброс border-b у последней строки — иначе
       её разделитель дублирует нижнюю рамку листа. */
    <section className="sheet mb-7 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface2 px-4 py-2
                      text-xs font-medium uppercase tracking-wider text-text-dim">
        {icon}
        {title}
        <span className="text-text-mute">{count}</span>
      </div>
      <div className="px-4 py-1 [&>*:last-child]:border-b-0">{children}</div>
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
