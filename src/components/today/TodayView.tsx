'use client';

import { useState, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowUpRight, CheckCircle2, Clock } from 'lucide-react';
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
import { useContainerWide } from '@/lib/hooks/use-container-wide';
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
import { nextInSweep, resolveSelection, type SelectionScreen } from '@/lib/domain/today-selection';
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
import { TodayFocusPane, focusHeadEntry } from './TodayFocusPane';
import { TodayOffDeals, type OffDealChip, type OffDealRow } from './TodayOffDeals';
import { KeyHint, TodayStepActions, TodayStepDone } from './TodayStepActions';
import type { StepResult } from './TodayStepComposer';

const MOVES_LIMIT = DEFAULT_TODAY_THRESHOLDS.movesLimit;
/** Порог широкого режима, rem — то же число, что `@container (min-width: 56rem)` у `.today-split`. */
const FOCUS_WIDE_REM = 56;

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

  // ACT-1: форма хода — одна на экран. S-TODAY-FOCUS-1: живёт только в шапке фокуса.
  // `wasPicked` — была ли сделка в наборе дня, когда форму открыли. Решает, отмечать ли
  // ход сделанным: optimistic-правка `useUpdateProject` может сделать сделку «назначенной
  // на сегодня» ещё до конца записи, сверка добавит её в набор — и перенос строки на
  // сегодня засчитался бы как сделанный ход (найдено смоком ACT-1).
  const [composer, setComposer] = useState<{ id: string; mode: StepMode; wasPicked: boolean } | null>(null);
  // Итоги записей до перезагрузки: подпись карточки, «записано сегодня», «Вернуть».
  const [results, setResults] = useState<ReadonlyMap<string, StepResult>>(new Map());
  // Группа показа записанной строки — строка стоит на месте до перезагрузки.
  const [pinnedGroups, setPinnedGroups] = useState<ReadonlyMap<string, TodayGroup>>(new Map());
  // «Разобрать по одной»: после записи по сделке «Решить судьбу» выбрать следующую.
  const [sweep, setSweep] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const flow = useStepFlow();

  // S-TODAY-FOCUS-1 (спека §3): выбор — id сделки, не индекс очереди клавиш. В фокусе
  // `resolveSelection(selectedId, …)`: выбранная, если она на экране, иначе по умолчанию.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Узкий режим (< 56rem): фокус — панель поверх списка, открыта ли она.
  const [narrowOpen, setNarrowOpen] = useState(false);
  // Enter по сделке просит DOM-фокус в шапке фокуса — счётчик запросов.
  const [headFocusTick, setHeadFocusTick] = useState(0);
  const cqRef = useRef<HTMLDivElement>(null);
  const wide = useContainerWide(cqRef, FOCUS_WIDE_REM);
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
    // Выбор не сбрасываем: отложенной сделки на экране нет, и `resolveSelection`
    // сам отдаёт фокус сделке по умолчанию.
    if (composer?.id === id) setComposer(null);
    snooze.mutate({ entity_type: 'deal', entity_id: id });
  };
  const isDealDone = (id: string) => dayDone.has(id) || results.has(id);
  /** Плашка строки: ход записан сегодня — день нового шага (`cleared` — без шага). */
  const writtenOf = (id: string) => {
    const r = results.get(id);
    return r ? { nextDateKey: r.outcome === 'cleared' ? null : r.dateKey } : null;
  };

  /** Группа, в которой строка стоит сейчас: группа показа или настоящая. */
  const shownGroupOf = (id: string): TodayGroup | null =>
    model?.groups.find((g) => g.rows.some((v) => v.source.id === id))?.key ?? null;

  const handleWritten = (view: TodayDealView, result: StepResult) => {
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
      // «Разобрать по одной»: следующая строка «Решить судьбу»; строк нет — выбор по
      // умолчанию.
      if (sweep && group === 'decide') {
        const rows = (layout.find((l) => l.view.key === 'decide')?.rows ?? []).map((v) => v.source.id);
        const next = nextInSweep(id, rows);
        setSelectedId(next);
        if (!next) setSweep(false);
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

  const openComposer = (id: string, mode: StepMode) =>
    setComposer({ id, mode, wasPicked: !!dayStateRef.current?.picked.includes(id) });

  /**
   * Открыть форму по сделке — в шапке фокуса. Узкий режим открывает и панель:
   * иначе форма открылась бы невидимой, а клавиши экрана замолчали бы.
   */
  const composeFor = (q: Extract<QueueItem, { kind: 'move' | 'row' }>, mode: StepMode) => {
    const id = q.view.source.id;
    setSelectedId(id);
    if (!wide) setNarrowOpen(true);
    openComposer(id, mode);
  };
  const dealItem = (i: number) => {
    const q = queue[i];
    return q && q.kind !== 'off' ? q : null;
  };

  const startSweep = () => {
    const first = model?.groups.find((g) => g.key === 'decide')?.rows[0];
    if (!first) return;
    setExpandedGroups((cur) => new Set(cur).add('decide'));
    setSelectedId(first.source.id);
    if (!wide) setNarrowOpen(true);
    setSweep(true);
  };
  const openDealPage = (id: string) => {
    const p = projectsById.get(id);
    if (p) router.push(projectHref(p));
  };

  // ── Выбор (спека §3): сделка в фокусе — выбранная, если она на экране, иначе по
  // умолчанию. Строки свёрнутых групп — тоже «на экране»: свёрнутая группа прячет
  // строку, но сделку не убирает.
  const selectionScreen = useMemo<SelectionScreen | null>(
    () => (model
      ? {
        moves: model.moves.map((v) => v.source.id),
        doneMoves: dayDone,
        rows: model.groups.flatMap((g) => g.rows.map((v) => v.source.id)),
      }
      : null),
    [model, dayDone],
  );
  const focusId = selectionScreen ? resolveSelection(selectedId, selectionScreen) : null;
  const hrefOf = (id: string) => {
    const p = projectsById.get(id);
    return p ? projectHref(p) : '/deals';
  };

  /** Клик по плитке или строке: в фокус; ⌘/Ctrl или средняя кнопка — новая вкладка. */
  const selectDeal = (id: string, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      window.open(hrefOf(id), '_blank', 'noopener,noreferrer');
      return;
    }
    setSelectedId(id);
    if (!wide) setNarrowOpen(true);
  };

  const queueRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  /**
   * DOM-фокус в фокусе — клавиши экрана молчат: иначе Enter на кнопке «Сделано» в
   * шапке перехватил бы `useKeyboardNav` (он ловит Enter на `window` с
   * `preventDefault`). Считается только фокус с клавиатуры (`:focus-visible`):
   * после клика мышью по «Готово» в теле J/K не должны умирать до Esc.
   */
  const focusHoldsKeys = () => {
    const el = document.activeElement;
    return !!el && !!paneRef.current?.contains(el) && el.matches(':focus-visible');
  };
  const { activeIndex, setActiveIndex } = useKeyboardNav({
    itemCount: queue.length,
    // Enter по сделке — DOM-фокус в шапку фокуса (узкий режим — сначала открыть
    // панель); по строке вне сделок — прежний переход.
    onSelect: (i) => {
      const q = queue[i];
      if (!q) return;
      if (q.kind === 'off') { q.row.onOpen(); return; }
      setSelectedId(q.view.source.id);
      if (!wide) setNarrowOpen(true);
      setHeadFocusTick((t) => t + 1);
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
    // Esc: узкий режим и панель открыта — закрыть её; иначе выбор по умолчанию.
    // `useKeyboardNav` перед этим сбрасывает индекс в −1 — возвращаем его на сделку
    // в фокусе: подсветка и выбор одно и то же.
    onEscape: () => {
      const target = !wide && narrowOpen
        ? focusId
        : selectionScreen ? resolveSelection(null, selectionScreen) : null;
      if (!wide && narrowOpen) setNarrowOpen(false);
      else setSelectedId(null);
      setActiveIndex(target ? dealKbdIndex(target) : -1);
    },
    // Форма хода открыта или DOM-фокус в фокусе — клавиши экрана молчат: иначе Enter
    // на кнопке даты раскрывает чужое, а S откладывает сделку посреди ввода.
    isActive: () => composer === null && !focusHoldsKeys(),
    containerRef: queueRef,
    enabled: mounted && queue.length > 0,
  });

  // ── Подсветка J/K и выбор — один факт (спека §3, F-18).
  // Индекс встал на сделку → она в фокусе. Очередь читается из ref: эффект зависит
  // только от индекса.
  const queueNow = useRef(queue);
  queueNow.current = queue;
  useEffect(() => {
    const q = queueNow.current[activeIndex];
    if (q && q.kind !== 'off') setSelectedId(q.view.source.id);
  }, [activeIndex]);
  // Сменились сделка в фокусе или состав очереди → индекс на неё. От `activeIndex`
  // эффект НЕ зависит: иначе J на строку лида вернул бы подсветку на сделку. Ставится
  // безусловно: `useKeyboardNav` при смене числа строк (раскрыли группу) сбрасывает
  // индекс в −1 в том же коммите, и сверка с текущим значением его бы пропустила.
  const queueKey = queue.map((q) => (q.kind === 'off' ? q.row.key : q.view.source.id)).join('|');
  const focusKbdIndex = focusId ? dealKbdIndex(focusId) : -1;
  useEffect(() => {
    setActiveIndex(focusKbdIndex);
  }, [focusId, queueKey, focusKbdIndex, setActiveIndex]);

  // Узкий режим закрыт, а сделок не осталось или экран стал широким — панель не висит.
  useEffect(() => {
    if (wide || !focusId) setNarrowOpen(false);
  }, [wide, focusId]);

  // Enter по сделке: DOM-фокус в шапку — эффектом после коммита, а не rAF: в узком
  // режиме панели до рендера нет, а rAF в невидимой вкладке не зовётся вовсе.
  useEffect(() => {
    if (headFocusTick > 0) focusHeadEntry(headRef.current);
  }, [headFocusTick]);

  // S-TODAY-FOCUS-2: язычок выбора. Смена фокуса чаще 150 мс (зажатая J) — без
  // анимации: пружины не накладываются, «хвоста» нет. Через 150 мс тишины атрибут
  // снимается — следующий одиночный выбор снова с пружиной.
  const [tabFast, setTabFast] = useState(false);
  const lastFocusChangeAt = useRef(0);
  useEffect(() => {
    const at = performance.now();
    if (at - lastFocusChangeAt.current < 150) setTabFast(true);
    lastFocusChangeAt.current = at;
    const timer = setTimeout(() => setTabFast(false), 150);
    return () => clearTimeout(timer);
  }, [focusId]);

  /** Esc внутри фокуса (форма закрыта): закрыть панель и вернуть DOM-фокус на строку. */
  const onFocusKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || composer !== null) return;
    e.preventDefault();
    e.stopPropagation();
    if (!wide) setNarrowOpen(false);
    const row = queueRef.current?.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`);
    if (row) row.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

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

  // ── Фокус: вид — из модели (сделка могла уйти в «Отложено»), номер хода — по набору.
  const focusView = focusId && model
    ? [...model.moves, ...model.groups.flatMap((g) => g.rows)].find((v) => v.source.id === focusId) ?? null
    : null;
  const focusProject = focusView ? projectsById.get(focusView.source.id) ?? null : null;
  const focusStage: PipelineStage | null = focusProject?.stage_id ? stageById.get(focusProject.stage_id) ?? null : null;
  const focusMoveIndex = focusView && model ? model.moves.findIndex((v) => v.source.id === focusView.source.id) : -1;
  /** Итог хода — у сделанного хода набора и у записанной строки. */
  const doneOf = (view: TodayDealView) => {
    const id = view.source.id;
    const result = results.get(id) ?? null;
    if (!result && !dayDone.has(id)) return null;
    return {
      text: doneText(view, result),
      onRestore: result ? () => void restore(view) : undefined,
      restoring: restoringId === id,
    };
  };
  const focusActions = (view: TodayDealView) => {
    const done = doneOf(view);
    if (done) return <TodayStepDone {...done} />;
    const id = view.source.id;
    return (
      <TodayStepActions
        view={view}
        // Ряд действий на экране один — главная кнопка всегда primary.
        primary
        keyHints
        composer={composer && composer.id === id ? composer.mode : null}
        onCompose={(mode) => (mode ? openComposer(id, mode) : setComposer(null))}
        onWritten={(result) => handleWritten(view, result)}
        onSnooze={() => snoozeDeal(id)}
        href={hrefOf(id)}
        extra={
          <Link
            href={hrefOf(id)}
            className="inline-flex min-h-7 items-center gap-0.5 whitespace-nowrap rounded px-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
          >
            Открыть<span className="today-open-long">{'\u00a0'}сделку</span>
            <ArrowUpRight aria-hidden="true" className="h-3 w-3 shrink-0" />
            <KeyHint k="O" />
          </Link>
        }
      />
    );
  };
  const focusPane = (overlay: boolean) =>
    focusView && focusProject && now ? (
      <TodayFocusPane
        view={focusView}
        project={focusProject}
        stage={focusStage}
        quotes={quotesQ.data?.get(focusView.source.id) ?? []}
        now={now}
        move={focusMoveIndex >= 0 && model ? { n: focusMoveIndex + 1, of: model.moves.length } : null}
        actions={focusActions(focusView)}
        composerOpen={composer?.id === focusView.source.id}
        paneRef={paneRef}
        headRef={headRef}
        onKeyDown={onFocusKeyDown}
        overlay={overlay}
        onClose={overlay ? () => setNarrowOpen(false) : undefined}
      />
    ) : null;
  const hasFocus = !!focusView;

  const dateProse = now
    ? format(now, 'EEEE, d MMMM', { locale: ru }).replace(/^./, (ch) => ch.toUpperCase())
    : '';
  const loading = !model && !loadError;
  const nothingAtAll = !!model && model.total === 0 && chipsTotal === 0;
  const assignedCount = model?.moves.filter((v) => v.slot === 'assigned').length ?? 0;

  return (
    <div ref={cqRef} className="today-cq">
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
        <div className={hasFocus ? 'today-split' : undefined}>
          <div ref={queueRef} className="min-w-0" data-tab-fast={tabFast ? 'true' : undefined}>
            {(loading || (model && model.total > 0)) && (
              <TodayMoves
                moves={model?.moves ?? []}
                assignedCount={assignedCount}
                limit={DEFAULT_TODAY_THRESHOLDS.movesLimit}
                loading={loading}
                selectedId={focusId}
                onSelect={selectDeal}
                // Карточка показывает итог только у сделанного хода набора.
                doneOf={(view) => (dayDone.has(view.source.id) ? doneOf(view) : null)}
                allDone={allMovesDone}
                onTakeMore={
                  dayState && freshComputed.some((m) => !dayState.picked.includes(m.id))
                    ? () => persistDayMoves(takeOneMore(dayState, freshComputed))
                    : null
                }
                kbdIndexOf={dealKbdIndex}
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
              selectedId={focusId}
              onSelect={selectDeal}
              kbdIndexOf={dealKbdIndex}
              todayKey={todayKey}
            writtenOf={writtenOf}
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
                J / K — выбор сделки · Enter — в фокус · D — главное действие · U — обновить шаг · T — перенести · S — отложить · O — открыть сделку · Esc — к плану дня
              </p>
            )}
          </div>
          {wide && focusPane(false)}
        </div>
      )}

      {/* Узкий режим: панель поверх списка — порталом в body, вне обёртки
          PageTransition с её transform (спека §2). */}
      {!wide && narrowOpen && mounted && createPortal(focusPane(true), document.body)}

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

