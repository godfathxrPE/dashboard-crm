'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Pencil, Trash2, SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  useProjectMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  isTempMessage,
} from '@/lib/hooks/use-project-messages';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { relativeTime } from '@/lib/utils/activity-events';
import type { ProjectMessageWithAuthor } from '@/types/entities';

interface ProjectChatProps {
  projectId: string;
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
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-l text-[10px] font-semibold text-accent">
      {author ? initials(author.full_name) || '?' : '?'}
    </div>
  );
}

/**
 * S-CHAT-1: чат проекта — отдельный модуль (НЕ «Активность»/EntityTimeline).
 * body рендерится как текст (React экранирует — XSS-контур), whitespace-pre-wrap.
 * Composer виден всем, кто открыл проект (SELECT прошёл = участник по зеркалу RLS);
 * INSERT-политика — бэкап, ошибка уйдёт в toast.
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
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, myId]);

  // На маунте (и после первой загрузки) — сразу вниз, без анимации.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !isLoading) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  function handleSend() {
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    setDraft('');
    sendMessage.mutate(
      { body, me },
      { onError: () => toast.error('Не удалось отправить сообщение') },
    );
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

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">Чат проекта</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
          {messages.length}
        </span>
      </div>

      {/* Лента */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="mb-3 max-h-[420px] min-h-[120px] overflow-y-auto pr-1"
      >
        {isLoading ? (
          <p className="py-8 text-center text-xs text-text-mute">Загрузка...</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-xs text-text-mute">
            Сообщений пока нет — начните обсуждение
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.author_id === myId;
              const canEdit = mine && !isTempMessage(m);
              const canDelete = (mine || isModerator) && !isTempMessage(m);
              return (
                <div
                  key={m.id}
                  className={`group flex gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface2 ${
                    mine ? 'bg-accent-l/20' : ''
                  } ${isTempMessage(m) ? 'opacity-60' : ''}`}
                >
                  <Avatar author={m.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-text-main">
                        {m.author?.full_name ?? 'Участник'}
                      </span>
                      <span className="text-[10px] text-text-mute">
                        {relativeTime(m.created_at)}
                        {m.edited_at && <span className="ml-1 italic">· изм.</span>}
                      </span>
                    </div>
                    {editingId === m.id ? (
                      <div className="mt-1 flex flex-col gap-1">
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
                            className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-white hover:opacity-90"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded px-2 py-0.5 text-[10px] text-text-mute hover:text-text-main"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      // XSS: body — только текст, React экранирует; переносы — pre-wrap
                      <p className="whitespace-pre-wrap break-words text-sm text-text-dim">{m.body}</p>
                    )}
                  </div>
                  {(canEdit || canDelete) && editingId !== m.id && (
                    <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {canEdit && (
                        <button
                          onClick={() => startEdit(m)}
                          className="rounded p-0.5 text-text-mute hover:text-text-main transition-colors"
                          aria-label="Править сообщение"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(m)}
                          className="rounded p-0.5 text-text-mute hover:text-red transition-colors"
                          aria-label="Удалить сообщение"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer: Enter — отправить, Shift+Enter — перенос */}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Сообщение команде… (Enter — отправить, Shift+Enter — перенос)"
          rows={2}
          maxLength={4000}
          className="min-h-[42px] flex-1 resize-none rounded-lg border border-input bg-surface px-3 py-2
                     text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sendMessage.isPending}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white
                     transition-opacity hover:opacity-90 disabled:opacity-50"
          aria-label="Отправить"
        >
          <SendHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}
