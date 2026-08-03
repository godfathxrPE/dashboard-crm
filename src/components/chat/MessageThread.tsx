'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ListPlus, MessageCircle, MessagesSquare, Paperclip, Pencil, Trash2, SendHorizontal, Smile, SmilePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  isTempMessage,
} from '@/lib/hooks/use-messages';
import { useConversations, useMarkRead } from '@/lib/hooks/use-conversations';
import { gradientFor } from '@/lib/constants/chat-avatars';
import { useUiStore } from '@/lib/stores/ui-store';
import { useMessageReactions, useToggleReaction } from '@/lib/hooks/use-message-reactions';
import {
  useMessageAttachments,
  checkAttachmentBatch,
  attachmentProblemMessage,
  formatAttachmentSize,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '@/lib/hooks/use-message-attachments';
import { useEntityTitles } from '@/lib/hooks/use-entity-titles';
import { APP_ORIGIN, entityRefsOf, parseEntityLinks } from '@/lib/utils/entity-links';
import { useTasksBySourceMessages } from '@/lib/hooks/use-tasks-by-message';
import { MessageAttachments } from '@/components/chat/MessageAttachments';
import { MessageBody } from '@/components/chat/MessageBody';
import {
  TaskCreatedLink,
  TaskFromMessageCard,
} from '@/components/chat/TaskFromMessageCard';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { mskDateKey } from '@/lib/utils/date-helpers';
import { ChatEmojiPicker } from '@/components/projects/ChatEmojiPicker';
import type { MessageWithAuthor } from '@/types/entities';

interface MessageThreadProps {
  conversationId: string;
  /** Заголовок карточки и aria-label ленты. */
  title?: string;
  /** Текст пустого состояния — у общего канала и канала проекта он разный. */
  emptyText?: string;
  /**
   * Классы корневой карточки. Дефолт — вкладка на карточке проекта (карточка в
   * потоке страницы). Хабу 1b нужна панель во всю высоту без внешнего отступа —
   * поэтому оболочка задаётся снаружи, а не форком компонента.
   */
  className?: string;
  /** Классы скролл-области ленты. Дефолт — фиксированная высота вкладки. */
  listClassName?: string;
  /**
   * Слот в правой части шапки треда (S-CHAT-HUB-1c): счётчик участников группы и
   * кнопки управления. Именно слот, а не props вида `kind`/`canManage`/колбэки —
   * тред не должен знать про группы и роли: этим распоряжается ChatView, который уже
   * держит и канал, и модалку.
   */
  headerExtra?: ReactNode;
  /**
   * Слот ПЕРЕД названием (S-CHAT-HUB-1e): аватар канала в хабе. Той же логики, что и
   * `headerExtra` — тред не знает ни про id канала, ни про его тип. Не задан (вкладка
   * «Чат» на карточке проекта) — рисуется прежняя иконка MessageCircle.
   */
  leading?: ReactNode;
  /**
   * S-CHAT-HUB-1f. `page` — раздел /chat: лента получает обои и собственный фон
   * `--chat-bg`. `card` (дефолт) — вкладка «Чат» на карточке проекта: обоев нет,
   * фон прежний `--bg`. Обои — приём «этот раздел не такой, как остальные», и на
   * карточке среди карточек они бы этот смысл ровно перевернули.
   *
   * Всё остальное (пузыри на токенах, sticky день-чип, разделитель непрочитанного,
   * FAB, композер-капсула) одинаково в обоих вариантах: это не идентичность раздела,
   * а поведение ленты, и разводить его по вариантам значило бы держать два чата.
   */
  variant?: 'page' | 'card';
}

const DEFAULT_ROOT_CLASS = 'mb-4 rounded-xl border border-border bg-surface p-4';
const DEFAULT_LIST_CLASS = 'h-[min(55vh,40rem)]';

/** Дальше этого от низа — показываем FAB «вниз». */
const FAB_THRESHOLD_PX = 300;
/** Ближе этого к низу — считаем, что человек «у низа» (автоскролл, сброс счётчика). */
const AT_BOTTOM_PX = 80;
/** Потолок автовысоты композера ≈ 6 строк text-sm + вертикальные паддинги. */
const COMPOSER_MAX_PX = 148;

/**
 * S-CHAT-TASK-1: слэш-команда «превратить набранное в задачу». Одна команда на весь
 * композер, поэтому автокомплита нет — есть подсказка под полем при вводе `/`.
 *
 * `\b` не используется: в JS он опирается на ASCII-`\w` и после кириллицы срабатывает
 * наоборот ожидаемому (та же грабля, что в `task-intent`).
 */
const TASK_COMMAND_RE = /^\/задач[ау](?![\wа-яё])\s*/i;

/** Остаток строки после команды, либо `null` — это не команда. */
function matchTaskCommand(body: string): string | null {
  const m = body.match(TASK_COMMAND_RE);
  return m ? body.slice(m[0].length).trim() : null;
}

/**
 * Что превращаем в задачу. `sourceMessageId = null` — вход через слэш-команду:
 * сообщения ещё нет, значит нет и ключа идемпотентности (099).
 */
interface TaskDraft {
  body: string;
  sourceMessageId: string | null;
  /** Дефолтный исполнитель: автор сообщения, а для команды — сам пишущий (решение 6). */
  assigneeId: string | null;
}

// Время/дата всегда в МСК (как mskDateKey) — у команды одна «правда времени»,
// чип «Вчера» и время в пузыре не расходятся между таймзонами браузеров.
const MSK_TIME_FMT = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});
const MSK_FULL_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});
// Ключ YYYY-MM-DD форматируем через UTC-полдень — TZ браузера не сдвинет день.
const DAY_FMT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const DAY_FMT_YEAR = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const GROUP_GAP_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

function dayChipLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return 'Сегодня';
  // «Вчера» — календарный день −1 от MSK-ключа (UTC-полдень, как бакеты Ганта),
  // НЕ от browser-local даты.
  const yesterdayKey = new Date(Date.parse(`${todayKey}T12:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (dayKey === yesterdayKey) return 'Вчера';
  const noon = new Date(Date.parse(`${dayKey}T12:00:00Z`));
  const fmt = dayKey.slice(0, 4) === todayKey.slice(0, 4) ? DAY_FMT : DAY_FMT_YEAR;
  return fmt.format(noon);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/**
 * S-CHAT-HUB-1f: фолбэк-аватар автора красится той же 8-цветной палитрой, что и
 * аватары каналов, — hash по `author_id`. Это же значение уходит в цвет ИМЕНИ в
 * пузыре (см. `authorNameStyle`): один источник цвета на человека, приём Telegram.
 * Ключ — `author_id`, а не имя: имя человек может сменить, цвет от этого прыгать
 * не должен.
 */
function Avatar({
  author,
  authorKey,
}: {
  author: MessageWithAuthor['author'];
  authorKey: string;
}) {
  if (author?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={author.avatar_url}
        alt={author.full_name}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }
  const g = gradientFor(authorKey);
  return (
    <div
      style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold leading-none text-white"
    >
      {author ? initials(author.full_name) || '?' : '?'}
    </div>
  );
}

/**
 * Обе точки палитры уезжают в CSS-переменные — какую взять, решает тема
 * (`.chat-author` в globals.css): светлым нужен тёмный конец пары, тёмным —
 * осветлённый `onDark`. Определять «тема тёмная?» в JS значило бы завести второй,
 * рассинхронизирующийся список тем.
 */
function authorNameStyle(authorKey: string): React.CSSProperties {
  const g = gradientFor(authorKey);
  return {
    '--chat-author-on-light': g.to,
    '--chat-author-on-dark': g.onDark,
  } as React.CSSProperties;
}

/**
 * S-CHAT-HUB-1a: тред канала. Выделен из ProjectChat один-в-один (разметка, поведение и
 * токены не менялись — 1a не UI-спринт), привязка сменилась с projectId на
 * conversationId. Одна и та же лента обслуживает вкладку «Чат» на карточке и хаб 1b.
 *
 * S-CHAT-1: чат — отдельный модуль (НЕ «Активность»/EntityTimeline).
 * body рендерится как текст (React экранирует — XSS-контур), whitespace-pre-wrap.
 * S-CHAT-HUB-1e: между текстом появились чипы ссылок на карточки CRM (`MessageBody`),
 * контур не изменился — текст по-прежнему уходит детьми React, href чипа собирается
 * парсером из белого списка, а не из строки пользователя. Режим ПРАВКИ работает с
 * сырым `m.body` — в textarea человек видит ту ссылку, которую вставлял.
 * Composer виден всем, кто открыл канал (SELECT прошёл = член канала по
 * is_conversation_member); INSERT-политика — бэкап, ошибка уйдёт в toast.
 *
 * S-CHAT-1.1: telegram-lite — лента на --bg (инверсия глубины), группировка ≤5 мин,
 * день-чипы по mskDateKey.
 * Пузыри: chat-own (--chat-own-bg + рамка --chat-own-border, акцентное разделение
 * свой↔чужой/фон, подтянуто аудитом S-CHAT-1.2) / chat-other (--surface + border + shadow).
 * Цвета ТЕКСТА в пузырях зафиксированы аудитом читаемости (10:1+) — не менять.
 */
export function MessageThread({
  conversationId,
  title = 'Чат проекта',
  emptyText = 'Пока тихо. Напиши первое сообщение команде',
  className = DEFAULT_ROOT_CLASS,
  listClassName = DEFAULT_LIST_CLASS,
  headerExtra,
  leading,
  variant = 'card',
}: MessageThreadProps) {
  const { messages, isLoading } = useMessages(conversationId);
  const { user } = useAuth();
  const { data: orgRole } = useOrgRole();
  const { data: teamMembers = [] } = useTeamMembers();
  const sendMessage = useSendMessage(conversationId);
  const editMessage = useEditMessage(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);

  // Драфт — в ui-store по каналам (1f): ChatView пересоздаёт тред на смене канала.
  const draft = useUiStore((s) => s.chatDraftByConversation[conversationId] ?? '');
  const setChatDraft = useUiStore((s) => s.setChatDraft);
  const setDraft = useCallback(
    (value: string) => setChatDraft(conversationId, value),
    [setChatDraft, conversationId],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  // ── S-CHAT-2: реакции. messageIds — из уже загруженной ленты (без повторного fetch).
  const messageIds = useMemo(
    () => messages.filter((m) => !isTempMessage(m)).map((m) => m.id),
    [messages],
  );
  const { byMessage: reactionsByMessage } = useMessageReactions(conversationId, messageIds);
  // ── S-CHAT-HUB-1d: вложения. Тот же приём, что у реакций — одним запросом по уже
  // загруженной ленте, без N+1.
  const { byMessage: attachmentsByMessage } = useMessageAttachments(conversationId, messageIds);
  // ── S-CHAT-TASK-1: у каких сообщений ленты уже есть задача. Тот же приём — одна
  // выборка на ленту. Пусто в ответе ≠ «задачи нет»: RLS `tasks` может честно не
  // показать чужую задачу, поэтому настоящая защита от дубля — unique-индекс 099.
  const { byMessage: tasksByMessage } = useTasksBySourceMessages(conversationId, messageIds);

  // ── S-CHAT-HUB-1e: ссылки на карточки CRM в теле сообщения. Разбор — один раз на
  // ленту, названия — одним запросом на таблицу по всем найденным ссылкам сразу.
  // Origin'ов два: свой (ссылка вставлена там же, где читают) и боевой — адрес копируют
  // из прода, а читают в том числе на localhost, и на своём origin'е прод-ссылка иначе
  // осталась бы голым uuid.
  const linkOrigins = useMemo(() => {
    const origins = [APP_ORIGIN];
    if (typeof window !== 'undefined') origins.push(window.location.origin);
    return origins;
  }, []);
  const bodyPartsByMessage = useMemo(
    () => new Map(messages.map((m) => [m.id, parseEntityLinks(m.body, linkOrigins)])),
    [messages, linkOrigins],
  );

  // ── S-CHAT-TASK-1: что превращаем в задачу. Разбор чипов черновика идёт ТЕМ ЖЕ
  // парсером и подмешивается в общий запрос названий: у слэш-команды сообщения в ленте
  // нет, и без этого ссылка, вставленная прямо в композер, осталась бы нерезолвнутой.
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const taskDraftRefs = useMemo(
    () => (taskDraft ? entityRefsOf(parseEntityLinks(taskDraft.body, linkOrigins)) : []),
    [taskDraft, linkOrigins],
  );

  const entityRefs = useMemo(
    () => [...[...bodyPartsByMessage.values()].flatMap(entityRefsOf), ...taskDraftRefs],
    [bodyPartsByMessage, taskDraftRefs],
  );
  const { titles: entityTitles, isLoading: titlesLoading } = useEntityTitles(entityRefs);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toggleReactionMut = useToggleReaction(conversationId);
  // Отдельный state пикера реакций — НЕ шарим composer'ный emojiOpen/emojiBtnRef.
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const reactionAnchorRef = useRef<HTMLButtonElement | null>(null);

  // ── S-CHAT-HUB-1a: отметка прочтения — фундамент unread-бейджей 1b. Тред открыт ⇒
  // всё в нём прочитано: на маунт и на каждое новое сообщение двигаем штамп.
  // Зависимость — id последнего НЕ temp-сообщения: optimistic-строка сменится реальной,
  // и на temp-id отметка ушла бы вхолостую.
  //
  // S-CHAT-HUB-1b: отмечаем ТОЛЬКО когда вкладка видима. Лента в фоновой вкладке
  // никем не прочитана — гасить на ней бейдж значит терять сообщение. Если вкладка
  // скрыта, ждём возвращения одноразовым слушателем (без него отметка не случилась бы
  // до следующего сообщения).
  const markRead = useMarkRead(conversationId);
  const lastPersistedId = messageIds[messageIds.length - 1] ?? null;
  useEffect(() => {
    if (!conversationId || isLoading) return;
    if (document.visibilityState === 'visible') {
      markRead.mutate();
      return;
    }
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      markRead.mutate();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // markRead — новый объект мутации на каждый рендер; в deps только реальные триггеры.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, isLoading, lastPersistedId]);

  // ── S-CHAT-HUB-1f: граница «Новые сообщения».
  //
  // Берём `last_read_at` из УЖЕ загруженного списка каналов (тот же ключ запроса, что
  // у сайдбара — нового обращения к БД нет) и замораживаем его на всё время, пока
  // канал открыт. Замораживать обязательно: `useMarkRead` двигает отметку сразу после
  // маунта, а следом realtime-инвалидация приносит новое значение — живое чтение
  // означало бы, что разделитель исчезает через секунду после того, как появился, и
  // прыгает на каждое входящее.
  const { conversations } = useConversations();
  const listEntry = conversations.find((c) => c.conversation.id === conversationId);
  const listLastReadAt = listEntry?.lastReadAt ?? null;
  const hasListEntry = !!listEntry;
  const [unreadAfter, setUnreadAfter] = useState<string | null>(null);
  const snapshotForRef = useRef<string | null>(null);

  useEffect(() => {
    // Список ещё не приехал — ждём: снимок «null» сейчас погасил бы разделитель совсем.
    if (!hasListEntry || snapshotForRef.current === conversationId) return;
    snapshotForRef.current = conversationId;
    setUnreadAfter(listLastReadAt);
  }, [conversationId, hasListEntry, listLastReadAt]);

  /**
   * Первое непрочитанное сообщение — перед ним встанет разделитель.
   *
   * `null` в снимке значит «канал открыт впервые»: новым тогда оказывается вообще всё,
   * и линия у самой верхней строки ничего не разделяет — не рисуем (решение спринта).
   * Свои сообщения пропускаем: линия перед собственной репликой читается как поломка,
   * а сюда они попадают легко — достаточно написать из соседней вкладки.
   */
  const firstUnreadId = useMemo(() => {
    if (!unreadAfter) return null;
    const found = messages.find(
      (m) => !isTempMessage(m) && m.author_id !== (user?.id ?? null) && m.created_at > unreadAfter,
    );
    return found?.id ?? null;
  }, [messages, unreadAfter, user?.id]);

  function toggleReaction(messageId: string, emoji: string) {
    const mine = reactionsByMessage.get(messageId)?.find((r) => r.emoji === emoji)?.mine ?? false;
    toggleReactionMut.mutate(
      { messageId, emoji, mine },
      { onError: () => toast.error('Не удалось изменить реакцию') },
    );
  }

  const myId = user?.id ?? null;
  const isModerator = orgRole === 'owner' || orgRole === 'admin';
  const meMember = teamMembers.find((m) => m.id === myId);
  const me = myId
    ? { id: myId, full_name: meMember?.full_name ?? 'Я', avatar_url: meMember?.avatar_url ?? null }
    : null;

  // ── Автоскролл (гоча 6): вниз на маунте и при новом сообщении, если пользователь
  // уже внизу или сообщение своё; листающего историю не дёргаем.
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  // Анимация входящих: seen наполняется целиком на первом non-loading рендере
  // (иначе стробоскоп на 50 сообщениях); ready → анимируем только то, что пришло ПОСЛЕ.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);
  // S-CHAT-HUB-1f: реакции поп'ают только при ПОСТАНОВКЕ. Тот же приём, что у seenIds:
  // на первом non-loading рендере множество наполняется целиком, иначе открытие канала
  // с готовой лентой даёт залп из десятка чипов разом.
  const seenReactionsRef = useRef<Set<string>>(new Set());

  // ── FAB «вниз» (1f). Порог 300px от низа; счётчик — что пришло, пока листали вверх.
  const [showFab, setShowFab] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const scrollRafRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // atBottomRef двигаем СИНХРОННО: автоскролл-эффект читает его в том же тике, в
    // котором приходит сообщение, и отложенное на кадр значение успевало бы устареть.
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < AT_BOTTOM_PX;
    // А вот перерисовку FAB троттлим кадром — скролл-события идут пачками.
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const node = scrollRef.current;
      if (!node) return;
      const d = node.scrollHeight - node.scrollTop - node.clientHeight;
      setShowFab(d > FAB_THRESHOLD_PX);
      if (d < AT_BOTTOM_PX) setMissedCount(0);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setMissedCount(0);
    setShowFab(false);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;
    if (added <= 0) return;
    const last = messages[messages.length - 1];
    const lastIsMine = last && (last.author_id === myId || isTempMessage(last));
    if (atBottomRef.current || lastIsMine) {
      // Smooth — только на новое сообщение после первой отрисовки и без reduced-motion.
      const smooth =
        readyRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      else el.scrollTop = el.scrollHeight;
      return;
    }
    // Листающего историю не дёргаем (гоча 6) — вместо рывка растим счётчик на FAB.
    // Только после первой отрисовки: начальная загрузка ленты не «пропущенное».
    if (readyRef.current) setMissedCount((n) => n + added);
  }, [messages, myId]);

  // На маунте (и после первой загрузки) — сразу вниз, без анимации.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !isLoading) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // После рендера — все текущие id считаются «виденными»; ready после первого
  // non-loading рендера. Объявлен ПОСЛЕ скролл-эффекта: тот должен видеть
  // ready-состояние ДО этой пачки (initial load — мгновенный скролл).
  useEffect(() => {
    if (isLoading) return;
    for (const m of messages) seenIdsRef.current.add(m.id);
    readyRef.current = true;
  }, [isLoading, messages]);

  // То же для реакций — отдельным эффектом: они приезжают своим запросом и позже ленты.
  useEffect(() => {
    if (isLoading) return;
    for (const [messageId, list] of reactionsByMessage) {
      for (const r of list) seenReactionsRef.current.add(`${messageId}:${r.emoji}`);
    }
  }, [isLoading, reactionsByMessage]);

  /**
   * Лента, разложенная по дням. Раньше сообщения шли плоским списком, а день-чип жил
   * внутри обёртки ОДНОГО сообщения — sticky в такой обёртке залипает на её же
   * высоте, то есть практически никак. День-блок даёт чипу нормальный контекст: он
   * держится сверху, пока идёт его день, и уезжает вместе с ним.
   *
   * Группировка сообщений (аватар, хвостик, отступы) от этого не меняется: границы дня
   * и так всегда были границами группы, поэтому prev/next достаточно искать внутри дня.
   */
  const dayGroups = useMemo(() => {
    const out: { dayKey: string; items: MessageWithAuthor[] }[] = [];
    for (const m of messages) {
      const dayKey = mskDateKey(m.created_at);
      const last = out[out.length - 1];
      if (last && last.dayKey === dayKey) last.items.push(m);
      else out.push({ dayKey, items: [m] });
    }
    return out;
  }, [messages]);

  // S-CHAT-HUB-1d: сообщение может быть из одного файла — CHECK на `body` ослаблен 097.
  // Инвариант «текст ИЛИ вложение» держит именно эта строка: в БД он не выражается
  // (кросс-табличное условие, а вложения вставляются ПОСЛЕ сообщения).
  const canSend = (draft.trim().length > 0 || pendingFiles.length > 0) && !sendMessage.isPending;

  // Автовысота композера (1f): сброс в auto обязателен — иначе scrollHeight меряется
  // от уже растянутого поля и оно только растёт, но никогда не сжимается обратно.
  // Зависимость — draft, а не onChange: текст меняют ещё вставка эмодзи и откат
  // черновика после неудачной отправки.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [draft]);

  function handleSend() {
    if (!canSend) return;
    const body = draft.trim();
    const files = pendingFiles;

    // S-CHAT-TASK-1. Слэш-команда перехватывает отправку: вместо сообщения — карточка
    // подтверждения. Перехват только при пустом списке файлов: задача вложений не
    // несёт, и съесть подписанные файлы командой было бы потерей данных.
    const commandRest = files.length === 0 ? matchTaskCommand(body) : null;
    if (commandRest !== null) {
      if (!commandRest) {
        // Пустая команда — подсказка, а не карточка (edge case спринта).
        toast.info('После /задача напиши, что надо сделать');
        return;
      }
      setTaskDraft({ body: commandRest, sourceMessageId: null, assigneeId: myId });
      setDraft('');
      return;
    }

    setDraft('');
    setPendingFiles([]);
    sendMessage.mutate(
      { body, me, files },
      {
        onSuccess: ({ attachmentsFailed }) => {
          if (attachmentsFailed) toast.error('Сообщение ушло, но файлы не прикрепились');
        },
        onError: () => {
          // Возвращаем черновик и файлы: заново выбирать пять файлов из-за упавшей
          // сети — это наказание за чужую ошибку.
          setDraft(body);
          setPendingFiles(files);
          toast.error('Не удалось отправить сообщение');
        },
      },
    );
  }

  /**
   * Выбор файлов. Проверка ДО отправки и на всю партию сразу: частичная отправка хуже
   * отказа — иначе человек видит отправленное сообщение и думает, что приложил пять
   * файлов, а приложил четыре.
   */
  function handleFilesPicked(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const next = [...pendingFiles, ...Array.from(picked)];
    const problem = checkAttachmentBatch(next);
    if (problem) {
      toast.error(attachmentProblemMessage(problem));
      return;
    }
    setPendingFiles(next);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Вставка эмодзи в позицию курсора; selection читаем прямо с DOM-элемента —
  // textarea хранит selectionStart/End и после потери фокуса (клик по пикеру).
  function handleEmojiPick(emoji: string) {
    const el = textareaRef.current;
    const s = el ? el.selectionStart : draft.length;
    const e = el ? el.selectionEnd : draft.length;
    const next = draft.slice(0, s) + emoji + draft.slice(e);
    setEmojiOpen(false);
    if (next.length > 4000) {
      // Лимит maxLength — не вставляем, только возвращаем фокус.
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    setDraft(next);
    // Фокус + caret после эмодзи — после рендера нового value.
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      const caret = s + emoji.length;
      t.setSelectionRange(caret, caret);
    });
  }

  function closeEmojiPicker() {
    setEmojiOpen(false);
    textareaRef.current?.focus();
  }

  function startEdit(m: MessageWithAuthor) {
    setEditingId(m.id);
    setEditDraft(m.body);
  }

  function submitEdit() {
    const body = editDraft.trim();
    if (!editingId || !body) return;
    editMessage.mutate(
      { id: editingId, body },
      { onError: () => toast.error('Не удалось сохранить правку') },
    );
    setEditingId(null);
  }

  // TODO (CHAT-HUB 1b/polish): window.confirm блокирует браузерные смоки и расходится с
  // конвенцией проекта. Переехал сюда как есть — 1a не меняет поведение (W4 ревью).
  function handleDelete(m: MessageWithAuthor) {
    if (window.confirm('Удалить сообщение?')) {
      deleteMessage.mutate(m.id, {
        onError: () => toast.error('Не удалось удалить сообщение'),
      });
    }
  }

  const todayKey = mskDateKey(new Date());

  return (
    <div className={className}>
      <div className="mb-3 flex shrink-0 items-center gap-2">
        {leading ?? <MessageCircle size={14} className="text-text-dim" />}
        <span className="text-xs font-semibold text-text-main">{title}</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">
          {messages.length}
        </span>
        {headerExtra && <div className="ml-auto flex items-center gap-1">{headerExtra}</div>}
      </div>

      {/*
        Полотно ленты. Обои и FAB живут на ОБЁРТКЕ, скролл — вложенным absolute-слоем:
        absolute-потомок скроллера уезжает вместе с контентом, и узор кончался бы на
        первом экране, а кнопка «вниз» уплывала бы вверх. Оба слоя позиционированы,
        поэтому порядок отрисовки задаёт порядок в DOM: обои → сообщения → FAB.
      */}
      <div
        className={`relative mb-3 min-h-0 overflow-hidden rounded-[var(--radius-m)] border border-border/50 ${
          variant === 'page' ? 'chat-wallpaper' : 'bg-bg'
        } ${listClassName}`}
      >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={title}
        className="absolute inset-0 overflow-y-auto px-3 py-2"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-text-mute">Загрузка...</p>
          </div>
        ) : messages.length === 0 ? (
          // 1f: на обоях пустой канал — не дырка, а приглашение: иконка в мягком круге
          // подложки --chat-chip по центру узора.
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-[var(--chat-chip)]">
              <MessagesSquare size={24} className="text-text-mute" aria-hidden="true" />
            </div>
            <p className="max-w-[18rem] text-center text-xs text-text-mute">{emptyText}</p>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end">
            {dayGroups.map((group) => (
              <div key={group.dayKey}>
                {/* День-чип залипает сверху, пока идёт его день (НЕ aria-hidden:
                    aria-live озвучит его как обычный текст в потоке). */}
                <div className="sticky top-0 z-[2] flex justify-center pb-1 pt-3">
                  <span className="rounded-full border border-border/60 bg-[var(--chat-chip)] px-2.5 py-0.5 text-meta text-text-mute backdrop-blur-[6px]">
                    {dayChipLabel(group.dayKey, todayKey)}
                  </span>
                </div>
                {group.items.map((m, i) => {
              const mine = m.author_id === myId;
              const temp = isTempMessage(m);
              const canEdit = mine && !temp;
              const canDelete = (mine || isModerator) && !temp;
              // author_id nullable (профиль удалён → SET NULL). Все безымянные съезжают
              // в один цвет — это честнее, чем красить каждое их сообщение по-своему.
              const authorKey = m.author_id ?? 'unknown';

              // prev/next ищем внутри дня: границы дня и так всегда были границами
              // группы, поэтому первый в дне — groupStart, последний — groupEnd.
              const prev = group.items[i - 1];
              const next = group.items[i + 1];
              const newDay = i === 0;
              const groupStart =
                newDay ||
                prev.author_id !== m.author_id ||
                Date.parse(m.created_at) - Date.parse(prev.created_at) > GROUP_GAP_MS;
              const groupEnd =
                !next ||
                next.author_id !== m.author_id ||
                Date.parse(next.created_at) - Date.parse(m.created_at) > GROUP_GAP_MS;

              // W4: анимируем только входящее, появившееся после первого рендера.
              const animate = readyRef.current && !seenIdsRef.current.has(m.id) && !mine && !temp;

              const created = new Date(m.created_at);
              const timeEl = (
                <span
                  title={MSK_FULL_FMT.format(created)}
                  className="mt-0.5 self-end whitespace-nowrap text-meta leading-none tabular-nums text-[color:var(--chat-time,var(--text-dim))]"
                >
                  {MSK_TIME_FMT.format(created)}
                  {m.edited_at && <span className="italic"> · изм.</span>}
                </span>
              );

              // S-CHAT-TASK-1: задача, уже рождённая из этого сообщения (если она
              // видна читателю по RLS) — иконка «в задачу» превращается в ссылку на неё.
              const messageTask = temp ? undefined : tasksByMessage.get(m.id);

              // Кнопка «реакция» доступна всем на любом non-temp сообщении (не под
              // canEdit/canDelete); Pencil/Trash — под своими гейтами.
              const controls = !temp && editingId !== m.id && (
                <div className="flex shrink-0 items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    onClick={(e) => {
                      reactionAnchorRef.current = e.currentTarget;
                      setReactionPickerFor(m.id);
                    }}
                    className="rounded p-0.5 text-text-mute transition-colors hover:text-text-main"
                    aria-label="Добавить реакцию"
                  >
                    <SmilePlus size={12} />
                  </button>
                  {/*
                    S-CHAT-TASK-1: «в задачу». Видна ВСЕМ, кто видит сообщение — задачу
                    ставят и по чужой реплике, это нормальный рабочий сценарий (в отличие
                    от правки, которая под canEdit). У сообщения из одних вложений тела
                    для разбора нет — кнопку не показываем.
                  */}
                  {m.body.trim() &&
                    (messageTask ? (
                      <TaskCreatedLink taskText={messageTask.text} />
                    ) : (
                      <button
                        onClick={() =>
                          setTaskDraft({
                            body: m.body,
                            sourceMessageId: m.id,
                            // Исполнитель по умолчанию — АВТОР сообщения, не нажавший
                            // (решение 6): «нужно позвонить» написал Иван — задача его.
                            assigneeId: m.author_id,
                          })
                        }
                        className="rounded p-0.5 text-text-mute transition-colors hover:text-text-main"
                        aria-label="Создать задачу из сообщения"
                        title="Создать задачу из сообщения"
                      >
                        <ListPlus size={12} />
                      </button>
                    ))}
                  {canEdit && (
                    <button
                      onClick={() => startEdit(m)}
                      className="rounded p-0.5 text-text-mute transition-colors hover:text-text-main"
                      aria-label="Править сообщение"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(m)}
                      className="rounded p-0.5 text-text-mute transition-colors hover:text-red"
                      aria-label="Удалить сообщение"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );

              // S-CHAT-HUB-1d. У temp-строки вложений в БД ещё нет — они появятся
              // вместе с реальным сообщением; пустое тело у temp значит «файлы летят».
              const attachments = temp ? [] : (attachmentsByMessage.get(m.id) ?? []);
              const sendingOnlyFiles = temp && !m.body;

              // Чипы реакций под пузырём (свой и чужой). Всегда видимы (не hover).
              const reactions = temp ? [] : (reactionsByMessage.get(m.id) ?? []);
              const reactionChips = reactions.length > 0 && (
                <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'pl-[calc(1.75rem+0.375rem)]'}`}>
                  {reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => toggleReaction(m.id, r.emoji)}
                      title={r.users.map((u) => u.name).join(', ')}
                      aria-pressed={r.mine}
                      aria-label={`${r.emoji} ${r.count}`}
                      // Подложка чужой реакции — --chat-chip, а не surface2: на обоях
                      // непрозрачный прямоугольник читался бы как заплатка.
                      //
                      // `chat-own` на своём чипе — не косметика: --chat-own-bg/-border
                      // объявлены ИМЕННО в этом классе, а строка чипов лежит СНАРУЖИ
                      // пузыря, наследовать их там не от кого. Без класса три ссылки
                      // ниже разрешались в invalid, и свой чип уходил в полностью
                      // прозрачный фон с дефолтной рамкой (тянется с S-CHAT-2; на --bg
                      // это было почти незаметно, на обоях — эмодзи прямо на узоре).
                      className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-meta leading-none tabular-nums transition-colors ${
                        r.mine
                          ? 'chat-own border-[color:var(--chat-own-border)] bg-[var(--chat-own-bg)] text-[color:var(--chat-own-fg,var(--text))]'
                          : 'border-border bg-[var(--chat-chip)] text-text-dim hover:text-text-main'
                      } ${
                        readyRef.current && !seenReactionsRef.current.has(`${m.id}:${r.emoji}`)
                          ? 'chat-reaction-pop'
                          : ''
                      }`}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              );

              const editBlock = editingId === m.id && (
                <div className="flex w-full max-w-[72%] flex-col gap-1">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitEdit();
                      }
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    rows={2}
                    autoFocus
                    className="w-full resize-none rounded-lg border border-input bg-surface px-2 py-1.5
                               text-sm text-text-main focus:border-accent focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitEdit}
                      className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-white hover:opacity-90"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded px-2 py-0.5 text-xs text-text-mute hover:text-text-main"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              );

              return (
                <div key={m.id}>
                  {m.id === firstUnreadId && (
                    // Разделитель непрочитанного. Краска — --chat-pattern-ink: единственный
                    // токен «фирменный цвет темы, читаемый на --chat-bg» (контрасты — в
                    // блоке 1f в globals.css).
                    <div className="my-3 flex items-center gap-2 text-meta uppercase tracking-[0.04em] text-[color:var(--chat-pattern-ink)]">
                      <span
                        aria-hidden="true"
                        className="h-px flex-1 bg-[var(--chat-pattern-ink)] opacity-30"
                      />
                      Новые сообщения
                      <span
                        aria-hidden="true"
                        className="h-px flex-1 bg-[var(--chat-pattern-ink)] opacity-30"
                      />
                    </div>
                  )}
                  {mine ? (
                    <div
                      className={`group flex items-end justify-end gap-1.5 ${groupStart && !newDay ? 'mt-3' : 'mt-0.5'}`}
                    >
                      {controls}
                      {editBlock || (
                        <div
                          className={`chat-own flex max-w-[72%] flex-col rounded-[var(--radius-m)] bg-[var(--chat-own-bg)] border border-[color:var(--chat-own-border)] px-3 py-1.5 ${
                            groupEnd ? 'rounded-br-[4px]' : ''
                          } ${temp ? 'opacity-60' : ''} ${animate ? 'animate-appear' : ''}`}
                        >
                          {/* Пустое тело — не пустой абзац: сообщение из одного файла
                              рисуется только вложением (097 разрешил body = ''). */}
                          {m.body && (
                            <MessageBody
                              parts={bodyPartsByMessage.get(m.id) ?? []}
                              titles={entityTitles}
                              isLoading={titlesLoading}
                            />
                          )}
                          {sendingOnlyFiles && (
                            <p className="text-sm italic opacity-80">Отправка…</p>
                          )}
                          <MessageAttachments attachments={attachments} />
                          {timeEl}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`group flex items-end gap-1.5 ${groupStart && !newDay ? 'mt-3' : 'mt-0.5'}`}
                    >
                      {/* Аватар — у ПОСЛЕДНЕГО сообщения группы («кто закончил реплику»,
                          паттерн Telegram); у остальных строк на его месте распорка,
                          ряд выровнен по низу. */}
                      {groupEnd ? (
                        <Avatar author={m.author} authorKey={authorKey} />
                      ) : (
                        <div className="w-7 shrink-0" aria-hidden="true" />
                      )}
                      {editBlock || (
                        <div
                          className={`chat-other flex max-w-[72%] flex-col rounded-[var(--radius-m)] border border-[color:var(--chat-in-border)] bg-[var(--chat-in-bg)] px-3 py-1.5 shadow-[var(--shadow-xs)] ${
                            groupEnd ? 'rounded-bl-[4px]' : ''
                          } ${animate ? 'animate-appear' : ''}`}
                        >
                          {groupStart && (
                            <span
                              style={authorNameStyle(authorKey)}
                              className="chat-author text-xs font-medium"
                            >
                              {m.author?.full_name ?? 'Участник'}
                            </span>
                          )}
                          {m.body && (
                            <MessageBody
                              parts={bodyPartsByMessage.get(m.id) ?? []}
                              titles={entityTitles}
                              isLoading={titlesLoading}
                              className="text-text-main"
                            />
                          )}
                          <MessageAttachments attachments={attachments} />
                          {timeEl}
                        </div>
                      )}
                      {controls}
                    </div>
                  )}
                  {reactionChips}
                </div>
              );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

        {/* Кнопка «вниз» с числом пропущенного. Живёт на обёртке (не в скроллере) —
            иначе уплывала бы вместе с лентой. */}
        {showFab && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label={
              missedCount > 0 ? `Вниз, новых сообщений: ${missedCount}` : 'Прокрутить вниз'
            }
            className="absolute bottom-3 right-3 z-[3] flex h-9 w-9 items-center justify-center
                       rounded-full border border-border bg-surface text-text-dim shadow-[var(--shadow-md)]
                       transition-colors hover:text-text-main"
          >
            <ChevronDown size={16} aria-hidden="true" />
            {missedCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-accent px-1
                           text-center text-meta font-semibold leading-[1.15rem] tabular-nums text-white"
              >
                {missedCount > 99 ? '99+' : missedCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Пикер реакций — один на ленту, привязан к нажатой кнопке (reactionAnchorRef) */}
      {reactionPickerFor && (
        <ChatEmojiPicker
          anchorRef={reactionAnchorRef}
          onPick={(e) => {
            toggleReaction(reactionPickerFor, e);
            setReactionPickerFor(null);
          }}
          onClose={() => setReactionPickerFor(null)}
        />
      )}

      {/*
        S-CHAT-TASK-1: карточка подтверждения. Живёт между лентой и композером, а не
        модалкой поверх: сообщение-источник обязано остаться на экране, человек сверяет
        разобранное с написанным. Одно место на оба входа — у слэш-команды сообщения в
        ленте ещё нет, якорить не к чему.

        `key` пересобирает карточку при смене источника: внутри она держит собственный
        стейт полей, и без ключа переход с одного сообщения на другое оставил бы правки
        от предыдущего.
      */}
      {taskDraft && (
        <TaskFromMessageCard
          key={taskDraft.sourceMessageId ?? 'composer'}
          body={taskDraft.body}
          sourceMessageId={taskDraft.sourceMessageId}
          entityRefs={taskDraftRefs}
          entityTitles={entityTitles}
          entityTitlesLoading={titlesLoading}
          // Канал как источник привязки по умолчанию (FIX S-CHAT-TASK-1-BIND, решение 1).
          // Берётся из УЖЕ загруженного списка каналов — того же, что кормит сайдбар и
          // разделитель непрочитанного; нового обращения к БД нет. Канал не приехал —
          // `general` и пустой проект: карточка просто не предзаполнит привязку.
          conversation={{
            kind: listEntry?.conversation.kind ?? 'general',
            projectId: listEntry?.conversation.project_id ?? null,
            title: listEntry?.title ?? '',
          }}
          defaultAssigneeId={taskDraft.assigneeId}
          onClose={() => setTaskDraft(null)}
        />
      )}

      {/* Выбранные файлы — чипами НАД полем ввода: они часть будущего сообщения, а не
          отдельная операция. Drag-and-drop в 1d сознательно не делаем. */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
          {pendingFiles.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex max-w-[14rem] items-center gap-1.5 rounded-full border border-border bg-surface2 py-0.5 pl-2 pr-1 text-meta"
            >
              <Paperclip size={11} className="shrink-0 text-text-mute" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-text-dim" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 tabular-nums text-text-mute">
                {formatAttachmentSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removePendingFile(i)}
                disabled={sendMessage.isPending}
                aria-label={`Убрать ${f.name}`}
                className="shrink-0 rounded-full p-0.5 text-text-mute transition-colors hover:text-text-main disabled:opacity-40"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <span className="text-meta tabular-nums text-text-mute">
            {formatAttachmentSize(pendingFiles.reduce((sum, f) => sum + f.size, 0))}
          </span>
        </div>
      )}

      {/*
        Композер-капсула (1f): одна поверхность --surface с рамкой и мягкой тенью,
        скрепка и эмодзи внутри неё. Раньше это были три отдельные коробки в ряд —
        поле выглядело продолжением ленты, а не местом, куда пишут.

        Капсула стоит ПОД лентой, а не поверх её нижней кромки (концепт допускал оба
        варианта). Наложение потребовало бы вычитать высоту растущей textarea из высоты
        скролл-области, а высота ленты в двух вариантах разная (flex-1 в хабе,
        h-[min(55vh,40rem)] на карточке) — цена «сообщения уезжают под капсулу» выше
        выигрыша.

        `focus-within:border-accent` на капсуле, а не на textarea: рамка теперь одна на
        всех, и фокус должен подсвечивать её, а не невидимую границу поля.
      */}
      <div
        className="flex shrink-0 items-end gap-1 rounded-[var(--radius-l)] border border-input bg-surface
                   px-1.5 py-1.5 shadow-[var(--shadow-sm)] transition-colors focus-within:border-accent"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesPicked(e.target.files);
            // Сброс значения: без него повторный выбор ТОГО ЖЕ файла не даёт change.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sendMessage.isPending || pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE}
          aria-label="Прикрепить файл"
          title={
            pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE
              ? `Не больше ${MAX_ATTACHMENTS_PER_MESSAGE} файлов в сообщении`
              : 'Прикрепить файл'
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-mute
                     transition-colors hover:bg-surface2 hover:text-text-main
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={pendingFiles.length > 0 ? 'Подпись (необязательно)…' : 'Сообщение команде…'}
          title="Enter — отправить, Shift+Enter — перенос"
          aria-label="Сообщение команде. Enter — отправить, Shift+Enter — перенос"
          rows={1}
          maxLength={4000}
          // Пока файлы летят — composer заблокирован: вторая отправка поверх первой
          // забрала бы у неё черновик и файлы.
          disabled={sendMessage.isPending}
          // Высота — из эффекта автороста (до COMPOSER_MAX_PX, дальше свой скролл);
          // resize-none, чтобы ручка ресайза не спорила с ним.
          className="min-h-[2rem] flex-1 resize-none self-center border-0 bg-transparent px-1 py-1.5
                     text-sm leading-5 text-text-main placeholder:text-text-mute
                     focus:outline-none disabled:opacity-60"
        />
        <button
          ref={emojiBtnRef}
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label="Эмодзи"
          aria-expanded={emojiOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-mute
                     transition-colors hover:bg-surface2 hover:text-text-main
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Smile size={16} />
        </button>
        {emojiOpen && (
          <ChatEmojiPicker onPick={handleEmojiPick} onClose={closeEmojiPicker} anchorRef={emojiBtnRef} />
        )}
        <button
          onClick={handleSend}
          disabled={!canSend}
          // Пустой драфт — приглушённая кнопка, непустой — заливка --accent (в t-aura
          // .bg-accent сама уходит в тёмный --accent-text, белый текст ≥4.5:1).
          // `disabled` настоящий, а не серый на вид (грабля SDP).
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform
                      duration-[var(--duration-fast)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        canSend
                          ? 'bg-accent text-white hover:scale-105'
                          : 'bg-surface3 text-text-mute'
                      }`}
          aria-label="Отправить"
        >
          <SendHorizontal size={15} />
        </button>
      </div>

      {/*
        Подсказка команд. Команда одна, поэтому автокомплита с фильтрацией нет — есть
        строка «что вообще можно набрать», появляющаяся на вводе `/`. Без неё команда
        остаётся секретом: узнать про неё будет неоткуда.
      */}
      {draft.startsWith('/') && !taskDraft && (
        <p className="mt-1 shrink-0 px-2 text-meta text-text-mute">
          <span className="font-medium text-text-dim">/задача</span> — превратить строку в
          задачу: «/задача звонок 3 августа в 15:00»
        </p>
      )}
    </div>
  );
}
