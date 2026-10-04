'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CheckCircle2, Clock } from 'lucide-react';
import { useCalls, useUpdateCall } from '@/lib/hooks/use-calls';
import { useLeads, useUpdateLead } from '@/lib/hooks/use-leads';
import { getLeadHealth, compareLeadHealth } from '@/lib/utils/lead-health';
import { useTasks, useUpdateTask } from '@/lib/hooks/use-tasks';
import { useMeetings, useMyMeetings } from '@/lib/hooks/use-meetings';
import { useAuth } from '@/lib/hooks/use-auth';
import { useProjects } from '@/lib/hooks/use-projects';
import { projectHref } from '@/lib/utils/project-href';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useIsProjectActive, usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useLastTouchMap, daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { useReconnectDays } from '@/lib/hooks/use-org-settings';
import { useUiStore } from '@/lib/stores/ui-store';
import { useKeyboardNav } from '@/lib/hooks/use-keyboard-nav';
import { useDealTouches } from '@/lib/hooks/use-deal-touches';
import { useDealsQuotes } from '@/lib/hooks/use-quotes';
import { useDayMoves } from '@/lib/hooks/use-day-moves';
import { useStepFlow } from '@/lib/hooks/use-step-flow';
import { localDateKey } from '@/lib/utils/date-helpers';
import { useQueueSnoozes, useSnooze, useUnsnooze } from '@/lib/hooks/use-queue-snooze';
import { activeSnoozes, excludeSnoozed, snoozeKey, type SnoozeEntityType } from '@/lib/domain/queue-snooze';
import { DEFAULT_TODAY_THRESHOLDS, pickMoves, type TodayGroup } from '@/lib/domain/today-deals';
import { markMoveDone, reconcileDayMoves, takeOneMore, unmarkMoveDone, type DayMovesState } from '@/lib/domain/day-moves';
import { planRestore, type StepMode } from '@/lib/domain/step-flow';
import { stepActionsFor } from '@/lib/domain/step-actions';
import { pluralRu } from '@/lib/utils/plural';
import { doneText } from '@/lib/utils/today-text';
import {
  buildTodayModel,
  touchesSinceKey,
  type TodayDealSource,
  type TodayDealView,
} from '@/lib/domain/today-model';
import { TODAY_COLLAPSED_GROUPS, TODAY_GROUP_ROWS_LIMIT } from '@/lib/constants/today-groups';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import type { PipelineStage } from '@/types/database';
import { QueueRow } from './QueueRow';
import { TodayMoves } from './TodayMoves';
import { TodayGroups, type TodayGroupLayout } from './TodayGroups';
import { TodayDealPanel } from './TodayDealPanel';
import { TodayOffDeals, type OffDealChip, type OffDealRow } from './TodayOffDeals';
import { TodayStepActions, TodayStepDone } from './TodayStepActions';
import type { StepResult } from './TodayStepComposer';

const MOVES_LIMIT = DEFAULT_TODAY_THRESHOLDS.movesLimit;

const RED = 'var(--red-text, var(--red))';
const YELLOW = 'var(--yellow-text, var(--yellow))';

function dayPart(iso: string) { return iso.slice(0, 10); }
function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * «Сейчас» экрана — состояние, а не `new Date()` в `useMemo` (learnings, «Даты и
 * время»): модель пересчитывается при смене календарного дня, а не на каждый рендер.
 * Домен отсекает касания по ДНЮ, поэтому заметка, созданная после открытия экрана,
 * в модель попадает и с «застывшим» `now`.
 *
 * `null` до монтирования: сервер и клиент не должны спорить о дне.
 */
function useTodayNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => {
      setNow((prev) => {
        const fresh = new Date();
        return prev && localDateKey(prev) === localDateKey(fresh) ? prev : fresh;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Элемент плоской очереди клавиш: карточка хода, строка группы или строка чипа. */
type QueueItem =
  | { kind: 'move'; view: TodayDealView }
  | { kind: 'row'; view: TodayDealView }
  | { kind: 'off'; row: OffDealRow };

export function TodayView() {
  const router = useRouter();
  const now = useTodayNow();
  const mounted = now !== null;

  const { user } = useAuth();
  const myId = user?.id ?? null;
  const { data: calls = [] } = useCalls();
  const { data: leads = [] } = useLeads();
  const { data: tasks = [] } = useTasks();
  const { data: meetings = [] } = useMeetings();
  const projectsQ = useProjects();
  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const stagesQ = usePipelineStages();
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

  // ACT-1: форма хода — одна на экран: в карточке хода или в «Сейчас» панели.
  // `wasPicked` — была ли сделка в наборе дня, когда форму открыли. Решает, отмечать ли
  // ход сделанным: optimistic-правка `useUpdateProject` может сделать сделку «назначенной
  // на сегодня» ещё до конца записи, сверка добавит её в набор — и перенос строки на
  // сегодня засчитался бы как сделанный ход (найдено смоком ACT-1).
  const [composer, setComposer] = useState<{ id: string; mode: StepMode; place: 'card' | 'panel'; wasPicked: boolean } | null>(null);
  // Итоги записей до перезагрузки: подпись карточки, «записано сегодня», «Вернуть».
  const [results, setResults] = useState<ReadonlyMap<string, StepResult>>(new Map());
  // Группа показа записанной строки — строка стоит на месте до перезагрузки.
  const [pinnedGroups, setPinnedGroups] = useState<ReadonlyMap<string, TodayGroup>>(new Map());
  // «Разобрать по одной»: после записи по сделке «Решить судьбу» открыть следующую.
  const [sweep, setSweep] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const flow = useStepFlow();

  // Одна открытая панель на экран: под рядом ходов или под строкой группы.
  const [openPanel, setOpenPanel] = useState<{ id: string; place: 'move' | 'row' } | null>(null);
  // Свёрнутые группы — в памяти экрана, не в localStorage: открыл, посмотрел, ушёл.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<TodayGroup>>(new Set());
  const [showAllGroups, setShowAllGroups] = useState<ReadonlySet<TodayGroup>>(new Set());
  const [openChip, setOpenChip] = useState<string | null>(null);

  const todayKey = now ? localDateKey(now) : '';
  const tomorrowKey = now ? localDateKey(new Date(now.getTime() + 86400000)) : '';

  const stageById = useMemo(
    () => new Map((stagesQ.data ?? []).map((s) => [s.id, s] as const)),
    [stagesQ.data],
  );
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

  // ── Сделки экрана (спека, п. 2): клиентская, открытая, стадия не терминальная.
  // `on_hold` сюда не попадает — `getDealHealth` для неё всегда `ok`.
  const screenProjects = useMemo(
    () => projects.filter((p) => p.type === 'client' && p.status === 'open' && isProjectActive(p)),
    [projects, isProjectActive],
  );
  const screenIds = useMemo(() => screenProjects.map((p) => p.id), [screenProjects]);
  const screenIdSet = useMemo(() => new Set(screenIds), [screenIds]);
  const dealSources = useMemo<TodayDealSource[]>(
    () => screenProjects.map((p) => {
      const st = p.stage_id ? stageById.get(p.stage_id) : undefined;
      return {
        id: p.id,
        name: p.name,
        companyName: p.company?.name ?? null,
        contactId: p.contact_id,
        status: p.status,
        type: p.type,
        next_step: p.next_step,
        next_action_date: p.next_action_date,
        created_at: p.created_at,
        budget: p.budget,
        stage: st ? { name: st.name, phase_group: st.phase_group, order_index: st.order_index } : null,
      };
    }),
    [screenProjects, stageById],
  );
  const sinceKey = useMemo(() => (now ? touchesSinceKey(dealSources, now) : null), [dealSources, now]);
  const touchesQ = useDealTouches(screenIds, sinceKey);
  const quotesQ = useDealsQuotes(screenIds);

  // ── S-VIS-A: «Сегодня» — ЛИЧНАЯ очередь: звонки и встречи — только мои.
  // `useCalls()`/`useMeetings()` после 098 отдают записи всей org; чужой просроченный
  // звонок здесь значил бы, что человек пойдёт делать чужую работу.
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
  // Встречи — сначала режем по дате (сегодня и позже), потом по «моим»: `useMyMeetings`
  // тянет состав по переданным id, и кормить его всей историей встреч незачем.
  // Будущие нужны модели — «впереди встреча» держит сделку без шага в «По плану».
  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => dayPart(m.date) >= todayKey),
    [meetings, todayKey],
  );
  const myUpcomingMeetings = useMyMeetings(upcomingMeetings);
  const todayMeetings = useMemo(
    () => myUpcomingMeetings.filter((m) => dayPart(m.date) === todayKey)
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [myUpcomingMeetings, todayKey],
  );

  // ── Модель экрана. Пока не ответили сделки, стадии, касания и КП — модели нет:
  // пустое состояние до ответа сервера соврало бы «всё разобрано».
  const dealsReady = mounted && projectsQ.isSuccess && stagesQ.isSuccess
    && (screenIds.length === 0 || (touchesQ.isSuccess && quotesQ.isSuccess));
  const snoozedDealIds = useMemo(
    () => new Set(screenIds.filter((id) => snoozedKeys.has(snoozeKey('deal', id)))),
    [screenIds, snoozedKeys],
  );
  const modelInput = useMemo(() => {
    if (!now || !dealsReady || !sinceKey) return null;
    return {
      deals: dealSources,
      touches: touchesQ.data ?? new Map(),
      quotes: quotesQ.data ?? new Map(),
      tasks,
      calls: myCalls,
      meetings: myUpcomingMeetings,
      snoozedDealIds,
      sinceKey,
    };
  }, [now, dealsReady, sinceKey, dealSources, touchesQ.data, quotesQ.data, tasks, myCalls, myUpcomingMeetings, snoozedDealIds]);
  const base = useMemo(() => (modelInput && now ? buildTodayModel(modelInput, now) : null), [modelInput, now]);

  // ── ACT-1: набор ходов дня (`day-moves.ts`). Порядок без круговой зависимости:
  // базовая модель → кандидаты без сделанных сегодня (иначе «Взять ещё ход» вернул бы
  // ту же сделку) → сверка с сохранённым набором → модель с набором. До чтения
  // `localStorage` экран показывает базовую модель.
  const dayMoves = useDayMoves(mounted ? todayKey : null);
  const savedToday = dayMoves.saved?.day === todayKey ? dayMoves.saved : null;
  const doneToday = useMemo(() => new Set(savedToday?.done ?? []), [savedToday]);
  const freshComputed = useMemo(
    () => (base ? pickMoves(base.candidates.filter((c) => !doneToday.has(c.id)), MOVES_LIMIT) : []),
    [base, doneToday],
  );
  const existingIds = useMemo(
    () => new Set(screenIds.filter((id) => !snoozedDealIds.has(id))),
    [screenIds, snoozedDealIds],
  );
  const dayState = useMemo<DayMovesState | null>(
    () => (base && dayMoves.loaded
      ? reconcileDayMoves(dayMoves.saved, todayKey, freshComputed, existingIds, MOVES_LIMIT)
      : null),
    [base, dayMoves.loaded, dayMoves.saved, todayKey, freshComputed, existingIds],
  );
  const { persist: persistDayMoves, saved: savedDayMoves } = dayMoves;
  useEffect(() => {
    // Сверка идемпотентна: записанное состояние на следующем рендере даёт себя же,
    // поэтому сравнение по содержимому обрывает цикл записи.
    if (dayState && JSON.stringify(dayState) !== JSON.stringify(savedDayMoves)) persistDayMoves(dayState);
  }, [dayState, savedDayMoves, persistDayMoves]);
  const dayStateRef = useRef(dayState);
  dayStateRef.current = dayState;

  const model = useMemo(
    () => (modelInput && now && dayState
      ? buildTodayModel({ ...modelInput, picked: dayState.picked, pickedSlots: dayState.slots, pinnedGroups }, now)
      : base),
    [modelInput, now, dayState, pinnedGroups, base],
  );
  const dayDone = useMemo(() => new Set(dayState?.done ?? []), [dayState]);
  const movesDone = (model?.moves ?? []).filter((v) => dayDone.has(v.source.id)).length;
  const allMovesDone = !!model && model.moves.length > 0 && movesDone === model.moves.length;

  // Все четыре запроса модели: без КП и стадий модель не собирается, и без ошибки
  // на экране скелетон висел бы вечно.
  const loadError = projectsQ.isError || stagesQ.isError || touchesQ.isError || quotesQ.isError;

  // ── «Не сделки» — прежние правила отбора, без изменений.
  //
  // Лиды — БЕЗ фильтра «мои»: лид — общий пул, залежавшийся лид — проблема организации.
  // S-LEAD-HUB-2b: очередь считает ЗДОРОВЬЕ лида (`getLeadHealth`), порядок —
  // `compareLeadHealth`: просрочка — обещание клиенту, молчание — только риск.
  const leadsNeedingActionAll = useMemo(
    () => leads
      .filter((l) => l.status === 'new' || l.status === 'contacted')
      .map((l) => ({ lead: l, h: getLeadHealth(l) }))
      .filter((r) => r.h.level !== 'ok')
      .sort((a, b) => compareLeadHealth(a.h, b.h)),
    [leads],
  );
  // Отложенные вычитаются ПОСЛЕ отбора: `…All` — источник для блока «Отложено».
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
  // Задачи сделок экрана живут в панели сделки («Сейчас»); остальные — чипами:
  // клиентская сделка, которая уже не активна, — «хвост закрытой сделки», всё прочее
  // (без проекта, проект внедрения, сделка на паузе) — «задачи вне сделок».
  const { offDealTasks, closedDealTasks } = useMemo(() => {
    const off: typeof nowTasks = [];
    const closed: typeof nowTasks = [];
    for (const t of nowTasks) {
      if (t.project_id && screenIdSet.has(t.project_id)) continue;
      const p = t.project_id ? projectsById.get(t.project_id) : undefined;
      if (p && p.type === 'client' && !isProjectActive(p)) closed.push(t);
      else off.push(t);
    }
    return { offDealTasks: off, closedDealTasks: closed };
  }, [nowTasks, screenIdSet, projectsById, isProjectActive]);
  const offCalls = useMemo(
    () => [...overdueCalls, ...todayCalls].filter((c) => !c.project_id || !screenIdSet.has(c.project_id)),
    [overdueCalls, todayCalls, screenIdSet],
  );
  const offMeetings = useMemo(
    () => todayMeetings.filter((m) => !m.project_id || !screenIdSet.has(m.project_id)),
    [todayMeetings, screenIdSet],
  );

  // «Остывают»: контакты активных сделок / компаний с активными сделками, у которых
  // последнее касание старше порога или его не было. `useLastTouchMap` командный —
  // звонок коллеги считается касанием контакта.
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

  const bumpCall = (id: string, iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 1);
    updateCall.mutate({ id, date: d.toISOString() });
  };
  // «Шаг сделан» — чистим ОБА поля одним апдейтом, иначе осиротевшая дата снова
  // поднимет лид в очередь.
  const markLeadStepDone = (id: string) =>
    updateLead.mutate({ id, next_step: null, next_action_date: null });
  const snoozeRow = (entity_type: SnoozeEntityType, entity_id: string) =>
    ({ label: 'Отложить', onClick: () => snooze.mutate({ entity_type, entity_id }) });
  const callName = (c: typeof calls[number]) =>
    c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок';

  // ── Чипы: строки — прежние `QueueRow` с прежними действиями.
  const chips: OffDealChip[] = [
    {
      key: 'calls',
      label: 'Звонки',
      count: offCalls.length,
      rows: offCalls.map((c): OffDealRow => {
        const overdue = dayPart(c.date) < todayKey;
        return {
          key: `call:${c.id}`,
          marker: overdue
            ? { filled: true, color: RED, title: 'Просрочен' }
            : { filled: false, color: 'var(--accent)', title: 'Сегодня' },
          title: callName(c),
          subtitle: c.contact ? c.company?.name ?? undefined : undefined,
          meta: overdue
            ? <span style={{ color: RED }}>{dateShort(c.date)} {timeStr(c.date)}</span>
            : timeStr(c.date),
          onOpen: () => router.push('/calls'),
          primary: { label: 'Выполнен', onClick: () => updateCall.mutate({ id: c.id, status: 'done' }) },
          secondary: { label: 'На завтра', onClick: () => bumpCall(c.id, c.date) },
        };
      }),
    },
    {
      key: 'meetings',
      label: 'Встречи сегодня',
      count: offMeetings.length,
      rows: offMeetings.map((m): OffDealRow => ({
        key: `meeting:${m.id}`,
        marker: { filled: false, color: 'var(--accent)' },
        title: m.title,
        subtitle: m.project?.name ?? undefined,
        meta: m.time ? m.time.slice(0, 5) : '—',
        onOpen: () => router.push('/meetings'),
      })),
    },
    {
      key: 'leads',
      label: 'Лиды',
      count: leadsNeedingAction.length,
      rows: leadsNeedingAction.map(({ lead: l, h }): OffDealRow => {
        const overdueStep = h.level === 'overdue-action';
        const color = overdueStep || h.level === 'cold' ? RED : YELLOW;
        return {
          key: `lead:${l.id}`,
          marker: { filled: overdueStep || h.level === 'cold', color },
          title: l.title,
          subtitle: l.company_name_raw ?? l.contact_name_raw ?? undefined,
          meta: (
            <span style={{ color }}>
              {overdueStep
                ? `шаг просрочен ${h.days} дн.`
                : `${h.days} дн. ${l.status === 'new' ? 'в новых' : 'без движения'}`}
            </span>
          ),
          onOpen: () => router.push(`/leads/${l.id}`),
          primary: overdueStep
            ? { label: 'Шаг сделан', onClick: () => markLeadStepDone(l.id) }
            : l.status === 'new'
              ? { label: 'Связаться', onClick: () => updateLead.mutate({ id: l.id, status: 'contacted' }) }
              : { label: 'Квалифицировать', onClick: () => updateLead.mutate({ id: l.id, status: 'qualified' }) },
          secondary: snoozeRow('lead', l.id),
        };
      }),
    },
    ...([
      ['tasks-off', 'Задачи вне сделок', offDealTasks],
      ['tasks-closed', 'Хвост закрытой сделки', closedDealTasks],
    ] as const).map(([key, label, list]): OffDealChip => ({
      key,
      label,
      count: list.length,
      rows: list.map((t): OffDealRow => {
        const overdue = !!t.deadline && t.deadline < todayKey;
        return {
          key: `task:${t.id}`,
          marker: overdue
            ? { filled: true, color: RED, title: 'Просрочена' }
            : { filled: false, color: 'var(--text-mute)' },
          title: t.text,
          subtitle: t.project?.name ?? undefined,
          meta: t.deadline
            ? <span style={overdue ? { color: RED } : undefined}>{dateShort(t.deadline)}</span>
            : undefined,
          onOpen: () => router.push('/tasks'),
          primary: { label: 'Готово', onClick: () => updateTask.mutate({ id: t.id, lane: 'done' }) },
          secondary: { label: 'На завтра', onClick: () => updateTask.mutate({ id: t.id, deadline: tomorrowKey }) },
        };
      }),
    })),
    {
      key: 'cooling',
      label: 'Остывают',
      count: coolingContacts.length,
      rows: coolingContacts.slice(0, 5).map(({ contact: c, days }): OffDealRow => {
        const cold = touchLevel(days, reconnectDays) === 'cold';
        const color = cold ? RED : YELLOW;
        return {
          key: `contact:${c.id}`,
          marker: { filled: cold, color },
          title: `${c.first_name} ${c.last_name}`,
          subtitle: (c.companies ?? [])[0]?.company?.name,
          meta: <span style={{ color }}>{days === null ? 'касаний не было' : `${days} дн. без касания`}</span>,
          onOpen: () => router.push(`/contacts/${c.id}`),
          // Шов W2b-3: передаём и компанию, не только контакт
          primary: {
            label: 'Запланировать звонок',
            onClick: () => openModal('call', undefined, {
              contactId: c.id,
              companyId: (c.companies ?? [])[0]?.company_id,
            }),
          },
          secondary: snoozeRow('contact', c.id),
        };
      }),
    },
  ];
  const chipsTotal = chips.reduce((sum, c) => sum + c.count, 0);
  const openChipRows = chips.find((c) => c.key === openChip && c.count > 0)?.rows ?? [];

  // ── Раскладка групп: что свёрнуто, какие строки видны.
  const layout: TodayGroupLayout[] = useMemo(
    () => (model?.groups ?? []).map((g) => {
      const collapsible = TODAY_COLLAPSED_GROUPS.includes(g.key);
      const collapsed = collapsible && !expandedGroups.has(g.key);
      const all = collapsed ? [] : g.rows;
      const limited = showAllGroups.has(g.key) ? all : all.slice(0, TODAY_GROUP_ROWS_LIMIT);
      return { view: g, collapsible, collapsed, rows: limited, hidden: all.length - limited.length };
    }),
    [model, expandedGroups, showAllGroups],
  );

  // ── Плоская очередь клавиш: карточки ходов → строки открытых групп сверху вниз →
  // строки раскрытого чипа. ⚠️ JSX рендерит kbdIndex ИЗ ЭТОГО ЖЕ массива (`kbdIndexOf`):
  // второй порядок, написанный руками, однажды разошёлся бы с первым, и j/k подсвечивал
  // бы одну строку, а Enter открывал другую — ни tsc, ни тесты такое не ловят.
  // Отложенные и свёрнутые строки в очередь не входят: невидимые позиции дали бы
  // провалы фокуса.
  const queue: QueueItem[] = [
    ...(allMovesDone ? [] : model?.moves ?? []).map((view): QueueItem => ({ kind: 'move', view })),
    ...layout.flatMap((l) => l.rows.map((view): QueueItem => ({ kind: 'row', view }))),
    ...openChipRows.map((row): QueueItem => ({ kind: 'off', row })),
  ];
  const kbdIndexByKey = new Map(queue.map((q, i) => [q.kind === 'off' ? q.row.key : `deal:${q.view.source.id}`, i] as const));
  const dealKbdIndex = (id: string) => kbdIndexByKey.get(`deal:${id}`) ?? -1;
  const offKbdIndex = (key: string) => kbdIndexByKey.get(key) ?? -1;

  const snoozeDeal = (id: string) => {
    if (openPanel?.id === id) setOpenPanel(null);
    if (composer?.id === id) setComposer(null);
    snooze.mutate({ entity_type: 'deal', entity_id: id });
  };
  const isDealDone = (id: string) => dayDone.has(id) || results.has(id);

  /** Группа, в которой строка стоит сейчас: группа показа или настоящая. */
  const shownGroupOf = (id: string): TodayGroup | null =>
    model?.groups.find((g) => g.rows.some((v) => v.source.id === id))?.key ?? null;

  const handleWritten = (view: TodayDealView, result: StepResult, place: 'card' | 'panel') => {
    const id = view.source.id;
    setResults((cur) => new Map(cur).set(id, result));
    setComposer(null);
    const state = dayStateRef.current;
    const wasPicked = composer?.id === id ? composer.wasPicked : !!state?.picked.includes(id);
    if (state && wasPicked) {
      persistDayMoves(markMoveDone(state, id));
    } else {
      const group = shownGroupOf(id) ?? view.cls.group;
      setPinnedGroups((cur) => new Map(cur).set(id, group));
      // «Разобрать по одной»: следующая строка «Решить судьбу»; строк нет — панель закрыта.
      if (sweep && place === 'panel' && group === 'decide') {
        const rows = layout.find((l) => l.view.key === 'decide')?.rows ?? [];
        const next = rows[rows.findIndex((v) => v.source.id === id) + 1];
        if (next) setOpenPanel({ id: next.source.id, place: 'row' });
        else { setOpenPanel(null); setSweep(false); }
      }
    }
  };

  const restore = async (view: TodayDealView) => {
    const id = view.source.id;
    const result = results.get(id);
    if (!result) return;
    setRestoringId(id);
    try {
      await flow.run(id, planRestore(result.prev));
      setResults((cur) => { const next = new Map(cur); next.delete(id); return next; });
      const state = dayStateRef.current;
      if (state) persistDayMoves(unmarkMoveDone(state, id));
    } catch {
      toast.error(`Не удалось вернуть шаг по «${view.source.name}»`);
    } finally {
      setRestoringId(null);
    }
  };

  const openComposer = (id: string, mode: StepMode, place: 'card' | 'panel') =>
    setComposer({ id, mode, place, wasPicked: !!dayStateRef.current?.picked.includes(id) });

  /** Открыть форму: у карточки — в карточке, у строки — в «Сейчас» раскрытой панели. */
  const composeFor = (q: Extract<QueueItem, { kind: 'move' | 'row' }>, mode: StepMode) => {
    const id = q.view.source.id;
    if (q.kind === 'move') {
      openComposer(id, mode, 'card');
    } else {
      setOpenPanel({ id, place: 'row' });
      openComposer(id, mode, 'panel');
    }
  };
  const dealItem = (i: number) => {
    const q = queue[i];
    return q && q.kind !== 'off' ? q : null;
  };

  const startSweep = () => {
    const first = model?.groups.find((g) => g.key === 'decide')?.rows[0];
    if (!first) return;
    setExpandedGroups((cur) => new Set(cur).add('decide'));
    setOpenPanel({ id: first.source.id, place: 'row' });
    setSweep(true);
  };
  const togglePanel = (id: string, place: 'move' | 'row') =>
    setOpenPanel((cur) => (cur && cur.id === id && cur.place === place ? null : { id, place }));
  const openDealPage = (id: string) => {
    const p = projectsById.get(id);
    if (p) router.push(projectHref(p));
  };

  const queueRef = useRef<HTMLDivElement>(null);
  const { activeIndex } = useKeyboardNav({
    itemCount: queue.length,
    onSelect: (i) => {
      const q = queue[i];
      if (!q) return;
      if (q.kind === 'off') q.row.onOpen();
      else togglePanel(q.view.source.id, q.kind);
    },
    // D — главная кнопка сделки по таблице хода (`stepActionsFor`), у строки чипа — её primary.
    onAction: (i) => {
      const q = queue[i];
      if (!q) return;
      if (q.kind === 'off') { q.row.primary?.onClick(); return; }
      if (isDealDone(q.view.source.id)) return;
      composeFor(q, stepActionsFor(q.view.cls).primary.mode);
    },
    onKeys: {
      KeyO: (i) => {
        const q = dealItem(i);
        if (q) openDealPage(q.view.source.id);
      },
      // U — «Обновить шаг» у любой сделки (без шага — тот же режим «Назначить шаг»).
      KeyU: (i) => {
        const q = dealItem(i);
        if (q && !isDealDone(q.view.source.id)) composeFor(q, 'update');
      },
      // T — «Перенести», только там, где он есть по таблице хода.
      KeyT: (i) => {
        const q = dealItem(i);
        if (q && !isDealDone(q.view.source.id) && stepActionsFor(q.view.cls).canMove) composeFor(q, 'move');
      },
      KeyS: (i) => {
        const q = dealItem(i);
        if (q) snoozeDeal(q.view.source.id);
      },
    },
    // Форма хода открыта — клавиши экрана молчат: иначе Enter на кнопке даты раскрывает
    // панель вместо выбора даты, а S откладывает сделку посреди ввода.
    isActive: () => composer === null,
    containerRef: queueRef,
    enabled: mounted && queue.length > 0,
  });

  // ── Отложенное: сделки — из модели, лиды и контакты — сопоставлением с ПОЛНЫМИ
  // списками (`…All`). Висячий snooze (сделке назначили шаг, лид закрыт) просто не
  // находит строку — FK у entity_id нет (129).
  const snoozedEntries = useMemo(() => {
    const out: { snoozeId: string; title: string; subtitle?: string; open: () => void }[] = [];
    for (const s of activeSnoozes(snoozes, todayKey)) {
      if (s.entity_type === 'deal') {
        const v = model?.snoozed.find((x) => x.source.id === s.entity_id);
        const p = projectsById.get(s.entity_id);
        if (v && p) out.push({
          snoozeId: s.id,
          title: v.source.name,
          subtitle: v.source.companyName ?? undefined,
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
  }, [snoozes, todayKey, model, projectsById, leadsNeedingActionAll, coolingContactsAll, router]);

  // ── Панель: одна на экран. Вид берётся из модели — сделка могла уйти в «Отложено».
  const panelView = openPanel && model
    ? [...model.moves, ...model.groups.flatMap((g) => g.rows)].find((v) => v.source.id === openPanel.id) ?? null
    : null;
  const panelProject = panelView ? projectsById.get(panelView.source.id) ?? null : null;
  const panelStage: PipelineStage | null = panelProject?.stage_id ? stageById.get(panelProject.stage_id) ?? null : null;
  // Первый несделанный ход держит единственную primary-кнопку экрана; открытая форма
  // забирает её себе.
  const primaryId = composer ? null : model?.moves.find((v) => !dayDone.has(v.source.id))?.source.id ?? null;
  const hrefOf = (id: string) => {
    const p = projectsById.get(id);
    return p ? projectHref(p) : '/deals';
  };
  /** Итог хода. Карточка — только у сделанного хода набора; панель — и у записанной строки. */
  const doneOf = (view: TodayDealView, scope: 'card' | 'panel' = 'card') => {
    const id = view.source.id;
    const result = results.get(id) ?? null;
    if (scope === 'card' ? !dayDone.has(id) : !result && !dayDone.has(id)) return null;
    return {
      text: doneText(view, result),
      onRestore: result ? () => void restore(view) : undefined,
      restoring: restoringId === id,
    };
  };
  const actionsFor = (view: TodayDealView, place: 'card' | 'panel', extra?: ReactNode) => (
    <TodayStepActions
      view={view}
      primary={place === 'card' && primaryId === view.source.id}
      composer={composer && composer.id === view.source.id && composer.place === place ? composer.mode : null}
      onCompose={(mode) => (mode ? openComposer(view.source.id, mode, place) : setComposer(null))}
      onWritten={(result) => handleWritten(view, result, place)}
      onSnooze={() => snoozeDeal(view.source.id)}
      href={hrefOf(view.source.id)}
      extra={extra}
    />
  );
  const panelActions = (view: TodayDealView) => {
    const done = doneOf(view, 'panel');
    return done ? <TodayStepDone {...done} /> : actionsFor(view, 'panel');
  };
  const panel = (place: 'move' | 'row') =>
    panelView && panelProject && now && openPanel?.place === place ? (
      <TodayDealPanel
        view={panelView}
        project={panelProject}
        stage={panelStage}
        now={now}
        actions={panelActions(panelView)}
        standalone={place === 'move'}
      />
    ) : null;

  const dateProse = now
    ? format(now, 'EEEE, d MMMM', { locale: ru }).replace(/^./, (ch) => ch.toUpperCase())
    : '';
  const loading = !model && !loadError;
  const nothingAtAll = !!model && model.total === 0 && chipsTotal === 0;
  const assignedCount = model?.moves.filter((v) => v.slot === 'assigned').length ?? 0;

  return (
    <div className="today-cq">
      <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="aura-page-title text-2xl font-semibold text-text-main">Сегодня</h1>
          <p className="mt-1 text-sm text-text-dim">{dateProse}</p>
        </div>
        {dayState && model && model.moves.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-text-dim" title="Сколько ходов дня уже сделано">
            <span className="flex gap-1" aria-hidden="true">
              {model.moves.map((v) => (
                <span
                  key={v.source.id}
                  className={dayDone.has(v.source.id) ? 'h-2 w-2 rounded-full bg-success' : 'h-2 w-2 rounded-full border border-border2'}
                />
              ))}
            </span>
            <span>
              <b className="font-semibold tabular-nums text-text-main">{movesDone}</b> из {model.moves.length}{' '}
              {pluralRu(model.moves.length, 'хода', 'ходов', 'ходов')} сделано
            </span>
          </div>
        )}
      </header>

      {loadError ? (
        <div className="sheet mb-6 flex flex-wrap items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger-text">Не удалось загрузить сделки</p>
            <p className="text-xs text-text-dim">Ходы и список не построены. Данные в сделках не затронуты.</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void projectsQ.refetch();
              void stagesQ.refetch();
              void touchesQ.refetch();
              void quotesQ.refetch();
            }}
          >
            Повторить
          </Button>
        </div>
      ) : nothingAtAll ? (
        <EmptyState
          icon={<CheckCircle2 size={28} />}
          title="Всё разобрано"
          description="На сегодня очередь пуста."
          action={{ label: 'Открыть обзор', href: '/overview' }}
        />
      ) : (
        <div ref={queueRef}>
          {(loading || (model && model.total > 0)) && (
            <TodayMoves
              moves={model?.moves ?? []}
              assignedCount={assignedCount}
              limit={DEFAULT_TODAY_THRESHOLDS.movesLimit}
              loading={loading}
              openId={openPanel?.place === 'move' ? openPanel.id : null}
              onToggle={(id) => togglePanel(id, 'move')}
              doneOf={(view) => doneOf(view, 'card')}
              renderActions={(view, extra) => actionsFor(view, 'card', extra)}
              allDone={allMovesDone}
              onTakeMore={
                dayState && freshComputed.some((m) => !dayState.picked.includes(m.id))
                  ? () => persistDayMoves(takeOneMore(dayState, freshComputed))
                  : null
              }
              panel={panel('move')}
              kbdIndexOf={dealKbdIndex}
              activeIndex={activeIndex}
            />
          )}

          <TodayGroups
            loading={loading}
            total={model?.total ?? 0}
            noStepAhead={model?.noStepAhead ?? 0}
            noAmount={model?.noAmount ?? 0}
            layout={layout}
            onToggleGroup={(key) => setExpandedGroups((cur) => {
              const next = new Set(cur);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            })}
            onShowAll={(key) => setShowAllGroups((cur) => new Set(cur).add(key))}
            openRowId={openPanel?.place === 'row' ? openPanel.id : null}
            onToggleRow={(id) => togglePanel(id, 'row')}
            panel={panel('row')}
            kbdIndexOf={dealKbdIndex}
            activeIndex={activeIndex}
            writtenIds={new Set(results.keys())}
            onSweep={startSweep}
          />

          <TodayOffDeals
            chips={chips}
            openKey={openChip}
            onToggle={(key) => setOpenChip((cur) => (cur === key ? null : key))}
            kbdIndexOf={offKbdIndex}
            activeIndex={activeIndex}
          />

          {queue.length > 0 && (
            <p className="mb-6 text-xs text-text-dim">
              J / K — по строкам · Enter — раскрыть · D — главное действие · U — обновить шаг · T — перенести · S — отложить · O — открыть сделку
            </p>
          )}
        </div>
      )}

      {/* S-QUEUE-1: одна полоса на весь экран. Рендерится и при пустой очереди —
          иначе отложенное некуда вернуть. */}
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
    </div>
  );
}

