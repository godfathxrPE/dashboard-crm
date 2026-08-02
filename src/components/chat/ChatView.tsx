'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, LogOut, MessagesSquare, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useConversations,
  GENERAL_CHANNEL_TITLE,
} from '@/lib/hooks/use-conversations';
import {
  useConversationMembers,
  useLeaveConversation,
} from '@/lib/hooks/use-conversation-members';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { ChannelAvatar } from '@/components/chat/ChannelAvatar';
import { ChannelList } from '@/components/chat/ChannelList';
import { GroupModal } from '@/components/chat/GroupModal';
import { MessageThread } from '@/components/chat/MessageThread';
import { cn } from '@/lib/utils/cn';
import type { Conversation } from '@/types/entities';

/**
 * Высота рабочей области хаба. Готового паттерна полноэкранной страницы в проекте нет
 * (100vh встречается только в drawer/orbs), а flex от контейнера здесь не работает:
 * у `main` из layout высота не ограничена, и лента без фиксированной высоты просто
 * растягивает страницу вместо собственного скролла.
 *
 * 7rem = шапка ContentHeader с её `mb-6` + паддинги `main` (1.5rem × 2 на md), это
 * 106px замерянных на живой странице, плюс 6px запаса на округление. Проверено
 * визуально: страница не даёт вертикального скролла, лента скроллится сама.
 * dvh, а не vh — на мобильных адресная строка съедает vh.
 */
const CHAT_HEIGHT = 'h-[calc(100dvh-7rem)]';

/**
 * S-CHAT-HUB-1b: двухпанельный хаб /chat.
 *
 * Активный канал — в URL (`?c=<id>`): ссылка на канал становится отправляемой, а
 * состояние переживает перезагрузку. Автовыбора первого канала нет намеренно — список
 * пересортировывается на каждое новое сообщение, и автовыбор перекидывал бы
 * пользователя между каналами прямо во время чтения.
 */
export function ChatView() {
  const searchParams = useSearchParams();
  const activeId = searchParams.get('c');
  const { conversations, isLoading } = useConversations();
  // Параметр снимается сразу, а сообщение должно остаться на экране — иначе «Канал
  // недоступен» мигнёт на кадр и сменится на «Выберите канал».
  const [unavailable, setUnavailable] = useState(false);

  // Единственный механизм записи параметра на файл (в LeadsView их два — это записано
  // в долг, не повторяем). `window.history.replaceState` вместо `router.replace`:
  // /chat — динамическая страница, router.replace ходил бы за RSC-payload на каждый
  // клик по каналу; useSearchParams на replaceState реагирует (S-R2-FIX-1).
  const writeParam = useCallback((id: string | null) => {
    window.history.replaceState(null, '', id ? `/chat?c=${id}` : '/chat');
  }, []);

  const clearActive = useCallback(() => {
    setUnavailable(false);
    writeParam(null);
  }, [writeParam]);

  const handleSelect = useCallback(
    (id: string) => {
      setUnavailable(false);
      writeParam(id);
    },
    [writeParam],
  );

  const activeItem = activeId
    ? conversations.find((c) => c.conversation.id === activeId) ?? null
    : null;
  // «Нет в списке» ищем по списку каналов, а не по пустой ленте: пустой общий канал —
  // валидное состояние, а вот чужой/несуществующий id в списке не появится (его режет
  // RLS через is_conversation_member).
  const unknownChannel = !!activeId && !isLoading && !activeItem;

  useEffect(() => {
    if (!unknownChannel) return;
    setUnavailable(true);
    writeParam(null);
  }, [unknownChannel, writeParam]);

  return (
    <div className={cn('flex gap-4', CHAT_HEIGHT)}>
      {/* Узкий экран: видно что-то одно — список (без ?c) или тред (с ?c) */}
      <aside
        className={cn(
          'min-h-0 w-full shrink-0 rounded-xl border border-border bg-surface md:w-[18rem]',
          activeId ? 'hidden md:block' : 'block',
        )}
      >
        <ChannelList activeId={activeId} onSelect={handleSelect} />
      </aside>

      <div className={cn('min-w-0 flex-1 flex-col', activeId ? 'flex' : 'hidden md:flex')}>
        {activeItem ? (
          <>
            <button
              type="button"
              onClick={clearActive}
              className="mb-2 flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-xs
                         text-text-dim transition-colors hover:text-text-main md:hidden"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Назад
            </button>
            <MessageThread
              key={activeItem.conversation.id}
              conversationId={activeItem.conversation.id}
              title={activeItem.title}
              emptyText={
                activeItem.conversation.kind === 'general'
                  ? `${GENERAL_CHANNEL_TITLE} пуст. Напиши первое сообщение команде`
                  : 'Пока тихо. Напиши первое сообщение команде'
              }
              className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4"
              listClassName="min-h-0 flex-1"
              // 1f: обои — только здесь. Вкладка «Чат» на карточке остаётся карточкой
              // среди карточек (вариант по умолчанию — 'card').
              variant="page"
              // 1e: тот же аватар, что в строке списка — переход из списка в тред не
              // должен выглядеть как переход в другой канал. Размер меньше: в шапке
              // он не опознавательный знак в столбце, а подпись к названию.
              leading={
                <ChannelAvatar
                  id={activeItem.conversation.id}
                  title={activeItem.title}
                  kind={activeItem.conversation.kind}
                  size={1.5}
                />
              }
              // Группа — управление составом; проектный канал — выход на карточку
              // проекта. Пересечься эти ветки не могут: у группы нет project_id, и
              // ветвление по kind честнее, чем два условных блока подряд.
              // У общего канала шапка по-прежнему пуста.
              headerExtra={
                activeItem.conversation.kind === 'group' ? (
                  <GroupHeaderActions
                    conversation={activeItem.conversation}
                    onGone={clearActive}
                  />
                ) : activeItem.projectHref ? (
                  <Link
                    href={activeItem.projectHref}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5
                               text-meta text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
                  >
                    <ExternalLink size={12} aria-hidden="true" />
                    Открыть проект
                  </Link>
                ) : undefined
              }
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4">
            <MessagesSquare size={20} className="text-text-mute" aria-hidden="true" />
            <p className="text-xs text-text-mute">
              {isLoading ? 'Загрузка...' : unavailable ? 'Канал недоступен' : 'Выберите канал слева'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Сколько живёт inline-подтверждение выхода, прежде чем откатиться в обычную кнопку. */
const CONFIRM_TTL_MS = 5000;

/**
 * S-CHAT-HUB-1c: правая часть шапки треда у ГРУППЫ — счётчик участников и управление.
 *
 * Кто что видит:
 *  • автор группы или org owner/admin — шестерёнка (GroupModal: название, состав,
 *    удаление);
 *  • все, кроме автора, — «Выйти». Автору выход не предлагается: `created_by` не
 *    меняется, и вышедший автор сохранил бы право управлять группой, которую перестал
 *    видеть. Ему остаётся удалить её или ничего (решение спринта, EDGE CASES).
 *  • админ, который не автор, видит обе кнопки — управление и выход независимы.
 *
 * Подтверждение выхода — inline на 5 секунд, не `window.confirm` (тот блокирует
 * браузерные смоки — грабля GanttTimeline).
 */
function GroupHeaderActions({
  conversation,
  onGone,
}: {
  conversation: Conversation;
  /** Канал перестал быть доступен (вышел / удалил) — увести с него. */
  onGone: () => void;
}) {
  const { user } = useAuth();
  const { data: orgRole } = useOrgRole();
  const { members } = useConversationMembers(conversation.id, true);
  const leave = useLeaveConversation(conversation.id);

  const [editing, setEditing] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!confirmingLeave) return;
    confirmTimer.current = setTimeout(() => setConfirmingLeave(false), CONFIRM_TTL_MS);
    return () => clearTimeout(confirmTimer.current);
  }, [confirmingLeave]);

  const myId = user?.id ?? null;
  const isAuthor = !!myId && conversation.created_by === myId;
  const canManage = isAuthor || orgRole === 'owner' || orgRole === 'admin';

  const onLeave = () => {
    leave.mutate(undefined, {
      onSuccess: () => {
        toast.success('Вы вышли из группы');
        onGone();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось выйти'),
    });
  };

  return (
    <>
      {/* Счётчик молчит, пока состав не приехал: «0 участников» на живой группе врёт. */}
      {members.length > 0 && (
        <span className="text-meta text-text-mute">{members.length} уч.</span>
      )}

      {confirmingLeave ? (
        <>
          <button
            type="button"
            onClick={onLeave}
            disabled={leave.isPending}
            className="rounded border border-border px-2 py-0.5 text-meta text-red transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Точно выйти?
          </button>
          <button
            type="button"
            onClick={() => setConfirmingLeave(false)}
            className="rounded border border-border px-2 py-0.5 text-meta text-text-dim transition-colors hover:bg-surface-hover"
          >
            Отмена
          </button>
        </>
      ) : (
        !isAuthor && (
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            aria-label="Выйти из группы"
            title="Выйти из группы"
            className="rounded p-1 text-text-mute transition-colors hover:bg-surface2 hover:text-text-main"
          >
            <LogOut size={13} aria-hidden="true" />
          </button>
        )
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Настройки группы"
          title="Настройки группы"
          className="rounded p-1 text-text-mute transition-colors hover:bg-surface2 hover:text-text-main"
        >
          <Settings2 size={13} aria-hidden="true" />
        </button>
      )}

      {editing && (
        <GroupModal
          conversation={conversation}
          onClose={() => setEditing(false)}
          onDeleted={onGone}
        />
      )}
    </>
  );
}
