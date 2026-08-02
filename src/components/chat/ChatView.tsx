'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import {
  useConversations,
  GENERAL_CHANNEL_TITLE,
} from '@/lib/hooks/use-conversations';
import { ChannelList } from '@/components/chat/ChannelList';
import { MessageThread } from '@/components/chat/MessageThread';
import { cn } from '@/lib/utils/cn';

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
