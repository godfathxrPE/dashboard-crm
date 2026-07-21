'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, MessageSquare, Pencil, Trash2, SendHorizontal, Smile, SmilePlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useProjectMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  isTempMessage,
} from '@/lib/hooks/use-project-messages';
import { useMessageReactions, useToggleReaction } from '@/lib/hooks/use-message-reactions';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { mskDateKey } from '@/lib/utils/date-helpers';
import { ChatEmojiPicker } from '@/components/projects/ChatEmojiPicker';
import type { ProjectMessageWithAuthor } from '@/types/entities';

interface ProjectChatProps {
  projectId: string;
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

function Avatar({ author }: { author: ProjectMessageWithAuthor['author'] }) {
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
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-l text-xs font-semibold text-accent">
      {author ? initials(author.full_name) || '?' : '?'}
    </div>
  );
}

/**
 * S-CHAT-1: чат проекта — отдельный модуль (НЕ «Активность»/EntityTimeline).
 * body рендерится как текст (React экранирует — XSS-контур), whitespace-pre-wrap.
 * Composer виден всем, кто открыл проект (SELECT прошёл = участник по зеркалу RLS);
 * INSERT-политика — бэкап, ошибка уйдёт в toast.
 *
 * S-CHAT-1.1: telegram-lite — лента на --bg (инверсия глубины), группировка ≤5 мин,
 * день-чипы по mskDateKey.
 * Пузыри: chat-own (--chat-own-bg + рамка --chat-own-border, акцентное разделение
 * свой↔чужой/фон, подтянуто аудитом S-CHAT-1.2) / chat-other (--surface + border + shadow).
 * Цвета ТЕКСТА в пузырях зафиксированы аудитом читаемости (10:1+) — не менять.
 */
export function ProjectChat({ projectId }: ProjectChatProps) {
  const { messages, isLoading } = useProjectMessages(projectId);
  const { user } = useAuth();
  const { data: orgRole } = useOrgRole();
  const { data: teamMembers = [] } = useTeamMembers();
  const sendMessage = useSendMessage(projectId);
  const editMessage = useEditMessage(projectId);
  const deleteMessage = useDeleteMessage(projectId);

  const [draft, setDraft] = useState('');
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
  const { byMessage: reactionsByMessage } = useMessageReactions(projectId, messageIds);
  const toggleReactionMut = useToggleReaction(projectId);
  // Отдельный state пикера реакций — НЕ шарим composer'ный emojiOpen/emojiBtnRef.
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const reactionAnchorRef = useRef<HTMLButtonElement | null>(null);

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

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    if (!added) return;
    const last = messages[messages.length - 1];
    const lastIsMine = last && (last.author_id === myId || isTempMessage(last));
    if (atBottomRef.current || lastIsMine) {
      // Smooth — только на новое сообщение после первой отрисовки и без reduced-motion.
      const smooth =
        readyRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      else el.scrollTop = el.scrollHeight;
    }
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

  function handleSend() {
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    setDraft('');
    sendMessage.mutate(
      { body, me },
      { onError: () => toast.error('Не удалось отправить сообщение') },
    );
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

  function startEdit(m: ProjectMessageWithAuthor) {
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

  function handleDelete(m: ProjectMessageWithAuthor) {
    if (window.confirm('Удалить сообщение?')) {
      deleteMessage.mutate(m.id, {
        onError: () => toast.error('Не удалось удалить сообщение'),
      });
    }
  }

  const todayKey = mskDateKey(new Date());

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">Чат проекта</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">
          {messages.length}
        </span>
      </div>

      {/* Лента: инверсия глубины — полотно на --bg, пузыри поверх */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Чат проекта"
        className="mb-3 h-[min(55vh,40rem)] overflow-y-auto rounded-[var(--radius-m)] border border-border/50 bg-bg px-3 py-2"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-text-mute">Загрузка...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <MessageSquare size={20} className="text-text-mute" aria-hidden="true" />
            <p className="text-xs text-text-mute">Пока тихо. Напиши первое сообщение команде</p>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end">
            {messages.map((m, i) => {
              const mine = m.author_id === myId;
              const temp = isTempMessage(m);
              const canEdit = mine && !temp;
              const canDelete = (mine || isModerator) && !temp;

              const prev = messages[i - 1];
              const next = messages[i + 1];
              const dayKey = mskDateKey(m.created_at);
              const newDay = !prev || mskDateKey(prev.created_at) !== dayKey;
              const groupStart =
                newDay ||
                prev.author_id !== m.author_id ||
                Date.parse(m.created_at) - Date.parse(prev.created_at) > GROUP_GAP_MS;
              const groupEnd =
                !next ||
                mskDateKey(next.created_at) !== dayKey ||
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
                      className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-meta leading-none tabular-nums transition-colors ${
                        r.mine
                          ? 'border-[color:var(--chat-own-border)] bg-[var(--chat-own-bg)] text-[color:var(--chat-own-fg,var(--text))]'
                          : 'border-border bg-surface2 text-text-dim hover:text-text-main'
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
                  {newDay && (
                    // День-чип — обычный текст в потоке (НЕ aria-hidden), aria-live озвучит
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full border border-border/60 bg-surface px-2.5 py-0.5 text-meta text-text-mute">
                        {dayChipLabel(dayKey, todayKey)}
                      </span>
                    </div>
                  )}
                  {mine ? (
                    <div
                      className={`group flex justify-end gap-1.5 ${groupStart && !newDay ? 'mt-3' : 'mt-0.5'}`}
                    >
                      {controls}
                      {editBlock || (
                        <div
                          className={`chat-own flex max-w-[72%] flex-col rounded-[var(--radius-m)] bg-[var(--chat-own-bg)] border border-[color:var(--chat-own-border)] px-3 py-1.5 ${
                            groupEnd ? 'rounded-br-[4px]' : ''
                          } ${temp ? 'opacity-60' : ''} ${animate ? 'animate-appear' : ''}`}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {m.body}
                          </p>
                          {timeEl}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`group flex gap-1.5 ${groupStart && !newDay ? 'mt-3' : 'mt-0.5'}`}
                    >
                      {groupStart ? (
                        <Avatar author={m.author} />
                      ) : (
                        <div className="w-7 shrink-0" aria-hidden="true" />
                      )}
                      {editBlock || (
                        <div
                          className={`chat-other flex max-w-[72%] flex-col rounded-[var(--radius-m)] border border-border bg-surface px-3 py-1.5 shadow-[var(--shadow-xs)] ${
                            groupEnd ? 'rounded-bl-[4px]' : ''
                          } ${animate ? 'animate-appear' : ''}`}
                        >
                          {groupStart && (
                            <span className="text-xs font-medium text-text-main">
                              {m.author?.full_name ?? 'Участник'}
                            </span>
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm text-text-main">
                            {m.body}
                          </p>
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

      {/* Composer: вне скролла, на --surface */}
      <div className="flex items-end gap-2">
        <button
          ref={emojiBtnRef}
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label="Эмодзи"
          aria-expanded={emojiOpen}
          className="flex h-[42px] items-center rounded-lg border border-input bg-surface px-2.5
                     text-text-mute transition-colors hover:text-text-main focus:border-accent focus:outline-none"
        >
          <Smile size={16} />
        </button>
        {emojiOpen && (
          <ChatEmojiPicker onPick={handleEmojiPick} onClose={closeEmojiPicker} anchorRef={emojiBtnRef} />
        )}
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
          placeholder="Сообщение команде…"
          title="Enter — отправить, Shift+Enter — перенос"
          aria-label="Сообщение команде. Enter — отправить, Shift+Enter — перенос"
          rows={2}
          maxLength={4000}
          className="min-h-[42px] flex-1 resize-none rounded-lg border border-input bg-surface px-3 py-2
                     text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sendMessage.isPending}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white
                     transition-opacity hover:opacity-90 disabled:bg-surface3 disabled:text-text-mute"
          aria-label="Отправить"
        >
          <SendHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}
